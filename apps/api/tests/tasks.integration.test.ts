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

const ctx = {} as {
  prisma: any; base: string; server: any;
  adminToken: string; clientToken: string; otherClientToken: string;
  clientId: string; otherClientId: string; taskId: string;
};

async function req(path: string, init: RequestInit = {}, tok = ctx.clientToken) {
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
  await p.activityEvent.deleteMany({ where: { client: { user: { email: { in: ['ct1@t.com', 'ct2@t.com'] } } } } });
  await p.task.deleteMany({ where: { client: { user: { email: { in: ['ct1@t.com', 'ct2@t.com'] } } } } });
  await p.client.deleteMany({ where: { user: { email: { in: ['ct1@t.com', 'ct2@t.com'] } } } });
  await p.user.deleteMany({ where: { email: { in: ['ct1@t.com', 'ct2@t.com', 'admin-t@t.com'] } } });

  const u1 = await p.user.create({ data: { email: 'ct1@t.com', passwordHash: 'x', firstName: 'C', lastName: 'One', client: { create: { status: 'ACTIVE' } } } });
  const u2 = await p.user.create({ data: { email: 'ct2@t.com', passwordHash: 'x', firstName: 'C', lastName: 'Two', client: { create: { status: 'ACTIVE' } } } });
  const admin = await p.user.create({ data: { email: 'admin-t@t.com', passwordHash: 'x', firstName: 'Ad', lastName: 'Min', role: 'ADMIN' } });

  ctx.clientId = (await p.client.findUniqueOrThrow({ where: { userId: u1.id } })).id;
  ctx.otherClientId = (await p.client.findUniqueOrThrow({ where: { userId: u2.id } })).id;
  ctx.clientToken = jwt.sign({ sub: u1.id, email: 'ct1@t.com', role: 'CLIENT' }, config.jwtSecret);
  ctx.otherClientToken = jwt.sign({ sub: u2.id, email: 'ct2@t.com', role: 'CLIENT' }, config.jwtSecret);
  ctx.adminToken = jwt.sign({ sub: admin.id, email: 'admin-t@t.com', role: 'ADMIN' }, config.jwtSecret);
});

after(async () => {
  if (skip || !ctx.prisma) return;
  await ctx.prisma.activityEvent.deleteMany({ where: { client: { user: { email: { in: ['ct1@t.com', 'ct2@t.com'] } } } } }).catch(() => {});
  await ctx.prisma.task.deleteMany({ where: { client: { user: { email: { in: ['ct1@t.com', 'ct2@t.com'] } } } } }).catch(() => {});
  ctx.server?.close();
  await ctx.prisma.$disconnect();
});

test('client sees only their own tasks; admin sees all with client info', { skip }, async () => {
  const created = await req('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({ clientId: ctx.clientId, title: 'Round 1 letters', category: 'Dispute', priority: 'high' })
  }, ctx.adminToken);
  assert.equal(created.status, 201);
  ctx.taskId = created.body.task.id;
  assert.equal(created.body.task.clientName, 'C One');
  assert.equal(created.body.task.completed, false);

  const mine = await req('/api/tasks');
  assert.equal(mine.status, 200);
  assert.equal(mine.body.tasks.length, 1);
  assert.equal(mine.body.tasks[0].title, 'Round 1 letters');
  assert.equal(mine.body.tasks[0].clientName, undefined); // client view not enriched

  const other = await req('/api/tasks', {}, ctx.otherClientToken);
  assert.equal(other.body.tasks.length, 0);

  const admin = await req('/api/tasks', {}, ctx.adminToken);
  assert.ok(admin.body.tasks.some((t: any) => t.id === ctx.taskId && t.clientEmail === 'ct1@t.com'));
});

test('client cannot create or delete; admin-only routes enforced', { skip }, async () => {
  const create = await req('/api/tasks', { method: 'POST', body: JSON.stringify({ clientId: ctx.clientId, title: 'nope' }) });
  assert.equal(create.status, 403);
  const del = await req(`/api/tasks/${ctx.taskId}`, { method: 'DELETE' });
  assert.equal(del.status, 403);
});

test('validation: missing title or unknown client rejected', { skip }, async () => {
  const noTitle = await req('/api/tasks', { method: 'POST', body: JSON.stringify({ clientId: ctx.clientId }) }, ctx.adminToken);
  assert.equal(noTitle.status, 400);
  const badClient = await req('/api/tasks', { method: 'POST', body: JSON.stringify({ clientId: 'nope', title: 'x' }) }, ctx.adminToken);
  assert.equal(badClient.status, 404);
});

test('client toggles own task; cannot toggle another client\'s task', { skip }, async () => {
  const toggle = await req(`/api/tasks/${ctx.taskId}/toggle`, { method: 'PATCH' });
  assert.equal(toggle.status, 200);
  assert.equal(toggle.body.task.completed, true);
  assert.ok(toggle.body.task.completedAt);

  const back = await req(`/api/tasks/${ctx.taskId}/toggle`, { method: 'PATCH' });
  assert.equal(back.body.task.completed, false);
  assert.equal(back.body.task.completedAt, null);

  const foreign = await req(`/api/tasks/${ctx.taskId}/toggle`, { method: 'PATCH' }, ctx.otherClientToken);
  assert.equal(foreign.status, 403);
});

test('admin updates and deletes a task', { skip }, async () => {
  const upd = await req(`/api/tasks/${ctx.taskId}`, {
    method: 'PUT',
    body: JSON.stringify({ title: 'Updated title', priority: 'critical' })
  }, ctx.adminToken);
  assert.equal(upd.status, 200);
  assert.equal(upd.body.task.title, 'Updated title');
  assert.equal(upd.body.task.priority, 'critical');

  const del = await req(`/api/tasks/${ctx.taskId}`, { method: 'DELETE' }, ctx.adminToken);
  assert.equal(del.status, 200);
  const gone = await req(`/api/tasks/${ctx.taskId}`, {}, ctx.adminToken);
  assert.equal(gone.status, 404);
});

test('unauthenticated requests are rejected', { skip }, async () => {
  const res = await fetch(`${ctx.base}/api/tasks`);
  assert.equal(res.status, 401);
});
