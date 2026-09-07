import type { Prisma, Subscription } from '@prisma/client';
import { prisma } from './prisma.js';
import { planCodeFromSubscription, type SubscriptionPlanInput } from './entitlements.js';

/**
 * Persistent subscription helpers.
 *
 * A client's "current" subscription is the most recently updated row whose
 * status still grants access (ACTIVE / TRIALING / PAST_DUE), falling back to the
 * most recent row of any status so callers can surface dunning/canceled state.
 */

const ACCESS_GRANTING = ['ACTIVE', 'TRIALING', 'PAST_DUE'] as const;

export async function getCurrentSubscription(clientId: string): Promise<Subscription | null> {
  const active = await prisma.subscription.findFirst({
    where: { clientId, status: { in: ACCESS_GRANTING as unknown as Prisma.EnumSubscriptionStatusFilter['in'] } },
    orderBy: { updatedAt: 'desc' }
  });
  if (active) return active;
  return prisma.subscription.findFirst({
    where: { clientId },
    orderBy: { updatedAt: 'desc' }
  });
}

/** Shape a Subscription row for `resolveClientEntitlements({ subscription })`. */
export function toSubscriptionPlanInput(sub: Subscription | null | undefined): SubscriptionPlanInput | null {
  if (!sub) return null;
  return { status: sub.status, planCode: sub.planCode };
}

export interface ProviderSubscriptionInput {
  clientId: string;
  provider: string;
  providerSubscriptionId?: string | null;
  providerCustomerId?: string | null;
  planCode?: string | null;
  status: string;
  quantity?: number | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean | null;
  canceledAt?: Date | null;
  startedAt?: Date | null;
  endedAt?: Date | null;
  organizationId?: string | null;
  metadata?: Record<string, unknown>;
}

const VALID_STATUSES = new Set([
  'TRIALING', 'ACTIVE', 'PAST_DUE', 'UNPAID', 'PAUSED',
  'CANCELED', 'INCOMPLETE', 'INCOMPLETE_EXPIRED'
]);

function normalizeStatus(status: string): string {
  const s = String(status || '').trim().toUpperCase().replace(/-/g, '_');
  if (VALID_STATUSES.has(s)) return s;
  // Map common Stripe/PayPal spellings.
  if (s === 'CANCELLED' || s === 'EXPIRED' || s === 'SUSPENDED') return 'CANCELED';
  if (s === 'APPROVAL_PENDING' || s === 'APPROVED') return 'INCOMPLETE';
  return 'INCOMPLETE';
}

/**
 * Idempotently upsert a subscription from a provider event. Keyed on
 * (provider, providerSubscriptionId) when an id is present, else on
 * (clientId, provider). Never throws into a webhook path — callers should
 * still guard, but this keeps the write minimal and reversible.
 */
export async function upsertProviderSubscription(input: ProviderSubscriptionInput): Promise<Subscription> {
  const status = normalizeStatus(input.status) as Subscription['status'];
  const planCode = planCodeFromSubscription(input.planCode) ?? undefined;

  const data = {
    clientId: input.clientId,
    provider: input.provider,
    providerSubscriptionId: input.providerSubscriptionId ?? null,
    providerCustomerId: input.providerCustomerId ?? null,
    status,
    quantity: input.quantity ?? 1,
    currentPeriodStart: input.currentPeriodStart ?? null,
    currentPeriodEnd: input.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
    canceledAt: input.canceledAt ?? null,
    startedAt: input.startedAt ?? null,
    endedAt: input.endedAt ?? null,
    organizationId: input.organizationId ?? null,
    metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    ...(planCode ? { planCode } : {})
  };

  if (input.providerSubscriptionId) {
    return prisma.subscription.upsert({
      where: {
        provider_providerSubscriptionId: {
          provider: input.provider,
          providerSubscriptionId: input.providerSubscriptionId
        }
      },
      create: { ...data, startedAt: data.startedAt ?? new Date() },
      update: data
    });
  }

  const existing = await prisma.subscription.findFirst({
    where: { clientId: input.clientId, provider: input.provider },
    orderBy: { updatedAt: 'desc' }
  });
  if (existing) {
    return prisma.subscription.update({ where: { id: existing.id }, data });
  }
  return prisma.subscription.create({ data: { ...data, startedAt: data.startedAt ?? new Date() } });
}
