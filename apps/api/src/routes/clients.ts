import { Router } from 'express';
import { z } from 'zod';
import fs from 'node:fs/promises';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { CreditAnalysisService } from '../lib/creditAnalysis.js';
import { dispatchAnalysisEmail } from '../lib/analysisEmailDispatch.js';
import { decryptPII } from '../lib/encryption.js';

export const clientsRouter = Router();

async function sendPrintableDocument(res: any, document: { s3Key?: string | null; content?: string | null; contentType?: string | null; fileName?: string | null; [key: string]: unknown }) {
  // Prefer the DB-stored body: reliable across redeploys/replicas. Generated
  // dispute letters store their content here.
  if (document.content) {
    return res.json({ document, content: document.content });
  }

  const s3Key = document.s3Key || '';
  if (/^https?:\/\//i.test(s3Key)) {
    return res.json({ document, url: s3Key });
  }

  const name = (document.fileName || '').toLowerCase();
  const key = s3Key.toLowerCase();
  if (document.contentType?.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md') || key.endsWith('.txt') || key.endsWith('.md')) {
    try {
      const content = await fs.readFile(s3Key, 'utf-8');
      return res.json({ document, content });
    } catch {
      // Legacy letter written only to ephemeral /tmp and since wiped. Don't crash —
      // tell the operator to regenerate it (which now persists content to the DB).
      return res.status(410).json({ error: 'This letter is no longer on file (it predates persistent storage). Click "Regenerate Letters" on the client to recreate it.' });
    }
  }

  if (s3Key) return res.json({ document, url: s3Key });
  return res.status(410).json({ error: 'This document has no printable content on file.' });
}

clientsRouter.get('/', requireAuth, requireRole(['STAFF', 'ADMIN']), async (_req, res, next) => {
  try {
    const clients = await prisma.client.findMany({
      include: {
        user: true,
        payments: true,
        disputes: true,
        documents: true,
        activities: true,
        progress: true
      },
      orderBy: { createdAt: 'desc' }
    });
    return res.json({ clients });
  } catch (error) {
    next(error);
  }
});

clientsRouter.get('/me', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const client = await prisma.client.findUnique({
      where: { userId: req.auth!.sub },
      include: { payments: true, disputes: true, tasks: true, documents: true, activities: true }
    });
    return res.json({ client });
  } catch (error) {
    next(error);
  }
});

clientsRouter.get('/me/documents/:documentId/print', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const documentId = String(req.params.documentId);
    const client = await prisma.client.findUnique({
      where: { userId: req.auth!.sub },
      select: { id: true }
    });

    if (!client) return res.status(404).json({ error: 'Client not found' });

    const document = await prisma.document.findFirst({
      where: { id: documentId, clientId: client.id }
    });

    if (!document) return res.status(404).json({ error: 'Document not found' });

    return await sendPrintableDocument(res, document);
  } catch (error) {
    next(error);
  }
});

clientsRouter.get('/:id', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        user: true,
        payments: true,
        disputes: true,
        disputeItems: {
          include: {
            rounds: {
              orderBy: { roundNumber: 'desc' }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        documents: true,
        activities: {
          orderBy: { createdAt: 'desc' }
        },
        tasks: true,
        progress: true,
        creditReports: {
          orderBy: { pulledAt: 'desc' },
          include: { tradelines: true }
        }
      }
    });

    if (!client) return res.status(404).json({ error: 'Client not found' });

    if (client.progress?.onboarding && typeof client.progress.onboarding === 'object') {
      const onboarding = client.progress.onboarding as Record<string, unknown>;
      const encrypted = onboarding.monitoringPasswordEncrypted;
      if (typeof encrypted === 'string' && encrypted) {
        try {
          onboarding.monitoringPassword = decryptPII(encrypted);
        } catch {
          onboarding.monitoringPassword = null;
        }
      } else {
        onboarding.monitoringPassword = null;
      }
      delete onboarding.monitoringPasswordEncrypted;
    }

    return res.json({ client });
  } catch (error) {
    next(error);
  }
});

clientsRouter.get('/:id/documents/:documentId/print', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const documentId = String(req.params.documentId);
    const document = await prisma.document.findFirst({
      where: { id: documentId, clientId: id }
    });

    if (!document) return res.status(404).json({ error: 'Document not found' });

    return await sendPrintableDocument(res, document);
  } catch (error) {
    next(error);
  }
});

const onboardingSchema = z.object({
  ssnLast4: z.string().length(4).optional(),
  dobEncrypted: z.string().optional(),
  ssnEncrypted: z.string().optional(),
  currentAddressLine1: z.string().optional(),
  currentAddressLine2: z.string().optional(),
  currentCity: z.string().optional(),
  currentState: z.string().optional(),
  currentPostalCode: z.string().optional(),
  serviceTier: z.enum(['ESSENTIAL', 'AGGRESSIVE', 'FAMILY']).optional()
});

const analysisSchema = z.object({
  analysisSummary: z.string().min(1),
  disputePlanSummary: z.string().min(1),
  estimatedTimelineMonths: z.number().int().min(1).max(36),
  serviceTier: z.enum(['ESSENTIAL', 'AGGRESSIVE', 'FAMILY']).optional()
});

const clientProfileSchema = z.object({
  currentAddressLine1: z.string().optional(),
  currentAddressLine2: z.string().optional(),
  currentCity: z.string().optional(),
  currentState: z.string().optional(),
  currentPostalCode: z.string().optional(),
  dobEncrypted: z.string().optional(),
  ssnEncrypted: z.string().optional()
});

const statusUpdateSchema = z.object({
  status: z.enum(['LEAD', 'STUDENT', 'CONTRACT_SENT', 'INTAKE_RECEIVED', 'ANALYSIS_READY', 'UPGRADE_OFFERED', 'ACTIVE', 'PAST_DUE', 'RESTRICTED', 'CANCELLED'])
});

clientsRouter.post('/onboarding', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const data = onboardingSchema.parse(req.body);
    const client = await prisma.client.upsert({
      where: { userId: req.auth!.sub },
      update: { ...data, status: 'INTAKE_RECEIVED' },
      create: { userId: req.auth!.sub, status: 'INTAKE_RECEIVED', ...data }
    });
    return res.status(201).json({ client });
  } catch (error) {
    next(error);
  }
});

clientsRouter.patch('/me/profile', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const data = clientProfileSchema.parse(req.body);
    const updateData: Record<string, string | null> = {};

    if (data.currentAddressLine1 !== undefined) updateData.currentAddressLine1 = data.currentAddressLine1 || null;
    if (data.currentAddressLine2 !== undefined) updateData.currentAddressLine2 = data.currentAddressLine2 || null;
    if (data.currentCity !== undefined) updateData.currentCity = data.currentCity || null;
    if (data.currentState !== undefined) updateData.currentState = data.currentState || null;
    if (data.currentPostalCode !== undefined) updateData.currentPostalCode = data.currentPostalCode || null;
    if (data.dobEncrypted !== undefined) updateData.dobEncrypted = data.dobEncrypted || null;
    if (data.ssnEncrypted !== undefined) {
      updateData.ssnEncrypted = data.ssnEncrypted || null;
      updateData.ssnLast4 = data.ssnEncrypted ? data.ssnEncrypted.replace(/\D/g, '').slice(-4) : null;
    }

    const client = await prisma.client.update({
      where: { userId: req.auth!.sub },
      data: updateData,
      include: { payments: true, disputes: true, tasks: true, documents: true, activities: true }
    });

    await prisma.activityEvent.create({
      data: {
        clientId: client.id,
        type: 'profile_updated',
        message: 'Client profile and verification details were updated.'
      }
    });

    return res.json({ client });
  } catch (error) {
    next(error);
  }
});

clientsRouter.post('/:id/analysis', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const data = analysisSchema.parse(req.body);
    const client = await prisma.client.update({
      where: { id },
      data: {
        analysisSummary: data.analysisSummary,
        disputePlanSummary: data.disputePlanSummary,
        estimatedTimelineMonths: data.estimatedTimelineMonths,
        serviceTier: data.serviceTier,
        status: 'UPGRADE_OFFERED',
        upgradeOfferedAt: new Date(),
        portalRestricted: false
      },
      include: { user: true, payments: true, disputes: true, documents: true, activities: true }
    });
    return res.status(201).json({ client });
  } catch (error) {
    next(error);
  }
});

clientsRouter.patch('/:id/status', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const { status } = statusUpdateSchema.parse(req.body);
    const restricted = status === 'PAST_DUE' || status === 'RESTRICTED';
    const active = status === 'ACTIVE';
    const client = await prisma.client.update({
      where: { id },
      data: {
        status,
        portalRestricted: restricted,
        flaggedAt: restricted ? new Date() : null,
        activatedAt: active ? new Date() : undefined
      },
      include: { user: true, payments: true, disputes: true, documents: true, activities: true }
    });
    return res.json({ client });
  } catch (error) {
    next(error);
  }
});

// ========== CLIENT ACTIVATION & DISPUTE AUTOMATION ==========

clientsRouter.post('/:id/clear-disputes', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const client = await prisma.client.findUnique({ where: { id } });
    if (!client) return res.status(404).json({ error: 'Client not found' });

    // 1. Find all dispute items for this client so we can also clear their documents
    const disputeItems = await prisma.disputeItem.findMany({
      where: { clientId: id },
      select: { id: true }
    });
    const disputeItemIds = disputeItems.map(d => d.id);

    // 2. Delete dispute rounds (cascades from dispute items, but let's be explicit)
    if (disputeItemIds.length) {
      await prisma.disputeRound.deleteMany({
        where: { disputeItemId: { in: disputeItemIds } }
      });
    }

    // 3. Delete dispute items
    await prisma.disputeItem.deleteMany({ where: { clientId: id } });

    // 4. Delete dispute letter documents
    await prisma.document.deleteMany({
      where: {
        clientId: id,
        type: 'DISPUTE_LETTER'
      }
    });

    // 5. Log the clear
    await prisma.activityEvent.create({
      data: {
        clientId: id,
        type: 'DISPUTES_CLEARED',
        message: `Staff cleared all dispute items, rounds, and dispute letter documents for fresh generation.`,
        metadata: { clearedDisputeItems: disputeItemIds.length }
      }
    });

    return res.json({
      success: true,
      clearedDisputeItems: disputeItemIds.length,
      message: `Cleared ${disputeItemIds.length} dispute item(s) and all associated dispute letter documents.`
    });
  } catch (error) {
    next(error);
  }
});

clientsRouter.post('/:id/regenerate-letters', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const client = await prisma.client.findUnique({
      where: { id },
      include: { user: true, progress: true }
    });

    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (!client.progress?.analysis) return res.status(400).json({ error: 'No credit analysis found. Upload credit report and generate analysis first.' });

    // Step 1: Clear old dispute items and letters
    const disputeItems = await prisma.disputeItem.findMany({
      where: { clientId: id },
      select: { id: true }
    });
    const disputeItemIds = disputeItems.map(d => d.id);

    if (disputeItemIds.length) {
      await prisma.disputeRound.deleteMany({
        where: { disputeItemId: { in: disputeItemIds } }
      });
      await prisma.disputeItem.deleteMany({ where: { clientId: id } });
    }

    await prisma.document.deleteMany({
      where: { clientId: id, type: 'DISPUTE_LETTER' }
    });

    // Step 2: Activate / regenerate
    const { activateClientDisputeCampaign } = await import('../lib/disputeAutomation.js');
    const result = await activateClientDisputeCampaign(id);

    // Step 3: Fetch the newly created documents
    const newDocuments = await prisma.document.findMany({
      where: { clientId: id, type: 'DISPUTE_LETTER' },
      orderBy: { uploadedAt: 'desc' }
    });

    return res.json({
      success: result.success,
      lettersGenerated: result.lettersGenerated,
      emailSent: result.emailSent,
      errors: result.errors,
      documents: newDocuments,
      client: await prisma.client.findUnique({
        where: { id },
        include: { user: true, documents: true, disputeItems: true, tasks: true }
      })
    });
  } catch (error) {
    next(error);
  }
});

// ========== MARK PAID & ACTIVATE (Admin one-click payment + activation + letter generation) ==========

clientsRouter.post('/:id/mark-paid-and-activate', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const client = await prisma.client.findUnique({
      where: { id },
      include: { user: true, progress: true }
    });

    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (!client.progress?.analysis) return res.status(400).json({ error: 'No credit analysis found. Upload credit report and generate analysis first.' });

    const amount = typeof req.body.amount === 'number' ? req.body.amount : 150;
    const currency = typeof req.body.currency === 'string' ? req.body.currency : 'USD';
    const type = typeof req.body.type === 'string' ? req.body.type : 'SETUP_FEE';

    // Step 1: Record payment
    await prisma.payment.create({
      data: {
        clientId: id,
        amount,
        currency,
        type: type as any,
        status: 'PAID',
        paidAt: new Date()
      }
    });

    // Step 2: Clear old dispute items if any exist (fresh start)
    const existingItems = await prisma.disputeItem.findMany({
      where: { clientId: id },
      select: { id: true }
    });
    if (existingItems.length > 0) {
      const ids = existingItems.map(d => d.id);
      await prisma.disputeRound.deleteMany({ where: { disputeItemId: { in: ids } } });
      await prisma.disputeItem.deleteMany({ where: { clientId: id } });
      await prisma.document.deleteMany({ where: { clientId: id, type: 'DISPUTE_LETTER' } });
    }

    // Step 3: Activate and generate dispute letters
    const { activateClientDisputeCampaign } = await import('../lib/disputeAutomation.js');
    const result = await activateClientDisputeCampaign(id);

    // Step 4: Log activity
    await prisma.activityEvent.create({
      data: {
        clientId: id,
        type: 'PAYMENT_RECEIVED',
        message: `Payment of $${amount} ${currency} received. Client activated and ${result.lettersGenerated} dispute letter(s) generated.`,
        metadata: { amount, currency, type, lettersGenerated: result.lettersGenerated, autoActivated: true }
      }
    });

    return res.json({
      success: true,
      activated: true,
      lettersGenerated: result.lettersGenerated,
      emailSent: result.emailSent,
      errors: result.errors,
      payment: { amount, currency, type, status: 'PAID' },
      client: await prisma.client.findUnique({
        where: { id },
        include: { user: true, documents: true, disputeItems: true, tasks: true, payments: true }
      })
    });
  } catch (error) {
    next(error);
  }
});

clientsRouter.post('/:id/activate', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const client = await prisma.client.findUnique({
      where: { id },
      include: { user: true, progress: true }
    });

    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (!client.progress?.analysis) return res.status(400).json({ error: 'No credit analysis found. Upload credit report and generate analysis first.' });
    if (client.status === 'ACTIVE') return res.status(400).json({ error: 'Client is already active.' });

    const { activateClientDisputeCampaign } = await import('../lib/disputeAutomation.js');
    const result = await activateClientDisputeCampaign(id);

    return res.json({
      success: result.success,
      lettersGenerated: result.lettersGenerated,
      emailSent: result.emailSent,
      errors: result.errors,
      client: await prisma.client.findUnique({
        where: { id },
        include: { user: true, documents: true, disputeItems: true, tasks: true }
      })
    });
  } catch (error) {
    next(error);
  }
});

// ========== CREDIT ANALYSIS ENDPOINTS ==========

clientsRouter.post('/:id/analysis/generate', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        user: true,
        creditReports: {
          orderBy: { pulledAt: 'desc' },
          include: { tradelines: true }
        }
      }
    });

    if (!client) return res.status(404).json({ error: 'Client not found' });

    const analysis = CreditAnalysisService.generate({
      client: client as any,
      creditReports: client.creditReports as any
    });

    // Store analysis in ClientProgress.analysis JSON field
    const progress = await prisma.clientProgress.findUnique({
      where: { clientId: id }
    });

    if (progress) {
      await prisma.clientProgress.update({
        where: { clientId: id },
        data: {
          analysis: analysis as any,
          workflow: {
            ...(progress.workflow as any || {}),
            stage: 'analysis_ready',
            updatedAt: new Date().toISOString(),
            next: ['review_analysis', 'begin_disputes']
          }
        }
      });
    } else {
      await prisma.clientProgress.create({
        data: {
          clientId: id,
          analysis: analysis as any,
          workflow: {
            stage: 'analysis_ready',
            updatedAt: new Date().toISOString(),
            next: ['review_analysis', 'begin_disputes']
          }
        }
      });
    }

    // Also update client status
    await prisma.client.update({
      where: { id },
      data: {
        status: 'ANALYSIS_READY',
        analysisSummary: analysis.clientFacingSummary.slice(0, 500) + '...'
      }
    });

    await prisma.activityEvent.create({
      data: {
        clientId: id,
        type: 'ANALYSIS_GENERATED',
        message: `Credit analysis generated: ${analysis.keyFindings.length} findings, ${analysis.disputeOpportunities.length} dispute opportunities identified.`,
        metadata: {
          findingCount: analysis.keyFindings.length,
          disputeCount: analysis.disputeOpportunities.length,
          totalAccounts: analysis.overallStats.totalAccounts
        }
      }
    });

    const emailResult = await dispatchAnalysisEmail({
      clientId: id,
      analysis,
      trigger: 'admin_generate'
    });

    return res.status(201).json({
      analysis,
      emailed: emailResult.sent,
      ...(emailResult.sent ? { emailMessageId: emailResult.messageId } : { emailSkippedReason: emailResult.reason })
    });
  } catch (error) {
    next(error);
  }
});

clientsRouter.get('/:id/analysis', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);

    // Clients can only view their own analysis
    if (req.auth?.role === 'CLIENT') {
      const client = await prisma.client.findUnique({
        where: { userId: req.auth.sub },
        include: { progress: true }
      });
      if (!client || client.id !== id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    const progress = await prisma.clientProgress.findUnique({
      where: { clientId: id }
    });

    if (!progress?.analysis) {
      return res.status(404).json({ error: 'Analysis not found. Generate one first.' });
    }

    return res.json({ analysis: progress.analysis });
  } catch (error) {
    next(error);
  }
});

// Auto-generate analysis endpoint (called after document upload)
clientsRouter.post('/:id/analysis/auto', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);

    // Clients can only auto-generate for themselves
    if (req.auth?.role === 'CLIENT') {
      const client = await prisma.client.findUnique({
        where: { userId: req.auth.sub }
      });
      if (!client || client.id !== id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    } else if (!['STAFF', 'ADMIN'].includes(req.auth?.role || '')) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Check if analysis already exists
    const existing = await prisma.clientProgress.findUnique({
      where: { clientId: id }
    });

    if (existing?.analysis) {
      return res.json({ analysis: existing.analysis, cached: true });
    }

    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        user: true,
        creditReports: {
          orderBy: { pulledAt: 'desc' },
          include: { tradelines: true }
        }
      }
    });

    if (!client) return res.status(404).json({ error: 'Client not found' });

    // Need at least some credit report data
    if (client.creditReports.length === 0) {
      return res.status(400).json({ error: 'No credit reports found. Upload a report first.' });
    }

    const analysis = CreditAnalysisService.generate({
      client: client as any,
      creditReports: client.creditReports as any
    });

    if (existing) {
      await prisma.clientProgress.update({
        where: { clientId: id },
        data: {
          analysis: analysis as any,
          workflow: {
            ...(existing.workflow as any || {}),
            stage: 'analysis_ready',
            updatedAt: new Date().toISOString()
          }
        }
      });
    } else {
      await prisma.clientProgress.create({
        data: {
          clientId: id,
          analysis: analysis as any,
          workflow: {
            stage: 'analysis_ready',
            updatedAt: new Date().toISOString(),
            next: ['review_analysis', 'begin_disputes']
          }
        }
      });
    }

    await prisma.client.update({
      where: { id },
      data: {
        status: 'ANALYSIS_READY',
        analysisSummary: analysis.clientFacingSummary.slice(0, 500) + '...'
      }
    });

    await prisma.activityEvent.create({
      data: {
        clientId: id,
        type: 'ANALYSIS_AUTO_GENERATED',
        message: `Credit analysis auto-generated after report upload: ${analysis.keyFindings.length} findings identified.`,
        metadata: {
          findingCount: analysis.keyFindings.length,
          disputeCount: analysis.disputeOpportunities.length
        }
      }
    });

    const emailResult = await dispatchAnalysisEmail({
      clientId: id,
      analysis,
      trigger: 'auto_endpoint'
    });

    return res.status(201).json({
      analysis,
      emailed: emailResult.sent,
      ...(emailResult.sent ? { emailMessageId: emailResult.messageId } : { emailSkippedReason: emailResult.reason })
    });
  } catch (error) {
    next(error);
  }
});

// Staff-only: wipe a client's credit reports, tradelines, uploaded docs,
// prisma documents, progress analysis JSON, and reset to LEAD status.
// Use when a file is stuck or the client needs a clean restart.
clientsRouter.post('/:id/reset', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const id = String(req.params.id);

    // 1. Delete credit reports and their tradelines
    const reports = await prisma.creditReport.findMany({ where: { clientId: id }, select: { id: true } });
    if (reports.length) {
      const ids = reports.map(r => r.id);
      await prisma.tradeline.deleteMany({ where: { creditReportId: { in: ids } } });
      await prisma.creditReport.deleteMany({ where: { id: { in: ids } } });
    }

    // 2. Delete prisma documents
    await prisma.document.deleteMany({ where: { clientId: id } });

    // 3. Clear progress analysis JSON and reset workflow/onboarding
    const existing = await prisma.clientProgress.findUnique({ where: { clientId: id } });
    if (existing) {
      await prisma.clientProgress.update({
        where: { clientId: id },
        data: {
          analysis: null as any,
          uploadedDocs: [],
          workflow: { stage: 'signup_received', updatedAt: new Date().toISOString(), next: [] },
          onboarding: { status: 'pending', signupAt: null, completedAt: null },
          scores: { equifax: null, experian: null, transunion: null },
          disputes: []
        }
      });
    }

    // 4. Reset client status to LEAD and wipe analysis summaries
    const client = await prisma.client.update({
      where: { id },
      data: {
        status: 'LEAD',
        analysisSummary: null,
        disputePlanSummary: null,
        estimatedTimelineMonths: null,
        serviceTier: 'ESSENTIAL',
        portalRestricted: false,
        activatedAt: null,
        upgradeOfferedAt: null
      },
      include: { user: true, documents: true, activities: true, payments: true }
    });

    // 5. Log the reset as an activity
    await prisma.activityEvent.create({
      data: {
        clientId: id,
        type: 'FILE_RESET',
        message: `Staff reset client file. Credit reports, documents, and analysis cleared. Status reset to LEAD.`
      }
    });

    return res.json({ success: true, client });
  } catch (error) {
    next(error);
  }
});
