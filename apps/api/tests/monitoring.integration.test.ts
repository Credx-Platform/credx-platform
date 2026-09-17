import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';

const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = TEST_DB ? false : 'TEST_DATABASE_URL not set';
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB;
  process.env.JWT_SECRET ||= 'test-secret';
  process.env.APP_URL ||= 'http://localhost:5173';
  process.env.API_URL ||= 'http://localhost:3000';
  process.env.PII_ENCRYPTION_KEY ||= randomBytes(32).toString('base64');
}

const EMAIL = 'monitoring-client@t.com';
const ctx = {} as { prisma: any; base: string; server: any; token: string; clientId: string };

async function req(path: string, init: RequestInit & { token?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  const res = await fetch(`${ctx.base}${path}`, { ...init, headers });
  const text = await res.text();
  return { status: res.status, contentType: res.headers.get('content-type') ?? '', body: text ? JSON.parse(text) : null };
}

async function removeTestUser() {
  await ctx.prisma.client.deleteMany({ where: { user: { email: EMAIL } } });
  await ctx.prisma.user.deleteMany({ where: { email: EMAIL } });
}

async function onboarding() {
  const row = await ctx.prisma.clientProgress.findUniqueOrThrow({ where: { clientId: ctx.clientId } });
  return row.onboarding as Record<string, any>;
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

  await removeTestUser();
  const user = await ctx.prisma.user.create({
    data: {
      email: EMAIL,
      passwordHash: 'x',
      firstName: 'Mo',
      lastName: 'Nitor',
      role: 'CLIENT',
      client: { create: { portalRestricted: true, progress: { create: {} } } }
    },
    include: { client: true }
  });
  ctx.clientId = user.client.id;
  ctx.token = jwt.sign({ sub: user.id, role: 'CLIENT' }, config.jwtSecret);
});

after(async () => {
  if (skip || !ctx.prisma) return;
  await removeTestUser();
  ctx.server?.close();
  await ctx.prisma.$disconnect();
});

test('POST /api/monitoring requires auth and answers with JSON', { skip }, async () => {
  const res = await req('/api/monitoring', { method: 'POST', body: JSON.stringify({ provider: 'MyFreeScoreNow' }) });
  assert.equal(res.status, 401);
  assert.match(res.contentType, /application\/json/);
});

test('POST /api/monitoring without credentials completes onboarding', { skip }, async () => {
  const res = await req('/api/monitoring', { method: 'POST', token: ctx.token, body: JSON.stringify({ provider: 'MyFreeScoreNow', username: '', password: '' }) });
  assert.equal(res.status, 200);
  assert.match(res.contentType, /application\/json/);
  assert.equal(res.body.monitoring.status, 'pending_credentials');
  assert.equal(res.body.monitoring.hasCredentials, false);

  const ob = await onboarding();
  assert.equal(ob.status, 'completed');
  assert.equal(ob.monitoringProvider, 'MyFreeScoreNow');
  assert.equal(ob.monitoringPasswordEncrypted, null);
  const client = await ctx.prisma.client.findUniqueOrThrow({ where: { id: ctx.clientId }, include: { progress: true } });
  assert.equal(client.portalRestricted, false);
  assert.equal((client.progress.workflow as any).stage, 'portal_unlocked');
});

test('POST /api/monitoring with credentials stores the password encrypted', { skip }, async () => {
  const { decryptPII } = await import('../src/lib/encryption.js');
  const res = await req('/api/monitoring', { method: 'POST', token: ctx.token, body: JSON.stringify({ provider: 'MyFreeScoreNow', username: 'mo@t.com', password: 'S3cret-pass!' }) });
  assert.equal(res.status, 200);
  assert.equal(res.body.monitoring.status, 'submitted');
  assert.equal(res.body.monitoring.hasCredentials, true);

  const ob = await onboarding();
  assert.equal(ob.monitoringUsername, 'mo@t.com');
  assert.match(ob.monitoringPasswordEncrypted, /^gcm\.v1:/);
  assert.equal(decryptPII(ob.monitoringPasswordEncrypted), 'S3cret-pass!');
  assert.ok(!JSON.stringify(res.body).includes('S3cret-pass!'), 'response never echoes the password');
});

test('POST /api/monitoring/skip clears credentials; /complete reports status', { skip }, async () => {
  const skipped = await req('/api/monitoring/skip', { method: 'POST', token: ctx.token });
  assert.equal(skipped.status, 200);
  assert.equal(skipped.body.skipped, true);
  const ob = await onboarding();
  assert.equal(ob.monitoringPasswordEncrypted, null);
  assert.ok(ob.monitoringSkippedAt);

  const complete = await req('/api/monitoring/complete', { method: 'POST', token: ctx.token });
  assert.equal(complete.status, 200);
  assert.equal(complete.body.status, 'onboarding_complete');
  assert.equal(complete.body.lead_id, ctx.clientId);
});

test('admin monitoring routes still require STAFF/ADMIN', { skip }, async () => {
  const res = await req('/api/monitoring/queues', { token: ctx.token });
  assert.equal(res.status, 403);
});
