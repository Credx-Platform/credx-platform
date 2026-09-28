import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';
import { writeAuditLog } from '../lib/audit.js';
import { decryptPII, encryptPII } from '../lib/encryption.js';
import { notifyNewAgentApplication, sendAffiliateOnboardingEmail, sendAgentApplicationReceivedEmail } from '../lib/email.js';
import { logTurnstileRejection, verifyTurnstileFromBody } from '../lib/turnstile.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';

export const agentApplicationsRouter = Router();

export const AGENT_EXPERIENCE_OPTIONS = [
  'None — new and ready to learn',
  'Some — referred or assisted clients',
  'Experienced — run or ran a credit business',
  'Licensed professional (real estate, lending, insurance, etc.)'
] as const;

export const AGENT_APPLICATION_STATUSES = ['NEW', 'CONTACTED', 'APPROVED', 'DECLINED'] as const;
export const CREATOR_PARTNER_POLICY_VERSION = 'creator-partner-v1-2026-09-28';

const CREATOR_PLATFORM_OPTIONS = ['Instagram', 'TikTok', 'YouTube', 'Facebook', 'Podcast', 'Email / newsletter', 'Community / events', 'Professional referrals', 'Other'] as const;
const CREATOR_AUDIENCE_OPTIONS = ['Under 1,000', '1,000–4,999', '5,000–9,999', '10,000–24,999', '25,000–49,999', '50,000+'] as const;

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));
const optionalPublicUrl = z.string().trim().max(500).refine((value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}, 'Use a complete http:// or https:// profile URL').optional().or(z.literal(''));

const createAgentApplicationSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().trim().max(40).refine((v) => v.replace(/\D/g, '').length >= 10, 'Phone number must have at least 10 digits'),
  state: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Use a 2-letter state code').optional().or(z.literal('')),
  experience: z.enum(AGENT_EXPERIENCE_OPTIONS).optional().or(z.literal('')),
  primaryPlatform: z.enum(CREATOR_PLATFORM_OPTIONS).optional().or(z.literal('')),
  audienceSize: z.enum(CREATOR_AUDIENCE_OPTIONS).optional().or(z.literal('')),
  socialProfile: optionalPublicUrl,
  contentFocus: optionalText(1000),
  motivation: optionalText(2000),
  source: optionalText(80),
  consent: z.literal(true)
});

const updateAgentApplicationSchema = z.object({
  status: z.enum(AGENT_APPLICATION_STATUSES)
});

function clientIp(req: any) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0]?.trim();
  return forwarded || req.ip || null;
}

agentApplicationsRouter.post('/', async (req, res, next) => {
  try {
    const captcha = await verifyTurnstileFromBody(req.body, req.ip);
    if (!captcha.ok) {
      logTurnstileRejection('/api/agent-applications', captcha, {
        hasToken: Boolean(req.body?.turnstileToken || req.body?.['cf-turnstile-response']),
        referer: req.headers.referer,
        origin: req.headers.origin,
        userAgent: req.headers['user-agent']
      });
      return res.status(400).json({ error: captcha.reason || 'CAPTCHA verification failed' });
    }
    const data = createAgentApplicationSchema.parse(req.body);

    const application = await prisma.agentApplication.create({
      data: {
        firstNameEncrypted: encryptPII(data.firstName)!,
        lastNameEncrypted: encryptPII(data.lastName)!,
        emailEncrypted: encryptPII(data.email)!,
        phoneEncrypted: encryptPII(data.phone)!,
        motivationEncrypted: encryptPII(data.motivation),
        socialProfileEncrypted: encryptPII(data.socialProfile),
        contentFocusEncrypted: encryptPII(data.contentFocus),
        state: data.state || null,
        experience: data.experience || null,
        primaryPlatform: data.primaryPlatform || null,
        audienceSize: data.audienceSize || null,
        source: data.source || 'agent_page',
        consentAt: new Date(),
        ipAddress: clientIp(req),
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 500) : null
      },
      select: { id: true, status: true, createdAt: true }
    });

    await writeAuditLog({
      action: 'AGENT_APPLICATION_SUBMITTED',
      entityType: 'AgentApplication',
      entityId: application.id,
      metadata: { state: data.state || null, source: data.source || 'agent_page' }
    });

    // Email failures never fail the submission: the row is already saved and
    // staff can see it in the admin list.
    const [ack, staff] = await Promise.allSettled([
      sendAgentApplicationReceivedEmail({ applicationId: application.id, to: data.email, firstName: data.firstName }),
      notifyNewAgentApplication({
        applicationId: application.id,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        state: data.state || null,
        experience: data.experience || null,
        primaryPlatform: data.primaryPlatform || null,
        audienceSize: data.audienceSize || null,
        socialProfile: data.socialProfile || null,
        contentFocus: data.contentFocus || null,
        motivation: data.motivation || null
      })
    ]);

    return res.status(201).json({
      application,
      message: 'Agent application received.',
      emails: {
        applicant: ack.status === 'fulfilled' ? ack.value.delivery : { skipped: true, reason: 'send failed' },
        staff: staff.status === 'fulfilled' ? staff.value : { skipped: true, reason: 'send failed' }
      }
    });
  } catch (error) {
    next(error);
  }
});

agentApplicationsRouter.get('/', requireAuth, requireRole(['STAFF', 'ADMIN']), async (_req, res, next) => {
  try {
    const rows = await prisma.agentApplication.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
    const applications = rows.map((row) => ({
      id: row.id,
      status: row.status,
      firstName: decryptPII(row.firstNameEncrypted),
      lastName: decryptPII(row.lastNameEncrypted),
      email: decryptPII(row.emailEncrypted),
      phone: decryptPII(row.phoneEncrypted),
      motivation: decryptPII(row.motivationEncrypted),
      socialProfile: decryptPII(row.socialProfileEncrypted),
      contentFocus: decryptPII(row.contentFocusEncrypted),
      state: row.state,
      experience: row.experience,
      primaryPlatform: row.primaryPlatform,
      audienceSize: row.audienceSize,
      source: row.source,
      consentAt: row.consentAt,
      reviewedAt: row.reviewedAt,
      createdAt: row.createdAt
    }));
    return res.json({ applications });
  } catch (error) {
    next(error);
  }
});

agentApplicationsRouter.patch('/:id', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req: AuthedRequest, res, next) => {
  try {
    const { status } = updateAgentApplicationSchema.parse(req.body);
    if (status === 'APPROVED') {
      return res.status(400).json({ error: 'Use the approve endpoint so the Creator Partner account and agreement are created together.' });
    }
    const existing = await prisma.agentApplication.findUnique({ where: { id: String(req.params.id) }, select: { id: true } });
    if (!existing) return res.status(404).json({ error: 'Agent application not found' });

    const application = await prisma.agentApplication.update({
      where: { id: existing.id },
      data: { status, reviewedAt: new Date(), reviewedById: req.auth?.sub ?? null },
      select: { id: true, status: true, reviewedAt: true }
    });
    await writeAuditLog({
      userId: req.auth?.sub ?? null,
      action: 'AGENT_APPLICATION_STATUS_CHANGED',
      entityType: 'AgentApplication',
      entityId: application.id,
      metadata: { status }
    });
    return res.json({ application });
  } catch (error) {
    next(error);
  }
});

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

async function uniqueReferralCode(seed: string) {
  const base = slugify(seed) || `creator-${randomBytes(3).toString('hex')}`;
  let code = base;
  let counter = 2;
  while (await prisma.subAgent.findUnique({ where: { referralCode: code } })) code = `${base}-${counter++}`;
  return code;
}

async function uniqueAffiliateId() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const affiliateId = `AFF-${randomBytes(4).toString('hex').toUpperCase()}`;
    if (!(await prisma.subAgent.findUnique({ where: { affiliateId } }))) return affiliateId;
  }
  return `AFF-${randomBytes(8).toString('hex').toUpperCase()}`;
}

agentApplicationsRouter.post('/:id/approve', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req: AuthedRequest, res, next) => {
  try {
    const existing = await prisma.agentApplication.findUnique({
      where: { id: String(req.params.id) },
      include: { approvedSubAgent: true }
    });
    if (!existing) return res.status(404).json({ error: 'Creator Partner application not found' });
    if (existing.approvedSubAgent) {
      return res.json({
        application: { id: existing.id, status: existing.status },
        subAgent: existing.approvedSubAgent,
        alreadyApproved: true
      });
    }

    const firstName = decryptPII(existing.firstNameEncrypted) || '';
    const lastName = decryptPII(existing.lastNameEncrypted) || '';
    const email = decryptPII(existing.emailEncrypted) || '';
    const phone = decryptPII(existing.phoneEncrypted) || '';
    if (!email) return res.status(409).json({ error: 'The application has no usable email address' });

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const referralCode = await uniqueReferralCode(`${firstName}-${lastName}`);
    const affiliateId = await uniqueAffiliateId();
    const name = `${firstName} ${lastName}`.trim();

    const subAgent = await prisma.$transaction(async (tx) => {
      const created = await tx.subAgent.create({
        data: {
          applicationId: existing.id,
          name,
          email: email.toLowerCase(),
          phone: phone || null,
          affiliateId,
          referralCode,
          programTier: 'CREATOR',
          initialCommissionBps: 3000,
          recurringCommissionBps: 1500,
          recurringMonths: 12,
          overrideCommissionBps: 500,
          payoutHoldDays: 30,
          policyVersion: CREATOR_PARTNER_POLICY_VERSION,
          onboardingTokenHash: tokenHash,
          onboardingTokenExpiresAt: expiresAt,
          notes: `Approved from Creator Partner application ${existing.id}`
        }
      });
      await tx.agentApplication.update({
        where: { id: existing.id },
        data: { status: 'APPROVED', reviewedAt: new Date(), reviewedById: req.auth?.sub ?? null }
      });
      return created;
    });

    const appUrl = config.appUrl.replace(/\/$/, '');
    const onboardingLink = `${appUrl}/affiliate-onboarding?token=${encodeURIComponent(rawToken)}`;
    const referralLink = `${appUrl}/api/sub-agents/track/${encodeURIComponent(referralCode)}`;
    const emailResult = await sendAffiliateOnboardingEmail({
      to: email,
      name,
      affiliateId,
      referralCode,
      referralLink,
      onboardingLink
    }).catch(() => null);

    await writeAuditLog({
      userId: req.auth?.sub ?? null,
      action: 'CREATOR_PARTNER_APPROVED',
      entityType: 'AgentApplication',
      entityId: existing.id,
      metadata: { subAgentId: subAgent.id, programTier: subAgent.programTier, policyVersion: CREATOR_PARTNER_POLICY_VERSION }
    });

    return res.json({
      application: { id: existing.id, status: 'APPROVED' },
      subAgent,
      onboardingEmail: emailResult?.delivery || { skipped: true, reason: 'send failed' }
    });
  } catch (error) {
    next(error);
  }
});
