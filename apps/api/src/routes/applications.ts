import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';

export const applicationsRouter = Router();

applicationsRouter.post('/', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const fullName = String(req.body?.full_name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const phone = String(req.body?.phone || '').trim();
    const address1 = String(req.body?.address_line1 || '').trim();
    const address2 = String(req.body?.address_line2 || '').trim();
    const city = String(req.body?.city || '').trim();
    const state = String(req.body?.state || '').trim();
    const zip = String(req.body?.zip || '').trim();
    const dob = String(req.body?.dob || '').trim();
    const ssn = String(req.body?.ssn || '').replace(/\D/g, '');

    if (!fullName || !email || !address1 || !city || !state || !zip || !dob || !ssn) {
      return res.status(400).json({ error: 'Missing required intake fields' });
    }

    const parts = fullName.split(/\s+/).filter(Boolean);
    const user = await prisma.user.update({
      where: { id: req.auth!.sub },
      data: {
        email,
        firstName: parts[0] || 'Client',
        lastName: parts.slice(1).join(' ') || 'User',
        phone
      },
      include: { client: { include: { progress: true } } }
    });

    if (!user.client || !user.client.progress) return res.status(404).json({ error: 'Client not found' });

    const applicationId = crypto.randomUUID();
    const submittedAt = new Date().toISOString();
    const progress = user.client.progress as any;

    const updatedProgress = await prisma.clientProgress.update({
      where: { clientId: user.client.id },
      data: {
        onboarding: {
          ...(progress.onboarding || {}),
          status: 'application_completed'
        },
        workflow: {
          ...(progress.workflow || {}),
          stage: 'application_completed',
          updatedAt: submittedAt,
          next: ['select_credit_report_provider']
        }
      }
    });

    await prisma.client.update({
      where: { id: user.client.id },
      data: {
        currentAddressLine1: address1,
        currentAddressLine2: address2 || null,
        currentCity: city,
        currentState: state,
        currentPostalCode: zip,
        dobEncrypted: dob,
        ssnEncrypted: ssn,
        ssnLast4: ssn.slice(-4),
        status: 'INTAKE_RECEIVED'
      }
    });

    return res.json({
      success: true,
      application_id: applicationId,
      application: {
        id: applicationId,
        fullName,
        email,
        phone,
        address: { line1: address1, line2: address2, city, state, zip },
        ssnLast4: ssn.slice(-4),
        status: 'submitted',
        submittedAt
      },
      progress: updatedProgress,
      next_step: 'monitoring'
    });
  } catch (error) {
    next(error);
  }
});
