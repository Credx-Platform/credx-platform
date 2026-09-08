import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const db = process.env.TEST_DATABASE_URL;
const skip = db ? false : 'TEST_DATABASE_URL not set';
if (db) process.env.DATABASE_URL = db;
let p: any; let settle: typeof import('../src/lib/billingActivation.js').settleSetupPayment;
let id: string; let userId: string;
before(async () => {
  if (skip) return;
  p = (await import('../src/lib/prisma.js')).prisma;
  settle = (await import('../src/lib/billingActivation.js')).settleSetupPayment;
  const user = await p.user.create({ data: { email: `settlement-${randomUUID()}@example.test`, passwordHash: 'x', firstName: 'Synthetic', lastName: 'Test', client: { create: { status: 'LEAD' } } }, include: { client: true } });
  id = user.client.id; userId = user.id;
});
after(async () => {
  if (!p) return;
  await p.activityEvent.deleteMany({ where: { clientId: id } });
  await p.payment.deleteMany({ where: { clientId: id } });
  await p.client.delete({ where: { id } }); await p.user.delete({ where: { id: userId } }); await p.$disconnect();
});
test('billing gate still rejects charging before analysis/consultation and cancellation requirements', { skip }, async () => {
  await assert.rejects(settle(id), /not yet chargeable/);
  assert.equal(await p.payment.count({ where: { clientId: id } }), 0);
});
test('concurrent delivery and replay of one payment produce one payment and audit event', { skip }, async () => {
  const ref = `pi_${randomUUID()}`;
  const options = { amount: 150, stripePaymentIntentId: ref, method: 'stripe', recordDespiteGate: true };
  await Promise.all(Array.from({ length: 8 }, () => settle(id, options)));
  await settle(id, options);
  assert.equal(await p.payment.count({ where: { stripePaymentIntentId: ref } }), 1);
  assert.equal(await p.activityEvent.count({ where: { clientId: id, type: 'PAYMENT_RECEIVED' } }), 1);
  assert.equal(await p.activityEvent.count({ where: { clientId: id, type: 'EARLY_PAYMENT_FLAGGED' } }), 1);
});
