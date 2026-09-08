import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertOrgAccess,
  assertSameTenant,
  hasAtLeastRole,
  isMember,
  scopeToTenant,
  TenantAccessError,
  type Membership
} from '../src/lib/tenancy.js';

const ORG_A = 'org-aaaa';
const ORG_B = 'org-bbbb';

const memberships: Membership[] = [
  { organizationId: ORG_A, userId: 'user-owner', role: 'OWNER' },
  { organizationId: ORG_A, userId: 'user-viewer', role: 'VIEWER' },
  { organizationId: ORG_B, userId: 'user-b-admin', role: 'ADMIN' }
];

test('isMember only matches the exact org + user pair', () => {
  assert.equal(isMember(memberships, 'user-owner', ORG_A), true);
  assert.equal(isMember(memberships, 'user-owner', ORG_B), false);
  assert.equal(isMember(memberships, 'user-b-admin', ORG_A), false);
  assert.equal(isMember(memberships, 'nobody', ORG_A), false);
});

test('hasAtLeastRole respects the role ranking', () => {
  assert.equal(hasAtLeastRole('OWNER', 'ADMIN'), true);
  assert.equal(hasAtLeastRole('ADMIN', 'ADMIN'), true);
  assert.equal(hasAtLeastRole('MEMBER', 'ADMIN'), false);
  assert.equal(hasAtLeastRole('VIEWER', 'MEMBER'), false);
});

test('assertOrgAccess: non-member of the tenant is rejected (cross-tenant isolation)', () => {
  assert.throws(
    () => assertOrgAccess(memberships, 'user-b-admin', ORG_A),
    (err: unknown) => err instanceof TenantAccessError && err.code === 'NOT_A_MEMBER' && err.status === 403
  );
});

test('assertOrgAccess: member below the required role is rejected', () => {
  assert.throws(
    () => assertOrgAccess(memberships, 'user-viewer', ORG_A, 'ADMIN'),
    (err: unknown) => err instanceof TenantAccessError && err.code === 'INSUFFICIENT_ROLE'
  );
});

test('assertOrgAccess: valid member returns their membership', () => {
  const m = assertOrgAccess(memberships, 'user-owner', ORG_A, 'ADMIN');
  assert.equal(m.role, 'OWNER');
  assert.equal(m.organizationId, ORG_A);
});

test('assertSameTenant blocks resources owned by another org or with no owner', () => {
  assert.doesNotThrow(() => assertSameTenant(ORG_A, ORG_A));
  assert.throws(() => assertSameTenant(ORG_B, ORG_A), TenantAccessError);
  assert.throws(() => assertSameTenant(null, ORG_A), TenantAccessError);
  assert.throws(() => assertSameTenant(undefined, ORG_A), TenantAccessError);
});

test('scopeToTenant drops rows belonging to other organizations', () => {
  const rows = [
    { id: '1', organizationId: ORG_A },
    { id: '2', organizationId: ORG_B },
    { id: '3', organizationId: ORG_A },
    { id: '4', organizationId: null }
  ];
  const scoped = scopeToTenant(rows, ORG_A);
  assert.deepEqual(scoped.map((r) => r.id), ['1', '3']);
});
