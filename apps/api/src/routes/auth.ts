import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../lib/jwt.js';
import { notifyNewClientSignup } from '../lib/openclaw.js';

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

    const token = signToken({ sub: user.id, role: user.role });
    return res.status(201).json({ user, token });
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
