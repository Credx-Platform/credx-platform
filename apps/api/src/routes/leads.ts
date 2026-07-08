import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { notifyNewLead, sendWelcomeLeadEmail } from '../lib/email.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { verifyTurnstileFromBody } from '../lib/turnstile.js';

export const leadsRouter = Router();

leadsRouter.get('/', requireAuth, requireRole(['STAFF', 'ADMIN']), async (_req, res, next) => {
  try {
    const leads = await prisma.lead.findMany({ orderBy: { createdAt: 'desc' } });
    return res.json({ leads });
  } catch (error) {
    next(error);
  }
});

const createLeadSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  creditGoal: z.string().optional(),
  referralSource: z.string().optional(),
  referralName: z.string().optional(),
  referralOther: z.string().optional(),
  offerInterest: z.enum(['program', 'masterclass']).optional()
});

leadsRouter.post('/', async (req, res, next) => {
  try {
    const captcha = await verifyTurnstileFromBody(req.body, req.ip);
    if (!captcha.ok) return res.status(400).json({ error: captcha.reason || 'CAPTCHA verification failed' });
    const data = createLeadSchema.parse(req.body);
    const offerEligibleUntil = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const affiliateLinks = [
      { label: 'Self Lender', url: 'https://self.inc/refer/16452347', category: 'credit_builder' },
      { label: 'Credit Strong', url: 'https://tracking.creditstrong.com/aff_c?aff_id=1491&offer_id=2&source=MGFinstagram', category: 'credit_builder' },
      { label: 'Rent Reporters', url: 'https://prf.hn/click/camref:1101l52pUS', category: 'credit_builder' },
      { label: 'Credit Builder Card', url: 'https://www.creditbuildercard.com/mgf.html', category: 'credit_builder' },
      { label: 'Grow Credit', url: 'https://growcredit.com/?kid=12BYTD', category: 'credit_builder' },
      { label: 'Kovo', url: 'https://kovocredit.com/r/O6LDVXN7', category: 'credit_builder' },
      { label: 'Ava', url: 'https://meetava.app.link/tdMaQUdV7Rb', category: 'credit_builder' }
    ];
    const lead = await prisma.lead.create({
      data: {
        ...data,
        offerEligibleUntil,
        notes: data.offerInterest === 'masterclass' ? JSON.stringify({ affiliateLinks, masterclassFreeWindow: true }) : undefined
      }
    });
    const contractLink = `${config.appUrl.replace(/\/$/, '')}/contract`;

    const welcomeEmail = await sendWelcomeLeadEmail({
      firstName: data.firstName,
      email: data.email,
      contractLink
    });

    await notifyNewLead({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      source: [
        data.referralSource ? `Heard about us: ${data.referralSource}` : '',
        data.referralName ? `Friend/family: ${data.referralName}` : '',
        data.referralOther ? `Other: ${data.referralOther}` : ''
      ].filter(Boolean).join(' | ') || undefined
    });

    return res.status(201).json({
      lead,
      message: 'Lead created and welcome flow triggered.',
      contractLink,
      welcomeEmail: welcomeEmail.delivery,
      offerEligibleUntil
    });
  } catch (error) {
    next(error);
  }
});
