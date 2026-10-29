import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sendEmail } from '../lib/email.js';

export const adminEmailRouter = Router();

const builtInTemplates = [
  {
    key: 'welcome',
    label: 'Welcome / next steps',
    subject: 'Welcome to CredX — your next steps',
    body: 'Hi {{first_name}},\n\nWelcome to CredX. Sign in to your secure portal to review your next steps.\n\nCredX Support'
  },
  {
    key: 'billing',
    label: 'Billing / account update',
    subject: 'CredX account billing update',
    body: 'Hi {{first_name}},\n\nThis is an update regarding your CredX account. Please sign in to your secure portal to review your billing details and next steps.\n\nCredX Support'
  },
  {
    key: 'proof_verification',
    label: 'Proof verification request',
    subject: 'CredX — proof of verification needed',
    body: 'Hi {{first_name}},\n\nPlease upload the following through your secure CredX portal:\n\n• Proof of address\n• Government-issued ID\n• Social Security documentation\n\nDo not email or text a full Social Security number. Upload it through the secure portal only.\n\nCredX Support'
  },
  {
    key: 'dispute_preparation',
    label: 'Dispute preparation / review',
    subject: 'CredX — dispute preparation update',
    body: 'Hi {{first_name}},\n\nYour dispute preparation is ready for review in the secure CredX portal. Please review the listed accounts, bureaus, and reasons before approving the next step.\n\nCredX Support'
  },
  {
    key: 'analysis_review_follow_up',
    label: 'Analysis review follow-up',
    subject: 'CredX — thank you for reviewing your analysis',
    body: 'Hi {{first_name}},\n\nThank you for reviewing your CredX analysis. Please sign in to your secure portal to confirm the review and complete any remaining account-verification steps.\n\nIf requested in your portal, enter your Social Security number and upload verification documents only through the secure portal. Do not send sensitive identity information by email or text.\n\nCredX Support'
  }
] as const;

const templateKeySchema = z.string().trim().min(2).max(80).regex(/^[a-z0-9_]+$/, 'Use lowercase letters, numbers, and underscores only.');
const sendSchema = z.object({
  clientId: z.string().min(1),
  templateKey: templateKeySchema,
  subject: z.string().trim().min(1).max(180),
  body: z.string().trim().min(1).max(20000)
});
const templateSchema = z.object({
  key: templateKeySchema,
  label: z.string().trim().min(2).max(120),
  subject: z.string().trim().min(1).max(180),
  body: z.string().trim().min(1).max(20000)
});

async function listTemplates() {
  const saved = await prisma.adminEmailTemplate.findMany({ where: { active: true }, orderBy: [{ label: 'asc' }] });
  const overrides = new Map(saved.map((template) => [template.key, template]));
  const merged = builtInTemplates.map((template) => overrides.get(template.key) || template);
  for (const template of saved) if (!builtInTemplates.some((item) => item.key === template.key)) merged.push(template as any);
  return merged.map(({ key, label, subject, body }) => ({ key, label, subject, body }));
}

function merge(text: string, values: Record<string, string>): string {
  return text.replace(/{{\s*([a-z_]+)\s*}}/gi, (_match, key: string) => values[key.toLowerCase()] ?? '');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));
}

adminEmailRouter.get('/templates', requireAuth, requireRole(['STAFF', 'ADMIN']), async (_req, res, next) => {
  try {
    res.json({ templates: await listTemplates() });
  } catch (error) {
    next(error);
  }
});

adminEmailRouter.post('/templates', requireAuth, requireRole(['ADMIN']), async (req: any, res, next) => {
  try {
    const data = templateSchema.parse(req.body);
    const actor = req.auth?.sub || null;
    const template = await prisma.adminEmailTemplate.upsert({
      where: { key: data.key },
      create: { ...data, createdBy: actor, updatedBy: actor },
      update: { label: data.label, subject: data.subject, body: data.body, active: true, updatedBy: actor }
    });
    await prisma.auditLog.create({
      data: { userId: actor, action: 'ADMIN_EMAIL_TEMPLATE_SAVED', entityType: 'AdminEmailTemplate', entityId: template.id, metadata: { key: template.key, label: template.label } }
    });
    res.status(201).json({ template: { key: template.key, label: template.label, subject: template.subject, body: template.body } });
  } catch (error) {
    next(error);
  }
});

adminEmailRouter.post('/send', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req: any, res, next) => {
  try {
    const data = sendSchema.parse(req.body);
    const templates = await listTemplates();
    if (!templates.some((template) => template.key === data.templateKey)) return res.status(400).json({ error: 'Unknown email template.' });
    const client = await prisma.client.findUnique({ where: { id: data.clientId }, include: { user: true } });
    if (!client?.user?.email) return res.status(404).json({ error: 'Client or verified email not found.' });

    const values = {
      first_name: client.user.firstName || 'there',
      last_name: client.user.lastName || '',
      full_name: `${client.user.firstName || ''} ${client.user.lastName || ''}`.trim(),
      email: client.user.email,
      portal_url: 'https://credxme.com/portal'
    };
    const subject = merge(data.subject, values);
    const text = merge(data.body, values);
    const html = text.split(/\n\s*\n/).map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`).join('');
    const result = await sendEmail({
      to: client.user.email,
      subject,
      text: `${text}\n\nSecure portal: ${values.portal_url}`,
      html: `<div style="font-family:Arial,sans-serif;color:#e2e8f0;background:#060a12;padding:32px"><div style="max-width:640px;margin:auto;background:#0b1220;padding:28px;border-top:5px solid #00c6fb"><h1 style="color:#f8fafc">CredX</h1>${html}<p><a href="${values.portal_url}" style="color:#00c6fb">Open secure CredX portal</a></p></div></div>`
    });

    await prisma.activityEvent.create({
      data: {
        clientId: client.id,
        type: 'ADMIN_EMAIL_SENT',
        message: `Manual ${data.templateKey} email sent to verified client email.`,
        metadata: { templateKey: data.templateKey, subject, provider: result.provider || null, messageId: result.id || null, sentBy: req.auth?.sub || null }
      }
    });
    res.json({ sent: !result.skipped, provider: result.provider, messageId: result.id, email: client.user.email });
  } catch (error) {
    next(error);
  }
});
