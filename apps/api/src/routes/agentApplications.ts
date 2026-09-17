import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { writeAuditLog } from '../lib/audit.js';
import { decryptPII, encryptPII } from '../lib/encryption.js';
import { notifyNewAgentApplication, sendAgentApplicationReceivedEmail } from '../lib/email.js';
import { logTurnstileRejection, verifyTurnstileFromBody } from '../lib/turnstile.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';

export const agentApplicationsRouter = Router();

export const AGENT_EXPERIENCE_OPTIONS = [
  'None — new and ready to learn',
  'Some — referred or assisted clients',
  'Experienced — run or ran a credit business',
  'Licensed professional (real estate, lending, insurance, etc.)'
] as const;

export const AGENT_APPLICATION_STATUSES = ['NEW', 'CONTACTED', 'APPROVED', 'DECLINED'] as const;

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));

const createAgentApplicationSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().trim().max(40).refine((v) => v.replace(/\D/g, '').length >= 10, 'Phone number must have at least 10 digits'),
  state: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Use a 2-letter state code').optional().or(z.literal('')),
  experience: z.enum(AGENT_EXPERIENCE_OPTIONS).optional().or(z.literal('')),
  motivation: optionalText(2000),
  source: optionalText(80),
  consent: z.literal(true)
});

const updateAgentApplicationSchema = z.object({
  status: z.enum(AGENT_APPLICATION_STATUSES)
});

function clientIp(req: any) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0]?.trim();
  return forwarded || req.ip || null;
}

agentApplicationsRouter.post('/', async (req, res, next) => {
  try {
    const captcha = await verifyTurnstileFromBody(req.body, req.ip);
    if (!captcha.ok) {
      logTurnstileRejection('/api/agent-applications', captcha, {
        hasToken: Boolean(req.body?.turnstileToken || req.body?.['cf-turnstile-response']),
        referer: req.headers.referer,
        origin: req.headers.origin,
        userAgent: req.headers['user-agent']
      });
      return res.status(400).json({ error: captcha.reason || 'CAPTCHA verification failed' });
    }
    const data = createAgentApplicationSchema.parse(req.body);

    const application = await prisma.agentApplication.create({
      data: {
        firstNameEncrypted: encryptPII(data.firstName)!,
        lastNameEncrypted: encryptPII(data.lastName)!,
        emailEncrypted: encryptPII(data.email)!,
        phoneEncrypted: encryptPII(data.phone)!,
        motivationEncrypted: encryptPII(data.motivation),
        state: data.state || null,
        experience: data.experience || null,
        source: data.source || 'agent_page',
        consentAt: new Date(),
        ipAddress: clientIp(req),
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 500) : null
      },
      select: { id: true, status: true, createdAt: true }
    });

    await writeAuditLog({
      action: 'AGENT_APPLICATION_SUBMITTED',
      entityType: 'AgentApplication',
      entityId: application.id,
      metadata: { state: data.state || null, source: data.source || 'agent_page' }
    });

    // Email failures never fail the submission: the row is already saved and
    // staff can see it in the admin list.
    const [ack, staff] = await Promise.allSettled([
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
        applicant: ack.status === 'fulfilled' ? ack.value.delivery : { skipped: true, reason: 'send failed' },
        staff: staff.status === 'fulfilled' ? staff.value : { skipped: true, reason: 'send failed' }
      }
    });
  } catch (error) {
    next(error);
  }
});

agentApplicationsRouter.get('/', requireAuth, requireRole(['STAFF', 'ADMIN']), async (_req, res, next) => {
  try {
    const rows = await prisma.agentApplication.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
    const applications = rows.map((row) => ({
      id: row.id,
      status: row.status,
      firstName: decryptPII(row.firstNameEncrypted),
      lastName: decryptPII(row.lastNameEncrypted),
      email: decryptPII(row.emailEncrypted),
      phone: decryptPII(row.phoneEncrypted),
      motivation: decryptPII(row.motivationEncrypted),
      state: row.state,
      experience: row.experience,
      source: row.source,
      consentAt: row.consentAt,
      reviewedAt: row.reviewedAt,
      createdAt: row.createdAt
    }));
    return res.json({ applications });
  } catch (error) {
    next(error);
  }
});

agentApplicationsRouter.patch('/:id', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req: AuthedRequest, res, next) => {
  try {
    const { status } = updateAgentApplicationSchema.parse(req.body);
    const existing = await prisma.agentApplication.findUnique({ where: { id: String(req.params.id) }, select: { id: true } });
    if (!existing) return res.status(404).json({ error: 'Agent application not found' });

    const application = await prisma.agentApplication.update({
      where: { id: existing.id },
      data: { status, reviewedAt: new Date(), reviewedById: req.auth?.sub ?? null },
      select: { id: true, status: true, reviewedAt: true }
    });
    await writeAuditLog({
      userId: req.auth?.sub ?? null,
      action: 'AGENT_APPLICATION_STATUS_CHANGED',
      entityType: 'AgentApplication',
      entityId: application.id,
      metadata: { status }
    });
    return res.json({ application });
  } catch (error) {
    next(error);
  }
});
