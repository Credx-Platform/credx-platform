import { prisma } from './prisma.js';

/**
 * Lightweight Sentry-compatible error tracking.
 * Stores errors in PostgreSQL for CredX SaaS monitoring.
 */

export interface ErrorContext {
  userId?: string;
  clientId?: string;
  url?: string;
  method?: string;
  tags?: Record<string, string | number | boolean>;
  extra?: Record<string, unknown>;
  breadcrumbs?: Array<{
    type: string;
    message: string;
    timestamp?: string;
    data?: Record<string, unknown>;
  }>;
}

export interface CaptureOptions {
  level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
  environment?: string;
  release?: string;
}

/**
 * Capture an exception into the error event log.
 */
export async function captureException(
  err: Error | unknown,
  context: ErrorContext = {},
  options: CaptureOptions = {}
): Promise<string | null> {
  try {
    const error = err instanceof Error ? err : new Error(String(err));
    const eventId = generateEventId();

    await prisma.errorEvent.create({
      data: {
        eventId,
        level: options.level ?? 'error',
        environment: options.environment ?? (process.env.NODE_ENV ?? 'development'),
        release: options.release ?? (process.env.npm_package_version ?? null),
        platform: 'node',
        exceptionType: error.name,
        exceptionValue: error.message,
        exceptionStack: error.stack ?? null,
        userId: context.userId ?? null,
        clientId: context.clientId ?? null,
        url: context.url ?? null,
        method: context.method ?? null,
        tags: (context.tags ?? {}) as any,
        extra: (context.extra ?? {}) as any,
        breadcrumbs: (context.breadcrumbs ?? []) as any
      }
    });

    return eventId;
  } catch (loggingErr) {
    // Last resort: console log so we don't lose the original error
    console.error('Failed to capture exception:', loggingErr);
    console.error('Original error:', err);
    return null;
  }
}

/**
 * Capture a message (non-exception event).
 */
export async function captureMessage(
  message: string,
  context: ErrorContext = {},
  options: CaptureOptions = {}
): Promise<string | null> {
  try {
    const eventId = generateEventId();

    await prisma.errorEvent.create({
      data: {
        eventId,
        level: options.level ?? 'info',
        environment: options.environment ?? (process.env.NODE_ENV ?? 'development'),
        release: options.release ?? (process.env.npm_package_version ?? null),
        platform: 'node',
        exceptionType: null,
        exceptionValue: message,
        exceptionStack: null,
        userId: context.userId ?? null,
        clientId: context.clientId ?? null,
        url: context.url ?? null,
        method: context.method ?? null,
        tags: (context.tags ?? {}) as any,
        extra: (context.extra ?? {}) as any,
        breadcrumbs: (context.breadcrumbs ?? []) as any
      }
    });

    return eventId;
  } catch (loggingErr) {
    console.error('Failed to capture message:', loggingErr);
    return null;
  }
}

/**
 * Mark an error event as resolved.
 */
export async function resolveErrorEvent(eventId: string, resolvedBy: string) {
  return prisma.errorEvent.update({
    where: { eventId },
    data: {
      resolved: true,
      resolvedAt: new Date(),
      resolvedBy
    }
  });
}

/**
 * Get unresolved error events, newest first.
 */
export async function getUnresolvedErrors(limit = 50, offset = 0) {
  return prisma.errorEvent.findMany({
    where: { resolved: false },
    orderBy: { occurredAt: 'desc' },
    take: limit,
    skip: offset
  });
}

/**
 * Get error summary stats for dashboard.
 */
export async function getErrorStats(hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const [total, byLevel, resolved] = await Promise.all([
    prisma.errorEvent.count({ where: { occurredAt: { gte: since } } }),
    prisma.errorEvent.groupBy({
      by: ['level'],
      where: { occurredAt: { gte: since } },
      _count: { level: true }
    }),
    prisma.errorEvent.count({ where: { resolved: true, resolvedAt: { gte: since } } })
  ]);

  return {
    periodHours: hours,
    total,
    resolved,
    byLevel: Object.fromEntries(byLevel.map(r => [r.level, r._count.level]))
  };
}

function generateEventId(): string {
  // Sentry-style 32-char hex event ID
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}
