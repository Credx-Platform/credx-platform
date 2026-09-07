import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isoWeekKey, summarizeChanges, CHECKIN_QUESTIONS } from '../src/lib/checkin.js';

test('isoWeekKey returns a stable YYYY-Www key', () => {
  assert.match(isoWeekKey(new Date('2026-09-08T12:00:00Z')), /^2026-W\d{2}$/);
  // Same week -> same key; different week -> different key.
  const a = isoWeekKey(new Date('2026-09-07T00:00:00Z')); // Monday
  const b = isoWeekKey(new Date('2026-09-13T23:00:00Z')); // Sunday
  const c = isoWeekKey(new Date('2026-09-14T00:00:00Z')); // next Monday
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('summarizeChanges only lists things that changed, with notes', () => {
  const out = summarizeChanges({
    balancesChanged: true, balancesNote: 'paid down card',
    creditLimitChanged: false,
    newAccountOpened: true, newAccountNote: null,
    hardInquiry: true,
    freeText: 'moving next month'
  });
  assert.ok(out.some((s) => /balances changed: paid down card/i.test(s)));
  assert.ok(out.some((s) => /new account was opened$/i.test(s)));
  assert.ok(out.some((s) => /hard inquiry/i.test(s)));
  assert.ok(out.some((s) => /moving next month/i.test(s)));
  assert.ok(!out.some((s) => /credit limit/i.test(s)));
});

test('summarizeChanges reports "no changes" when nothing is flagged', () => {
  assert.deepEqual(summarizeChanges({ balancesChanged: false, hardInquiry: false }), ['No changes reported this week.']);
});

test('the §41 question set is exposed', () => {
  const keys = CHECKIN_QUESTIONS.map((q) => q.key);
  for (const k of ['balancesChanged', 'creditLimitChanged', 'newAccountOpened', 'accountClosed', 'incomeChanged', 'hardInquiry']) {
    assert.ok(keys.includes(k as any), `missing ${k}`);
  }
});
