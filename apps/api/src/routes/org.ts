import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { track } from '../lib/analytics.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { captureException } from '../lib/sentry.js';
import { assertOrgAccess, TenantAccessError, type Membership, type OrgRole } from '../lib/tenancy.js';
import { listOrgClientsForUser } from '../lib/tenantQueries.js';
import bcrypt from 'bcrypt';

export const orgRouter = Router();

function toMemberships(orgId: string, members: Array<{ userId: string; role: string }>): Membership[] {
  return members.map((m) => ({ organizationId: orgId, userId: m.userId, role: m.role as Membership['role'] }));
}

function handleTenantError(err: unknown, res: import('express').Response): boolean {
  if (err instanceof TenantAccessError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return true;
  }
  return false;
}

function slugify(input: string): string {
  return String(input)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);
}

/** Load an org by slug with its members, or send 404. Returns null when 404 was sent. */
async function loadOrgOr404(slug: string, res: import('express').Response) {
  const org = await prisma.organization.findUnique({
    where: { slug },
    include: { members: true }
  });
  if (!org) {
    res.status(404).json({ error: 'Organization not found' });
    return null;
  }
  return org;
}

/**
 * GET /api/org
 * Get the current user's organization membership.
 */
orgRouter.get('/', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const memberships = await prisma.organizationMember.findMany({
      where: { userId: req.auth!.sub },
      include: {
        organization: {
          include: {
            _count: { select: { members: true, clients: true } }
          }
        }
      }
    });

    res.json({ memberships });
  } catch (err) {
    await captureException(err, { userId: req.auth?.sub, url: req.originalUrl, method: req.method });
    next(err);
  }
});

/**
 * POST /api/org
 * Create an organization. The creator becomes its OWNER.
 */
orgRouter.post('/', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(2).max(120),
      slug: z.string().min(2).max(48).optional(),
      website: z.string().url().max(200).optional(),
      description: z.string().max(500).optional()
    });
    const data = schema.parse(req.body);

    let base = slugify(data.slug || data.name) || `org-${Date.now().toString(36)}`;
    let slug = base;
    for (let i = 2; i < 50; i += 1) {
      const taken = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
      if (!taken) break;
      slug = `${base}-${i}`;
    }

    const org = await prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          name: data.name,
          slug,
          website: data.website ?? null,
          description: data.description ?? null
        }
      });
      await tx.organizationMember.create({
        data: { organizationId: created.id, userId: req.auth!.sub, role: 'OWNER' }
      });
      return created;
    });

    track('organization_created', { distinctId: req.auth!.sub, props: { organizationId: org.id } });

    res.status(201).json({ organization: org, role: 'OWNER' });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid organization details', details: err.issues });
    await captureException(err, { userId: req.auth?.sub, url: req.originalUrl, method: req.method });
    next(err);
  }
});

/**
 * GET /api/org/:slug
 * Get organization details by slug.
 */
orgRouter.get('/:slug', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { slug: String(req.params.slug) },
      include: {
        members: {
          include: { User: { select: { id: true, email: true, firstName: true, lastName: true } } }
        },
        _count: { select: { members: true, clients: true } }
      }
    });

    if (!org) return res.status(404).json({ error: 'Organization not found' });

    assertOrgAccess(toMemberships(org.id, org.members), req.auth!.sub, org.id);

    res.json(org);
  } catch (err) {
    if (handleTenantError(err, res)) return;
    await captureException(err, { userId: req.auth?.sub, url: req.originalUrl, method: req.method });
    next(err);
  }
});

/**
 * POST /api/org/:slug/invite
 * Invite a user to the organization.
 */
orgRouter.post('/:slug/invite', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { slug: String(req.params.slug) },
      include: { members: true }
    });
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    // Only ADMIN or OWNER can invite
    assertOrgAccess(toMemberships(org.id, org.members), req.auth!.sub, org.id, 'ADMIN');

    // Check member limit
    if (org.members.length >= org.maxMembers) {
      return res.status(400).json({ error: 'Organization member limit reached' });
    }

    const schema = z.object({
      email: z.string().email(),
      role: z.enum(['ADMIN', 'MEMBER', 'BILLING', 'VIEWER']).default('MEMBER')
    });
    const { email, role } = schema.parse(req.body);

    // Check for existing invitation
    const existing = await prisma.organizationInvitation.findUnique({
      where: { organizationId_email: { organizationId: org.id, email } }
    });
    if (existing && !existing.acceptedAt && existing.expiresAt > new Date()) {
      return res.status(400).json({ error: 'Invitation already pending' });
    }

    const token = randomUUID();
    const tokenHash = await hashToken(token);

    const invitation = await prisma.organizationInvitation.create({
      data: {
        organizationId: org.id,
        email,
        role: role as any,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      }
    });

    track('client_invited', { distinctId: req.auth!.sub, props: { organizationId: invitation.organizationId, role } });

    res.status(201).json({ invitation, inviteUrl: `/org/invite?token=${token}` });
  } catch (err) {
    if (handleTenantError(err, res)) return;
    await captureException(err, { userId: req.auth?.sub, url: req.originalUrl, method: req.method });
    next(err);
  }
});

/**
 * POST /api/org/accept-invite
 * Accept an organization invitation.
 */
orgRouter.post('/accept-invite', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const schema = z.object({ token: z.string().uuid() });
    const { token } = schema.parse(req.body);

    const tokenHash = await hashToken(token);
    const invitation = await prisma.organizationInvitation.findUnique({
      where: { tokenHash }
    });

    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.expiresAt <= new Date() ||
      invitation.email.toLowerCase() !== (req.auth!.email ?? '').toLowerCase()
    ) {
      return res.status(400).json({ error: 'Invalid or expired invitation' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.organizationMember.upsert({
        where: {
          organizationId_userId: {
            organizationId: invitation.organizationId,
            userId: req.auth!.sub
          }
        },
        create: {
          organizationId: invitation.organizationId,
          userId: req.auth!.sub,
          role: invitation.role
        },
        update: {}
      });

      await tx.organizationInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() }
      });
    });

    res.json({ success: true });
  } catch (err) {
    await captureException(err, { userId: req.auth?.sub, url: req.originalUrl, method: req.method });
    next(err);
  }
});

/**
 * GET /api/org/:slug/members
 * List members (any member of the org).
 */
orgRouter.get('/:slug/members', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { slug: String(req.params.slug) },
      include: {
        members: {
          include: { User: { select: { id: true, email: true, firstName: true, lastName: true } } },
          orderBy: { joinedAt: 'asc' }
        }
      }
    });
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    assertOrgAccess(toMemberships(org.id, org.members), req.auth!.sub, org.id);

    res.json({
      members: org.members.map((m) => ({
        userId: m.userId,
        role: m.role,
        joinedAt: m.joinedAt,
        user: m.User
      }))
    });
  } catch (err) {
    if (handleTenantError(err, res)) return;
    await captureException(err, { userId: req.auth?.sub, url: req.originalUrl, method: req.method });
    next(err);
  }
});

/**
 * PATCH /api/org/:slug/members/:userId
 * Change a member's role. ADMIN+ only; the last OWNER cannot be demoted.
 */
orgRouter.patch('/:slug/members/:userId', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const org = await loadOrgOr404(String(req.params.slug), res);
    if (!org) return;
    assertOrgAccess(toMemberships(org.id, org.members), req.auth!.sub, org.id, 'ADMIN');

    const schema = z.object({ role: z.enum(['OWNER', 'ADMIN', 'MEMBER', 'BILLING', 'VIEWER']) });
    const { role } = schema.parse(req.body);
    const targetUserId = String(req.params.userId);

    const target = org.members.find((m) => m.userId === targetUserId);
    if (!target) return res.status(404).json({ error: 'Member not found' });

    if (target.role === 'OWNER' && role !== 'OWNER') {
      const owners = org.members.filter((m) => m.role === 'OWNER').length;
      if (owners <= 1) return res.status(400).json({ error: 'An organization must keep at least one owner' });
    }
    // Only an OWNER can grant OWNER.
    const actor = org.members.find((m) => m.userId === req.auth!.sub);
    if (role === 'OWNER' && actor?.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only an owner can grant the owner role', code: 'INSUFFICIENT_ROLE' });
    }

    const updated = await prisma.organizationMember.update({
      where: { organizationId_userId: { organizationId: org.id, userId: targetUserId } },
      data: { role: role as OrgRole }
    });
    res.json({ member: { userId: updated.userId, role: updated.role } });
  } catch (err) {
    if (handleTenantError(err, res)) return;
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid role' });
    await captureException(err, { userId: req.auth?.sub, url: req.originalUrl, method: req.method });
    next(err);
  }
});

/**
 * DELETE /api/org/:slug/members/:userId
 * Remove a member. ADMIN+ only; the last OWNER cannot be removed.
 */
orgRouter.delete('/:slug/members/:userId', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const org = await loadOrgOr404(String(req.params.slug), res);
    if (!org) return;
    assertOrgAccess(toMemberships(org.id, org.members), req.auth!.sub, org.id, 'ADMIN');

    const targetUserId = String(req.params.userId);
    const target = org.members.find((m) => m.userId === targetUserId);
    if (!target) return res.status(404).json({ error: 'Member not found' });

    if (target.role === 'OWNER' && org.members.filter((m) => m.role === 'OWNER').length <= 1) {
      return res.status(400).json({ error: 'An organization must keep at least one owner' });
    }

    await prisma.$transaction([
      prisma.clientAssignment.deleteMany({ where: { organizationId: org.id, userId: targetUserId } }),
      prisma.organizationMember.delete({
        where: { organizationId_userId: { organizationId: org.id, userId: targetUserId } }
      })
    ]);
    res.json({ success: true });
  } catch (err) {
    if (handleTenantError(err, res)) return;
    await captureException(err, { userId: req.auth?.sub, url: req.originalUrl, method: req.method });
    next(err);
  }
});

/**
 * GET /api/org/:slug/clients
 * List the org's clients. OWNER/ADMIN see all; a professional sees only the
 * clients assigned to them.
 */
orgRouter.get('/:slug/clients', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const org = await prisma.organization.findUnique({ where: { slug: String(req.params.slug) }, select: { id: true } });
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const clients = await listOrgClientsForUser(req.auth!.sub, org.id);
    const withMeta = await prisma.client.findMany({
      where: { id: { in: clients.map((c) => c.id) } },
      select: {
        id: true, status: true, serviceTier: true, customerType: true, createdAt: true,
        user: { select: { firstName: true, lastName: true, email: true } },
        assignments: { select: { userId: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ clients: withMeta });
  } catch (err) {
    if (handleTenantError(err, res)) return;
    await captureException(err, { userId: req.auth?.sub, url: req.originalUrl, method: req.method });
    next(err);
  }
});

/**
 * POST /api/org/:slug/clients
 * Create a client record inside the org. ADMIN+ only. Creates a stub user with a
 * password-setup flow (no fabricated credentials).
 */
orgRouter.post('/:slug/clients', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const org = await loadOrgOr404(String(req.params.slug), res);
    if (!org) return;
    assertOrgAccess(toMemberships(org.id, org.members), req.auth!.sub, org.id, 'ADMIN');

    const schema = z.object({
      firstName: z.string().min(1).max(80),
      lastName: z.string().min(1).max(80),
      email: z.string().email(),
      assignToUserId: z.string().uuid().optional()
    });
    const data = schema.parse(req.body);
    const email = data.email.toLowerCase();

    const existingUser = await prisma.user.findUnique({ where: { email }, include: { client: true } });
    if (existingUser?.client) {
      return res.status(409).json({ error: 'A client with this email already exists' });
    }
    if (data.assignToUserId && !org.members.some((m) => m.userId === data.assignToUserId)) {
      return res.status(400).json({ error: 'assignToUserId is not a member of this organization' });
    }

    const placeholderHash = await bcrypt.hash(randomUUID() + randomUUID(), 10);
    const result = await prisma.$transaction(async (tx) => {
      const user = existingUser
        ? existingUser
        : await tx.user.create({
            data: { email, passwordHash: placeholderHash, firstName: data.firstName, lastName: data.lastName }
          });
      const client = await tx.client.create({
        data: {
          userId: user.id,
          organizationId: org.id,
          status: 'LEAD',
          customerType: 'ORG'
        }
      });
      if (data.assignToUserId) {
        await tx.clientAssignment.create({
          data: {
            organizationId: org.id,
            clientId: client.id,
            userId: data.assignToUserId,
            assignedById: req.auth!.sub
          }
        });
      }
      return { client, userId: user.id };
    });

    res.status(201).json({ client: { id: result.client.id, status: result.client.status }, userId: result.userId });
  } catch (err) {
    if (handleTenantError(err, res)) return;
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid client details', details: err.issues });
    await captureException(err, { userId: req.auth?.sub, url: req.originalUrl, method: req.method });
    next(err);
  }
});

/**
 * POST /api/org/:slug/clients/:clientId/assignments
 * Assign an org client to a member ("professional"). ADMIN+ only.
 */
orgRouter.post('/:slug/clients/:clientId/assignments', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const org = await loadOrgOr404(String(req.params.slug), res);
    if (!org) return;
    assertOrgAccess(toMemberships(org.id, org.members), req.auth!.sub, org.id, 'ADMIN');

    const { userId } = z.object({ userId: z.string().uuid() }).parse(req.body);
    const clientId = String(req.params.clientId);

    if (!org.members.some((m) => m.userId === userId)) {
      return res.status(400).json({ error: 'User is not a member of this organization' });
    }
    const client = await prisma.client.findFirst({ where: { id: clientId, organizationId: org.id }, select: { id: true } });
    if (!client) return res.status(404).json({ error: 'Client not found in this organization' });

    const assignment = await prisma.clientAssignment.upsert({
      where: { clientId_userId: { clientId, userId } },
      create: { organizationId: org.id, clientId, userId, assignedById: req.auth!.sub },
      update: {}
    });
    res.status(201).json({ assignment: { clientId: assignment.clientId, userId: assignment.userId } });
  } catch (err) {
    if (handleTenantError(err, res)) return;
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid assignment' });
    await captureException(err, { userId: req.auth?.sub, url: req.originalUrl, method: req.method });
    next(err);
  }
});

/**
 * DELETE /api/org/:slug/clients/:clientId/assignments/:userId
 * Remove an assignment. ADMIN+ only.
 */
orgRouter.delete('/:slug/clients/:clientId/assignments/:userId', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const org = await loadOrgOr404(String(req.params.slug), res);
    if (!org) return;
    assertOrgAccess(toMemberships(org.id, org.members), req.auth!.sub, org.id, 'ADMIN');

    await prisma.clientAssignment.deleteMany({
      where: { organizationId: org.id, clientId: String(req.params.clientId), userId: String(req.params.userId) }
    });
    res.json({ success: true });
  } catch (err) {
    if (handleTenantError(err, res)) return;
    await captureException(err, { userId: req.auth?.sub, url: req.originalUrl, method: req.method });
    next(err);
  }
});

// Helper: simple token hash (placeholder — use bcrypt in production)
async function hashToken(token: string): Promise<string> {
  const { createHash } = await import('crypto');
  return createHash('sha256').update(token).digest('hex');
}
