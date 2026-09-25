import type { BureauAccountFields, ExtractedAccount, PersonalProfile } from './reportExtractor.js';

// =====================================================================
// Single-bureau accuracy rules.
// Cross-bureau disagreements are detected in creditAnalysis.ts. These rules
// catch errors that exist INSIDE one bureau's record (impossible dates,
// balances that contradict the status, obsolete items, re-aging, duplicate
// debts), so an item reported identically by all three bureaus, or by only
// one bureau, is still checked field by field.
// =====================================================================

export type BureauKey = 'experian' | 'equifax' | 'transunion';

export type AccuracyLens =
  | 'date'
  | 'balance'
  | 'status'
  | 'comment'
  | 'obsolete'
  | 'reaging'
  | 'payment_history'
  | 'duplicate'
  | 'incomplete';

export interface AccuracyFlag {
  /** Stable rule id, e.g. "past_due_exceeds_balance". */
  code: string;
  lens: AccuracyLens;
  /** Bureau whose record carries the error; null when it spans accounts. */
  bureau: BureauKey | null;
  severity: 'high' | 'medium' | 'low';
  /** Plain-English statement of what was observed, with the reported values. */
  detail: string;
}

const BUREAU_KEYS: BureauKey[] = ['experian', 'equifax', 'transunion'];
const BUREAU_LABEL: Record<BureauKey, string> = { experian: 'Experian', equifax: 'Equifax', transunion: 'TransUnion' };

const DAY_MS = 24 * 3600 * 1000;
/** FCRA § 605(c): 7 years from the date of first delinquency + 180 days. */
const OBSOLESCENCE_MS = (7 * 365.25 + 180) * DAY_MS;
/** Tolerance so a report dated a few days after a field date is not flagged. */
const DATE_SLACK_MS = 31 * DAY_MS;

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

/** Parses the date shapes credit reports actually use; null when unparseable. */
export function parseReportDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const s = String(value).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, m[3] ? +m[3] : 1));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) return new Date(Date.UTC(fullYear(+m[3]), +m[1] - 1, +m[2]));
  m = s.match(/^(\d{1,2})\/(\d{2,4})$/);
  if (m) return new Date(Date.UTC(fullYear(+m[2]), +m[1] - 1, 1));
  m = s.match(/^([A-Za-z]{3})[A-Za-z]*\.?\s*'?(\d{2}|\d{4})$/);
  if (m && MONTHS[m[1].toLowerCase()] !== undefined) return new Date(Date.UTC(fullYear(+m[2]), MONTHS[m[1].toLowerCase()], 1));
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t) : null;
}

function fullYear(y: number): number {
  if (y >= 100) return y;
  return y + (y > 50 ? 1900 : 2000);
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function money(n: number): string {
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function num(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

const LATE_CELL = /^(30|60|90|120|150|180|CO|C\/O|CHARGE ?OFF|COL|FC|RP|VS)$/i;

const PAID_OR_SETTLED = /\b(paid in full|paid collection|paid charge[\s-]?off|paid[, ]+closed|settled|paid for less|zero balance|\$0 balance)\b/i;
const CURRENT_STATUS = /\b(current|pays? as agreed|paid as agreed|never late|ok)\b/i;
const DEROG_STATUS = /\b(collection|charge[\s-]?off|charged off|repossess|foreclos)\b/i;
const HISTORY_OF_LATE = /\bwas\s+(?:\d+|a)\b|\bpreviously\b|\bformerly\b/i;
const CLOSED_TEXT = /\bclosed\b/i;
const OPEN_STATUS = /^\s*open\b/i;
const DISPUTE_TEXT = /\bdisput/i;
const BANKRUPTCY_TEXT = /\b(included in (?:ch(?:apter)?\.?\s*\d+\s*)?bankruptcy|included in bk|discharged in bankruptcy|bankruptcy discharged)\b/i;
const REVOLVING = /revolv|credit card|charge card|line of credit|flex/i;

type DerivedCategory = ExtractedAccount['category'];

function allText(f: BureauAccountFields): string {
  return [f.accountStatus, f.paymentStatus, f.accountRating, f.comments, f.accountDescription].filter(Boolean).join(' ');
}

interface MonthCell { month: string; date: Date | null; code: string }

function lateCells(account: ExtractedAccount, bureau: BureauKey): MonthCell[] {
  const history = account.paymentHistory;
  if (!history?.months?.length) return [];
  const row = history[bureau] || [];
  const out: MonthCell[] = [];
  history.months.forEach((month, i) => {
    const code = String(row[i] ?? '').trim();
    if (code && LATE_CELL.test(code)) out.push({ month, date: parseReportDate(month), code });
  });
  return out;
}

/** Earliest reported delinquency: the start of the § 605 reporting clock. */
function firstDelinquency(account: ExtractedAccount, bureau: BureauKey, f: BureauAccountFields, category: DerivedCategory): { date: Date; source: string } | null {
  const dated = lateCells(account, bureau).filter((c) => c.date).sort((a, b) => a.date!.getTime() - b.date!.getTime());
  if (dated.length) return { date: dated[0].date!, source: `first late mark in payment history (${dated[0].month})` };
  // Without a payment grid, date of last activity is the closest proxy the
  // bureaus print for a collection or charge-off's delinquency date.
  if (category === 'collection' || category === 'charge_off' || category === 'derogatory') {
    const dla = parseReportDate(f.dateOfLastActivity);
    if (dla) return { date: dla, source: 'date of last activity' };
  }
  return null;
}

function checkBureauRecord(account: ExtractedAccount, bureau: BureauKey, f: BureauAccountFields, category: DerivedCategory, now: Date): AccuracyFlag[] {
  const flags: AccuracyFlag[] = [];
  const b = BUREAU_LABEL[bureau];
  const add = (code: string, lens: AccuracyLens, severity: AccuracyFlag['severity'], detail: string) =>
    flags.push({ code, lens, bureau, severity, detail: `${b}: ${detail}` });

  const opened = parseReportDate(f.dateOpened);
  const reported = parseReportDate(f.dateReported);
  const closed = parseReportDate(f.closedDate);
  const lastActivity = parseReportDate(f.dateOfLastActivity);
  const lastPayment = parseReportDate(f.dateOfLastPayment);
  const asOf = reported && reported.getTime() < now.getTime() ? now : (reported ?? now);

  // ---- Dates -------------------------------------------------------
  const dated: Array<[string, Date | null]> = [
    ['date opened', opened], ['date reported', reported], ['closed date', closed],
    ['date of last activity', lastActivity], ['date of last payment', lastPayment]
  ];
  for (const [label, d] of dated) {
    if (d && d.getTime() > asOf.getTime() + DATE_SLACK_MS) {
      add('future_date', 'date', 'high', `${label} ${fmt(d)} is in the future.`);
    }
  }
  if (opened) {
    for (const [label, d] of dated) {
      if (label === 'date opened' || !d) continue;
      if (d.getTime() + DATE_SLACK_MS < opened.getTime()) {
        add('date_before_opened', 'date', 'high', `${label} ${fmt(d)} is earlier than the date opened ${fmt(opened)}.`);
      }
    }
  }
  if (reported && lastPayment && lastPayment.getTime() > reported.getTime() + DATE_SLACK_MS) {
    add('payment_after_reported', 'date', 'medium', `date of last payment ${fmt(lastPayment)} is after the date reported ${fmt(reported)}.`);
  }
  if (closed && OPEN_STATUS.test(f.accountStatus || '')) {
    add('open_with_closed_date', 'status', 'medium', `status is "${f.accountStatus}" but a closed date of ${fmt(closed)} is reported.`);
  }

  // ---- Payment history vs. account life ----------------------------
  for (const cell of lateCells(account, bureau)) {
    if (!cell.date) continue;
    if (opened && cell.date.getTime() + DATE_SLACK_MS < opened.getTime()) {
      add('late_before_opened', 'payment_history', 'high', `late mark "${cell.code}" in ${cell.month} predates the date opened ${fmt(opened)}.`);
    }
    if (closed && cell.date.getTime() > closed.getTime() + DATE_SLACK_MS && !/^(CO|C\/O|COL)$/i.test(cell.code)) {
      add('late_after_closed', 'payment_history', 'high', `late mark "${cell.code}" in ${cell.month} is after the account closed ${fmt(closed)}.`);
    }
  }
  const lates = lateCells(account, bureau);
  if (lates.length && /never late|no late/i.test(allText(f))) {
    add('never_late_with_late_marks', 'payment_history', 'high', `status/comments say never late, but the payment grid shows ${lates.length} late mark(s) (${lates.slice(0, 4).map((c) => `${c.month}: ${c.code}`).join(', ')}).`);
  }

  // ---- Obsolescence and re-aging -----------------------------------
  const dofd = account.isNegative ? firstDelinquency(account, bureau, f, category) : null;
  if (dofd && now.getTime() - dofd.date.getTime() > OBSOLESCENCE_MS) {
    add('obsolete_7_year', 'obsolete', 'high', `delinquency began ${fmt(dofd.date)} (${dofd.source}); negative reporting past 7 years + 180 days from that date is obsolete under FCRA § 605.`);
  }
  if ((category === 'collection' || category === 'charge_off') && lastActivity && lastPayment
      && lastActivity.getTime() - lastPayment.getTime() > 180 * DAY_MS) {
    add('possible_reaging', 'reaging', 'high', `date of last activity ${fmt(lastActivity)} is ${Math.round((lastActivity.getTime() - lastPayment.getTime()) / (30 * DAY_MS))} months after the last payment ${fmt(lastPayment)}; the activity date may have been re-aged, which restarts the apparent age of the debt.`);
  }
  if (category === 'collection' && opened && lastActivity && lastActivity.getTime() > opened.getTime() + DATE_SLACK_MS && !lastPayment) {
    add('collection_activity_after_placement', 'reaging', 'medium', `collection shows activity ${fmt(lastActivity)} after placement ${fmt(opened)} with no payment reported; confirm the delinquency date was not moved forward.`);
  }

  // ---- Balances ----------------------------------------------------
  const balance = num(f.balanceOwed);
  const pastDue = num(f.pastDueAmount);
  const high = num(f.highBalance);
  const payment = num(f.paymentAmount);
  const text = allText(f);

  if (pastDue !== null && pastDue > 0 && balance !== null && pastDue > balance + 1) {
    add('past_due_exceeds_balance', 'balance', 'high', `past due ${money(pastDue)} is larger than the balance ${money(balance)}.`);
  }
  if (balance !== null && balance > 1 && PAID_OR_SETTLED.test(text)) {
    add('paid_with_balance', 'balance', 'high', `reported as paid/settled ("${(text.match(PAID_OR_SETTLED) || [''])[0]}") but still shows a balance of ${money(balance)}.`);
  }
  if (pastDue !== null && pastDue > 0 && PAID_OR_SETTLED.test(text)) {
    add('paid_with_past_due', 'balance', 'high', `reported as paid/settled but still shows ${money(pastDue)} past due.`);
  }
  if (pastDue !== null && pastDue > 0 && CURRENT_STATUS.test(f.paymentStatus || '') && !HISTORY_OF_LATE.test(f.paymentStatus || '')) {
    add('current_with_past_due', 'balance', 'high', `payment status "${f.paymentStatus}" contradicts a past-due amount of ${money(pastDue)}.`);
  }
  if (balance !== null && high !== null && high > 0 && balance > high + 1 && !REVOLVING.test(f.accountType || '')) {
    add('balance_exceeds_high_balance', 'balance', category === 'collection' || category === 'charge_off' ? 'high' : 'medium', `balance ${money(balance)} is higher than the original/high balance ${money(high)}; verify any added interest or fees are permitted.`);
  }
  if (payment !== null && payment > 0 && (category === 'collection' || category === 'charge_off' || closed || CLOSED_TEXT.test(f.accountStatus || ''))) {
    add('closed_with_monthly_payment', 'balance', 'medium', `${category === 'collection' ? 'collection' : category === 'charge_off' ? 'charged-off' : 'closed'} account still reports a scheduled monthly payment of ${money(payment)}.`);
  }
  if (BANKRUPTCY_TEXT.test(text) && ((balance !== null && balance > 1) || (pastDue !== null && pastDue > 0))) {
    add('bankruptcy_with_balance', 'balance', 'high', `account is marked as included in/discharged in bankruptcy but still reports ${balance && balance > 1 ? `a balance of ${money(balance)}` : `${money(pastDue || 0)} past due`}.`);
  }

  // ---- Status and comments -----------------------------------------
  if (CURRENT_STATUS.test(f.paymentStatus || '') && !HISTORY_OF_LATE.test(f.paymentStatus || '')
      && DEROG_STATUS.test([f.accountStatus, f.accountRating].filter(Boolean).join(' '))) {
    add('status_contradiction', 'status', 'high', `payment status "${f.paymentStatus}" contradicts account status/rating "${[f.accountStatus, f.accountRating].filter(Boolean).join(' / ')}".`);
  }
  if (CLOSED_TEXT.test(f.comments || '') && OPEN_STATUS.test(f.accountStatus || '')) {
    add('comment_closed_status_open', 'comment', 'medium', `comments say "${f.comments}" but the status is "${f.accountStatus}".`);
  }
  if (DISPUTE_TEXT.test(f.comments || '') || DISPUTE_TEXT.test(f.disputeStatus || '')) {
    add('dispute_remark', 'comment', 'medium', `carries a dispute remark ("${f.disputeStatus || f.comments}"). If a prior dispute is resolved the remark must be updated (FCRA § 623(a)(3)); if the dispute is still open, the item is reported as disputed and should be checked for completeness.`);
  }

  // ---- Missing fields on a negative item ---------------------------
  if (account.isNegative) {
    const missing: string[] = [];
    if (!f.dateOpened) missing.push('date opened');
    if (!f.accountNumber) missing.push('account number');
    if ((category === 'collection' || category === 'charge_off') && !f.dateOfLastActivity && !lates.length) missing.push('date of last activity / first delinquency');
    if (balance === null && category !== 'late_payment') missing.push('balance');
    if (missing.length) {
      add('incomplete_negative', 'incomplete', missing.some((m) => m.startsWith('date')) ? 'high' : 'medium', `negative item is missing ${missing.join(', ')}; an incomplete record cannot be fully verified.`);
    }
  }

  return flags;
}

/** Per-account accuracy flags from each bureau's own record. */
export function detectAccuracyFlags(account: ExtractedAccount, category: DerivedCategory, now: Date = new Date()): AccuracyFlag[] {
  if (category === 'inquiry') return [];
  const flags: AccuracyFlag[] = [];
  for (const bureau of BUREAU_KEYS) {
    const f = account[bureau];
    if (f) flags.push(...checkBureauRecord(account, bureau, f, category, now));
  }
  return flags;
}

function lastDigits(value: string | null | undefined): string | null {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 4 && !/^0+$/.test(digits) ? digits.slice(-4) : null;
}

function primaryBalance(account: ExtractedAccount): number | null {
  for (const bureau of BUREAU_KEYS) {
    const v = num(account[bureau]?.balanceOwed);
    if (v !== null && v > 0) return v;
  }
  return null;
}

function normName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Cross-account duplicate detection: the same debt reported twice (two
 * collectors, or an original creditor and a collector) with a live balance on
 * both. Returns flags keyed by account index.
 */
export function detectDuplicateDebts(accounts: Array<{ account: ExtractedAccount; category: DerivedCategory }>): Map<number, AccuracyFlag[]> {
  const out = new Map<number, AccuracyFlag[]>();
  const push = (i: number, flag: AccuracyFlag) => out.set(i, [...(out.get(i) || []), flag]);
  const candidates = accounts
    .map((a, i) => ({ ...a, i, balance: primaryBalance(a.account), digits: lastDigits((a.account.experian || a.account.equifax || a.account.transunion)?.accountNumber) }))
    .filter((a) => a.account.isNegative && a.category !== 'inquiry');

  for (let x = 0; x < candidates.length; x += 1) {
    for (let y = x + 1; y < candidates.length; y += 1) {
      const a = candidates[x];
      const c = candidates[y];
      if (normName(a.account.creditorName) === normName(c.account.creditorName) && a.digits === c.digits) continue;
      const debtTypes = new Set([a.category, c.category]);
      const involvesCollection = debtTypes.has('collection');
      const sameBalance = a.balance !== null && c.balance !== null && Math.abs(a.balance - c.balance) <= Math.max(1, 0.02 * Math.max(a.balance, c.balance));
      const sameDigits = a.digits !== null && a.digits === c.digits;
      if (!involvesCollection || !(sameBalance || sameDigits)) continue;
      const why = sameDigits ? `share account number ending ${a.digits}` : `carry the same balance (${money(a.balance!)} vs ${money(c.balance!)})`;
      const detail = `${a.account.creditorName} and ${c.account.creditorName} ${why}; the same debt appears to be reported twice with a live balance, which double-counts it.`;
      push(a.i, { code: 'duplicate_debt', lens: 'duplicate', bureau: null, severity: 'high', detail });
      push(c.i, { code: 'duplicate_debt', lens: 'duplicate', bureau: null, severity: 'high', detail });
    }
  }
  return out;
}

export interface PersonalInfoFlag {
  field: 'name' | 'dateOfBirth' | 'currentAddress';
  detail: string;
}

/** Name / DOB / address disagreements across bureaus: mixed-file indicators. */
export function detectPersonalInfoFlags(profile: PersonalProfile | null | undefined): PersonalInfoFlag[] {
  if (!profile) return [];
  const flags: PersonalInfoFlag[] = [];
  const fields: Array<[PersonalInfoFlag['field'], string]> = [['name', 'Name'], ['dateOfBirth', 'Date of birth'], ['currentAddress', 'Current address']];
  for (const [field, label] of fields) {
    const values = BUREAU_KEYS
      .map((k) => [k, profile[k]?.[field]] as const)
      .filter(([, v]) => typeof v === 'string' && v.trim().length > 0) as Array<readonly [BureauKey, string]>;
    const normalized = new Set(values.map(([, v]) => normName(v)));
    if (values.length >= 2 && normalized.size > 1) {
      flags.push({ field, detail: `${label} differs across bureaus (${values.map(([k, v]) => `${BUREAU_LABEL[k]}: ${v}`).join(' / ')}).` });
    }
  }
  return flags;
}
