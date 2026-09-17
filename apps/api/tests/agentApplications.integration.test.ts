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

const EMAIL = 'agent-applicant@t.com';
const ctx = {} as { prisma: any; base: string; server: any; staffToken: string; clientToken: string; id: string };

async function req(path: string, init: RequestInit & { token?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  const res = await fetch(`${ctx.base}${path}`, { ...init, headers });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const validBody = {
  firstName: 'Avery',
  lastName: 'Agent',
  email: 'Agent-Applicant@T.com',
  phone: '(555) 555-0100',
  state: 'nj',
  experience: 'Some — referred or assisted clients',
  motivation: 'I work with first-time home buyers.',
  consent: true
};

before(async () => {
  if (skip) return;
  const jwt = (await import('jsonwebtoken')).default;
  const { config } = await import('../src/config.js');
  ctx.prisma = (await import('../src/lib/prisma.js')).prisma;
  const { createApp } = await import('../src/app.js');
  ctx.server = createApp({ disableRateLimits: true }).listen(0);
  await new Promise((r) => ctx.server.once('listening', r));
  ctx.base = `http://127.0.0.1:${(ctx.server.address() as AddressInfo).port}`;
  await ctx.prisma.agentApplication.deleteMany({});
  await ctx.prisma.user.deleteMany({ where: { email: 'agent-reviewer@t.com' } });
  const staff = await ctx.prisma.user.create({ data: { email: 'agent-reviewer@t.com', passwordHash: 'x', firstName: 'S', lastName: 'R', role: 'STAFF' } });
  ctx.staffToken = jwt.sign({ sub: staff.id, role: 'STAFF' }, config.jwtSecret);
  ctx.clientToken = jwt.sign({ sub: 'client-user', role: 'CLIENT' }, config.jwtSecret);
});

after(async () => {
  if (skip || !ctx.prisma) return;
  ctx.server?.close();
  await ctx.prisma.$disconnect();
});

test('POST /api/agent-applications rejects missing consent and bad phone', { skip }, async () => {
  const noConsent = await req('/api/agent-applications', { method: 'POST', body: JSON.stringify({ ...validBody, consent: false }) });
  assert.equal(noConsent.status, 400);
  const badPhone = await req('/api/agent-applications', { method: 'POST', body: JSON.stringify({ ...validBody, phone: '123' }) });
  assert.equal(badPhone.status, 400);
  assert.equal(await ctx.prisma.agentApplication.count(), 0);
});

test('POST /api/agent-applications stores PII encrypted and reports email delivery', { skip }, async () => {
  const { status, body } = await req('/api/agent-applications', { method: 'POST', body: JSON.stringify(validBody) });
  assert.equal(status, 201);
  assert.equal(body.application.status, 'NEW');
  assert.ok(body.emails.applicant, 'applicant email result is reported');
  assert.ok(body.emails.staff, 'staff email result is reported');
  ctx.id = body.application.id;

  const row = await ctx.prisma.agentApplication.findUniqueOrThrow({ where: { id: ctx.id } });
  for (const field of ['firstNameEncrypted', 'lastNameEncrypted', 'emailEncrypted', 'phoneEncrypted', 'motivationEncrypted']) {
    assert.match(row[field], /^gcm\.v1:/, `${field} must be encrypted at rest`);
  }
  assert.ok(!JSON.stringify(row).includes('agent-applicant'), 'no plaintext email in the row');
  assert.equal(row.state, 'NJ');
  assert.equal(row.source, 'agent_page');

  const audit = await ctx.prisma.auditLog.findFirst({ where: { entityType: 'AgentApplication', entityId: ctx.id } });
  assert.equal(audit?.action, 'AGENT_APPLICATION_SUBMITTED');
});

test('GET /api/agent-applications is staff-only and decrypts', { skip }, async () => {
  assert.equal((await req('/api/agent-applications')).status, 401);
  assert.equal((await req('/api/agent-applications', { token: ctx.clientToken })).status, 403);
  const { status, body } = await req('/api/agent-applications', { token: ctx.staffToken });
  assert.equal(status, 200);
  const app = body.applications.find((a: any) => a.id === ctx.id);
  assert.equal(app.email, EMAIL);
  assert.equal(app.firstName, 'Avery');
  assert.equal(app.phone, '(555) 555-0100');
});

test('PATCH /api/agent-applications/:id updates review status', { skip }, async () => {
  const bad = await req(`/api/agent-applications/${ctx.id}`, { method: 'PATCH', token: ctx.staffToken, body: JSON.stringify({ status: 'WHATEVER' }) });
  assert.equal(bad.status, 400);
  const { status, body } = await req(`/api/agent-applications/${ctx.id}`, { method: 'PATCH', token: ctx.staffToken, body: JSON.stringify({ status: 'CONTACTED' }) });
  assert.equal(status, 200);
  assert.equal(body.application.status, 'CONTACTED');
  assert.ok(body.application.reviewedAt);
});
