import { Router } from 'express';
import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../lib/jwt.js';
import { notifyNewClientSignup } from '../lib/openclaw.js';
import { sendWelcomeLeadEmail, sendPasswordSetupEmail } from '../lib/email.js';
import {
  buildPasswordSetupLink,
  consumeToken,
  findActiveTokenRecord,
  issuePasswordSetupToken
} from '../lib/passwordSetup.js';
import { config } from '../config.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { writeAuditLog } from '../lib/audit.js';

export const authRouter = Router();

const defaultAffiliateLinks = [
  { label: 'IdentityIQ Credit Monitoring', url: 'https://member.identityiq.com/help-you-to-save-money.aspx?offercode=431133V4', category: 'monitoring' },
  { label: 'MyFreeScoreNow Credit Monitoring', url: 'https://app.myfreescorenow.com/enroll/B02B3064', category: 'monitoring' },
  { label: 'Self Credit Builder', url: 'https://www.self.inc/', category: 'credit_builder' },
  { label: 'Kikoff Credit Builder', url: 'https://kikoff.com/', category: 'credit_builder' },
  { label: 'Annual Credit Report', url: 'https://www.annualcreditreport.com/', category: 'reports' }
];

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).optional(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  offerInterest: z.enum(['program', 'masterclass']).optional(),
  referralSource: z.string().max(80).optional(),
  referralDetail: z.string().max(160).optional(),
  signupIntake: z.record(z.unknown()).optional()
});

function serviceTierFromSignupIntake(intake?: Record<string, unknown>) {
  if (!intake || intake.planPath !== 'ai_assistance') return 'ESSENTIAL' as const;
  if (intake.aiPlanScope === 'family') return 'FAMILY' as const;
  if (intake.singleTier === 'aggressive') return 'AGGRESSIVE' as const;
  return 'ESSENTIAL' as const;
}

authRouter.post('/register', async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const publicPasswordCreated = typeof data.password === 'string' && data.password.length >= 8;
    const provisionalPassword = data.password ?? randomBytes(24).toString('base64url');
    const passwordHash = await bcrypt.hash(provisionalPassword, 10);
    const user = await prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        client: {
          create: {
            status: data.offerInterest === 'masterclass' ? 'STUDENT' : 'LEAD',
            serviceTier: serviceTierFromSignupIntake(data.signupIntake),
            progress: {
              create: {
                onboarding: {
                  status: 'pending',
                  signupAt: new Date().toISOString(),
                  completedAt: null,
                  referralSource: data.referralSource || null,
                  referralDetail: data.referralDetail || null,
                  initialOfferInterest: data.offerInterest || null,
                  signupIntake: (data.signupIntake || null) as any
                },
                education: {
                  masterclassEnrolled: data.offerInterest === 'masterclass',
                  masterclassAccess: data.offerInterest === 'masterclass',
                  masterclassProgress: [],
                  affiliateLinks: defaultAffiliateLinks,
                  offerEligibleUntil: data.offerInterest === 'masterclass' ? new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() : null,
                  enrolledAt: data.offerInterest === 'masterclass' ? new Date().toISOString() : null
                }
              }
            }
          }
        }
      }
    });

    await notifyNewClientSignup({
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      createdAt: user.createdAt.toISOString(),
      source: 'credx-platform-api-register'
    });

    const token = publicPasswordCreated ? signToken({ sub: user.id, role: user.role }) : null;
    let setupEmail: Awaited<ReturnType<typeof sendPasswordSetupEmail>> | null = null;
    let setupLink: string | null = null;
    if (!publicPasswordCreated) {
      const { rawToken, expiresAt } = await issuePasswordSetupToken({
        userId: user.id,
        purpose: 'setup'
      });
      setupLink = buildPasswordSetupLink(config.appUrl, rawToken);
      setupEmail = await sendPasswordSetupEmail({
        to: user.email,
        firstName: user.firstName,
        setupLink,
        purpose: 'setup',
        expiresAt
      });
    }

    const contractLink = publicPasswordCreated && token
      ? `${config.appUrl.replace(/\/$/, '')}/start?token=${encodeURIComponent(token)}#onboarding`
      : setupLink || `${config.appUrl.replace(/\/$/, '')}/portal`;
    const welcomeEmail = await sendWelcomeLeadEmail({
      firstName: user.firstName || '',
      email: user.email,
      contractLink,
      offerType: data.offerInterest
    });
    const { passwordHash: _omitPasswordHash, ...safeUser } = user;

    return res.status(201).json({
      user: safeUser,
      token,
      requiresPasswordSetup: !publicPasswordCreated,
      setupEmail: setupEmail?.delivery ?? null,
      welcomeEmail: welcomeEmail.delivery
    });
  } catch (error) {
    next(error);
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (!user) {
      await writeAuditLog({ action: 'LOGIN_FAILED', entityType: 'User', entityId: data.email.toLowerCase(), metadata: { reason: 'no_account', ip: req.ip } });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) {
      await writeAuditLog({ userId: user.id, action: 'LOGIN_FAILED', entityType: 'User', entityId: user.id, metadata: { reason: 'bad_password', ip: req.ip } });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken({ sub: user.id, role: user.role });
    await writeAuditLog({ userId: user.id, action: 'LOGIN_SUCCESS', entityType: 'User', entityId: user.id, metadata: { ip: req.ip, userAgent: req.headers['user-agent'] || null } });
    const { passwordHash: _omitPasswordHash, ...safeUser } = user;
    return res.json({ user: safeUser, token });
  } catch (error) {
    next(error);
  }
});

const passwordSetupRequestSchema = z.object({
  email: z.string().email(),
  purpose: z.enum(['setup', 'reset']).optional()
});

authRouter.post('/password-setup/request', async (req, res, next) => {
  try {
    const data = passwordSetupRequestSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });

    if (user) {
      const { rawToken, expiresAt } = await issuePasswordSetupToken({
        userId: user.id,
        purpose: data.purpose ?? 'setup'
      });
      const link = buildPasswordSetupLink(config.appUrl, rawToken);
      const delivery = await sendPasswordSetupEmail({
        to: user.email,
        firstName: user.firstName,
        setupLink: link,
        purpose: data.purpose ?? 'setup',
        expiresAt
      });

      if (delivery.delivery?.skipped) {
        return res.status(503).json({ error: 'We could not send the reset email right now. Please try again in a few minutes or contact support.' });
      }
    }

    return res.json({ success: true, message: 'If an account exists for that email, a setup link has been sent.' });
  } catch (error) {
    next(error);
  }
});

authRouter.get('/password-setup/verify', async (req, res, next) => {
  try {
    const token = String(req.query?.token ?? '');
    if (!token) return res.status(400).json({ error: 'Token is required' });

    const record = await findActiveTokenRecord(token);
    if (!record) return res.status(410).json({ error: 'Token is invalid or expired' });

    return res.json({
      valid: true,
      email: record.user.email,
      firstName: record.user.firstName,
      purpose: record.purpose,
      expiresAt: record.expiresAt.toISOString()
    });
  } catch (error) {
    next(error);
  }
});

const passwordSetupCompleteSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8)
});

authRouter.post('/password-setup/complete', async (req, res, next) => {
  try {
    const data = passwordSetupCompleteSchema.parse(req.body);
    const record = await findActiveTokenRecord(data.token);
    if (!record) return res.status(410).json({ error: 'Token is invalid or expired' });

    const passwordHash = await bcrypt.hash(data.password, 10);
    await prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash }
    });
    await consumeToken(record.id);
    await writeAuditLog({
      userId: record.userId,
      action: record.purpose === 'reset' ? 'PASSWORD_RESET' : 'PASSWORD_SET',
      entityType: 'User',
      entityId: record.userId,
      metadata: { ip: req.ip }
    });

    const token = signToken({ sub: record.user.id, role: record.user.role });
    const { passwordHash: _omit, ...safeUser } = record.user;
    return res.json({ user: safeUser, token });
  } catch (error) {
    next(error);
  }
});

const upgradeSchema = z.object({
  offerInterest: z.enum(['program', 'masterclass']),
  phone: z.string().optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  signupIntake: z.record(z.unknown()).optional()
});

authRouter.post('/upgrade', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const data = upgradeSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.sub },
      include: { client: { include: { progress: true } } }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.client?.progress) return res.status(404).json({ error: 'Client progress not found' });

    const userPatch: Record<string, unknown> = {};
    if (data.firstName && data.firstName !== user.firstName) userPatch.firstName = data.firstName;
    if (data.lastName && data.lastName !== user.lastName) userPatch.lastName = data.lastName;
    if (data.phone && data.phone !== user.phone) userPatch.phone = data.phone;
    if (Object.keys(userPatch).length) {
      await prisma.user.update({ where: { id: user.id }, data: userPatch });
    }

    if (data.signupIntake) {
      await prisma.client.update({
        where: { id: user.client.id },
        data: { serviceTier: serviceTierFromSignupIntake(data.signupIntake) }
      });
    }

    const education = (user.client.progress.education as Record<string, unknown>) || {};
    const onboarding = (user.client.progress.onboarding as Record<string, unknown>) || {};
    const upgradeHistory = Array.isArray((onboarding as any).upgradeHistory) ? [...(onboarding as any).upgradeHistory as any[]] : [];
    upgradeHistory.push({ at: new Date().toISOString(), to: data.offerInterest });

    const nextEducation = { ...education } as Record<string, unknown>;
    if (data.offerInterest === 'masterclass') {
      nextEducation.masterclassEnrolled = true;
      nextEducation.masterclassAccess = true;
      if (!nextEducation.enrolledAt) nextEducation.enrolledAt = new Date().toISOString();
      nextEducation.offerEligibleUntil = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    }

    await prisma.clientProgress.update({
      where: { clientId: user.client.id },
      data: {
        education: nextEducation as any,
        onboarding: {
          ...onboarding,
          upgradeHistory,
          lastUpgradeAt: new Date().toISOString(),
          lastOfferInterest: data.offerInterest,
          lastSignupIntake: (data.signupIntake || null) as any
        } as any
      }
    });

    const refreshed = await prisma.user.findUnique({
      where: { id: user.id },
      include: { client: { include: { progress: true } } }
    });
    const token = signToken({ sub: user.id, role: user.role });
    const { passwordHash: _omit, client, ...safeUser } = refreshed!;
    return res.json({
      user: safeUser,
      token,
      client,
      progress: client?.progress ?? null,
      offerInterest: data.offerInterest
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get('/me', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.sub },
      include: { client: { include: { progress: true } } }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { passwordHash, client, ...safeUser } = user;
    return res.json({
      ...safeUser,
      leadId: client?.id ?? null,
      portalUnlocked: !client?.portalRestricted,
      progress: client?.progress ?? null,
      client
    });
  } catch (error) {
    next(error);
  }
});
