import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { checkAiQuota } from '../lib/ai/quota.js';
import { usageForClient } from '../lib/ai/costLog.js';
import { resolveClientEntitlements } from '../lib/entitlements.js';

export const aiRouter = Router();

/**
 * GET /api/ai/usage — the caller's AI budget + rolling usage.
 * Lets the portal show a soft "AI assistance used this month" indicator without
 * exposing raw cost figures.
 */
aiRouter.get('/usage', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const client = await prisma.client.findUnique({
      where: { userId: req.auth!.sub },
      include: { progress: true }
    });
    if (!client) return res.json({ enforced: false, budgetTokens: 0, usedTokens: 0, remainingTokens: 0, allowed: true });

    const education = (client.progress?.education as Record<string, unknown> | undefined) ?? {};
    const plan = resolveClientEntitlements({
      status: client.status,
      serviceTier: client.serviceTier,
      masterclassAccess: education.masterclassAccess === true
    }).plan;

    const [quota, usage] = await Promise.all([
      checkAiQuota(client.id, plan),
      usageForClient(client.id, 30)
    ]);

    res.json({
      plan,
      enforced: quota.enforced,
      allowed: quota.allowed,
      budgetTokens: quota.budgetTokens,
      usedTokens: quota.usedTokens,
      remainingTokens: quota.remainingTokens,
      windowDays: quota.windowDays,
      resetAt: quota.resetAt,
      calls: usage.calls
    });
  } catch (err) {
    next(err);
  }
});
