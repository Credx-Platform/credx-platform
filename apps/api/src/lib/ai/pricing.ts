/**
 * Rough $ / 1M-token pricing for cost estimation only. Not billing-grade.
 * Override any entry with AI_PRICE_<KEY>_IN / _OUT (USD per 1M tokens).
 */

interface Rate { in: number; out: number }

const TABLE: Array<{ match: RegExp; rate: Rate }> = [
  { match: /haiku/i, rate: { in: 1.0, out: 5.0 } },
  { match: /sonnet/i, rate: { in: 3.0, out: 15.0 } },
  { match: /opus/i, rate: { in: 15.0, out: 75.0 } },
  { match: /gpt-4o-mini|gpt-4\.1-mini|mini/i, rate: { in: 0.15, out: 0.6 } },
  { match: /gpt-4o|gpt-4\.1|gpt-5/i, rate: { in: 2.5, out: 10.0 } },
  { match: /gemini.*flash/i, rate: { in: 0.1, out: 0.4 } },
  { match: /gemini/i, rate: { in: 1.25, out: 5.0 } }
];

const FALLBACK: Rate = { in: 2.0, out: 8.0 };

function rateFor(model: string): Rate {
  const key = model.replace(/[^a-z0-9]+/gi, '_').toUpperCase();
  const envIn = Number(process.env[`AI_PRICE_${key}_IN`]);
  const envOut = Number(process.env[`AI_PRICE_${key}_OUT`]);
  const base = TABLE.find((t) => t.match.test(model))?.rate ?? FALLBACK;
  return {
    in: Number.isFinite(envIn) && envIn >= 0 ? envIn : base.in,
    out: Number.isFinite(envOut) && envOut >= 0 ? envOut : base.out
  };
}

export function estimateCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const r = rateFor(model);
  const cost = (promptTokens / 1_000_000) * r.in + (completionTokens / 1_000_000) * r.out;
  return Number(cost.toFixed(6));
}

/** Cheap heuristic when the provider does not return a usage object. ~4 chars/token. */
export function approxTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / 4);
}
