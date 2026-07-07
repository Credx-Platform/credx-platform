import { prisma } from './prisma.js';

/**
 * CROA billing/work gates per counsel guidance (2026-07-07).
 *
 * Setup fee may be charged only when ALL of:
 *   first_round_sent && proof_of_mailing_recorded && cancellation_window_expired
 * and no paid dispute work (letter generation/mailing) may begin until the
 * contract is signed and the 3-business-day cancellation window has expired.
 */

export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let remaining = days;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) remaining--;
  }
  return d;
}

/** CROA right runs "until midnight of the 3rd business day after signing". */
export function cancellationWindowEnd(signedAt: Date): Date {
  const end = addBusinessDays(signedAt, 3);
  end.setHours(23, 59, 59, 999);
  return end;
}

export type ServiceContractInfo = { signedAt: Date; contractId?: string } | null;

/**
 * The signed *service* agreement (masterclass signatures don't count — the
 * Agreement table has no contract type, so prefer the onboarding signature
 * record which does).
 */
export async function serviceContractFor(clientId: string): Promise<ServiceContractInfo> {
  const progress = await prisma.clientProgress.findUnique({
    where: { clientId },
    select: { onboarding: true }
  });
  const signature = (progress?.onboarding as any)?.signature;
  if (signature?.signedAt && signature.contractType !== 'masterclass') {
    return { signedAt: new Date(signature.signedAt), contractId: signature.contractId };
  }
  const agreement = await prisma.agreement.findFirst({
    where: { clientId, status: 'SIGNED', signedAt: { not: null } },
    orderBy: { signedAt: 'desc' }
  });
  return agreement?.signedAt ? { signedAt: agreement.signedAt } : null;
}

/** Earliest recorded proof of mailing (Lob send or manual mail log). */
export async function firstRoundMailingProof(clientId: string) {
  return prisma.activityEvent.findFirst({
    where: { clientId, type: 'dispute.letter.mailed' },
    orderBy: { createdAt: 'asc' }
  });
}

export type GateResult = { eligible: boolean; reasons: string[]; windowEndsAt?: string };

function contractWindowReasons(contract: ServiceContractInfo): { reasons: string[]; windowEndsAt?: string } {
  if (!contract) return { reasons: ['Service agreement has not been signed.'] };
  const end = cancellationWindowEnd(contract.signedAt);
  const reasons: string[] = [];
  if (Date.now() <= end.getTime()) {
    reasons.push(`CROA 3-business-day cancellation window is still open (ends ${end.toDateString()}).`);
  }
  return { reasons, windowEndsAt: end.toISOString() };
}

/** Gate for starting paid dispute work (letter generation / mailing). */
export async function disputeWorkGate(clientId: string): Promise<GateResult> {
  const { reasons, windowEndsAt } = contractWindowReasons(await serviceContractFor(clientId));
  return { eligible: reasons.length === 0, reasons, windowEndsAt };
}

/** Gate for charging the setup fee. */
export async function setupFeeBillingGate(clientId: string): Promise<GateResult> {
  const { reasons, windowEndsAt } = contractWindowReasons(await serviceContractFor(clientId));

  const round = await prisma.disputeRound.findFirst({
    where: { disputeItem: { clientId }, roundNumber: 1 }
  });
  if (!round) reasons.push('First dispute round has not been generated.');

  const proof = await firstRoundMailingProof(clientId);
  if (!proof) reasons.push('No proof of mailing recorded for the first dispute round.');

  return { eligible: reasons.length === 0, reasons, windowEndsAt };
}

export class BillingGateError extends Error {
  reasons: string[];
  constructor(reasons: string[]) {
    super(`Setup fee is not yet chargeable. ${reasons.join(' ')}`);
    this.name = 'BillingGateError';
    this.reasons = reasons;
  }
}
