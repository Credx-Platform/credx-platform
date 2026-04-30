import type { CreditReport, Tradeline, Client, User } from '@prisma/client';

export type BureauKey = 'equifax' | 'experian' | 'transunion';

export interface BureauSummary {
  bureau: BureauKey;
  label: string;
  totalAccounts: number;
  negativeAccounts: number;
  totalBalance: number;
  accounts: TradelineSummary[];
}

export interface TradelineSummary {
  creditorName: string;
  accountNumber: string | null;
  accountType: string | null;
  status: string | null;
  balance: number;
  isNegative: boolean;
}

export interface Finding {
  id: string;
  category: 'utilization' | 'inconsistency' | 'duplicate' | 'stale_info' | 'challengeable' | 'derogatory' | 'other';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  bureausAffected: BureauKey[];
  accounts?: string[];
  recommendation: string;
}

export interface DisputeOpportunity {
  accountName: string;
  accountNumber: string | null;
  issue: string;
  bureaus: BureauKey[];
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

export interface ActionPhase {
  phase: number;
  title: string;
  description: string;
  estimatedWeeks: number;
  tasks: string[];
}

export interface CreditAnalysis {
  generatedAt: string;
  clientProfile: {
    name: string;
    email: string;
    dob?: string | null;
    ssnLast4?: string | null;
    address?: string | null;
    employer?: string | null;
  };
  bureauSummaries: BureauSummary[];
  overallStats: {
    totalAccounts: number;
    totalNegativeAccounts: number;
    totalBalance: number;
    averageUtilization?: number;
    estimatedScoreRange?: string;
  };
  keyFindings: Finding[];
  disputeOpportunities: DisputeOpportunity[];
  actionPlan: ActionPhase[];
  clientFacingSummary: string;
  educationSection: string;
}

export interface CreditAnalysisInput {
  client: Client & { user: User };
  creditReports: (CreditReport & { tradelines: Tradeline[] })[];
}

const BUREAU_LABELS: Record<string, BureauKey> = {
  EQUIFAX: 'equifax',
  EXPERIAN: 'experian',
  TRANSUNION: 'transunion'
};

const BUREAU_DISPLAY: Record<BureauKey, string> = {
  equifax: 'Equifax',
  experian: 'Experian',
  transunion: 'TransUnion'
};

function generateId(): string {
  return `finding-${Math.random().toString(36).substring(2, 9)}`;
}

function sumBalances(tradelines: Tradeline[]): number {
  return tradelines.reduce((sum, t) => sum + Number(t.balance || 0), 0);
}

function countNegatives(tradelines: Tradeline[]): number {
  return tradelines.filter(t => t.isNegative).length;
}

function toTradelineSummary(t: Tradeline): TradelineSummary {
  return {
    creditorName: t.creditorName,
    accountNumber: t.accountNumber,
    accountType: t.accountType,
    status: t.status,
    balance: Number(t.balance || 0),
    isNegative: t.isNegative
  };
}

export class CreditAnalysisService {
  /**
   * Generate a complete credit analysis from client data + credit reports
   */
  static generate(input: CreditAnalysisInput): CreditAnalysis {
    const { client, creditReports } = input;
    const now = new Date().toISOString();

    // Build bureau summaries
    const bureauSummaries: BureauSummary[] = [];
    const allTradelines: Tradeline[] = [];

    for (const report of creditReports) {
      const bureauKey = BUREAU_LABELS[report.bureau];
      if (!bureauKey) continue;

      const tradelines = report.tradelines || [];
      allTradelines.push(...tradelines);

      bureauSummaries.push({
        bureau: bureauKey,
        label: BUREAU_DISPLAY[bureauKey],
        totalAccounts: tradelines.length,
        negativeAccounts: countNegatives(tradelines),
        totalBalance: sumBalances(tradelines),
        accounts: tradelines.map(toTradelineSummary)
      });
    }

    // Ensure all 3 bureaus are represented (even if empty)
    const presentBureaus = new Set(bureauSummaries.map(b => b.bureau));
    for (const key of (['equifax', 'experian', 'transunion'] as BureauKey[])) {
      if (!presentBureaus.has(key)) {
        bureauSummaries.push({
          bureau: key,
          label: BUREAU_DISPLAY[key],
          totalAccounts: 0,
          negativeAccounts: 0,
          totalBalance: 0,
          accounts: []
        });
      }
    }

    // Sort consistently
    bureauSummaries.sort((a, b) => {
      const order: BureauKey[] = ['experian', 'equifax', 'transunion'];
      return order.indexOf(a.bureau) - order.indexOf(b.bureau);
    });

    // Overall stats
    const uniqueAccounts = new Map<string, Tradeline>();
    for (const t of allTradelines) {
      const key = `${t.creditorName}|${t.accountNumber || 'no-number'}`;
      if (!uniqueAccounts.has(key)) uniqueAccounts.set(key, t);
    }

    const totalAccounts = uniqueAccounts.size;
    const totalNegativeAccounts = Array.from(uniqueAccounts.values()).filter(t => t.isNegative).length;
    const totalBalance = Array.from(uniqueAccounts.values()).reduce((sum, t) => sum + Number(t.balance || 0), 0);

    // Auto-identify findings
    const findings: Finding[] = [];
    const disputeOps: DisputeOpportunity[] = [];

    // 1. High utilization check
    const totalBalances = sumBalances(allTradelines);
    // Heuristic: if total balances > $5000 and many accounts have balances, flag high utilization
    const accountsWithBalance = allTradelines.filter(t => Number(t.balance || 0) > 0);
    const utilizationRatio = accountsWithBalance.length > 0
      ? accountsWithBalance.length / allTradelines.length
      : 0;

    if (utilizationRatio > 0.7 && totalBalances > 1000) {
      findings.push({
        id: generateId(),
        category: 'utilization',
        severity: 'critical',
        title: 'High Credit Utilization Detected',
        description: `${accountsWithBalance.length} of ${allTradelines.length} accounts carry balances totaling $${totalBalances.toLocaleString()}. High utilization is a major score suppressor.`,
        bureausAffected: ['equifax', 'experian', 'transunion'],
        recommendation: 'Pay down balances below 30% of limit. Consider balance transfer or creditor negotiation.'
      });
    }

    // 2. Bureau inconsistency check
    const accountByBureau = new Map<string, Map<BureauKey, Tradeline>>();
    for (const report of creditReports) {
      const bureauKey = BUREAU_LABELS[report.bureau];
      if (!bureauKey) continue;
      for (const t of report.tradelines || []) {
        const key = `${t.creditorName}|${t.accountNumber || 'no-number'}`;
        if (!accountByBureau.has(key)) accountByBureau.set(key, new Map());
        accountByBureau.get(key)!.set(bureauKey, t);
      }
    }

    for (const [accountKey, bureauMap] of accountByBureau) {
      const bureaus = Array.from(bureauMap.keys());
      if (bureaus.length < 2) continue;

      const first = bureauMap.get(bureaus[0])!;
      const [creditorName] = accountKey.split('|');

      for (let i = 1; i < bureaus.length; i++) {
        const other = bureauMap.get(bureaus[i])!;
        const balanceDiff = Math.abs(Number(first.balance || 0) - Number(other.balance || 0));
        const statusDiff = first.status !== other.status;
        const negativeDiff = first.isNegative !== other.isNegative;

        if (balanceDiff > 100 || statusDiff || negativeDiff) {
          const issue = [];
          if (balanceDiff > 100) issue.push(`balance mismatch ($${Number(first.balance || 0).toLocaleString()} vs $${Number(other.balance || 0).toLocaleString()})`);
          if (statusDiff) issue.push(`status mismatch (${first.status || 'none'} vs ${other.status || 'none'})`);
          if (negativeDiff) issue.push(`negative flag mismatch`);

          findings.push({
            id: generateId(),
            category: 'inconsistency',
            severity: 'high',
            title: `Bureau Inconsistency: ${creditorName}`,
            description: `Account reports differently across bureaus: ${issue.join(', ')}. Inconsistent reporting is challengeable under FCRA § 611.`,
            bureausAffected: bureaus,
            accounts: [creditorName],
            recommendation: 'Dispute with both bureaus citing the inconsistency. Request method-of-verification if verified.'
          });

          disputeOps.push({
            accountName: creditorName,
            accountNumber: first.accountNumber,
            issue: `Inconsistent reporting: ${issue.join(', ')}`,
            bureaus: bureaus,
            reason: 'Inaccurate, incomplete, or inconsistent reporting across bureaus',
            priority: 'high'
          });
          break; // One finding per account is enough
        }
      }
    }

    // 3. Duplicate reporting check
    const seenAccounts = new Map<string, number>();
    for (const t of allTradelines) {
      const key = `${t.creditorName}|${t.accountNumber || 'no-number'}|${t.accountType || 'unknown'}`;
      seenAccounts.set(key, (seenAccounts.get(key) || 0) + 1);
    }
    for (const [key, count] of seenAccounts) {
      if (count > 1) {
        const [creditorName, accountNumber] = key.split('|');
        findings.push({
          id: generateId(),
          category: 'duplicate',
          severity: 'medium',
          title: `Possible Duplicate Reporting: ${creditorName}`,
          description: `This account appears ${count} times across reports. Duplicate reporting can inflate debt-to-income and suppress scores.`,
          bureausAffected: ['equifax', 'experian', 'transunion'],
          accounts: [creditorName],
          recommendation: 'Verify if this is the same account reported multiple times. Dispute duplicates as redundant or merged files.'
        });

        disputeOps.push({
          accountName: creditorName,
          accountNumber: accountNumber === 'no-number' ? null : accountNumber,
          issue: 'Duplicate reporting detected across bureaus',
          bureaus: ['equifax', 'experian', 'transunion'],
          reason: 'Duplicate account reporting — same account listed multiple times',
          priority: 'medium'
        });
      }
    }

    // 4. Derogatory concentration
    const negativeByBureau = new Map<BureauKey, number>();
    for (const summary of bureauSummaries) {
      negativeByBureau.set(summary.bureau, summary.negativeAccounts);
    }
    const maxNegatives = Math.max(...Array.from(negativeByBureau.values()));
    if (maxNegatives > 3) {
      const worstBureau = Array.from(negativeByBureau.entries()).find(([, v]) => v === maxNegatives)?.[0];
      findings.push({
        id: generateId(),
        category: 'derogatory',
        severity: 'high',
        title: 'Heavy Derogatory Concentration',
        description: `${maxNegatives} negative accounts detected${worstBureau ? ` (heaviest on ${BUREAU_DISPLAY[worstBureau]})` : ''}. Concentrated negative reporting significantly suppresses credit scores.`,
        bureausAffected: worstBureau ? [worstBureau] : ['equifax', 'experian', 'transunion'],
        recommendation: 'Prioritize factual disputes on the bureau with the most negatives. Round-one should target the heaviest bureau first.'
      });
    }

    // 5. Stale personal info check (if client has address but reports may show different)
    if (client.currentAddressLine1 && allTradelines.length > 0) {
      findings.push({
        id: generateId(),
        category: 'stale_info',
        severity: 'low',
        title: 'Verify Personal Information Consistency',
        description: 'Ensure name spelling, address history, and employer data match across all three bureaus. Stale or mixed personal info can cause score suppression and mixed-file issues.',
        bureausAffected: ['equifax', 'experian', 'transunion'],
        recommendation: 'Request current personal info from client and compare to bureau headers. Dispute outdated addresses, aliases, and employers.'
      });
    }

    // 6. Challengeable accounts (all negatives that haven't been caught above)
    const alreadyFlagged = new Set<string>();
    for (const op of disputeOps) {
      alreadyFlagged.add(`${op.accountName}|${op.accountNumber || 'none'}`);
    }
    for (const t of allTradelines) {
      if (!t.isNegative) continue;
      const key = `${t.creditorName}|${t.accountNumber || 'none'}`;
      if (alreadyFlagged.has(key)) continue;

      const bureausForAccount: BureauKey[] = [];
      for (const report of creditReports) {
        const bk = BUREAU_LABELS[report.bureau];
        if (!bk) continue;
        const found = report.tradelines?.find(tr => tr.creditorName === t.creditorName && tr.accountNumber === t.accountNumber);
        if (found) bureausForAccount.push(bk);
      }

      findings.push({
        id: generateId(),
        category: 'challengeable',
        severity: 'medium',
        title: `Challengeable Account: ${t.creditorName}`,
        description: `${t.accountType || 'Account'} with ${t.status || 'unknown status'} — balance $${Number(t.balance || 0).toLocaleString()}. Negative items must be 100% accurate, verifiable, and complete to remain.`,
        bureausAffected: bureausForAccount.length > 0 ? bureausForAccount : ['equifax', 'experian', 'transunion'],
        accounts: [t.creditorName],
        recommendation: 'Request debt validation from furnisher. Dispute with bureau if inaccurate, incomplete, outdated, or unverifiable.'
      });

      disputeOps.push({
        accountName: t.creditorName,
        accountNumber: t.accountNumber,
        issue: `${t.accountType || 'Negative account'} — ${t.status || 'reported negatively'}`,
        bureaus: bureausForAccount.length > 0 ? bureausForAccount : ['equifax', 'experian', 'transunion'],
        reason: 'Account reported as negative — request verification of accuracy and completeness',
        priority: 'medium'
      });

      alreadyFlagged.add(key);
    }

    // Build action plan
    const actionPlan: ActionPhase[] = [
      {
        phase: 1,
        title: 'Cleanup & Documentation',
        description: 'Gather all credit reports, verify personal information, and document current addresses, employers, and aliases.',
        estimatedWeeks: 1,
        tasks: [
          'Pull fresh reports from all 3 bureaus',
          'Verify name, DOB, SSN, address consistency',
          'Document all negative accounts with balances and dates',
          'Set up credit monitoring (IdentityIQ or MyFreeScoreNow)'
        ]
      },
      {
        phase: 2,
        title: 'Audit & Strategy',
        description: 'Analyze each account for factual errors, inconsistencies, duplicates, and unverifiable data. Build dispute strategy.',
        estimatedWeeks: 1,
        tasks: [
          'Cross-reference accounts across all 3 bureaus',
          'Identify balance mismatches, status differences, duplicates',
          'Flag accounts with missing or inconsistent data',
          'Prioritize high-impact disputes (collections, charge-offs)'
        ]
      },
      {
        phase: 3,
        title: 'Round-One Bureau Disputes',
        description: 'Mail certified dispute letters to each bureau. Request full reinvestigation and method-of-verification.',
        estimatedWeeks: 6,
        tasks: [
          'Draft bureau-specific dispute letters',
          'Mail certified, return-receipt requested',
          'Track 30-day response deadlines per bureau',
          'Log all responses and update dispute status'
        ]
      },
      {
        phase: 4,
        title: 'Furnisher Validation & Escalation',
        description: 'If bureaus verify, escalate to direct furnisher disputes, debt validation, and CFPB complaints if needed.',
        estimatedWeeks: 8,
        tasks: [
          'Send direct furnisher dispute letters',
          'Request debt validation from collectors',
          'File CFPB complaints for verified inaccurate items',
          'Follow up with method-of-verification requests'
        ]
      },
      {
        phase: 5,
        title: 'Credit Rebuild & Monitoring',
        description: 'After cleanup, focus on rebuilding positive credit history and maintaining low utilization.',
        estimatedWeeks: 12,
        tasks: [
          'Secure credit-builder cards or authorized-user tradelines',
          'Keep utilization under 10% on all cards',
          'Set up autopay to prevent future late payments',
          'Monitor monthly for new inaccuracies'
        ]
      }
    ];

    // Client-facing summary
    const totalDisputes = disputeOps.length;
    const criticalFindings = findings.filter(f => f.severity === 'critical').length;
    const highFindings = findings.filter(f => f.severity === 'high').length;

    const clientFacingSummary = `
## Your CredX Credit Analysis

**Prepared for:** ${client.user.firstName} ${client.user.lastName}
**Date:** ${new Date().toLocaleDateString()}

### Executive Summary

Your credit file contains **${totalAccounts} accounts** across the three major bureaus, with **${totalNegativeAccounts} negative items** currently reporting. Our analysis identified **${findings.length} key findings** and **${totalDisputes} dispute opportunities**.

${criticalFindings > 0 ? `⚠️ **${criticalFindings} critical issue(s)** require immediate attention.` : ''}
${highFindings > 0 ? `🔍 **${highFindings} high-priority finding(s)** identified for dispute.` : ''}

### What's Hurting Your Score

${findings.slice(0, 5).map(f => `- **${f.title}** (${f.severity.toUpperCase()}): ${f.description}`).join('\n\n')}

### Recommended Timeline

Based on your file complexity, we estimate a **${totalNegativeAccounts > 10 ? '6-12 month' : totalNegativeAccounts > 5 ? '4-8 month' : '3-6 month'}** dispute and rebuild timeline.

### Next Steps

1. Review this analysis with your CredX specialist
2. Confirm dispute strategy and priority accounts
3. Begin Round-One bureau disputes
4. Monitor responses and escalate as needed

---
*This analysis is for educational and strategic planning purposes. Results vary by individual file and bureau response.*
`.trim();

    const educationSection = `
### Understanding Your Credit Report

**Credit reports** are maintained by three major bureaus: Equifax, Experian, and TransUnion. Each bureau collects data independently, which is why your reports may differ.

**Key factors affecting your score:**
- **Payment History (35%)** — Late payments, collections, and charge-offs hurt the most
- **Credit Utilization (30%)** — Keep balances below 30% of your limit; 10% is ideal
- **Length of History (15%)** — Older accounts help; don't close your oldest card
- **Credit Mix (10%)** — A mix of revolving and installment accounts is positive
- **New Inquiries (10%)** — Hard inquiries from applications cause small, temporary dips

**Your Rights Under the FCRA:**
- You have the right to dispute any inaccurate, incomplete, or unverifiable item
- Bureaus must reinvestigate within 30 days of receiving your dispute
- If an item cannot be verified, it must be deleted
- You can request your dispute method of verification

**What Makes an Account Challengeable:**
- Inaccurate balance or status
- Dates that don't match your records
- Accounts you don't recognize (possible identity theft or mixed file)
- Duplicate reporting of the same account
- Missing required disclosures (for collectors)

**Rebuilding After Disputes:**
- Pay down credit card balances first
- Become an authorized user on a trusted person's old account
- Consider secured credit cards or credit-builder loans
- Always pay on time — even one late payment can drop your score 50+ points
`.trim();

    return {
      generatedAt: now,
      clientProfile: {
        name: `${client.user.firstName} ${client.user.lastName}`,
        email: client.user.email,
        dob: client.dobEncrypted,
        ssnLast4: client.ssnLast4,
        address: [client.currentAddressLine1, client.currentCity, client.currentState, client.currentPostalCode].filter(Boolean).join(', ') || null,
        employer: null // Not tracked in current schema
      },
      bureauSummaries,
      overallStats: {
        totalAccounts,
        totalNegativeAccounts,
        totalBalance,
        estimatedScoreRange: totalNegativeAccounts > 10 ? '500-580' : totalNegativeAccounts > 5 ? '580-650' : '650-720'
      },
      keyFindings: findings,
      disputeOpportunities: disputeOps,
      actionPlan,
      clientFacingSummary,
      educationSection
    };
  }

  /**
   * Serialize analysis to JSON string for storage
   */
  static serialize(analysis: CreditAnalysis): string {
    return JSON.stringify(analysis);
  }

  /**
   * Deserialize analysis from stored JSON
   */
  static deserialize(json: string): CreditAnalysis {
    return JSON.parse(json) as CreditAnalysis;
  }
}
