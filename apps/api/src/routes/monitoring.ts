import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';

export const monitoringRouter = Router();

monitoringRouter.post('/', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const provider = String(req.body?.provider || '').trim();
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '').trim();
    if (!provider) return res.status(400).json({ error: 'Credit report provider is required' });

    const client = await prisma.client.findUnique({
      where: { userId: req.auth!.sub },
      include: { progress: true }
    });
    if (!client || !client.progress) return res.status(404).json({ error: 'Client not found' });

    const monitoringId = crypto.randomUUID();
    const submittedAt = new Date().toISOString();
    const progress = client.progress as any;
    const hasCredentials = Boolean(username && password);

    const updated = await prisma.clientProgress.update({
      where: { clientId: client.id },
      data: {
        onboarding: {
          ...(progress.onboarding || {}),
          status: 'completed',
          completedAt: submittedAt
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

    return res.json({
      success: true,
      monitoring_id: monitoringId,
      monitoring: {
        id: monitoringId,
        provider,
        hasCredentials,
        status: 'submitted',
        submittedAt
      },
      progress: updated,
      emailNotification: 'skipped'
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
