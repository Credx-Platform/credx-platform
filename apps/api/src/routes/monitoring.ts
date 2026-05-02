import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { maybeSendPortalReadyEmail } from '../lib/portalReady.js';

export const monitoringRouter = Router();

/**
 * Submit monitoring credentials. Monitoring is now optional — clients can
 * skip this step (POST /api/monitoring/skip) or submit empty credentials.
 * Either way the portal-ready email goes out as long as contract + profile
 * are filled. Credentials, when supplied, are stored on the progress row
 * so staff can run a pull on the client's behalf.
 */
monitoringRouter.post('/', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const provider = String(req.body?.provider || '').trim();
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '').trim();

    const client = await prisma.client.findUnique({
      where: { userId: req.auth!.sub },
      include: { progress: true, user: true }
    });
    if (!client || !client.progress) return res.status(404).json({ error: 'Client not found' });

    const monitoringId = crypto.randomUUID();
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
          monitoringHasCredentials: hasCredentials
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
 * can fill in monitoring later from inside the portal (Analysis tab).
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
          monitoringSkippedAt: submittedAt
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
