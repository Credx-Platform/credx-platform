import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeProps, isAnalyticsEnabled, track } from '../src/lib/analytics.js';

test('sanitizeProps strips PII-shaped keys at any depth', () => {
  const out = sanitizeProps({
    plan: 'ESSENTIAL',
    ssn: '123-45-6789',
    ssnLast4: '6789',
    password: 'hunter2',
    stripeToken: 'tok_abc',
    accountNumber: '4111111111111111',
    nested: { dob: '1990-01-01', city: 'Austin' }
  });
  assert.deepEqual(out, { plan: 'ESSENTIAL', nested: { city: 'Austin' } });
});

test('sanitizeProps truncates very long strings', () => {
  const out = sanitizeProps({ note: 'x'.repeat(1000) });
  assert.ok(String(out.note).length <= 501);
  assert.ok(String(out.note).endsWith('…'));
});

test('analytics is disabled by default (no env configured)', () => {
  assert.equal(isAnalyticsEnabled(), false);
});

test('track() is a no-op that never throws when disabled', () => {
  assert.doesNotThrow(() => track('account_created', { distinctId: 'u1', props: { ssn: 'x' } }));
});
