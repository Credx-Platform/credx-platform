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
}

const ctx = {} as { prisma: any; base: string; server: any; token: string; clientId: string };

async function apiReq(path: string, init: RequestInit = {}) {
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
  ctx.server = (createApp({ disableRateLimits: true })).listen(0);
  await new Promise((r) => ctx.server.once('listening', r));
  ctx.base = `http://127.0.0.1:${(ctx.server.address() as AddressInfo).port}`;

  const p = ctx.prisma;
  await p.fundingReadinessProfile.deleteMany({});
  await p.client.deleteMany({ where: { user: { email: 'fund@test.com' } } });
  await p.user.deleteMany({ where: { email: 'fund@test.com' } });
  const user = await p.user.create({
    data: { email: 'fund@test.com', passwordHash: 'x', firstName: 'F', lastName: 'U', client: { create: { status: 'ACTIVE', serviceTier: 'AGGRESSIVE' } } }
  });
  ctx.clientId = (await p.client.findUniqueOrThrow({ where: { userId: user.id } })).id;
  ctx.token = jwt.sign({ sub: user.id, email: 'fund@test.com', role: 'CLIENT' }, config.jwtSecret);
});

after(async () => {
  if (skip || !ctx.prisma) return;
  ctx.server?.close();
  await ctx.prisma.$disconnect();
});

test('GET creates the profile lazily and returns an assessment with disclosure', { skip }, async () => {
  const { status, body } = await apiReq('/api/funding-readiness');
  assert.equal(status, 200);
  assert.match(body.assessment.disclosure, /does not guarantee approval or funding/i);
  assert.equal(body.assessment.indicators.length, 5);
  const row = await ctx.prisma.fundingReadinessProfile.findUnique({ where: { clientId: ctx.clientId } });
  assert.ok(row, 'profile persisted');
  assert.ok(row.lastAssessedAt);
});

test('PUT stores the objective + target and feeds the assessment', { skip }, async () => {
  const { status, body } = await apiReq('/api/funding-readiness', {
    method: 'PUT',
    body: JSON.stringify({ objective: 'auto', targetAmount: 18000, targetTimeframe: '6_months', monthlyIncome: 5200, incomeType: 'w2' })
  });
  assert.equal(status, 200);
  assert.equal(body.profile.objective, 'auto');
  assert.equal(body.profile.targetAmount, 18000);
  assert.equal(body.assessment.objective, 'auto');
});

test('PUT rejects an unknown objective', { skip }, async () => {
  const { status } = await apiReq('/api/funding-readiness', { method: 'PUT', body: JSON.stringify({ objective: 'yacht' }) });
  assert.equal(status, 400);
});

test('PATCH /checklist toggles an item and it survives a reload', { skip }, async () => {
  const patch = await apiReq('/api/funding-readiness/checklist', { method: 'PATCH', body: JSON.stringify({ key: 'lender_research', done: true }) });
  assert.equal(patch.status, 200);
  const get = await apiReq('/api/funding-readiness');
  assert.equal(get.body.assessment.checklist.find((c: any) => c.key === 'lender_research')?.done, true);
});

test('PATCH /documents marks a document provided', { skip }, async () => {
  const patch = await apiReq('/api/funding-readiness/documents', { method: 'PATCH', body: JSON.stringify({ key: 'proof_income', provided: true }) });
  assert.equal(patch.status, 200);
  assert.equal(patch.body.assessment.documentChecklist.find((d: any) => d.key === 'proof_income')?.provided, true);
});

test('no auth token is rejected', { skip }, async () => {
  const res = await fetch(`${ctx.base}/api/funding-readiness`);
  assert.equal(res.status, 401);
});


test('paid module rejects free clients on reads and writes', { skip }, async () => {
  const client = await ctx.prisma.client.findFirstOrThrow({ where: { user: { email: 'fund@test.com' } } });
  await ctx.prisma.client.update({ where: { id: client.id }, data: { status: 'LEAD' } });
  try {
    for (const method of ['GET', 'PUT']) {
      const result = await apiReq('/api/funding-readiness', { method, ...(method === 'PUT' ? { body: '{}' } : {}) });
      assert.equal(result.status, 403);
      assert.equal(result.body.code, 'ENTITLEMENT_REQUIRED');
    }
  } finally {
    await ctx.prisma.client.update({ where: { id: client.id }, data: { status: 'ACTIVE' } });
  }
});
