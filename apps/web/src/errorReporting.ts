/**
 * Minimal browser error reporting.
 *
 * No-op unless VITE_SENTRY_DSN is set at build time. When it is, uncaught
 * errors and unhandled promise rejections are POSTed to Sentry's store endpoint
 * (no SDK), with obvious PII scrubbed and a small rate cap.
 */

const DSN = (import.meta.env.VITE_SENTRY_DSN ?? '').trim();
const ENVIRONMENT = (import.meta.env.MODE ?? 'production');

type Parsed = { endpoint: string; publicKey: string };

function parseDsn(): Parsed | null {
  try {
    const u = new URL(DSN);
    const projectId = u.pathname.replace(/^\/+/, '');
    if (!u.username || !projectId) return null;
    return { publicKey: u.username, endpoint: `${u.protocol}//${u.host}/api/${projectId}/store/` };
  } catch {
    return null;
  }
}

const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;
const SSN_RE = /\b\d{3}-?\d{2}-?\d{4}\b/g;
const JWT_RE = /\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g;
const CARD_RE = /\b(?:\d[ -]?){13,19}\b/g;

function scrub(input: string): string {
  return String(input || '')
    .replace(JWT_RE, '[redacted-jwt]')
    .replace(EMAIL_RE, '[redacted-email]')
    .replace(SSN_RE, '[redacted-ssn]')
    .replace(CARD_RE, (m) => (m.replace(/\D/g, '').length >= 13 ? '[redacted-card]' : m))
    .slice(0, 4000);
}

let sent = 0;
const MAX_EVENTS = 10;

function eventId(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

function report(kind: string, message: string, stack?: string) {
  const dsn = parseDsn();
  if (!dsn || sent >= MAX_EVENTS) return;
  sent += 1;

  const body = JSON.stringify({
    event_id: eventId(),
    timestamp: new Date().toISOString(),
    platform: 'javascript',
    level: 'error',
    environment: ENVIRONMENT,
    logger: 'credx-web',
    tags: { kind, page: location.pathname },
    exception: {
      values: [{ type: kind, value: scrub(message), stacktrace: stack ? { frames: [{ filename: 'scrubbed', context_line: scrub(stack) }] } : undefined }]
    }
  });

  try {
    fetch(dsn.endpoint, {
      method: 'POST',
      keepalive: true,
      headers: {
        'content-type': 'application/json',
        'x-sentry-auth': `Sentry sentry_version=7, sentry_client=credx-web/1.0, sentry_key=${dsn.publicKey}`
      },
      body
    }).catch(() => {});
  } catch {
    /* best-effort */
  }
}

let installed = false;

export function initErrorReporting(): void {
  if (installed || !parseDsn()) return;
  installed = true;

  window.addEventListener('error', (e) => {
    report('window.onerror', e.message || 'Unknown error', e.error?.stack);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason: any = e.reason;
    report('unhandledrejection', reason?.message || String(reason), reason?.stack);
  });
}
