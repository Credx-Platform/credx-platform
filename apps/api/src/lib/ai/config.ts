/**
 * Central AI provider configuration.
 *
 * One place for the gateway endpoint, credentials, per-task model + token +
 * timeout + retry defaults. Everything is env-overridable; sane defaults ship so
 * the feature works out of the box and is a clean no-op when unconfigured.
 */

export type AiTask = 'cesar_chat' | 'report_extraction';

const GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1/chat/completions';

function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export interface TaskConfig {
  model: string;
  maxOutputTokens: number;
  maxInputChars: number;
  timeoutMs: number;
  maxAttempts: number;
  temperature: number;
}

const DEFAULT_MODEL = 'anthropic/claude-haiku-4-5-20251001';

export function aiConfigured(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY?.trim());
}

export function gatewayUrl(): string {
  return process.env.AI_GATEWAY_URL?.trim() || GATEWAY_URL;
}

export function apiKey(): string | null {
  return process.env.AI_GATEWAY_API_KEY?.trim() || null;
}

export function taskConfig(task: AiTask): TaskConfig {
  const globalModel = process.env.AI_GATEWAY_MODEL?.trim();
  if (task === 'report_extraction') {
    return {
      model: process.env.AI_EXTRACTION_MODEL?.trim() || globalModel || DEFAULT_MODEL,
      maxOutputTokens: envInt('AI_EXTRACTION_MAX_TOKENS', 32000),
      maxInputChars: envInt('AI_EXTRACTION_MAX_INPUT_CHARS', 120_000),
      timeoutMs: envInt('AI_EXTRACTION_TIMEOUT_MS', 60_000),
      maxAttempts: envInt('AI_EXTRACTION_MAX_ATTEMPTS', 2),
      temperature: 0.1
    };
  }
  // cesar_chat
  return {
    model: process.env.CESAR_LLM_MODEL?.trim() || globalModel || DEFAULT_MODEL,
    maxOutputTokens: envInt('CESAR_LLM_MAX_TOKENS', 400),
    maxInputChars: envInt('CESAR_LLM_MAX_INPUT_CHARS', 12_000),
    timeoutMs: envInt('CESAR_LLM_TIMEOUT_MS', 12_000),
    maxAttempts: envInt('CESAR_LLM_MAX_ATTEMPTS', 2),
    temperature: 0.6
  };
}
