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

const ctx = {} as { prisma: any; base: string; server: any; token: string; other: string; clientId: string; notif: any };

async function req(path: string, init: RequestInit = {}, tok = ctx.token) {
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
  ctx.notif = await import('../src/lib/notifications.js');
  const { createApp } = await import('../src/app.js');
  ctx.server = createApp({ disableRateLimits: true }).listen(0);
  await new Promise((r) => ctx.server.once('listening', r));
  ctx.base = `http://127.0.0.1:${(ctx.server.address() as AddressInfo).port}`;

  const p = ctx.prisma;
  await p.notification.deleteMany({});
  await p.client.deleteMany({ where: { user: { email: { in: ['n1@t.com', 'n2@t.com'] } } } });
  await p.user.deleteMany({ where: { email: { in: ['n1@t.com', 'n2@t.com'] } } });
  const u1 = await p.user.create({ data: { email: 'n1@t.com', passwordHash: 'x', firstName: 'N', lastName: 'One', client: { create: { status: 'ACTIVE' } } } });
  const u2 = await p.user.create({ data: { email: 'n2@t.com', passwordHash: 'x', firstName: 'N', lastName: 'Two', client: { create: { status: 'ACTIVE' } } } });
  ctx.clientId = (await p.client.findUniqueOrThrow({ where: { userId: u1.id } })).id;
  ctx.token = jwt.sign({ sub: u1.id, email: 'n1@t.com', role: 'CLIENT' }, config.jwtSecret);
  ctx.other = jwt.sign({ sub: u2.id, email: 'n2@t.com', role: 'CLIENT' }, config.jwtSecret);
});

after(async () => {
  if (skip || !ctx.prisma) return;
  ctx.server?.close();
  await ctx.prisma.$disconnect();
});

test('empty list + zero unread for a fresh client', { skip }, async () => {
  const { status, body } = await req('/api/notifications');
  assert.equal(status, 200);
  assert.deepEqual(body, { notifications: [], unreadCount: 0 });
});

test('notify() with a dedupeKey is idempotent', { skip }, async () => {
  const a = await ctx.notif.notify(ctx.clientId, { type: 'SYSTEM', title: 'Hello', dedupeKey: 'dk-1' });
  const b = await ctx.notif.notify(ctx.clientId, { type: 'SYSTEM', title: 'Hello again', dedupeKey: 'dk-1' });
  assert.equal(a.created, true);
  assert.equal(b.created, false);
  const count = await ctx.prisma.notification.count({ where: { clientId: ctx.clientId, dedupeKey: 'dk-1' } });
  assert.equal(count, 1);
});

test('list returns newest first with an unread count; mark-one-read works', { skip }, async () => {
  await ctx.notif.notify(ctx.clientId, { type: 'MILESTONE_REACHED', title: 'Milestone', dedupeKey: 'm-1' });
  const list = await req('/api/notifications');
  assert.ok(list.body.notifications.length >= 2);
  assert.equal(list.body.notifications[0].read, false);
  assert.equal(list.body.unreadCount, list.body.notifications.filter((n: any) => !n.read).length);

  const first = list.body.notifications[0].id;
  const mark = await req(`/api/notifications/${first}/read`, { method: 'POST' });
  assert.equal(mark.body.updated, 1);
  const after = await req('/api/notifications');
  assert.equal(after.body.notifications.find((n: any) => n.id === first).read, true);
});

test('unreadOnly filter + read-all', { skip }, async () => {
  const unread = await req('/api/notifications?unreadOnly=1');
  assert.ok(unread.body.notifications.every((n: any) => !n.read));
  const all = await req('/api/notifications/read-all', { method: 'POST' });
  assert.ok(all.body.updated >= 1);
  const check = await req('/api/notifications');
  assert.equal(check.body.unreadCount, 0);
});

test('a client cannot mark another client\'s notification read', { skip }, async () => {
  const n = await ctx.prisma.notification.create({ data: { clientId: ctx.clientId, type: 'SYSTEM', title: 'mine' } });
  const cross = await req(`/api/notifications/${n.id}/read`, { method: 'POST' }, ctx.other);
  assert.equal(cross.body.updated, 0);
});

test('notifyReadinessChanged only fires past the threshold', { skip }, async () => {
  const before = await ctx.prisma.notification.count({ where: { clientId: ctx.clientId, type: 'READINESS_SCORE_CHANGED' } });
  ctx.notif.notifyReadinessChanged(ctx.clientId, 50, 51); // delta 1 — below threshold
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(await ctx.prisma.notification.count({ where: { clientId: ctx.clientId, type: 'READINESS_SCORE_CHANGED' } }), before);

  ctx.notif.notifyReadinessChanged(ctx.clientId, 50, 58); // delta 8 — fires
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(await ctx.prisma.notification.count({ where: { clientId: ctx.clientId, type: 'READINESS_SCORE_CHANGED' } }), before + 1);
});

test('no auth token is rejected', { skip }, async () => {
  const res = await fetch(`${ctx.base}/api/notifications`);
  assert.equal(res.status, 401);
});
