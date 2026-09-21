import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { decryptPII, encryptPII } from '../lib/encryption.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { logTurnstileRejection, verifyTurnstileFromBody } from '../lib/turnstile.js';
import { notifyNewAgentApplication, sendAgentApplicationReceivedEmail } from '../lib/email.js';

export const agentApplicationsRouter = Router();

const createSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().trim().max(40).refine((value) => value.replace(/\D/g, '').length >= 10, 'Phone number must have at least 10 digits'),
  state: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional().or(z.literal('')),
  experience: z.string().trim().max(160).optional().or(z.literal('')),
  motivation: z.string().trim().max(2000).optional().or(z.literal('')),
  professionalTitle: z.string().trim().max(160).optional().or(z.literal('')),
  socialMedia: z.string().trim().max(1000).optional().or(z.literal('')),
  backgroundReferences: z.string().trim().max(3000).optional().or(z.literal('')),
  source: z.string().trim().max(80).optional().or(z.literal('')),
  consent: z.literal(true)
});

const statusSchema = z.object({ status: z.enum(['NEW', 'CONTACTED', 'APPROVED', 'DECLINED']) });

function clientIp(req: any) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0]?.trim() || req.ip || null;
}

function present(row: any) {
  return {
    id: row.id,
    firstName: decryptPII(row.firstNameEncrypted),
    lastName: decryptPII(row.lastNameEncrypted),
    email: decryptPII(row.emailEncrypted),
    phone: decryptPII(row.phoneEncrypted),
    motivation: decryptPII(row.motivationEncrypted),
    professionalTitle: decryptPII(row.professionalTitleEncrypted),
    socialMedia: decryptPII(row.socialMediaEncrypted),
    backgroundReferences: decryptPII(row.backgroundReferencesEncrypted),
    state: row.state,
    experience: row.experience,
    source: row.source,
    status: row.status,
    consentAt: row.consentAt,
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt
  };
}

agentApplicationsRouter.post('/', async (req, res, next) => {
  try {
    const captcha = await verifyTurnstileFromBody(req.body, req.ip);
    if (!captcha.ok) {
      logTurnstileRejection('/api/agent-applications', captcha, { referer: req.headers.referer, origin: req.headers.origin, userAgent: req.headers['user-agent'] });
      return res.status(400).json({ error: captcha.reason || 'CAPTCHA verification failed' });
    }
    const data = createSchema.parse(req.body);
    const application = await prisma.agentApplication.create({
      data: {
        firstNameEncrypted: encryptPII(data.firstName)!,
        lastNameEncrypted: encryptPII(data.lastName)!,
        emailEncrypted: encryptPII(data.email)!,
        phoneEncrypted: encryptPII(data.phone)!,
        motivationEncrypted: encryptPII(data.motivation),
        professionalTitleEncrypted: encryptPII(data.professionalTitle),
        socialMediaEncrypted: encryptPII(data.socialMedia),
        backgroundReferencesEncrypted: encryptPII(data.backgroundReferences),
        state: data.state || null,
        experience: data.experience || null,
        source: data.source || 'agent_page',
        consentAt: new Date(),
        ipAddress: clientIp(req),
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 500) : null
      },
      select: { id: true, status: true, createdAt: true }
    });
    await writeAuditLog({ action: 'AGENT_APPLICATION_SUBMITTED', entityType: 'AgentApplication', entityId: application.id, metadata: { source: data.source || 'agent_page' } });
    const [applicantEmail, staffEmail] = await Promise.allSettled([
      sendAgentApplicationReceivedEmail({ applicationId: application.id, to: data.email, firstName: data.firstName }),
      notifyNewAgentApplication({
        applicationId: application.id,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        state: data.state || null,
        experience: data.experience || null,
        motivation: data.motivation || null
      })
    ]);
    return res.status(201).json({
      application,
      message: 'Agent application received.',
      emails: {
        applicant: applicantEmail.status === 'fulfilled' ? applicantEmail.value.delivery : { skipped: true, reason: 'send failed' },
        staff: staffEmail.status === 'fulfilled' ? staffEmail.value : { skipped: true, reason: 'send failed' }
      }
    });
  } catch (error) {
    next(error);
  }
});

agentApplicationsRouter.get('/', requireAuth, requireRole(['STAFF', 'ADMIN']), async (_req, res, next) => {
  try {
    const rows = await prisma.agentApplication.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
    return res.json({ applications: rows.map(present) });
  } catch (error) {
    next(error);
  }
});

agentApplicationsRouter.patch('/:id', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req: AuthedRequest, res, next) => {
  try {
    const { status } = statusSchema.parse(req.body);
    const id = String(req.params.id);
    const existing = await prisma.agentApplication.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return res.status(404).json({ error: 'Agent application not found' });
    const application = await prisma.agentApplication.update({
      where: { id },
      data: { status, reviewedAt: new Date(), reviewedById: req.auth?.sub ?? null },
      select: { id: true, status: true, reviewedAt: true }
    });
    await writeAuditLog({ userId: req.auth?.sub ?? null, action: 'AGENT_APPLICATION_STATUS_CHANGED', entityType: 'AgentApplication', entityId: id, metadata: { status } });
    return res.json({ application });
  } catch (error) {
    next(error);
  }
});
