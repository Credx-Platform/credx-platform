import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';

const db = process.env.TEST_DATABASE_URL;
const skip = db ? false : 'TEST_DATABASE_URL not set';
if (db) {
  process.env.DATABASE_URL = db;
  process.env.JWT_SECRET ||= 'test-secret';
}

const ctx = {} as { prisma: any; server: any; base: string; token: string; userIds: string[]; clientId: string; webhookId: string };

async function req(path: string) {
  const res = await fetch(`${ctx.base}${path}`, {
    headers: { authorization: `Bearer ${ctx.token}` }
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

before(async () => {
  if (skip) return;
  const jwt = (await import('jsonwebtoken')).default;
  const { config } = await import('../src/config.js');
  const { createApp } = await import('../src/app.js');
  ctx.prisma = (await import('../src/lib/prisma.js')).prisma;
  ctx.server = createApp({ disableRateLimits: true }).listen(0);
  await new Promise((resolve) => ctx.server.once('listening', resolve));
  ctx.base = `http://127.0.0.1:${(ctx.server.address() as AddressInfo).port}`;

  const suffix = randomUUID();
  const admin = await ctx.prisma.user.create({
    data: { email: `billing-admin-${suffix}@test.invalid`, passwordHash: 'x', firstName: 'Billing', lastName: 'Admin', role: 'ADMIN' }
  });
  const clientUser = await ctx.prisma.user.create({
    data: { email: `billing-client-${suffix}@test.invalid`, passwordHash: 'x', firstName: 'Billing', lastName: 'Client', client: { create: { status: 'PAST_DUE' } } },
    include: { client: true }
  });
  ctx.userIds = [admin.id, clientUser.id];
  ctx.clientId = clientUser.client.id;
  ctx.token = jwt.sign({ sub: admin.id, email: admin.email, role: 'ADMIN' }, config.jwtSecret);

  await ctx.prisma.invoice.create({
    data: {
      clientId: ctx.clientId,
      provider: 'manual',
      providerInvoiceId: `inv-${suffix}`,
      status: 'OPEN',
      amountDue: 97,
      currency: 'USD',
      dueAt: new Date(Date.now() - 14 * 86_400_000)
    }
  });
  await ctx.prisma.subscription.create({
    data: {
      clientId: ctx.clientId,
      provider: 'manual',
      providerSubscriptionId: `sub-${suffix}`,
      planCode: 'ESSENTIAL',
      status: 'PAST_DUE'
    }
  });
  await ctx.prisma.payment.create({
    data: {
      clientId: ctx.clientId,
      amount: 97,
      currency: 'USD',
      type: 'MONTHLY',
      status: 'FAILED',
      provider: 'manual',
      providerRef: `pay-${suffix}`
    }
  });
  const webhook = await ctx.prisma.webhookEvent.create({
    data: {
      source: 'stripe',
      eventType: 'invoice.payment_failed',
      externalEventId: `evt-${suffix}`,
      payload: {},
      status: 'DEAD_LETTER',
      errorMessage: 'unit reconciliation'
    }
  });
  ctx.webhookId = webhook.id;
});

after(async () => {
  if (!ctx.prisma) return;
  ctx.server?.close();
  await ctx.prisma.webhookEvent.deleteMany({ where: { id: ctx.webhookId } });
  await ctx.prisma.payment.deleteMany({ where: { clientId: ctx.clientId } });
  await ctx.prisma.invoice.deleteMany({ where: { clientId: ctx.clientId } });
  await ctx.prisma.subscription.deleteMany({ where: { clientId: ctx.clientId } });
  await ctx.prisma.client.deleteMany({ where: { id: ctx.clientId } });
  await ctx.prisma.user.deleteMany({ where: { id: { in: ctx.userIds } } });
  await ctx.prisma.$disconnect();
});

test('admin aging endpoint returns provider-neutral reconciliation snapshot', { skip }, async () => {
  const res = await req('/api/billing/admin/aging');
  assert.equal(res.status, 200);
  assert.ok(res.body.generatedAt);
  assert.ok(res.body.invoices.totalOpenOrUncollectible >= 1);
  assert.ok(res.body.invoices.buckets['8_30'] >= 1);
  assert.ok(res.body.subscriptions.atRiskCount >= 1);
  assert.ok(res.body.payments.unresolvedCount >= 1);
  assert.ok(res.body.webhookLedger.requiresReconciliationCount >= 1);
  assert.match(res.body.operatorActions.join(' '), /provider dashboard/i);
});
