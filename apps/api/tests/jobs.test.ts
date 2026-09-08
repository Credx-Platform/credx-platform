import { test } from 'node:test';
import assert from 'node:assert/strict';

// Force the synchronous path so these tests never touch a database.
process.env.QUEUE_MODE = 'inline';

const { registerJob, getJob, dispatchJob, enqueueJob, registeredJobNames } = await import('../src/lib/jobs.js');

test('registerJob + getJob round-trips a handler by queue and name', () => {
  registerJob({ queue: 'reports', name: 'unit-echo', handler: async (p) => ({ echoed: p.value }) });
  const def = getJob('reports', 'unit-echo');
  assert.ok(def);
  assert.equal(def!.queue, 'reports');
  assert.ok(registeredJobNames().includes('reports:unit-echo'));
});

test('dispatchJob runs the registered handler and returns its result', async () => {
  registerJob({ queue: 'reports', name: 'unit-double', handler: async (p) => ({ doubled: Number(p.n) * 2 }) });
  const result = await dispatchJob('reports', 'unit-double', { n: 21 });
  assert.deepEqual(result, { doubled: 42 });
});

test('dispatchJob throws for an unknown job', async () => {
  await assert.rejects(() => dispatchJob('reports', 'does-not-exist', {}), /No handler registered/);
});

test('enqueueJob runs inline under QUEUE_MODE=inline and reports status', async () => {
  let ran = false;
  registerJob({ queue: 'notifications', name: 'unit-inline', handler: async () => { ran = true; } });
  const res = await enqueueJob('notifications', 'unit-inline', {});
  assert.equal(res.status, 'inline');
  assert.equal(ran, true);
});

test('enqueueJob never throws when the handler fails — it reports dropped', async () => {
  registerJob({ queue: 'notifications', name: 'unit-boom', handler: async () => { throw new Error('boom'); } });
  const res = await enqueueJob('notifications', 'unit-boom', {});
  assert.equal(res.status, 'dropped');
  assert.match(res.error ?? '', /boom/);
});
