import { aiConfigured, apiKey, gatewayUrl, taskConfig, type AiTask } from './config.js';
import { approxTokens, estimateCostUsd } from './pricing.js';
import { recordAiUsageAsync } from './costLog.js';

/**
 * The single AI entrypoint for CredX. Wraps the Vercel AI Gateway
 * (OpenAI-compatible) with: per-task model/token/timeout defaults, input-size
 * clamping, bounded retry with backoff, token accounting, cost estimation, and
 * a usage-ledger write. Never throws — callers get a discriminated result and
 * decide how to degrade.
 */

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface RunChatInput {
  task: AiTask;
  messages: AiMessage[];
  model?: string;
  maxOutputTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  maxAttempts?: number;
  // Attribution for the usage ledger.
  clientId?: string | null;
  userId?: string | null;
  plan?: string | null;
  promptVersion?: string;
}

export type RunChatResult =
  | {
      ok: true;
      text: string;
      model: string;
      usage: { promptTokens: number; completionTokens: number; totalTokens: number };
      costUsd: number;
      attempts: number;
    }
  | { ok: false; reason: 'not_configured' | 'timeout' | 'provider_error' | 'empty' | 'exception'; attempts: number; status?: number; error?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function clampMessages(messages: AiMessage[], maxChars: number): AiMessage[] {
  let budget = maxChars;
  // Keep system + most recent messages; truncate oldest non-system content first.
  const out: AiMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.content.length <= budget || m.role === 'system') {
      out.unshift({ ...m, content: m.role === 'system' ? m.content : m.content.slice(0, Math.max(0, budget)) });
      budget -= Math.min(m.content.length, budget);
    } else {
      out.unshift({ ...m, content: `${m.content.slice(0, Math.max(0, budget))}\n…[truncated]` });
      budget = 0;
    }
  }
  return out;
}

export async function runChat(input: RunChatInput): Promise<RunChatResult> {
  if (!aiConfigured()) return { ok: false, reason: 'not_configured', attempts: 0 };

  const cfg = taskConfig(input.task);
  const model = input.model?.trim() || cfg.model;
  const maxTokens = input.maxOutputTokens ?? cfg.maxOutputTokens;
  const temperature = input.temperature ?? cfg.temperature;
  const timeoutMs = input.timeoutMs ?? cfg.timeoutMs;
  const maxAttempts = Math.max(1, input.maxAttempts ?? cfg.maxAttempts);
  const messages = clampMessages(input.messages, cfg.maxInputChars);
  const key = apiKey()!;
  const startedAt = Date.now();

  let attempt = 0;
  let lastStatus: number | undefined;
  let lastError: string | undefined;

  while (attempt < maxAttempts) {
    attempt += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(gatewayUrl(), {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
        signal: controller.signal
      });

      if (!res.ok) {
        lastStatus = res.status;
        lastError = (await res.text().catch(() => '')).slice(0, 300);
        // Retry transient failures only.
        if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts) {
          await sleep(250 * 2 ** (attempt - 1) + Math.random() * 100);
          continue;
        }
        recordAiUsageAsync({
          task: input.task, model, promptVersion: input.promptVersion, clientId: input.clientId, userId: input.userId,
          plan: input.plan, promptTokens: 0, completionTokens: 0, costUsd: 0,
          latencyMs: Date.now() - startedAt, attempts: attempt, ok: false, error: `HTTP ${res.status}: ${lastError}`
        });
        return { ok: false, reason: 'provider_error', attempts: attempt, status: res.status, error: lastError };
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = data.choices?.[0]?.message?.content?.trim() ?? '';
      if (!text) {
        recordAiUsageAsync({
          task: input.task, model, promptVersion: input.promptVersion, clientId: input.clientId, userId: input.userId,
          plan: input.plan, promptTokens: 0, completionTokens: 0, costUsd: 0,
          latencyMs: Date.now() - startedAt, attempts: attempt, ok: false, error: 'empty response'
        });
        return { ok: false, reason: 'empty', attempts: attempt };
      }

      const promptTokens = data.usage?.prompt_tokens ?? messages.reduce((s, m) => s + approxTokens(m.content), 0);
      const completionTokens = data.usage?.completion_tokens ?? approxTokens(text);
      const costUsd = estimateCostUsd(model, promptTokens, completionTokens);

      recordAiUsageAsync({
        task: input.task, model, promptVersion: input.promptVersion, clientId: input.clientId, userId: input.userId,
        plan: input.plan, promptTokens, completionTokens, costUsd,
        latencyMs: Date.now() - startedAt, attempts: attempt, ok: true
      });

      return {
        ok: true,
        text,
        model,
        usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
        costUsd,
        attempts: attempt
      };
    } catch (err) {
      const aborted = (err as Error)?.name === 'AbortError';
      lastError = (err as Error)?.message;
      if (attempt < maxAttempts) {
        await sleep(250 * 2 ** (attempt - 1) + Math.random() * 100);
        continue;
      }
      recordAiUsageAsync({
        task: input.task, model, promptVersion: input.promptVersion, clientId: input.clientId, userId: input.userId,
        plan: input.plan, promptTokens: 0, completionTokens: 0, costUsd: 0,
        latencyMs: Date.now() - startedAt, attempts: attempt, ok: false, error: lastError ?? 'exception'
      });
      return { ok: false, reason: aborted ? 'timeout' : 'exception', attempts: attempt, error: lastError };
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, reason: 'provider_error', attempts: attempt, status: lastStatus, error: lastError };
}

/** Extract the first balanced { ... } object from a model reply. */
export function extractJsonObject(raw: string): unknown | null {
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** runChat + JSON parse. Returns { ok:false, reason:'parse' } when the reply is not JSON. */
export async function runJson<T = unknown>(input: RunChatInput): Promise<
  | { ok: true; data: T; model: string; costUsd: number; attempts: number }
  | { ok: false; reason: string; attempts: number }
> {
  const r = await runChat(input);
  if (!r.ok) return { ok: false, reason: r.reason, attempts: r.attempts };
  const parsed = extractJsonObject(r.text);
  if (parsed == null) return { ok: false, reason: 'parse', attempts: r.attempts };
  return { ok: true, data: parsed as T, model: r.model, costUsd: r.costUsd, attempts: r.attempts };
}
