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
  // No AI_GATEWAY_API_KEY -> LLM path is a no-op; Cesar must still answer.
  delete process.env.AI_GATEWAY_API_KEY;
  process.env.AI_BUDGET_FREE = '100'; // tiny budget so we can exhaust it
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
  ctx.server = createApp({ disableRateLimits: true }).listen(0);
  await new Promise((r) => ctx.server.once('listening', r));
  ctx.base = `http://127.0.0.1:${(ctx.server.address() as AddressInfo).port}`;

  const p = ctx.prisma;
  await p.aiUsageEvent.deleteMany({});
  await p.client.deleteMany({ where: { user: { email: 'ai@t.com' } } });
  await p.user.deleteMany({ where: { email: 'ai@t.com' } });
  const u = await p.user.create({ data: { email: 'ai@t.com', passwordHash: 'x', firstName: 'A', lastName: 'I', client: { create: { status: 'LEAD', progress: { create: {} } } } } });
  ctx.clientId = (await p.client.findUniqueOrThrow({ where: { userId: u.id } })).id;
  ctx.token = jwt.sign({ sub: u.id, email: 'ai@t.com', role: 'CLIENT' }, config.jwtSecret);
});

after(async () => {
  if (skip || !ctx.prisma) return;
  ctx.server?.close();
  await ctx.prisma.$disconnect();
  delete process.env.AI_BUDGET_FREE;
});

test('GET /api/ai/usage reports the FREE plan budget + zero usage', { skip }, async () => {
  const { status, body } = await req('/api/ai/usage');
  assert.equal(status, 200);
  assert.equal(body.plan, 'FREE');
  assert.equal(body.budgetTokens, 100);
  assert.equal(body.usedTokens, 0);
  assert.equal(body.allowed, true);
});

test('Cesar still answers (deterministic path) with the AI provider unconfigured', { skip }, async () => {
  const { status, body } = await req('/api/cesar/chat', { method: 'POST', body: JSON.stringify({ message: 'how do I start?' }) });
  assert.equal(status, 200);
  assert.ok(body.html && body.reply);
  assert.ok(Array.isArray(body.guardrails) && body.guardrails.some((g: string) => /does not guarantee/i.test(g)));
});

test('once usage exceeds the plan budget, /api/ai/usage flags not-allowed', { skip }, async () => {
  await ctx.prisma.aiUsageEvent.create({
    data: { task: 'cesar_chat', model: 'test', clientId: ctx.clientId, totalTokens: 250, promptTokens: 200, completionTokens: 50, ok: true }
  });
  const { body } = await req('/api/ai/usage');
  assert.equal(body.usedTokens, 250);
  assert.equal(body.remainingTokens, 0);
  assert.equal(body.allowed, false);
});

test('admin AI cost summary aggregates the ledger', { skip }, async () => {
  const jwt = (await import('jsonwebtoken')).default;
  const { config } = await import('../src/config.js');
  const p = ctx.prisma;
  const admin = await p.user.upsert({
    where: { email: 'aiadmin@t.com' },
    update: { role: 'ADMIN' },
    create: { email: 'aiadmin@t.com', passwordHash: 'x', firstName: 'Ad', lastName: 'Min', role: 'ADMIN' }
  });
  const adminTok = jwt.sign({ sub: admin.id, email: 'aiadmin@t.com', role: 'ADMIN' }, config.jwtSecret);
  const res = await fetch(`${ctx.base}/api/monitoring/ai`, { headers: { authorization: `Bearer ${adminTok}` } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.totals.totalTokens >= 250);
  assert.ok(body.byTask.some((t: any) => t.task === 'cesar_chat'));
});
