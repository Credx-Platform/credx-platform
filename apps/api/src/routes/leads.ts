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
  creditGoal: z.string().optional()
});

leadsRouter.post('/', async (req, res, next) => {
  try {
    const data = createLeadSchema.parse(req.body);
    const lead = await prisma.lead.create({ data });
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
      phone: data.phone
    });

    return res.status(201).json({
      lead,
      message: 'Lead created and welcome flow triggered.',
      contractLink,
      welcomeEmail: welcomeEmail.delivery
    });
  } catch (error) {
    next(error);
  }
});
