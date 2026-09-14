import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';

export const saasRouter = Router();

const goalSchema = z.array(z.string().trim().min(1).max(80)).max(20);
const clientFor = async (userId: string) => prisma.client.findUnique({ where: { userId }, select: { id: true, userId: true } });
const jsonObject = z.record(z.unknown()).default({});
const asJson = (value: unknown) => value as any;

async function ownClient(req: AuthedRequest, res: any) {
  const client = await clientFor(req.auth!.sub);
  if (!client) { res.status(404).json({ error: 'Client profile not found' }); return null; }
  return client;
}

/** One durable bootstrap response for the portal. No client-side cache is authoritative. */
saasRouter.get('/state', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const client = await ownClient(req, res); if (!client) return;
    const [onboarding, lessons, quizzes, actionPlan, milestones, workflow, conversations, snapshots, notifications, subscription] = await Promise.all([
      prisma.onboardingState.findUnique({ where: { clientId: client.id } }),
      prisma.lessonCompletion.findMany({ where: { clientId: client.id }, orderBy: { completedAt: 'asc' } }),
      prisma.quizResult.findMany({ where: { clientId: client.id }, orderBy: { submittedAt: 'desc' }, take: 100 }),
      prisma.actionPlanItem.findMany({ where: { clientId: client.id }, orderBy: [{ status: 'asc' }, { createdAt: 'asc' }] }),
      prisma.milestone.findMany({ where: { clientId: client.id }, orderBy: { createdAt: 'asc' } }),
      prisma.workflowState.findUnique({ where: { clientId: client.id } }),
      prisma.cesarConversation.findMany({ where: { clientId: client.id }, orderBy: { updatedAt: 'desc' }, include: { messages: { orderBy: { createdAt: 'asc' }, take: 50 } } }),
      prisma.readinessScoreSnapshot.findMany({ where: { clientId: client.id }, orderBy: { createdAt: 'desc' }, take: 12 }),
      prisma.notification.findMany({ where: { clientId: client.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.subscription.findFirst({ where: { clientId: client.id }, orderBy: { createdAt: 'desc' }, select: { id: true, planCode: true, status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true } })
    ]);
    res.json({ onboarding, lessons, quizzes, actionPlan, milestones, workflow, conversations, readinessHistory: snapshots, notifications, subscription });
  } catch (error) { next(error); }
});

saasRouter.get('/profile', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.auth!.sub }, select: { id: true, email: true, firstName: true, lastName: true, phone: true, role: true, createdAt: true, client: true } });
    if (!user) return res.status(404).json({ error: 'Profile not found' });
    res.json({ profile: user });
  } catch (error) { next(error); }
});

saasRouter.patch('/profile', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const data = z.object({ firstName: z.string().trim().min(1).max(80).optional(), lastName: z.string().trim().min(1).max(80).optional(), phone: z.string().trim().max(40).nullable().optional() }).parse(req.body);
    const user = await prisma.user.update({ where: { id: req.auth!.sub }, data });
    res.json({ profile: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, phone: user.phone, role: user.role } });
  } catch (error) { next(error); }
});

saasRouter.put('/onboarding', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const client = await ownClient(req, res); if (!client) return;
    const data = z.object({ goals: goalSchema.optional(), status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']).optional(), currentStep: z.string().trim().min(1).max(80).optional() }).parse(req.body);
    const current = await prisma.onboardingState.findUnique({ where: { clientId: client.id } });
    const status = data.status ?? current?.status ?? 'IN_PROGRESS';
    const updated = await prisma.onboardingState.upsert({ where: { clientId: client.id }, create: { clientId: client.id, goals: data.goals ?? [], status, currentStep: data.currentStep ?? 'goals', completedAt: status === 'COMPLETED' ? new Date() : null }, update: { ...(data.goals ? { goals: data.goals } : {}), ...(data.currentStep ? { currentStep: data.currentStep } : {}), status, ...(status === 'COMPLETED' ? { completedAt: current?.completedAt ?? new Date() } : {}) } });
    res.json({ onboarding: updated });
  } catch (error) { next(error); }
});

saasRouter.post('/lessons/:lessonKey/complete', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const client = await ownClient(req, res); if (!client) return;
    const lessonKey = z.string().trim().min(1).max(120).parse(req.params.lessonKey);
    const metadata = asJson(jsonObject.parse(req.body?.metadata ?? {}));
    const completion = await prisma.lessonCompletion.upsert({ where: { clientId_lessonKey: { clientId: client.id, lessonKey } }, create: { clientId: client.id, lessonKey, metadata }, update: { metadata, completedAt: new Date() } });
    res.status(201).json({ completion });
  } catch (error) { next(error); }
});

saasRouter.post('/quizzes/:lessonKey/results', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const client = await ownClient(req, res); if (!client) return;
    const lessonKey = z.string().trim().min(1).max(120).parse(req.params.lessonKey);
    const data = z.object({ score: z.number().int().min(0).max(100), passed: z.boolean(), answers: jsonObject }).parse(req.body);
    const prior = await prisma.quizResult.aggregate({ where: { clientId: client.id, lessonKey }, _max: { attempt: true } });
    const result = await prisma.quizResult.create({ data: { clientId: client.id, lessonKey, attempt: (prior._max.attempt ?? 0) + 1, score: data.score, passed: data.passed, answers: asJson(data.answers) } });
    res.status(201).json({ result });
  } catch (error) { next(error); }
});

saasRouter.get('/action-plan', requireAuth, async (req: AuthedRequest, res, next) => {
  try { const client = await ownClient(req, res); if (!client) return; res.json({ items: await prisma.actionPlanItem.findMany({ where: { clientId: client.id }, orderBy: { createdAt: 'asc' } }) }); } catch (error) { next(error); }
});

saasRouter.put('/action-plan/:key', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const client = await ownClient(req, res); if (!client) return;
    const key = z.string().trim().min(1).max(120).parse(req.params.key);
    const data = z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(4000).nullable().optional(), category: z.string().max(80).optional(), priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(), status: z.enum(['OPEN', 'IN_PROGRESS', 'COMPLETED', 'DISMISSED']).optional(), dueAt: z.coerce.date().nullable().optional(), metadata: jsonObject.optional() }).parse(req.body);
    const item = await prisma.actionPlanItem.upsert({ where: { clientId_key: { clientId: client.id, key } }, create: { clientId: client.id, key, title: data.title, description: data.description ?? null, category: data.category ?? 'GENERAL', priority: data.priority ?? 'MEDIUM', status: data.status ?? 'OPEN', dueAt: data.dueAt ?? null, completedAt: data.status === 'COMPLETED' ? new Date() : null, metadata: asJson(data.metadata ?? {}) }, update: { title: data.title, description: data.description, category: data.category, priority: data.priority, status: data.status, dueAt: data.dueAt, completedAt: data.status === 'COMPLETED' ? new Date() : data.status ? null : undefined, metadata: data.metadata ? asJson(data.metadata) : undefined } });
    res.json({ item });
  } catch (error) { next(error); }
});

saasRouter.put('/milestones/:key', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const client = await ownClient(req, res); if (!client) return;
    const key = z.string().trim().min(1).max(120).parse(req.params.key);
    const data = z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(4000).nullable().optional(), achieved: z.boolean().optional(), metadata: jsonObject.optional() }).parse(req.body);
    const milestone = await prisma.milestone.upsert({ where: { clientId_key: { clientId: client.id, key } }, create: { clientId: client.id, key, title: data.title, description: data.description ?? null, achievedAt: data.achieved ? new Date() : null, metadata: asJson(data.metadata ?? {}) }, update: { title: data.title, description: data.description, ...(data.achieved === undefined ? {} : { achievedAt: data.achieved ? new Date() : null }), metadata: data.metadata ? asJson(data.metadata) : undefined } });
    res.json({ milestone });
  } catch (error) { next(error); }
});

saasRouter.put('/workflow', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const client = await ownClient(req, res); if (!client) return;
    const data = z.object({ stage: z.string().trim().min(1).max(80), state: jsonObject, expectedVersion: z.number().int().positive().optional() }).parse(req.body);
    const current = await prisma.workflowState.findUnique({ where: { clientId: client.id } });
    if (data.expectedVersion !== undefined && current && data.expectedVersion !== current.version) return res.status(409).json({ error: 'Workflow changed; reload and retry', currentVersion: current.version });
    const workflow = current ? await prisma.workflowState.update({ where: { clientId: client.id }, data: { stage: data.stage, state: asJson(data.state), version: { increment: 1 } } }) : await prisma.workflowState.create({ data: { clientId: client.id, stage: data.stage, state: asJson(data.state) } });
    res.json({ workflow });
  } catch (error) { next(error); }
});

saasRouter.get('/conversations', requireAuth, async (req: AuthedRequest, res, next) => {
  try { const client = await ownClient(req, res); if (!client) return; res.json({ conversations: await prisma.cesarConversation.findMany({ where: { clientId: client.id }, orderBy: { updatedAt: 'desc' }, include: { messages: { orderBy: { createdAt: 'asc' }, take: 100 } } }) }); } catch (error) { next(error); }
});

saasRouter.post('/conversations', requireAuth, async (req: AuthedRequest, res, next) => {
  try { const client = await ownClient(req, res); if (!client) return; const title = z.string().trim().max(200).nullable().optional().parse(req.body?.title); const conversation = await prisma.cesarConversation.create({ data: { clientId: client.id, title: title ?? null } }); res.status(201).json({ conversation }); } catch (error) { next(error); }
});

saasRouter.post('/conversations/:id/messages', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const client = await ownClient(req, res); if (!client) return;
    const data = z.object({ role: z.enum(['user', 'assistant', 'system']), content: z.string().trim().min(1).max(20000), metadata: jsonObject.optional() }).parse(req.body);
    const conversation = await prisma.cesarConversation.findFirst({ where: { id: String(req.params.id), clientId: client.id }, select: { id: true } });
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    const [message] = await prisma.$transaction([prisma.cesarMessage.create({ data: { conversationId: conversation.id, role: data.role, content: data.content, metadata: asJson(data.metadata ?? {}) } }), prisma.cesarConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } })]);
    res.status(201).json({ message });
  } catch (error) { next(error); }
});

saasRouter.post('/export', requireAuth, async (req: AuthedRequest, res, next) => {
  try { const client = await ownClient(req, res); if (!client) return; const existing = await prisma.dataExportRequest.findFirst({ where: { clientId: client.id, status: { in: ['REQUESTED', 'PROCESSING'] } }, orderBy: { requestedAt: 'desc' } }); const request = existing ?? await prisma.dataExportRequest.create({ data: { clientId: client.id } }); res.status(existing ? 200 : 201).json({ request }); } catch (error) { next(error); }
});

saasRouter.post('/deletion', requireAuth, async (req: AuthedRequest, res, next) => {
  try { const client = await ownClient(req, res); if (!client) return; const reason = z.string().trim().max(1000).nullable().optional().parse(req.body?.reason); const existing = await prisma.accountDeletionRequest.findFirst({ where: { clientId: client.id, status: { in: ['REQUESTED', 'UNDER_REVIEW'] } }, orderBy: { requestedAt: 'desc' } }); const request = existing ?? await prisma.accountDeletionRequest.create({ data: { clientId: client.id, reason: reason ?? null } }); res.status(existing ? 200 : 201).json({ request }); } catch (error) { next(error); }
});

saasRouter.get('/admin/overview', requireAuth, requireRole(['STAFF', 'ADMIN']), async (_req, res, next) => {
  try { const [clients, users, pendingExports, pendingDeletions, unreadNotifications] = await Promise.all([prisma.client.count(), prisma.user.count(), prisma.dataExportRequest.count({ where: { status: 'REQUESTED' } }), prisma.accountDeletionRequest.count({ where: { status: 'REQUESTED' } }), prisma.notification.count({ where: { readAt: null } })]); res.json({ clients, users, pendingExports, pendingDeletions, unreadNotifications }); } catch (error) { next(error); }
});
