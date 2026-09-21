import { prisma } from './prisma.js';
import { normalizeEmail } from './unsubscribeToken.js';

/* Marketing mail must respect an opt-out; transactional mail must not. A
   password-setup link or a receipt still has to reach someone who unsubscribed
   from the masterclass drip, so the gate lives at the send site and keys off
   the message category rather than blocking the address outright. */

export type EmailCategory = 'marketing' | 'transactional';

export async function isSuppressed(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  try {
    const row = await prisma.emailSuppression.findUnique({
      where: { email: normalized },
      select: { resubscribedAt: true }
    });
    return Boolean(row) && row?.resubscribedAt == null;
  } catch (error) {
    // Fail open: a suppression-table outage must not silently stop all mail.
    // The opt-out is still honoured by the provider-level List-Unsubscribe.
    console.warn('EMAIL_SUPPRESSION_LOOKUP_FAILED', error instanceof Error ? error.message : String(error));
    return false;
  }
}

export async function suppressEmail(params: {
  email: string;
  reason?: string;
  source?: string;
}): Promise<{ email: string; alreadySuppressed: boolean }> {
  const normalized = normalizeEmail(params.email);
  if (!normalized) throw new Error('email is required');

  const existing = await prisma.emailSuppression.findUnique({
    where: { email: normalized },
    select: { id: true, resubscribedAt: true }
  });

  if (existing && existing.resubscribedAt == null) {
    return { email: normalized, alreadySuppressed: true };
  }

  await prisma.emailSuppression.upsert({
    where: { email: normalized },
    create: {
      email: normalized,
      reason: params.reason || 'USER_REQUEST',
      source: params.source || 'link'
    },
    update: {
      reason: params.reason || 'USER_REQUEST',
      source: params.source || 'link',
      resubscribedAt: null,
      createdAt: new Date()
    }
  });

  return { email: normalized, alreadySuppressed: false };
}

export async function resubscribeEmail(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  const existing = await prisma.emailSuppression.findUnique({
    where: { email: normalized },
    select: { id: true, resubscribedAt: true }
  });
  if (!existing || existing.resubscribedAt != null) return false;

  await prisma.emailSuppression.update({
    where: { email: normalized },
    data: { resubscribedAt: new Date() }
  });
  return true;
}
