import { Router } from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { cancellationWindowEnd } from '../lib/croaCompliance.js';

export const contractsRouter = Router();

const BUSINESS_NAME = process.env.BUSINESS_NAME || 'The Malloy Group Financial LLC d/b/a CredX';
const BUSINESS_ADDRESS = process.env.BUSINESS_ADDRESS || '1392 Madison Avenue, New York, NY 10029';

const AGREEMENT_TEXT = `CREDX CREDIT REPAIR SERVICE AGREEMENT

This Credit Repair Service Agreement ("Agreement") is between ${BUSINESS_NAME} ("CredX", "Company", "we", "us") and the undersigned client ("Client", "you"). This Agreement governs credit education, onboarding, credit report review, dispute preparation support, financial rebuilding guidance, and related CredX client workflow services.

1. SERVICES PROVIDED

CredX may provide credit report review, education about consumer credit rights, identification of potentially inaccurate, incomplete, outdated, duplicate, inconsistent, or unverifiable reporting, dispute preparation support, dispute workflow organization, personal information review, client dashboard access, progress tracking, document handling, account review support, credit rebuilding guidance, and related communication support.

CredX may use AI-assisted software and workflow tools to organize information, draft educational summaries, support document review, and assist internal operations. AI-assisted tools do not replace human review, do not provide legal advice, and do not make guaranteed credit, lending, approval, or deletion decisions.

2. LIMITS OF SERVICES

CredX is not a law firm, does not provide legal representation, and does not create an attorney-client relationship. Legal citations, consumer-rights explanations, dispute templates, and strategy notes are for education and service-support purposes only. You may consult an attorney for legal advice about your specific situation.

CredX does not act as a credit bureau, lender, debt collector, creditor, government agency, or court. Third parties control their own investigation, reporting, approval, denial, collection, and account-update processes.

3. CONSUMER CREDIT FILE RIGHTS

You have the right to dispute inaccurate information in your credit report by contacting the credit bureau directly. Neither you nor any credit repair organization has the right to remove accurate, current, and verifiable information from a credit report. Accurate negative information may generally remain for the time allowed by law. Bankruptcy information may be reported for up to 10 years.

You have the right to cancel this Agreement without penalty or obligation before midnight of the third business day after signing. You have the right to sue a credit repair organization that violates the Credit Repair Organizations Act.

4. CLIENT RESPONSIBILITIES

Client agrees to provide truthful and accurate information, provide requested reports and documents in a timely manner, review communications from CredX promptly, avoid submitting misleading or false information to creditors, furnishers, collectors, credit bureaus, or agencies, and notify CredX of material changes to address, email, phone number, report access, identity information, or account status.

Client understands that disputes and supporting documents must be based on factual review. CredX will not advise fraud, identity misrepresentation, false police reports, false identity-theft claims, or other dishonest tactics.

5. CREDIT REPORTS AND MONITORING

Client may be asked to provide a recent credit report from an approved monitoring provider or upload a PDF or HTML credit report through the portal. If Client voluntarily provides monitoring login credentials, Client authorizes CredX to use those credentials only for service-related report access, review, and account support. Credentials are sensitive and should be changed by Client whenever Client wants to end access.

6. SENSITIVE PERSONAL INFORMATION AUTHORIZATION

Client authorizes CredX to collect, use, store, and process service-related personal information, including full legal name, address history, email address, phone number, date of birth, Social Security information or Social Security last four digits, credit reports, account-related records, identity verification documents, proof-of-address documents, signed agreements, payment records, and portal activity.

CredX may use this information for onboarding, identity verification, contract fulfillment, client communication, credit report review, dispute preparation support, dashboard recordkeeping, service administration, billing administration, compliance documentation, and related vendor-supported operations.

7. PRIVACY AND DATA USE

CredX agrees to use reasonable administrative, technical, and physical safeguards to protect sensitive client information and to limit access to authorized personnel and service providers with a legitimate business need. Some data may be processed through secure third-party vendors used for hosting, email delivery, document handling, payment processing, AI-assisted workflow support, storage, analytics, and service operations.

8. PAYMENT TERMS AND CROA POLICY

CredX does not charge upfront fees for credit repair services before those services are fully performed. Any setup fee, first-work fee, monthly service fee, or other paid support term must be reviewed and accepted in writing before paid work begins and must follow the billing timing presented in the CredX checkout, payment authorization, or service plan confirmation.

For the AI Assistance path, signup and initial review may occur before payment. Paid dispute assistance or plan execution begins only after the required agreement, analysis/review, payment authorization, and applicable compliance gates are satisfied. Pricing, plan details, refund terms, and cancellation terms may also be described in the CredX pricing page, payment authorization, refund policy, and cancellation policy.

9. NO GUARANTEES

CredX does not guarantee deletions, score increases, credit approvals, funding approvals, tradeline updates, response timelines, creditor actions, bureau actions, collector actions, or any specific outcome. Results vary by file, documentation, bureau response, furnisher response, collector response, client participation, and other facts outside CredX control.

10. COMMUNICATIONS CONSENT

Client agrees that CredX may contact Client by email, phone, text message, portal notification, or other service-related communication for onboarding, account updates, reminders, support, payment administration, document requests, and related CredX services, subject to applicable law and consent requirements.

11. CLIENT PORTAL AND ELECTRONIC RECORDS

Client agrees to receive this Agreement, notices, disclosures, cancellation information, service records, and related communications electronically through the CredX website, email, and client portal. Client should keep copies of all signed agreements, reports, notices, and service communications.

12. CANCELLATION AND REFUND POLICY

Client may cancel within the federal three-business-day cancellation window described in this Agreement and in the Notice of Cancellation. Additional cancellation or refund terms may be described in the CredX cancellation policy, refund policy, payment authorization, or plan confirmation. No provision in this Agreement waives a consumer right that cannot legally be waived.

13. ENTIRE AGREEMENT

This Agreement, together with any required disclosures, cancellation notice, privacy policy, refund policy, payment authorization, plan confirmation, and related onboarding forms, reflects the service terms between CredX and Client for the services described. If any provision is unenforceable, the remaining provisions remain in effect.

14. SIGNATURE AND AUTHORIZATION

By signing, Client confirms that Client has reviewed this Agreement, understands the services and limits described, authorizes CredX to provide the agreed service-related support, consents to the collection and use of sensitive personal information as described, understands CredX does not guarantee outcomes, and understands the three-business-day right to cancel.`;

const MASTERCLASS_AGREEMENT_TEXT = `CREDX 5-DAY MASTERCLASS AGREEMENT\n\nThis Agreement is between ${BUSINESS_NAME} ("CredX", "Company") and the undersigned participant ("Participant").\n\n1. SERVICES\nCredX provides access to the 5-Day Masterclass education path, related worksheets, platform resources, and performance-based maintenance guidance. This is an education product and is not legal, financial, tax, or credit repair representation.\n\n2. EDUCATION-ONLY SCOPE\nThe Masterclass is designed to help participants understand credit reports, dispute concepts, documentation habits, and credit maintenance workflows. CredX does not guarantee credit-report changes, deletions, approvals, score increases, or any specific result.\n\n3. PAYMENT AND ACCESS\nMasterclass access may require payment before lessons or platform materials are unlocked. Any payment terms presented at checkout must be reviewed and accepted before access begins.\n\n4. RETURN POLICY\nThe 5-Day Masterclass has a 3-day return policy based on participant performance and maintenance standards, not based on results, deletions, score changes, or credit-report outcomes.`;

const DISCLOSURE_STATEMENT = `Consumer Credit File Rights Under State and Federal Law\n\nYou have a right to dispute inaccurate information in your credit report by contacting the credit bureau directly. However, neither you nor any credit repair company has the right to have accurate, current, and verifiable information removed from your credit report. The credit bureau must remove accurate negative information only if it is over 7 years old, and bankruptcy information can be reported for 10 years.\n\nYou have the right to sue a credit repair organization that violates the Credit Repair Organizations Act. You have the right to cancel your contract with any credit repair organization for any reason within 3 business days from the date you signed it.`;

function buildCancellationNotice(signedAtIso: string) {
  // CROA: "before midnight of the 3rd BUSINESS day" — weekends don't count
  // (counsel, 2026-07-07). Shared math with the billing/work gates.
  const cancelBy = cancellationWindowEnd(new Date(signedAtIso));
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
    const priorOnboarding = (progress.onboarding || {}) as Record<string, any>;
    const priorWorkflow = (progress.workflow || {}) as Record<string, any>;
    const signatureRepairMode = Boolean(
      priorOnboarding.completedAt &&
      !(priorOnboarding.signature?.signedAt && priorOnboarding.signature?.dataUrl)
    );

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
          ...priorOnboarding,
          status: signatureRepairMode ? priorOnboarding.status || 'completed' : 'contract_signed',
          signature: signatureRecord
        },
        workflow: {
          ...priorWorkflow,
          stage: signatureRepairMode ? priorWorkflow.stage || 'portal_unlocked' : 'contract_signed',
          updatedAt: signedAt,
          next: signatureRepairMode ? priorWorkflow.next || [] : ['complete_application', 'select_credit_report_provider']
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
      next_step: signatureRepairMode ? 'portal' : 'application'
    });
  } catch (error) {
    next(error);
  }
});
