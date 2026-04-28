import { Router } from 'express';
import bcrypt from 'bcrypt';
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

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  offerInterest: z.enum(['program', 'masterclass']).optional()
});

authRouter.post('/register', async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        client: {
          create: {
            status: 'LEAD',
            progress: {
              create: {
                onboarding: { status: 'pending', signupAt: new Date().toISOString(), completedAt: null },
                education: {
                  masterclassEnrolled: data.offerInterest === 'masterclass',
                  masterclassAccess: data.offerInterest === 'masterclass',
                  masterclassProgress: [],
                  affiliateLinks: [],
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

    const token = signToken({ sub: user.id, role: user.role });
    const contractLink = `${config.appUrl.replace(/\/$/, '')}/start?token=${encodeURIComponent(token)}#onboarding`;
    const welcomeEmail = await sendWelcomeLeadEmail({
      firstName: user.firstName || '',
      email: user.email,
      contractLink
    });

    return res.status(201).json({ user, token, welcomeEmail: welcomeEmail.delivery });
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
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken({ sub: user.id, role: user.role });
    return res.json({ user, token });
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
      await sendPasswordSetupEmail({
        to: user.email,
        firstName: user.firstName,
        setupLink: link,
        purpose: data.purpose ?? 'setup',
        expiresAt
      });
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

    const token = signToken({ sub: record.user.id, role: record.user.role });
    const { passwordHash: _omit, ...safeUser } = record.user;
    return res.json({ user: safeUser, token });
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
