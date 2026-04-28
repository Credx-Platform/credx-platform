import { Router } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { notifyNewClientSignup } from '../lib/openclaw.js';
import { config } from '../config.js';
import type { DocumentType } from '@prisma/client';

export const progressRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

function inferDocumentType(input = ''): string {
  const value = String(input || '').toLowerCase();
  if (value.includes('credit')) return 'credit_report';
  if (value.includes('report')) return 'credit_report';
  if (value.includes('driver') || value.includes('license') || value.includes('passport') || value.includes('id')) return 'identity';
  if (value.includes('utility') || value.includes('address') || value.includes('bill')) return 'proof_of_address';
  return 'other';
}

function toPrismaDocumentType(docType: string): DocumentType {
  switch (docType) {
    case 'credit_report':
      return 'CREDIT_REPORT';
    case 'identity':
      return 'IDENTITY';
    case 'proof_of_address':
      return 'PROOF_OF_ADDRESS';
    default:
      return 'OTHER';
  }
}

function formatField(value: string | null | undefined, fallback = 'Not provided'): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function buildOwnerOnboardingEmail(payload: {
  user: { firstName: string | null; lastName: string | null; email: string; phone: string | null };
  creditReport?: { name?: string; uploadedAt?: string } | null;
}) {
  const fullName = [payload.user.firstName, payload.user.lastName].filter(Boolean).join(' ').trim() || 'Not provided';
  const uploadedAt = payload.creditReport?.uploadedAt || new Date().toISOString();
  const subject = `CredX onboarding complete: ${fullName}`;
  const text = [
    'A CredX client completed onboarding.',
    '',
    `Name: ${fullName}`,
    `Email: ${formatField(payload.user.email)}`,
    `Phone: ${formatField(payload.user.phone)}`,
    `Credit report uploaded: ${uploadedAt}`,
    `Current workflow stage: dispute_review_pending`,
    '',
    'Next workflow:',
    '1. Dispute manager review',
    '2. Analysis report prep',
    '3. Billing arrangement setup'
  ].join('\n');

  return { subject, text, html: text.replace(/\n/g, '<br>') };
}

async function sendOwnerOnboardingEmail(payload: {
  user: { firstName: string | null; lastName: string | null; email: string; phone: string | null };
  creditReport?: { name?: string; uploadedAt?: string } | null;
}) {
  const to = config.leadNotificationEmail;
  const email = buildOwnerOnboardingEmail(payload);
  console.log('OWNER_ONBOARDING_EMAIL_PREVIEW', { to, subject: email.subject });
  return { to, ...email };
}

async function notifyDisputeManager(payload: {
  user: { firstName: string | null; lastName: string | null; email: string; phone: string | null };
  creditReport?: { name?: string; uploadedAt?: string } | null;
}) {
  const fullName = [payload.user.firstName, payload.user.lastName].filter(Boolean).join(' ').trim() || 'Not provided';
  const message = [
    'You are the CredX dispute manager with a dashboarding workflow lens.',
    'A client has completed onboarding and uploaded a credit report.',
    'Return ONLY a concise owner alert for Telegram, 10 lines max.',
    'Do not invent tradelines, bureau findings, balances, or payment data that do not exist yet.',
    'Summarize the current workflow stage, immediate next actions, and the organized handoff order: dispute review, analysis, billing.',
    '',
    `Client: ${fullName}`,
    `Email: ${formatField(payload.user.email)}`,
    `Phone: ${formatField(payload.user.phone)}`,
    `Credit report file: ${formatField(payload.creditReport?.name)}`,
    'Stage: dispute review pending',
    'Next actions: review uploaded report, build analysis summary, queue billing arrangement after dispute plan'
  ].join('\n');

  return notifyNewClientSignup({
    email: payload.user.email,
    firstName: payload.user.firstName,
    lastName: payload.user.lastName,
    phone: payload.user.phone,
    source: 'credx-platform-onboarding-complete',
    createdAt: new Date().toISOString()
  });
}

async function completeOnboardingWorkflow(clientId: string, creditReportDoc: { name?: string; uploadedAt?: string }) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { user: true, progress: true }
  });
  if (!client || !client.progress) return { alreadyCompleted: true };

  const onboarding = client.progress.onboarding as Record<string, any>;
  if (onboarding?.completedAt) {
    return { alreadyCompleted: true };
  }

  const nowIso = new Date().toISOString();
  const updatedOnboarding = { status: 'completed', completedAt: nowIso, creditReportUploadedAt: creditReportDoc.uploadedAt || nowIso };
  const updatedWorkflow = { stage: 'dispute_review_pending', updatedAt: nowIso, next: ['review_credit_report', 'prepare_analysis_report', 'establish_billing_arrangement'] };

  await prisma.clientProgress.update({
    where: { clientId },
    data: {
      onboarding: updatedOnboarding,
      workflow: updatedWorkflow
    }
  });

  await prisma.client.update({
    where: { id: clientId },
    data: { status: 'INTAKE_RECEIVED' }
  });

  const taskTitles = [
    'Review uploaded credit report',
    'Prepare analysis summary and dispute plan',
    'Set payment arrangement after analysis review'
  ];
  const existingTasks = await prisma.task.findMany({ where: { clientId }, select: { title: true } });
  const existingTitles = new Set(existingTasks.map((t: { title: string }) => t.title));

  for (const title of taskTitles) {
    if (!existingTitles.has(title)) {
      await prisma.task.create({
        data: {
          clientId,
          title,
          description: title,
          completed: false
        }
      });
    }
  }

  await prisma.activityEvent.create({
    data: {
      clientId,
      type: 'onboarding_completed',
      message: 'Client completed onboarding and uploaded a credit report.',
      metadata: { creditReport: creditReportDoc.name || null }
    }
  });

  const ownerEmail = await sendOwnerOnboardingEmail({ user: client.user, creditReport: creditReportDoc });
  const disputeManager = await notifyDisputeManager({ user: client.user, creditReport: creditReportDoc });

  return { progress: { onboarding: updatedOnboarding, workflow: updatedWorkflow }, ownerEmail, disputeManager };
}

progressRouter.get('/me', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const client = await prisma.client.findUnique({
      where: { userId: req.auth!.sub },
      include: { progress: true, tasks: true, activities: true }
    });
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const progress = client.progress || {};
    return res.json({
      completedDays: (progress as any).completedDays || [],
      passedQuizzes: (progress as any).passedQuizzes || [],
      uploadedDocs: (progress as any).uploadedDocs || [],
      disputes: (progress as any).disputes || [],
      scores: (progress as any).scores || { equifax: null, experian: null, transunion: null },
      onboarding: (progress as any).onboarding || { status: 'pending', signupAt: null, completedAt: null },
      workflow: (progress as any).workflow || { stage: 'signup_received', updatedAt: null, next: [] },
      education: (progress as any).education || { masterclassEnrolled: false, masterclassAccess: false, masterclassProgress: [], affiliateLinks: [] },
      analysis: (progress as any).analysis || null,
      disputeStrategy: (progress as any).disputeStrategy || null,
      tasks: client.tasks,
      activities: client.activities
    });
  } catch (error) {
    next(error);
  }
});

const updateProgressSchema = z.object({
  completedDay: z.string().optional(),
  passedQuiz: z.string().optional(),
  scores: z.object({ equifax: z.number().nullable().optional(), experian: z.number().nullable().optional(), transunion: z.number().nullable().optional() }).optional(),
  dispute: z.object({}).passthrough().optional(),
  workflow: z.object({}).passthrough().optional(),
  education: z.object({}).passthrough().optional()
});

progressRouter.post('/me', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const data = updateProgressSchema.parse(req.body);
    const client = await prisma.client.findUnique({ where: { userId: req.auth!.sub }, include: { progress: true } });
    if (!client || !client.progress) return res.status(404).json({ error: 'Client progress not found' });

    const progress = client.progress as any;
    const completedDays = Array.isArray(progress.completedDays) ? [...progress.completedDays] : [];
    const passedQuizzes = Array.isArray(progress.passedQuizzes) ? [...progress.passedQuizzes] : [];
    const disputes = Array.isArray(progress.disputes) ? [...progress.disputes] : [];
    const scores = { ...(progress.scores || {}), ...(data.scores || {}) };
    const workflow = { ...(progress.workflow || {}), ...(data.workflow || {}), updatedAt: new Date().toISOString() };
    const education = { ...(progress.education || {}), ...(data.education || {}) };

    if (data.completedDay && !completedDays.includes(data.completedDay)) {
      completedDays.push(data.completedDay);
    }
    if (data.passedQuiz && !passedQuizzes.includes(data.passedQuiz)) {
      passedQuizzes.push(data.passedQuiz);
    }
    if (data.dispute) {
      disputes.push({ ...data.dispute, createdAt: new Date().toISOString() });
    }

    const updated = await prisma.clientProgress.update({
      where: { clientId: client.id },
      data: { completedDays, passedQuizzes, scores, disputes, workflow, education }
    });

    return res.json(updated);
  } catch (error) {
    next(error);
  }
});

const docSchema = z.object({
  name: z.string().min(1),
  type: z.string().optional(),
  url: z.string().optional(),
  fileName: z.string().optional(),
  secure: z.boolean().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  contentType: z.string().optional()
});

async function handleDocUpload(req: AuthedRequest, res: any, next: any) {
  try {
    const data = docSchema.parse(req.body);
    const client = await prisma.client.findUnique({ where: { userId: req.auth!.sub }, include: { progress: true } });
    if (!client || !client.progress) return res.status(404).json({ error: 'Client progress not found' });

    const docType = inferDocumentType(data.type || data.name || data.fileName || '');
    const doc = {
      name: data.name,
      type: docType,
      url: data.url || null,
      fileName: data.fileName || data.name,
      uploadedAt: new Date().toISOString()
    };

    const progress = client.progress as any;
    const uploadedDocs = Array.isArray(progress.uploadedDocs) ? [...progress.uploadedDocs] : [];
    uploadedDocs.push(doc);

    const workflow = { ...(progress.workflow || {}), updatedAt: new Date().toISOString() };
    if (docType === 'credit_report') {
      (workflow as any).stage = 'credit_report_received';
    }

    await prisma.clientProgress.update({
      where: { clientId: client.id },
      data: { uploadedDocs, workflow }
    });

    await prisma.document.upsert({
      where: {
        clientId_fileName: {
          clientId: client.id,
          fileName: doc.fileName
        }
      },
      update: {
        type: toPrismaDocumentType(docType),
        s3Key: doc.url || doc.fileName,
        contentType: docType === 'credit_report' ? 'application/pdf' : null,
        uploadedAt: new Date(doc.uploadedAt)
      },
      create: {
        clientId: client.id,
        type: toPrismaDocumentType(docType),
        fileName: doc.fileName,
        s3Key: doc.url || doc.fileName,
        contentType: docType === 'credit_report' ? 'application/pdf' : null,
        uploadedAt: new Date(doc.uploadedAt)
      }
    });

    let workflowResult = null;
    if (docType === 'credit_report') {
      workflowResult = await completeOnboardingWorkflow(client.id, doc);
    }

    return res.json({ uploadedDocs, workflow: workflowResult });
  } catch (error) {
    next(error);
  }
}

progressRouter.post('/me/docs', requireAuth, handleDocUpload);
progressRouter.post('/docs', requireAuth, handleDocUpload);

progressRouter.post('/me/docs/upload', requireAuth, upload.single('file'), async (req: AuthedRequest, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const client = await prisma.client.findUnique({ where: { userId: req.auth!.sub }, include: { progress: true } });
    if (!client || !client.progress) return res.status(404).json({ error: 'Client progress not found' });

    const rawType = String(req.body?.type || req.file.originalname || '').trim();
    const docType = inferDocumentType(rawType);
    const uploadedAt = new Date().toISOString();
    const safeName = req.file.originalname || `upload-${Date.now()}`;
    const storageKey = `secure/${client.id}/${Date.now()}-${crypto.randomUUID()}-${safeName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const secureDoc = {
      name: safeName,
      type: docType,
      url: null,
      fileName: safeName,
      uploadedAt,
      secure: true,
      sizeBytes: req.file.size,
      contentType: req.file.mimetype
    };

    const progress = client.progress as any;
    const uploadedDocs = Array.isArray(progress.uploadedDocs) ? [...progress.uploadedDocs, secureDoc] : [secureDoc];
    const workflow = { ...(progress.workflow || {}), updatedAt: uploadedAt };
    if (docType === 'credit_report') {
      (workflow as any).stage = 'credit_report_received';
    }

    await prisma.clientProgress.update({
      where: { clientId: client.id },
      data: { uploadedDocs, workflow }
    });

    await prisma.document.create({
      data: {
        clientId: client.id,
        type: toPrismaDocumentType(docType),
        fileName: safeName,
        s3Key: storageKey,
        contentType: req.file.mimetype,
        uploadedAt: new Date(uploadedAt)
      }
    });

    await prisma.activityEvent.create({
      data: {
        clientId: client.id,
        type: 'secure_document_uploaded',
        message: `${docType === 'credit_report' ? 'Credit report' : 'Verification document'} uploaded securely.`,
        metadata: { fileName: safeName, documentType: docType, sizeBytes: req.file.size }
      }
    });

    let workflowResult = null;
    if (docType === 'credit_report') {
      workflowResult = await completeOnboardingWorkflow(client.id, secureDoc);
    }

    return res.json({
      success: true,
      document: { fileName: safeName, type: docType, uploadedAt, secure: true, sizeBytes: req.file.size },
      workflow: workflowResult
    });
  } catch (error) {
    next(error);
  }
});
