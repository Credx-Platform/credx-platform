import { Router } from 'express';
import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { sendMasterclassWelcomeEmail, sendMasterclassDayEmail, MASTERCLASS_EMAIL_DAYS } from '../lib/email.js';
import { buildPasswordSetupLink, issuePasswordSetupToken } from '../lib/passwordSetup.js';
import { notifyNewClientSignup } from '../lib/openclaw.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';

export const masterclassRouter = Router();

const VALID_DAY_SLUGS = new Set([
  'day-1-credit-fundamentals',
  'day-2-disputes-decoded',
  'day-3-advanced-tactics',
  'day-4-building-positive-credit',
  'day-5-business-credit',
  'bonus-generational-wealth'
]);

const enrollSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email()
});

masterclassRouter.post('/enroll', async (req, res, next) => {
  try {
    const data = enrollSchema.parse(req.body);
    const email = data.email.toLowerCase();

    // If user already exists, just resend a setup link instead of erroring loudly.
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Create a stub passwordHash they will replace via the setup flow.
      const placeholderHash = await bcrypt.hash(randomBytes(24).toString('base64'), 10);
      user = await prisma.user.create({
        data: {
          email,
          passwordHash: placeholderHash,
          firstName: data.firstName,
          lastName: data.lastName,
          client: {
            create: {
              status: 'LEAD',
              progress: {
                create: {
                  onboarding: {
                    status: 'masterclass',
                    track: 'masterclass',
                    enrolledAt: new Date().toISOString(),
                    contractRequired: false
                  },
                  education: {
                    masterclassEnrolled: true,
                    masterclassAccess: true,
                    masterclassProgress: [],
                    enrolledAt: new Date().toISOString()
                  }
                }
              }
            }
          }
        }
      });

      await notifyNewClientSignup({
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: null,
        createdAt: user.createdAt.toISOString(),
        source: 'masterclass-enroll'
      }).catch(err => console.warn('notifyNewClientSignup failed (non-fatal):', err?.message));
    } else {
      // Existing user enrolling in masterclass — just flip the education flags on.
      const client = await prisma.client.findUnique({
        where: { userId: user.id },
        include: { progress: true }
      });
      if (client?.progress) {
        const education = (client.progress.education as any) || {};
        await prisma.clientProgress.update({
          where: { clientId: client.id },
          data: {
            education: {
              ...education,
              masterclassEnrolled: true,
              masterclassAccess: true,
              masterclassProgress: education.masterclassProgress || [],
              enrolledAt: education.enrolledAt || new Date().toISOString()
            }
          }
        });
      }
    }

    const { rawToken, expiresAt } = await issuePasswordSetupToken({
      userId: user.id,
      purpose: 'setup'
    });
    const setupLink = `${buildPasswordSetupLink(config.appUrl, rawToken)}&next=masterclass`;

    const welcomeEmail = await sendMasterclassWelcomeEmail({
      to: user.email,
      firstName: user.firstName || data.firstName,
      setupLink,
      expiresAt
    });

    return res.status(201).json({
      enrolled: true,
      emailSent: !welcomeEmail.delivery?.skipped,
      emailProvider: welcomeEmail.delivery?.provider || null
    });
  } catch (error) {
    next(error);
  }
});

const progressSchema = z.object({
  daySlug: z.string().refine((s) => VALID_DAY_SLUGS.has(s), 'Unknown day slug')
});

masterclassRouter.post('/progress', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    if (!req.auth?.sub) return res.status(401).json({ error: 'Unauthorized' });
    const { daySlug } = progressSchema.parse(req.body);
    const client = await prisma.client.findUnique({
      where: { userId: req.auth.sub },
      include: { progress: true }
    });
    if (!client?.progress) return res.status(404).json({ error: 'Client progress not found' });

    const education = (client.progress.education as Record<string, unknown>) || {};
    const completed = Array.isArray(education.masterclassProgress) ? (education.masterclassProgress as string[]) : [];
    if (!completed.includes(daySlug)) completed.push(daySlug);

    const updated = await prisma.clientProgress.update({
      where: { clientId: client.id },
      data: {
        education: {
          ...education,
          masterclassEnrolled: true,
          masterclassAccess: true,
          masterclassProgress: completed,
          lastDayCompletedAt: new Date().toISOString()
        }
      }
    });

    return res.json({ ok: true, completedDays: completed, education: updated.education });
  } catch (error) {
    next(error);
  }
});

const dispatchAuthSecret = process.env.MASTERCLASS_DISPATCH_SECRET || '';

const isOlderThan = (iso: string, days: number) => {
  const enrolledAt = new Date(iso).getTime();
  if (!Number.isFinite(enrolledAt)) return false;
  return (Date.now() - enrolledAt) >= days * 24 * 60 * 60 * 1000;
};

masterclassRouter.post('/dispatch/:day', async (req, res, next) => {
  try {
    const presented = req.headers['x-masterclass-secret'] || req.query.secret;
    if (!dispatchAuthSecret || presented !== dispatchAuthSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const day = Number(req.params.day);
    if (!MASTERCLASS_EMAIL_DAYS.find((d) => d.day === day)) {
      return res.status(400).json({ error: `Invalid day: ${day}` });
    }

    // Day N email goes to enrollees on or after day (N-1) since enrollment.
    // Day 1 ships immediately at enroll time via the welcome email; the cron
    // first triggers Day 2 the day after enrollment, Day 3 the day after that, etc.
    const minDaysSinceEnroll = day - 1;

    const enrollees = await prisma.client.findMany({
      where: { progress: { is: { education: { not: undefined } } } },
      include: { progress: true, user: true }
    });

    const sentTo: string[] = [];
    const skipped: { email: string; reason: string }[] = [];

    for (const client of enrollees) {
      const education = (client.progress?.education as Record<string, unknown>) || {};
      if (!education.masterclassEnrolled) {
        continue;
      }
      const enrolledAt = typeof education.enrolledAt === 'string' ? education.enrolledAt : null;
      if (!enrolledAt || !isOlderThan(enrolledAt, minDaysSinceEnroll)) {
        skipped.push({ email: client.user.email, reason: 'too-early' });
        continue;
      }
      const sent = Array.isArray(education.masterclassEmailsSent) ? (education.masterclassEmailsSent as number[]) : [];
      if (sent.includes(day)) {
        skipped.push({ email: client.user.email, reason: 'already-sent' });
        continue;
      }

      const portalLink = `${config.appUrl}/portal?welcome=masterclass&day=${day}`;
      try {
        await sendMasterclassDayEmail({
          to: client.user.email,
          firstName: client.user.firstName || '',
          portalLink,
          day
        });
        sent.push(day);
        const nextEducation = {
          ...education,
          masterclassEmailsSent: sent,
          [`masterclassDay${day}EmailSentAt`]: new Date().toISOString()
        } as unknown as Record<string, unknown>;
        await prisma.clientProgress.update({
          where: { clientId: client.id },
          data: { education: nextEducation as any }
        });
        sentTo.push(client.user.email);
      } catch (err) {
        console.warn('MASTERCLASS_DAY_EMAIL_FAILED', client.user.email, day, err);
        skipped.push({ email: client.user.email, reason: 'send-failed' });
      }
    }

    return res.json({ day, sent: sentTo.length, sentTo, skippedCount: skipped.length, skipped: skipped.slice(0, 50) });
  } catch (error) {
    next(error);
  }
});
