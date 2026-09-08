import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const db = process.env.TEST_DATABASE_URL;
const skip = db ? false : 'TEST_DATABASE_URL not set';
if (db) process.env.DATABASE_URL = db;
let p: any;
let ledger: typeof import('../src/lib/webhookLedger.js');
const source = `audit-${randomUUID()}`;
const input = () => ({ source, eventType: 'payment.test', externalEventId: randomUUID(), payload: {} });
before(async () => {
  if (skip) return;
  p = (await import('../src/lib/prisma.js')).prisma;
  ledger = await import('../src/lib/webhookLedger.js');
});
after(async () => {
  if (!p) return;
  await p.webhookEvent.deleteMany({ where: { source } });
  await p.$disconnect();
});
test('simultaneous first deliveries run one processor; replay is acknowledged', { skip }, async () => {
  const event = input();
  let calls = 0;
  let release!: () => void;
  let started!: () => void;
  const entered = new Promise<void>(resolve => { started = resolve; });
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const processor = async () => { calls++; started(); await blocked; return { done: true }; };
  const owner = ledger.processWebhookWithLedger(event, processor);
  await entered;
  try {
    const others = await Promise.all(Array.from({ length: 12 }, () => ledger.processWebhookWithLedger(event, processor)));
    assert.ok(others.every(r => !r.handled));
    assert.equal(calls, 1);
    const row = await p.webhookEvent.findUniqueOrThrow({ where: { externalEventId: event.externalEventId } });
    assert.equal(row.status, 'PROCESSING');
    assert.equal(row.retryCount, 0, 'contending requests must not exhaust owner retries');
  } finally { release(); }
  assert.equal((await owner).handled, true);
  assert.equal((await ledger.processWebhookWithLedger(event, processor)).handled, true);
  assert.equal(calls, 1);
});
test('concurrent insert race records one row and only one processing attempt', { skip }, async () => {
  const event = input();
  let calls = 0;
  const results = await Promise.all(Array.from({ length: 20 }, () => ledger.processWebhookWithLedger(event, async () => { calls++; return {}; })));
  assert.equal(calls, 1);
  assert.ok(results.some(r => r.handled));
  assert.equal(await p.webhookEvent.count({ where: { externalEventId: event.externalEventId } }), 1);
});
test('five failed attempts dead-letter; further deliveries do not invoke processor', { skip }, async () => {
  const event = input(); let calls = 0;
  for (let i = 0; i < 8; i++) {
    const result = await ledger.processWebhookWithLedger(event, async () => { calls++; throw new Error('synthetic failure'); });
    assert.equal(result.handled, false);
  }
  assert.equal(calls, 5);
  const row = await p.webhookEvent.findUniqueOrThrow({ where: { externalEventId: event.externalEventId } });
  assert.equal(row.status, 'DEAD_LETTER'); assert.equal(row.retryCount, 5);
});
test('failed attempt can retry successfully, then cannot replay side effects', { skip }, async () => {
  const event = input();
  await ledger.processWebhookWithLedger(event, async () => { throw new Error('transient'); });
  let calls = 0;
  const processor = async () => { calls++; return {}; };
  assert.equal((await ledger.processWebhookWithLedger(event, processor)).handled, true);
  assert.equal((await ledger.processWebhookWithLedger(event, processor)).handled, true);
  assert.equal(calls, 1);
});
test('crashed PROCESSING rows are not automatically replayed', { skip }, async () => {
  const event = input();
  const { event: row } = await ledger.recordWebhookEvent(event);
  await ledger.beginProcessing(row.id);
  let calls = 0;
  assert.equal((await ledger.processWebhookWithLedger(event, async () => { calls++; })).handled, false);
  assert.equal(calls, 0);
  assert.equal((await p.webhookEvent.findUniqueOrThrow({ where: { id: row.id } })).status, 'PROCESSING');
});
test('provider collision cannot reuse another provider event', { skip }, async () => {
  const event = input();
  await ledger.processWebhookWithLedger(event, async () => ({}));
  const result = await ledger.processWebhookWithLedger({ ...event, source: 'other' }, async () => assert.fail('must not run'));
  assert.equal(result.handled, false);
});
