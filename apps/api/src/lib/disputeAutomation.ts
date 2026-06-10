import { prisma } from './prisma.js';
import { sendEmail } from './email.js';
import type { CreditAnalysis, DisputeOpportunity } from './creditAnalysis.js';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

// ============================================================
// Dispute Letter Templates
// ============================================================

const LETTER_TEMPLATES: Record<string, (data: LetterTemplateData) => string> = {
  DISPUTE_INACCURATE: (data) => `Dear ${data.bureau}:

I am writing to dispute the following information on my credit report. I believe this information is inaccurate and request that you investigate and correct it immediately.

Account: ${data.accountName}
Account Number: ${data.accountNumber || 'Not provided'}
Reason for Dispute: ${data.reason}

Under the Fair Credit Reporting Act (FCRA), I have the right to dispute any information on my credit report that I believe is inaccurate, incomplete, or unverifiable. I request that you:

1. Verify this information with the furnisher
2. Provide me with the method of verification
3. Remove this item if it cannot be verified

Please investigate this matter and report the results to me within 30 days of receipt of this letter, as required by the FCRA.

Thank you for your prompt attention to this matter.

Sincerely,
${data.clientName}
${data.clientAddress || ''}
${data.clientCity || ''}, ${data.clientState || ''} ${data.clientPostalCode || ''}
SSN: ${data.ssnLast4 || '•••••••••'}

Date: ${data.date}`,

  VALIDATION_REQUEST: (data) => `Dear ${data.furnisher}:

I am writing to request validation of the debt referenced below. Under the Fair Debt Collection Practices Act (FDCPA), I have the right to request validation of any debt that a collection agency is attempting to collect.

Account: ${data.accountName}
Account Number: ${data.accountNumber || 'Not provided'}

I respectfully request that you provide the following documentation:

1. The original signed contract or agreement
2. A complete payment history showing all charges and payments
3. Proof that you are authorized to collect this debt
4. The calculation of the current balance
5. Verification of the statute of limitations in my state

Please note that until you provide the requested validation, I dispute your right to collect this debt and your right to report it to the credit bureaus.

This is not a refusal to pay. I am exercising my legal rights under the FDCPA.

Sincerely,
${data.clientName}
${data.clientAddress || ''}
${data.clientCity || ''}, ${data.clientState || ''} ${data.clientPostalCode || ''}

Date: ${data.date}`,

  PAY_FOR_DELETE: (data) => `Dear ${data.furnisher}:

I am writing regarding the account referenced below. I am willing to settle this account in exchange for the complete removal of this tradeline from my credit report with all three credit bureaus.

Account: ${data.accountName}
Account Number: ${data.accountNumber || 'Not provided'}
Proposed Settlement Amount: ${data.settlementAmount || 'Full balance'}

Please confirm in writing that:

1. You will accept the proposed settlement amount as payment in full
2. You will delete this tradeline from all three credit bureaus (Experian, Equifax, and TransUnion) within 30 days of payment
3. You will not sell the remaining balance to another collection agency
4. This settlement will be reported as "paid in full" or deleted entirely

Please respond with your agreement in writing before any payment is made. I will not make any payment until I receive written confirmation of these terms.

Sincerely,
${data.clientName}

Date: ${data.date}`,

  GOODWILL_ADJUSTMENT: (data) => `Dear ${data.furnisher}:

I am writing to request a goodwill adjustment to my credit report regarding the account referenced below. I recognize that I was late on my payment, but I have since brought the account current and have maintained on-time payments.

Account: ${data.accountName}
Account Number: ${data.accountNumber || 'Not provided'}

I am requesting that you remove the late payment notation from my credit report as a goodwill gesture. Since bringing the account current, I have:

1. Made all payments on time for the past [X] months
2. Maintained the account in good standing
3. Demonstrated responsible credit management

I am working to improve my credit score and this goodwill adjustment would be instrumental in my efforts. I value my relationship with your company and hope to continue it for years to come.

Thank you for your consideration.

Sincerely,
${data.clientName}

Date: ${data.date}`,

  CEASE_DESIST: (data) => `Dear ${data.furnisher}:

Pursuant to my rights under the Fair Debt Collection Practices Act (FDCPA), I am formally requesting that you cease all communication with me regarding the debt referenced below.

Account: ${data.accountName}
Account Number: ${data.accountNumber || 'Not provided'}

Under 15 U.S.C. § 1692c(c), you are required to cease all communication with me except to:

1. Advise me that your debt collection efforts are being terminated
2. Notify me that you may invoke specified remedies
3. Notify me that you intend to invoke a specified remedy

Please be advised that any further communication not in compliance with the FDCPA will be considered a violation of federal law and will be reported to the Consumer Financial Protection Bureau (CFPB) and my state attorney general.

Sincerely,
${data.clientName}

Date: ${data.date}`
};

interface LetterTemplateData {
  clientName: string;
  clientAddress?: string | null;
  clientCity?: string | null;
  clientState?: string | null;
  clientPostalCode?: string | null;
  ssnLast4?: string | null;
  bureau: string;
  accountName: string;
  accountNumber?: string | null;
  reason: string;
  furnisher: string;
  date: string;
  settlementAmount?: string;
}

// ============================================================
// Letter Type Determination
// ============================================================

function determineLetterType(opportunity: DisputeOpportunity): string {
  const issue = opportunity.issue.toLowerCase();
  const reason = opportunity.reason.toLowerCase();
  
  if (issue.includes('validation') || issue.includes('verify') || reason.includes('validate')) {
    return 'VALIDATION_REQUEST';
  }
  
  if (issue.includes('pay') || issue.includes('settlement') || issue.includes('delete')) {
    return 'PAY_FOR_DELETE';
  }
  
  if (issue.includes('goodwill') || issue.includes('late') || issue.includes('payment')) {
    return 'GOODWILL_ADJUSTMENT';
  }
  
  if (issue.includes('cease') || issue.includes('harass') || issue.includes('stop')) {
    return 'CEASE_DESIST';
  }
  
  // Default: standard dispute
  return 'DISPUTE_INACCURATE';
}

function getBureauLabel(bureau: string): string {
  const labels: Record<string, string> = {
    'EXPERIAN': 'Experian',
    'EQUIFAX': 'Equifax',
    'TRANSUNION': 'TransUnion',
    'experian': 'Experian',
    'equifax': 'Equifax',
    'transunion': 'TransUnion',
    'XPN': 'Experian',
    'EFX': 'Equifax',
    'TU': 'TransUnion'
  };
  return labels[bureau] || bureau;
}

// ============================================================
// Dispute Letter Generator
// ============================================================

export async function generateDisputeLetters(
  clientId: string,
  analysis: CreditAnalysis
): Promise<{
  generated: number;
  letters: Array<{
    disputeItem: any;
    document: any;
    letterPath: string;
  }>;
}> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { user: true, creditReports: { orderBy: { pulledAt: 'desc' }, take: 1 } }
  });

  if (!client) throw new Error('Client not found');

  const opportunities = analysis.disputeOpportunities || [];
  const generatedLetters: Array<{
    disputeItem: any;
    document: any;
    letterPath: string;
  }> = [];

  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Create output directory for letters
  const lettersDir = path.join('/tmp', 'credx-letters', clientId);
  await fs.mkdir(lettersDir, { recursive: true });

  for (const opportunity of opportunities) {
    const letterType = determineLetterType(opportunity);
    const template = LETTER_TEMPLATES[letterType];
    
    if (!template) {
      console.warn(`No template found for letter type: ${letterType}`);
      continue;
    }

    // Create dispute item in database
    const disputeItem = await prisma.disputeItem.create({
      data: {
        clientId,
        furnisher: opportunity.accountName,
        accountNumber: opportunity.accountNumber || null,
        accountType: 'OTHER',
        reason: opportunity.reason,
        disputeEquifax: opportunity.bureaus.some((b: string) => b.toLowerCase().includes('equifax') || b.toLowerCase().includes('efx')),
        disputeExperian: opportunity.bureaus.some((b: string) => b.toLowerCase().includes('experian') || b.toLowerCase().includes('xpn')),
        disputeTransunion: opportunity.bureaus.some((b: string) => b.toLowerCase().includes('transunion') || b.toLowerCase().includes('tu')),
        currentRound: 1,
        status: 'PENDING',
        priority: opportunity.priority.toUpperCase(),
        analysisId: analysis.generatedAt || null,
        letterGenerated: true,
        generatedAt: new Date()
      }
    });

    // Generate letter for each bureau
    for (const bureau of opportunity.bureaus) {
      const bureauLabel = getBureauLabel(bureau);
      
      const letterData: LetterTemplateData = {
        clientName: `${client.user.firstName} ${client.user.lastName}`,
        clientAddress: client.currentAddressLine1,
        clientCity: client.currentCity,
        clientState: client.currentState,
        clientPostalCode: client.currentPostalCode,
        ssnLast4: client.ssnLast4,
        bureau: bureauLabel,
        accountName: opportunity.accountName,
        accountNumber: opportunity.accountNumber,
        reason: opportunity.reason,
        furnisher: opportunity.accountName,
        date
      };

      // Generate letter content
      const letterContent = template(letterData);
      
      // Save to file
      const fileName = `dispute-${client.user.lastName}-${opportunity.accountName.replace(/[^a-zA-Z0-9]/g, '_')}-${bureauLabel.toLowerCase()}-r1.txt`;
      const filePath = path.join(lettersDir, fileName);
      await fs.writeFile(filePath, letterContent, 'utf-8');

      // Create document record
      const document = await prisma.document.create({
        data: {
          clientId,
          type: 'DISPUTE_LETTER',
          fileName: fileName.replace('.txt', '.pdf'),
          s3Key: filePath, // Will be updated to S3 after upload
          contentType: 'text/plain',
          disputeItemId: disputeItem.id,
          roundNumber: 1,
          letterType: letterType,
          bureau: bureauLabel,
          letterStatus: 'DRAFTED'
        }
      });

      generatedLetters.push({
        disputeItem,
        document,
        letterPath: filePath
      });
    }
  }

  return {
    generated: generatedLetters.length,
    letters: generatedLetters
  };
}

// ============================================================
// Dispute Initiation Email
// ============================================================

export async function sendDisputeInitiationEmail(
  clientId: string,
  analysis: CreditAnalysis,
  generatedLetters: Array<{ disputeItem: any; document: any; letterPath: string }>
): Promise<{ sent: boolean; messageId?: string }> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { user: true }
  });

  if (!client || !client.user.email) {
    return { sent: false };
  }

  const opportunities = analysis.disputeOpportunities || [];
  const actionPlan = analysis.actionPlan || [];
  
  // Build dispute summary
  const disputeSummary = opportunities.map((opp, index) => ({
    number: index + 1,
    account: opp.accountName,
    issue: opp.issue,
    bureaus: opp.bureaus.join(', '),
    priority: opp.priority
  }));

  // Build timeline from action plan
  const timelineHtml = actionPlan.map((phase) => `
    <div style="margin: 16px 0; padding: 16px; background: #101a2b; border: 1px solid rgba(0,198,251,0.28); border-radius: 10px;">
      <div style="color: #00c6fb; font-size: 12px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; margin-bottom: 8px;">
        Phase ${phase.phase}: ${phase.title}
      </div>
      <div style="color: #e2e8f0; font-size: 14px; line-height: 1.6;">${phase.description}</div>
      <div style="color: #94a3b8; font-size: 12px; margin-top: 8px;">
        Estimated: ${phase.estimatedWeeks} weeks
      </div>
      <div style="margin-top: 10px;">
        ${phase.tasks.map((task: string) => `
          <div style="color: #cbd5e1; font-size: 13px; margin: 4px 0; padding-left: 16px; position: relative;">
            <span style="position: absolute; left: 0; color: #00c6fb;">›</span> ${task}
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  // Build account list
  const accountListHtml = disputeSummary.map((item) => `
    <tr>
      <td style="padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.08); color: #e2e8f0; font-size: 14px;">${item.number}</td>
      <td style="padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.08); color: #e2e8f0; font-size: 14px; font-weight: 600;">${item.account}</td>
      <td style="padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.08); color: #cbd5e1; font-size: 13px;">${item.issue}</td>
      <td style="padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.08); color: #00c6fb; font-size: 13px;">${item.bureaus}</td>
      <td style="padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.08); color: ${item.priority === 'high' ? '#ef4444' : item.priority === 'medium' ? '#eab308' : '#94a3b8'}; font-size: 12px; font-weight: 700; text-transform: uppercase;">${item.priority}</td>
    </tr>
  `).join('');

  const subject = 'Your CredX Dispute Campaign is Ready — Action Required';
  
  const html = `<!DOCTYPE html>
<html lang="en" style="color-scheme: dark;">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <title>Your CredX Dispute Campaign</title>
</head>
<body style="margin: 0; padding: 0; background: #060a12; font-family: 'IBM Plex Sans', Helvetica, Arial, sans-serif; color: #e2e8f0;">
  <div style="display: none; font-size: 1px; color: #060a12; line-height: 1px; max-height: 0; max-width: 0; opacity: 0; overflow: hidden;">
    Your dispute letters are ready. Review and approve to begin your credit repair campaign.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #060a12; padding: 32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 640px; background: #0b1220; border: 1px solid rgba(133,157,186,0.18); border-radius: 18px; overflow: hidden;">
        <tr><td style="height: 5px; background: #00c6fb; font-size: 0; line-height: 0;">&nbsp;</td></tr>
        <tr><td style="padding: 30px 32px 22px; text-align: center; border-bottom: 1px solid rgba(133,157,186,0.18);">
          <div style="font-family: 'IBM Plex Sans', sans-serif; font-size: 30px; font-weight: 700; color: #f8fafc; letter-spacing: 0.04em;">CredX</div>
          <div style="margin-top: 6px; color: #00c6fb; font-size: 11px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase;">Dispute Campaign · Ready</div>
        </td></tr>
        <tr><td style="padding: 30px 32px 24px; color: #e2e8f0; font-size: 15px; line-height: 1.65;">
          
          <h1 style="margin: 0 0 16px; font-family: 'IBM Plex Sans', sans-serif; font-size: 26px; line-height: 1.25; color: #f8fafc; font-weight: 700;">
            Your dispute campaign is ready, ${client.user.firstName || 'there'}.
          </h1>
          
          <p style="margin: 0 0 20px; color: #e2e8f0; font-size: 16px; line-height: 1.7;">
            We've analyzed your credit report and generated <strong style="color: #00c6fb;">${opportunities.length} dispute letters</strong> targeting the accounts that are most likely to be removed or corrected. Here's your complete breakdown:
          </p>
          
          <!-- Dispute Summary -->
          <div style="margin: 24px 0; padding: 20px; background: #101a2b; border: 1px solid rgba(0,198,251,0.28); border-radius: 12px;">
            <div style="color: #00c6fb; font-size: 12px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; margin-bottom: 16px;">
              Dispute Summary
            </div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0;">
              <tr style="background: rgba(0,198,251,0.08);">
                <th style="padding: 10px 14px; text-align: left; color: #94a3b8; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">#</th>
                <th style="padding: 10px 14px; text-align: left; color: #94a3b8; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">Account</th>
                <th style="padding: 10px 14px; text-align: left; color: #94a3b8; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">Issue</th>
                <th style="padding: 10px 14px; text-align: left; color: #94a3b8; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">Bureaus</th>
                <th style="padding: 10px 14px; text-align: left; color: #94a3b8; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">Priority</th>
              </tr>
              ${accountListHtml}
            </table>
          </div>
          
          <!-- Timeline -->
          <div style="margin: 24px 0;">
            <div style="color: #00c6fb; font-size: 12px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; margin-bottom: 16px;">
              Your Dispute Timeline
            </div>
            ${timelineHtml}
          </div>
          
          <!-- CTA -->
          <div style="text-align: center; padding: 24px 0;">
            <a href="https://credxme.com/portal" style="display: inline-block; background: #00c6fb; color: #0d1420; text-decoration: none; padding: 16px 36px; border-radius: 12px; font-weight: 700; font-size: 16px; font-family: 'IBM Plex Sans', sans-serif; letter-spacing: 0.2px; box-shadow: 0 0 24px rgba(0,198,251,0.2);">
              Review & Approve Letters in Portal
            </a>
          </div>
          
          <!-- Disclaimer -->
          <div style="margin: 24px 0; padding: 16px; background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.28); border-radius: 10px;">
            <div style="color: #f59e0b; font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 8px;">
              Important Timeline Information
            </div>
            <p style="margin: 0; color: #cbd5e1; font-size: 13px; line-height: 1.6;">
              Credit bureaus have <strong>30 days</strong> to investigate disputes under the Fair Credit Reporting Act (FCRA). Round 1 responses typically arrive in 4-6 weeks. If items are verified, we'll escalate to Round 2 or the CFPB. Total campaign duration varies based on creditor responses, but most clients see significant progress within 90-120 days.
            </p>
          </div>
          
          <p style="margin: 20px 0 0; color: #94a3b8; font-size: 13px; line-height: 1.6;">
            Your dispute letters are ready for review in your portal. Once you approve them, we'll send them certified mail to each bureau and furnishers. You'll receive updates as responses arrive.
          </p>
          
          <p style="margin: 14px 0 0; color: #94a3b8; font-size: 13px; line-height: 1.6;">
            Questions? Reply to this email or contact your CredX coach at <a href="mailto:contact@credxme.com" style="color: #00c6fb; text-decoration: none;">contact@credxme.com</a>.
          </p>
          
        </td></tr>
        <tr><td style="padding: 22px 32px 30px; color: #94a3b8; font-size: 12px; line-height: 1.6; border-top: 1px solid rgba(133,157,186,0.18);">
          <strong style="color: #f8fafc; font-size: 14px;">CredX</strong><br/>
          Credit Repair & Financial Strategy Support<br/>
          <a href="https://credxme.com" style="color: #00c6fb; text-decoration: none;">credxme.com</a> ·
          <a href="mailto:contact@credxme.com" style="color: #00c6fb; text-decoration: none;">contact@credxme.com</a> ·
          <a href="tel:+18662733963" style="color: #00c6fb; text-decoration: none;">866-CREDX-ME</a>
          <div style="margin-top: 14px; color: #94a3b8; font-size: 11px;">
            You're receiving this because you started your dispute campaign with CredX. This is a transactional email regarding your account.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `Your CredX Dispute Campaign is Ready

Hi ${client.user.firstName || 'there'},

We've analyzed your credit report and generated ${opportunities.length} dispute letters targeting the accounts that are most likely to be removed or corrected.

DISPUTE SUMMARY:
${disputeSummary.map(item => `${item.number}. ${item.account} (${item.bureaus}) - ${item.issue} [${item.priority.toUpperCase()}]`).join('\n')}

TIMELINE:
${actionPlan.map(phase => `Phase ${phase.phase}: ${phase.title} (${phase.estimatedWeeks} weeks)`).join('\n')}

Your dispute letters are ready for review in your portal:
https://credxme.com/portal

Credit bureaus have 30 days to investigate under the FCRA. Round 1 responses typically arrive in 4-6 weeks.

Questions? Reply to this email or contact contact@credxme.com.

CredX
Credit Repair & Financial Strategy Support`;

  const result = await sendEmail({
    to: client.user.email,
    subject,
    html,
    text
  });

  return { sent: !result.skipped, messageId: result.id };
}

// ============================================================
// Client Activation Orchestrator
// ============================================================

export async function activateClientDisputeCampaign(
  clientId: string
): Promise<{
  success: boolean;
  lettersGenerated: number;
  emailSent: boolean;
  errors?: string[];
}> {
  const errors: string[] = [];
  
  try {
    // 1. Get client with analysis
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: { 
        user: true, 
        progress: true,
        creditReports: { orderBy: { pulledAt: 'desc' }, include: { tradelines: true } }
      }
    });

    if (!client) {
      return { success: false, lettersGenerated: 0, emailSent: false, errors: ['Client not found'] };
    }

    if (!client.progress?.analysis) {
      return { success: false, lettersGenerated: 0, emailSent: false, errors: ['No credit analysis found. Upload credit report first.'] };
    }

    const analysis = client.progress.analysis as unknown as CreditAnalysis;

    // 2. Update client status
    await prisma.client.update({
      where: { id: clientId },
      data: {
        status: 'ACTIVE',
        activatedAt: new Date()
      }
    });

    // 3. Update workflow
    await prisma.clientProgress.update({
      where: { clientId },
      data: {
        workflow: {
          ...(client.progress.workflow as any || {}),
          stage: 'DISPUTING',
          updatedAt: new Date().toISOString(),
          next: ['review_letters', 'approve_disputes', 'mail_round_1'],
          disputeCampaignStarted: true,
          disputeCampaignStartedAt: new Date().toISOString()
        }
      }
    });

    // 4. Generate dispute letters
    const letterResult = await generateDisputeLetters(clientId, analysis);

    // 5. Create dispute round entries
    for (const letter of letterResult.letters) {
      await prisma.disputeRound.create({
        data: {
          disputeItemId: letter.disputeItem.id,
          roundNumber: 1,
          sentDate: new Date(),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
          status: 'PENDING',
          equifaxStatus: letter.disputeItem.disputeEquifax ? 'PENDING' : null,
          experianStatus: letter.disputeItem.disputeExperian ? 'PENDING' : null,
          transunionStatus: letter.disputeItem.disputeTransunion ? 'PENDING' : null
        }
      });
    }

    // 6. Create tasks
    const taskTitles = [
      'Review generated dispute letters in portal',
      'Approve dispute letters for mailing',
      'Mail Round 1 dispute letters (certified)',
      'Track bureau responses (30-day window)',
      'Prepare Round 2 letters for non-responses'
    ];

    const existingTasks = await prisma.task.findMany({ 
      where: { clientId }, 
      select: { title: true } 
    });
    const existingTitles = new Set(existingTasks.map(t => t.title));

    for (const title of taskTitles) {
      if (!existingTitles.has(title)) {
        await prisma.task.create({
          data: {
            clientId,
            title,
            description: title,
            completed: false,
            dueAt: title.includes('Track') 
              ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
              : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          }
        });
      }
    }

    // 7. Log activity
    await prisma.activityEvent.create({
      data: {
        clientId,
        type: 'DISPUTE_CAMPAIGN_ACTIVATED',
        message: `Client activated. ${letterResult.generated} dispute letters generated for ${analysis.disputeOpportunities?.length || 0} accounts.`,
        metadata: {
          lettersGenerated: letterResult.generated,
          accountsDisputed: analysis.disputeOpportunities?.length || 0,
          actionPhases: analysis.actionPlan?.length || 0
        }
      }
    });

    // 8. Send dispute initiation email
    let emailSent = false;
    try {
      const emailResult = await sendDisputeInitiationEmail(clientId, analysis, letterResult.letters);
      emailSent = emailResult.sent;
    } catch (emailErr) {
      errors.push(`Email dispatch failed: ${emailErr instanceof Error ? emailErr.message : String(emailErr)}`);
    }

    return {
      success: true,
      lettersGenerated: letterResult.generated,
      emailSent
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(`Activation failed: ${errorMessage}`);
    
    return {
      success: false,
      lettersGenerated: 0,
      emailSent: false,
      errors
    };
  }
}

// ============================================================
// Exports
// ============================================================

export {
  LETTER_TEMPLATES,
  determineLetterType,
  getBureauLabel
};
