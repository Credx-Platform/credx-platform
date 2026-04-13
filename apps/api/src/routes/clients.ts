import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';

export const clientsRouter = Router();

clientsRouter.get('/', requireAuth, requireRole(['STAFF', 'ADMIN']), async (_req, res, next) => {
  try {
    const clients = await prisma.client.findMany({
      include: {
        user: true,
        payments: true,
        disputes: true,
        documents: true,
        activities: true
      },
      orderBy: { createdAt: 'desc' }
    });
    return res.json({ clients });
  } catch (error) {
    next(error);
  }
});

clientsRouter.get('/me', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const client = await prisma.client.findUnique({
      where: { userId: req.auth!.sub },
      include: { payments: true, disputes: true, tasks: true, documents: true, activities: true }
    });
    return res.json({ client });
  } catch (error) {
    next(error);
  }
});

const onboardingSchema = z.object({
  ssnLast4: z.string().length(4).optional(),
  dobEncrypted: z.string().optional(),
  ssnEncrypted: z.string().optional(),
  currentAddressLine1: z.string().optional(),
  currentAddressLine2: z.string().optional(),
  currentCity: z.string().optional(),
  currentState: z.string().optional(),
  currentPostalCode: z.string().optional(),
  serviceTier: z.enum(['ESSENTIAL', 'AGGRESSIVE', 'FAMILY']).optional()
});

const analysisSchema = z.object({
  analysisSummary: z.string().min(1),
  disputePlanSummary: z.string().min(1),
  estimatedTimelineMonths: z.number().int().min(1).max(36),
  serviceTier: z.enum(['ESSENTIAL', 'AGGRESSIVE', 'FAMILY']).optional()
});

const statusUpdateSchema = z.object({
  status: z.enum(['LEAD', 'CONTRACT_SENT', 'INTAKE_RECEIVED', 'ANALYSIS_READY', 'UPGRADE_OFFERED', 'ACTIVE', 'PAST_DUE', 'RESTRICTED', 'CANCELLED'])
});

clientsRouter.post('/onboarding', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const data = onboardingSchema.parse(req.body);
    const client = await prisma.client.upsert({
      where: { userId: req.auth!.sub },
      update: { ...data, status: 'INTAKE_RECEIVED' },
      create: { userId: req.auth!.sub, status: 'INTAKE_RECEIVED', ...data }
    });
    return res.status(201).json({ client });
  } catch (error) {
    next(error);
  }
});

clientsRouter.post('/:id/analysis', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const data = analysisSchema.parse(req.body);
    const client = await prisma.client.update({
      where: { id },
      data: {
        analysisSummary: data.analysisSummary,
        disputePlanSummary: data.disputePlanSummary,
        estimatedTimelineMonths: data.estimatedTimelineMonths,
        serviceTier: data.serviceTier,
        status: 'UPGRADE_OFFERED',
        upgradeOfferedAt: new Date(),
        portalRestricted: false
      },
      include: { user: true, payments: true, disputes: true, documents: true, activities: true }
    });
    return res.status(201).json({ client });
  } catch (error) {
    next(error);
  }
});

clientsRouter.patch('/:id/status', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const { status } = statusUpdateSchema.parse(req.body);
    const restricted = status === 'PAST_DUE' || status === 'RESTRICTED';
    const active = status === 'ACTIVE';
    const client = await prisma.client.update({
      where: { id },
      data: {
        status,
        portalRestricted: restricted,
        flaggedAt: restricted ? new Date() : null,
        activatedAt: active ? new Date() : undefined
      },
      include: { user: true, payments: true, disputes: true, documents: true, activities: true }
    });
    return res.json({ client });
  } catch (error) {
    next(error);
  }
});
