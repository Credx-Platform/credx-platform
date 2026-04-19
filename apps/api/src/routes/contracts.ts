import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';

export const contractsRouter = Router();

const BUSINESS_NAME = process.env.BUSINESS_NAME || 'The Malloy Group Financial LLC d/b/a CredX';
const BUSINESS_ADDRESS = process.env.BUSINESS_ADDRESS || 'New York, NY';

const AGREEMENT_TEXT = `CREDX CREDIT REPAIR SERVICE AGREEMENT\n\nThis Agreement is between ${BUSINESS_NAME} ("CredX", "Company") and the undersigned client ("Client").\n\n1. SERVICES\nCredX provides credit education, onboarding, credit report review, dispute preparation support, financial rebuilding guidance, and related client workflow services. CredX is not a law firm and does not provide legal representation.\n\n2. REQUIRED DISCLOSURES\nYou have the right to dispute inaccurate information in your credit report by contacting the credit bureau directly. Neither you nor any credit repair organization has the right to remove accurate, current, and verifiable information from a credit report. You have the right to cancel this contract without penalty or obligation before midnight of the 3rd business day after signing.\n\n3. PAYMENT TERMS\nNo fees may be collected for services before those services are fully performed, except as otherwise permitted by law. Any service or payment terms presented to you must be reviewed and accepted in writing before active paid work begins.\n\n4. NO GUARANTEES\nCredX does not guarantee deletions, score increases, approvals, or any specific outcome.`;

const DISCLOSURE_STATEMENT = `Consumer Credit File Rights Under State and Federal Law\n\nYou have a right to dispute inaccurate information in your credit report by contacting the credit bureau directly. However, neither you nor any credit repair company has the right to have accurate, current, and verifiable information removed from your credit report. The credit bureau must remove accurate negative information only if it is over 7 years old, and bankruptcy information can be reported for 10 years.\n\nYou have the right to sue a credit repair organization that violates the Credit Repair Organizations Act. You have the right to cancel your contract with any credit repair organization for any reason within 3 business days from the date you signed it.`;

function buildCancellationNotice(signedAtIso: string) {
  const signedAt = new Date(signedAtIso);
  const cancelBy = new Date(signedAt.getTime() + 3 * 24 * 60 * 60 * 1000);
  return {
    heading: 'Notice of Cancellation',
    text: `You may cancel this contract, without penalty or obligation, at any time before midnight of ${cancelBy.toDateString()}. To cancel this contract, mail or deliver a signed, dated copy of this cancellation notice, or any other written notice, to ${BUSINESS_NAME} at ${BUSINESS_ADDRESS} before midnight of that date.`
  };
}

contractsRouter.get('/text', (_req, res) => {
  res.json({
    agreement: AGREEMENT_TEXT,
    disclosure: DISCLOSURE_STATEMENT,
    company: { name: BUSINESS_NAME, address: BUSINESS_ADDRESS }
  });
});

contractsRouter.post('/', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const signedName = String(req.body?.signed_name || '').trim();
    const agreed = req.body?.agreed === true || req.body?.agreed === 'true';
    if (!signedName) return res.status(400).json({ error: 'Signed name is required' });
    if (!agreed) return res.status(400).json({ error: 'Agreement must be acknowledged' });

    const client = await prisma.client.findUnique({
      where: { userId: req.auth!.sub },
      include: { progress: true }
    });
    if (!client || !client.progress) return res.status(404).json({ error: 'Client not found' });

    const signedAt = new Date().toISOString();
    const contractId = crypto.randomUUID();
    const progress = client.progress as any;

    const updated = await prisma.clientProgress.update({
      where: { clientId: client.id },
      data: {
        onboarding: {
          ...(progress.onboarding || {}),
          status: 'contract_signed'
        },
        workflow: {
          ...(progress.workflow || {}),
          stage: 'contract_signed',
          updatedAt: signedAt,
          next: ['complete_application', 'select_credit_report_provider']
        }
      }
    });

    return res.json({
      success: true,
      contract_id: contractId,
      contract: {
        id: contractId,
        signedName,
        signedAt,
        agreementText: AGREEMENT_TEXT,
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
