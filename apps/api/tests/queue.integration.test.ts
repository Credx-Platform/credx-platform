import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const db = process.env.TEST_DATABASE_URL;
const skip = db ? false : 'TEST_DATABASE_URL not set';
if (db) process.env.DATABASE_URL = db;

let p: any;
let queue: typeof import('../src/lib/queue.js');
const queueName = `billing-${randomUUID()}`;

before(async () => {
  if (skip) return;
  p = (await import('../src/lib/prisma.js')).prisma;
  queue = await import('../src/lib/queue.js');
});

after(async () => {
  if (!p) return;
  await p.jobQueue.deleteMany({ where: { queueName } });
  await p.workerHeartbeat.deleteMany({ where: { workerId: { startsWith: `${queueName}-` } } });
  await p.$disconnect();
});

test('concurrent queue claims can only assign one worker to one pending job', { skip }, async () => {
  await p.jobQueue.create({
    data: {
      queueName,
      jobName: 'unit-race',
      payload: {},
      status: 'PENDING',
      maxAttempts: 5
    }
  });

  const claims = await Promise.all(
    Array.from({ length: 12 }, (_, i) => queue.claimNextJob(queueName as any, `${queueName}-worker-${i}`))
  );
  const claimed = claims.filter(Boolean);
  assert.equal(claimed.length, 1);
  assert.equal(await p.jobQueue.count({ where: { queueName, status: 'ACTIVE' } }), 1);
});

test('job completion/failure rolls up worker counters and stale heartbeat cleanup is metadata-only', { skip }, async () => {
  const workerId = `${queueName}-counter`;
  await queue.heartbeatWorker(workerId, 'billing', 'test-host');
  const ok = await p.jobQueue.create({ data: { queueName, jobName: 'unit-ok', payload: {}, status: 'ACTIVE', workerId } });
  const failed = await p.jobQueue.create({ data: { queueName, jobName: 'unit-fail', payload: {}, status: 'ACTIVE', workerId, attempts: 3, maxAttempts: 3 } });

  await queue.completeJob(ok.id, { ok: true });
  await queue.failJob(failed.id, 'boom');

  const beat = await p.workerHeartbeat.findUniqueOrThrow({ where: { workerId } });
  assert.equal(beat.jobsProcessed, 1);
  assert.equal(beat.jobsFailed, 1);

  await p.workerHeartbeat.update({ where: { workerId }, data: { lastBeat: new Date('2020-01-01T00:00:00.000Z') } });
  assert.equal(await queue.cleanupStaleWorkerHeartbeats(1), 1);
  assert.equal(await p.jobQueue.count({ where: { id: { in: [ok.id, failed.id] } } }), 2);
});
