import type { Bureau } from '@prisma/client';
import { callAiGateway, extractJsonObject } from './aiGateway.js';

// =====================================================================
// Rich per-bureau tradeline shape (mirrors a MIG-style 3-bureau analysis).
// Every field is per-bureau because that's how the report displays
// inconsistencies — the analyzer flags any cell that disagrees across
// bureaus as a disputable inaccuracy.
// =====================================================================

export type AccountCategory =
  | 'collection'
  | 'charge_off'
  | 'late_payment'
  | 'derogatory'
  | 'positive'
  | 'inquiry'
  | 'public_record'
  | 'unknown';

export interface BureauAccountFields {
  accountNumber: string | null;
  highBalance: number | null;
  lastVerified: string | null;
  dateOfLastActivity: string | null;
  dateReported: string | null;
  dateOpened: string | null;
  balanceOwed: number | null;
  closedDate: string | null;
  accountRating: string | null;
  accountDescription: string | null;
  disputeStatus: string | null;
  creditorType: string | null;
  accountStatus: string | null;
  paymentStatus: string | null;
  comments: string | null;
  paymentAmount: number | null;
  dateOfLastPayment: string | null;
  termMonths: number | null;
  pastDueAmount: number | null;
  accountType: string | null;
  paymentFrequency: string | null;
  creditLimit: number | null;
}

export interface PaymentHistoryGrid {
  /** Month labels in display order, e.g. ["Oct 23", "Nov 23", ...]. */
  months: string[];
  /** Per-bureau row of status codes, same length as months. Null = no data. */
  experian: (string | null)[];
  equifax: (string | null)[];
  transunion: (string | null)[];
}

export interface ExtractedAccount {
  creditorName: string;
  /** High-level categorization driving how the account is grouped in the UI. */
  category: AccountCategory;
  /** True for any kind of derogatory item (collections, charge-offs, lates, repos, etc). */
  isNegative: boolean;
  experian: BureauAccountFields | null;
  equifax: BureauAccountFields | null;
  transunion: BureauAccountFields | null;
  paymentHistory: PaymentHistoryGrid | null;
}

export interface BureauScoreSnapshot {
  bureau: Bureau;
  score: number | null;
  pulledAt: string | null;
}

export interface PersonalProfileBureauColumn {
  reportDate: string | null;
  name: string | null;
  alsoKnownAs: string | null;
  dateOfBirth: string | null;
  currentAddress: string | null;
  previousAddresses: string[];
  employers: string[];
}

export interface PersonalProfile {
  experian: PersonalProfileBureauColumn | null;
  equifax: PersonalProfileBureauColumn | null;
  transunion: PersonalProfileBureauColumn | null;
  publicRecords: string[];
}

// Legacy shape kept for backwards-compat with code that writes basic Tradeline rows.
export interface ExtractedTradeline {
  creditorName: string;
  accountNumber: string | null;
  accountType: string | null;
  status: string | null;
  balance: number | null;
  isNegative: boolean;
}

export interface ExtractedBureauReport {
  bureau: Bureau;
  pulledAt?: string | null;
  tradelines: ExtractedTradeline[];
}

export interface ExtractedReport {
  bureauReports: ExtractedBureauReport[];
  /** Rich shape used by the new analyzer — stored in CreditReport.rawPayload. */
  richPayload: {
    scores: BureauScoreSnapshot[];
    personalProfile: PersonalProfile;
    accounts: ExtractedAccount[];
  };
  rawPayload: unknown;
  source: string;
}

const MAX_TEXT_CHARS = 80_000;

async function pdfBufferToText(buffer: Buffer): Promise<string> {
  const mod = await import('pdf-parse');
  const pdfParse = (mod as { default?: (b: Buffer) => Promise<{ text: string }> }).default
    ?? (mod as unknown as (b: Buffer) => Promise<{ text: string }>);
  const result = await pdfParse(buffer);
  return result.text || '';
}

function htmlBufferToText(buffer: Buffer): string {
  const html = buffer.toString('utf8');
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function clampText(text: string): string {
  if (text.length <= MAX_TEXT_CHARS) return text;
  return text.slice(0, MAX_TEXT_CHARS) + '\n[...truncated]';
}

const SYSTEM_PROMPT = `You are a credit report parser. Given the raw text of a multi-bureau credit report (e.g. MyFreeScoreNow, IdentityIQ, SmartCredit) extract structured per-bureau data. Return a single JSON object only — no prose, no fences.

Output schema:
{
  "scores": [
    { "bureau": "EXPERIAN" | "EQUIFAX" | "TRANSUNION", "score": number | null, "pulledAt": "YYYY-MM-DD" | null }
  ],
  "personalProfile": {
    "experian":   { "reportDate": "YYYY-MM-DD"|null, "name": string|null, "alsoKnownAs": string|null, "dateOfBirth": string|null, "currentAddress": string|null, "previousAddresses": string[], "employers": string[] } | null,
    "equifax":    { same shape } | null,
    "transunion": { same shape } | null,
    "publicRecords": string[]
  },
  "accounts": [
    {
      "creditorName": string,
      "category": "collection" | "charge_off" | "late_payment" | "derogatory" | "positive" | "inquiry" | "public_record" | "unknown",
      "isNegative": boolean,
      "experian":   { "accountNumber": string|null, "highBalance": number|null, "lastVerified": string|null, "dateOfLastActivity": string|null, "dateReported": string|null, "dateOpened": string|null, "balanceOwed": number|null, "closedDate": string|null, "accountRating": string|null, "accountDescription": string|null, "disputeStatus": string|null, "creditorType": string|null, "accountStatus": string|null, "paymentStatus": string|null, "comments": string|null, "paymentAmount": number|null, "dateOfLastPayment": string|null, "termMonths": number|null, "pastDueAmount": number|null, "accountType": string|null, "paymentFrequency": string|null, "creditLimit": number|null } | null,
      "equifax":    { same shape } | null,
      "transunion": { same shape } | null,
      "paymentHistory": {
        "months": string[],
        "experian":   (string|null)[],
        "equifax":    (string|null)[],
        "transunion": (string|null)[]
      } | null
    }
  ]
}

Rules:
- Output the JSON object only. No commentary.
- Group by account: each account appears ONCE in "accounts", with one block per bureau that reports it. If a bureau does not report the account, set that bureau's block to null.
- "category" rules: "collection" = collection agency or third-party debt buyer; "charge_off" = bank/lender charge-off; "late_payment" = currently or previously past due but not charged off; "derogatory" = repo, foreclosure, bankruptcy, judgment, lien, settled-for-less; "positive" = open or closed in good standing; "inquiry" = hard pull; "public_record" = court/legal record. Use "unknown" only when truly indeterminable.
- "isNegative" must be true for collection/charge_off/late_payment/derogatory; false for positive/inquiry; null categories use your best judgment.
- Numbers: extract numeric values only (no $ or commas). Dates in YYYY-MM-DD where possible; otherwise return as written.
- "paymentHistory" months: each label like "Oct 23", "Nov 23", ... in chronological order. Status codes: "OK", "30", "60", "90", "120", "150", "CO" (charge-off), "UN" (unknown / not reported). Use null if a cell is blank.
- Do NOT invent data. If a field is not in the report, return null (or [] for arrays).
- For credit cards: extract creditLimit even if reported as "high credit" elsewhere.`;

const USER_PROMPT_TEMPLATE = (text: string) =>
  `Extract structured 3-bureau data from this credit report. Return JSON only.\n\n---\n${text}\n---`;

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const cleaned = v.replace(/[$,\s]/g, '');
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function asString(v: unknown, max = 200): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map(x => (typeof x === 'string' ? x.trim() : ''))
    .filter(s => s.length > 0)
    .slice(0, 10);
}

function normalizeBureauFields(raw: unknown): BureauAccountFields | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  return {
    accountNumber: asString(r.accountNumber, 32),
    highBalance: asNumber(r.highBalance),
    lastVerified: asString(r.lastVerified, 32),
    dateOfLastActivity: asString(r.dateOfLastActivity, 32),
    dateReported: asString(r.dateReported, 32),
    dateOpened: asString(r.dateOpened, 32),
    balanceOwed: asNumber(r.balanceOwed),
    closedDate: asString(r.closedDate, 32),
    accountRating: asString(r.accountRating, 64),
    accountDescription: asString(r.accountDescription, 64),
    disputeStatus: asString(r.disputeStatus, 64),
    creditorType: asString(r.creditorType, 64),
    accountStatus: asString(r.accountStatus, 64),
    paymentStatus: asString(r.paymentStatus, 64),
    comments: asString(r.comments, 256),
    paymentAmount: asNumber(r.paymentAmount),
    dateOfLastPayment: asString(r.dateOfLastPayment, 32),
    termMonths: asNumber(r.termMonths),
    pastDueAmount: asNumber(r.pastDueAmount),
    accountType: asString(r.accountType, 64),
    paymentFrequency: asString(r.paymentFrequency, 32),
    creditLimit: asNumber(r.creditLimit)
  };
}

function normalizeProfileColumn(raw: unknown): PersonalProfileBureauColumn | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  return {
    reportDate: asString(r.reportDate, 32),
    name: asString(r.name, 128),
    alsoKnownAs: asString(r.alsoKnownAs, 128),
    dateOfBirth: asString(r.dateOfBirth, 32),
    currentAddress: asString(r.currentAddress, 256),
    previousAddresses: asStringArray(r.previousAddresses),
    employers: asStringArray(r.employers)
  };
}

function normalizePaymentHistory(raw: unknown): PaymentHistoryGrid | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const months = Array.isArray(r.months)
    ? r.months.map(m => (typeof m === 'string' ? m.trim() : '')).filter(s => s.length > 0).slice(0, 36)
    : [];
  if (!months.length) return null;
  const row = (v: unknown): (string | null)[] => {
    if (!Array.isArray(v)) return months.map(() => null);
    return months.map((_, i) => {
      const cell = v[i];
      if (cell === null || cell === undefined) return null;
      if (typeof cell !== 'string') return null;
      const trimmed = cell.trim();
      return trimmed ? trimmed.slice(0, 8) : null;
    });
  };
  return {
    months,
    experian: row(r.experian),
    equifax: row(r.equifax),
    transunion: row(r.transunion)
  };
}

const VALID_CATEGORIES: AccountCategory[] = [
  'collection', 'charge_off', 'late_payment', 'derogatory',
  'positive', 'inquiry', 'public_record', 'unknown'
];

function normalizeCategory(v: unknown): AccountCategory {
  if (typeof v === 'string' && VALID_CATEGORIES.includes(v as AccountCategory)) {
    return v as AccountCategory;
  }
  return 'unknown';
}

function deriveLegacyTradelines(accounts: ExtractedAccount[]): ExtractedBureauReport[] {
  const byBureau: Record<Bureau, ExtractedTradeline[]> = {
    EXPERIAN: [], EQUIFAX: [], TRANSUNION: []
  };
  for (const acc of accounts) {
    const map: Array<[Bureau, BureauAccountFields | null]> = [
      ['EXPERIAN', acc.experian],
      ['EQUIFAX', acc.equifax],
      ['TRANSUNION', acc.transunion]
    ];
    for (const [bureau, fields] of map) {
      if (!fields) continue;
      byBureau[bureau].push({
        creditorName: acc.creditorName,
        accountNumber: fields.accountNumber,
        accountType: fields.accountType,
        status: fields.accountStatus || fields.paymentStatus || fields.accountRating,
        balance: fields.balanceOwed,
        isNegative: acc.isNegative
      });
    }
  }
  const out: ExtractedBureauReport[] = [];
  for (const bureau of ['EXPERIAN', 'EQUIFAX', 'TRANSUNION'] as Bureau[]) {
    if (byBureau[bureau].length) out.push({ bureau, pulledAt: null, tradelines: byBureau[bureau] });
  }
  return out;
}

export async function extractReport(input: {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}): Promise<ExtractedReport | null> {
  const ext = input.filename.toLowerCase().split('.').pop() || '';
  const isPdf = input.mimeType === 'application/pdf' || ext === 'pdf';
  const isHtml = input.mimeType === 'text/html' || ext === 'html' || ext === 'htm';

  if (!isPdf && !isHtml) return null;

  let text = '';
  try {
    text = isPdf ? await pdfBufferToText(input.buffer) : htmlBufferToText(input.buffer);
  } catch (error) {
    console.error('[reportExtractor] failed to extract text:', (error as Error).message);
    return null;
  }

  if (!text || text.trim().length < 200) {
    console.warn('[reportExtractor] extracted text too short, skipping LLM call');
    return null;
  }

  const clipped = clampText(text);
  console.log('[reportExtractor] sending to LLM', {
    filename: input.filename,
    mimeType: input.mimeType,
    rawTextLength: text.length,
    clippedLength: clipped.length,
    textPreview: clipped.slice(0, 400)
  });
  const result = await callAiGateway({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: USER_PROMPT_TEMPLATE(clipped),
    maxTokens: 12000,
    temperature: 0.1
  });

  if (!result) {
    console.warn('[reportExtractor] callAiGateway returned null (key/network/timeout)');
    return null;
  }

  console.log('[reportExtractor] LLM response received', {
    model: result.model,
    responseLength: result.text.length,
    responseHead: result.text.slice(0, 400),
    responseTail: result.text.slice(-200)
  });

  const parsed = extractJsonObject(result.text) as {
    scores?: unknown[];
    personalProfile?: unknown;
    accounts?: unknown[];
  } | null;

  if (!parsed) {
    console.warn('[reportExtractor] extractJsonObject returned null — no { ... } block in response');
    return null;
  }
  if (!Array.isArray(parsed.accounts) && !parsed.personalProfile) {
    console.warn('[reportExtractor] parsed JSON missing both accounts[] and personalProfile', {
      keys: Object.keys(parsed),
      accountsType: typeof (parsed as any).accounts,
      profileType: typeof parsed.personalProfile
    });
    return null;
  }

  const validBureaus = new Set<Bureau>(['EQUIFAX', 'EXPERIAN', 'TRANSUNION']);

  // Scores
  const scores: BureauScoreSnapshot[] = [];
  for (const s of parsed.scores || []) {
    if (!s || typeof s !== 'object') continue;
    const r = s as Record<string, unknown>;
    if (!validBureaus.has(r.bureau as Bureau)) continue;
    scores.push({
      bureau: r.bureau as Bureau,
      score: asNumber(r.score),
      pulledAt: asString(r.pulledAt, 32)
    });
  }

  // Profile
  const profileRaw = (parsed.personalProfile || {}) as Record<string, unknown>;
  const personalProfile: PersonalProfile = {
    experian: normalizeProfileColumn(profileRaw.experian),
    equifax: normalizeProfileColumn(profileRaw.equifax),
    transunion: normalizeProfileColumn(profileRaw.transunion),
    publicRecords: asStringArray(profileRaw.publicRecords)
  };

  // Accounts
  const accounts: ExtractedAccount[] = [];
  for (const a of parsed.accounts || []) {
    if (!a || typeof a !== 'object') continue;
    const r = a as Record<string, unknown>;
    const creditorName = asString(r.creditorName, 200);
    if (!creditorName) continue;
    const category = normalizeCategory(r.category);
    const isNegative = typeof r.isNegative === 'boolean'
      ? r.isNegative
      : ['collection', 'charge_off', 'late_payment', 'derogatory'].includes(category);
    accounts.push({
      creditorName,
      category,
      isNegative,
      experian: normalizeBureauFields(r.experian),
      equifax: normalizeBureauFields(r.equifax),
      transunion: normalizeBureauFields(r.transunion),
      paymentHistory: normalizePaymentHistory(r.paymentHistory)
    });
  }

  if (!accounts.length && !scores.length && !personalProfile.experian && !personalProfile.equifax && !personalProfile.transunion) {
    console.warn('[reportExtractor] no usable structure extracted');
    return null;
  }

  const bureauReports = deriveLegacyTradelines(accounts);
  if (!bureauReports.length) {
    // Always emit at least one bureau report so downstream code that filters on
    // bureauReports.length > 0 doesn't drop reports that have profile/score data
    // but no parsed accounts.
    bureauReports.push({ bureau: 'EXPERIAN', pulledAt: null, tradelines: [] });
  }

  return {
    bureauReports,
    richPayload: { scores, personalProfile, accounts },
    rawPayload: parsed,
    source: `ai-gateway:${result.model}`
  };
}
