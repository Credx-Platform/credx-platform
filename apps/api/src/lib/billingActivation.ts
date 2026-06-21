import { prisma } from './prisma.js';

// First-work fee by service tier. Charged only AFTER the analysis is delivered and
// the dispute work begins (see /pricing). Single source of truth for the setup amount.
export const TIER_SETUP_FEE: Record<string, number> = {
  ESSENTIAL: 150,
  AGGRESSIVE: 447, // "Premium" tier
  FAMILY: 300
};

export function setupFeeForTier(tier?: string | null): number {
  return TIER_SETUP_FEE[(tier || 'ESSENTIAL').toUpperCase()] ?? 150;
}

/**
 * Create the pending "bill" once the analysis has been sent. Idempotent: if a
 * SETUP_FEE payment already exists for the client (pending or paid), it is reused.
 */
export async function createPendingSetupBill(clientId: string, tier?: string | null) {
  const existing = await prisma.payment.findFirst({
    where: { clientId, type: 'SETUP_FEE', status: { in: ['PENDING', 'PAID'] } }
  });
  if (existing) return existing;

  return prisma.payment.create({
    data: {
      clientId,
      amount: setupFeeForTier(tier),
      currency: 'USD',
      type: 'SETUP_FEE',
      status: 'PENDING',
      dueAt: new Date()
    }
  });
}

export type SettleResult = {
  payment: { amount: number; currency: string; status: 'PAID' };
  lettersGenerated: number;
  emailSent?: boolean;
  errors?: unknown;
};

/**
 * Settle the client's pending setup bill and trigger the dispute campaign.
 * This is the single entry point used by BOTH the manual "Mark Paid" button and
 * the online payment-confirmation webhook, so payment (by either path) is the one
 * thing that activates dispute generation.
 *
 * Throws 'Client not found' or 'No credit analysis...' so callers can map to 404/400.
 */
export async function settlePaymentAndActivate(
  clientId: string,
  opts?: { amount?: number; currency?: string; reference?: string; method?: string }
): Promise<SettleResult> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { progress: true }
  });
  if (!client) throw new Error('Client not found');
  if (!client.progress?.analysis) {
    throw new Error('No credit analysis found. Generate the analysis before taking payment.');
  }

  // Settle the existing pending bill, or create a paid record if none exists yet.
  const pending = await prisma.payment.findFirst({
    where: { clientId, type: 'SETUP_FEE', status: 'PENDING' },
    orderBy: { createdAt: 'desc' }
  });
  const amount = opts?.amount ?? (pending ? Number(pending.amount) : setupFeeForTier(client.serviceTier));
  const currency = opts?.currency ?? pending?.currency ?? 'USD';

  if (pending) {
    await prisma.payment.update({
      where: { id: pending.id },
      data: { status: 'PAID', paidAt: new Date(), amount, currency }
    });
  } else {
    await prisma.payment.create({
      data: { clientId, amount, currency, type: 'SETUP_FEE', status: 'PAID', paidAt: new Date() }
    });
  }

  // Fresh start: clear any prior dispute items / letters before regenerating.
  const existingItems = await prisma.disputeItem.findMany({ where: { clientId }, select: { id: true } });
  if (existingItems.length > 0) {
    const ids = existingItems.map((d) => d.id);
    await prisma.disputeRound.deleteMany({ where: { disputeItemId: { in: ids } } });
    await prisma.disputeItem.deleteMany({ where: { clientId } });
    await prisma.document.deleteMany({ where: { clientId, type: 'DISPUTE_LETTER' } });
  }

  // Generate + send letters and set the client ACTIVE (handled inside).
  const { activateClientDisputeCampaign } = await import('./disputeAutomation.js');
  const result = await activateClientDisputeCampaign(clientId);

  await prisma.activityEvent.create({
    data: {
      clientId,
      type: 'PAYMENT_RECEIVED',
      message: `Payment of $${amount} ${currency} received${opts?.method ? ` (${opts.method})` : ''}. Client activated and ${result.lettersGenerated} dispute letter(s) generated.`,
      metadata: {
        amount,
        currency,
        method: opts?.method || 'manual',
        reference: opts?.reference || null,
        lettersGenerated: result.lettersGenerated
      }
    }
  });

  return {
    payment: { amount, currency, status: 'PAID' },
    lettersGenerated: result.lettersGenerated,
    emailSent: result.emailSent,
    errors: result.errors
  };
}
