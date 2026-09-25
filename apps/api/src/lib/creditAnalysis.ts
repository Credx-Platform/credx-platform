import type { CreditReport, Tradeline, Client, User, Bureau } from '@prisma/client';
import type {
  AccountCategory,
  BureauAccountFields,
  PaymentHistoryGrid,
  PersonalProfile,
  BureauScoreSnapshot,
  ExtractedAccount
} from './reportExtractor.js';
import {
  detectAccuracyFlags,
  detectDuplicateDebts,
  detectPersonalInfoFlags,
  type AccuracyFlag,
  type PersonalInfoFlag
} from './reportAccuracyRules.js';

export type { AccuracyFlag, PersonalInfoFlag } from './reportAccuracyRules.js';

// =====================================================================
// MIG-style 3-bureau credit analysis output.
// Every field that varies across bureaus is captured per-bureau so the UI
// can highlight every disagreement and turn each one into a dispute.
// =====================================================================

export type BureauKey = 'experian' | 'equifax' | 'transunion';

export const ANALYSIS_ENGINE_VERSION = '2026-09-25-accuracy-rules-v4';

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

export interface InquiryDetail {
  creditorName: string;
  accountNumber: string | null;
  bureaus: BureauKey[];
  dates: Partial<Record<BureauKey, string | null>>;
  purpose: Partial<Record<BureauKey, string | null>>;
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
  /** Errors inside a single bureau's record (dates, balances, status, comments, obsolescence, duplicates). */
  accuracyFlags: AccuracyFlag[];
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
  analysisEngineVersion: string;
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
  /** Hard inquiries are tracked separately and never enter account disputes automatically. */
  inquiries: InquiryDetail[];
  /** Name / DOB / address disagreements across bureaus (mixed-file indicators). */
  personalInfoFlags: PersonalInfoFlag[];
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

type RichPayload = { scores?: BureauScoreSnapshot[]; personalProfile?: PersonalProfile; accounts?: ExtractedAccount[] };

function richOf(report: CreditAnalysisInput['creditReports'][number]): RichPayload | null {
  const raw = report.rawPayload as { rich?: RichPayload } | null;
  return raw?.rich?.accounts ? raw.rich : null;
}

function readRichPayload(creditReports: CreditAnalysisInput['creditReports']) {
  for (const report of creditReports) {
    const rich = richOf(report);
    if (rich) return rich;
  }
  return null;
}

/**
 * Tradeline rows that the rich extraction cannot already account for.
 * Every upload stores the same rich payload on each of its bureau rows and
 * derives its Tradeline rows from it, so re-adding those rows would duplicate
 * every account, and rows from older uploads would resurrect stale accounts.
 * Only rows from reports without a rich payload (manual entry, legacy
 * imports) pulled at or after the newest rich upload are unioned in.
 */
function supplementalReports(creditReports: CreditAnalysisInput['creditReports']): CreditAnalysisInput['creditReports'] {
  const richReports = creditReports.filter((r) => richOf(r));
  if (!richReports.length) return creditReports;
  const newestRich = Math.max(...richReports.map((r) => new Date(r.pulledAt ?? 0).getTime()));
  return creditReports.filter((r) => !richOf(r) && new Date(r.pulledAt ?? 0).getTime() >= newestRich);
}

function buildAccountsFromTradelines(creditReports: CreditAnalysisInput['creditReports']): ExtractedAccount[] {
  // Fallback path: derive minimal AccountDetail entries from legacy Tradeline
  // rows when richPayload is absent (older uploads pre-rich-extractor).
  const byKey = new Map<string, ExtractedAccount>();
  for (const report of creditReports) {
    const bureauKey = PRISMA_TO_KEY[report.bureau];
    if (!bureauKey) continue;
    for (const t of report.tradelines || []) {
      const statusText = `${t.status || ''} ${t.accountType || ''}`;
      const inferredNegative = t.isNegative || NEGATIVE_SIGNAL.test(statusText);
      const inferredCategory: AccountCategory = /inquir/i.test(statusText)
        ? 'inquiry'
        : /collection/i.test(statusText)
          ? 'collection'
          : /charge[\s-]?off/i.test(statusText)
            ? 'charge_off'
            : inferredNegative ? 'late_payment' : 'positive';
      const key = `${t.creditorName.toUpperCase()}|${t.accountNumber || ''}|${inferredCategory}`;
      let entry = byKey.get(key);
      if (!entry) {
        entry = {
          creditorName: t.creditorName,
          category: inferredCategory,
          isNegative: inferredNegative && inferredCategory !== 'inquiry',
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
      if (inferredNegative && inferredCategory !== 'inquiry') entry.isNegative = true;
    }
  }
  return Array.from(byKey.values());
}

function normalizedAccountName(value: string | null | undefined): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function reliableAccountNumber(value: string | null | undefined): string | null {
  const normalized = String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  return normalized && !/^0+$/.test(normalized) ? normalized : null;
}

function accountBalance(account: ExtractedAccount): number | null {
  const fields = account.experian || account.equifax || account.transunion;
  return fields?.balanceOwed ?? null;
}

/**
 * Union rich extraction with persisted bureau tradelines. The rich model is
 * useful for payment grids, but it must not be allowed to hide a tradeline
 * that the bureau rows already contain. Matching uses account number plus
 * balance/category when available so two loans sharing a suffix are not
 * silently collapsed.
 */
function mergeExtractedAccounts(accounts: ExtractedAccount[]): ExtractedAccount[] {
  const merged = new Map<string, ExtractedAccount>();
  for (const account of accounts) {
    const fields = account.experian || account.equifax || account.transunion;
    const number = reliableAccountNumber(fields?.accountNumber);
    const balance = accountBalance(account);
    const category = account.category || 'unknown';
    const identity = number && balance !== null
      ? `number:${number}|balance:${balance}`
      : number
        ? `number:${number}|category:${category}`
      : `name:${normalizedAccountName(account.creditorName)}|category:${category}`;
    const existing = merged.get(identity);
    if (!existing) {
      merged.set(identity, { ...account });
      continue;
    }
    const combined: ExtractedAccount = { ...existing, isNegative: existing.isNegative || account.isNegative };
    for (const bureau of BUREAU_KEYS) {
      const current = existing[bureau];
      const incoming = account[bureau];
      if (!current && incoming) combined[bureau] = incoming;
      else if (current && incoming) combined[bureau] = { ...incoming, ...current };
    }
    if ((!combined.paymentHistory || combined.paymentHistory.months.length === 0) && account.paymentHistory) {
      combined.paymentHistory = account.paymentHistory;
    }
    merged.set(identity, combined);
  }
  return Array.from(merged.values());
}

const NEGATIVE_CATEGORIES = new Set<AccountCategory>(['collection', 'charge_off', 'late_payment', 'derogatory', 'public_record']);
const NEGATIVE_SIGNAL = /(?:collection|charge[\s-]?off|repossession|\brepo\b|foreclos|past[ -]?due|delinquen|derogatory|settled[ -]?for less|included in (?:bankruptcy|bk)|\b(?:30|60|90|120|150)\s*(?:day|days)?\s*late\b|late payment)/i;
const POSITIVE_SIGNAL = /(?:no late|never late|paid as agreed|current|positive|on time)/i;

function inferredCategory(account: ExtractedAccount): AccountCategory {
  if (account.category === 'inquiry') return 'inquiry';
  if (NEGATIVE_CATEGORIES.has(account.category)) return account.category;
  const fields = [account.experian, account.equifax, account.transunion].filter(Boolean) as BureauAccountFields[];
  const text = fields.map((f) => [f.accountType, f.accountStatus, f.paymentStatus, f.accountRating, f.comments, f.accountDescription].filter(Boolean).join(' ')).join(' ');
  if (/collection/i.test(text)) return 'collection';
  if (/charge[\s-]?off/i.test(text)) return 'charge_off';
  if (/repo|foreclos|judg|lien|bankrupt|derogatory|settled[ -]?for less/i.test(text)) return 'derogatory';
  if (/past[ -]?due|delinquen|late|\b(?:30|60|90|120|150)\s*(?:day|days)?\s*late\b/i.test(text)) return 'late_payment';
  const history = account.paymentHistory;
  if (history && [...history.experian, ...history.equifax, ...history.transunion].some((cell) => /^(30|60|90|120|150|CO)$/i.test(String(cell || '').trim()))) return 'late_payment';
  return account.category;
}

function normalizeAccountClassification(account: ExtractedAccount): ExtractedAccount {
  const category = inferredCategory(account);
  const fields = [account.experian, account.equifax, account.transunion].filter(Boolean) as BureauAccountFields[];
  const text = fields.map((f) => [f.accountStatus, f.paymentStatus, f.accountRating, f.comments, f.accountDescription].filter(Boolean).join(' ')).join(' ');
  const historicalLate = account.paymentHistory && [...account.paymentHistory.experian, ...account.paymentHistory.equifax, ...account.paymentHistory.transunion].some((cell) => /^(30|60|90|120|150|CO)$/i.test(String(cell || '').trim()));
  const explicitLate = /\b(?:30|60|90|120|150)\s*(?:day|days)?\s*late\b/i.test(text);
  const pastDue = fields.some((f) => typeof f.pastDueAmount === 'number' && f.pastDueAmount > 0);
  const negative = category !== 'inquiry' && (account.isNegative || NEGATIVE_CATEGORIES.has(category) || Boolean(historicalLate) || pastDue || (NEGATIVE_SIGNAL.test(text) && (!POSITIVE_SIGNAL.test(text) || explicitLate)));
  return { ...account, category, isNegative: negative };
}

function buildInquiryDetails(accounts: ExtractedAccount[]): InquiryDetail[] {
  return accounts
    .filter((account) => account.category === 'inquiry')
    .map((account) => {
      const bureaus = BUREAU_KEYS.filter((bureau) => Boolean(account[bureau]));
      const dates: Partial<Record<BureauKey, string | null>> = {};
      const purpose: Partial<Record<BureauKey, string | null>> = {};
      for (const bureau of bureaus) {
        dates[bureau] = account[bureau]?.dateReported || account[bureau]?.dateOfLastActivity || null;
        purpose[bureau] = account[bureau]?.comments || account[bureau]?.accountDescription || null;
      }
      const primary = account.experian || account.equifax || account.transunion;
      return { creditorName: account.creditorName, accountNumber: primary?.accountNumber || null, bureaus, dates, purpose };
    });
}

function detectInconsistencies(account: ExtractedAccount): string[] {
  const found: string[] = [];
  const reportingBureaus = BUREAU_KEYS.filter((bureau) => Boolean(account[bureau]));
  if (account.isNegative && reportingBureaus.length > 0 && reportingBureaus.length < BUREAU_KEYS.length) {
    found.push('bureauCoverage');
  }
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
  const history = account.paymentHistory;
  if (history?.months?.length) {
    for (let i = 0; i < history.months.length; i += 1) {
      const values = [history.experian[i], history.equifax[i], history.transunion[i]]
        .filter((value): value is string => value !== null && value !== undefined && value !== '');
      if (values.length >= 2 && new Set(values.map((value) => value.trim().toUpperCase())).size > 1) {
        found.push(`paymentHistory:${history.months[i]}`);
      }
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
  const categorized = accounts.map((account) => ({ account, category: categorizeAccount(account) }));
  const duplicates = detectDuplicateDebts(categorized);
  for (const [i, { account: acc, category }] of categorized.entries()) {
    const inconsistencies = detectInconsistencies(acc);
    const detail: AccountDetail = {
      creditorName: acc.creditorName,
      category,
      isNegative: acc.isNegative,
      experian: acc.experian,
      equifax: acc.equifax,
      transunion: acc.transunion,
      paymentHistory: acc.paymentHistory,
      inconsistencies,
      accuracyFlags: [...detectAccuracyFlags(acc, category), ...(duplicates.get(i) || [])]
    };
    if (acc.isNegative) negative.push(detail);
    else positive.push(detail);
  }
  return { negative, positive };
}

const ACCURACY_REASONS: Record<AccuracyFlag['lens'], string> = {
  date: 'The reported dates are internally impossible or inconsistent. Dates control how long an item may report and how it is scored, so the record is inaccurate as reported and must be corrected or deleted if it cannot be verified.',
  balance: 'The balance, past-due, or payment fields contradict each other or the account status. An account cannot be accurately reported with amounts that conflict with its own status; request verification of the exact figures.',
  status: 'The account status contradicts other fields in the same record. Request that the bureau verify which status is accurate and correct the record.',
  comment: 'The creditor remark does not match the account data. Remarks must be accurate and current; request that the remark be verified and updated or removed.',
  obsolete: 'Negative information may not be reported more than 7 years plus 180 days after the date of first delinquency (FCRA § 605(c)). Request deletion of the obsolete item.',
  reaging: 'The activity or delinquency date appears to have been moved later than the payment record supports. Re-aging extends reporting beyond the legal period; request verification of the original date of first delinquency.',
  payment_history: 'The month-by-month payment grid contradicts the account dates or status. Late marks reported outside the life of the account, or against a never-late status, are inaccurate.',
  duplicate: 'The same debt appears to be reported more than once with a balance on each listing, which overstates what is owed. Request that the duplicate be deleted or its balance reported as $0.',
  incomplete: 'The negative item is missing key fields. An incomplete record cannot be fully verified; request that the bureau complete it with verified data or delete it.'
};

function buildDisputeOpportunities(details: AccountDetail[]): DisputeOpportunity[] {
  const ops: DisputeOpportunity[] = [];

  for (const d of details) {
    // Inquiries have their own review lane. Do not let bureau-field differences
    // crowd the tradeline dispute queue or imply that every inquiry is unauthorized.
    if (d.category === 'inquiry') continue;
    if (!d.isNegative && d.inconsistencies.length === 0) continue;

    const fields = d.experian || d.equifax || d.transunion;
    const reportingBureaus = BUREAU_KEYS.filter(k => d[k] !== null);

    // Payment-grid mismatches are grouped into one dispute per account so a
    // letter lists the months together instead of one line per month.
    const historyMonths = d.inconsistencies.filter((k) => k.startsWith('paymentHistory:'));
    if (historyMonths.length) {
      const history = d.paymentHistory;
      const monthText = historyMonths.map((key) => {
        const month = key.slice('paymentHistory:'.length);
        const index = history?.months.findIndex((label) => label === month) ?? -1;
        const cells = BUREAU_KEYS
          .filter((k) => index >= 0 && history?.[k]?.[index])
          .map((k) => `${BUREAU_DISPLAY[k]} ${history![k][index]}`)
          .join(', ');
        return `${month} (${cells})`;
      });
      ops.push({
        accountName: d.creditorName,
        accountNumber: fields?.accountNumber ?? null,
        issue: `payment history disagrees across bureaus for ${historyMonths.length} month${historyMonths.length === 1 ? '' : 's'}: ${monthText.join('; ')}`,
        bureaus: reportingBureaus,
        reason: 'The same furnisher reports a different payment status for the same month to different bureaus. At most one version can be accurate; request that each bureau verify the month-by-month history and correct or delete the late marks that cannot be verified.',
        priority: 'high',
        fieldKey: 'paymentHistory'
      });
    }

    // One dispute per remaining cell-level inconsistency
    for (const fieldKey of d.inconsistencies.filter((k) => !k.startsWith('paymentHistory:'))) {
      const values: Partial<Record<BureauKey, string | number | null>> = {};
      let fieldLabel = FIELD_LABELS[fieldKey] || fieldKey;
      if (fieldKey.startsWith('paymentHistory:')) {
        const month = fieldKey.slice('paymentHistory:'.length);
        const history = d.paymentHistory;
        const index = history?.months.findIndex((label) => label === month) ?? -1;
        for (const k of BUREAU_KEYS) {
          const row = history?.[k];
          if (index >= 0 && row?.[index] !== undefined) values[k] = row[index];
        }
        fieldLabel = `payment history (${month})`;
      } else if (fieldKey === 'bureauCoverage') {
        fieldLabel = 'bureau reporting coverage';
        for (const k of BUREAU_KEYS) values[k] = d[k] ? 'reported' : 'not reported';
      } else {
        for (const k of BUREAU_KEYS) {
          const v = (d[k] as Record<string, unknown> | null)?.[fieldKey];
          if (v !== undefined) values[k] = v as string | number | null;
        }
      }
      const valueText = BUREAU_KEYS
        .filter(k => values[k] !== undefined)
        .map(k => `${BUREAU_DISPLAY[k]}: ${values[k] ?? '—'}`)
        .join(' / ');
      ops.push({
        accountName: d.creditorName,
        accountNumber: fields?.accountNumber ?? null,
        issue: fieldKey === 'bureauCoverage'
          ? `negative item is reported to only ${reportingBureaus.length} of 3 bureaus (${valueText})`
          : `${fieldLabel} disagrees across bureaus (${valueText})`,
        bureaus: reportingBureaus,
        reason: fieldKey === 'bureauCoverage'
          ? 'Coverage alone is not an inaccuracy, but it means only the listed bureau(s) can be asked to verify this item. Compare the fields that are reported for accuracy and completeness.'
          : `Inconsistent reporting on ${fieldLabel}. Verify the underlying record and request correction only of any inaccurate, incomplete, duplicated, or unverifiable bureau-specific reporting.`,
        priority: fieldKey === 'bureauCoverage' ? 'low' : 'high',
        fieldKey,
        perBureauValues: values
      });
    }

    // Errors inside one bureau's record: sent only to the bureau(s) carrying them.
    if (d.isNegative) {
      const byCode = new Map<string, AccuracyFlag[]>();
      for (const flag of d.accuracyFlags) byCode.set(flag.code, [...(byCode.get(flag.code) || []), flag]);
      for (const [code, flags] of byCode) {
        const flagBureaus = Array.from(new Set(flags.map((f) => f.bureau).filter((b): b is BureauKey => b !== null)));
        ops.push({
          accountName: d.creditorName,
          accountNumber: fields?.accountNumber ?? null,
          issue: Array.from(new Set(flags.map((f) => f.detail))).join(' '),
          bureaus: flagBureaus.length ? flagBureaus : reportingBureaus,
          reason: ACCURACY_REASONS[flags[0].lens],
          priority: flags.some((f) => f.severity === 'high') ? 'high' : flags.some((f) => f.severity === 'medium') ? 'medium' : 'low',
          fieldKey: `rule:${code}`
        });
      }
    }

    // If negative with no specific finding, still queue a verification review
    if (d.isNegative && d.inconsistencies.length === 0 && d.accuracyFlags.length === 0) {
      ops.push({
        accountName: d.creditorName,
        accountNumber: fields?.accountNumber ?? null,
        issue: `${categorizeAccount({ ...d, experian: d.experian, equifax: d.equifax, transunion: d.transunion } as ExtractedAccount).replace('_', ' ')} reported negatively`,
        bureaus: reportingBureaus,
        reason: 'Review the item for accuracy, completeness, and verifiability. Request correction only for a supported factual error; accurate negative information is not disputable merely because it is adverse.',
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
  const accuracyFlagCount = details.filter(d => d.isNegative).reduce((sum, d) => sum + d.accuracyFlags.length, 0);
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
    `- ${accuracyFlagCount} date, balance, status, or comment error${accuracyFlagCount === 1 ? '' : 's'} found inside individual bureau records`,
    `- ${disputeCount} dispute opportunit${disputeCount === 1 ? 'y' : 'ies'} ready to file`,
    ``,
    `## What that means for you`,
    `A difference between bureaus is a review lead, not automatic proof of a legal violation. We will identify the exact field, compare the underlying records, and use the FCRA reinvestigation process for supported inaccuracies. Negative items reported identically still must be accurate, complete, and verifiable; accurate negative information is not removed solely because it is unfavorable.`,
    ``,
    `## Estimated timeline`,
    `**${timeline} working window** based on the volume of items. We'll move bureau-by-bureau in 30-day reinvestigation rounds, then escalate to furnishers and CFPB for anything that comes back "verified."`,
    ``,
    `*Educational and strategic planning purposes. Results vary by individual file and bureau response.*`
  ].join('\n');
}

const EDUCATION_SECTION = `
### Understanding Your Credit Report

**Three bureaus, three different files.** Equifax, Experian, and TransUnion each maintain a separate report on you. Furnishers do not always report the same data to all three, so a difference is a review lead. It becomes a dispute issue when the reported field is inaccurate, incomplete, duplicated, or unverifiable.

**Five score factors:**
- **Payment History (35%)** — late payments, collections, charge-offs hit the hardest
- **Credit Utilization (30%)** — keep balances below 30% of limits, ideally under 10%
- **Length of History (15%)** — older accounts help; do not close your oldest cards
- **Credit Mix (10%)** — a blend of revolving and installment is rewarded
- **New Credit (10%)** — too many recent inquiries cause small, temporary dips

**Your rights under the FCRA:**
- You can dispute any inaccurate, incomplete, or unverifiable item
- Bureaus must reinvestigate within 30 days
- If an item cannot be verified as accurate and complete, it should be corrected or deleted
- You can request method-of-verification details from the bureau

**What makes an item challengeable:**
- Inaccurate balance, status, or dates
- Reporting that differs across bureaus
- Accounts you don't recognize (potential mixed file or identity theft)
- Duplicate listings of the same account
- Missing collector disclosures or out-of-statute attempts to collect
`.trim();

export interface ReportSubject {
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  address: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  dateOfBirth: string | null;
}

function parseUsAddress(raw: string | null): { line1: string | null; city: string | null; state: string | null; postal: string | null } {
  if (!raw) return { line1: null, city: null, state: null, postal: null };
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  const m = cleaned.match(/^(.+?),\s*([^,]+),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)$/i);
  if (m) return { line1: m[1].trim(), city: m[2].trim(), state: m[3].toUpperCase(), postal: m[4] };
  const loose = cleaned.match(/^(.*?)\s+([A-Za-z .'-]+)\s+([A-Z]{2})\s*(\d{5}(?:-\d{4})?)$/);
  if (loose) return { line1: loose[1].trim(), city: loose[2].trim(), state: loose[3].toUpperCase(), postal: loose[4] };
  return { line1: cleaned, city: null, state: null, postal: null };
}

export function deriveReportSubject(profile: PersonalProfile): ReportSubject {
  const cols = [profile.experian, profile.equifax, profile.transunion].filter(Boolean) as Array<NonNullable<PersonalProfile['experian']>>;
  const pickName = cols.map(c => c?.name).find(v => typeof v === 'string' && v.trim().length > 0) || null;
  const pickAddress = cols.map(c => c?.currentAddress).find(v => typeof v === 'string' && v.trim().length > 0) || null;
  const pickDob = cols.map(c => c?.dateOfBirth).find(v => typeof v === 'string' && v.trim().length > 0) || null;
  let firstName: string | null = null;
  let lastName: string | null = null;
  if (pickName) {
    const parts = pickName.replace(/\s+/g, ' ').trim().split(' ');
    if (parts.length === 1) { firstName = parts[0]; }
    else { firstName = parts.slice(0, -1).join(' '); lastName = parts[parts.length - 1]; }
  }
  const addr = parseUsAddress(pickAddress);
  return {
    name: pickName,
    firstName,
    lastName,
    address: pickAddress,
    addressLine1: addr.line1,
    city: addr.city,
    state: addr.state,
    postalCode: addr.postal,
    dateOfBirth: pickDob,
  };
}

export class CreditAnalysisService {
  static generate(input: CreditAnalysisInput): CreditAnalysis {
    const { client, creditReports } = input;
    const now = new Date().toISOString();

    const rich = readRichPayload(creditReports);
    const extractedRows = buildAccountsFromTradelines(supplementalReports(creditReports));
    // Never let a partial AI extraction suppress bureau tradeline rows. Union
    // both sources, then classify from status/comments/history deterministically.
    const accounts: ExtractedAccount[] = mergeExtractedAccounts([
      ...(rich?.accounts || []),
      ...extractedRows
    ]).map(normalizeAccountClassification);

    const personalProfile: PersonalProfile = rich?.personalProfile ?? {
      experian: null, equifax: null, transunion: null, publicRecords: []
    };
    const reportSubject = deriveReportSubject(personalProfile);

    const bureauScores: BureauScoreSnapshot[] = rich?.scores ?? [];

    const tiles = buildSummaryTiles(accounts);
    const bureauSummaries = buildBureauSummaries(accounts);
    const keyFactors = buildKeyFactors(accounts);
    const negativesByCategory = buildNegativesByCategory(accounts);
    const ficoFactors = buildFicoFactors(accounts, tiles);
    const { negative, positive } = buildAccountDetails(accounts);
    const inquiries = buildInquiryDetails(accounts);
    const personalInfoFlags = detectPersonalInfoFlags(personalProfile);
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
    for (const d of negative) {
      if (d.accuracyFlags.length === 0) continue;
      const high = d.accuracyFlags.some((f) => f.severity === 'high');
      keyFindings.push({
        id: generateId(),
        category: d.accuracyFlags.some((f) => f.lens === 'duplicate') ? 'duplicate'
          : d.accuracyFlags.some((f) => f.lens === 'obsolete') ? 'stale_info' : 'challengeable',
        severity: high ? 'high' : 'medium',
        title: `Reporting Error: ${d.creditorName}`,
        description: d.accuracyFlags.map((f) => f.detail).join(' '),
        bureausAffected: Array.from(new Set(d.accuracyFlags.map((f) => f.bureau).filter((b): b is BureauKey => b !== null))),
        accounts: [d.creditorName],
        recommendation: ACCURACY_REASONS[d.accuracyFlags[0].lens]
      });
    }
    if (personalInfoFlags.length) {
      keyFindings.push({
        id: generateId(),
        category: 'inconsistency',
        severity: 'medium',
        title: 'Personal Information Mismatch',
        description: personalInfoFlags.map((f) => f.detail).join(' '),
        bureausAffected: BUREAU_KEYS,
        recommendation: 'Correct personal information first: mismatched names, dates of birth, or addresses can indicate a mixed file, which is where accounts that do not belong to the consumer come from.'
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
      analysisEngineVersion: ANALYSIS_ENGINE_VERSION,
      generatedAt: now,
      branding: {
        companyName: process.env.BRAND_COMPANY_NAME || 'CredX',
        email: process.env.BRAND_CONTACT_EMAIL || null,
        phone: process.env.BRAND_PHONE || null,
        website: process.env.BRAND_WEBSITE || null
      },
      clientProfile: {
        name: reportSubject.name || `${client.user.firstName} ${client.user.lastName}`.trim() || 'Consumer',
        email: client.user.email,
        dob: reportSubject.dateOfBirth || (client.dobEncrypted ? '(on file, encrypted)' : null),
        ssnLast4: client.ssnLast4,
        address: reportSubject.address || ([client.currentAddressLine1, client.currentCity, client.currentState, client.currentPostalCode].filter(Boolean).join(', ') || null),
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
      inquiries,
      personalInfoFlags,
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
