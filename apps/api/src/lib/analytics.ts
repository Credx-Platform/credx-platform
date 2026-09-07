import { config } from '../config.js';

/**
 * Product analytics — env-gated, non-fatal.
 *
 * When no analytics provider is configured (no POSTHOG_API_KEY / ANALYTICS_ENABLED)
 * every call is a cheap no-op. A provider outage or a bad payload must never
 * affect a user request, so all delivery is fire-and-forget and swallowed.
 *
 * PII rule (master spec §22): SSNs, passwords, tokens, full account numbers and
 * raw documents must never reach analytics. `sanitizeProps` strips them.
 */

export type AnalyticsEvent =
  | 'account_created'
  | 'onboarding_started'
  | 'onboarding_completed'
  | 'profile_completed'
  | 'readiness_score_created'
  | 'action_completed'
  | 'lesson_started'
  | 'lesson_completed'
  | 'cesar_used'
  | 'tool_used'
  | 'subscription_started'
  | 'subscription_upgraded'
  | 'subscription_cancelled'
  | 'funding_readiness_completed'
  | 'business_profile_completed'
  | 'weekly_checkin_completed'
  | 'organization_created'
  | 'client_invited';

const BLOCKED_KEY = /(ssn|social|password|passwd|secret|token|authorization|api[_-]?key|card|cvv|routing|account[_-]?number|acct[_-]?no|dob|birth|document|rawpayload)/i;

export function sanitizeProps(props: Record<string, unknown> = {}): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (BLOCKED_KEY.test(key)) continue;
    if (typeof value === 'string' && value.length > 500) {
      clean[key] = `${value.slice(0, 500)}…`;
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      clean[key] = sanitizeProps(value as Record<string, unknown>);
      continue;
    }
    clean[key] = value;
  }
  return clean;
}

export function isAnalyticsEnabled(): boolean {
  return config.analyticsEnabled === true;
}

export interface TrackOptions {
  distinctId?: string; // stable user/client id
  props?: Record<string, unknown>;
}

export async function trackEvent(event: AnalyticsEvent, options: TrackOptions = {}): Promise<void> {
  if (!isAnalyticsEnabled()) return;

  const distinctId = options.distinctId || 'anonymous';
  const properties = sanitizeProps(options.props);

  try {
    if (config.posthogApiKey) {
      await fetch(`${config.posthogHost.replace(/\/$/, '')}/capture/`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          api_key: config.posthogApiKey,
          event,
          distinct_id: distinctId,
          properties: { ...properties, $lib: 'credx-api', environment: config.nodeEnv },
          timestamp: new Date().toISOString()
        })
      });
    }
  } catch {
    // analytics is best-effort; never surface to the caller
  }
}

/** Fire-and-forget wrapper for use inside request handlers. */
export function track(event: AnalyticsEvent, options: TrackOptions = {}): void {
  void trackEvent(event, options).catch(() => {});
}
