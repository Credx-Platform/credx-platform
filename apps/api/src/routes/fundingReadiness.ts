import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { assessFundingReadiness } from '../lib/fundingReadiness.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { track } from '../lib/analytics.js';

export const fundingReadinessRouter = Router();
fundingReadinessRouter.use(requireAuth, requireEntitlement('can_use_funding_readiness'));

async function loadClient(userId: string) {
  return prisma.client.findUnique({
    where: { userId },
    include: {
      progress: true,
      creditReports: { include: { tradelines: true } },
      fundingReadiness: true
    }
  });
}

function serialize(profile: any) {
  if (!profile) return null;
  return {
    objective: profile.objective ?? null,
    targetAmount: profile.targetAmount != null ? Number(profile.targetAmount) : null,
    targetTimeframe: profile.targetTimeframe ?? null,
    monthlyIncome: profile.monthlyIncome != null ? Number(profile.monthlyIncome) : null,
    incomeType: profile.incomeType ?? null,
    notes: profile.notes ?? null,
    lastAssessedAt: profile.lastAssessedAt ?? null
  };
}

async function assessAndPersist(clientId: string, client: any) {
  const profile = client.fundingReadiness ?? null;
  const assessment = assessFundingReadiness(client, profile);
  await prisma.fundingReadinessProfile.upsert({
    where: { clientId },
    create: {
      clientId,
      checklist: assessment.checklist as unknown as Prisma.InputJsonValue,
      documentChecklist: assessment.documentChecklist as unknown as Prisma.InputJsonValue,
      lastAssessment: assessment as unknown as Prisma.InputJsonValue,
      lastAssessedAt: new Date()
    },
    update: {
      lastAssessment: assessment as unknown as Prisma.InputJsonValue,
      lastAssessedAt: new Date()
    }
  });
  return assessment;
}

fundingReadinessRouter.get('/', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const client = await loadClient(req.auth!.sub);
    if (!client) return res.status(404).json({ error: 'Client profile not found' });
    const assessment = await assessAndPersist(client.id, client);
    res.json({ profile: serialize(client.fundingReadiness), assessment });
  } catch (err) {
    next(err);
  }
});

const updateSchema = z.object({
  objective: z.enum(['personal_loan', 'auto', 'mortgage_prep', 'business_loc', 'debt_consolidation', 'other']).nullable().optional(),
  targetAmount: z.number().nonnegative().max(100_000_000).nullable().optional(),
  targetTimeframe: z.enum(['3_months', '6_months', '12_months', 'exploring']).nullable().optional(),
  monthlyIncome: z.number().nonnegative().max(100_000_000).nullable().optional(),
  incomeType: z.enum(['w2', 'self_employed', 'mixed', 'other']).nullable().optional(),
  notes: z.string().max(2000).nullable().optional()
});

fundingReadinessRouter.put('/', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const client = await prisma.client.findUnique({ where: { userId: req.auth!.sub }, select: { id: true } });
    if (!client) return res.status(404).json({ error: 'Client profile not found' });
    const data = updateSchema.parse(req.body);

    await prisma.fundingReadinessProfile.upsert({
      where: { clientId: client.id },
      create: {
        clientId: client.id,
        objective: data.objective ?? null,
        targetAmount: data.targetAmount ?? null,
        targetTimeframe: data.targetTimeframe ?? null,
        monthlyIncome: data.monthlyIncome ?? null,
        incomeType: data.incomeType ?? null,
        notes: data.notes ?? null
      },
      update: {
        ...(data.objective !== undefined ? { objective: data.objective } : {}),
        ...(data.targetAmount !== undefined ? { targetAmount: data.targetAmount } : {}),
        ...(data.targetTimeframe !== undefined ? { targetTimeframe: data.targetTimeframe } : {}),
        ...(data.monthlyIncome !== undefined ? { monthlyIncome: data.monthlyIncome } : {}),
        ...(data.incomeType !== undefined ? { incomeType: data.incomeType } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {})
      }
    });

    const fresh = await loadClient(req.auth!.sub);
    const assessment = await assessAndPersist(client.id, fresh);

    track('funding_readiness_completed', {
      distinctId: client.id,
      props: { objective: data.objective ?? null, band: (assessment as { band?: string } | null)?.band ?? null }
    });

    res.json({ profile: serialize(fresh!.fundingReadiness), assessment });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input', details: err.issues });
    next(err);
  }
});

function mergeChecklistState(current: unknown, key: string, patch: { done?: boolean; note?: string; provided?: boolean }) {
  const list = Array.isArray(current) ? [...current] : [];
  const idx = list.findIndex((c) => c && typeof c === 'object' && (c as any).key === key);
  const base = idx >= 0 ? { ...(list[idx] as object) } : { key };
  const next = { ...base, ...patch };
  if (idx >= 0) list[idx] = next; else list.push(next);
  return list;
}

const checklistSchema = z.object({ key: z.string().min(1).max(60), done: z.boolean(), note: z.string().max(500).optional() });

fundingReadinessRouter.patch('/checklist', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const client = await prisma.client.findUnique({
      where: { userId: req.auth!.sub },
      select: { id: true, fundingReadiness: true }
    });
    if (!client) return res.status(404).json({ error: 'Client profile not found' });
    const { key, done, note } = checklistSchema.parse(req.body);

    const merged = mergeChecklistState(client.fundingReadiness?.checklist, key, { done, ...(note !== undefined ? { note } : {}) });
    await prisma.fundingReadinessProfile.upsert({
      where: { clientId: client.id },
      create: { clientId: client.id, checklist: merged as unknown as Prisma.InputJsonValue },
      update: { checklist: merged as unknown as Prisma.InputJsonValue }
    });

    const fresh = await loadClient(req.auth!.sub);
    const assessment = await assessAndPersist(client.id, fresh);
    res.json({ assessment });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input' });
    next(err);
  }
});

const docSchema = z.object({ key: z.string().min(1).max(60), provided: z.boolean() });

fundingReadinessRouter.patch('/documents', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const client = await prisma.client.findUnique({
      where: { userId: req.auth!.sub },
      select: { id: true, fundingReadiness: true }
    });
    if (!client) return res.status(404).json({ error: 'Client profile not found' });
    const { key, provided } = docSchema.parse(req.body);

    const merged = mergeChecklistState(client.fundingReadiness?.documentChecklist, key, { provided });
    await prisma.fundingReadinessProfile.upsert({
      where: { clientId: client.id },
      create: { clientId: client.id, documentChecklist: merged as unknown as Prisma.InputJsonValue },
      update: { documentChecklist: merged as unknown as Prisma.InputJsonValue }
    });

    const fresh = await loadClient(req.auth!.sub);
    const assessment = await assessAndPersist(client.id, fresh);
    res.json({ assessment });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input' });
    next(err);
  }
});
