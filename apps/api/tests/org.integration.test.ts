import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';

/**
 * Route-level tests for the organization / client-assignment API.
 * Runs only with TEST_DATABASE_URL (npm run test:integration).
 */

const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = TEST_DB ? false : 'TEST_DATABASE_URL not set';
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB;
  process.env.JWT_SECRET ||= 'test-secret';
  process.env.APP_URL ||= 'http://localhost:5173';
  process.env.API_URL ||= 'http://localhost:3000';
}

const ctx = {} as {
  prisma: any;
  base: string;
  server: any;
  token: (userId: string, email: string, role?: string) => string;
  ids: Record<string, string>;
};

async function api(path: string, tok: string | null, init: RequestInit = {}) {
  const res = await fetch(`${ctx.base}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(tok ? { authorization: `Bearer ${tok}` } : {}),
      ...(init.headers || {})
    }
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

before(async () => {
  if (skip) return;
  const jwt = (await import('jsonwebtoken')).default;
  const { config } = await import('../src/config.js');
  ctx.token = (sub, email, role = 'CLIENT') => jwt.sign({ sub, email, role }, config.jwtSecret);

  ctx.prisma = (await import('../src/lib/prisma.js')).prisma;
  const { createApp } = await import('../src/app.js');
  const app = createApp({ disableRateLimits: true });
  ctx.server = app.listen(0);
  await new Promise((r) => ctx.server.once('listening', r));
  ctx.base = `http://127.0.0.1:${(ctx.server.address() as AddressInfo).port}`;

  const p = ctx.prisma;
  await p.document.deleteMany({});
  await p.clientAssignment.deleteMany({});
  await p.organizationMember.deleteMany({});
  await p.organizationInvitation.deleteMany({});
  await p.client.deleteMany({});
  await p.organization.deleteMany({});
  await p.user.deleteMany({});

  const mk = (email: string) => p.user.create({ data: { email, passwordHash: 'x', firstName: 'T', lastName: 'U' } });
  const owner = await mk('owner@org.com');
  const pro = await mk('pro@org.com');
  const outsider = await mk('outsider@org.com');
  ctx.ids = { owner: owner.id, pro: pro.id, outsider: outsider.id };
});

after(async () => {
  if (skip || !ctx.prisma) return;
  ctx.server?.close();
  await ctx.prisma.$disconnect();
});

test('POST /api/org creates an org with the caller as OWNER', { skip }, async () => {
  const tok = ctx.token(ctx.ids.owner, 'owner@org.com');
  const { status, body } = await api('/api/org', tok, { method: 'POST', body: JSON.stringify({ name: 'Acme Credit Pros' }) });
  assert.equal(status, 201);
  assert.equal(body.role, 'OWNER');
  assert.equal(body.organization.slug, 'acme-credit-pros');
  ctx.ids.orgSlug = body.organization.slug;
  ctx.ids.orgId = body.organization.id;
});

test('a non-member cannot read the org', { skip }, async () => {
  const tok = ctx.token(ctx.ids.outsider, 'outsider@org.com');
  const { status, body } = await api(`/api/org/${ctx.ids.orgSlug}`, tok);
  assert.equal(status, 403);
  assert.equal(body.code, 'NOT_A_MEMBER');
});

test('owner invites + member accepts, then appears in members list', { skip }, async () => {
  const ownerTok = ctx.token(ctx.ids.owner, 'owner@org.com');
  const inv = await api(`/api/org/${ctx.ids.orgSlug}/invite`, ownerTok, {
    method: 'POST', body: JSON.stringify({ email: 'pro@org.com', role: 'MEMBER' })
  });
  assert.equal(inv.status, 201);
  const token = inv.body.inviteUrl.split('token=')[1];

  const proTok = ctx.token(ctx.ids.pro, 'pro@org.com');
  const acc = await api('/api/org/accept-invite', proTok, { method: 'POST', body: JSON.stringify({ token }) });
  assert.equal(acc.status, 200);

  const members = await api(`/api/org/${ctx.ids.orgSlug}/members`, ownerTok);
  assert.equal(members.status, 200);
  assert.deepEqual(members.body.members.map((m: any) => m.role).sort(), ['MEMBER', 'OWNER']);
});

test('ADMIN+ can create a client; a professional cannot', { skip }, async () => {
  const proTok = ctx.token(ctx.ids.pro, 'pro@org.com');
  const denied = await api(`/api/org/${ctx.ids.orgSlug}/clients`, proTok, {
    method: 'POST', body: JSON.stringify({ firstName: 'Dana', lastName: 'Doe', email: 'dana@client.com' })
  });
  assert.equal(denied.status, 403);

  const ownerTok = ctx.token(ctx.ids.owner, 'owner@org.com');
  const created = await api(`/api/org/${ctx.ids.orgSlug}/clients`, ownerTok, {
    method: 'POST', body: JSON.stringify({ firstName: 'Dana', lastName: 'Doe', email: 'dana@client.com' })
  });
  assert.equal(created.status, 201);
  ctx.ids.clientId = created.body.client.id;

  const created2 = await api(`/api/org/${ctx.ids.orgSlug}/clients`, ownerTok, {
    method: 'POST', body: JSON.stringify({ firstName: 'Eve', lastName: 'Roe', email: 'eve@client.com' })
  });
  ctx.ids.clientId2 = created2.body.client.id;
});

test('professional only sees assigned clients; owner sees all', { skip }, async () => {
  const ownerTok = ctx.token(ctx.ids.owner, 'owner@org.com');
  const proTok = ctx.token(ctx.ids.pro, 'pro@org.com');

  let proList = await api(`/api/org/${ctx.ids.orgSlug}/clients`, proTok);
  assert.equal(proList.body.clients.length, 0);

  const assign = await api(`/api/org/${ctx.ids.orgSlug}/clients/${ctx.ids.clientId}/assignments`, ownerTok, {
    method: 'POST', body: JSON.stringify({ userId: ctx.ids.pro })
  });
  assert.equal(assign.status, 201);

  proList = await api(`/api/org/${ctx.ids.orgSlug}/clients`, proTok);
  assert.equal(proList.body.clients.length, 1);
  assert.equal(proList.body.clients[0].id, ctx.ids.clientId);

  const ownerList = await api(`/api/org/${ctx.ids.orgSlug}/clients`, ownerTok);
  assert.equal(ownerList.body.clients.length, 2);
});

test('the last owner cannot be demoted', { skip }, async () => {
  const ownerTok = ctx.token(ctx.ids.owner, 'owner@org.com');
  const { status, body } = await api(`/api/org/${ctx.ids.orgSlug}/members/${ctx.ids.owner}`, ownerTok, {
    method: 'PATCH', body: JSON.stringify({ role: 'MEMBER' })
  });
  assert.equal(status, 400);
  assert.match(body.error, /at least one owner/i);
});

test('a professional cannot invite (ADMIN+ required)', { skip }, async () => {
  const proTok = ctx.token(ctx.ids.pro, 'pro@org.com');
  const { status } = await api(`/api/org/${ctx.ids.orgSlug}/invite`, proTok, {
    method: 'POST', body: JSON.stringify({ email: 'x@y.com', role: 'MEMBER' })
  });
  assert.equal(status, 403);
});

test('removing a member also clears their assignments', { skip }, async () => {
  const ownerTok = ctx.token(ctx.ids.owner, 'owner@org.com');
  const del = await api(`/api/org/${ctx.ids.orgSlug}/members/${ctx.ids.pro}`, ownerTok, { method: 'DELETE' });
  assert.equal(del.status, 200);
  const remaining = await ctx.prisma.clientAssignment.count({ where: { userId: ctx.ids.pro } });
  assert.equal(remaining, 0);
});
