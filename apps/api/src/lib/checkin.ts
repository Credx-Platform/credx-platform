/**
 * Weekly check-in helpers (master spec §41).
 *
 * The check-in asks what changed in the last week — balances, credit limits,
 * new/closed accounts, income, hard inquiries — so the CredX Readiness Score
 * stays grounded in current reality between report pulls.
 */

export interface CheckInAnswers {
  balancesChanged?: boolean | null;
  balancesNote?: string | null;
  creditLimitChanged?: boolean | null;
  creditLimitNote?: string | null;
  newAccountOpened?: boolean | null;
  newAccountNote?: string | null;
  accountClosed?: boolean | null;
  accountClosedNote?: string | null;
  incomeChanged?: boolean | null;
  incomeNote?: string | null;
  hardInquiry?: boolean | null;
  freeText?: string | null;
}

export interface CheckInQuestion {
  key: keyof CheckInAnswers;
  noteKey?: keyof CheckInAnswers;
  prompt: string;
}

export const CHECKIN_QUESTIONS: CheckInQuestion[] = [
  { key: 'balancesChanged', noteKey: 'balancesNote', prompt: 'Did your credit card balances change since your last check-in?' },
  { key: 'creditLimitChanged', noteKey: 'creditLimitNote', prompt: 'Did any credit limit change (increase or decrease)?' },
  { key: 'newAccountOpened', noteKey: 'newAccountNote', prompt: 'Did you open any new credit account or loan?' },
  { key: 'accountClosed', noteKey: 'accountClosedNote', prompt: 'Was any account closed (by you or the lender)?' },
  { key: 'incomeChanged', noteKey: 'incomeNote', prompt: 'Did your income change?' },
  { key: 'hardInquiry', prompt: 'Did you apply for credit anywhere (a hard inquiry)?' }
];

/** ISO-week key like "2026-W37" for a given date (UTC, Monday-based). */
export function isoWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** "What changed since last check-in" bullets from the submitted answers. */
export function summarizeChanges(a: CheckInAnswers): string[] {
  const out: string[] = [];
  const push = (cond: boolean | null | undefined, base: string, note?: string | null) => {
    if (cond === true) out.push(note && note.trim() ? `${base}: ${note.trim()}` : base);
  };
  push(a.balancesChanged, 'Credit card balances changed', a.balancesNote);
  push(a.creditLimitChanged, 'A credit limit changed', a.creditLimitNote);
  push(a.newAccountOpened, 'A new account was opened', a.newAccountNote);
  push(a.accountClosed, 'An account was closed', a.accountClosedNote);
  push(a.incomeChanged, 'Income changed', a.incomeNote);
  push(a.hardInquiry, 'A new credit application / hard inquiry occurred');
  if (a.freeText && a.freeText.trim()) out.push(`Note: ${a.freeText.trim()}`);
  if (!out.length) out.push('No changes reported this week.');
  return out;
}
