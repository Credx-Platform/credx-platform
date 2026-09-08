import { prisma } from './prisma.js';
import { sendEmail } from './email.js';
import type { CreditAnalysis, DisputeOpportunity } from './creditAnalysis.js';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

// ============================================================
// Consolidated Dispute Letter Template
// ============================================================

export const DISPUTE_LETTER_SETUPS = {
  highLevel: {
    id: 'high_level',
    label: 'High Level',
    description: 'FCRA 1681e(b) and 1681i(a)(5) bureau dispute letter with factual item explanations, correction requests, and client signature.'
  },
  lowLevel: {
    id: 'low_level',
    label: 'Low Level',
    description: 'Legacy aggressive bureau dispute letter kept as a secondary option for manual/template selection.'
  }
} as const;

export type DisputeLetterSetupId = (typeof DISPUTE_LETTER_SETUPS)[keyof typeof DISPUTE_LETTER_SETUPS]['id'];
const DEFAULT_DISPUTE_LETTER_SETUP: DisputeLetterSetupId = DISPUTE_LETTER_SETUPS.highLevel.id;

const bureauAddress = (bureau: string) => {
  if (bureau === 'Equifax') return 'P.O. Box 740256\nAtlanta, GA 30374-0256';
  if (bureau === 'Experian') return 'P.O. Box 4500\nAllen, TX 75013';
  return 'P.O. Box 2000\nChester, PA 19016';
};

const clientMailingBlock = (data: ConsolidatedLetterData) => {
  const cityLine = `${data.clientCity || ''}${data.clientCity || data.clientState || data.clientPostalCode ? ', ' : ''}${data.clientState || ''} ${data.clientPostalCode || ''}`.trim();
  return [data.clientName, data.clientAddress, cityLine, data.ssnLast4 ? `SSN: ***-**-${data.ssnLast4}` : 'SSN: [last four only]']
    .filter(Boolean)
    .join('\n');
};

const accountIssueBlock = (account: ConsolidatedLetterData['accounts'][number], index: number) => {
  const accountLabel = account.accountName.toLowerCase();
  const disputeText = `${account.issue} ${account.reason}`.toLowerCase();
  const isPersonalInfo = /\b(personal information|personal info|address|employer|name|alias|date of birth|dob|ssn)\b/.test(disputeText)
    || /^(personal information|personal info|address|addresses|employer|employers|name|names|alias|aliases|date of birth|dob|ssn)$/i.test(accountLabel);
  const requestedInvestigation = isPersonalInfo
    ? 'Requested investigation: Please verify the disputed name, address, and employer identifiers against my current identifying documents and remove any inaccurate, outdated, incomplete, or unsupported personal information.'
    : 'Requested investigation: Please verify the account number, ownership, balance, past-due amount, account status, payment status, date opened, date of first delinquency if applicable, date last reported, and any remarks or collection/charge-off coding.';
  const requestedResult = isPersonalInfo
    ? 'Requested result: Please correct or delete every personal identifier that cannot be verified as accurate, current, and complete.'
    : 'Requested result: Please correct every inaccurate or incomplete field. If the item cannot be verified as accurate and complete, please delete it from my consumer report.';

  return [
    `${index + 1}. ${account.accountName}`,
    isPersonalInfo ? null : `Account number: ${account.accountNumber || '[last four or partial account number only]'}`,
    `Issue: ${account.issue || 'The reporting appears inaccurate, incomplete, inconsistent, or unverifiable.'}`,
    `Reason for dispute: ${account.reason || 'Please verify the account-level reporting for accuracy, completeness, and current status.'}`,
    requestedInvestigation,
    requestedResult
  ].filter(Boolean).join('\n');
};

const HIGH_LEVEL_CONSOLIDATED_DISPUTE_TEMPLATE = (data: ConsolidatedLetterData) => `${clientMailingBlock(data)}

${data.bureau}
${bureauAddress(data.bureau)}

${data.date}

Re: Dispute under 15 U.S.C. § 1681e(b) maximum possible accuracy and 15 U.S.C. § 1681i(a)(5) treatment of inaccurate or unverifiable information

Dear ${data.bureau},

I recently reviewed my consumer credit report and noticed several reporting issues that appear inaccurate, incomplete, inconsistent, outdated, or unverifiable. I am writing to formally dispute the information listed below under the Fair Credit Reporting Act (FCRA), including 15 U.S.C. § 1681e(b) and 15 U.S.C. § 1681i.

The disputed information is negatively affecting my creditworthiness and reputation, and I am requesting your prompt attention to this matter. The inaccurate or unverifiable information relates to the following item(s):

${data.accounts.map(accountIssueBlock).join('\n\n')}

Pursuant to 15 U.S.C. § 1681e(b), credit reporting agencies are required to follow reasonable procedures to assure maximum possible accuracy of the information they report. Based on my review, the information above should be reinvestigated for accuracy, completeness, current status, and support from the furnisher's records.

Furthermore, under 15 U.S.C. § 1681i, I am exercising my right to dispute incomplete, inaccurate, or unverifiable information directly with the credit reporting agency. Please conduct a thorough reinvestigation of each disputed item and correct, update, or delete any information that cannot be verified as accurate and complete.

I request that you correct all inaccuracies and violations on my credit report in accordance with the FCRA. Please notify me promptly of the actions taken, provide the written results of your reinvestigation, and send an updated copy of my credit report once the investigation is complete.

If any disputed information remains verified, please provide the method of verification used and identify the furnisher or source relied upon to verify the information. I reserve all rights available to me under federal and state consumer protection laws if these disputed inaccuracies are not properly investigated and corrected.

Please send all correspondence to my mailing address listed above.

Sincerely yours,
${data.clientName}`;

const LOW_LEVEL_CONSOLIDATED_DISPUTE_TEMPLATE = (data: ConsolidatedLetterData) => `${clientMailingBlock(data)}

${data.bureau}
${bureauAddress(data.bureau)}

${data.date}

${data.accounts.map((account) => `${account.accountName}: Account number: ${account.accountNumber || '[last four or partial account number only]'}, ${account.reason || account.issue || 'Account type may be inaccurate or incomplete. Please investigate and correct or delete any unsupported reporting.'}`).join('\n')}

I am writing to formally dispute the accuracy and validity of certain items appearing on my credit report in accordance with my rights under the Fair Credit Reporting Act (FCRA) (15 U.S.C. § 1681 et seq.) and the Fair Debt Collection Practices Act (FDCPA) (15 U.S.C. § 1692 et seq.). I request investigation of the following items because they may be inaccurate, incomplete, unverifiable, or unauthorized.

1. Unauthorized Third-Party Collections
Under 15 U.S.C. § 1692e, false or misleading debt-collection reporting may violate federal law. I am requesting verification of the following alleged debt(s), including:
• A copy of the original signed contract proving my consent and liability for this debt.
• A chain of custody showing how the debt was acquired.
• Proof that this debt was lawfully assigned in compliance with 15 U.S.C. § 1692g (Validation of Debts).

If the above documentation cannot be provided, please update, correct, or delete any reporting that cannot be verified as accurate and complete.

2. Unauthorized Inquiries
Per 15 U.S.C. § 1681b, a company must have permissible purpose to conduct a hard inquiry on my credit report. I dispute any inquiry connected to these items if it was not authorized by me.

Under 15 U.S.C. § 1681n, any entity that unlawfully accesses my credit file without proper authorization is subject to statutory damages, attorney's fees, and punitive damages.

Request for Investigation and Response
As required under 15 U.S.C. § 1681i (Procedure in Case of Disputed Accuracy), you have 30 days to conduct a reasonable investigation and correct or delete information that cannot be verified as accurate and complete. If the investigation does not address these concerns, I may consider appropriate follow-up options, including a complaint to the Consumer Financial Protection Bureau (CFPB), the Federal Trade Commission (FTC), or the Attorney General's Office.

Please send a written response explaining the verification, corrections, deletions, or other updates made for these disputed accounts and any related inquiries.

Please send all correspondence to my mailing address listed above.

Sincerely,
${data.clientName}`;

function consolidatedDisputeTemplateFor(setupId: DisputeLetterSetupId = DEFAULT_DISPUTE_LETTER_SETUP) {
  return setupId === DISPUTE_LETTER_SETUPS.lowLevel.id
    ? LOW_LEVEL_CONSOLIDATED_DISPUTE_TEMPLATE
    : HIGH_LEVEL_CONSOLIDATED_DISPUTE_TEMPLATE;
}

interface ConsolidatedLetterData {
  clientName: string;
  clientAddress?: string | null;
  clientCity?: string | null;
  clientState?: string | null;
  clientPostalCode?: string | null;
  ssnLast4?: string | null;
  bureau: string;
  date: string;
  accounts: Array<{
    accountName: string;
    accountNumber?: string | null;
    reason: string;
    issue: string;
  }>;
}

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
// Consolidated Letter Body Builder (shared by generation + print self-heal)
// ============================================================

interface LetterClientFields {
  user: { firstName: string | null; lastName: string | null };
  currentAddressLine1?: string | null;
  currentCity?: string | null;
  currentState?: string | null;
  currentPostalCode?: string | null;
  ssnLast4?: string | null;
}

/**
 * Rebuilds the consolidated dispute-letter body for a single bureau from the
 * client's stored analysis. Pure/deterministic so it can both (a) generate the
 * letter the first time and (b) re-create the exact body when a legacy letter
 * lost its persisted `content` (e.g. it only ever lived on Railway's /tmp).
 * Returns null if the analysis has no disputes for the requested bureau.
 */
export function buildConsolidatedLetterContent(
  client: LetterClientFields,
  analysis: CreditAnalysis,
  bureauLabel: string,
  setupId: DisputeLetterSetupId = DEFAULT_DISPUTE_LETTER_SETUP
): string | null {
  // Normalize so a document storing either a label ("Equifax") or a code ("EFX")
  // both resolve to the same canonical bureau as the analysis opportunities.
  const targetBureau = getBureauLabel(bureauLabel);
  const opportunities = analysis.disputeOpportunities || [];
  const bureauOpportunities = opportunities.filter((opp) =>
    (opp.bureaus || []).some((b) => getBureauLabel(b) === targetBureau)
  );

  if (bureauOpportunities.length === 0) return null;

  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const letterData: ConsolidatedLetterData = {
    clientName: `${client.user.firstName} ${client.user.lastName}`,
    clientAddress: client.currentAddressLine1,
    clientCity: client.currentCity,
    clientState: client.currentState,
    clientPostalCode: client.currentPostalCode,
    ssnLast4: client.ssnLast4,
    bureau: targetBureau,
    date,
    accounts: bureauOpportunities.map((opp) => ({
      accountName: opp.accountName,
      accountNumber: opp.accountNumber,
      reason: opp.reason,
      issue: opp.issue
    }))
  };

  return consolidatedDisputeTemplateFor(setupId)(letterData);
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

  // Check if dispute items already exist for this client
  const existingDisputes = await prisma.disputeItem.findMany({
    where: { clientId }
  });
  
  if (existingDisputes.length > 0) {
    console.log(`Client ${clientId} already has ${existingDisputes.length} dispute items. Skipping generation.`);
    return {
      generated: 0,
      letters: []
    };
  }

  const opportunities = analysis.disputeOpportunities || [];
  
  // Create output directory for letters
  const lettersDir = path.join('/tmp', 'credx-letters', clientId);
  await fs.mkdir(lettersDir, { recursive: true });

  // Group opportunities by bureau
  const bureauGroups: Record<string, typeof opportunities> = {
    'Experian': [],
    'Equifax': [],
    'TransUnion': []
  };
  
  for (const opp of opportunities) {
    for (const bureau of opp.bureaus) {
      const bureauLabel = getBureauLabel(bureau);
      if (!bureauGroups[bureauLabel]) bureauGroups[bureauLabel] = [];
      bureauGroups[bureauLabel].push(opp);
    }
  }
  
  const generatedLetters: Array<{
    disputeItem: any;
    document: any;
    letterPath: string;
  }> = [];
  
  // Create one consolidated letter per bureau
  for (const [bureauLabel, bureauOpportunities] of Object.entries(bureauGroups)) {
    if (bureauOpportunities.length === 0) continue;
    
    // Create a single dispute item for this bureau
    const disputeItem = await prisma.disputeItem.create({
      data: {
        clientId,
        furnisher: 'Multiple Accounts',
        accountNumber: 'See attached letter',
        accountType: 'OTHER',
        reason: 'Multiple disputes consolidated per bureau',
        disputeEquifax: bureauLabel === 'Equifax',
        disputeExperian: bureauLabel === 'Experian',
        disputeTransunion: bureauLabel === 'TransUnion',
        currentRound: 1,
        status: 'PENDING',
        priority: 'MEDIUM',
        analysisId: analysis.generatedAt || null,
        letterGenerated: true,
        generatedAt: new Date()
      }
    });
    
    // Generate consolidated letter (same builder used by the print self-heal path)
    const letterContent = buildConsolidatedLetterContent(client, analysis, bureauLabel) || '';
    
    // Persist the letter. The body is stored in the DB (`content`) so it survives
    // redeploys/restarts; the file write is a best-effort convenience only — /tmp is
    // ephemeral on Railway, so it must never be the source of truth for printing.
    const fileName = `dispute-${client.user.lastName}-consolidated-${bureauLabel.toLowerCase()}-r1-${Date.now()}.md`;
    const filePath = path.join(lettersDir, fileName);
    try {
      await fs.writeFile(filePath, letterContent, 'utf-8');
    } catch (writeErr) {
      console.warn(`[disputeAutomation] could not write letter to ${filePath}:`, writeErr);
    }

    // Create document record
    const document = await prisma.document.upsert({
      where: {
        clientId_fileName: {
          clientId,
          fileName
        }
      },
      update: {
        type: 'DISPUTE_LETTER',
        s3Key: filePath,
        content: letterContent,
        contentType: 'text/markdown',
        disputeItemId: disputeItem.id,
        roundNumber: 1,
        letterType: 'CONSOLIDATED_DISPUTE',
        bureau: bureauLabel,
        letterStatus: 'DRAFTED'
      },
      create: {
        clientId,
        type: 'DISPUTE_LETTER',
        fileName,
        s3Key: filePath,
        content: letterContent,
        contentType: 'text/markdown',
        disputeItemId: disputeItem.id,
        roundNumber: 1,
        letterType: 'CONSOLIDATED_DISPUTE',
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
  
  return {
    generated: generatedLetters.length,
    letters: generatedLetters
  };
}

function formatEscalationOpportunity(opp: DisputeOpportunity, index: number) {
  return [
    `### ${index + 1}. ${opp.accountName}`,
    `Priority: HIGH`,
    `Account number: ${opp.accountNumber || '[last four or partial account number only]'}`,
    `Bureaus: ${(opp.bureaus || []).map(getBureauLabel).join(', ') || 'Not specified'}`,
    `Issue: ${opp.issue || 'Reported information appears inaccurate, incomplete, inconsistent, or unverifiable.'}`,
    `Factual basis: ${opp.reason || 'Review the supporting credit-report fields and dispute history before filing.'}`,
    `Requested correction: Correct each inaccurate or incomplete field, or delete the item if it cannot be verified as accurate and complete.`
  ].join('\n\n');
}

function buildEscalationPacketContent(
  client: LetterClientFields,
  analysis: CreditAnalysis,
  highLevelLetters: Array<{ bureau: string; content: string }>
) {
  const clientName = `${client.user.firstName || ''} ${client.user.lastName || ''}`.trim() || 'Client';
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const opportunities = analysis.disputeOpportunities || [];
  const actionPlan = analysis.actionPlan || [];

  return `# CFPB / FTC Escalation Packet - HIGH Priority

Client: ${clientName}

Date prepared: ${date}

Prepared by: CredX Admin Portal

## Purpose

This packet organizes the client's credit-analysis findings, high-priority disputed accounts, and high-level FCRA dispute letter language for admin/client review before any CFPB or FTC submission.

This packet is not an automatic filing. The client should review the facts, confirm the information is true and accurate, and submit any CFPB/FTC complaint under their own name unless separate written authorization is collected.

## Compliance Guardrails

- Use CFPB escalation when prior dispute history, furnisher response, bureau response, or documented reporting inconsistencies support escalation.
- Use FTC identity-theft reporting only when identity theft or fraud is actually true.
- Do not promise deletion, score increase, approval, settlement, or agency action.
- Do not submit speculative or unsupported allegations.
- Keep all statements factual, specific, and evidence-based.

## Analysis Summary

${analysis.clientFacingSummary || 'No client-facing summary stored.'}

## High-Priority Inaccurate / Unverifiable Accounts

${opportunities.length ? opportunities.map(formatEscalationOpportunity).join('\n\n---\n\n') : 'No dispute opportunities are stored in the current analysis.'}

## Suggested Escalation Routing

1. Bureau reinvestigation or furnisher direct dispute first when no prior dispute history exists.
2. Method-of-verification follow-up when a bureau verifies without addressing the evidence.
3. CFPB complaint when the bureau or furnisher ignores evidence, contradicts itself, or fails to address the core reporting issue.
4. FTC complaint only for unfair/deceptive conduct or identity-theft/fraud facts that are actually supported.

## Evidence Checklist

- Current credit report showing the disputed reporting.
- Prior dispute letters and delivery proof, if available.
- Bureau/furnisher responses, verification results, or no-response timeline.
- Identification and address proof, if relevant.
- Account statements, payoff letters, police report, identity-theft documents, or other proof only when applicable.
- Client attestation: "The facts I am submitting are true and accurate to the best of my knowledge."

## Existing Action Plan

${actionPlan.length ? actionPlan.map((phase) => `### Phase ${phase.phase}: ${phase.title}

${phase.description}

Estimated timing: ${phase.estimatedWeeks} week(s)

Tasks:
${phase.tasks.map((task: string) => `- ${task}`).join('\n')}`).join('\n\n') : 'No action plan is stored in the current analysis.'}

## High-Level Dispute Letter Reference

${highLevelLetters.length ? highLevelLetters.map((letter) => `## ${letter.bureau} High-Level Dispute Letter

\`\`\`text
${letter.content}
\`\`\``).join('\n\n') : 'No high-level dispute letter content could be generated from the current analysis.'}
`;
}

export async function generateEscalationPacket(clientId: string): Promise<{
  document: any;
  content: string;
  opportunities: number;
  lettersIncluded: number;
}> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { user: true, progress: true }
  });

  if (!client) throw new Error('Client not found');
  if (!client.progress?.analysis) throw new Error('No credit analysis found. Upload credit report and generate analysis first.');

  const analysis = client.progress.analysis as unknown as CreditAnalysis;
  const bureaus = ['Experian', 'Equifax', 'TransUnion'];
  const highLevelLetters = bureaus
    .map((bureau) => ({ bureau, content: buildConsolidatedLetterContent(client, analysis, bureau, DISPUTE_LETTER_SETUPS.highLevel.id) || '' }))
    .filter((letter) => letter.content.trim().length > 0);
  const content = buildEscalationPacketContent(client, analysis, highLevelLetters);

  const packetDir = path.join('/tmp', 'credx-escalation-packets', clientId);
  await fs.mkdir(packetDir, { recursive: true });
  const safeLastName = (client.user.lastName || 'client').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const fileName = `cfpb-ftc-escalation-${safeLastName}-${Date.now()}.md`;
  const filePath = path.join(packetDir, fileName);
  try {
    await fs.writeFile(filePath, content, 'utf-8');
  } catch (writeErr) {
    console.warn(`[disputeAutomation] could not write escalation packet to ${filePath}:`, writeErr);
  }

  const document = await prisma.document.create({
    data: {
      clientId,
      type: 'OTHER',
      fileName,
      s3Key: filePath,
      content,
      contentType: 'text/markdown',
      roundNumber: 1,
      letterType: 'CFPB_FTC_ESCALATION_PACKET',
      bureau: 'ALL',
      letterStatus: 'DRAFTED'
    }
  });

  const taskTitle = 'Review CFPB/FTC escalation packet';
  const existingTask = await prisma.task.findFirst({
    where: { clientId, title: taskTitle, completed: false }
  });
  if (!existingTask) {
    await prisma.task.create({
      data: {
        clientId,
        title: taskTitle,
        description: 'Review the high-priority CFPB/FTC escalation packet with the client before any external complaint is submitted.',
        completed: false,
        dueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
      }
    });
  }

  await prisma.activityEvent.create({
    data: {
      clientId,
      type: 'CFPB_FTC_ESCALATION_PACKET_GENERATED',
      message: `High-priority CFPB/FTC escalation packet generated for ${analysis.disputeOpportunities?.length || 0} disputed account(s).`,
      metadata: {
        documentId: document.id,
        opportunities: analysis.disputeOpportunities?.length || 0,
        lettersIncluded: highLevelLetters.length,
        filingMode: 'admin_packet_only'
      }
    }
  });

  return {
    document,
    content,
    opportunities: analysis.disputeOpportunities?.length || 0,
    lettersIncluded: highLevelLetters.length
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
    Your dispute letters are ready. Review and approve to begin your dispute campaign.
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
              Credit bureaus generally have <strong>30 days</strong> to investigate disputes under the Fair Credit Reporting Act (FCRA). Round 1 responses often arrive in 4-6 weeks. If items are verified and factual concerns remain, CredX can help prepare a human-reviewed next step such as Round 2 or a complaint package. Timelines and outcomes vary based on bureau and furnisher responses.
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
          Dispute Preparation & Financial Strategy Support<br/>
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
Dispute Preparation & Financial Strategy Support`;

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
  clientId: string,
  opts?: { stateReviewOverride?: boolean; overrideBy?: string }
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

    // CROA work gate: no paid dispute work until the service agreement is signed
    // and the 3-business-day cancellation window has expired (counsel, 2026-07-07).
    const { disputeWorkGate } = await import('./croaCompliance.js');
    const workGate = await disputeWorkGate(clientId);
    if (!workGate.eligible) {
      return { success: false, lettersGenerated: 0, emailSent: false, errors: workGate.reasons };
    }

    // State eligibility gate: blocked states are refused outright; review_required
    // states need an explicit, logged admin override.
    const { stateBucket } = await import('./stateEligibility.js');
    const bucket = stateBucket(client.currentState);
    if (bucket === 'blocked') {
      return {
        success: false, lettersGenerated: 0, emailSent: false,
        errors: [`Dispute service is blocked in ${client.currentState || 'this state'} pending registration/bonding. Activation refused.`]
      };
    }
    if (bucket === 'review_required') {
      if (!opts?.stateReviewOverride) {
        return {
          success: false, lettersGenerated: 0, emailSent: false,
          errors: [`STATE_REVIEW_REQUIRED: ${client.currentState || 'Unknown state'} has not been counsel-approved for the dispute service. An admin must confirm state eligibility to proceed.`]
        };
      }
      await prisma.activityEvent.create({
        data: {
          clientId,
          type: 'STATE_REVIEW_OVERRIDE',
          message: `Activation in review-required state ${client.currentState || 'UNKNOWN'} approved by admin override.`,
          metadata: { state: client.currentState || null, overrideBy: opts.overrideBy || 'unknown' }
        }
      });
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
  determineLetterType,
  getBureauLabel
};
