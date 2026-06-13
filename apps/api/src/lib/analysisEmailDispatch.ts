import crypto from 'node:crypto';
import { prisma } from './prisma.js';
import { sendCreditAnalysisEmail } from './email.js';
import { renderCreditAnalysisPdf } from './creditAnalysisPdf.js';
import type { CreditAnalysis } from './creditAnalysis.js';

const FINGERPRINT_KEY = 'analysisEmailFingerprint';
const PORTAL_BASE = (process.env.APP_URL || 'https://credxme.com').replace(/\/+$/, '');

function fingerprintAnalysis(analysis: CreditAnalysis): string {
  const payload = {
    findings: (analysis.keyFindings || []).map((f) => `${f.id}:${f.severity}:${f.category}`).sort(),
    disputes: (analysis.disputeOpportunities || []).map((d) =>
      `${d.accountName}:${d.accountNumber || ''}:${d.priority}:${d.bureaus.join(',')}`
    ).sort(),
    scores: (analysis.bureauScores || []).map((s) => `${s.bureau}:${s.score ?? 'null'}`).sort(),
    summary: analysis.clientFacingSummary || ''
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export async function dispatchAnalysisEmail(params: {
  clientId: string;
  analysis: CreditAnalysis;
  trigger: 'auto_doc_upload' | 'auto_secure_upload' | 'admin_generate' | 'auto_endpoint';
}): Promise<{ sent: boolean; reason?: string; messageId?: string }> {
  const { clientId, analysis, trigger } = params;
  try {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: { user: true, progress: true }
    });

    if (!client || !client.user?.email) {
      return { sent: false, reason: 'client_or_email_missing' };
    }

    const fingerprint = fingerprintAnalysis(analysis);
    const workflow = (client.progress?.workflow as Record<string, unknown> | null) || {};
    const lastFingerprint = typeof workflow[FINGERPRINT_KEY] === 'string'
      ? (workflow[FINGERPRINT_KEY] as string)
      : null;

    if (lastFingerprint === fingerprint) {
      return { sent: false, reason: 'fingerprint_unchanged' };
    }

    const pdf = await renderCreditAnalysisPdf(analysis);

    const firstName = client.user.firstName || analysis.clientProfile?.name?.split(' ')[0] || '';
    const portalLink = `${PORTAL_BASE}/portal`;
    const fileSafeName = (client.user.lastName || client.user.firstName || 'client')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'client';
    const pdfFilename = `credx-analysis-${fileSafeName}-${new Date().toISOString().slice(0, 10)}.pdf`;

    const sendResult = await sendCreditAnalysisEmail({
      to: client.user.email,
      firstName,
      summary: analysis.clientFacingSummary || '',
      findingCount: analysis.keyFindings?.length || 0,
      disputeCount: analysis.disputeOpportunities?.length || 0,
      bureauScores: (analysis.bureauScores || []).map((s) => ({
        bureau: String(s.bureau),
        score: typeof s.score === 'number' ? s.score : null
      })),
      portalLink,
      pdf,
      pdfFilename
    });

    if (sendResult.delivery?.skipped) {
      return { sent: false, reason: sendResult.delivery.reason || 'provider_skipped' };
    }

    await prisma.clientProgress.update({
      where: { clientId },
      data: {
        workflow: {
          ...workflow,
          [FINGERPRINT_KEY]: fingerprint,
          analysisEmailLastSentAt: new Date().toISOString(),
          analysisEmailLastTrigger: trigger
        } as any
      }
    });

    await prisma.activityEvent.create({
      data: {
        clientId,
        type: 'ANALYSIS_EMAIL_SENT',
        message: `Credit analysis report emailed to ${client.user.email} (${(pdf.length / 1024).toFixed(1)} KB PDF).`,
        metadata: {
          trigger,
          messageId: sendResult.delivery?.id || null,
          provider: sendResult.delivery?.provider || null,
          pdfBytes: pdf.length,
          fingerprint
        }
      }
    });

    return { sent: true, messageId: sendResult.delivery?.id };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error('ANALYSIS_EMAIL_DISPATCH_FAILED', { clientId, trigger, reason });
    return { sent: false, reason };
  }
}
