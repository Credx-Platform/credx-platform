import type { PrismaClient } from '@prisma/client';
import type { CreditAnalysis } from './creditAnalysis.js';

/** Admin-only fact inventory. Client-facing analysis remains the normal CredX structure. */
export function buildInternalAnalysisAudit(analysis: CreditAnalysis): string {
  return JSON.stringify({
    recordType: 'CREDX_INTERNAL_ANALYSIS_AUDIT',
    generatedAt: analysis.generatedAt,
    client: analysis.clientProfile.name,
    reportScope: {
      totalAccounts: analysis.overallStats.totalAccounts,
      totalNegativeAccounts: analysis.overallStats.totalNegativeAccounts,
      negativeInventory: analysis.negativeAccounts,
      inquiries: analysis.inquiries,
      disputeOpportunities: analysis.disputeOpportunities,
      keyFindings: analysis.keyFindings,
      bureauSummaries: analysis.bureauSummaries
    },
    standard: 'FCRA-aware factual review. A negative item is not automatically inaccurate; each challenge requires a specific supported error, incompleteness, duplication, inconsistency, or unverifiable field.'
  }, null, 2);
}

export async function saveInternalAnalysisAudit(
  prisma: PrismaClient,
  clientId: string,
  analysis: CreditAnalysis
): Promise<void> {
  await prisma.note.create({
    data: {
      clientId,
      body: buildInternalAnalysisAudit(analysis)
    }
  });
}
