/**
 * Funding Readiness measurement.
 *
 * CredX does NOT guarantee approval or funding. This produces readiness signals
 * and a preparation checklist from the client's own data — it is not an
 * underwriting decision, a pre-approval, or a promise of any outcome.
 */

export const FUNDING_DISCLOSURE =
  'CredX does not guarantee approval or funding. Funding Readiness is an educational preparation tool that organizes your own information and highlights readiness signals. Lenders make their own decisions using their own criteria.';

export type IndicatorStatus = 'strong' | 'fair' | 'attention' | 'unknown';

export interface FundingIndicator {
  key: 'utilization' | 'inquiries' | 'derogatory' | 'profile_depth' | 'income';
  label: string;
  status: IndicatorStatus;
  detail: string;
}

export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  note?: string;
}

export interface FundingReadinessResult {
  disclosure: string;
  objective: string | null;
  targetAmount: number | null;
  targetTimeframe: string | null;
  indicators: FundingIndicator[];
  checklist: ChecklistItem[];
  documentChecklist: Array<{ key: string; label: string; provided: boolean }>;
  readiness: { band: 'early' | 'developing' | 'approaching' | 'well_positioned'; summary: string; score: number };
  nextSteps: string[];
  generatedAt: string;
}

const DEFAULT_CHECKLIST: Array<{ key: string; label: string }> = [
  { key: 'goal_defined', label: 'Funding objective and target amount defined' },
  { key: 'reports_reviewed', label: 'Current credit reports reviewed for accuracy' },
  { key: 'disputes_resolved', label: 'Inaccurate or unverifiable negative items addressed' },
  { key: 'utilization_plan', label: 'Revolving utilization plan in place (target under 30%, then 10%)' },
  { key: 'inquiry_pause', label: 'Avoiding new hard inquiries in the 3–6 months before applying' },
  { key: 'income_documented', label: 'Income documentation gathered (pay stubs, tax returns, bank statements)' },
  { key: 'dti_reviewed', label: 'Debt-to-income ratio reviewed against typical lender ranges' },
  { key: 'savings_reserve', label: 'Cash reserve / down payment set aside if applicable' },
  { key: 'lender_research', label: 'Researched lender types and typical requirements for this objective' }
];

const DEFAULT_DOCS: Array<{ key: string; label: string }> = [
  { key: 'id', label: 'Government-issued photo ID' },
  { key: 'proof_income', label: 'Proof of income (recent pay stubs or 1099s)' },
  { key: 'tax_returns', label: 'Last 2 years of tax returns (self-employed / business)' },
  { key: 'bank_statements', label: 'Last 2–3 months of bank statements' },
  { key: 'proof_residence', label: 'Proof of residence / address' },
  { key: 'debt_schedule', label: 'List of current debts and monthly payments' }
];

type ScoreInputClient = {
  currentAddressLine1?: string | null;
  currentCity?: string | null;
  currentState?: string | null;
  currentPostalCode?: string | null;
  creditReports?: Array<{
    score?: number | null;
    tradelines?: Array<{ accountType?: string | null; status?: string | null; balance?: unknown; isNegative?: boolean | null }>;
  }>;
  progress?: { analysis?: unknown; scores?: unknown } | null;
};

type FundingProfileInput = {
  objective?: string | null;
  targetAmount?: unknown;
  targetTimeframe?: string | null;
  monthlyIncome?: unknown;
  incomeType?: string | null;
  checklist?: unknown;
  documentChecklist?: unknown;
};

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.replace(/[$,%]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  if (v && typeof v === 'object' && 'toNumber' in v && typeof (v as any).toNumber === 'function') {
    const n = (v as any).toNumber();
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function isDerogatory(a: { accountType?: string | null; status?: string | null; isNegative?: boolean | null }): boolean {
  const text = `${a.accountType || ''} ${a.status || ''}`;
  return Boolean(a.isNegative) || /collection|charge.?off|late|past due|derogatory|repossession|foreclosure|bankrupt|judgment|lien/i.test(text);
}

const STATUS_SCORE: Record<IndicatorStatus, number> = { strong: 100, fair: 65, attention: 30, unknown: 50 };

export function assessFundingReadiness(client: ScoreInputClient, profile: FundingProfileInput | null): FundingReadinessResult {
  const analysis = rec(client.progress?.analysis);
  const summaryTiles = rec(analysis.summaryTiles);
  const tradelines = (client.creditReports || []).flatMap((r) => r.tradelines || []);

  // ---- utilization ----
  let util = num(summaryTiles.utilization) ?? num(analysis.utilization) ?? num(analysis.averageUtilization);
  if (util != null && util > 1) util = util / 100;
  const utilization: FundingIndicator =
    util == null
      ? { key: 'utilization', label: 'Revolving utilization', status: 'unknown', detail: 'Not enough data to estimate revolving utilization yet.' }
      : util <= 0.1
        ? { key: 'utilization', label: 'Revolving utilization', status: 'strong', detail: `Estimated ${Math.round(util * 100)}% — in the range lenders view most favorably.` }
        : util <= 0.3
          ? { key: 'utilization', label: 'Revolving utilization', status: 'fair', detail: `Estimated ${Math.round(util * 100)}% — acceptable; lowering toward 10% can help.` }
          : { key: 'utilization', label: 'Revolving utilization', status: 'attention', detail: `Estimated ${Math.round(util * 100)}% — high; a paydown plan before applying is recommended.` };

  // ---- inquiries ----
  const inqCount = num(summaryTiles.inquiries) ?? num(analysis.inquiries) ?? num(analysis.hardInquiries);
  const inquiries: FundingIndicator =
    inqCount == null
      ? { key: 'inquiries', label: 'Recent hard inquiries', status: 'unknown', detail: 'Hard-inquiry count is not available from current data.' }
      : inqCount <= 1
        ? { key: 'inquiries', label: 'Recent hard inquiries', status: 'strong', detail: `${inqCount} recent hard inquiry — minimal impact.` }
        : inqCount <= 3
          ? { key: 'inquiries', label: 'Recent hard inquiries', status: 'fair', detail: `${inqCount} recent hard inquiries — pause new applications where possible.` }
          : { key: 'inquiries', label: 'Recent hard inquiries', status: 'attention', detail: `${inqCount} recent hard inquiries — let these age before applying for new funding.` };

  // ---- derogatory ----
  const analysisAccounts = [...arr(analysis.accounts), ...arr(analysis.tradelines), ...arr(analysis.accountDetails)].map(rec);
  const derogCount =
    tradelines.filter(isDerogatory).length +
    analysisAccounts.filter((a) =>
      isDerogatory({
        accountType: String(a.accountType || a.category || a.type || ''),
        status: String(a.status || a.paymentStatus || ''),
        isNegative: Boolean(a.isNegative || a.negative)
      })
    ).length;
  const derogatory: FundingIndicator =
    derogCount === 0
      ? { key: 'derogatory', label: 'Derogatory marks', status: 'strong', detail: 'No derogatory indicators found in available data.' }
      : derogCount <= 2
        ? { key: 'derogatory', label: 'Derogatory marks', status: 'fair', detail: `${derogCount} derogatory indicator(s) — review each for accuracy, completeness, and age.` }
        : { key: 'derogatory', label: 'Derogatory marks', status: 'attention', detail: `${derogCount} derogatory indicators — addressing inaccurate/unverifiable items first is recommended.` };

  // ---- profile depth ----
  const hasAddress = Boolean(client.currentAddressLine1 && client.currentCity && client.currentState && client.currentPostalCode);
  const scores = [num(rec(client.progress?.scores).experian), num(rec(client.progress?.scores).equifax), num(rec(client.progress?.scores).transunion)]
    .concat((client.creditReports || []).map((r) => (typeof r.score === 'number' ? r.score : null)))
    .filter((n): n is number => n != null);
  const tradelineCount = tradelines.length + analysisAccounts.length;
  const depthSignals = [hasAddress, scores.length > 0, tradelineCount >= 3].filter(Boolean).length;
  const profile_depth: FundingIndicator =
    depthSignals >= 3
      ? { key: 'profile_depth', label: 'Credit profile depth', status: 'strong', detail: 'Address, score data, and multiple tradelines are on file.' }
      : depthSignals === 2
        ? { key: 'profile_depth', label: 'Credit profile depth', status: 'fair', detail: 'Some profile data present; adding a current report improves accuracy.' }
        : { key: 'profile_depth', label: 'Credit profile depth', status: 'attention', detail: 'Limited profile data — complete your profile and upload a current report.' };

  // ---- income ----
  const monthlyIncome = num(profile?.monthlyIncome);
  const income: FundingIndicator =
    monthlyIncome == null
      ? { key: 'income', label: 'Income readiness', status: 'unknown', detail: 'Add your monthly income and income type to assess affordability.' }
      : monthlyIncome > 0
        ? { key: 'income', label: 'Income readiness', status: profile?.incomeType ? 'fair' : 'attention', detail: profile?.incomeType ? 'Income recorded — keep documentation current.' : 'Income recorded; add income type and gather documentation.' }
        : { key: 'income', label: 'Income readiness', status: 'attention', detail: 'Recorded income is zero — lenders require verifiable income.' };

  const indicators = [utilization, inquiries, derogatory, profile_depth, income];

  // ---- checklist merge (stored state wins) ----
  const storedChecklist = new Map(arr(profile?.checklist).map((c) => [String(rec(c).key), rec(c)]));
  const checklist: ChecklistItem[] = DEFAULT_CHECKLIST.map((item) => {
    const stored = storedChecklist.get(item.key);
    return { ...item, done: stored?.done === true, note: typeof stored?.note === 'string' ? (stored.note as string) : undefined };
  });
  // Auto-mark goal_defined when the profile has an objective + amount.
  const goalItem = checklist.find((c) => c.key === 'goal_defined');
  if (goalItem && profile?.objective && num(profile.targetAmount)) goalItem.done = true;

  const storedDocs = new Map(arr(profile?.documentChecklist).map((d) => [String(rec(d).key), rec(d)]));
  const documentChecklist = DEFAULT_DOCS.map((d) => ({ ...d, provided: storedDocs.get(d.key)?.provided === true }));

  // ---- readiness band (blend of indicator statuses + checklist completion) ----
  const indicatorAvg = indicators.reduce((s, i) => s + STATUS_SCORE[i.status], 0) / indicators.length;
  const checklistPct = (checklist.filter((c) => c.done).length / checklist.length) * 100;
  const score = Math.round(indicatorAvg * 0.6 + checklistPct * 0.4);
  const band =
    score >= 80 ? 'well_positioned' : score >= 60 ? 'approaching' : score >= 40 ? 'developing' : 'early';
  const bandSummary: Record<typeof band, string> = {
    early: 'Early stage — focus on report accuracy, utilization, and completing your profile before applying.',
    developing: 'Developing — key signals are moving in the right direction; keep working the checklist.',
    approaching: 'Approaching readiness — tighten remaining items and avoid new inquiries.',
    well_positioned: 'Well positioned on the signals CredX can see — remember lenders apply their own criteria.'
  } as const;

  const nextSteps: string[] = [];
  for (const i of indicators) {
    if (i.status === 'attention') nextSteps.push(i.detail);
  }
  for (const c of checklist) {
    if (!c.done) { nextSteps.push(`Complete: ${c.label}.`); if (nextSteps.length >= 5) break; }
  }
  if (!nextSteps.length) nextSteps.push('Keep documentation current and re-check readiness before you apply.');

  return {
    disclosure: FUNDING_DISCLOSURE,
    objective: profile?.objective ?? null,
    targetAmount: num(profile?.targetAmount),
    targetTimeframe: profile?.targetTimeframe ?? null,
    indicators,
    checklist,
    documentChecklist,
    readiness: { band, summary: bandSummary[band], score },
    nextSteps: nextSteps.slice(0, 6),
    generatedAt: new Date().toISOString()
  };
}
