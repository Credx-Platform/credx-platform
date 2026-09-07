/**
 * Tenant-isolation authorization helpers.
 *
 * Every organization-bound resource must be checked against the acting user's
 * membership BEFORE it is returned or mutated. These are pure functions so they
 * can be unit-tested exhaustively and reused across routes instead of each
 * handler re-implementing membership checks.
 *
 * Rule of thumb (master spec §48): never rely on frontend filtering; enforce
 * separation at the API/data-access layer.
 */

export type OrgRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'BILLING' | 'VIEWER';

export type Membership = {
  organizationId: string;
  userId: string;
  role: OrgRole;
};

export class TenantAccessError extends Error {
  readonly status: number;
  readonly code: 'NOT_A_MEMBER' | 'INSUFFICIENT_ROLE' | 'CROSS_TENANT';
  constructor(code: TenantAccessError['code'], message: string) {
    super(message);
    this.name = 'TenantAccessError';
    this.code = code;
    this.status = 403;
  }
}

// Role capability ranking for "at least this role" checks.
const ROLE_RANK: Record<OrgRole, number> = {
  VIEWER: 0,
  BILLING: 1,
  MEMBER: 2,
  ADMIN: 3,
  OWNER: 4
};

export function findMembership(
  memberships: Membership[],
  userId: string,
  organizationId: string
): Membership | undefined {
  return memberships.find(
    (m) => m.userId === userId && m.organizationId === organizationId
  );
}

export function isMember(
  memberships: Membership[],
  userId: string,
  organizationId: string
): boolean {
  return Boolean(findMembership(memberships, userId, organizationId));
}

export function hasAtLeastRole(role: OrgRole, minimum: OrgRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/**
 * Assert the user is a member of the organization and (optionally) holds at
 * least `minimumRole`. Returns the membership on success; throws
 * TenantAccessError otherwise.
 */
export function assertOrgAccess(
  memberships: Membership[],
  userId: string,
  organizationId: string,
  minimumRole: OrgRole = 'VIEWER'
): Membership {
  const membership = findMembership(memberships, userId, organizationId);
  if (!membership) {
    throw new TenantAccessError('NOT_A_MEMBER', 'Not a member of this organization');
  }
  if (!hasAtLeastRole(membership.role, minimumRole)) {
    throw new TenantAccessError(
      'INSUFFICIENT_ROLE',
      `Requires ${minimumRole} role or higher`
    );
  }
  return membership;
}

/**
 * Assert a resource that carries an owning organizationId belongs to the tenant
 * the actor is operating within. Use for clients, documents, invitations, etc.
 */
export function assertSameTenant(
  resourceOrganizationId: string | null | undefined,
  actorOrganizationId: string
): void {
  if (!resourceOrganizationId || resourceOrganizationId !== actorOrganizationId) {
    throw new TenantAccessError(
      'CROSS_TENANT',
      'Resource belongs to a different organization'
    );
  }
}

/**
 * Filter a list of organization-bound resources down to the ones the actor's
 * tenant owns. Defense-in-depth for list endpoints.
 */
export function scopeToTenant<T extends { organizationId?: string | null }>(
  resources: T[],
  actorOrganizationId: string
): T[] {
  return resources.filter((r) => r.organizationId === actorOrganizationId);
}
