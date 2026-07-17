import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { prisma } from './prisma.js';
import { config } from '../config.js';
import { sendMasterclassWelcomeEmail } from './email.js';
import { buildPasswordSetupLink, issuePasswordSetupToken } from './passwordSetup.js';
import { notifyNewClientSignup } from './openclaw.js';

export type EnrollResult = {
  userId: string;
  clientId: string;
  created: boolean;
  emailSent: boolean;
};

/**
 * Enroll (or re-enroll) a masterclass student and send the password-setup /
 * access email. Idempotent: existing users just get their education flags
 * flipped on and a fresh access link. Guarantees a Client row exists so
 * payments can be recorded against it.
 */
export async function enrollMasterclassStudent(input: {
  firstName: string;
  lastName: string;
  email: string;
  source?: string;
}): Promise<EnrollResult> {
  const email = input.email.toLowerCase();
  let user = await prisma.user.findUnique({ where: { email } });
  let created = false;

  if (!user) {
    created = true;
    // Create a stub passwordHash they will replace via the setup flow.
    const placeholderHash = await bcrypt.hash(randomBytes(24).toString('base64'), 10);
    user = await prisma.user.create({
      data: {
        email,
        passwordHash: placeholderHash,
        firstName: input.firstName,
        lastName: input.lastName,
        client: {
          create: {
            status: 'STUDENT',
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
      source: input.source || 'masterclass-enroll'
    }).catch(err => console.warn('notifyNewClientSignup failed (non-fatal):', err?.message));
  }

  // Existing user enrolling in masterclass — flip the education flags on.
  let client = await prisma.client.findUnique({
    where: { userId: user.id },
    include: { progress: true }
  });

  if (!client) {
    client = await prisma.client.create({
      data: {
        userId: user.id,
        status: 'STUDENT',
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
      },
      include: { progress: true }
    });
  } else if (!created) {
    if (client.status === 'LEAD') {
      await prisma.client.update({ where: { id: client.id }, data: { status: 'STUDENT' } });
    }
    const education = (client.progress?.education as any) || {};
    const educationData = {
      ...education,
      masterclassEnrolled: true,
      masterclassAccess: true,
      masterclassProgress: education.masterclassProgress || [],
      enrolledAt: education.enrolledAt || new Date().toISOString()
    };
    if (client.progress) {
      await prisma.clientProgress.update({
        where: { clientId: client.id },
        data: { education: educationData }
      });
    } else {
      await prisma.clientProgress.create({
        data: { clientId: client.id, education: educationData }
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
    firstName: user.firstName || input.firstName,
    setupLink,
    expiresAt
  });

  return {
    userId: user.id,
    clientId: client.id,
    created,
    emailSent: !welcomeEmail.delivery?.skipped
  };
}
