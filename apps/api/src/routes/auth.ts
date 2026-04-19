import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../lib/jwt.js';
import { notifyNewClientSignup } from '../lib/openclaw.js';
import { sendEmail, sendWelcomeLeadEmail } from '../lib/email.js';
import { config } from '../config.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional()
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
                onboarding: { status: 'pending', signupAt: new Date().toISOString(), completedAt: null }
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

    const contractLink = `${config.appUrl.replace(/\/$/, '')}/#contract`;
    const welcomeEmail = await sendWelcomeLeadEmail({
      firstName: user.firstName || '',
      email: user.email,
      contractLink
    });

    const emailResult = await sendEmail({
      to: user.email,
      subject: welcomeEmail.subject,
      html: welcomeEmail.html,
      text: welcomeEmail.text
    });

    const token = signToken({ sub: user.id, role: user.role });
    return res.status(201).json({ user, token, welcomeEmail: emailResult });
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
