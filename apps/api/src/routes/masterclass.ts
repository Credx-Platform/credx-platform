import { Router } from 'express';
import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { sendMasterclassWelcomeEmail } from '../lib/email.js';
import { buildPasswordSetupLink, issuePasswordSetupToken } from '../lib/passwordSetup.js';
import { notifyNewClientSignup } from '../lib/openclaw.js';

export const masterclassRouter = Router();

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
