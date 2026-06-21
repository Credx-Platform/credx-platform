/* ============================================================
   Cloudflare Turnstile verification.

   Rollout-safe by design:
   - If TURNSTILE_SECRET_KEY is unset, verification is SKIPPED (returns ok)
     so existing flows and local dev keep working while you provision keys.
   - Once the secret is set, a missing or invalid token is REJECTED.

   The public site key lives in the frontend HTML (safe to commit). Only the
   secret key belongs here, read from env.
   ============================================================ */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileResult {
  ok: boolean;
  /** true when no secret is configured and verification was skipped */
  skipped?: boolean;
  reason?: string;
}

export function isTurnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY?.trim());
}

/**
 * Verify a Turnstile token against Cloudflare's siteverify endpoint.
 * @param token the `cf-turnstile-response` value sent by the widget
 * @param remoteIp optional client IP for additional validation
 */
export async function verifyTurnstile(token: unknown, remoteIp?: string): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    return { ok: true, skipped: true, reason: 'TURNSTILE_SECRET_KEY not set; verification skipped' };
  }
  if (typeof token !== 'string' || token.length === 0) {
    return { ok: false, reason: 'Missing CAPTCHA token' };
  }

  const body = new URLSearchParams();
  body.set('secret', secret);
  body.set('response', token);
  if (remoteIp) body.set('remoteip', remoteIp);

  try {
    const response = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const data = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      ['error-codes']?: string[];
    };
    if (data.success) return { ok: true };
    return { ok: false, reason: `CAPTCHA failed: ${(data['error-codes'] || []).join(',') || 'unknown'}` };
  } catch (error) {
    // Network/Cloudflare outage: fail closed so the protection can't be bypassed
    // by knocking out the verifier, but log loudly for ops.
    const reason = error instanceof Error ? error.message : String(error);
    console.warn('TURNSTILE_VERIFY_EXCEPTION', reason);
    return { ok: false, reason: `CAPTCHA verification unavailable: ${reason}` };
  }
}

/**
 * Express helper: pull the token from a parsed request body (under either
 * `turnstileToken` or the raw `cf-turnstile-response` field) and verify it.
 * Returns ok:true (skipped) when Turnstile is not configured.
 */
export async function verifyTurnstileFromBody(
  body: Record<string, unknown> | undefined,
  remoteIp?: string
): Promise<TurnstileResult> {
  const token =
    (body?.turnstileToken as string | undefined) ??
    (body?.['cf-turnstile-response'] as string | undefined);
  return verifyTurnstile(token, remoteIp);
}
