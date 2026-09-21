import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withCesarAccess } from '../src/lib/ai/cesarAccess.js';
import { resolveClientEntitlements } from '../src/lib/entitlements.js';

for (const status of ['LEAD', 'CANCELED', 'MASTERCLASS']) {
  test(`${status} cannot invoke paid Cesar even with a premium service tier`, async () => {
    const access = resolveClientEntitlements({
      status: status === 'LEAD' ? 'LEAD' : 'ACTIVE', serviceTier: 'PREMIUM',
      subscription: status === 'LEAD' ? undefined : { status: status === 'CANCELED' ? 'CANCELED' : 'ACTIVE', planCode: status === 'MASTERCLASS' ? 'MASTERCLASS' : 'PREMIUM' }
    });
    let calls = 0;
    const result = await withCesarAccess({ user: {}, clientId: 'client', canUseCesar: access.entitlements.can_use_cesar },
      async () => { calls++; return { allowed: true }; }, async () => { calls++; return 'paid'; });
    assert.deepEqual(result, { fail: 'entitlement' });
    assert.equal(calls, 0);
  });
}

test('anonymous and non-client users cannot invoke or meter paid Cesar', async () => {
  for (const context of [{ user: null, clientId: 'client', canUseCesar: true }, { user: {}, clientId: null, canUseCesar: true }]) {
    assert.deepEqual(await withCesarAccess(context, async () => { throw new Error('quota called'); }, async () => { throw new Error('provider called'); }), { fail: 'entitlement' });
  }
});

test('eligible client is metered before invocation; denial and accounting errors fail closed', async () => {
  const access = resolveClientEntitlements({ status: 'ACTIVE', serviceTier: 'PREMIUM' });
  const context = { user: {}, clientId: 'client', canUseCesar: access.entitlements.can_use_cesar };
  let calls = 0;
  const invoke = async () => { calls++; return 'paid'; };
  assert.deepEqual(await withCesarAccess(context, async () => ({ allowed: false }), invoke), { fail: 'quota' });
  await assert.rejects(withCesarAccess(context, async () => { throw new Error('database unavailable'); }, invoke));
  assert.equal(calls, 0);
  assert.equal(await withCesarAccess(context, async (id) => { assert.equal(id, 'client'); return { allowed: true }; }, invoke), 'paid');
  assert.equal(calls, 1);
});
