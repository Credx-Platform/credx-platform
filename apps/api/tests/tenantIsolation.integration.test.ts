import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

/**
 * DB-level tenant-isolation integration tests.
 *
 * These hit real Prisma queries. They only run when TEST_DATABASE_URL is set
 * (npm run test:integration) — never against the app's default DATABASE_URL, so
 * a normal `npm test` run reports them as skipped rather than touching prod.
 *
 *   docker run -d --rm -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=credx_test \
 *     -p 55432:5432 postgres:16-alpine
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/credx_test \
 *     npm run test:integration
 */

const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = TEST_DB ? false : 'TEST_DATABASE_URL not set';

if (TEST_DB) {
  // Point the singleton client at the throwaway DB before it is constructed.
  process.env.DATABASE_URL = TEST_DB;
}

type Ctx = {
  prisma: any;
  q: typeof import('../src/lib/tenantQueries.js');
  tenancy: typeof import('../src/lib/tenancy.js');
  ids: Record<string, string>;
};
const ctx = {} as Ctx;

before(async () => {
  if (skip) return;
  ctx.prisma = (await import('../src/lib/prisma.js')).prisma;
  ctx.q = await import('../src/lib/tenantQueries.js');
  ctx.tenancy = await import('../src/lib/tenancy.js');

  const p = ctx.prisma;
  // Clean slate (order respects FKs).
  await p.document.deleteMany({});
  await p.organizationMember.deleteMany({});
  await p.organizationInvitation.deleteMany({});
  await p.client.deleteMany({});
  await p.organization.deleteMany({});
  await p.user.deleteMany({});

  const mkUser = (email: string) =>
    p.user.create({ data: { email, passwordHash: 'x', firstName: 'T', lastName: 'U' } });

  const ownerA = await mkUser('ownerA@t.com');
  const ownerB = await mkUser('ownerB@t.com');
  const proA = await mkUser('proA@t.com'); // professional / MEMBER in org A
  const clientUserA1 = await mkUser('clientA1@t.com');
  const clientUserA2 = await mkUser('clientA2@t.com');
  const clientUserB1 = await mkUser('clientB1@t.com');

  const orgA = await p.organization.create({ data: { name: 'Org A', slug: 'org-a' } });
  const orgB = await p.organization.create({ data: { name: 'Org B', slug: 'org-b' } });

  const clientA1 = await p.client.create({ data: { userId: clientUserA1.id, organizationId: orgA.id, status: 'ACTIVE' } });
  const clientA2 = await p.client.create({ data: { userId: clientUserA2.id, organizationId: orgA.id, status: 'ACTIVE' } });
  const clientB1 = await p.client.create({ data: { userId: clientUserB1.id, organizationId: orgB.id, status: 'ACTIVE' } });

  await p.organizationMember.create({ data: { organizationId: orgA.id, userId: ownerA.id, role: 'OWNER' } });
  await p.organizationMember.create({ data: { organizationId: orgB.id, userId: ownerB.id, role: 'OWNER' } });
  // proA is a MEMBER of org A, assigned ONLY to clientA1 (via ClientAssignment).
  await p.organizationMember.create({ data: { organizationId: orgA.id, userId: proA.id, role: 'MEMBER' } });
  await p.clientAssignment.create({ data: { organizationId: orgA.id, userId: proA.id, clientId: clientA1.id } });

  const docA1 = await p.document.create({
    data: { clientId: clientA1.id, type: 'OTHER', fileName: 'a1.pdf', s3Key: 'k/a1', content: 'A1 body' }
  });
  const docB1 = await p.document.create({
    data: { clientId: clientB1.id, type: 'OTHER', fileName: 'b1.pdf', s3Key: 'k/b1', content: 'B1 body' }
  });

  ctx.ids = {
    ownerA: ownerA.id, ownerB: ownerB.id, proA: proA.id,
    clientUserA1: clientUserA1.id, clientUserB1: clientUserB1.id,
    orgA: orgA.id, orgB: orgB.id,
    clientA1: clientA1.id, clientA2: clientA2.id, clientB1: clientB1.id,
    docA1: docA1.id, docB1: docB1.id
  };
});

after(async () => {
  if (skip || !ctx.prisma) return;
  await ctx.prisma.$disconnect();
});

test('a user can read their own client document', { skip }, async () => {
  const doc = await ctx.q.findClientDocumentForUser(ctx.ids.clientUserA1, ctx.ids.docA1);
  assert.ok(doc);
  assert.equal(doc.id, ctx.ids.docA1);
});

test('user A cannot read user B\'s document (returns null)', { skip }, async () => {
  const doc = await ctx.q.findClientDocumentForUser(ctx.ids.clientUserA1, ctx.ids.docB1);
  assert.equal(doc, null);
});

test('a user with no client profile gets null, not a leak', { skip }, async () => {
  const doc = await ctx.q.findClientDocumentForUser(ctx.ids.ownerA, ctx.ids.docA1);
  assert.equal(doc, null);
});

test('Org A owner lists only Org A clients', { skip }, async () => {
  const clients = await ctx.q.listOrgClientsForUser(ctx.ids.ownerA, ctx.ids.orgA);
  const orgIds = new Set(clients.map((c: any) => c.organizationId));
  assert.deepEqual([...orgIds], [ctx.ids.orgA]);
  assert.equal(clients.length, 2);
});

test('Org B owner cannot list Org A clients (cross-tenant rejected)', { skip }, async () => {
  await assert.rejects(
    () => ctx.q.listOrgClientsForUser(ctx.ids.ownerB, ctx.ids.orgA),
    (err: any) => err instanceof ctx.tenancy.TenantAccessError && err.code === 'NOT_A_MEMBER'
  );
});

test('an assigned professional can read their assigned client', { skip }, async () => {
  const client = await ctx.q.findOrgClientForUser(ctx.ids.proA, ctx.ids.orgA, ctx.ids.clientA1);
  assert.ok(client);
  assert.equal(client.id, ctx.ids.clientA1);
});

test('a professional cannot read an unassigned client in the same org', { skip }, async () => {
  await assert.rejects(
    () => ctx.q.findOrgClientForUser(ctx.ids.proA, ctx.ids.orgA, ctx.ids.clientA2),
    (err: any) => err instanceof ctx.tenancy.TenantAccessError
  );
});

test('the org owner can read any client in the org', { skip }, async () => {
  const client = await ctx.q.findOrgClientForUser(ctx.ids.ownerA, ctx.ids.orgA, ctx.ids.clientA2);
  assert.ok(client);
  assert.equal(client.id, ctx.ids.clientA2);
});

test('a professional cannot reach across tenants to a Org B client', { skip }, async () => {
  await assert.rejects(
    () => ctx.q.findOrgClientForUser(ctx.ids.proA, ctx.ids.orgB, ctx.ids.clientB1),
    (err: any) => err instanceof ctx.tenancy.TenantAccessError && err.code === 'NOT_A_MEMBER'
  );
});
