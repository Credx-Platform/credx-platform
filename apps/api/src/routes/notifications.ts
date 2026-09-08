import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';

export const notificationsRouter = Router();

async function clientIdFor(userId: string): Promise<string | null> {
  const c = await prisma.client.findUnique({ where: { userId }, select: { id: true } });
  return c?.id ?? null;
}

function serialize(n: any) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    href: n.href,
    metadata: n.metadata,
    read: n.readAt != null,
    createdAt: n.createdAt
  };
}

/**
 * GET /api/notifications?unreadOnly=1&limit=20
 * The caller's notifications, newest first, plus the unread count.
 */
notificationsRouter.get('/', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const clientId = await clientIdFor(req.auth!.sub);
    if (!clientId) return res.json({ notifications: [], unreadCount: 0 });

    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const unreadOnly = req.query.unreadOnly === '1' || req.query.unreadOnly === 'true';

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { clientId, ...(unreadOnly ? { readAt: null } : {}) },
        orderBy: { createdAt: 'desc' },
        take: limit
      }),
      prisma.notification.count({ where: { clientId, readAt: null } })
    ]);

    res.json({ notifications: notifications.map(serialize), unreadCount });
  } catch (err) {
    next(err);
  }
});

/** POST /api/notifications/:id/read — mark one notification read (own only). */
notificationsRouter.post('/:id/read', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const clientId = await clientIdFor(req.auth!.sub);
    if (!clientId) return res.status(404).json({ error: 'Client profile not found' });

    const result = await prisma.notification.updateMany({
      where: { id: String(req.params.id), clientId, readAt: null },
      data: { readAt: new Date() }
    });
    res.json({ updated: result.count });
  } catch (err) {
    next(err);
  }
});

/** POST /api/notifications/read-all — mark every unread notification read. */
notificationsRouter.post('/read-all', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const clientId = await clientIdFor(req.auth!.sub);
    if (!clientId) return res.status(404).json({ error: 'Client profile not found' });

    const result = await prisma.notification.updateMany({
      where: { clientId, readAt: null },
      data: { readAt: new Date() }
    });
    res.json({ updated: result.count });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/notifications/test — dev-only: create a SYSTEM notification for the
 * caller so the bell UI can be exercised without waiting on a producer.
 */
notificationsRouter.post('/test', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production') return res.status(404).json({ error: 'Not found' });
    const clientId = await clientIdFor(req.auth!.sub);
    if (!clientId) return res.status(404).json({ error: 'Client profile not found' });
    const { title, body } = z.object({ title: z.string().max(200).optional(), body: z.string().max(2000).optional() }).parse(req.body ?? {});
    const n = await prisma.notification.create({
      data: { clientId, type: 'SYSTEM', title: title || 'Test notification', body: body ?? null, href: '/portal' }
    });
    res.status(201).json({ notification: serialize(n) });
  } catch (err) {
    next(err);
  }
});
