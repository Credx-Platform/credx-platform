import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sendEmail } from '../lib/email.js';

export const adminEmailRouter = Router();

const templates = [
  { key: 'welcome', label: 'Welcome / next steps', subject: 'Welcome to CredX — your next steps', body: 'Hi {{first_name}},\n\nWelcome to CredX. Sign in to your secure portal to review your next steps.\n\nCredX Support' },
  { key: 'billing', label: 'Billing / account update', subject: 'CredX account billing update', body: 'Hi {{first_name}},\n\nThis is an update regarding your CredX account. Please sign in to your secure portal to review your billing details and next steps.\n\nCredX Support' },
  { key: 'proof_verification', label: 'Proof verification request', subject: 'CredX — proof of verification needed', body: 'Hi {{first_name}},\n\nPlease upload the following through your secure CredX portal:\n\n• Proof of address\n• Government-issued ID\n• Social Security documentation\n\nDo not email or text a full Social Security number. Upload it through the secure portal only.\n\nCredX Support' },
  { key: 'dispute_preparation', label: 'Dispute preparation / review', subject: 'CredX — dispute preparation update', body: 'Hi {{first_name}},\n\nYour dispute preparation is ready for review in the secure CredX portal. Please review the listed accounts, bureaus, and reasons before approving the next step.\n\nCredX Support' }
] as const;

const sendSchema = z.object({ clientId: z.string().min(1), templateKey: z.string().min(1), subject: z.string().trim().min(1).max(180), body: z.string().trim().min(1).max(20000) });

function merge(text: string, values: Record<string, string>): string {
  return text.replace(/{{\s*([a-z_]+)\s*}}/gi, (_match, key: string) => values[key.toLowerCase()] ?? '');
}

adminEmailRouter.get('/templates', requireAuth, requireRole(['STAFF', 'ADMIN']), (_req, res) => res.json({ templates }));

adminEmailRouter.post('/send', requireAuth, requireRole(['STAFF', 'ADMIN']), async (req: any, res, next) => {
  try {
    const data = sendSchema.parse(req.body);
    const client = await prisma.client.findUnique({ where: { id: data.clientId }, include: { user: true } });
    if (!client?.user?.email) return res.status(404).json({ error: 'Client or verified email not found.' });
    const values = { first_name: client.user.firstName || 'there', last_name: client.user.lastName || '', full_name: `${client.user.firstName || ''} ${client.user.lastName || ''}`.trim(), email: client.user.email, portal_url: 'https://credxme.com/portal' };
    const subject = merge(data.subject, values);
    const text = merge(data.body, values);
    const html = text.split(/\n\s*\n/).map((paragraph) => `<p>${paragraph.split('\n').join('<br />')}</p>`).join('');
    const result = await sendEmail({ to: client.user.email, subject, text: `${text}\n\nSecure portal: ${values.portal_url}`, html: `<div style="font-family:Arial,sans-serif;color:#e2e8f0;background:#060a12;padding:32px"><div style="max-width:640px;margin:auto;background:#0b1220;padding:28px;border-top:5px solid #00c6fb"><h1 style="color:#f8fafc">CredX</h1>${html}<p><a href="${values.portal_url}" style="color:#00c6fb">Open secure CredX portal</a></p></div></div>` });
    await prisma.activityEvent.create({ data: { clientId: client.id, type: 'ADMIN_EMAIL_SENT', message: `Manual ${data.templateKey} email sent to verified client email.`, metadata: { templateKey: data.templateKey, subject, provider: result.provider || null, messageId: result.id || null, sentBy: req.auth?.sub || null } } });
    res.json({ sent: !result.skipped, provider: result.provider, messageId: result.id, email: client.user.email });
  } catch (error) { next(error); }
});
