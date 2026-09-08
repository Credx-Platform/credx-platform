import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subscriptionLifecycleEvent } from '../src/lib/billingWebhooks.js';

const live = (planCode: string | null = 'ESSENTIAL') => ({ status: 'active', planCode });
const dead = (planCode: string | null = 'ESSENTIAL') => ({ status: 'canceled', planCode });

test('first entitled reconciliation reports a start', () => {
  assert.equal(subscriptionLifecycleEvent(null, live()), 'subscription_started');
});

test('trialing and past_due still count as entitled, not a cancellation', () => {
  assert.equal(subscriptionLifecycleEvent(null, { status: 'trialing', planCode: 'PREMIUM' }), 'subscription_started');
  assert.equal(subscriptionLifecycleEvent(live(), { status: 'past_due', planCode: 'ESSENTIAL' }), null);
});

test('leaving an entitled state reports a cancellation', () => {
  assert.equal(subscriptionLifecycleEvent(live(), dead()), 'subscription_cancelled');
  assert.equal(subscriptionLifecycleEvent(live(), { status: 'unpaid', planCode: 'ESSENTIAL' }), 'subscription_cancelled');
});

test('changing plan while entitled reports an upgrade', () => {
  assert.equal(subscriptionLifecycleEvent(live('ESSENTIAL'), live('PREMIUM')), 'subscription_upgraded');
});

test('an unchanged renewal reports nothing', () => {
  assert.equal(subscriptionLifecycleEvent(live('PREMIUM'), live('PREMIUM')), null);
});

test('a redelivered cancellation does not report twice', () => {
  // Stripe retries and out-of-order deliveries must not manufacture a second
  // cancellation once the local record is already in a non-entitled state.
  assert.equal(subscriptionLifecycleEvent(dead(), dead()), null);
});

test('status casing from the provider is not trusted', () => {
  assert.equal(subscriptionLifecycleEvent(null, { status: 'ACTIVE', planCode: 'FAMILY' }), 'subscription_started');
});

test('reactivation after cancellation reports a start, not an upgrade', () => {
  assert.equal(subscriptionLifecycleEvent(dead('ESSENTIAL'), live('PREMIUM')), 'subscription_started');
});
