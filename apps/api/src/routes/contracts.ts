import { Router } from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';

export const contractsRouter = Router();

const BUSINESS_NAME = process.env.BUSINESS_NAME || 'The Malloy Group Financial LLC d/b/a CredX';
const BUSINESS_ADDRESS = process.env.BUSINESS_ADDRESS || 'New York, NY';

const AGREEMENT_TEXT = `CREDX CREDIT REPAIR SERVICE AGREEMENT\n\nThis Agreement is between ${BUSINESS_NAME} ("CredX", "Company") and the undersigned client ("Client").\n\n1. SERVICES\nCredX provides credit education, onboarding, credit report review, dispute preparation support, financial rebuilding guidance, and related client workflow services. CredX is not a law firm and does not provide legal representation.\n\n2. REQUIRED DISCLOSURES\nYou have the right to dispute inaccurate information in your credit report by contacting the credit bureau directly. Neither you nor any credit repair organization has the right to remove accurate, current, and verifiable information from a credit report. You have the right to cancel this contract without penalty or obligation before midnight of the 3rd business day after signing.\n\n3. PAYMENT TERMS\nNo fees may be collected for services before those services are fully performed, except as otherwise permitted by law. Any service or payment terms presented to you must be reviewed and accepted in writing before active paid work begins.\n\n4. NO GUARANTEES\nCredX does not guarantee deletions, score increases, approvals, or any specific outcome.`;

const MASTERCLASS_AGREEMENT_TEXT = `CREDX 5-DAY MASTERCLASS AGREEMENT\n\nThis Agreement is between ${BUSINESS_NAME} ("CredX", "Company") and the undersigned participant ("Participant").\n\n1. SERVICES\nCredX provides access to the 5-Day Masterclass education path, related worksheets, platform resources, and performance-based maintenance guidance. This is an education product and is not legal, financial, tax, or credit repair representation.\n\n2. EDUCATION-ONLY SCOPE\nThe Masterclass is designed to help participants understand credit reports, dispute concepts, documentation habits, and credit maintenance workflows. CredX does not guarantee credit-report changes, deletions, approvals, score increases, or any specific result.\n\n3. PAYMENT AND ACCESS\nMasterclass access may require payment before lessons or platform materials are unlocked. Any payment terms presented at checkout must be reviewed and accepted before access begins.\n\n4. RETURN POLICY\nThe 5-Day Masterclass has a 3-day return policy based on participant performance and maintenance standards, not based on results, deletions, score changes, or credit-report outcomes.`;

const DISCLOSURE_STATEMENT = `Consumer Credit File Rights Under State and Federal Law\n\nYou have a right to dispute inaccurate information in your credit report by contacting the credit bureau directly. However, neither you nor any credit repair company has the right to have accurate, current, and verifiable information removed from your credit report. The credit bureau must remove accurate negative information only if it is over 7 years old, and bankruptcy information can be reported for 10 years.\n\nYou have the right to sue a credit repair organization that violates the Credit Repair Organizations Act. You have the right to cancel your contract with any credit repair organization for any reason within 3 business days from the date you signed it.`;

function buildCancellationNotice(signedAtIso: string) {
  const signedAt = new Date(signedAtIso);
  const cancelBy = new Date(signedAt.getTime() + 3 * 24 * 60 * 60 * 1000);
  return {
    heading: 'Notice of Cancellation',
    text: `You may cancel this contract, without penalty or obligation, at any time before midnight of ${cancelBy.toDateString()}. To cancel this contract, mail or deliver a signed, dated copy of this cancellation notice, or any other written notice, to ${BUSINESS_NAME} at ${BUSINESS_ADDRESS} before midnight of that date.`
  };
}

function isMasterclassClient(client: { progress?: { onboarding: unknown; education: unknown } | null } | null) {
  const onboarding = (client?.progress?.onboarding || {}) as Record<string, any>;
  const education = (client?.progress?.education || {}) as Record<string, any>;
  return onboarding.signupIntake?.planPath === 'masterclass' || education.masterclassEnrolled === true;
}

function agreementTextForClient(client: { progress?: { onboarding: unknown; education: unknown } | null } | null) {
  return isMasterclassClient(client) ? MASTERCLASS_AGREEMENT_TEXT : AGREEMENT_TEXT;
}

contractsRouter.get('/text', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const client = await prisma.client.findUnique({
      where: { userId: req.auth!.sub },
      include: { progress: true }
    });
    const agreement = agreementTextForClient(client);

    res.json({
      agreement,
      disclosure: DISCLOSURE_STATEMENT,
      contractType: isMasterclassClient(client) ? 'masterclass' : 'ai_assistance',
      company: { name: BUSINESS_NAME, address: BUSINESS_ADDRESS }
    });
  } catch (error) {
    next(error);
  }
});

contractsRouter.post('/', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const signedName = String(req.body?.signed_name || '').trim();
    const agreed = req.body?.agreed === true || req.body?.agreed === 'true';
    const signatureRaw = typeof req.body?.signature === 'string' ? req.body.signature.trim() : '';
    if (!signedName) return res.status(400).json({ error: 'Signed name is required' });
    if (!agreed) return res.status(400).json({ error: 'Agreement must be acknowledged' });
    if (!signatureRaw) return res.status(400).json({ error: 'Drawn signature is required' });
    if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(signatureRaw)) {
      return res.status(400).json({ error: 'Invalid signature payload' });
    }
    if (signatureRaw.length > 800_000) {
      return res.status(413).json({ error: 'Signature image is too large' });
    }

    const client = await prisma.client.findUnique({
      where: { userId: req.auth!.sub },
      include: { progress: true }
    });
    if (!client || !client.progress) return res.status(404).json({ error: 'Client not found' });

    const signedAt = new Date().toISOString();
    const contractId = randomUUID();
    const progress = client.progress as any;
    const agreementText = agreementTextForClient(client);
    const contractType = isMasterclassClient(client) ? 'masterclass' : 'ai_assistance';

    const signatureRecord = {
      contractId,
      contractType,
      signedName,
      signedAt,
      dataUrl: signatureRaw,
      agreementText,
      disclosureStatement: DISCLOSURE_STATEMENT,
      cancellationNotice: buildCancellationNotice(signedAt),
      ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || null,
      userAgent: req.headers['user-agent'] || null
    };

    const updated = await prisma.clientProgress.update({
      where: { clientId: client.id },
      data: {
        onboarding: {
          ...(progress.onboarding || {}),
          status: 'contract_signed',
          signature: signatureRecord
        },
        workflow: {
          ...(progress.workflow || {}),
          stage: 'contract_signed',
          updatedAt: signedAt,
          next: ['complete_application', 'select_credit_report_provider']
        }
      }
    });

    await prisma.agreement.create({
      data: {
        clientId: client.id,
        status: 'SIGNED',
        signedAt: new Date(signedAt),
        sentAt: new Date(signedAt)
      }
    });

    await prisma.activityEvent.create({
      data: {
        clientId: client.id,
        type: 'CONTRACT_SIGNED',
        message: `Service agreement signed by ${signedName}.`,
        metadata: { contractId, signedAt, contractType }
      }
    });

    return res.json({
      success: true,
      contract_id: contractId,
      contract: {
        id: contractId,
        contractType,
        signedName,
        signedAt,
        agreementText,
        disclosureStatement: DISCLOSURE_STATEMENT,
        cancellationNotice: buildCancellationNotice(signedAt),
        status: 'signed'
      },
      progress: updated,
      next_step: 'application'
    });
  } catch (error) {
    next(error);
  }
});
