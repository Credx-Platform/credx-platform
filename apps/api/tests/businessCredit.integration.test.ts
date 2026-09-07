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

const ctx = {} as { prisma: any; base: string; server: any; token: string; otherToken: string };

async function apiReq(path: string, init: RequestInit = {}, tok = ctx.token) {
  const res = await fetch(`${ctx.base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}`, ...(init.headers || {}) }
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

before(async () => {
  if (skip) return;
  const jwt = (await import('jsonwebtoken')).default;
  const { config } = await import('../src/config.js');
  ctx.prisma = (await import('../src/lib/prisma.js')).prisma;
  const { createApp } = await import('../src/app.js');
  ctx.server = createApp({ disableRateLimits: true }).listen(0);
  await new Promise((r) => ctx.server.once('listening', r));
  ctx.base = `http://127.0.0.1:${(ctx.server.address() as AddressInfo).port}`;

  const p = ctx.prisma;
  await p.businessVendorAccount.deleteMany({});
  await p.businessTradeline.deleteMany({});
  await p.businessCreditProfile.deleteMany({});
  await p.client.deleteMany({ where: { user: { email: { in: ['biz@test.com', 'biz2@test.com'] } } } });
  await p.user.deleteMany({ where: { email: { in: ['biz@test.com', 'biz2@test.com'] } } });

  const u1 = await p.user.create({ data: { email: 'biz@test.com', passwordHash: 'x', firstName: 'B', lastName: 'One', client: { create: { status: 'ACTIVE' } } } });
  const u2 = await p.user.create({ data: { email: 'biz2@test.com', passwordHash: 'x', firstName: 'B', lastName: 'Two', client: { create: { status: 'ACTIVE' } } } });
  ctx.token = jwt.sign({ sub: u1.id, email: 'biz@test.com', role: 'CLIENT' }, config.jwtSecret);
  ctx.otherToken = jwt.sign({ sub: u2.id, email: 'biz2@test.com', role: 'CLIENT' }, config.jwtSecret);
});

after(async () => {
  if (skip || !ctx.prisma) return;
  ctx.server?.close();
  await ctx.prisma.$disconnect();
});

test('GET lazily creates the profile and returns a foundation assessment', { skip }, async () => {
  const { status, body } = await apiReq('/api/business-credit');
  assert.equal(status, 200);
  assert.match(body.assessment.disclosure, /does not guarantee/i);
  assert.equal(body.assessment.stage, 'not_started');
});

test('PUT updates entity fields and advances the foundation', { skip }, async () => {
  const { status, body } = await apiReq('/api/business-credit', {
    method: 'PUT',
    body: JSON.stringify({ legalName: 'Acme LLC', entityType: 'LLC', einStatus: 'issued', hasBankAccount: true })
  });
  assert.equal(status, 200);
  assert.equal(body.profile.entityType, 'LLC');
  assert.equal(body.assessment.foundation.find((i: any) => i.key === 'ein_issued').done, true);
});

test('PUT rejects an invalid einLast4', { skip }, async () => {
  const { status } = await apiReq('/api/business-credit', { method: 'PUT', body: JSON.stringify({ einLast4: '12345' }) });
  assert.equal(status, 400);
});

test('vendor accounts: create, list, update status, delete', { skip }, async () => {
  const created = await apiReq('/api/business-credit/vendors', {
    method: 'POST', body: JSON.stringify({ vendorName: 'Uline', accountType: 'net_30', reportsTo: ['dnb'] })
  });
  assert.equal(created.status, 201);
  const vId = created.body.vendorAccounts[0].id;

  const upd = await apiReq(`/api/business-credit/vendors/${vId}`, { method: 'PATCH', body: JSON.stringify({ status: 'OPEN' }) });
  assert.equal(upd.body.vendorAccounts[0].status, 'OPEN');

  const del = await apiReq(`/api/business-credit/vendors/${vId}`, { method: 'DELETE' });
  assert.equal(del.status, 200);
  assert.equal(del.body.vendorAccounts.length, 0);
});

test('a client cannot touch another client\'s vendor account', { skip }, async () => {
  const created = await apiReq('/api/business-credit/vendors', { method: 'POST', body: JSON.stringify({ vendorName: 'Grainger' }) });
  const vId = created.body.vendorAccounts[0].id;
  const cross = await apiReq(`/api/business-credit/vendors/${vId}`, { method: 'PATCH', body: JSON.stringify({ status: 'OPEN' }) }, ctx.otherToken);
  assert.equal(cross.status, 404);
});

test('tradelines: create + delete', { skip }, async () => {
  const created = await apiReq('/api/business-credit/tradelines', {
    method: 'POST', body: JSON.stringify({ creditorName: 'Business Card Co', creditLimit: 5000, status: 'current' })
  });
  assert.equal(created.status, 201);
  const tId = created.body.tradelines[0].id;
  const del = await apiReq(`/api/business-credit/tradelines/${tId}`, { method: 'DELETE' });
  assert.equal(del.status, 200);
  assert.equal(del.body.tradelines.length, 0);
});

test('no auth token is rejected', { skip }, async () => {
  const res = await fetch(`${ctx.base}/api/business-credit`);
  assert.equal(res.status, 401);
});
