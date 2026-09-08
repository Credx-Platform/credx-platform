import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessFundingReadiness, FUNDING_DISCLOSURE } from '../src/lib/fundingReadiness.js';

test('assessment always carries the no-guarantee disclosure', () => {
  const r = assessFundingReadiness({}, null);
  assert.equal(r.disclosure, FUNDING_DISCLOSURE);
  assert.match(r.disclosure, /does not guarantee approval or funding/i);
});

test('empty client lands in the "early" band with attention next steps', () => {
  const r = assessFundingReadiness({}, null);
  assert.equal(r.readiness.band, 'early');
  assert.ok(r.indicators.length === 5);
  assert.ok(r.checklist.length >= 8);
  assert.ok(r.documentChecklist.length >= 5);
  assert.ok(r.nextSteps.length > 0);
});

test('strong utilization + no derogatories + income improves the band', () => {
  const r = assessFundingReadiness(
    {
      currentAddressLine1: '1 Main', currentCity: 'Newark', currentState: 'NJ', currentPostalCode: '07102',
      creditReports: [{ score: 730, tradelines: [{ accountType: 'credit card', status: 'open' }, { accountType: 'auto', status: 'open' }, { accountType: 'card', status: 'open' }] }],
      progress: { analysis: { summaryTiles: { utilization: '8%', inquiries: 1 } } }
    },
    { objective: 'auto', targetAmount: 20000, monthlyIncome: 6000, incomeType: 'w2' }
  );
  const util = r.indicators.find((i) => i.key === 'utilization');
  assert.equal(util?.status, 'strong');
  assert.ok(['approaching', 'well_positioned', 'developing'].includes(r.readiness.band));
  assert.equal(r.objective, 'auto');
  assert.equal(r.targetAmount, 20000);
});

test('high utilization + derogatories flag attention without promising outcomes', () => {
  const r = assessFundingReadiness(
    {
      creditReports: [{ tradelines: [{ accountType: 'card', status: '60 days late', isNegative: true }] }],
      progress: {
        analysis: {
          utilization: 0.75,
          accounts: [
            { accountType: 'collection', isNegative: true },
            { accountType: 'charge-off', isNegative: true },
            { accountType: 'collection', negative: true }
          ]
        }
      }
    },
    null
  );
  assert.equal(r.indicators.find((i) => i.key === 'utilization')?.status, 'attention');
  assert.equal(r.indicators.find((i) => i.key === 'derogatory')?.status, 'attention');
  for (const step of r.nextSteps) {
    assert.doesNotMatch(step, /guarantee|approved|pre-?approv/i);
  }
});

test('stored checklist state is respected and goal auto-marks', () => {
  const r = assessFundingReadiness({}, {
    objective: 'personal_loan',
    targetAmount: 5000,
    checklist: [{ key: 'lender_research', done: true }]
  });
  assert.equal(r.checklist.find((c) => c.key === 'lender_research')?.done, true);
  assert.equal(r.checklist.find((c) => c.key === 'goal_defined')?.done, true);
});
