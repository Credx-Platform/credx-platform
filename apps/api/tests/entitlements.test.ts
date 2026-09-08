import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAN_DEFINITIONS,
  entitlementsForPlan,
  publicPlanCatalog,
  resolveClientEntitlements
} from '../src/lib/entitlements.js';

test('every plan definition exposes the full entitlement keyset', () => {
  const keys = Object.keys(PLAN_DEFINITIONS.FREE.entitlements).sort();
  for (const plan of Object.values(PLAN_DEFINITIONS)) {
    assert.deepEqual(Object.keys(plan.entitlements).sort(), keys, `plan ${plan.code}`);
  }
});

test('public plan catalog hides the internal FREE tier', () => {
  const codes = publicPlanCatalog().map((p) => p.code);
  assert.ok(!codes.includes('FREE'));
  assert.ok(codes.includes('ESSENTIAL'));
});

test('unpaid lead gets FREE entitlements, never a paid plan', () => {
  const resolved = resolveClientEntitlements({ status: 'LEAD', serviceTier: 'PREMIUM' });
  assert.equal(resolved.plan, 'FREE');
  assert.equal(resolved.paid, false);
  assert.equal(resolved.entitlements.can_use_cesar, false);
  assert.equal(resolved.entitlements.can_use_advanced_tools, false);
  assert.equal(resolved.entitlements.can_access_dashboard, true);
});

test('analysis-stage client without payment is still FREE', () => {
  const resolved = resolveClientEntitlements({ status: 'ANALYSIS_READY', serviceTier: 'ESSENTIAL' });
  assert.equal(resolved.plan, 'FREE');
});

test('activated client resolves to their serviceTier plan', () => {
  const resolved = resolveClientEntitlements({ status: 'ACTIVE', serviceTier: 'AGGRESSIVE' });
  assert.equal(resolved.plan, 'PREMIUM');
  assert.equal(resolved.paid, true);
  assert.equal(resolved.entitlements.can_use_business_credit, true);
});

test('past-due client keeps entitlements but is flagged pastDue', () => {
  const resolved = resolveClientEntitlements({ status: 'PAST_DUE', serviceTier: 'ESSENTIAL' });
  assert.equal(resolved.plan, 'ESSENTIAL');
  assert.equal(resolved.pastDue, true);
  assert.equal(resolved.paid, true);
});

test('masterclass student resolves to MASTERCLASS regardless of serviceTier', () => {
  const byStatus = resolveClientEntitlements({ status: 'STUDENT', serviceTier: 'PREMIUM' });
  assert.equal(byStatus.plan, 'MASTERCLASS');
  const byFlag = resolveClientEntitlements({ status: 'LEAD', masterclassAccess: true });
  assert.equal(byFlag.plan, 'MASTERCLASS');
  assert.equal(byFlag.entitlements.can_use_learning_center, true);
  assert.equal(byFlag.entitlements.can_manage_dispute_workflows, false);
});

test('active subscription drives the plan even if the client status lags behind', () => {
  const resolved = resolveClientEntitlements({
    status: 'ANALYSIS_READY',
    serviceTier: 'ESSENTIAL',
    subscription: { status: 'ACTIVE', planCode: 'PREMIUM' }
  });
  assert.equal(resolved.plan, 'PREMIUM');
  assert.equal(resolved.paid, true);
  assert.equal(resolved.pastDue, false);
  assert.equal(resolved.entitlements.can_use_business_credit, true);
});

test('past-due subscription keeps entitlements and flags pastDue', () => {
  const resolved = resolveClientEntitlements({
    status: 'LEAD',
    subscription: { status: 'PAST_DUE', planCode: 'ESSENTIAL' }
  });
  assert.equal(resolved.plan, 'ESSENTIAL');
  assert.equal(resolved.paid, true);
  assert.equal(resolved.pastDue, true);
});

test('canceled/incomplete subscription does not grant a paid plan', () => {
  for (const status of ['CANCELED', 'INCOMPLETE', 'UNPAID', 'PAUSED']) {
    const resolved = resolveClientEntitlements({
      status: 'LEAD',
      serviceTier: 'PREMIUM',
      subscription: { status, planCode: 'PREMIUM' }
    });
    assert.equal(resolved.plan, 'FREE', `status ${status}`);
    assert.equal(resolved.paid, false, `status ${status}`);
  }
});

test('subscription with an unrecognized plan code falls back to status heuristic', () => {
  const resolved = resolveClientEntitlements({
    status: 'ACTIVE',
    serviceTier: 'FAMILY',
    subscription: { status: 'ACTIVE', planCode: 'GOLD_TIER_XYZ' }
  });
  assert.equal(resolved.plan, 'FAMILY');
});

test('no subscription input preserves the original status-only behavior', () => {
  const resolved = resolveClientEntitlements({ status: 'ACTIVE', serviceTier: 'ESSENTIAL', subscription: null });
  assert.equal(resolved.plan, 'ESSENTIAL');
});

test('entitlementsForPlan returns a fresh object each call', () => {
  const a = entitlementsForPlan('ESSENTIAL');
  a.can_use_cesar = false;
  assert.equal(entitlementsForPlan('ESSENTIAL').can_use_cesar, true);
});


test('terminated subscriptions cannot regain paid access from stale client lifecycle', () => {
  for (const status of ['CANCELED', 'UNPAID', 'PAUSED', 'INCOMPLETE', 'INCOMPLETE_EXPIRED']) {
    for (const lifecycle of ['ACTIVE', 'PAST_DUE']) {
      const result = resolveClientEntitlements({ status: lifecycle, serviceTier: 'AGGRESSIVE', subscription: { status, planCode: 'PREMIUM' } });
      assert.equal(result.plan, 'FREE');
      assert.equal(result.paid, false);
    }
  }
});

test('cancellation preserves a separately granted education purchase', () => {
  const result = resolveClientEntitlements({ status: 'ACTIVE', masterclassAccess: true, subscription: { status: 'CANCELED', planCode: 'PREMIUM' } });
  assert.equal(result.plan, 'MASTERCLASS');
  assert.equal(result.entitlements.can_use_business_credit, false);
});
