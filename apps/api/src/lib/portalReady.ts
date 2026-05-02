import { prisma } from './prisma.js';
import { config } from '../config.js';
import { sendPortalReadyEmail } from './email.js';
import { buildPasswordSetupLink, issuePasswordSetupToken } from './passwordSetup.js';

/**
 * Single source of truth for "is the client allowed into the portal yet,
 * and have we already emailed them the setup link?" Called from both the
 * /applications and /monitoring route handlers so finishing either step
 * (whichever happens last) can fire the email.
 *
 * Monitoring credentials used to be required here. They no longer are —
 * we don't want to lose paid leads to an abandoned monitoring step. The
 * portal-ready email now fires as soon as contract + profile are both
 * complete; clients can connect monitoring later from inside the portal.
 */
export const PORTAL_READY_GUARD_KEY = 'portalReadyEmailSentAt';

export function isContractSigned(progress: any): boolean {
  const stage = progress?.workflow?.stage;
  return ['contract_signed', 'application_completed', 'portal_unlocked'].includes(stage);
}

export function isProfileFilled(client: {
  ssnLast4: string | null;
  currentAddressLine1: string | null;
  dobEncrypted: string | null;
}): boolean {
  return Boolean(client.ssnLast4 && client.currentAddressLine1 && client.dobEncrypted);
}

type PortalReadyResult =
  | { status: 'sent'; deliveryId?: string }
  | { status: 'skipped'; reason: 'gates_not_passed' | 'already_sent' }
  | { status: 'failed'; reason: string };

/**
 * Idempotent. Safe to call multiple times — the guard key ensures the
 * email goes out at most once per client unless explicitly cleared.
 */
export async function maybeSendPortalReadyEmail(clientId: string): Promise<PortalReadyResult> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { progress: true, user: true }
  });
  if (!client || !client.progress) {
    return { status: 'failed', reason: 'client_not_found' };
  }

  const progress = client.progress as any;
  const onboarding = (progress.onboarding || {}) as Record<string, unknown>;
  const alreadySent = Boolean(onboarding[PORTAL_READY_GUARD_KEY]);
  const gatesPassed = isContractSigned(progress) && isProfileFilled(client);

  console.log('PORTAL_EMAIL_GATE_CHECK', {
    clientId,
    gatesPassed,
    alreadySent,
    stage: progress?.workflow?.stage,
    hasSSN: Boolean(client.ssnLast4),
    hasAddress: Boolean(client.currentAddressLine1),
    hasDOB: Boolean(client.dobEncrypted)
  });

  if (!gatesPassed) return { status: 'skipped', reason: 'gates_not_passed' };
  if (alreadySent) return { status: 'skipped', reason: 'already_sent' };

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
      return { status: 'failed', reason: result.delivery.reason || 'delivery_skipped' };
    }

    const sentAt = new Date().toISOString();
    await prisma.clientProgress.update({
      where: { clientId: client.id },
      data: {
        onboarding: {
          ...onboarding,
          [PORTAL_READY_GUARD_KEY]: sentAt
        }
      }
    });
    console.log('PORTAL_EMAIL_SENT', { clientId, deliveryId: (result.delivery as any)?.id });
    return { status: 'sent', deliveryId: (result.delivery as any)?.id };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn('PORTAL_READY_EMAIL_FAILED', reason);
    return { status: 'failed', reason };
  }
}
