import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { CHECKIN_QUESTIONS, isoWeekKey, summarizeChanges, type CheckInAnswers } from '../lib/checkin.js';
import { enqueueJob } from '../lib/jobs.js';
import { notifyMilestone } from '../lib/notifications.js';

export const checkinRouter = Router();

async function clientIdFor(userId: string): Promise<string | null> {
  const c = await prisma.client.findUnique({ where: { userId }, select: { id: true } });
  return c?.id ?? null;
}

function serialize(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    weekKey: row.weekKey,
    answers: {
      balancesChanged: row.balancesChanged, balancesNote: row.balancesNote,
      creditLimitChanged: row.creditLimitChanged, creditLimitNote: row.creditLimitNote,
      newAccountOpened: row.newAccountOpened, newAccountNote: row.newAccountNote,
      accountClosed: row.accountClosed, accountClosedNote: row.accountClosedNote,
      incomeChanged: row.incomeChanged, incomeNote: row.incomeNote,
      hardInquiry: row.hardInquiry, freeText: row.freeText
    },
    changeSummary: row.changeSummary,
    submittedAt: row.submittedAt
  };
}

/** GET /api/checkin — current week status + questions + last submission. */
checkinRouter.get('/', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const clientId = await clientIdFor(req.auth!.sub);
    if (!clientId) return res.status(404).json({ error: 'Client profile not found' });
    const weekKey = isoWeekKey();

    const [current, previous] = await Promise.all([
      prisma.weeklyCheckIn.findUnique({ where: { clientId_weekKey: { clientId, weekKey } } }),
      prisma.weeklyCheckIn.findFirst({ where: { clientId, weekKey: { not: weekKey } }, orderBy: { submittedAt: 'desc' } })
    ]);

    res.json({
      weekKey,
      due: !current,
      questions: CHECKIN_QUESTIONS,
      current: serialize(current),
      previous: serialize(previous)
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/checkin/history?limit=8 */
checkinRouter.get('/history', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const clientId = await clientIdFor(req.auth!.sub);
    if (!clientId) return res.json({ checkIns: [] });
    const limit = Math.min(52, Math.max(1, Number(req.query.limit) || 8));
    const rows = await prisma.weeklyCheckIn.findMany({ where: { clientId }, orderBy: { submittedAt: 'desc' }, take: limit });
    res.json({ checkIns: rows.map(serialize) });
  } catch (err) {
    next(err);
  }
});

const submitSchema = z.object({
  balancesChanged: z.boolean().nullable().optional(),
  balancesNote: z.string().max(500).nullable().optional(),
  creditLimitChanged: z.boolean().nullable().optional(),
  creditLimitNote: z.string().max(500).nullable().optional(),
  newAccountOpened: z.boolean().nullable().optional(),
  newAccountNote: z.string().max(500).nullable().optional(),
  accountClosed: z.boolean().nullable().optional(),
  accountClosedNote: z.string().max(500).nullable().optional(),
  incomeChanged: z.boolean().nullable().optional(),
  incomeNote: z.string().max(500).nullable().optional(),
  hardInquiry: z.boolean().nullable().optional(),
  freeText: z.string().max(2000).nullable().optional()
});

/**
 * POST /api/checkin — submit / update the current week's check-in.
 * Recomputes readiness via the job queue and drops a milestone notification.
 */
checkinRouter.post('/', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const clientId = await clientIdFor(req.auth!.sub);
    if (!clientId) return res.status(404).json({ error: 'Client profile not found' });
    const answers = submitSchema.parse(req.body) as CheckInAnswers;
    const weekKey = isoWeekKey();
    const changeSummary = summarizeChanges(answers);

    const data = {
      ...answers,
      changeSummary: changeSummary as unknown as Prisma.InputJsonValue,
      submittedAt: new Date()
    };

    const row = await prisma.weeklyCheckIn.upsert({
      where: { clientId_weekKey: { clientId, weekKey } },
      create: { clientId, weekKey, ...data },
      update: data
    });

    // Feed the readiness recompute through the queue (inline fallback if no runner).
    const queued = await enqueueJob('analysis', 'readiness-snapshot', { clientId, source: 'weekly-checkin' });

    notifyMilestone(clientId, {
      key: `checkin-${weekKey}`,
      title: 'Weekly check-in recorded',
      body: changeSummary[0],
      href: '/portal'
    });

    res.status(201).json({ checkIn: serialize(row), changeSummary, readinessRecompute: queued.status });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input', details: err.issues });
    next(err);
  }
});
