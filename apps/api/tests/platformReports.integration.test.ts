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
  process.env.QUEUE_MODE = 'inline';
}

const ctx = {} as { prisma: any; base: string; server: any; token: string; other: string; clientId: string };

async function req(path: string, init: RequestInit = {}, tok = ctx.token) {
  const res = await fetch(`${ctx.base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}`, ...(init.headers || {}) }
  });
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, body: ct.includes('json') ? await res.json().catch(() => ({})) : await res.text() };
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
  await p.platformReport.deleteMany({});
  await p.notification.deleteMany({});
  await p.client.deleteMany({ where: { user: { email: { in: ['rep@t.com', 'rep2@t.com'] } } } });
  await p.user.deleteMany({ where: { email: { in: ['rep@t.com', 'rep2@t.com'] } } });
  const u = await p.user.create({ data: { email: 'rep@t.com', passwordHash: 'x', firstName: 'Rae', lastName: 'Port', client: { create: { status: 'ACTIVE', progress: { create: {} } } } } });
  const u2 = await p.user.create({ data: { email: 'rep2@t.com', passwordHash: 'x', firstName: 'Other', lastName: 'One', client: { create: { status: 'ACTIVE' } } } });
  ctx.clientId = (await p.client.findUniqueOrThrow({ where: { userId: u.id } })).id;
  ctx.token = jwt.sign({ sub: u.id, email: 'rep@t.com', role: 'CLIENT' }, config.jwtSecret);
  ctx.other = jwt.sign({ sub: u2.id, email: 'rep2@t.com', role: 'CLIENT' }, config.jwtSecret);
});

after(async () => {
  if (skip || !ctx.prisma) return;
  ctx.server?.close();
  await ctx.prisma.$disconnect();
  delete process.env.QUEUE_MODE;
});

test('POST /api/reports generates a readiness report inline (queue mode) and it becomes READY', { skip }, async () => {
  const post = await req('/api/reports', { method: 'POST', body: JSON.stringify({ kind: 'READINESS_REPORT' }) });
  assert.equal(post.status, 202);
  const id = post.body.report.id;

  const got = await req(`/api/reports/${id}`);
  assert.equal(got.body.status, 'READY');
  assert.ok(got.body.html.includes('CredX Readiness Report'));
  assert.ok(got.body.html.includes('not a consumer credit report'));
  assert.ok(Array.isArray(got.body.dataSources) && got.body.dataSources.length > 0);
});

test('credit profile summary also generates + carries disclosure + data sources', { skip }, async () => {
  const post = await req('/api/reports', { method: 'POST', body: JSON.stringify({ kind: 'CREDIT_PROFILE_SUMMARY' }) });
  const id = post.body.report.id;
  const got = await req(`/api/reports/${id}`);
  assert.equal(got.body.status, 'READY');
  assert.ok(got.body.html.includes('Credit Profile Summary'));
  assert.ok(got.body.html.includes('Data sources'));
  assert.ok(got.body.disclosure.includes('not a consumer credit report'));
  // No affirmative guarantee / removal-promise language.
  assert.doesNotMatch(got.body.html, /we guarantee|guaranteed (removal|deletion|approval)|will be (removed|deleted)|must be (removed|deleted)/i);
});

test('a REPORT_READY notification is produced', { skip }, async () => {
  const n = await ctx.prisma.notification.count({ where: { clientId: ctx.clientId, type: 'REPORT_READY' } });
  assert.ok(n >= 1);
});

test('GET /api/reports lists the caller\'s reports (metadata only, no html)', { skip }, async () => {
  const list = await req('/api/reports');
  assert.ok(list.body.reports.length >= 2);
  assert.ok(!('html' in list.body.reports[0]));
});

test('/view serves HTML for the owner and 404s for another client', { skip }, async () => {
  const list = await req('/api/reports');
  const id = list.body.reports[0].id;
  const view = await req(`/api/reports/${id}/view`);
  assert.equal(view.status, 200);
  assert.ok(String(view.body).startsWith('<!doctype html>'));

  const cross = await req(`/api/reports/${id}/view`, {}, ctx.other);
  assert.equal(cross.status, 404);
});

test('a duplicate pending request is reused, not re-queued', { skip }, async () => {
  // Force a PENDING row then request again.
  await ctx.prisma.platformReport.create({ data: { clientId: ctx.clientId, kind: 'READINESS_REPORT', title: 'x', disclosure: '', status: 'PENDING' } });
  const again = await req('/api/reports', { method: 'POST', body: JSON.stringify({ kind: 'READINESS_REPORT' }) });
  assert.equal(again.body.reused, true);
});

test('unauth is rejected', { skip }, async () => {
  const res = await fetch(`${ctx.base}/api/reports`);
  assert.equal(res.status, 401);
});
