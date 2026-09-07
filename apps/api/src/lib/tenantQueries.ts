import { prisma } from './prisma.js';
import { assertOrgAccess, hasAtLeastRole, TenantAccessError, type Membership, type OrgRole } from './tenancy.js';

/**
 * Tenant-scoped data-access helpers.
 *
 * These are the single source of truth for "can this actor read this row".
 * Routes call these instead of hand-writing `where` clauses so isolation is
 * enforced once, at the data layer, and covered by DB-level integration tests
 * (tests/tenantIsolation.integration.test.ts).
 */

/**
 * A document is only visible to the user who owns the client it belongs to.
 * Returns null (not throw) so callers can 404 uniformly.
 */
export async function findClientDocumentForUser(userId: string, documentId: string) {
  const client = await prisma.client.findUnique({ where: { userId }, select: { id: true } });
  if (!client) return null;
  return prisma.document.findFirst({ where: { id: documentId, clientId: client.id } });
}

async function loadMemberships(userId: string): Promise<Membership[]> {
  const rows = await prisma.organizationMember.findMany({
    where: { userId },
    select: { organizationId: true, userId: true, role: true }
  });
  return rows.map((r) => ({ organizationId: r.organizationId, userId: r.userId, role: r.role as OrgRole }));
}

/**
 * List the clients belonging to an organization, but only if the actor is a
 * member of that organization. Cross-tenant callers get a TenantAccessError.
 */
export async function listOrgClientsForUser(userId: string, organizationId: string, minimumRole: OrgRole = 'VIEWER') {
  const memberships = await loadMemberships(userId);
  assertOrgAccess(memberships, userId, organizationId, minimumRole);
  return prisma.client.findMany({ where: { organizationId } });
}

/**
 * Read one client within an organization.
 *
 * - OWNER / ADMIN see any client in their org.
 * - Lower roles (a "professional" MEMBER) only see a client explicitly assigned
 *   to them via OrganizationMember.clientId.
 *
 * Throws TenantAccessError for cross-tenant or unassigned access; returns null
 * when the client id simply does not exist in the org.
 */
export async function findOrgClientForUser(userId: string, organizationId: string, clientId: string) {
  const memberships = await loadMemberships(userId);
  const membership = assertOrgAccess(memberships, userId, organizationId);

  const client = await prisma.client.findFirst({ where: { id: clientId, organizationId } });
  if (!client) return null;

  if (hasAtLeastRole(membership.role, 'ADMIN')) return client;

  const assignment = await prisma.organizationMember.findFirst({
    where: { organizationId, userId, clientId }
  });
  if (!assignment) {
    throw new TenantAccessError('CROSS_TENANT', 'Client is not assigned to this professional');
  }
  return client;
}
