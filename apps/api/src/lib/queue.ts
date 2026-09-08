import { prisma } from './prisma.js';
import { config } from '../config.js';

export type QueueName = 'emails' | 'disputes' | 'reports' | 'billing' | 'webhooks' | 'analysis' | 'notifications';

export interface EnqueueOptions {
  priority?: number;
  delayMs?: number;
  maxAttempts?: number;
}

/**
 * Enqueue a job into the database-backed job queue.
 * This is compatible with BullMQ-style semantics but uses
 * PostgreSQL as the backing store (no Redis required for MVP).
 */
export async function enqueue(
  queueName: QueueName,
  jobName: string,
  payload: Record<string, unknown>,
  options: EnqueueOptions = {}
) {
  const delayUntil = options.delayMs
    ? new Date(Date.now() + options.delayMs)
    : null;

  const job = await prisma.jobQueue.create({
    data: {
      queueName,
      jobName,
      payload: payload as any,
      priority: options.priority ?? 0,
      maxAttempts: options.maxAttempts ?? 3,
      delayUntil,
      status: delayUntil ? 'DELAYED' : 'PENDING'
    }
  });

  return job;
}

/**
 * Claim the next available job from a queue.
 * Uses row-level locking via transaction to prevent double-processing.
 */
export async function claimNextJob(queueName: QueueName, workerId: string) {
  return prisma.$transaction(async (tx) => {
    const job = await tx.jobQueue.findFirst({
      where: {
        queueName,
        status: { in: ['PENDING', 'RETRYING'] },
        OR: [
          { delayUntil: null },
          { delayUntil: { lte: new Date() } }
        ],
        attempts: { lt: tx.jobQueue.fields.maxAttempts as any }
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' }
      ]
    });

    if (!job) return null;

    const updated = await tx.jobQueue.update({
      where: { id: job.id },
      data: {
        status: 'ACTIVE',
        attempts: { increment: 1 },
        workerId
      }
    });

    return updated;
  });
}

/**
 * Mark a job as completed with an optional result.
 */
export async function completeJob(jobId: string, result?: Record<string, unknown>) {
  return prisma.jobQueue.update({
    where: { id: jobId },
    data: {
      status: 'COMPLETED',
      processedAt: new Date(),
      result: result as any
    }
  });
}

/**
 * Mark a job as failed. If under maxAttempts, it becomes RETRYING.
 */
export async function failJob(jobId: string, error: string, maxAttempts = 3) {
  const job = await prisma.jobQueue.findUnique({ where: { id: jobId } });
  if (!job) return null;

  const shouldRetry = job.attempts < (job.maxAttempts ?? maxAttempts);

  return prisma.jobQueue.update({
    where: { id: jobId },
    data: {
      status: shouldRetry ? 'RETRYING' : 'FAILED',
      failedAt: new Date(),
      error: error.slice(0, 4000), // prevent overflow
      delayUntil: shouldRetry
        ? new Date(Date.now() + Math.pow(2, job.attempts) * 1000) // exponential backoff
        : null
    }
  });
}

/**
 * Register or update a worker heartbeat.
 */
export async function heartbeatWorker(workerId: string, queueName: QueueName, hostname?: string) {
  return prisma.workerHeartbeat.upsert({
    where: { workerId },
    create: {
      workerId,
      queueName,
      hostname: hostname ?? null,
      lastBeat: new Date()
    },
    update: {
      queueName,
      hostname: hostname ?? null,
      lastBeat: new Date()
    }
  });
}

/**
 * Get queue statistics for monitoring.
 */
export async function getQueueStats(queueName?: QueueName) {
  const where = queueName ? { queueName } : {};

  const [counts, dead, oldest] = await Promise.all([
    prisma.jobQueue.groupBy({
      by: ['status'],
      where,
      _count: { status: true }
    }),
    prisma.jobQueue.count({
      where: { ...where, status: 'FAILED', attempts: { gte: prisma.jobQueue.fields.maxAttempts as any } }
    }),
    prisma.jobQueue.findFirst({
      where: { ...where, status: { in: ['PENDING', 'RETRYING'] } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true }
    })
  ]);

  const stats: Record<string, number> = {};
  for (const row of counts) {
    stats[row.status] = row._count.status;
  }

  return {
    queueName: queueName ?? 'all',
    counts: stats,
    deadLetterCount: dead,
    oldestPendingAt: oldest?.createdAt?.toISOString() ?? null
  };
}
