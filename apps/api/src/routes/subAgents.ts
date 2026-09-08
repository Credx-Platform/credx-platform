import { Router } from 'express';
import bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { config } from '../config.js';
import { sendAffiliateOnboardingEmail, sendPasswordSetupEmail } from '../lib/email.js';
import { buildPasswordSetupLink, issuePasswordSetupToken } from '../lib/passwordSetup.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';

export const subAgentsRouter = Router();

const subAgentSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(40).optional().or(z.literal('')),
  referralCode: z.string().max(80).optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal(''))
});

const contactSchema = z.object({
  status: z.string().max(40).optional(),
  firstName: z.string().max(80).optional().or(z.literal('')),
  lastName: z.string().max(80).optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(40).optional().or(z.literal('')),
  creditGoal: z.string().max(500).optional().or(z.literal('')),
  sourceUrl: z.string().max(1000).optional().or(z.literal('')),
  landingPath: z.string().max(500).optional().or(z.literal(''))
});

const agreementSchema = z.object({
  signature: z.string().min(2).max(160),
  accepted: z.literal(true)
});

function cleanOptional(value?: string) {
  const next = value?.trim();
  return next ? next : null;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

async function uniqueReferralCode(seed: string) {
  const base = slugify(seed) || `agent-${Math.random().toString(36).slice(2, 8)}`;
  let code = base;
  let counter = 2;

  while (await prisma.subAgent.findUnique({ where: { referralCode: code } })) {
    code = `${base}-${counter}`;
    counter += 1;
  }

  return code;
}

async function uniqueSubAgentAffiliateId() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const affiliateId = `AFF-${randomBytes(4).toString('hex').toUpperCase()}`;
    const existing = await prisma.subAgent.findUnique({ where: { affiliateId } });
    if (!existing) return affiliateId;
  }
  return `AFF-${randomBytes(8).toString('hex').toUpperCase()}`;
}

function clientIp(req: any) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0]?.trim();
  return forwarded || req.ip || null;
}

function firstHeader(req: any, names: string[]) {
  for (const name of names) {
    const value = req.headers[name];
    if (Array.isArray(value) && value[0]) return String(value[0]);
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function clickLocation(req: any) {
  const city = firstHeader(req, ['x-vercel-ip-city', 'cf-ipcity', 'x-geo-city']);
  const region = firstHeader(req, ['x-vercel-ip-country-region', 'cf-region', 'x-geo-region']);
  const country = firstHeader(req, ['x-vercel-ip-country', 'cf-ipcountry', 'x-geo-country']);
  const location = [city, region, country].filter(Boolean).join(', ') || null;
  return { city, region, country, location };
}

function hashToken(rawToken: string) {
  return createHash('sha256').update(rawToken).digest('hex');
}

function appBaseUrl() {
  return config.appUrl.replace(/\/$/, '');
}

function affiliateAuthEmail(subAgentId: string) {
  return `affiliate-${subAgentId}@auth.credx.local`;
}

async function uniqueAffiliateAuthEmail(subAgentId: string) {
  const base = affiliateAuthEmail(subAgentId);
  const existing = await prisma.user.findUnique({ where: { email: base } });
  if (!existing) return base;
  return `affiliate-${subAgentId}-${randomBytes(3).toString('hex')}@auth.credx.local`;
}

function referralUrl(code: string) {
  return `${appBaseUrl()}/api/sub-agents/track/${encodeURIComponent(code)}`;
}

async function issueAffiliateOnboardingToken(subAgentId: string) {
  const rawToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.subAgent.update({
    where: { id: subAgentId },
    data: {
      onboardingTokenHash: hashToken(rawToken),
      onboardingTokenExpiresAt: expiresAt
    }
  });
  return { rawToken, expiresAt };
}

function affiliateOnboardingUrl(rawToken: string) {
  return `${appBaseUrl()}/affiliate-onboarding?token=${encodeURIComponent(rawToken)}`;
}

async function sendOnboardingForSubAgent(subAgent: {
  id: string;
  name: string;
  email: string | null;
  affiliateId: string;
  referralCode: string;
}) {
  if (!subAgent.email) {
    return { skipped: true, reason: 'Sub-agent email is missing' };
  }
  const { rawToken, expiresAt } = await issueAffiliateOnboardingToken(subAgent.id);
  const result = await sendAffiliateOnboardingEmail({
    to: subAgent.email,
    name: subAgent.name,
    affiliateId: subAgent.affiliateId,
    referralCode: subAgent.referralCode,
    referralLink: referralUrl(subAgent.referralCode),
    onboardingLink: affiliateOnboardingUrl(rawToken)
  });
  return { ...result.delivery, expiresAt };
}

subAgentsRouter.get('/', requireAuth, requireRole(['STAFF', 'ADMIN']), async (_req, res, next) => {
  try {
    const subAgents = await prisma.subAgent.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        contacts: {
          orderBy: { createdAt: 'desc' }
        },
        referredClients: {
          select: {
            id: true,
            status: true,
            createdAt: true,
            user: { select: { firstName: true, lastName: true, email: true } }
          },
          orderBy: { createdAt: 'desc' },
          take: 100
        }
      }
    });

    return res.json({ subAgents });
  } catch (error) {
    next(error);
  }
});

subAgentsRouter.post('/', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const data = subAgentSchema.parse(req.body);
    const referralCode = await uniqueReferralCode(data.referralCode || data.name);
    const subAgent = await prisma.subAgent.create({
      data: {
        name: data.name.trim(),
        affiliateId: await uniqueSubAgentAffiliateId(),
        email: cleanOptional(data.email),
        phone: cleanOptional(data.phone),
        referralCode,
        notes: cleanOptional(data.notes)
      },
      include: { contacts: true }
    });
    const onboardingEmail = await sendOnboardingForSubAgent(subAgent);

    return res.status(201).json({ subAgent, onboardingEmail });
  } catch (error) {
    next(error);
  }
});

subAgentsRouter.post('/:id/onboarding-email', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const subAgent = await prisma.subAgent.findUnique({ where: { id: String(req.params.id) } });
    if (!subAgent) return res.status(404).json({ error: 'Sub-agent not found' });
    const delivery = await sendOnboardingForSubAgent(subAgent);
    return res.json({ success: !delivery.skipped, delivery });
  } catch (error) {
    next(error);
  }
});

subAgentsRouter.delete('/:id', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const subAgent = await prisma.subAgent.findUnique({ where: { id } });
    if (!subAgent) return res.status(404).json({ error: 'Sub-agent not found' });

    await prisma.$transaction([
      prisma.client.updateMany({
        where: { referredBySubAgentId: id },
        data: {
          referredBySubAgentId: null,
          customerType: 'FORMER_SUB_AGENT_REFERRAL'
        }
      }),
      prisma.subAgent.delete({ where: { id } })
    ]);

    return res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

subAgentsRouter.patch('/:id', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const data = subAgentSchema.partial().extend({
      status: z.enum(['ACTIVE', 'PAUSED']).optional()
    }).parse(req.body);

    const subAgent = await prisma.subAgent.update({
      where: { id: String(req.params.id) },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.email !== undefined ? { email: cleanOptional(data.email) } : {}),
        ...(data.phone !== undefined ? { phone: cleanOptional(data.phone) } : {}),
        ...(data.notes !== undefined ? { notes: cleanOptional(data.notes) } : {}),
        ...(data.status !== undefined ? { status: data.status } : {})
      },
      include: {
        contacts: { orderBy: { createdAt: 'desc' }, take: 50 }
      }
    });

    return res.json({ subAgent });
  } catch (error) {
    next(error);
  }
});

subAgentsRouter.get('/me', requireAuth, requireRole(['AFFILIATE']), async (req: AuthedRequest, res, next) => {
  try {
    const subAgent = await prisma.subAgent.findUnique({
      where: { adminUserId: req.auth!.sub },
      include: {
        contacts: { orderBy: { createdAt: 'desc' }, take: 200 },
        referredClients: {
          select: {
            id: true,
            status: true,
            createdAt: true,
            user: { select: { firstName: true, lastName: true, email: true } }
          },
          orderBy: { createdAt: 'desc' },
          take: 50
        }
      }
    });
    if (!subAgent) return res.status(404).json({ error: 'Affiliate profile not found' });
    return res.json({ subAgent });
  } catch (error) {
    next(error);
  }
});

subAgentsRouter.get('/onboarding/:token', async (req, res, next) => {
  try {
    const tokenHash = hashToken(String(req.params.token || ''));
    const subAgent = await prisma.subAgent.findUnique({
      where: { onboardingTokenHash: tokenHash },
      select: {
        id: true,
        name: true,
        email: true,
        affiliateId: true,
        referralCode: true,
        onboardingTokenExpiresAt: true,
        policyAcceptedAt: true
      }
    });
    if (!subAgent || !subAgent.onboardingTokenExpiresAt || subAgent.onboardingTokenExpiresAt.getTime() < Date.now()) {
      return res.status(410).json({ error: 'Affiliate onboarding link is invalid or expired' });
    }
    return res.json({
      subAgent: {
        name: subAgent.name,
        email: subAgent.email,
        affiliateId: subAgent.affiliateId,
        referralCode: subAgent.referralCode,
        referralLink: referralUrl(subAgent.referralCode),
        policyAcceptedAt: subAgent.policyAcceptedAt
      }
    });
  } catch (error) {
    next(error);
  }
});

subAgentsRouter.post('/onboarding/:token/sign', async (req, res, next) => {
  try {
    const data = agreementSchema.parse(req.body);
    const tokenHash = hashToken(String(req.params.token || ''));
    const subAgent = await prisma.subAgent.findUnique({ where: { onboardingTokenHash: tokenHash } });
    if (!subAgent || !subAgent.email || !subAgent.onboardingTokenExpiresAt || subAgent.onboardingTokenExpiresAt.getTime() < Date.now()) {
      return res.status(410).json({ error: 'Affiliate onboarding link is invalid or expired' });
    }

    const email = subAgent.email.toLowerCase();
    const provisionalPassword = randomBytes(24).toString('base64url');
    const passwordHash = await bcrypt.hash(provisionalPassword, 10);
    const [firstName, ...lastParts] = subAgent.name.trim().split(/\s+/);
    const lastName = lastParts.join(' ') || 'Affiliate';
    const existingEmailUser = await prisma.user.findUnique({
      where: { email },
      include: { client: true, subAgentProfile: true }
    });
    const user = subAgent.adminUserId
      ? await prisma.user.update({
          where: { id: subAgent.adminUserId },
          data: {
            role: 'AFFILIATE',
            firstName: firstName || subAgent.name,
            lastName,
            phone: subAgent.phone || undefined
          }
        })
      : existingEmailUser && !existingEmailUser.client && existingEmailUser.role === 'AFFILIATE' && !existingEmailUser.subAgentProfile
        ? await prisma.user.update({
            where: { id: existingEmailUser.id },
            data: {
              role: 'AFFILIATE',
              firstName: firstName || subAgent.name,
              lastName,
              phone: subAgent.phone || undefined
            }
          })
        : await prisma.user.create({
            data: {
              email: await uniqueAffiliateAuthEmail(subAgent.id),
              passwordHash,
              role: 'AFFILIATE',
              firstName: firstName || subAgent.name,
              lastName,
              phone: subAgent.phone || null
            }
          });

    await prisma.subAgent.update({
      where: { id: subAgent.id },
      data: {
        adminUserId: user.id,
        policyAcceptedAt: new Date(),
        policySignature: data.signature.trim(),
        policyIpAddress: clientIp(req),
        onboardingTokenHash: null,
        onboardingTokenExpiresAt: null
      }
    });

    const { rawToken, expiresAt } = await issuePasswordSetupToken({
      userId: user.id,
      purpose: 'setup',
      ttlHours: 72
    });
    const setupLink = `${buildPasswordSetupLink(config.appUrl, rawToken)}&next=affiliate-admin`;
    await sendPasswordSetupEmail({
      to: user.email,
      firstName: user.firstName,
      setupLink,
      purpose: 'setup',
      expiresAt
    });

    return res.json({ success: true, setupLink, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    next(error);
  }
});

const affiliateLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

subAgentsRouter.post('/login', async (req, res, next) => {
  try {
    const data = affiliateLoginSchema.parse(req.body);
    const subAgent = await prisma.subAgent.findFirst({
      where: { email: data.email.toLowerCase(), status: 'ACTIVE', adminUserId: { not: null } },
      include: { adminUser: true }
    });
    if (!subAgent?.adminUser) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(data.password, subAgent.adminUser.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = await import('../lib/jwt.js').then(({ signToken }) => signToken({ sub: subAgent.adminUser!.id, role: 'AFFILIATE' }));
    const { passwordHash: _omitPasswordHash, ...safeUser } = subAgent.adminUser;
    return res.json({
      user: {
        ...safeUser,
        email: subAgent.email || safeUser.email,
        role: 'AFFILIATE'
      },
      token
    });
  } catch (error) {
    next(error);
  }
});

subAgentsRouter.post('/:code/contacts', async (req, res, next) => {
  try {
    const subAgent = await prisma.subAgent.findUnique({ where: { referralCode: req.params.code } });
    if (!subAgent || subAgent.status !== 'ACTIVE') return res.status(404).json({ error: 'Sub-agent link not found' });

    const data = contactSchema.parse(req.body || {});
    const location = clickLocation(req);
    const contact = await prisma.subAgentContact.create({
      data: {
        subAgentId: subAgent.id,
        status: cleanOptional(data.status) || (data.email ? 'CONTACT_SUBMITTED' : 'CLICKED'),
        firstName: cleanOptional(data.firstName),
        lastName: cleanOptional(data.lastName),
        email: cleanOptional(data.email),
        phone: cleanOptional(data.phone),
        creditGoal: cleanOptional(data.creditGoal),
        sourceUrl: cleanOptional(data.sourceUrl),
        landingPath: cleanOptional(data.landingPath),
        ipAddress: clientIp(req),
        city: location.city,
        region: location.region,
        country: location.country,
        location: location.location,
        userAgent: String(req.headers['user-agent'] || '') || null
      }
    });

    return res.status(201).json({ contact });
  } catch (error) {
    next(error);
  }
});

subAgentsRouter.get('/track/:code', async (req, res, next) => {
  try {
    const subAgent = await prisma.subAgent.findUnique({ where: { referralCode: req.params.code } });
    if (!subAgent || subAgent.status !== 'ACTIVE') return res.redirect('/signup');

    const location = clickLocation(req);
    await prisma.subAgentContact.create({
      data: {
        subAgentId: subAgent.id,
        status: 'CLICKED',
        sourceUrl: String(req.headers.referer || '') || null,
        landingPath: `/api/sub-agents/track/${subAgent.referralCode}`,
        ipAddress: clientIp(req),
        city: location.city,
        region: location.region,
        country: location.country,
        location: location.location,
        userAgent: String(req.headers['user-agent'] || '') || null
      }
    });

    const params = new URLSearchParams({
      ref: 'sub-agent',
      agent: subAgent.referralCode,
      agentName: subAgent.name,
      tracked: '1'
    });
    return res.redirect(`/signup?${params.toString()}`);
  } catch (error) {
    next(error);
  }
});
