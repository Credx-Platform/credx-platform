import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

/**
 * In-app notification producers.
 *
 * `notify()` is idempotent when a `dedupeKey` is supplied — a unique
 * (clientId, dedupeKey) constraint means a repeated producer call is a silent
 * no-op rather than a duplicate bell entry. All helpers are fire-and-forget
 * safe: they never throw into a request path.
 */

export type NotificationType =
  | 'MILESTONE_REACHED'
  | 'READINESS_SCORE_CHANGED'
  | 'NEW_RECOMMENDED_ACTION'
  | 'WEEKLY_CHECKIN_READY'
  | 'REPORT_READY'
  | 'SYSTEM';

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body?: string;
  href?: string;
  metadata?: Record<string, unknown>;
  dedupeKey?: string;
}

export async function notify(clientId: string, input: NotifyInput): Promise<{ created: boolean; id?: string }> {
  try {
    const row = await prisma.notification.create({
      data: {
        clientId,
        type: input.type,
        title: input.title.slice(0, 200),
        body: input.body ? input.body.slice(0, 2000) : null,
        href: input.href ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        dedupeKey: input.dedupeKey ?? null
      }
    });
    return { created: true, id: row.id };
  } catch (err) {
    // P2002 = unique violation on (clientId, dedupeKey) — already notified.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { created: false };
    }
    console.error('NOTIFY_FAILED', { clientId, type: input.type, err: (err as Error)?.message });
    return { created: false };
  }
}

/** Fire-and-forget wrapper for request handlers / job handlers. */
export function notifyAsync(clientId: string, input: NotifyInput): void {
  void notify(clientId, input).catch(() => {});
}

// ---- higher-level producers -------------------------------------------------

export function notifyMilestone(clientId: string, milestone: { key: string; title: string; body?: string; href?: string }): void {
  notifyAsync(clientId, {
    type: 'MILESTONE_REACHED',
    title: milestone.title,
    body: milestone.body,
    href: milestone.href ?? '/portal',
    metadata: { milestone: milestone.key },
    dedupeKey: `milestone:${milestone.key}`
  });
}

/** Only fires when the score moved by at least `threshold` points. */
export function notifyReadinessChanged(clientId: string, previous: number | null, current: number, threshold = 3): void {
  if (previous == null) return;
  const delta = current - previous;
  if (Math.abs(delta) < threshold) return;
  const up = delta > 0;
  const day = new Date().toISOString().slice(0, 10);
  notifyAsync(clientId, {
    type: 'READINESS_SCORE_CHANGED',
    title: up ? `Your CredX Readiness Score went up ${delta} points` : `Your CredX Readiness Score changed by ${delta} points`,
    body: `It's now ${current}/100 (was ${previous}). Open your dashboard to see what moved.`,
    href: '/portal',
    metadata: { previous, current, delta },
    dedupeKey: `readiness:${day}:${previous}->${current}`
  });
}

export function notifyNewRecommendedAction(clientId: string, action: { id: string; title: string; href?: string }): void {
  notifyAsync(clientId, {
    type: 'NEW_RECOMMENDED_ACTION',
    title: 'New recommended next step',
    body: action.title,
    href: action.href ?? '/portal',
    metadata: { actionId: action.id },
    dedupeKey: `action:${action.id}`
  });
}

export function notifyWeeklyCheckinReady(clientId: string, weekKey: string): void {
  notifyAsync(clientId, {
    type: 'WEEKLY_CHECKIN_READY',
    title: 'Your weekly check-in is ready',
    body: 'Tell CredX what changed this week so your readiness stays accurate.',
    href: '/portal',
    metadata: { week: weekKey },
    dedupeKey: `checkin:${weekKey}`
  });
}

export function notifyReportReady(clientId: string, report: { id: string; kind: string; title: string }): void {
  notifyAsync(clientId, {
    type: 'REPORT_READY',
    title: `${report.title} is ready`,
    body: 'Open it from your dashboard.',
    href: `/portal?report=${report.id}`,
    metadata: { reportId: report.id, kind: report.kind },
    dedupeKey: `report:${report.id}`
  });
}
