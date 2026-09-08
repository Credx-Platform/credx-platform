import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';

const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = TEST_DB ? false : 'TEST_DATABASE_URL not set';
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB;
  process.env.JWT_SECRET ||= 'test-secret';
  process.env.APP_URL ||= 'http://localhost:5173';
  process.env.API_URL ||= 'http://localhost:3000';
  process.env.QUEUE_MODE = 'inline'; // recompute runs synchronously in tests
}

const ctx = {} as { prisma: any; base: string; server: any; token: string; clientId: string };

async function req(path: string, init: RequestInit = {}) {
  const res = await fetch(`${ctx.base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${ctx.token}`, ...(init.headers || {}) }
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

before(async () => {
  if (skip) return;
  const jwt = (await import('jsonwebtoken')).default;
  const { config } = await import('../src/config.js');
  ctx.prisma = (await import('../src/lib/prisma.js')).prisma;
  const { createApp } = await import('../src/app.js');
  const { registerAllJobs } = await import('../src/lib/jobHandlers.js');
  registerAllJobs();
  ctx.server = createApp({ disableRateLimits: true }).listen(0);
  await new Promise((r) => ctx.server.once('listening', r));
  ctx.base = `http://127.0.0.1:${(ctx.server.address() as AddressInfo).port}`;

  const p = ctx.prisma;
  await p.weeklyCheckIn.deleteMany({});
  await p.notification.deleteMany({});
  await p.readinessScoreSnapshot.deleteMany({});
  await p.client.deleteMany({ where: { user: { email: 'ci@t.com' } } });
  await p.user.deleteMany({ where: { email: 'ci@t.com' } });
  const u = await p.user.create({ data: { email: 'ci@t.com', passwordHash: 'x', firstName: 'C', lastName: 'I', client: { create: { status: 'ACTIVE', progress: { create: {} } } } } });
  ctx.clientId = (await p.client.findUniqueOrThrow({ where: { userId: u.id } })).id;
  ctx.token = jwt.sign({ sub: u.id, email: 'ci@t.com', role: 'CLIENT' }, config.jwtSecret);
});

after(async () => {
  if (skip || !ctx.prisma) return;
  ctx.server?.close();
  await ctx.prisma.$disconnect();
  delete process.env.QUEUE_MODE;
});

test('GET /api/checkin reports the current week as due with questions', { skip }, async () => {
  const { status, body } = await req('/api/checkin');
  assert.equal(status, 200);
  assert.equal(body.due, true);
  assert.match(body.weekKey, /^\d{4}-W\d{2}$/);
  assert.ok(body.questions.length >= 6);
  assert.equal(body.current, null);
});

test('POST /api/checkin stores answers, computes a change summary, recomputes readiness', { skip }, async () => {
  const { status, body } = await req('/api/checkin', {
    method: 'POST',
    body: JSON.stringify({ balancesChanged: true, balancesNote: 'paid $400', hardInquiry: false, incomeChanged: true, incomeNote: 'raise' })
  });
  assert.equal(status, 201);
  assert.ok(body.changeSummary.some((s: string) => /paid \$400/.test(s)));
  assert.ok(body.changeSummary.some((s: string) => /income changed: raise/i.test(s)));
  assert.equal(body.readinessRecompute, 'inline');

  const snaps = await ctx.prisma.readinessScoreSnapshot.count({ where: { clientId: ctx.clientId } });
  assert.ok(snaps >= 1, 'readiness snapshot created by the recompute job');

  const notif = await ctx.prisma.notification.count({ where: { clientId: ctx.clientId, type: 'MILESTONE_REACHED' } });
  assert.ok(notif >= 1, 'milestone notification created');
});

test('a second POST in the same week updates rather than duplicates', { skip }, async () => {
  await req('/api/checkin', { method: 'POST', body: JSON.stringify({ balancesChanged: false }) });
  const rows = await ctx.prisma.weeklyCheckIn.count({ where: { clientId: ctx.clientId } });
  assert.equal(rows, 1);
  const now = await req('/api/checkin');
  assert.equal(now.body.due, false);
  assert.equal(now.body.current.answers.balancesChanged, false);
});

test('history lists the week', { skip }, async () => {
  const { body } = await req('/api/checkin/history');
  assert.ok(body.checkIns.length >= 1);
});

test('unauth is rejected', { skip }, async () => {
  const res = await fetch(`${ctx.base}/api/checkin`);
  assert.equal(res.status, 401);
});
