import { prisma } from './prisma.js';
import { monthlyFeeForPlan, planCodeForServiceTier, setupFeeForPlan } from './entitlements.js';

// First-work fee by service tier. Charged only AFTER the analysis review is
// delivered and confirmed (see /pricing). Single source of truth for the setup amount.
export const TIER_SETUP_FEE: Record<string, number> = {
  ESSENTIAL: 150,
  AGGRESSIVE: 447, // "Premium" tier
  FAMILY: 300
};

export const TIER_MONTHLY_FEE: Record<string, number> = {
  ESSENTIAL: 75,
  AGGRESSIVE: 0, // Premium is one-time after analysis review
  FAMILY: 95
};

export function setupFeeForTier(tier?: string | null): number {
  return setupFeeForPlan(planCodeForServiceTier(tier));
}

export function monthlyFeeForTier(tier?: string | null): number {
  return monthlyFeeForPlan(planCodeForServiceTier(tier));
}

/**
 * Create the pending "bill". Called after the analysis review has been delivered
 * and confirmed. Idempotent: if a SETUP_FEE payment already exists for the
 * client (pending or paid), it is reused.
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
  gateWarnings?: string[];
};

export type MonthlyPaymentResult = {
  payment: { amount: number; currency: string; status: 'PAID' };
};

/**
 * Settle the client's setup-fee bill. Settle ONLY — per counsel guidance
 * (2026-07-07), payment must never trigger dispute work; the sequence is
 * analysis review delivered → cancellation window expired → then charge.
 * Dispute activation is a separate admin action (activateClientDisputeCampaign)
 * and the pending bill is raised after analysis review.
 *
 * Throws BillingGateError when the CROA gate isn't satisfied, unless
 * opts.recordDespiteGate is set (online webhooks: the processor already moved
 * the money, so record it and flag for review/refund instead of dropping it).
 * Throws 'Client not found' so callers can map to 404.
 */
export async function settleSetupPayment(
  clientId: string,
  opts?: {
    amount?: number;
    currency?: string;
    reference?: string;
    method?: string;
    stripePaymentIntentId?: string;
    recordDespiteGate?: boolean;
  }
): Promise<SettleResult> {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new Error('Client not found');

  const { setupFeeBillingGate, BillingGateError } = await import('./croaCompliance.js');
  const gate = await setupFeeBillingGate(clientId);
  if (!gate.eligible && !opts?.recordDespiteGate) {
    throw new BillingGateError(gate.reasons);
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
      data: {
        status: 'PAID',
        paidAt: new Date(),
        amount,
        currency,
        ...(opts?.stripePaymentIntentId ? { stripePaymentIntentId: opts.stripePaymentIntentId } : {})
      }
    });
  } else {
    await prisma.payment.create({
      data: {
        clientId,
        amount,
        currency,
        type: 'SETUP_FEE',
        status: 'PAID',
        paidAt: new Date(),
        stripePaymentIntentId: opts?.stripePaymentIntentId || null
      }
    });
  }

  if (!gate.eligible) {
    // Money arrived before the CROA gate was satisfied — surface loudly for review/refund.
    await prisma.activityEvent.create({
      data: {
        clientId,
        type: 'EARLY_PAYMENT_FLAGGED',
        message: `Setup payment of $${amount} ${currency} received BEFORE the CROA billing gate was satisfied. Review for refund/hold. ${gate.reasons.join(' ')}`,
        metadata: { amount, currency, method: opts?.method || 'unknown', reasons: gate.reasons }
      }
    });
  }

  await prisma.activityEvent.create({
    data: {
      clientId,
      type: 'PAYMENT_RECEIVED',
      message: `Setup payment of $${amount} ${currency} received${opts?.method ? ` (${opts.method})` : ''}.`,
      metadata: {
        amount,
        currency,
        method: opts?.method || 'manual',
        reference: opts?.reference || null,
        gateEligible: gate.eligible
      }
    }
  });

  return {
    payment: { amount, currency, status: 'PAID' },
    gateWarnings: gate.eligible ? undefined : gate.reasons
  };
}

export async function recordMonthlySubscriptionPayment(
  clientId: string,
  opts?: {
    amount?: number;
    currency?: string;
    reference?: string;
    method?: string;
  }
): Promise<MonthlyPaymentResult> {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new Error('Client not found');

  const amount = opts?.amount ?? monthlyFeeForTier(client.serviceTier);
  const currency = opts?.currency ?? 'USD';
  const method = opts?.method || 'paymentcloud';

  await prisma.payment.create({
    data: {
      clientId,
      amount,
      currency,
      type: 'MONTHLY',
      status: 'PAID',
      paidAt: new Date(),
      provider: method,
      providerRef: opts?.reference || null
    }
  });

  if (client.status === 'PAST_DUE' || client.status === 'RESTRICTED' || client.portalRestricted) {
    await prisma.client.update({
      where: { id: clientId },
      data: {
        status: 'ACTIVE',
        portalRestricted: false
      }
    });
  }

  await prisma.activityEvent.create({
    data: {
      clientId,
      type: 'PAYMENT_RECEIVED',
      message: `Monthly subscription payment of $${amount} ${currency} received (${method}).`,
      metadata: {
        amount,
        currency,
        method,
        reference: opts?.reference || null
      }
    }
  });

  return {
    payment: { amount, currency, status: 'PAID' }
  };
}
