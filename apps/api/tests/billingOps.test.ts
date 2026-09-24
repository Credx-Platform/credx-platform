import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysPastDue, invoiceAgingBucket, summarizeInvoiceAging } from '../src/lib/billingOps.js';

const now = new Date('2026-09-24T12:00:00.000Z');

test('daysPastDue clamps future invoices to zero days', () => {
  assert.equal(daysPastDue('2026-09-25T12:00:00.000Z', now), 0);
  assert.equal(daysPastDue('2026-09-23T12:00:00.000Z', now), 1);
  assert.equal(daysPastDue(null, now), null);
});

test('invoiceAgingBucket classifies open invoice age without provider assumptions', () => {
  assert.equal(invoiceAgingBucket({ status: 'PAID', dueAt: '2026-08-01T00:00:00.000Z' }, now), 'not_open');
  assert.equal(invoiceAgingBucket({ status: 'OPEN', dueAt: null }, now), 'no_due_date');
  assert.equal(invoiceAgingBucket({ status: 'OPEN', dueAt: '2026-09-24T00:00:00.000Z' }, now), 'current');
  assert.equal(invoiceAgingBucket({ status: 'OPEN', dueAt: '2026-09-17T00:00:00.000Z' }, now), '1_7');
  assert.equal(invoiceAgingBucket({ status: 'OPEN', dueAt: '2026-09-01T00:00:00.000Z' }, now), '8_30');
  assert.equal(invoiceAgingBucket({ status: 'OPEN', dueAt: '2026-08-01T00:00:00.000Z' }, now), '31_60');
  assert.equal(invoiceAgingBucket({ status: 'UNCOLLECTIBLE', dueAt: '2026-06-01T00:00:00.000Z' }, now), '61_plus');
});

test('summarizeInvoiceAging returns all stable bucket keys for the ops UI', () => {
  const summary = summarizeInvoiceAging([
    { status: 'OPEN', dueAt: '2026-09-24T00:00:00.000Z' },
    { status: 'OPEN', dueAt: '2026-09-01T00:00:00.000Z' },
    { status: 'PAID', dueAt: '2026-09-01T00:00:00.000Z' }
  ], now);
  assert.deepEqual(summary, {
    current: 1,
    '1_7': 0,
    '8_30': 1,
    '31_60': 0,
    '61_plus': 0,
    no_due_date: 0,
    not_open: 1
  });
});
