import { prisma } from './prisma.js';

/**
 * Direct imports are unavailable until the provider's documented member binding,
 * consumer authorization and full-report retrieval contract are implemented.
 * An API key alone is not evidence that a generic score belongs to this client.
 */
export class CreditReportImportUnavailableError extends Error {
  readonly code = 'DIRECT_REPORT_IMPORT_UNAVAILABLE';
  constructor() {
    super('Direct report import is not available yet. Upload your report for analysis or use the provided report-provider links.');
    this.name = 'CreditReportImportUnavailableError';
  }
}

export async function pullCreditScore(_clientId: string): Promise<{ score: number; isFirstPull: boolean }> {
  // Do not call the former speculative /credit-score endpoint: it sent no
  // consumer/member identifier and could attribute an unrelated score to a user.
  // Existing stored score/history reads remain available.
  throw new CreditReportImportUnavailableError();
}

export async function getCreditScoreHistory(clientId: string, limit = 12): Promise<Array<{ score: number; pulledAt: Date }>> {
  const scores = await prisma.creditScore.findMany({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      score: true,
      pulledAt: true
    }
  });

  return scores.reverse();
}
