const AI_GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1/chat/completions';

export interface AiCallOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AiCallResult {
  text: string;
  model: string;
}

export function isAiGatewayConfigured(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY?.trim());
}

export async function callAiGateway(options: AiCallOptions): Promise<AiCallResult | null> {
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.AI_GATEWAY_MODEL?.trim() || 'anthropic/claude-haiku-4-5-20251001';

  const controller = new AbortController();
  const timeoutMs = Number(process.env.AI_GATEWAY_TIMEOUT_MS || 60_000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(AI_GATEWAY_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: options.systemPrompt },
          { role: 'user', content: options.userPrompt }
        ],
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.2
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error('[aiGateway] non-OK response', response.status, body.slice(0, 300));
      return null;
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return null;
    return { text, model };
  } catch (error) {
    console.error('[aiGateway] call failed:', (error as Error).message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function extractJsonObject(raw: string): unknown | null {
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  const slice = candidate.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch (err) {
    console.warn('[extractJsonObject] JSON.parse failed', {
      message: (err as Error).message,
      sliceLength: slice.length,
      sliceTail: slice.slice(-300)
    });
    return null;
  }
}
