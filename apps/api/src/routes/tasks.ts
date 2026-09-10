import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';

export const tasksRouter = Router();

const isStaff = (role?: string) => role === 'ADMIN' || role === 'STAFF';

async function clientIdFor(userId: string): Promise<string | null> {
  const c = await prisma.client.findUnique({ where: { userId }, select: { id: true } });
  return c?.id ?? null;
}

const taskInclude = {
  client: { select: { id: true, user: { select: { firstName: true, lastName: true, email: true } } } }
} as const;

type TaskRow = {
  id: string; clientId: string; title: string; description: string | null;
  category: string; priority: string; completed: boolean; completedAt: Date | null;
  dueAt: Date | null; createdBy: string | null; createdAt: Date; updatedAt: Date;
  client?: { id: string; user: { firstName: string; lastName: string; email: string } };
};

function serialize(t: TaskRow, forAdmin = false) {
  const out: Record<string, unknown> = {
    id: t.id,
    clientId: t.clientId,
    title: t.title,
    description: t.description,
    category: t.category,
    priority: t.priority,
    completed: t.completed,
    completedAt: t.completedAt,
    dueAt: t.dueAt,
    createdBy: t.createdBy,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt
  };
  if (forAdmin && t.client) {
    const u = t.client.user;
    out.clientName = `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Client';
    out.clientEmail = u.email;
  }
  return out;
}

const createSchema = z.object({
  clientId: z.string().min(1),
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  category: z.string().max(50).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  dueAt: z.string().datetime({ offset: true }).or(z.string().datetime()).optional().nullable()
});

const updateSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).optional().nullable(),
  category: z.string().max(50).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  dueAt: z.string().datetime({ offset: true }).or(z.string().datetime()).optional().nullable()
});

/**
 * GET /api/tasks
 * Admin/staff: all tasks, newest first, enriched with client info.
 * Client: only their own tasks.
 */
tasksRouter.get('/', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    if (isStaff(req.auth!.role)) {
      const tasks = await prisma.task.findMany({
        include: taskInclude,
        orderBy: [{ completed: 'asc' }, { createdAt: 'desc' }],
        take: 500
      });
      return res.json({ tasks: tasks.map(t => serialize(t, true)) });
    }
    const clientId = await clientIdFor(req.auth!.sub);
    if (!clientId) return res.json({ tasks: [] });
    const tasks = await prisma.task.findMany({
      where: { clientId },
      orderBy: [{ completed: 'asc' }, { createdAt: 'desc' }],
      take: 200
    });
    res.json({ tasks: tasks.map(t => serialize(t)) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/tasks/:id
 */
tasksRouter.get('/:id', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const task = await prisma.task.findUnique({ where: { id }, include: taskInclude });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (!isStaff(req.auth!.role)) {
      const clientId = await clientIdFor(req.auth!.sub);
      if (task.clientId !== clientId) return res.status(403).json({ error: 'Forbidden' });
    }
    res.json({ task: serialize(task, isStaff(req.auth!.role)) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/tasks — admin/staff only. Assigns a task to a client.
 */
tasksRouter.post('/', requireAuth, requireRole(['ADMIN', 'STAFF']), async (req: AuthedRequest, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    const { clientId, title, description, category, priority, dueAt } = parsed.data;

    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const task = await prisma.task.create({
      data: {
        clientId,
        title,
        description: description || null,
        category: category || 'general',
        priority: priority || 'medium',
        dueAt: dueAt ? new Date(dueAt) : null,
        createdBy: req.auth!.email || req.auth!.sub
      },
      include: taskInclude
    });

    await prisma.activityEvent.create({
      data: { clientId, type: 'task_assigned', message: `New task assigned: ${title}` }
    });

    res.status(201).json({ task: serialize(task, true) });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/tasks/:id — admin/staff only.
 */
tasksRouter.put('/:id', requireAuth, requireRole(['ADMIN', 'STAFF']), async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    const { title, description, category, priority, dueAt } = parsed.data;

    const task = await prisma.task.update({
      where: { id },
      data: {
        title: title ?? existing.title,
        description: description === undefined ? existing.description : description,
        category: category ?? existing.category,
        priority: priority ?? existing.priority,
        dueAt: dueAt === undefined ? existing.dueAt : dueAt ? new Date(dueAt) : null
      },
      include: taskInclude
    });
    res.json({ task: serialize(task, true) });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/tasks/:id/toggle — flips completed. Admin/staff any task; client only own.
 */
tasksRouter.patch('/:id/toggle', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    if (!isStaff(req.auth!.role)) {
      const clientId = await clientIdFor(req.auth!.sub);
      if (existing.clientId !== clientId) return res.status(403).json({ error: 'Forbidden' });
    }

    const completed = !existing.completed;
    const task = await prisma.task.update({
      where: { id },
      data: { completed, completedAt: completed ? new Date() : null },
      include: taskInclude
    });

    await prisma.activityEvent.create({
      data: {
        clientId: existing.clientId,
        type: completed ? 'task_completed' : 'task_reopened',
        message: completed ? `Completed: ${existing.title}` : `Reopened: ${existing.title}`
      }
    });

    res.json({ task: serialize(task, isStaff(req.auth!.role)) });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/tasks/:id — admin/staff only.
 */
tasksRouter.delete('/:id', requireAuth, requireRole(['ADMIN', 'STAFF']), async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Task not found' });
    await prisma.task.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
