import { WebhookEventStatus } from '@prisma/client';
import { prisma } from './prisma.js';

export type AgingBucket = 'current' | '1_7' | '8_30' | '31_60' | '61_plus' | 'no_due_date' | 'not_open';

export interface InvoiceAgingInput {
  status: string;
  dueAt?: Date | string | null;
}

export interface BillingOpsInvoiceSample {
  id: string;
  clientId: string;
  clientEmail?: string | null;
  provider: string;
  providerInvoiceId?: string | null;
  status: string;
  amountDue: string;
  amountPaid: string;
  currency: string;
  dueAt?: string | null;
  daysPastDue: number | null;
  bucket: AgingBucket;
}

export function daysPastDue(dueAt: Date | string | null | undefined, now = new Date()): number | null {
  if (!dueAt) return null;
  const due = dueAt instanceof Date ? dueAt : new Date(dueAt);
  if (Number.isNaN(due.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - due.getTime()) / 86_400_000));
}

export function invoiceAgingBucket(invoice: InvoiceAgingInput, now = new Date()): AgingBucket {
  const status = String(invoice.status || '').toUpperCase();
  if (status !== 'OPEN' && status !== 'UNCOLLECTIBLE') return 'not_open';
  const pastDue = daysPastDue(invoice.dueAt, now);
  if (pastDue === null) return 'no_due_date';
  if (pastDue === 0) return 'current';
  if (pastDue <= 7) return '1_7';
  if (pastDue <= 30) return '8_30';
  if (pastDue <= 60) return '31_60';
  return '61_plus';
}

export function emptyAgingBuckets(): Record<AgingBucket, number> {
  return {
    current: 0,
    '1_7': 0,
    '8_30': 0,
    '31_60': 0,
    '61_plus': 0,
    no_due_date: 0,
    not_open: 0
  };
}

export function summarizeInvoiceAging(invoices: InvoiceAgingInput[], now = new Date()) {
  const buckets = emptyAgingBuckets();
  for (const invoice of invoices) {
    buckets[invoiceAgingBucket(invoice, now)] += 1;
  }
  return buckets;
}

export async function getBillingOpsSnapshot(now = new Date()) {
  const staleWebhookStatuses = [WebhookEventStatus.FAILED, WebhookEventStatus.RETRYING, WebhookEventStatus.DEAD_LETTER];
  const [openInvoices, riskySubscriptions, unresolvedPayments, webhookFailures] = await Promise.all([
    prisma.invoice.findMany({
      where: { status: { in: ['OPEN', 'UNCOLLECTIBLE'] } },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
      take: 100,
      include: { client: { include: { user: true } } }
    }),
    prisma.subscription.findMany({
      where: { status: { in: ['PAST_DUE', 'UNPAID', 'PAUSED', 'INCOMPLETE', 'INCOMPLETE_EXPIRED'] } },
      orderBy: [{ updatedAt: 'desc' }],
      take: 100,
      include: { client: { include: { user: true } } }
    }),
    prisma.payment.findMany({
      where: { status: { in: ['PENDING', 'FAILED'] } },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
      take: 100,
      include: { client: { include: { user: true } } }
    }),
    prisma.webhookEvent.findMany({
      where: { status: { in: staleWebhookStatuses } },
      orderBy: [{ updatedAt: 'asc' }],
      take: 50
    })
  ]);

  const invoiceSamples: BillingOpsInvoiceSample[] = openInvoices.slice(0, 25).map((invoice) => {
    const pastDue = daysPastDue(invoice.dueAt, now);
    return {
      id: invoice.id,
      clientId: invoice.clientId,
      clientEmail: invoice.client?.user?.email ?? null,
      provider: invoice.provider,
      providerInvoiceId: invoice.providerInvoiceId,
      status: invoice.status,
      amountDue: invoice.amountDue.toString(),
      amountPaid: invoice.amountPaid.toString(),
      currency: invoice.currency,
      dueAt: invoice.dueAt?.toISOString() ?? null,
      daysPastDue: pastDue,
      bucket: invoiceAgingBucket(invoice, now)
    };
  });

  return {
    generatedAt: now.toISOString(),
    invoices: {
      totalOpenOrUncollectible: openInvoices.length,
      buckets: summarizeInvoiceAging(openInvoices, now),
      samples: invoiceSamples
    },
    subscriptions: {
      atRiskCount: riskySubscriptions.length,
      samples: riskySubscriptions.slice(0, 25).map((subscription) => ({
        id: subscription.id,
        clientId: subscription.clientId,
        clientEmail: subscription.client?.user?.email ?? null,
        provider: subscription.provider,
        providerSubscriptionId: subscription.providerSubscriptionId,
        planCode: subscription.planCode,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd
      }))
    },
    payments: {
      unresolvedCount: unresolvedPayments.length,
      samples: unresolvedPayments.slice(0, 25).map((payment) => ({
        id: payment.id,
        clientId: payment.clientId,
        clientEmail: payment.client?.user?.email ?? null,
        provider: payment.provider,
        providerRef: payment.providerRef,
        type: payment.type,
        status: payment.status,
        amount: payment.amount.toString(),
        currency: payment.currency,
        dueAt: payment.dueAt?.toISOString() ?? null,
        attemptCount: payment.attemptCount
      }))
    },
    webhookLedger: {
      requiresReconciliationCount: webhookFailures.length,
      samples: webhookFailures.slice(0, 25).map((event) => ({
        id: event.id,
        source: event.source,
        eventType: event.eventType,
        externalEventId: event.externalEventId,
        status: event.status,
        retryCount: event.retryCount,
        errorMessage: event.errorMessage,
        updatedAt: event.updatedAt.toISOString()
      }))
    },
    operatorActions: [
      'Review OPEN and UNCOLLECTIBLE invoices by aging bucket before sending any dunning notice.',
      'Reconcile FAILED/RETRYING/DEAD_LETTER webhook rows against provider dashboards before replaying or resetting.',
      'Use the provider-specific dashboard as source of truth for refunds, cancellations and chargeback handling; this endpoint does not mutate billing state.'
    ]
  };
}
