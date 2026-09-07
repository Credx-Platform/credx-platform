import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { CreditAnalysisService } from '../lib/creditAnalysis.js';
import { dispatchAnalysisEmail } from '../lib/analysisEmailDispatch.js';
import { decryptPII, encryptPII } from '../lib/encryption.js';
import { getSignedUrlForStoredDocument } from '../lib/blob-storage.js';
import { findClientDocumentForUser } from '../lib/tenantQueries.js';
import { extractReport } from '../lib/reportExtractor.js';
import { syncReportDerivedClientData } from '../lib/clientReportSync.js';
import { defaultAffiliateLinks, recommendedAffiliateLinksForAnalysis } from '../lib/affiliateLinks.js';
import { sendAffiliateReferralEmail } from '../lib/email.js';

export const clientsRouter = Router();

type PrintableDocument = {
  id?: string;
  clientId?: string | null;
  type?: string | null;
  bureau?: string | null;
  s3Key?: string | null;
  content?: string | null;
  contentType?: string | null;
  fileName?: string | null;
  [key: string]: unknown;
};

type PrintableSignature = {
  dataUrl: string;
  signedName?: string | null;
  signedAt?: string | null;
} | null;

function decodeDataUrl(dataUrl: string): { buffer: Buffer; mimeType: string } | null {
  const match = String(dataUrl || '').match(/^data:([^;,]+)?(?:;[^,]*)?;base64,(.+)$/s);
  if (!match) return null;
  return {
    mimeType: match[1] || 'application/octet-stream',
    buffer: Buffer.from(match[2], 'base64')
  };
}

async function loadDocumentBuffer(document: PrintableDocument): Promise<{ buffer: Buffer; mimeType: string } | null> {
  if (document.content) {
    const decoded = decodeDataUrl(document.content);
    if (decoded) return decoded;
  }

  if (!document.s3Key) return null;
  const signedUrl = await getSignedUrlForStoredDocument(document.s3Key);
  if (!signedUrl) return null;

  const response = await fetch(signedUrl);
  if (!response.ok) return null;
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType: document.contentType || response.headers.get('content-type') || 'application/octet-stream'
  };
}

async function replaceCreditReportsFromExtraction(clientId: string, extracted: any, fallbackPulledAt: Date) {
  const existingReports = await prisma.creditReport.findMany({
    where: { clientId },
    select: { id: true }
  });

  if (existingReports.length) {
    const ids = existingReports.map((report) => report.id);
    await prisma.tradeline.deleteMany({ where: { creditReportId: { in: ids } } });
    await prisma.creditReport.deleteMany({ where: { id: { in: ids } } });
  }

  const scoreByBureau = new Map<string, number | null>();
  for (const snap of extracted.richPayload?.scores || []) {
    if (snap?.bureau) scoreByBureau.set(snap.bureau, snap.score ?? null);
  }

  for (const bureauReport of extracted.bureauReports || []) {
    const pulledAt = bureauReport.pulledAt ? new Date(bureauReport.pulledAt) : fallbackPulledAt;
    await prisma.creditReport.create({
      data: {
        clientId,
        bureau: bureauReport.bureau,
        source: extracted.source,
        pulledAt: Number.isFinite(pulledAt.getTime()) ? pulledAt : fallbackPulledAt,
        score: scoreByBureau.get(bureauReport.bureau) ?? null,
        rawPayload: { rich: extracted.richPayload, raw: extracted.rawPayload } as any,
        tradelines: {
          create: (bureauReport.tradelines || []).map((tradeline: any) => ({
            creditorName: tradeline.creditorName,
            accountNumber: tradeline.accountNumber,
            accountType: tradeline.accountType,
            status: tradeline.status,
            balance: tradeline.balance,
            isNegative: tradeline.isNegative
          }))
        }
      }
    });
  }
}

async function extractLatestUploadedCreditReport(clientId: string): Promise<{ bureauReports: number; tradelines: number; fileName: string | null }> {
  const document = await prisma.document.findFirst({
    where: { clientId, type: 'CREDIT_REPORT' },
    orderBy: { uploadedAt: 'desc' }
  });

  if (!document) {
    throw new Error('No uploaded credit-report document is on file for this client.');
  }

  const loaded = await loadDocumentBuffer(document);
  if (!loaded) {
    throw new Error('The latest uploaded credit report cannot be read. Re-upload the PDF/HTML report and try again.');
  }

  const extracted = await extractReport({
    buffer: loaded.buffer,
    mimeType: document.contentType || loaded.mimeType,
    filename: document.fileName || 'credit-report.pdf'
  });

  if (!extracted || extracted.bureauReports.length === 0) {
    throw new Error('The uploaded report saved, but extraction did not return bureau data. Check AI gateway credits/model access and try again.');
  }

  await replaceCreditReportsFromExtraction(clientId, extracted, document.uploadedAt || new Date());

  const tradelines = extracted.bureauReports.reduce((sum, report) => sum + report.tradelines.length, 0);
  await prisma.activityEvent.create({
    data: {
      clientId,
      type: 'CREDIT_REPORT_REPROCESSED',
      message: `Credit report extracted from uploaded document: ${extracted.bureauReports.length} bureau report(s), ${tradelines} tradeline(s).`,
      metadata: {
        fileName: document.fileName,
        bureauReports: extracted.bureauReports.length,
        tradelines,
        source: extracted.source
      }
    }
  });

  return { bureauReports: extracted.bureauReports.length, tradelines, fileName: document.fileName || null };
}

async function signatureForPrintableDocument(document: PrintableDocument): Promise<PrintableSignature> {
  if (!document.clientId) return null;

  const progress = await prisma.clientProgress.findUnique({
    where: { clientId: document.clientId },
    select: { onboarding: true }
  });

  const signature = (progress?.onboarding as any)?.signature;
  if (!signature?.dataUrl || typeof signature.dataUrl !== 'string') return null;
  if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(signature.dataUrl)) return null;

  return {
    dataUrl: signature.dataUrl,
    signedName: typeof signature.signedName === 'string' ? signature.signedName : null,
    signedAt: typeof signature.signedAt === 'string' ? signature.signedAt : null
  };
}

/**
 * Self-heals a legacy dispute letter whose body was lost (it only ever lived on
 * Railway's ephemeral /tmp, wiped on redeploy). Rebuilds the consolidated letter
 * from the client's stored analysis and persists it to `document.content`, so the
 * operator can print without the destructive "Regenerate Letters" flow (which
 * deletes dispute items + round history). Returns the recovered body, or null if
 * it cannot be rebuilt (not a dispute letter, no bureau, or no analysis on file).
 */
async function recoverDisputeLetterContent(document: PrintableDocument): Promise<string | null> {
  if (document.type !== 'DISPUTE_LETTER' || !document.bureau || !document.clientId || !document.id) {
    return null;
  }

  const client = await prisma.client.findUnique({
    where: { id: document.clientId },
    include: { user: true, progress: true }
  });

  if (!client?.progress?.analysis) return null;

  const { buildConsolidatedLetterContent } = await import('../lib/disputeAutomation.js');
  const content = buildConsolidatedLetterContent(
    client,
    client.progress.analysis as unknown as Parameters<typeof buildConsolidatedLetterContent>[1],
    document.bureau
  );

  if (!content) return null;

  await prisma.document.update({ where: { id: document.id }, data: { content } });
  return content;
}

async function sendPrintableDocument(res: any, document: PrintableDocument) {
  const signature = document.type === 'DISPUTE_LETTER'
    ? await signatureForPrintableDocument(document)
    : null;

  // Prefer the DB-stored body: reliable across redeploys/replicas. Generated
  // dispute letters store their content here.
  if (document.content && /^data:/i.test(document.content.trim())) {
    return res.json({ document, url: document.content, signature });
  }

  if (document.content) {
    return res.json({ document, content: document.content, signature });
  }

  const s3Key = document.s3Key || '';

  // Private Vercel Blob objects are never returned directly. Generate a
  // short-lived signed URL that expires in 15 minutes.
  if (s3Key) {
    const signedUrl = await getSignedUrlForStoredDocument(s3Key);
    if (signedUrl) {
      return res.json({ document, url: signedUrl, signature });
    }
  }

  // Legacy public HTTPS URLs (non-blob) pass through unchanged.
  if (/^https?:\/\//i.test(s3Key)) {
    return res.json({ document, url: s3Key, signature });
  }

  const name = (document.fileName || '').toLowerCase();
  const key = s3Key.toLowerCase();
  if (document.contentType?.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md') || key.endsWith('.txt') || key.endsWith('.md')) {
    try {
      const content = await fs.readFile(s3Key, 'utf-8');
      return res.json({ document, content, signature });
    } catch {
      // Legacy letter written only to ephemeral /tmp and since wiped. Rebuild it
      // from the client's analysis and persist it — no destructive regenerate,
      // no loss of dispute-round history.
      const recovered = await recoverDisputeLetterContent(document);
      if (recovered) {
        return res.json({ document: { ...document, content: recovered }, content: recovered, signature });
      }
      return res.status(410).json({ error: 'This letter could not be recovered automatically (no saved analysis for this client). Use "Regenerate Letters" on the client to recreate it.' });
    }
  }

  if (s3Key) return res.json({ document, url: s3Key, signature });
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
        progress: true,
        referredBySubAgent: true
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
    const document = await findClientDocumentForUser(req.auth!.sub, documentId);

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
        referredBySubAgent: true,
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
  dobEncrypted: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  ssnEncrypted: z.string().regex(/^\d{9}$/).optional().or(z.literal(''))
});

const statusUpdateSchema = z.object({
  status: z.enum(['LEAD', 'STUDENT', 'CONTRACT_SENT', 'INTAKE_RECEIVED', 'ANALYSIS_READY', 'UPGRADE_OFFERED', 'ACTIVE', 'PAST_DUE', 'RESTRICTED', 'CANCELLED'])
});

const shareAffiliateLinksSchema = z.object({
  labels: z.array(z.string().min(1).max(80)).optional(),
  note: z.string().max(600).optional().or(z.literal(''))
});

const adminCreateClientSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email(),
  phone: z.string().max(40).optional().or(z.literal('')),
  status: z.enum(['LEAD', 'STUDENT', 'CONTRACT_SENT', 'INTAKE_RECEIVED', 'ANALYSIS_READY', 'UPGRADE_OFFERED', 'ACTIVE', 'PAST_DUE', 'RESTRICTED', 'CANCELLED']).optional(),
  serviceTier: z.enum(['ESSENTIAL', 'AGGRESSIVE', 'FAMILY']).optional(),
  subAgentId: z.string().optional().or(z.literal('')),
  referralCode: z.string().optional().or(z.literal(''))
});

const adminProfileUpdateSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email(),
  phone: z.string().max(40).optional().or(z.literal('')),
  serviceTier: z.enum(['ESSENTIAL', 'AGGRESSIVE', 'FAMILY']),
  currentAddressLine1: z.string().max(160).optional().or(z.literal('')),
  currentAddressLine2: z.string().max(160).optional().or(z.literal('')),
  currentCity: z.string().max(80).optional().or(z.literal('')),
  currentState: z.string().max(40).optional().or(z.literal('')),
  currentPostalCode: z.string().max(20).optional().or(z.literal('')),
  ssnFull: z.string().regex(/^\d{9}$/).optional().or(z.literal('')),
  dobEncrypted: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  portalRestricted: z.boolean().optional()
});

function affiliateAuthEmail(subAgentId: string) {
  return `affiliate-${subAgentId}@auth.credx.local`;
}

async function releaseAffiliateEmailForClient(emailOwnerId: string) {
  const subAgent = await prisma.subAgent.findUnique({ where: { adminUserId: emailOwnerId } });
  if (!subAgent) return false;

  const syntheticEmail = affiliateAuthEmail(subAgent.id);
  const existingSynthetic = await prisma.user.findUnique({ where: { email: syntheticEmail } });
  await prisma.user.update({
    where: { id: emailOwnerId },
    data: {
      email: existingSynthetic && existingSynthetic.id !== emailOwnerId
        ? `affiliate-${subAgent.id}-${Date.now()}@auth.credx.local`
        : syntheticEmail
    }
  });
  return true;
}

clientsRouter.post('/', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const data = adminCreateClientSchema.parse(req.body);
    const email = data.email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const subAgent = data.subAgentId
      ? await prisma.subAgent.findUnique({ where: { id: data.subAgentId } })
      : data.referralCode
        ? await prisma.subAgent.findUnique({ where: { referralCode: data.referralCode } })
        : null;

    const provisionalPassword = randomBytes(24).toString('base64url');
    const passwordHash = await bcrypt.hash(provisionalPassword, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        phone: data.phone?.trim() || null,
        client: {
          create: {
            status: data.status || 'LEAD',
            serviceTier: data.serviceTier || 'ESSENTIAL',
            customerType: subAgent ? 'SUB_AGENT_REFERRAL' : 'MANUAL',
            referralCodeAtSignup: subAgent?.referralCode || null,
            referredBySubAgentId: subAgent?.id || null,
            progress: {
              create: {
                onboarding: {
                  status: 'manual_admin_added',
                  signupAt: new Date().toISOString(),
                  completedAt: null,
                  referralSource: subAgent ? 'Sub Agent' : 'Manual Admin',
                  referralDetail: subAgent?.name || null,
                  subAgentReferralCode: subAgent?.referralCode || null,
                  subAgentAffiliateId: subAgent?.affiliateId || null,
                  subAgentName: subAgent?.name || null
                }
              }
            }
          }
        }
      },
      include: {
        client: {
          include: {
            user: true,
            payments: true,
            disputes: true,
            documents: true,
            activities: true,
            progress: true,
            referredBySubAgent: true
          }
        }
      }
    });

    if (subAgent && user.client) {
      await prisma.subAgentContact.create({
        data: {
          subAgentId: subAgent.id,
          status: 'CLIENT_ADDED_BY_ADMIN',
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          landingPath: '/adminportal/clients',
          sourceUrl: 'manual-admin'
        }
      });
    }

    return res.status(201).json({ client: user.client });
  } catch (error) {
    next(error);
  }
});

clientsRouter.patch('/:id/profile', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const data = adminProfileUpdateSchema.parse(req.body);
    const email = data.email.toLowerCase().trim();

    const existingClient = await prisma.client.findUnique({
      where: { id },
      include: { user: true }
    });
    if (!existingClient) return res.status(404).json({ error: 'Client not found' });

    const emailOwner = await prisma.user.findUnique({ where: { email } });
    if (emailOwner && emailOwner.id !== existingClient.userId) {
      if (emailOwner.role !== 'AFFILIATE' || !(await releaseAffiliateEmailForClient(emailOwner.id))) {
        return res.status(409).json({ error: 'Email already registered to another user' });
      }
    }

    const client = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: existingClient.userId },
        data: {
          firstName: data.firstName.trim(),
          lastName: data.lastName.trim(),
          email,
          phone: data.phone?.trim() || null
        }
      });

      const updated = await tx.client.update({
        where: { id },
        data: {
          serviceTier: data.serviceTier,
          currentAddressLine1: data.currentAddressLine1?.trim() || null,
          currentAddressLine2: data.currentAddressLine2?.trim() || null,
          currentCity: data.currentCity?.trim() || null,
          currentState: data.currentState?.trim() || null,
          currentPostalCode: data.currentPostalCode?.trim() || null,
          ...(data.ssnFull ? { ssnLast4: data.ssnFull.slice(-4) } : {}),
          ...(data.ssnFull ? { ssnEncrypted: encryptPII(data.ssnFull) } : {}),
          ...(data.dobEncrypted ? { dobEncrypted: encryptPII(data.dobEncrypted.trim()) } : {}),
          portalRestricted: data.portalRestricted ?? existingClient.portalRestricted
        },
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
          referredBySubAgent: true,
          creditReports: {
            orderBy: { pulledAt: 'desc' },
            include: { tradelines: true }
          }
        }
      });

      await tx.activityEvent.create({
        data: {
          clientId: id,
          type: 'admin_profile_updated',
          message: `Customer profile was updated by staff user ${req.auth?.sub || 'unknown'}.`
        }
      });

      return updated;
    });

    return res.json({ client });
  } catch (error) {
    next(error);
  }
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
    if (data.dobEncrypted !== undefined) updateData.dobEncrypted = data.dobEncrypted ? encryptPII(data.dobEncrypted) : null;
    if (data.ssnEncrypted !== undefined) {
      const ssn = data.ssnEncrypted.replace(/\D/g, '');
      updateData.ssnEncrypted = ssn ? encryptPII(ssn) : null;
      updateData.ssnLast4 = ssn ? ssn.slice(-4) : null;
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
    const existingProgress = await prisma.clientProgress.findUnique({
      where: { clientId: id }
    });
    const client = await prisma.client.update({
      where: { id },
      data: {
        analysisSummary: data.analysisSummary,
        disputePlanSummary: data.disputePlanSummary,
        estimatedTimelineMonths: data.estimatedTimelineMonths,
        serviceTier: data.serviceTier,
        status: 'ANALYSIS_READY',
        portalRestricted: false
      },
      include: { user: true, payments: true, disputes: true, documents: true, activities: true }
    });

    const nowIso = new Date().toISOString();
    const nextWorkflow = {
      ...((existingProgress?.workflow as any) || {}),
      stage: 'analysis_review_ready',
      updatedAt: nowIso,
      next: ['review_analysis', 'choose_plan'],
      analysisReview: {
        ...(((existingProgress?.workflow as any)?.analysisReview) || {}),
        readyAt: nowIso,
        completedAt: null,
        method: 'portal'
      }
    };

    if (existingProgress) {
      await prisma.clientProgress.update({
        where: { clientId: id },
        data: { workflow: nextWorkflow }
      });
    } else {
      await prisma.clientProgress.create({
        data: {
          clientId: id,
          workflow: nextWorkflow
        }
      });
    }

    await prisma.activityEvent.create({
      data: {
        clientId: id,
        type: 'ANALYSIS_REVIEW_READY',
        message: 'Credit analysis is complete and ready for client review before payment is requested.',
        metadata: { method: 'portal', readyAt: nowIso, serviceTier: data.serviceTier || client.serviceTier }
      }
    });

    // NOTE: the pending setup bill is intentionally NOT raised here. The
    // analysis must be reviewed and confirmed by the client before payment is
    // requested.

    return res.status(201).json({ client });
  } catch (error) {
    next(error);
  }
});

clientsRouter.post('/me/analysis-review/complete', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const client = await prisma.client.findUnique({
      where: { userId: req.auth!.sub },
      include: { progress: true, payments: true, disputes: true, tasks: true, documents: true, activities: true }
    });

    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (!client.analysisSummary && !client.progress?.analysis) {
      return res.status(400).json({ error: 'Analysis is not ready yet.' });
    }

    const nowIso = new Date().toISOString();
    const existingWorkflow = ((client.progress?.workflow as any) || {});
    const nextWorkflow = {
      ...existingWorkflow,
      stage: 'analysis_review_completed',
      updatedAt: nowIso,
      next: ['choose_plan', 'complete_payment'],
      analysisReview: {
        ...(existingWorkflow.analysisReview || {}),
        readyAt: existingWorkflow.analysisReview?.readyAt || nowIso,
        completedAt: nowIso,
        method: 'portal',
        acknowledgedBy: req.auth!.sub
      }
    };

    if (client.progress) {
      await prisma.clientProgress.update({
        where: { clientId: client.id },
        data: { workflow: nextWorkflow }
      });
    } else {
      await prisma.clientProgress.create({
        data: {
          clientId: client.id,
          workflow: nextWorkflow
        }
      });
    }

    const { createPendingSetupBill } = await import('../lib/billingActivation.js');
    await createPendingSetupBill(client.id, client.serviceTier);

    const updated = await prisma.client.update({
      where: { id: client.id },
      data: {
        status: 'UPGRADE_OFFERED',
        upgradeOfferedAt: new Date(),
        portalRestricted: false
      },
      include: { payments: true, disputes: true, tasks: true, documents: true, activities: true }
    });

    await prisma.activityEvent.create({
      data: {
        clientId: client.id,
        type: 'ANALYSIS_REVIEW_COMPLETED',
        message: 'Client confirmed review of the completed credit analysis. Payment request stage is now available.',
        metadata: { method: 'portal', completedAt: nowIso }
      }
    });

    return res.json({ success: true, client: updated, workflow: nextWorkflow });
  } catch (error) {
    next(error);
  }
});

clientsRouter.delete('/:id', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const client = await prisma.client.findUnique({ where: { id }, include: { user: true } });
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const reports = await prisma.creditReport.findMany({ where: { clientId: id }, select: { id: true } });
    const reportIds = reports.map((report) => report.id);
    const disputeItems = await prisma.disputeItem.findMany({ where: { clientId: id }, select: { id: true } });
    const disputeItemIds = disputeItems.map((item) => item.id);

    await prisma.$transaction(async (tx) => {
      if (reportIds.length) {
        await tx.tradeline.deleteMany({ where: { creditReportId: { in: reportIds } } });
        await tx.creditReport.deleteMany({ where: { id: { in: reportIds } } });
      }
      if (disputeItemIds.length) {
        await tx.disputeRound.deleteMany({ where: { disputeItemId: { in: disputeItemIds } } });
      }
      await tx.document.deleteMany({ where: { clientId: id } });
      await tx.disputeItem.deleteMany({ where: { clientId: id } });
      await tx.dispute.deleteMany({ where: { clientId: id } });
      await tx.payment.deleteMany({ where: { clientId: id } });
      await tx.agreement.deleteMany({ where: { clientId: id } });
      await tx.task.deleteMany({ where: { clientId: id } });
      await tx.note.deleteMany({ where: { clientId: id } });
      await tx.activityEvent.deleteMany({ where: { clientId: id } });
      await tx.clientProgress.deleteMany({ where: { clientId: id } });
      await tx.client.delete({ where: { id } });
      await tx.auditLog.updateMany({ where: { userId: client.userId }, data: { userId: null } });
      await tx.user.delete({ where: { id: client.userId } });
      await tx.auditLog.create({
        data: {
          userId: req.auth?.sub,
          action: 'CLIENT_DELETED',
          entityType: 'Client',
          entityId: id,
          metadata: {
            deletedUserId: client.userId,
            email: client.user.email,
            fullName: `${client.user.firstName} ${client.user.lastName}`.trim(),
            reportCount: reportIds.length,
            disputeItemCount: disputeItemIds.length
          }
        }
      });
    });

    return res.json({ success: true, deletedClientId: id, deletedUserId: client.userId });
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

clientsRouter.post('/:id/regenerate-letters', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req: AuthedRequest, res, next) => {
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
    const result = await activateClientDisputeCampaign(id, {
      stateReviewOverride: req.body?.stateReviewOverride === true,
      overrideBy: req.auth?.sub
    });

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

clientsRouter.post('/:id/escalation-packet', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const { generateEscalationPacket } = await import('../lib/disputeAutomation.js');
    const result = await generateEscalationPacket(id);

    return res.status(201).json({
      success: true,
      document: result.document,
      content: result.content,
      opportunities: result.opportunities,
      lettersIncluded: result.lettersIncluded,
      client: await prisma.client.findUnique({
        where: { id },
        include: { user: true, documents: true, disputeItems: true, tasks: true, activities: true, progress: true }
      })
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'Client not found') return res.status(404).json({ error: message });
    if (message.startsWith('No credit analysis found')) return res.status(400).json({ error: message });
    next(error);
  }
});

// ========== MARK PAID (Admin manual settlement — settle ONLY, never activates) ==========

// Manual "Mark Paid" path (cash / off-platform payment). Per counsel (2026-07-07)
// payment never triggers dispute work: this settles the bill and refuses with 409
// unless the billing gate is satisfied (analysis review completed + cancellation
// window expired). Activation is the separate /:id/activate admin action.
clientsRouter.post('/:id/mark-paid-and-activate', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const amount = typeof req.body.amount === 'number' ? req.body.amount : undefined;
    const currency = typeof req.body.currency === 'string' ? req.body.currency : undefined;

    const { settleSetupPayment } = await import('../lib/billingActivation.js');
    const result = await settleSetupPayment(id, { amount, currency, method: 'manual' });

    return res.json({
      success: true,
      settled: true,
      payment: result.payment,
      client: await prisma.client.findUnique({
        where: { id },
        include: { user: true, documents: true, disputeItems: true, tasks: true, payments: true }
      })
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'Client not found') return res.status(404).json({ error: message });
    if (error instanceof Error && error.name === 'BillingGateError') {
      return res.status(409).json({ error: error.message, reasons: (error as any).reasons });
    }
    next(error);
  }
});

clientsRouter.post('/:id/activate', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req: AuthedRequest, res, next) => {
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
    const result = await activateClientDisputeCampaign(id, {
      stateReviewOverride: req.body?.stateReviewOverride === true,
      overrideBy: req.auth?.sub
    });

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
    let client = await prisma.client.findUnique({
      where: { id },
      include: {
        user: true,
        progress: true,
        creditReports: {
          orderBy: { pulledAt: 'desc' },
          include: { tradelines: true }
        }
      }
    });

    if (!client) return res.status(404).json({ error: 'Client not found' });

    let extractedFromUpload: Awaited<ReturnType<typeof extractLatestUploadedCreditReport>> | null = null;
    if (client.creditReports.length === 0) {
      extractedFromUpload = await extractLatestUploadedCreditReport(id);
      client = await prisma.client.findUnique({
        where: { id },
        include: {
          user: true,
          progress: true,
          creditReports: {
            orderBy: { pulledAt: 'desc' },
            include: { tradelines: true }
          }
        }
      });
    }

    if (!client || client.creditReports.length === 0) {
      return res.status(400).json({ error: 'No parsed credit report data found. Upload a PDF/HTML report and try again.' });
    }

    const analysis = CreditAnalysisService.generate({
      client: client as any,
      creditReports: client.creditReports as any
    });

    // Store analysis in ClientProgress.analysis JSON field
    const progress = client.progress || await prisma.clientProgress.findUnique({ where: { clientId: id } });

    const nowIso = new Date().toISOString();
    const analysisReviewWorkflow = {
      stage: 'analysis_review_ready',
      updatedAt: nowIso,
      next: ['review_analysis', 'choose_plan'],
      analysisReview: {
        ...(((progress?.workflow as any)?.analysisReview) || {}),
        readyAt: nowIso,
        completedAt: null,
        method: 'portal'
      }
    };

    await syncReportDerivedClientData(prisma, {
      client: client as any,
      analysis,
      workflow: {
        ...(progress?.workflow as any || {}),
        ...analysisReviewWorkflow
      }
    });

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
        message: extractedFromUpload
          ? `Credit analysis generated from uploaded report: ${analysis.keyFindings.length} findings, ${analysis.disputeOpportunities.length} dispute opportunities identified.`
          : `Credit analysis generated: ${analysis.keyFindings.length} findings, ${analysis.disputeOpportunities.length} dispute opportunities identified.`,
        metadata: {
          findingCount: analysis.keyFindings.length,
          disputeCount: analysis.disputeOpportunities.length,
          totalAccounts: analysis.overallStats.totalAccounts,
          extractedFromUpload
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
      extractedFromUpload,
      emailed: emailResult.sent,
      ...(emailResult.sent ? { emailMessageId: emailResult.messageId } : { emailSkippedReason: emailResult.reason })
    });
  } catch (error) {
    next(error);
  }
});

clientsRouter.post('/:id/analysis/share', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const client = await prisma.client.findUnique({
      where: { id },
      include: { user: true, progress: true }
    });

    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (!client.user?.email) return res.status(400).json({ error: 'Client does not have an email address on file.' });
    if (!client.progress?.analysis) return res.status(400).json({ error: 'No analysis report is available for this client yet.' });

    const emailResult = await dispatchAnalysisEmail({
      clientId: id,
      analysis: client.progress.analysis as any,
      trigger: 'manual_staff_share',
      force: true
    });

    if (!emailResult.sent) {
      return res.status(502).json({ error: emailResult.reason || 'Analysis email could not be sent.' });
    }

    return res.json({
      success: true,
      emailed: true,
      email: client.user.email,
      emailMessageId: emailResult.messageId || null
    });
  } catch (error) {
    next(error);
  }
});

clientsRouter.post('/:id/referral-links/share', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const data = shareAffiliateLinksSchema.parse(req.body || {});
    const client = await prisma.client.findUnique({
      where: { id },
      include: { user: true, progress: true }
    });

    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (!client.user?.email) return res.status(400).json({ error: 'Client does not have an email address on file.' });

    const selectedLabels = new Set((data.labels || []).map((label) => label.trim()).filter(Boolean));
    const links = selectedLabels.size
      ? defaultAffiliateLinks.filter((link) => selectedLabels.has(link.label))
      : recommendedAffiliateLinksForAnalysis(client.progress?.analysis);

    if (!links.length) return res.status(400).json({ error: 'No referral links were selected.' });

    const delivery = await sendAffiliateReferralEmail({
      to: client.user.email,
      firstName: client.user.firstName,
      links,
      note: data.note || null
    });

    if (delivery.delivery.skipped) {
      return res.status(502).json({ error: delivery.delivery.reason || 'Referral email could not be sent.' });
    }

    const progress = client.progress || await prisma.clientProgress.create({ data: { clientId: client.id } });
    const existingEducation = (progress.education && typeof progress.education === 'object' ? progress.education : {}) as Record<string, unknown>;
    await prisma.clientProgress.update({
      where: { clientId: client.id },
      data: {
        education: {
          ...existingEducation,
          affiliateLinks: links,
          affiliateLinksLastSentAt: new Date().toISOString()
        } as any
      }
    });

    await prisma.activityEvent.create({
      data: {
        clientId: client.id,
        type: 'AFFILIATE_REFERRALS_SENT',
        message: `Staff sent ${links.length} recommended referral resource(s) to ${client.user.email}.`,
        metadata: {
          labels: links.map((link) => link.label),
          sentBy: req.auth?.sub || null
        }
      }
    });

    return res.json({
      success: true,
      emailed: true,
      email: client.user.email,
      links,
      emailMessageId: delivery.delivery.id || null
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

    let client = await prisma.client.findUnique({
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

    let extractedFromUpload: Awaited<ReturnType<typeof extractLatestUploadedCreditReport>> | null = null;
    if (client.creditReports.length === 0) {
      extractedFromUpload = await extractLatestUploadedCreditReport(id);
      client = await prisma.client.findUnique({
        where: { id },
        include: {
          user: true,
          creditReports: {
            orderBy: { pulledAt: 'desc' },
            include: { tradelines: true }
          }
        }
      });
    }

    // Need at least some credit report data
    if (!client || client.creditReports.length === 0) {
      return res.status(400).json({ error: 'No parsed credit report data found. Upload a PDF/HTML report and try again.' });
    }

    const analysis = CreditAnalysisService.generate({
      client: client as any,
      creditReports: client.creditReports as any
    });

    const readyAt = new Date().toISOString();
    await syncReportDerivedClientData(prisma, {
      client: client as any,
      analysis,
      workflow: {
        ...(existing?.workflow as any || {}),
        stage: 'analysis_review_ready',
        updatedAt: readyAt,
        next: ['review_analysis', 'choose_plan'],
        analysisReview: {
          ...(((existing?.workflow as any)?.analysisReview) || {}),
          readyAt,
          completedAt: null,
          method: 'portal'
        }
      }
    });

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
          disputeCount: analysis.disputeOpportunities.length,
          extractedFromUpload
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
      extractedFromUpload,
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
