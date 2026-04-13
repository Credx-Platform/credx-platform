import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';

export const usersRouter = Router();

usersRouter.get('/me', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.sub },
      include: { client: { include: { progress: true } } }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { passwordHash, ...profile } = user;
    return res.json(profile);
  } catch (error) {
    next(error);
  }
});

const profileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional()
});

usersRouter.put('/me/profile', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const data = profileSchema.parse(req.body);
    const updateData: Record<string, string> = {};
    if (data.firstName) updateData.firstName = data.firstName;
    if (data.lastName) updateData.lastName = data.lastName;
    if (data.phone !== undefined) updateData.phone = data.phone;

    const user = await prisma.user.update({
      where: { id: req.auth!.sub },
      data: updateData,
      select: { id: true, email: true, firstName: true, lastName: true, phone: true, role: true, createdAt: true, updatedAt: true }
    });

    return res.json(user);
  } catch (error) {
    next(error);
  }
});

usersRouter.get('/', requireAuth, requireRole(['STAFF', 'ADMIN']), async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, firstName: true, lastName: true, role: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'desc' }
    });
    return res.json(users);
  } catch (error) {
    next(error);
  }
});
