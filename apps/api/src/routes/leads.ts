import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { notifyNewLead, sendWelcomeLeadEmail } from '../lib/email.js';

export const leadsRouter = Router();

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
    const data = createLeadSchema.parse(req.body);
    const offerEligibleUntil = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const affiliateLinks = [
      { label: 'IdentityIQ Credit Monitoring', url: 'https://www.identityiq.com/', category: 'monitoring' },
      { label: 'MyFreeScoreNow Credit Monitoring', url: 'https://www.myfreescorenow.com/', category: 'monitoring' },
      { label: 'Self Credit Builder', url: 'https://www.self.inc/', category: 'credit_builder' },
      { label: 'Kikoff Credit Builder', url: 'https://kikoff.com/', category: 'credit_builder' },
      { label: 'Annual Credit Report', url: 'https://www.annualcreditreport.com/', category: 'reports' }
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
