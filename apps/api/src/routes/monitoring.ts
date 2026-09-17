import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { getQueueStats, claimNextJob, completeJob, failJob, heartbeatWorker } from '../lib/queue.js';
import { getUnresolvedErrors, getErrorStats, resolveErrorEvent } from '../lib/sentry.js';
import { cleanupExpiredIdempotencyKeys } from '../lib/webhookLedger.js';
import { maybeSendPortalReadyEmail } from '../lib/portalReady.js';
import { encryptPII } from '../lib/encryption.js';

export const monitoringRouter = Router();

// ============================================================
// Client credit-monitoring onboarding (portal wizard step 3)
// ============================================================

/**
 * Submit monitoring credentials. Monitoring is optional — clients can
 * skip this step (POST /api/monitoring/skip) or submit empty credentials.
 * Either way the portal-ready email goes out as long as contract + profile
 * are filled. Credentials, when supplied, are stored on the progress row
 * (password encrypted) so staff can run a pull on the client's behalf.
 */
monitoringRouter.post('/', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const provider = String(req.body?.provider || '').trim();
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '').trim();

    const client = await prisma.client.findUnique({
      where: { userId: req.auth!.sub },
      include: { progress: true }
    });
    if (!client || !client.progress) return res.status(404).json({ error: 'Client not found' });

    const monitoringId = randomUUID();
    const submittedAt = new Date().toISOString();
    const progress = client.progress as any;
    const hasCredentials = Boolean(provider && username && password);

    const updated = await prisma.clientProgress.update({
      where: { clientId: client.id },
      data: {
        onboarding: {
          ...(progress.onboarding || {}),
          status: 'completed',
          completedAt: submittedAt,
          monitoringSubmittedAt: submittedAt,
          monitoringProvider: provider || null,
          monitoringHasCredentials: hasCredentials,
          monitoringUsername: username || null,
          monitoringPasswordEncrypted: password ? encryptPII(password) : null
        },
        workflow: {
          ...(progress.workflow || {}),
          stage: 'portal_unlocked',
          updatedAt: submittedAt,
          next: ['upload_credit_report']
        }
      }
    });

    await prisma.client.update({
      where: { id: client.id },
      data: { portalRestricted: false }
    });

    const emailNotification = await maybeSendPortalReadyEmail(client.id);

    return res.json({
      success: true,
      monitoring_id: monitoringId,
      monitoring: {
        id: monitoringId,
        provider: provider || null,
        hasCredentials,
        status: hasCredentials ? 'submitted' : 'pending_credentials',
        submittedAt
      },
      progress: updated,
      emailNotification
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Explicit "skip monitoring for now" path. Marks the wizard step done and
 * fires the portal-ready email if contract + profile are complete. Clients
 * can fill in monitoring later from inside the portal.
 */
monitoringRouter.post('/skip', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const client = await prisma.client.findUnique({
      where: { userId: req.auth!.sub },
      include: { progress: true }
    });
    if (!client || !client.progress) return res.status(404).json({ error: 'Client not found' });

    const submittedAt = new Date().toISOString();
    const progress = client.progress as any;

    const updated = await prisma.clientProgress.update({
      where: { clientId: client.id },
      data: {
        onboarding: {
          ...(progress.onboarding || {}),
          status: 'completed',
          completedAt: submittedAt,
          monitoringSkippedAt: submittedAt,
          monitoringHasCredentials: false,
          monitoringUsername: null,
          monitoringPasswordEncrypted: null
        },
        workflow: {
          ...(progress.workflow || {}),
          stage: 'portal_unlocked',
          updatedAt: submittedAt,
          next: ['upload_credit_report']
        }
      }
    });

    await prisma.client.update({
      where: { id: client.id },
      data: { portalRestricted: false }
    });

    const emailNotification = await maybeSendPortalReadyEmail(client.id);

    return res.json({
      success: true,
      skipped: true,
      progress: updated,
      emailNotification
    });
  } catch (error) {
    next(error);
  }
});

monitoringRouter.post('/complete', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const client = await prisma.client.findUnique({
      where: { userId: req.auth!.sub },
      include: { progress: true }
    });
    if (!client || !client.progress) return res.status(404).json({ error: 'Client not found' });

    const progress = client.progress as any;
    return res.json({
      success: true,
      lead_id: client.id,
      status: 'onboarding_complete',
      completedAt: progress.onboarding?.completedAt ?? null
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// Queue Monitoring
// ============================================================

monitoringRouter.get('/queues', requireAuth, requireRole(['STAFF', 'ADMIN']), async (_req, res, next) => {
  try {
    const queues = ['emails', 'disputes', 'reports', 'billing', 'webhooks', 'analysis', 'notifications'] as const;
    const stats = await Promise.all(queues.map(q => getQueueStats(q)));
    res.json({ queues: stats });
  } catch (err) {
    next(err);
  }
});

monitoringRouter.get('/queues/:name', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const name = String(req.params.name);
    const stats = await getQueueStats(name as any);
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

monitoringRouter.post('/queues/:name/claim', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const workerId = String(req.body?.workerId ?? `worker-${Date.now()}`);
    const job = await claimNextJob(req.params.name as any, workerId);
    if (!job) return res.status(204).send();
    res.json(job);
  } catch (err) {
    next(err);
  }
});

monitoringRouter.post('/jobs/:id/complete', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const job = await completeJob(String(req.params.id), req.body?.result);
    res.json(job);
  } catch (err) {
    next(err);
  }
});

monitoringRouter.post('/jobs/:id/fail', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const job = await failJob(String(req.params.id), String(req.body?.error ?? 'Unknown error'));
    res.json(job);
  } catch (err) {
    next(err);
  }
});

monitoringRouter.post('/workers/heartbeat', async (req, res, next) => {
  try {
    const schema = z.object({ workerId: z.string(), queueName: z.string(), hostname: z.string().optional() });
    const { workerId, queueName, hostname } = schema.parse(req.body);
    const beat = await heartbeatWorker(workerId, queueName as any, hostname);
    res.json(beat);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Error Monitoring (Sentry-compatible)
// ============================================================

monitoringRouter.get('/errors', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Number(req.query.offset ?? 0);
    const errors = await getUnresolvedErrors(limit, offset);
    res.json({ errors, count: errors.length });
  } catch (err) {
    next(err);
  }
});

monitoringRouter.get('/errors/stats', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const hours = Number(req.query.hours ?? 24);
    const stats = await getErrorStats(hours);
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

monitoringRouter.post('/errors/:eventId/resolve', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req: AuthedRequest, res, next) => {
  try {
    const resolved = await resolveErrorEvent(String(req.params.eventId), req.auth!.sub);
    res.json(resolved);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// System Maintenance
// ============================================================

monitoringRouter.post('/maintenance/cleanup-idempotency', requireAuth, requireRole(['ADMIN']), async (_req, res, next) => {
  try {
    const count = await cleanupExpiredIdempotencyKeys();
    res.json({ cleaned: count });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Webhook Event Ledger
// ============================================================

monitoringRouter.get('/webhooks', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Number(req.query.offset ?? 0);
    const source = req.query.source as string | undefined;
    const status = req.query.status as string | undefined;

    const where: any = {};
    if (source) where.source = source;
    if (status) where.status = status;

    const [events, total] = await Promise.all([
      prisma.webhookEvent.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
      prisma.webhookEvent.count({ where })
    ]);

    res.json({ events, total, limit, offset });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Organization Management
// ============================================================

monitoringRouter.get('/organizations', requireAuth, requireRole(['STAFF', 'ADMIN']), async (_req, res, next) => {
  try {
    const orgs = await prisma.organization.findMany({
      include: {
        members: { include: { User: { select: { email: true, firstName: true, lastName: true } } } },
        _count: { select: { members: true, clients: true } }
      }
    });
    res.json({ organizations: orgs });
  } catch (err) {
    next(err);
  }
});

monitoringRouter.post('/organizations', requireAuth, requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1),
      slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
      website: z.string().optional(),
      description: z.string().optional(),
      maxMembers: z.number().int().min(1).max(100).optional(),
      maxClients: z.number().int().min(1).max(1000).optional()
    });
    const data = schema.parse(req.body);

    const org = await prisma.organization.create({
      data: {
        name: data.name,
        slug: data.slug,
        website: data.website,
        description: data.description,
        maxMembers: data.maxMembers ?? 5,
        maxClients: data.maxClients ?? 50
      }
    });

    res.status(201).json(org);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// AI cost / usage (admin)
// ============================================================

monitoringRouter.get('/ai', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
    const since = new Date(Date.now() - days * 86400_000);

    const [byTask, byModel, totals, failures] = await Promise.all([
      prisma.aiUsageEvent.groupBy({ by: ['task'], where: { createdAt: { gte: since } }, _sum: { totalTokens: true, costUsd: true }, _count: { _all: true } }),
      prisma.aiUsageEvent.groupBy({ by: ['model'], where: { createdAt: { gte: since } }, _sum: { totalTokens: true, costUsd: true }, _count: { _all: true } }),
      prisma.aiUsageEvent.aggregate({ where: { createdAt: { gte: since } }, _sum: { totalTokens: true, costUsd: true }, _count: { _all: true } }),
      prisma.aiUsageEvent.count({ where: { createdAt: { gte: since }, ok: false } })
    ]);

    res.json({
      windowDays: days,
      totals: {
        calls: totals._count._all,
        failures,
        totalTokens: totals._sum.totalTokens ?? 0,
        costUsd: Number(totals._sum.costUsd ?? 0)
      },
      byTask: byTask.map((r) => ({ task: r.task, calls: r._count._all, tokens: r._sum.totalTokens ?? 0, costUsd: Number(r._sum.costUsd ?? 0) })),
      byModel: byModel.map((r) => ({ model: r.model, calls: r._count._all, tokens: r._sum.totalTokens ?? 0, costUsd: Number(r._sum.costUsd ?? 0) }))
    });
  } catch (err) {
    next(err);
  }
});
