import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { writeAuditLog } from '../lib/audit.js';
import { enqueueJob } from '../lib/jobs.js';
import {
  findPrivacySecurityAction,
  PRIVACY_SECURITY_AGENCIES,
  privacySecurityActionTitle,
  privacySecurityRequestKey,
  type PrivacySecurityCommand
} from '../lib/privacySecurity.js';

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
    await writeAuditLog({ userId: req.auth!.sub, action: 'SAAS_ONBOARDING_UPDATED', entityType: 'OnboardingState', entityId: updated.id, metadata: { currentStep: updated.currentStep, status: updated.status } });
    res.json({ onboarding: updated });
  } catch (error) { next(error); }
});

saasRouter.post('/lessons/:lessonKey/complete', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const client = await ownClient(req, res); if (!client) return;
    const lessonKey = z.string().trim().min(1).max(120).parse(req.params.lessonKey);
    const metadata = asJson(jsonObject.parse(req.body?.metadata ?? {}));
    const completion = await prisma.lessonCompletion.upsert({ where: { clientId_lessonKey: { clientId: client.id, lessonKey } }, create: { clientId: client.id, lessonKey, metadata }, update: { metadata, completedAt: new Date() } });
    await writeAuditLog({ userId: req.auth!.sub, action: 'SAAS_LESSON_COMPLETED', entityType: 'LessonCompletion', entityId: completion.id, metadata: { lessonKey } });
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
    await writeAuditLog({ userId: req.auth!.sub, action: 'SAAS_QUIZ_SUBMITTED', entityType: 'QuizResult', entityId: result.id, metadata: { lessonKey, score: data.score, passed: data.passed } });
    res.status(201).json({ result });
  } catch (error) { next(error); }
});

saasRouter.get('/action-plan', requireAuth, async (req: AuthedRequest, res, next) => {
  try { const client = await ownClient(req, res); if (!client) return; res.json({ items: await prisma.actionPlanItem.findMany({ where: { clientId: client.id }, orderBy: { createdAt: 'asc' } }) }); } catch (error) { next(error); }
});

saasRouter.get('/privacy-security', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const client = await ownClient(req, res); if (!client) return;
    const requests = await prisma.actionPlanItem.findMany({
      where: { clientId: client.id, category: 'PRIVACY_SECURITY' },
      orderBy: { updatedAt: 'desc' }
    });
    res.json({ agencies: PRIVACY_SECURITY_AGENCIES, requests });
  } catch (error) { next(error); }
});

saasRouter.post('/privacy-security/requests', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const client = await ownClient(req, res); if (!client) return;
    const data = z.object({
      agencyCode: z.string().trim().min(1).max(80),
      command: z.enum(['FREEZE', 'UNFREEZE', 'REQUEST_REPORT', 'OPT_OUT', 'DISPUTE']),
      consent: z.literal(true)
    }).parse(req.body);
    const matched = findPrivacySecurityAction(data.agencyCode, data.command);
    if (!matched) return res.status(400).json({ error: 'That action is not available for this reporting company.' });

    const now = new Date();
    const key = privacySecurityRequestKey(matched.agency.code, data.command);
    const title = privacySecurityActionTitle(matched.agency.name, data.command as PrivacySecurityCommand);
    const metadata = {
      agencyCode: matched.agency.code,
      agencyName: matched.agency.name,
      command: data.command,
      stage: 'REQUESTED',
      officialUrl: matched.action.url,
      requestedAt: now.toISOString(),
      consentRecordedAt: now.toISOString(),
      automationScope: 'PREPARATION_TRACKING_AND_CLIENT_HANDOFF',
      clientActionRequired: true
    };

    const request = await prisma.$transaction(async (tx) => {
      const item = await tx.actionPlanItem.upsert({
        where: { clientId_key: { clientId: client.id, key } },
        create: {
          clientId: client.id,
          key,
          title,
          description: `CredX will prepare and track this ${matched.agency.name} request. The client completes any required identity verification, credentials, CAPTCHA, and final authorization on the official site.`,
          category: 'PRIVACY_SECURITY',
          priority: data.command === 'DISPUTE' ? 'HIGH' : 'MEDIUM',
          status: 'OPEN',
          metadata: metadata as any
        },
        update: {
          title,
          description: `CredX will prepare and track this ${matched.agency.name} request. The client completes any required identity verification, credentials, CAPTCHA, and final authorization on the official site.`,
          priority: data.command === 'DISPUTE' ? 'HIGH' : 'MEDIUM',
          status: 'OPEN',
          completedAt: null,
          metadata: metadata as any
        }
      });
      await tx.activityEvent.create({
        data: {
          clientId: client.id,
          type: 'PRIVACY_SECURITY_REQUESTED',
          message: `${matched.agency.name}: ${matched.action.label} requested.`,
          metadata: { actionPlanItemId: item.id, agencyCode: matched.agency.code, command: data.command }
        }
      });
      return item;
    });

    await writeAuditLog({
      userId: req.auth!.sub,
      action: 'PRIVACY_SECURITY_REQUESTED',
      entityType: 'ActionPlanItem',
      entityId: request.id,
      metadata: { agencyCode: matched.agency.code, command: data.command }
    });
    const queued = await enqueueJob('disputes', 'prepare-privacy-security-request', {
      clientId: client.id,
      actionPlanItemId: request.id
    }, { priority: data.command === 'DISPUTE' ? 10 : 5, maxAttempts: 3 });
    const refreshed = await prisma.actionPlanItem.findUnique({ where: { id: request.id } });
    res.status(202).json({ request: refreshed ?? request, queued });
  } catch (error) { next(error); }
});

saasRouter.patch('/privacy-security/requests/:id', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const client = await ownClient(req, res); if (!client) return;
    const data = z.object({ outcome: z.enum(['CLIENT_COMPLETED', 'CANCELLED']) }).parse(req.body);
    const existing = await prisma.actionPlanItem.findFirst({
      where: { id: String(req.params.id), clientId: client.id, category: 'PRIVACY_SECURITY' }
    });
    if (!existing) return res.status(404).json({ error: 'Privacy or security request not found.' });
    const currentMetadata = (existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}) as Record<string, unknown>;
    const completed = data.outcome === 'CLIENT_COMPLETED';
    const changedAt = new Date();
    const request = await prisma.$transaction(async (tx) => {
      const item = await tx.actionPlanItem.update({
        where: { id: existing.id },
        data: {
          status: completed ? 'COMPLETED' : 'DISMISSED',
          completedAt: completed ? changedAt : null,
          metadata: {
            ...currentMetadata,
            stage: completed ? 'CLIENT_CONFIRMED_COMPLETE' : 'CANCELLED',
            clientUpdatedAt: changedAt.toISOString()
          } as any
        }
      });
      await tx.activityEvent.create({
        data: {
          clientId: client.id,
          type: completed ? 'PRIVACY_SECURITY_COMPLETED' : 'PRIVACY_SECURITY_CANCELLED',
          message: `${existing.title} ${completed ? 'marked complete' : 'cancelled'} by client.`,
          metadata: { actionPlanItemId: existing.id }
        }
      });
      return item;
    });
    await writeAuditLog({
      userId: req.auth!.sub,
      action: completed ? 'PRIVACY_SECURITY_COMPLETED' : 'PRIVACY_SECURITY_CANCELLED',
      entityType: 'ActionPlanItem',
      entityId: request.id
    });
    res.json({ request });
  } catch (error) { next(error); }
});

saasRouter.put('/action-plan/:key', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const client = await ownClient(req, res); if (!client) return;
    const key = z.string().trim().min(1).max(120).parse(req.params.key);
    const data = z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(4000).nullable().optional(), category: z.string().max(80).optional(), priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(), status: z.enum(['OPEN', 'IN_PROGRESS', 'COMPLETED', 'DISMISSED']).optional(), dueAt: z.coerce.date().nullable().optional(), metadata: jsonObject.optional() }).parse(req.body);
    const item = await prisma.actionPlanItem.upsert({ where: { clientId_key: { clientId: client.id, key } }, create: { clientId: client.id, key, title: data.title, description: data.description ?? null, category: data.category ?? 'GENERAL', priority: data.priority ?? 'MEDIUM', status: data.status ?? 'OPEN', dueAt: data.dueAt ?? null, completedAt: data.status === 'COMPLETED' ? new Date() : null, metadata: asJson(data.metadata ?? {}) }, update: { title: data.title, description: data.description, category: data.category, priority: data.priority, status: data.status, dueAt: data.dueAt, completedAt: data.status === 'COMPLETED' ? new Date() : data.status ? null : undefined, metadata: data.metadata ? asJson(data.metadata) : undefined } });
    await writeAuditLog({ userId: req.auth!.sub, action: 'SAAS_ACTION_PLAN_UPDATED', entityType: 'ActionPlanItem', entityId: item.id, metadata: { key, status: item.status } });
    res.json({ item });
  } catch (error) { next(error); }
});

saasRouter.put('/milestones/:key', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const client = await ownClient(req, res); if (!client) return;
    const key = z.string().trim().min(1).max(120).parse(req.params.key);
    const data = z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(4000).nullable().optional(), achieved: z.boolean().optional(), metadata: jsonObject.optional() }).parse(req.body);
    const milestone = await prisma.milestone.upsert({ where: { clientId_key: { clientId: client.id, key } }, create: { clientId: client.id, key, title: data.title, description: data.description ?? null, achievedAt: data.achieved ? new Date() : null, metadata: asJson(data.metadata ?? {}) }, update: { title: data.title, description: data.description, ...(data.achieved === undefined ? {} : { achievedAt: data.achieved ? new Date() : null }), metadata: data.metadata ? asJson(data.metadata) : undefined } });
    await writeAuditLog({ userId: req.auth!.sub, action: 'SAAS_MILESTONE_UPDATED', entityType: 'Milestone', entityId: milestone.id, metadata: { key, achieved: Boolean(milestone.achievedAt) } });
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
    await writeAuditLog({ userId: req.auth!.sub, action: 'SAAS_WORKFLOW_UPDATED', entityType: 'WorkflowState', entityId: workflow.id, metadata: { stage: workflow.stage, version: workflow.version } });
    res.json({ workflow });
  } catch (error) { next(error); }
});

saasRouter.get('/conversations', requireAuth, async (req: AuthedRequest, res, next) => {
  try { const client = await ownClient(req, res); if (!client) return; res.json({ conversations: await prisma.cesarConversation.findMany({ where: { clientId: client.id }, orderBy: { updatedAt: 'desc' }, include: { messages: { orderBy: { createdAt: 'asc' }, take: 100 } } }) }); } catch (error) { next(error); }
});

saasRouter.post('/conversations', requireAuth, async (req: AuthedRequest, res, next) => {
  try { const client = await ownClient(req, res); if (!client) return; const title = z.string().trim().max(200).nullable().optional().parse(req.body?.title); const conversation = await prisma.cesarConversation.create({ data: { clientId: client.id, title: title ?? null } }); await writeAuditLog({ userId: req.auth!.sub, action: 'SAAS_CONVERSATION_CREATED', entityType: 'CesarConversation', entityId: conversation.id }); res.status(201).json({ conversation }); } catch (error) { next(error); }
});

saasRouter.post('/conversations/:id/messages', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const client = await ownClient(req, res); if (!client) return;
    const data = z.object({ role: z.enum(['user', 'assistant', 'system']), content: z.string().trim().min(1).max(20000), metadata: jsonObject.optional() }).parse(req.body);
    const conversation = await prisma.cesarConversation.findFirst({ where: { id: String(req.params.id), clientId: client.id }, select: { id: true } });
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    const [message] = await prisma.$transaction([prisma.cesarMessage.create({ data: { conversationId: conversation.id, role: data.role, content: data.content, metadata: asJson(data.metadata ?? {}) } }), prisma.cesarConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } })]);
    await writeAuditLog({ userId: req.auth!.sub, action: 'SAAS_CESAR_MESSAGE_CREATED', entityType: 'CesarMessage', entityId: message.id, metadata: { conversationId: conversation.id, role: data.role } });
    res.status(201).json({ message });
  } catch (error) { next(error); }
});

saasRouter.post('/export', requireAuth, async (req: AuthedRequest, res, next) => {
  try { const client = await ownClient(req, res); if (!client) return; const existing = await prisma.dataExportRequest.findFirst({ where: { clientId: client.id, status: { in: ['REQUESTED', 'PROCESSING'] } }, orderBy: { requestedAt: 'desc' } }); const request = existing ?? await prisma.dataExportRequest.create({ data: { clientId: client.id } }); await writeAuditLog({ userId: req.auth!.sub, action: 'SAAS_EXPORT_REQUESTED', entityType: 'DataExportRequest', entityId: request.id }); res.status(existing ? 200 : 201).json({ request }); } catch (error) { next(error); }
});

saasRouter.post('/deletion', requireAuth, async (req: AuthedRequest, res, next) => {
  try { const client = await ownClient(req, res); if (!client) return; const reason = z.string().trim().max(1000).nullable().optional().parse(req.body?.reason); const existing = await prisma.accountDeletionRequest.findFirst({ where: { clientId: client.id, status: { in: ['REQUESTED', 'UNDER_REVIEW'] } }, orderBy: { requestedAt: 'desc' } }); const request = existing ?? await prisma.accountDeletionRequest.create({ data: { clientId: client.id, reason: reason ?? null } }); await writeAuditLog({ userId: req.auth!.sub, action: 'SAAS_DELETION_REQUESTED', entityType: 'AccountDeletionRequest', entityId: request.id }); res.status(existing ? 200 : 201).json({ request }); } catch (error) { next(error); }
});

saasRouter.get('/admin/overview', requireAuth, requireRole(['STAFF', 'ADMIN']), async (_req, res, next) => {
  try { const [clients, users, pendingExports, pendingDeletions, unreadNotifications] = await Promise.all([prisma.client.count(), prisma.user.count(), prisma.dataExportRequest.count({ where: { status: 'REQUESTED' } }), prisma.accountDeletionRequest.count({ where: { status: 'REQUESTED' } }), prisma.notification.count({ where: { readAt: null } })]); res.json({ clients, users, pendingExports, pendingDeletions, unreadNotifications }); } catch (error) { next(error); }
});

saasRouter.get('/admin/privacy-security/:clientId', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req: AuthedRequest, res, next) => {
  try {
    const clientId = String(req.params.clientId);
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) return res.status(404).json({ error: 'Client not found.' });
    const requests = await prisma.actionPlanItem.findMany({
      where: { clientId, category: 'PRIVACY_SECURITY' },
      orderBy: { updatedAt: 'desc' }
    });
    res.json({ agencies: PRIVACY_SECURITY_AGENCIES, requests });
  } catch (error) { next(error); }
});
