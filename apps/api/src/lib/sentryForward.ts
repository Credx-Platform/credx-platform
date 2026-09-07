/**
 * Optional Sentry forwarding for the error ledger.
 *
 * When `SENTRY_DSN` is unset every export here is a no-op — the DB-backed
 * `ErrorEvent` ledger in `lib/sentry.ts` keeps working on its own. When a DSN is
 * present, captured exceptions/messages are also POSTed to Sentry's store
 * endpoint directly (no SDK dependency), fire-and-forget, with PII scrubbed.
 */

const DSN = (process.env.SENTRY_DSN || '').trim();

export function sentryForwardingEnabled(): boolean {
  return DSN.length > 0 && parseDsn() !== null;
}

type ParsedDsn = { endpoint: string; publicKey: string };
let cachedDsn: ParsedDsn | null | undefined;

function parseDsn(): ParsedDsn | null {
  if (cachedDsn !== undefined) return cachedDsn;
  try {
    // https://<publicKey>@<host>/<path...>/<projectId>
    const u = new URL(DSN);
    const projectId = u.pathname.replace(/^\/+/, '');
    if (!u.username || !projectId) {
      cachedDsn = null;
      return null;
    }
    cachedDsn = {
      publicKey: u.username,
      endpoint: `${u.protocol}//${u.host}/api/${projectId}/store/`
    };
    return cachedDsn;
  } catch {
    cachedDsn = null;
    return null;
  }
}

// ---- PII scrubbing -----------------------------------------------------------

const BLOCKED_KEY = /(ssn|social|password|passwd|secret|token|authorization|auth|cookie|api[_-]?key|card|cvv|routing|account[_-]?number|acct[_-]?no|dob|birth|document|rawpayload|einlast4|ein)/i;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;
const SSN_RE = /\b\d{3}-?\d{2}-?\d{4}\b/g;
const CARD_RE = /\b(?:\d[ -]?){13,19}\b/g;
const JWT_RE = /\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g;
const BEARER_RE = /Bearer\s+[\w.\-]+/gi;

export function scrubText(input: string): string {
  return input
    .replace(BEARER_RE, 'Bearer [redacted]')
    .replace(JWT_RE, '[redacted-jwt]')
    .replace(EMAIL_RE, '[redacted-email]')
    .replace(SSN_RE, '[redacted-ssn]')
    .replace(CARD_RE, (m) => (m.replace(/\D/g, '').length >= 13 ? '[redacted-card]' : m));
}

export function scrubDeep(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[max-depth]';
  if (typeof value === 'string') return scrubText(value.length > 2000 ? `${value.slice(0, 2000)}…` : value);
  if (Array.isArray(value)) return value.slice(0, 100).map((v) => scrubDeep(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = BLOCKED_KEY.test(k) ? '[redacted]' : scrubDeep(v, depth + 1);
    }
    return out;
  }
  return value;
}

// ---- forwarding -------------------------------------------------------------

export interface ForwardInput {
  eventId: string;
  level: string;
  environment: string;
  release?: string | null;
  message?: string | null;
  error?: Error | null;
  userId?: string | null;
  url?: string | null;
  method?: string | null;
  tags?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}

export async function forwardToSentry(input: ForwardInput): Promise<void> {
  const dsn = parseDsn();
  if (!dsn) return;

  const payload: Record<string, unknown> = {
    event_id: input.eventId,
    timestamp: new Date().toISOString(),
    platform: 'node',
    level: input.level,
    environment: input.environment,
    ...(input.release ? { release: input.release } : {}),
    logger: 'credx-api',
    server_name: undefined,
    tags: scrubDeep(input.tags ?? {}),
    extra: scrubDeep(input.extra ?? {}),
    ...(input.userId ? { user: { id: input.userId } } : {}),
    request: input.url ? { url: scrubText(input.url), method: input.method ?? undefined } : undefined
  };

  if (input.error) {
    payload.exception = {
      values: [
        {
          type: input.error.name,
          value: scrubText(input.error.message || ''),
          stacktrace: input.error.stack ? { frames: [{ filename: 'scrubbed', context_line: scrubText(input.error.stack).slice(0, 4000) }] } : undefined
        }
      ]
    };
  } else if (input.message) {
    payload.message = scrubText(input.message);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    await fetch(dsn.endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-sentry-auth': `Sentry sentry_version=7, sentry_client=credx-api/1.0, sentry_key=${dsn.publicKey}`
      },
      body: JSON.stringify(payload)
    });
  } catch {
    // best-effort; the DB ledger is the source of truth
  } finally {
    clearTimeout(timer);
  }
}
