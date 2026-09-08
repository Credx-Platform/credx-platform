import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import type { AiTask } from './config.js';

export interface AiUsageRecord {
  task: AiTask;
  model: string;
  promptVersion?: string;
  clientId?: string | null;
  userId?: string | null;
  plan?: string | null;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  latencyMs: number;
  attempts: number;
  ok: boolean;
  error?: string | null;
}

/** Fire-and-forget usage/cost ledger write. Never throws into a request path. */
export async function recordAiUsage(rec: AiUsageRecord): Promise<void> {
  try {
    await prisma.aiUsageEvent.create({
      data: {
        task: rec.task,
        model: rec.model,
        promptVersion: rec.promptVersion ?? null,
        clientId: rec.clientId ?? null,
        userId: rec.userId ?? null,
        plan: rec.plan ?? null,
        promptTokens: Math.max(0, Math.round(rec.promptTokens)),
        completionTokens: Math.max(0, Math.round(rec.completionTokens)),
        totalTokens: Math.max(0, Math.round(rec.promptTokens + rec.completionTokens)),
        costUsd: new Prisma.Decimal(rec.costUsd || 0),
        latencyMs: Math.max(0, Math.round(rec.latencyMs)),
        attempts: Math.max(1, Math.round(rec.attempts)),
        ok: rec.ok,
        error: rec.error ? String(rec.error).slice(0, 500) : null
      }
    });
  } catch (err) {
    console.error('[ai] recordAiUsage failed', (err as Error)?.message);
  }
}

export function recordAiUsageAsync(rec: AiUsageRecord): void {
  void recordAiUsage(rec);
}

/** Sum tokens + cost for a client over a rolling window (days). */
export async function usageForClient(clientId: string, windowDays = 30) {
  const since = new Date(Date.now() - windowDays * 86400_000);
  const agg = await prisma.aiUsageEvent.aggregate({
    where: { clientId, createdAt: { gte: since }, ok: true },
    _sum: { totalTokens: true, costUsd: true },
    _count: { _all: true }
  });
  return {
    windowDays,
    since,
    totalTokens: agg._sum.totalTokens ?? 0,
    costUsd: Number(agg._sum.costUsd ?? 0),
    calls: agg._count._all
  };
}
