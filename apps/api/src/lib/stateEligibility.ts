/**
 * State eligibility gate for the done-for-you dispute service, per counsel
 * guidance (2026-07-07): three buckets — approved / review_required / blocked.
 * Many states require CSO registration and surety bonds; do not silently
 * accept all 50 states.
 *
 * Config (comma-separated two-letter codes, case-insensitive):
 *   STATE_GATE_APPROVED — states counsel has confirmed we can operate in
 *   STATE_GATE_BLOCKED  — states we must not serve
 * Everything else (including an unknown/missing state) is review_required:
 * activation needs an explicit, logged admin override.
 */

export type StateBucket = 'approved' | 'review_required' | 'blocked';

function parseStateList(raw?: string): Set<string> {
  return new Set(
    (raw || '')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^[A-Z]{2}$/.test(s))
  );
}

export function normalizeStateCode(state?: string | null): string | null {
  const trimmed = (state || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(trimmed) ? trimmed : null;
}

export function stateBucket(state?: string | null): StateBucket {
  const code = normalizeStateCode(state);
  if (!code) return 'review_required';
  if (parseStateList(process.env.STATE_GATE_BLOCKED).has(code)) return 'blocked';
  if (parseStateList(process.env.STATE_GATE_APPROVED).has(code)) return 'approved';
  return 'review_required';
}
