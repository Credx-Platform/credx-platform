import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { encryptPII } from '../lib/encryption.js';
import { writeAuditLog } from '../lib/audit.js';

export const applicationsRouter = Router();

applicationsRouter.post('/', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const currentUser = await prisma.user.findUnique({
      where: { id: req.auth!.sub },
      include: { client: { include: { progress: true } } }
    });
    if (!currentUser?.client || !currentUser.client.progress) return res.status(404).json({ error: 'Client not found' });

    const fallbackName = `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim();
    const fullName = String(req.body?.full_name || fallbackName || 'Client User').trim();
    const email = String(req.body?.email || currentUser.email || '').trim().toLowerCase();
    const phone = String(req.body?.phone || '').trim();
    const address1 = String(req.body?.address_line1 || '').trim();
    const address2 = String(req.body?.address_line2 || '').trim();
    const city = String(req.body?.city || '').trim();
    const state = String(req.body?.state || '').trim();
    const zip = String(req.body?.zip || '').trim();
    const dob = String(req.body?.dob || '').trim();
    const ssn = String(req.body?.ssn || '').replace(/\D/g, '');

    const missing = [
      !address1 && 'address line 1',
      !city && 'city',
      !state && 'state',
      !zip && 'ZIP',
      !dob && 'date of birth',
      !ssn && 'SSN'
    ].filter(Boolean);
    if (missing.length) {
      return res.status(400).json({ error: `Missing required intake fields: ${missing.join(', ')}. Address line 2 and phone are optional.` });
    }
    if (ssn.length !== 9) {
      return res.status(400).json({ error: 'Full 9-digit Social Security number is required.' });
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
    const client = user.client;

    const applicationId = randomUUID();
    const submittedAt = new Date().toISOString();
    const progress = client.progress as any;

    const updatedProgress = await prisma.clientProgress.update({
      where: { clientId: client.id },
      data: {
        onboarding: {
          ...(progress.onboarding || {}),
          status: 'report_required',
          applicationSubmittedAt: submittedAt
        },
        workflow: {
          ...(progress.workflow || {}),
          stage: 'report_required',
          updatedAt: submittedAt,
          next: ['select_credit_report_provider', 'upload_credit_report_pdf_or_html']
        }
      }
    });

    await prisma.client.update({
      where: { id: client.id },
      data: {
        currentAddressLine1: address1,
        currentAddressLine2: address2 || null,
        currentCity: city,
        currentState: state,
        currentPostalCode: zip,
        dobEncrypted: encryptPII(dob),
        ssnEncrypted: encryptPII(ssn),
        ssnLast4: ssn.slice(-4),
        status: 'INTAKE_RECEIVED'
      }
    });

    await writeAuditLog({
      userId: req.auth!.sub,
      action: 'INTAKE_SUBMITTED',
      entityType: 'Client',
      entityId: client.id,
      metadata: { ssnLast4: ssn.slice(-4), state, zip }
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
      next_step: 'monitoring_or_report_required'
    });
  } catch (error) {
    next(error);
  }
});
