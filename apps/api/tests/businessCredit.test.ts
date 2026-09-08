import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessBusinessCreditFoundation, BUSINESS_CREDIT_DISCLOSURE } from '../src/lib/businessCredit.js';

test('assessment carries the no-guarantee disclosure', () => {
  const r = assessBusinessCreditFoundation(null, []);
  assert.equal(r.disclosure, BUSINESS_CREDIT_DISCLOSURE);
  assert.match(r.disclosure, /does not guarantee/i);
});

test('empty profile → not_started, foundation items all incomplete', () => {
  const r = assessBusinessCreditFoundation(null, []);
  assert.equal(r.stage, 'not_started');
  assert.equal(r.completed, 0);
  assert.equal(r.total, r.foundation.length);
  assert.ok(r.nextSteps.length > 0);
});

test('profile fields and open reporting vendors advance the stage', () => {
  const r = assessBusinessCreditFoundation(
    {
      legalName: 'Acme LLC', entityType: 'LLC', einStatus: 'issued',
      businessAddress: '1 Main St', businessPhone: '555-0100',
      businessEmail: 'ops@acme.com', businessDomain: 'acme.com',
      hasBankAccount: true, dunsNumber: '123456789'
    },
    [
      { status: 'OPEN', reportsTo: ['dnb'] },
      { status: 'OPEN', reportsTo: ['experian_business'] },
      { status: 'OPEN', reportsTo: [] }
    ]
  );
  assert.ok(r.completed >= 8);
  assert.ok(['building', 'established'].includes(r.stage));
  assert.equal(r.foundation.find((i) => i.key === 'ein_issued')?.done, true);
  assert.equal(r.foundation.find((i) => i.key === 'starter_vendors')?.done, true);
  assert.equal(r.foundation.find((i) => i.key === 'reporting_vendors')?.done, true);
});

test('manual checklist override can mark an item done', () => {
  const r = assessBusinessCreditFoundation({ checklist: [{ key: 'duns', done: true }] }, []);
  assert.equal(r.foundation.find((i) => i.key === 'duns')?.done, true);
});
