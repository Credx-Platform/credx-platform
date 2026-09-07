import { prisma } from '../prisma.js';

/**
 * Per-plan AI token budgets (rolling 30-day window). Cost protection, not
 * billing. When a client is over budget, AI features degrade to their
 * deterministic path — the dashboard and every non-AI feature keep working.
 *
 * Override any budget with AI_BUDGET_<PLAN> (tokens / 30 days).
 * Set AI_QUOTA_ENABLED=0 to disable enforcement entirely.
 */

const DEFAULT_BUDGET: Record<string, number> = {
  FREE: 60_000,
  MASTERCLASS: 120_000,
  ESSENTIAL: 600_000,
  PREMIUM: 2_000_000,
  FAMILY: 2_500_000
};

const WINDOW_DAYS = 30;

export function quotaEnforced(): boolean {
  return !/^(0|false|no|off)$/i.test(String(process.env.AI_QUOTA_ENABLED ?? '1'));
}

export function planTokenBudget(plan: string | null | undefined): number {
  const key = String(plan || 'FREE').toUpperCase();
  const env = Number(process.env[`AI_BUDGET_${key}`]);
  if (Number.isFinite(env) && env >= 0) return env;
  return DEFAULT_BUDGET[key] ?? DEFAULT_BUDGET.FREE;
}

export interface AiQuota {
  allowed: boolean;
  enforced: boolean;
  plan: string;
  budgetTokens: number;
  usedTokens: number;
  remainingTokens: number;
  windowDays: number;
  resetAt: string;
}

/**
 * Check whether `clientId` may make another AI call under `plan`'s budget.
 * Fails open (allowed) on any lookup error — cost protection must never be the
 * reason a user request 500s.
 */
export async function checkAiQuota(clientId: string | null | undefined, plan: string | null | undefined): Promise<AiQuota> {
  const planKey = String(plan || 'FREE').toUpperCase();
  const budgetTokens = planTokenBudget(planKey);
  const enforced = quotaEnforced();
  const base: AiQuota = {
    allowed: true, enforced, plan: planKey, budgetTokens,
    usedTokens: 0, remainingTokens: budgetTokens, windowDays: WINDOW_DAYS,
    resetAt: new Date(Date.now() + WINDOW_DAYS * 86400_000).toISOString()
  };
  if (!clientId || !enforced) return base;

  try {
    const since = new Date(Date.now() - WINDOW_DAYS * 86400_000);
    const agg = await prisma.aiUsageEvent.aggregate({
      where: { clientId, createdAt: { gte: since } },
      _sum: { totalTokens: true }
    });
    const usedTokens = agg._sum.totalTokens ?? 0;
    const remainingTokens = Math.max(0, budgetTokens - usedTokens);
    return { ...base, usedTokens, remainingTokens, allowed: usedTokens < budgetTokens };
  } catch (err) {
    console.error('[ai] checkAiQuota failed (failing open)', (err as Error)?.message);
    return base;
  }
}
