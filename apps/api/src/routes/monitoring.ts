import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { sendPortalReadyEmail } from '../lib/email.js';
import { buildPasswordSetupLink, issuePasswordSetupToken } from '../lib/passwordSetup.js';

export const monitoringRouter = Router();

const PORTAL_READY_GUARD_KEY = 'portalReadyEmailSentAt';

function isContractSigned(progress: any) {
  const stage = progress?.workflow?.stage;
  if (stage === 'contract_signed') return true;
  return ['contract_signed', 'application_completed', 'portal_unlocked'].includes(stage);
}

function isProfileFilled(client: { ssnLast4: string | null; currentAddressLine1: string | null; dobEncrypted: string | null }) {
  return Boolean(client.ssnLast4 && client.currentAddressLine1 && client.dobEncrypted);
}

monitoringRouter.post('/', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const provider = String(req.body?.provider || '').trim();
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '').trim();
    if (!provider) return res.status(400).json({ error: 'Credit report provider is required' });

    const client = await prisma.client.findUnique({
      where: { userId: req.auth!.sub },
      include: { progress: true, user: true }
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

    const gatesPassed =
      isContractSigned(progress) &&
      isProfileFilled(client) &&
      hasCredentials;
    const alreadySent = Boolean((progress.onboarding || {})[PORTAL_READY_GUARD_KEY]);

    console.log('PORTAL_EMAIL_GATE_CHECK', {
      gatesPassed,
      alreadySent,
      stage: progress?.workflow?.stage,
      hasSSN: Boolean(client.ssnLast4),
      hasAddress: Boolean(client.currentAddressLine1),
      hasDOB: Boolean(client.dobEncrypted),
      hasCredentials
    });

    let emailNotification: { status: string; reason?: string; deliveryId?: string } = {
      status: 'skipped',
      reason: !gatesPassed
        ? 'gates_not_passed'
        : alreadySent
          ? 'already_sent'
          : undefined
    };

    if (gatesPassed && !alreadySent) {
      console.log('PORTAL_EMAIL_SENDING', { to: client.user.email, firstName: client.user.firstName });
      try {
        const { rawToken } = await issuePasswordSetupToken({
          userId: client.user.id,
          purpose: 'setup'
        });
        const loginLink = `${config.appUrl.replace(/\/$/, '')}/portal`;
        const setupLink = buildPasswordSetupLink(config.appUrl, rawToken);
        const result = await sendPortalReadyEmail({
          to: client.user.email,
          firstName: client.user.firstName,
          loginLink,
          setupLink
        });
        if (result.delivery?.skipped) {
          console.log('PORTAL_EMAIL_DELIVERY_SKIPPED', { reason: result.delivery.reason });
          emailNotification = {
            status: 'failed',
            reason: result.delivery.reason || 'delivery_skipped'
          };
        } else {
          console.log('PORTAL_EMAIL_SENT', { deliveryId: (result.delivery as any)?.id });
          await prisma.clientProgress.update({
            where: { clientId: client.id },
            data: {
              onboarding: {
                ...(updated.onboarding as any),
                [PORTAL_READY_GUARD_KEY]: submittedAt
              }
            }
          });
          emailNotification = {
            status: 'sent',
            deliveryId: (result.delivery as any)?.id
          };
        }
      } catch (emailError) {
        console.warn('PORTAL_READY_EMAIL_FAILED', emailError instanceof Error ? emailError.message : emailError);
        emailNotification = { status: 'failed', reason: emailError instanceof Error ? emailError.message : String(emailError) };
      }
    }

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
