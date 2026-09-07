import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { upsertProviderSubscription } from './subscriptions.js';

/**
 * Stripe webhook → persistent Subscription/Invoice reconciliation.
 *
 * Defensive by design: if we can't resolve the CredX client for an event we
 * record a note and no-op rather than throw, so an unrelated Stripe object never
 * dead-letters a webhook. All writes are idempotent (keyed on provider ids).
 */

type StripeObject = Record<string, any>;

export async function resolveClientIdFromStripe(obj: StripeObject): Promise<string | null> {
  const metaId = obj?.metadata?.clientId || obj?.metadata?.client_id;
  if (metaId) {
    const byMeta = await prisma.client.findUnique({ where: { id: String(metaId) } }).catch(() => null);
    if (byMeta) return byMeta.id;
  }
  const customerId = typeof obj?.customer === 'string' ? obj.customer : obj?.customer?.id;
  if (customerId) {
    const byCustomer = await prisma.client.findFirst({ where: { stripeCustomerId: String(customerId) } });
    if (byCustomer) return byCustomer.id;
  }
  const subId = typeof obj?.subscription === 'string' ? obj.subscription : obj?.subscription?.id;
  if (subId) {
    const bySub = await prisma.client.findFirst({ where: { stripeSubscriptionId: String(subId) } });
    if (bySub) return bySub.id;
  }
  return null;
}

function planCodeFromStripeSubscription(sub: StripeObject): string | null {
  const fromMeta = sub?.metadata?.planCode || sub?.metadata?.plan_code;
  if (fromMeta) return String(fromMeta).toUpperCase();
  // Optional price-id -> plan map via env (STRIPE_PRICE_ESSENTIAL=price_123 ...).
  const priceId =
    sub?.items?.data?.[0]?.price?.id ||
    sub?.plan?.id ||
    null;
  if (priceId) {
    for (const code of ['ESSENTIAL', 'PREMIUM', 'FAMILY', 'MASTERCLASS']) {
      if (process.env[`STRIPE_PRICE_${code}`] && process.env[`STRIPE_PRICE_${code}`] === priceId) {
        return code;
      }
    }
  }
  return null;
}

function toDate(unixSeconds: unknown): Date | null {
  const n = Number(unixSeconds);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : null;
}

export async function handleStripeSubscriptionChange(sub: StripeObject): Promise<{ ok: boolean; note?: string; subscriptionId?: string }> {
  const clientId = await resolveClientIdFromStripe(sub);
  if (!clientId) return { ok: false, note: 'no matching CredX client for Stripe subscription' };

  const record = await upsertProviderSubscription({
    clientId,
    provider: 'stripe',
    providerSubscriptionId: String(sub.id),
    providerCustomerId: typeof sub.customer === 'string' ? sub.customer : sub?.customer?.id ?? null,
    planCode: planCodeFromStripeSubscription(sub),
    status: String(sub.status || 'incomplete'),
    quantity: Number(sub?.items?.data?.[0]?.quantity ?? sub?.quantity ?? 1),
    currentPeriodStart: toDate(sub.current_period_start),
    currentPeriodEnd: toDate(sub.current_period_end),
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    canceledAt: toDate(sub.canceled_at),
    startedAt: toDate(sub.start_date) ?? toDate(sub.created),
    endedAt: toDate(sub.ended_at),
    metadata: { stripeStatus: sub.status }
  });

  // Keep the denormalized pointer on Client in sync (best-effort).
  await prisma.client
    .update({ where: { id: clientId }, data: { stripeSubscriptionId: String(sub.id) } })
    .catch(() => undefined);

  return { ok: true, subscriptionId: record.id };
}

const STRIPE_INVOICE_STATUS: Record<string, 'DRAFT' | 'OPEN' | 'PAID' | 'VOID' | 'UNCOLLECTIBLE'> = {
  draft: 'DRAFT',
  open: 'OPEN',
  paid: 'PAID',
  void: 'VOID',
  uncollectible: 'UNCOLLECTIBLE'
};

export async function handleStripeInvoice(invoice: StripeObject): Promise<{ ok: boolean; note?: string; invoiceId?: string }> {
  const clientId = await resolveClientIdFromStripe(invoice);
  if (!clientId) return { ok: false, note: 'no matching CredX client for Stripe invoice' };

  const providerInvoiceId = String(invoice.id);
  const status = STRIPE_INVOICE_STATUS[String(invoice.status || '').toLowerCase()] ?? 'OPEN';
  const subStripeId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice?.subscription?.id;
  const localSub = subStripeId
    ? await prisma.subscription.findUnique({
        where: { provider_providerSubscriptionId: { provider: 'stripe', providerSubscriptionId: String(subStripeId) } }
      }).catch(() => null)
    : null;

  const data = {
    clientId,
    subscriptionId: localSub?.id ?? null,
    provider: 'stripe',
    providerInvoiceId,
    number: invoice.number ? String(invoice.number) : null,
    amountDue: new Prisma.Decimal(Number(invoice.amount_due ?? 0) / 100),
    amountPaid: new Prisma.Decimal(Number(invoice.amount_paid ?? 0) / 100),
    currency: String(invoice.currency || 'usd').toUpperCase(),
    status,
    description: invoice.description ? String(invoice.description) : null,
    hostedInvoiceUrl: invoice.hosted_invoice_url ? String(invoice.hosted_invoice_url) : null,
    periodStart: toDate(invoice.period_start),
    periodEnd: toDate(invoice.period_end),
    dueAt: toDate(invoice.due_date),
    paidAt: status === 'PAID' ? (toDate(invoice.status_transitions?.paid_at) ?? new Date()) : null,
    metadata: { stripeStatus: invoice.status } as Prisma.InputJsonValue
  };

  const record = await prisma.invoice.upsert({
    where: { provider_providerInvoiceId: { provider: 'stripe', providerInvoiceId } },
    create: data,
    update: data
  });
  return { ok: true, invoiceId: record.id };
}
