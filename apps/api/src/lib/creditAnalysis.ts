import type { CreditReport, Tradeline, Client, User, Bureau } from '@prisma/client';
import type {
  AccountCategory,
  BureauAccountFields,
  PaymentHistoryGrid,
  PersonalProfile,
  BureauScoreSnapshot,
  ExtractedAccount
} from './reportExtractor.js';

// =====================================================================
// MIG-style 3-bureau credit analysis output.
// Every field that varies across bureaus is captured per-bureau so the UI
// can highlight every disagreement and turn each one into a dispute.
// =====================================================================

export type BureauKey = 'experian' | 'equifax' | 'transunion';

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
  /** Specific field key that triggered this dispute (e.g. "balanceOwed"), if cell-level. */
  fieldKey?: string;
  /** The disagreeing values per bureau, when cell-level. */
  perBureauValues?: Partial<Record<BureauKey, string | number | null>>;
}

export interface ActionPhase {
  phase: number;
  title: string;
  description: string;
  estimatedWeeks: number;
  tasks: string[];
}

export interface AccountSummaryRow {
  index: number;
  type: string;
  creditorName: string;
  accountNumber: string | null;
  status: string | null;
  lastReported: string | null;
  balance: number | null;
  pastDue: number | null;
  dateOpened?: string | null;
}

export interface FicoFactorSection {
  factor: 'payment_history' | 'utilization' | 'length' | 'mix' | 'new_credit';
  weight: number;
  title: string;
  finding: string;
  courseOfAction: string;
}

export interface AccountDetail {
  creditorName: string;
  category: AccountCategory;
  isNegative: boolean;
  experian: BureauAccountFields | null;
  equifax: BureauAccountFields | null;
  transunion: BureauAccountFields | null;
  paymentHistory: PaymentHistoryGrid | null;
  /** Field keys whose values disagree across bureaus — these get pink-highlighted. */
  inconsistencies: string[];
}

export interface SummaryTiles {
  creditCards: { total: number; open: number; closed: number; maxed: number };
  loans: { total: number; open: number; closed: number };
  derogatory: {
    latePayments: number;
    collections: number;
    chargeOffs: number;
    repossessions: number;
    foreclosures: number;
    inquiries: number;
    shortSales: number;
    judgments: number;
    taxLiens: number;
    includedInBk: number;
    bankruptcies: number;
    totalNegative: number;
  };
}

export interface NextStepBlock {
  title: string;
  description: string;
  bullets: string[];
}

export interface CreditAnalysis {
  generatedAt: string;
  branding: {
    companyName: string;
    email: string | null;
    phone: string | null;
    website: string | null;
  };
  clientProfile: {
    name: string;
    email: string;
    dob?: string | null;
    ssnLast4?: string | null;
    address?: string | null;
    employer?: string | null;
  };
  bureauScores: BureauScoreSnapshot[];
  summaryTiles: SummaryTiles;
  keyFactors: {
    recent24Months: AccountSummaryRow[];
    statuteOfLimitations: AccountSummaryRow[];
  };
  ficoFactors: FicoFactorSection[];
  negativesByCategory: {
    collections: AccountSummaryRow[];
    chargeOffs: AccountSummaryRow[];
    latePayments: AccountSummaryRow[];
  };
  personalProfile: PersonalProfile;
  negativeAccounts: AccountDetail[];
  positiveAccounts: AccountDetail[];
  disputeOpportunities: DisputeOpportunity[];
  actionPlan: ActionPhase[];
  nextSteps: NextStepBlock[];
  clientFacingSummary: string;
  educationSection: string;
  // ---- Backwards-compat with prior analysis consumers ----
  keyFindings: Finding[];
  bureauSummaries: BureauSummary[];
  overallStats: {
    totalAccounts: number;
    totalNegativeAccounts: number;
    totalBalance: number;
    averageUtilization?: number;
    estimatedScoreRange?: string;
  };
}

export interface CreditAnalysisInput {
  client: Client & { user: User };
  creditReports: (CreditReport & { tradelines: Tradeline[] })[];
}

const BUREAU_DISPLAY: Record<BureauKey, string> = {
  equifax: 'Equifax',
  experian: 'Experian',
  transunion: 'TransUnion'
};

const PRISMA_TO_KEY: Record<Bureau, BureauKey> = {
  EQUIFAX: 'equifax',
  EXPERIAN: 'experian',
  TRANSUNION: 'transunion'
};

const BUREAU_KEYS: BureauKey[] = ['experian', 'equifax', 'transunion'];

// Fields compared cell-by-cell across bureaus to detect inaccuracies.
const COMPARABLE_FIELDS: (keyof BureauAccountFields)[] = [
  'balanceOwed', 'highBalance', 'pastDueAmount', 'creditLimit',
  'accountStatus', 'paymentStatus', 'accountRating',
  'dateOpened', 'closedDate', 'dateOfLastActivity', 'dateOfLastPayment',
  'creditorType', 'accountType', 'comments'
];

const FIELD_LABELS: Record<string, string> = {
  balanceOwed: 'balance',
  highBalance: 'high balance',
  pastDueAmount: 'past due',
  creditLimit: 'credit limit',
  accountStatus: 'account status',
  paymentStatus: 'payment status',
  accountRating: 'account rating',
  dateOpened: 'date opened',
  closedDate: 'closed date',
  dateOfLastActivity: 'date of last activity',
  dateOfLastPayment: 'date of last payment',
  creditorType: 'creditor type',
  accountType: 'account type',
  comments: 'creditor comments'
};

function generateId(): string {
  return `id-${Math.random().toString(36).substring(2, 10)}`;
}

function moneyOrNull(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return Number.isFinite(v) ? v : null;
}

function readRichPayload(creditReports: CreditAnalysisInput['creditReports']) {
  for (const report of creditReports) {
    const raw = report.rawPayload as { rich?: { scores?: BureauScoreSnapshot[]; personalProfile?: PersonalProfile; accounts?: ExtractedAccount[] } } | null;
    if (raw?.rich?.accounts) return raw.rich;
  }
  return null;
}

function buildAccountsFromTradelines(creditReports: CreditAnalysisInput['creditReports']): ExtractedAccount[] {
  // Fallback path: derive minimal AccountDetail entries from legacy Tradeline
  // rows when richPayload is absent (older uploads pre-rich-extractor).
  const byKey = new Map<string, ExtractedAccount>();
  for (const report of creditReports) {
    const bureauKey = PRISMA_TO_KEY[report.bureau];
    if (!bureauKey) continue;
    for (const t of report.tradelines || []) {
      const key = `${t.creditorName.toUpperCase()}|${t.accountNumber || ''}`;
      let entry = byKey.get(key);
      if (!entry) {
        entry = {
          creditorName: t.creditorName,
          category: t.isNegative ? 'derogatory' : 'positive',
          isNegative: t.isNegative,
          experian: null,
          equifax: null,
          transunion: null,
          paymentHistory: null
        };
        byKey.set(key, entry);
      }
      const fields: BureauAccountFields = {
        accountNumber: t.accountNumber,
        highBalance: null,
        lastVerified: null,
        dateOfLastActivity: null,
        dateReported: null,
        dateOpened: null,
        balanceOwed: t.balance ? Number(t.balance) : null,
        closedDate: null,
        accountRating: null,
        accountDescription: null,
        disputeStatus: null,
        creditorType: null,
        accountStatus: t.status,
        paymentStatus: t.status,
        comments: null,
        paymentAmount: null,
        dateOfLastPayment: null,
        termMonths: null,
        pastDueAmount: null,
        accountType: t.accountType,
        paymentFrequency: null,
        creditLimit: null
      };
      entry[bureauKey] = fields;
      if (t.isNegative) entry.isNegative = true;
    }
  }
  return Array.from(byKey.values());
}

function detectInconsistencies(account: ExtractedAccount): string[] {
  const found: string[] = [];
  for (const field of COMPARABLE_FIELDS) {
    const values = BUREAU_KEYS
      .map(k => account[k]?.[field])
      .filter(v => v !== null && v !== undefined && v !== '');
    if (values.length < 2) continue;
    // For numeric fields, treat differences > $1 (or any difference for status)
    if (typeof values[0] === 'number') {
      const nums = values as number[];
      const max = Math.max(...nums);
      const min = Math.min(...nums);
      if (max - min > 1) found.push(field);
    } else {
      const norm = values.map(v => String(v).trim().toLowerCase());
      const unique = new Set(norm);
      if (unique.size > 1) found.push(field);
    }
  }
  return found;
}

function categorizeAccount(account: ExtractedAccount): AccountCategory {
  if (account.category && account.category !== 'unknown') return account.category;
  // Fallback inference if extractor didn't set a category.
  const fields = account.experian || account.equifax || account.transunion;
  if (!fields) return 'unknown';
  const status = (fields.paymentStatus || fields.accountStatus || fields.accountRating || '').toLowerCase();
  if (status.includes('collection')) return 'collection';
  if (status.includes('charge')) return 'charge_off';
  if (status.includes('late') || status.includes('30') || status.includes('60') || status.includes('90') || status.includes('120') || status.includes('150')) return 'late_payment';
  if (status.includes('repo') || status.includes('foreclos') || status.includes('judg') || status.includes('lien') || status.includes('bankrupt')) return 'derogatory';
  return account.isNegative ? 'derogatory' : 'positive';
}

function pickPrimaryFields(account: ExtractedAccount): BureauAccountFields | null {
  return account.experian || account.equifax || account.transunion;
}

function summarize(account: ExtractedAccount, idx: number): AccountSummaryRow {
  const fields = pickPrimaryFields(account);
  const typeLabel = (() => {
    switch (account.category) {
      case 'collection': return 'Collection';
      case 'charge_off': return 'Charge Off';
      case 'late_payment': return 'Late Payment';
      case 'derogatory': return 'Derogatory';
      case 'positive': return 'Positive';
      default: return 'Account';
    }
  })();
  const dates = BUREAU_KEYS
    .map(k => account[k]?.dateReported)
    .filter((d): d is string => !!d)
    .sort();
  return {
    index: idx + 1,
    type: typeLabel,
    creditorName: account.creditorName,
    accountNumber: fields?.accountNumber ?? null,
    status: fields?.accountStatus ?? fields?.paymentStatus ?? fields?.accountRating ?? null,
    lastReported: dates.length ? dates[dates.length - 1] : null,
    balance: moneyOrNull(fields?.balanceOwed ?? null),
    pastDue: moneyOrNull(fields?.pastDueAmount ?? null),
    dateOpened: fields?.dateOpened ?? null
  };
}

function buildSummaryTiles(accounts: ExtractedAccount[]): SummaryTiles {
  const tiles: SummaryTiles = {
    creditCards: { total: 0, open: 0, closed: 0, maxed: 0 },
    loans: { total: 0, open: 0, closed: 0 },
    derogatory: {
      latePayments: 0, collections: 0, chargeOffs: 0, repossessions: 0,
      foreclosures: 0, inquiries: 0, shortSales: 0, judgments: 0, taxLiens: 0,
      includedInBk: 0, bankruptcies: 0, totalNegative: 0
    }
  };

  for (const acc of accounts) {
    const fields = pickPrimaryFields(acc);
    const accountType = (fields?.accountType || '').toLowerCase();
    const status = (fields?.accountStatus || fields?.paymentStatus || '').toLowerCase();
    const comments = (fields?.comments || '').toLowerCase();
    const isClosed = status.includes('closed') || status.includes('paid') || (fields?.closedDate ?? null) !== null;
    const isOpen = !isClosed && status.includes('open');

    if (accountType.includes('credit card') || accountType.includes('charge') || accountType.includes('revolving')) {
      tiles.creditCards.total += 1;
      if (isClosed) tiles.creditCards.closed += 1;
      else if (isOpen) tiles.creditCards.open += 1;
      const limit = fields?.creditLimit ?? null;
      const bal = fields?.balanceOwed ?? null;
      if (limit && bal && limit > 0 && bal / limit > 0.9) tiles.creditCards.maxed += 1;
    } else if (accountType.includes('loan') || accountType.includes('install') || accountType.includes('auto') || accountType.includes('mortgage') || accountType.includes('student')) {
      tiles.loans.total += 1;
      if (isClosed) tiles.loans.closed += 1;
      else if (isOpen) tiles.loans.open += 1;
    }

    if (acc.isNegative) tiles.derogatory.totalNegative += 1;
    switch (acc.category) {
      case 'late_payment': tiles.derogatory.latePayments += 1; break;
      case 'collection': tiles.derogatory.collections += 1; break;
      case 'charge_off': tiles.derogatory.chargeOffs += 1; break;
      case 'inquiry': tiles.derogatory.inquiries += 1; break;
    }
    if (comments.includes('repo')) tiles.derogatory.repossessions += 1;
    if (comments.includes('foreclos')) tiles.derogatory.foreclosures += 1;
    if (comments.includes('short sale')) tiles.derogatory.shortSales += 1;
    if (comments.includes('judg')) tiles.derogatory.judgments += 1;
    if (comments.includes('tax lien')) tiles.derogatory.taxLiens += 1;
    if (comments.includes('included in bk') || comments.includes('included in bankruptcy')) tiles.derogatory.includedInBk += 1;
    if (comments.includes('bankrupt') && !comments.includes('included')) tiles.derogatory.bankruptcies += 1;
  }

  return tiles;
}

function buildBureauSummaries(accounts: ExtractedAccount[]): BureauSummary[] {
  const out: BureauSummary[] = [];
  for (const k of BUREAU_KEYS) {
    let totalBalance = 0;
    let negativeAccounts = 0;
    const list: TradelineSummary[] = [];
    for (const acc of accounts) {
      const fields = acc[k];
      if (!fields) continue;
      const bal = Number(fields.balanceOwed || 0);
      totalBalance += bal;
      if (acc.isNegative) negativeAccounts += 1;
      list.push({
        creditorName: acc.creditorName,
        accountNumber: fields.accountNumber,
        accountType: fields.accountType,
        status: fields.accountStatus || fields.paymentStatus || fields.accountRating,
        balance: bal,
        isNegative: acc.isNegative
      });
    }
    out.push({
      bureau: k,
      label: BUREAU_DISPLAY[k],
      totalAccounts: list.length,
      negativeAccounts,
      totalBalance,
      accounts: list
    });
  }
  return out;
}

function parseDateLoose(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isFinite(d.getTime())) return d;
  return null;
}

function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function buildKeyFactors(accounts: ExtractedAccount[]) {
  const now = new Date();
  const recent24Months: AccountSummaryRow[] = [];
  const statuteOfLimitations: AccountSummaryRow[] = [];

  let recentIdx = 0;
  let statIdx = 0;

  for (const acc of accounts) {
    if (!acc.isNegative) continue;
    const fields = pickPrimaryFields(acc);
    if (!fields) continue;

    const lastReported = parseDateLoose(
      BUREAU_KEYS.map(k => acc[k]?.dateReported).find(Boolean) || null
    );
    if (lastReported && monthsBetween(lastReported, now) <= 24) {
      recent24Months.push(summarize(acc, recentIdx++));
    }
    const opened = parseDateLoose(fields.dateOpened);
    if (opened) {
      const yearsOpen = (now.getTime() - opened.getTime()) / (365 * 24 * 3600 * 1000);
      // Most state SOLs for written contracts are 3–6 yrs. Flag accounts opened
      // 3–7 years ago since they're inside the SOL window where furnishers can sue.
      if (yearsOpen >= 3 && yearsOpen <= 7) {
        statuteOfLimitations.push(summarize(acc, statIdx++));
      }
    }
  }

  return { recent24Months, statuteOfLimitations };
}

function buildNegativesByCategory(accounts: ExtractedAccount[]) {
  const collections: AccountSummaryRow[] = [];
  const chargeOffs: AccountSummaryRow[] = [];
  const latePayments: AccountSummaryRow[] = [];
  let cIdx = 0, coIdx = 0, lpIdx = 0;
  for (const acc of accounts) {
    if (!acc.isNegative) continue;
    const cat = categorizeAccount(acc);
    if (cat === 'collection') collections.push(summarize(acc, cIdx++));
    else if (cat === 'charge_off') chargeOffs.push(summarize(acc, coIdx++));
    else if (cat === 'late_payment') latePayments.push(summarize(acc, lpIdx++));
  }
  return { collections, chargeOffs, latePayments };
}

function buildFicoFactors(accounts: ExtractedAccount[], tiles: SummaryTiles): FicoFactorSection[] {
  const negatives = tiles.derogatory.totalNegative;
  const utilizationRatios: number[] = [];
  let oldestOpened: Date | null = null;
  const accountTypes = new Set<string>();
  let recentInquiries = 0;

  for (const acc of accounts) {
    const fields = pickPrimaryFields(acc);
    if (!fields) continue;
    if (fields.creditLimit && fields.creditLimit > 0 && fields.balanceOwed !== null) {
      utilizationRatios.push(fields.balanceOwed / fields.creditLimit);
    }
    const opened = parseDateLoose(fields.dateOpened);
    if (opened && (!oldestOpened || opened < oldestOpened)) oldestOpened = opened;
    if (fields.accountType) accountTypes.add(fields.accountType.toLowerCase());
    if (acc.category === 'inquiry') recentInquiries += 1;
  }

  const avgUtilization = utilizationRatios.length
    ? utilizationRatios.reduce((s, n) => s + n, 0) / utilizationRatios.length
    : 0;
  const oldestYears = oldestOpened
    ? (Date.now() - oldestOpened.getTime()) / (365 * 24 * 3600 * 1000)
    : 0;

  return [
    {
      factor: 'payment_history',
      weight: 35,
      title: 'Payment History',
      finding: negatives > 0
        ? `Your report shows ${negatives} derogatory ${negatives === 1 ? 'account' : 'accounts'}. Recent late payments, collections, and charge-offs suppress your score the most.`
        : 'No derogatory accounts detected on your report. Maintain your current payment performance.',
      courseOfAction: negatives > 0
        ? 'We will dispute every inaccurate, incomplete, or unverifiable derogatory item. Keep all current bills paid on time during the dispute process.'
        : 'No action required — keep paying on time.'
    },
    {
      factor: 'utilization',
      weight: 30,
      title: 'Credit Utilization',
      finding: avgUtilization > 0.5
        ? `Your average utilization is ${Math.round(avgUtilization * 100)}%. High utilization is the second-largest score factor and changes month-to-month.`
        : avgUtilization > 0.3
        ? `Your average utilization is ${Math.round(avgUtilization * 100)}%. Below 30% is the standard threshold; below 10% is ideal.`
        : avgUtilization > 0
        ? `Your average utilization is ${Math.round(avgUtilization * 100)}%. This is healthy — maintain it.`
        : 'No revolving balances detected to calculate utilization.',
      courseOfAction: avgUtilization > 0.3
        ? 'Pay revolving balances down below 10% of each card limit. Even a $50 reduction before the statement closes can move the score on the next pull.'
        : 'No action required — utilization is healthy.'
    },
    {
      factor: 'length',
      weight: 15,
      title: 'Length of Credit',
      finding: oldestYears >= 5
        ? `Your oldest account is ${Math.floor(oldestYears)} years old. Length of history is a positive contributor.`
        : oldestYears > 0
        ? `Your oldest account is only ${oldestYears.toFixed(1)} years old. History length will improve as accounts age.`
        : 'Could not determine length of history from the report.',
      courseOfAction: oldestYears < 5
        ? 'Do not close your oldest accounts during the dispute process — they are anchoring your length-of-history factor.'
        : 'No action required.'
    },
    {
      factor: 'mix',
      weight: 10,
      title: 'Mix of Credit',
      finding: accountTypes.size >= 2
        ? `You have ${accountTypes.size} types of credit on file (${Array.from(accountTypes).slice(0, 4).join(', ')}). Variety is a positive contributor.`
        : 'Limited account variety detected. A mix of revolving and installment credit is rewarded by the FICO model.',
      courseOfAction: accountTypes.size >= 2
        ? 'No action required.'
        : 'After the dispute round, consider adding a credit-builder loan or secured card to broaden the account mix.'
    },
    {
      factor: 'new_credit',
      weight: 10,
      title: 'New Credit',
      finding: recentInquiries > 4
        ? `${recentInquiries} hard inquiries detected. Multiple inquiries inside 12 months can cause small score dips.`
        : recentInquiries > 0
        ? `${recentInquiries} hard inquiry detected. The impact is small and temporary.`
        : 'No recent hard inquiries detected. This is positive — high-score consumers apply for new credit no more than twice a year.',
      courseOfAction: recentInquiries > 2
        ? 'Pause all new credit applications during the dispute round. Inquiries that are unauthorized or duplicate-pulls are themselves disputable.'
        : 'No action required.'
    }
  ];
}

function buildAccountDetails(accounts: ExtractedAccount[]) {
  const negative: AccountDetail[] = [];
  const positive: AccountDetail[] = [];
  for (const acc of accounts) {
    const inconsistencies = detectInconsistencies(acc);
    const detail: AccountDetail = {
      creditorName: acc.creditorName,
      category: categorizeAccount(acc),
      isNegative: acc.isNegative,
      experian: acc.experian,
      equifax: acc.equifax,
      transunion: acc.transunion,
      paymentHistory: acc.paymentHistory,
      inconsistencies
    };
    if (acc.isNegative) negative.push(detail);
    else positive.push(detail);
  }
  return { negative, positive };
}

function buildDisputeOpportunities(details: AccountDetail[]): DisputeOpportunity[] {
  const ops: DisputeOpportunity[] = [];

  for (const d of details) {
    if (!d.isNegative && d.inconsistencies.length === 0) continue;

    const fields = d.experian || d.equifax || d.transunion;
    const reportingBureaus = BUREAU_KEYS.filter(k => d[k] !== null);

    // One dispute per cell-level inconsistency
    for (const fieldKey of d.inconsistencies) {
      const values: Partial<Record<BureauKey, string | number | null>> = {};
      for (const k of BUREAU_KEYS) {
        const v = (d[k] as Record<string, unknown> | null)?.[fieldKey];
        if (v !== undefined) values[k] = v as string | number | null;
      }
      const valueText = BUREAU_KEYS
        .filter(k => values[k] !== undefined)
        .map(k => `${BUREAU_DISPLAY[k]}: ${values[k] ?? '—'}`)
        .join(' / ');
      ops.push({
        accountName: d.creditorName,
        accountNumber: fields?.accountNumber ?? null,
        issue: `${FIELD_LABELS[fieldKey] || fieldKey} disagrees across bureaus (${valueText})`,
        bureaus: reportingBureaus,
        reason: `Inconsistent reporting on ${FIELD_LABELS[fieldKey] || fieldKey}. Under FCRA § 611 the furnisher must report identical, accurate data to every bureau.`,
        priority: 'high',
        fieldKey,
        perBureauValues: values
      });
    }

    // If negative with no cell-level inconsistencies, still queue a generic dispute
    if (d.isNegative && d.inconsistencies.length === 0) {
      ops.push({
        accountName: d.creditorName,
        accountNumber: fields?.accountNumber ?? null,
        issue: `${categorizeAccount({ ...d, experian: d.experian, equifax: d.equifax, transunion: d.transunion } as ExtractedAccount).replace('_', ' ')} reported negatively`,
        bureaus: reportingBureaus,
        reason: 'Request method-of-verification and full debt validation. Negative items must be 100% accurate, complete, and verifiable to remain.',
        priority: 'medium'
      });
    }
  }

  return ops;
}

function buildActionPlan(): ActionPhase[] {
  return [
    {
      phase: 1,
      title: 'Cleanup & Documentation',
      description: 'Verify personal information across all three bureaus and lock down the data baseline.',
      estimatedWeeks: 1,
      tasks: [
        'Confirm name, DOB, SSN-last-4 across each bureau',
        'List every current and previous address; flag mismatches',
        'Document employer history and aliases',
        'Lock in monitoring (MyFreeScoreNow / IdentityIQ)'
      ]
    },
    {
      phase: 2,
      title: 'Round-One Bureau Disputes',
      description: 'Mail certified dispute letters bureau-by-bureau citing specific inaccuracies. 30-day reinvestigation clock starts on receipt.',
      estimatedWeeks: 6,
      tasks: [
        'Draft per-bureau letters citing FCRA § 611 inaccuracies',
        'Mail certified, return-receipt requested',
        'Track 30-day deadlines per bureau',
        'Log responses; update item status in the portal'
      ]
    },
    {
      phase: 3,
      title: 'Furnisher Validation & Escalation',
      description: 'For verified items, escalate to direct furnisher disputes, debt-validation requests, and CFPB complaints where warranted.',
      estimatedWeeks: 8,
      tasks: [
        'Send debt validation letters to collectors',
        'File direct furnisher disputes under FCRA § 623',
        'CFPB / state-AG complaints for stonewalled items',
        'Method-of-verification follow-up'
      ]
    },
    {
      phase: 4,
      title: 'Score Rebuild & Monitoring',
      description: 'Once derogatory items are resolved, focus on building positive history and keeping utilization low.',
      estimatedWeeks: 12,
      tasks: [
        'Add a secured card or credit-builder loan if mix is thin',
        'Keep all card balances under 10% of limit',
        'Set autopay on every account',
        'Pull fresh reports monthly to confirm new inaccuracies don\'t reappear'
      ]
    }
  ];
}

function buildNextSteps(): NextStepBlock[] {
  return [
    {
      title: 'Challenge Inaccurate Information & Score Improvement',
      description: 'We will identify and dispute every inaccurate or incomplete account, while coaching you through the score-rebuilding habits that actually move the needle.',
      bullets: [
        'Fight inaccurate accounts',
        'Focus on improving your score',
        'Assist with rebuilding your credit',
        'Collector intervention assistance'
      ]
    },
    {
      title: 'Track Your Progress at All Times',
      description: 'You\'ll see every dispute round, response, and score movement inside your client portal — the same place we work the file from.',
      bullets: [
        'Track your progress 24/7',
        'Get regular updates by email and SMS',
        'Reach support when you need it'
      ]
    }
  ];
}

function buildClientFacingSummary(args: {
  client: Client & { user: User };
  tiles: SummaryTiles;
  details: AccountDetail[];
  disputeCount: number;
}): string {
  const { client, tiles, details, disputeCount } = args;
  const negativesByCat = details.filter(d => d.isNegative);
  const inconsistencyCount = details.reduce((sum, d) => sum + d.inconsistencies.length, 0);
  const timeline = tiles.derogatory.totalNegative > 10 ? '6–12 month' : tiles.derogatory.totalNegative > 5 ? '4–8 month' : '3–6 month';
  return [
    `# Credit Analysis Summary`,
    ``,
    `**Client:** ${client.user.firstName} ${client.user.lastName}`,
    `**Report date:** ${new Date().toLocaleDateString()}`,
    ``,
    `## What we found`,
    `- ${negativesByCat.length} negative account${negativesByCat.length === 1 ? '' : 's'} across the three bureaus`,
    `- ${tiles.derogatory.collections} collection${tiles.derogatory.collections === 1 ? '' : 's'}, ${tiles.derogatory.chargeOffs} charge-off${tiles.derogatory.chargeOffs === 1 ? '' : 's'}, ${tiles.derogatory.latePayments} account${tiles.derogatory.latePayments === 1 ? '' : 's'} with late-payment history`,
    `- ${inconsistencyCount} cell-level inconsistenc${inconsistencyCount === 1 ? 'y' : 'ies'} flagged across bureaus`,
    `- ${disputeCount} dispute opportunit${disputeCount === 1 ? 'y' : 'ies'} ready to file`,
    ``,
    `## What that means for you`,
    `Each inconsistency between bureaus is a fact the furnisher reported differently to different agencies — that's a direct FCRA § 611 violation and the easiest items to remove. Negative items reported identically still must be accurate, complete, and verifiable; we'll demand each one be re-investigated and documented.`,
    ``,
    `## Estimated timeline`,
    `**${timeline} working window** based on the volume of items. We'll move bureau-by-bureau in 30-day reinvestigation rounds, then escalate to furnishers and CFPB for anything that comes back "verified."`,
    ``,
    `*Educational and strategic planning purposes. Results vary by individual file and bureau response.*`
  ].join('\n');
}

const EDUCATION_SECTION = `
### Understanding Your Credit Report

**Three bureaus, three different files.** Equifax, Experian, and TransUnion each maintain a separate report on you. Furnishers (your creditors) do not always report the same data to all three — and any disagreement is, by law, an inaccuracy you can dispute.

**Five score factors:**
- **Payment History (35%)** — late payments, collections, charge-offs hit the hardest
- **Credit Utilization (30%)** — keep balances below 30% of limits, ideally under 10%
- **Length of History (15%)** — older accounts help; do not close your oldest cards
- **Credit Mix (10%)** — a blend of revolving and installment is rewarded
- **New Credit (10%)** — too many recent inquiries cause small, temporary dips

**Your rights under the FCRA:**
- You can dispute any inaccurate, incomplete, or unverifiable item
- Bureaus must reinvestigate within 30 days
- If an item cannot be verified, it must be deleted
- You can request method-of-verification details from the bureau

**What makes an item challengeable:**
- Inaccurate balance, status, or dates
- Reporting that differs across bureaus
- Accounts you don't recognize (potential mixed file or identity theft)
- Duplicate listings of the same account
- Missing collector disclosures or out-of-statute attempts to collect
`.trim();

export class CreditAnalysisService {
  static generate(input: CreditAnalysisInput): CreditAnalysis {
    const { client, creditReports } = input;
    const now = new Date().toISOString();

    const rich = readRichPayload(creditReports);
    const accounts: ExtractedAccount[] = rich?.accounts && rich.accounts.length
      ? rich.accounts
      : buildAccountsFromTradelines(creditReports);

    const personalProfile: PersonalProfile = rich?.personalProfile ?? {
      experian: null, equifax: null, transunion: null, publicRecords: []
    };

    const bureauScores: BureauScoreSnapshot[] = rich?.scores ?? [];

    const tiles = buildSummaryTiles(accounts);
    const bureauSummaries = buildBureauSummaries(accounts);
    const keyFactors = buildKeyFactors(accounts);
    const negativesByCategory = buildNegativesByCategory(accounts);
    const ficoFactors = buildFicoFactors(accounts, tiles);
    const { negative, positive } = buildAccountDetails(accounts);
    const allDetails = [...negative, ...positive];
    const disputeOpportunities = buildDisputeOpportunities(allDetails);
    const actionPlan = buildActionPlan();
    const nextSteps = buildNextSteps();
    const clientFacingSummary = buildClientFacingSummary({ client, tiles, details: allDetails, disputeCount: disputeOpportunities.length });

    // Backwards-compat: keep keyFindings populated (high-level rollups)
    const keyFindings: Finding[] = [];
    for (const d of negative) {
      if (d.inconsistencies.length === 0) continue;
      keyFindings.push({
        id: generateId(),
        category: 'inconsistency',
        severity: 'high',
        title: `Bureau Inconsistency: ${d.creditorName}`,
        description: `${d.inconsistencies.length} field(s) disagree across bureaus: ${d.inconsistencies.map(f => FIELD_LABELS[f] || f).join(', ')}`,
        bureausAffected: BUREAU_KEYS.filter(k => d[k]),
        accounts: [d.creditorName],
        recommendation: 'Dispute citing FCRA § 611 — furnisher must report identical, accurate data to every bureau.'
      });
    }
    if (tiles.derogatory.totalNegative > 3) {
      keyFindings.push({
        id: generateId(),
        category: 'derogatory',
        severity: 'high',
        title: 'Heavy Derogatory Concentration',
        description: `${tiles.derogatory.totalNegative} derogatory accounts detected across the three bureaus.`,
        bureausAffected: BUREAU_KEYS,
        recommendation: 'Prioritize bureau-by-bureau disputes on the heaviest bureau first.'
      });
    }

    const totalAccounts = accounts.length;
    const totalNegativeAccounts = tiles.derogatory.totalNegative;
    const totalBalance = bureauSummaries.reduce((s, b) => s + b.totalBalance, 0);

    return {
      generatedAt: now,
      branding: {
        companyName: process.env.BRAND_COMPANY_NAME || 'CredX',
        email: process.env.BRAND_CONTACT_EMAIL || null,
        phone: process.env.BRAND_PHONE || null,
        website: process.env.BRAND_WEBSITE || null
      },
      clientProfile: {
        name: `${client.user.firstName} ${client.user.lastName}`,
        email: client.user.email,
        dob: client.dobEncrypted ? '(on file, encrypted)' : null,
        ssnLast4: client.ssnLast4,
        address: [client.currentAddressLine1, client.currentCity, client.currentState, client.currentPostalCode].filter(Boolean).join(', ') || null,
        employer: null
      },
      bureauScores,
      summaryTiles: tiles,
      keyFactors,
      ficoFactors,
      negativesByCategory,
      personalProfile,
      negativeAccounts: negative,
      positiveAccounts: positive,
      disputeOpportunities,
      actionPlan,
      nextSteps,
      clientFacingSummary,
      educationSection: EDUCATION_SECTION,
      keyFindings,
      bureauSummaries,
      overallStats: {
        totalAccounts,
        totalNegativeAccounts,
        totalBalance,
        estimatedScoreRange: totalNegativeAccounts > 10 ? '500-580' : totalNegativeAccounts > 5 ? '580-650' : '650-720'
      }
    };
  }

  static serialize(analysis: CreditAnalysis): string {
    return JSON.stringify(analysis);
  }

  static deserialize(json: string): CreditAnalysis {
    return JSON.parse(json) as CreditAnalysis;
  }
}
