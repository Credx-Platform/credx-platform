import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { captureException } from '../lib/sentry.js';
import { assertOrgAccess, TenantAccessError, type Membership } from '../lib/tenancy.js';

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

// Helper: simple token hash (placeholder — use bcrypt in production)
async function hashToken(token: string): Promise<string> {
  const { createHash } = await import('crypto');
  return createHash('sha256').update(token).digest('hex');
}
