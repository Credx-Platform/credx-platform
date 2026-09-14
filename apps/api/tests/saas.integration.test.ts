import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';

const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = TEST_DB ? false : 'TEST_DATABASE_URL not set';
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB;
  process.env.JWT_SECRET ||= 'test-secret';
}

const ctx = {} as { prisma: any; base: string; server: any; one: string; two: string; oneClient: string; twoClient: string };
async function req(token: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${ctx.base}${path}`, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

before(async () => {
  if (skip) return;
  const jwt = (await import('jsonwebtoken')).default;
  const { config } = await import('../src/config.js');
  ctx.prisma = (await import('../src/lib/prisma.js')).prisma;
  const { createApp } = await import('../src/app.js');
  ctx.server = createApp({ disableRateLimits: true }).listen(0);
  await new Promise((resolve) => ctx.server.once('listening', resolve));
  ctx.base = `http://127.0.0.1:${(ctx.server.address() as AddressInfo).port}`;
  const p = ctx.prisma;
  await p.client.deleteMany({ where: { user: { email: { in: ['saas-one@test.invalid', 'saas-two@test.invalid'] } } } });
  await p.user.deleteMany({ where: { email: { in: ['saas-one@test.invalid', 'saas-two@test.invalid'] } } });
  const one = await p.user.create({ data: { email: 'saas-one@test.invalid', passwordHash: 'x', firstName: 'One', lastName: 'Test', client: { create: { status: 'ACTIVE', progress: { create: {} } } } } });
  const two = await p.user.create({ data: { email: 'saas-two@test.invalid', passwordHash: 'x', firstName: 'Two', lastName: 'Test', client: { create: { status: 'ACTIVE', progress: { create: {} } } } } });
  ctx.oneClient = (await p.client.findUniqueOrThrow({ where: { userId: one.id } })).id;
  ctx.twoClient = (await p.client.findUniqueOrThrow({ where: { userId: two.id } })).id;
  ctx.one = jwt.sign({ sub: one.id, email: one.email, role: 'CLIENT' }, config.jwtSecret);
  ctx.two = jwt.sign({ sub: two.id, email: two.email, role: 'CLIENT' }, config.jwtSecret);
});

after(async () => { if (skip || !ctx.prisma) return; ctx.server?.close(); await ctx.prisma.$disconnect(); });

test('durable state writes reload across fresh requests and enforce ownership', { skip }, async () => {
  assert.equal((await req(ctx.one, '/api/saas/onboarding', { method: 'PUT', body: JSON.stringify({ goals: ['funding'], currentStep: 'profile' }) })).status, 200);
  assert.equal((await req(ctx.one, '/api/saas/action-plan/prepare', { method: 'PUT', body: JSON.stringify({ title: 'Prepare documents', priority: 'HIGH', status: 'OPEN' }) })).status, 200);
  assert.equal((await req(ctx.one, '/api/saas/milestones/first-goal', { method: 'PUT', body: JSON.stringify({ title: 'First goal', achieved: false }) })).status, 200);
  assert.equal((await req(ctx.one, '/api/saas/lessons/day-1/complete', { method: 'POST', body: JSON.stringify({ metadata: { source: 'test' } }) })).status, 201);
  assert.equal((await req(ctx.one, '/api/saas/quizzes/day-1/results', { method: 'POST', body: JSON.stringify({ score: 90, passed: true, answers: { q1: 1 } }) })).status, 201);
  const conversation = await req(ctx.one, '/api/saas/conversations', { method: 'POST', body: JSON.stringify({ title: 'Private' }) });
  assert.equal(conversation.status, 201);
  const id = conversation.body.conversation.id;
  assert.equal((await req(ctx.one, `/api/saas/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify({ role: 'user', content: 'hello' }) })).status, 201);
  assert.equal((await req(ctx.two, `/api/saas/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify({ role: 'user', content: 'cross-account' }) })).status, 404);
  const reloaded = await req(ctx.one, '/api/saas/state');
  assert.equal(reloaded.status, 200);
  assert.equal(reloaded.body.onboarding.currentStep, 'profile');
  assert.equal(reloaded.body.actionPlan[0].key, 'prepare');
  assert.ok(reloaded.body.lessons.some((row: any) => row.lessonKey === 'day-1'));
  assert.equal(reloaded.body.conversations[0].messages[0].content, 'hello');
  const other = await req(ctx.two, '/api/saas/state');
  assert.equal(other.body.lessons.length, 0);
  assert.equal(other.body.conversations.length, 0);
  assert.equal((await req(ctx.one, '/api/saas/export', { method: 'POST', body: '{}' })).status, 201);
  assert.equal((await req(ctx.one, '/api/saas/deletion', { method: 'POST', body: JSON.stringify({ reason: 'test' }) })).status, 201);
  const oneUser = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'saas-one@test.invalid' } });
  const auditCount = await ctx.prisma.auditLog.count({ where: { userId: oneUser.id, action: { startsWith: 'SAAS_' } } });
  assert.ok(auditCount >= 9);
});

test('workflow optimistic concurrency rejects stale writers', { skip }, async () => {
  const first = await req(ctx.one, '/api/saas/workflow', { method: 'PUT', body: JSON.stringify({ stage: 'goals', state: { ready: false } }) });
  assert.equal(first.status, 200);
  assert.equal(first.body.workflow.version, 1);
  const second = await req(ctx.one, '/api/saas/workflow', { method: 'PUT', body: JSON.stringify({ stage: 'profile', state: { ready: true }, expectedVersion: 1 }) });
  assert.equal(second.status, 200);
  assert.equal(second.body.workflow.version, 2);
  const stale = await req(ctx.one, '/api/saas/workflow', { method: 'PUT', body: JSON.stringify({ stage: 'stale', state: {}, expectedVersion: 1 }) });
  assert.equal(stale.status, 409);
});
