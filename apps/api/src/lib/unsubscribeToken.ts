import { createHmac, timingSafeEqual } from 'node:crypto';

/* Unsubscribe links are handed to mail clients, forwarded, and archived, so the
   token has to prove "the sender minted this for this address" without a
   session and without being guessable from the address alone. HMAC over the
   lowercased address does that in one self-contained string: no DB lookup, no
   expiry to babysit (an opt-out link should still work a year later). */

function secret(): string {
  const value = process.env.UNSUBSCRIBE_TOKEN_SECRET || process.env.JWT_SECRET || '';
  if (!value) throw new Error('UNSUBSCRIBE_TOKEN_SECRET or JWT_SECRET must be set to issue unsubscribe links');
  return value;
}

export function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

function sign(normalized: string): string {
  return createHmac('sha256', secret()).update(`unsubscribe:${normalized}`).digest('base64url');
}

/** Opaque token binding an unsubscribe link to one address. */
export function createUnsubscribeToken(email: string): string {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error('email is required');
  return `${Buffer.from(normalized, 'utf8').toString('base64url')}.${sign(normalized)}`;
}

/** Returns the address the token was minted for, or null if it fails to verify. */
export function verifyUnsubscribeToken(token: string): string | null {
  const raw = String(token || '');
  const separator = raw.lastIndexOf('.');
  if (separator <= 0) return null;

  const encoded = raw.slice(0, separator);
  const provided = raw.slice(separator + 1);

  let normalized: string;
  try {
    normalized = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (!normalized || normalizeEmail(normalized) !== normalized) return null;

  let expected: string;
  try {
    expected = sign(normalized);
  } catch {
    return null;
  }

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  return normalized;
}
