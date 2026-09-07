/**
 * Business Credit foundation assessment.
 *
 * Organizes the standard business-credit foundation steps and reports which are
 * in place. Not a guarantee of vendor approval, tradeline reporting, or funding.
 */

export const BUSINESS_CREDIT_DISCLOSURE =
  'CredX does not guarantee vendor approval, tradeline reporting, business credit scores, or funding. This workspace organizes standard business-credit foundation steps; each provider and lender applies its own criteria.';

export interface FoundationItem {
  key: string;
  label: string;
  done: boolean;
  detail?: string;
  note?: string;
}

type ProfileInput = {
  legalName?: string | null;
  entityType?: string | null;
  formationState?: string | null;
  einStatus?: string | null;
  einLast4?: string | null;
  dunsNumber?: string | null;
  businessPhone?: string | null;
  businessEmail?: string | null;
  businessAddress?: string | null;
  businessDomain?: string | null;
  hasBankAccount?: boolean | null;
  checklist?: unknown;
} | null;

type VendorInput = { status?: string | null; reportsTo?: string[] | null };

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function assessBusinessCreditFoundation(profile: ProfileInput, vendors: VendorInput[] = []) {
  const openVendors = vendors.filter((v) => String(v.status || '').toUpperCase() === 'OPEN');
  const reportingVendors = openVendors.filter((v) => Array.isArray(v.reportsTo) && v.reportsTo.length > 0);

  const stored = new Map(
    (Array.isArray(profile?.checklist) ? profile!.checklist : []).map((c) => [String(rec(c).key), rec(c)])
  );
  const note = (key: string) => (typeof stored.get(key)?.note === 'string' ? (stored.get(key)!.note as string) : undefined);

  const items: FoundationItem[] = [
    { key: 'entity_formed', label: 'Business entity formed (LLC / corporation)', done: Boolean(profile?.entityType && profile?.legalName) },
    { key: 'ein_issued', label: 'EIN issued by the IRS', done: String(profile?.einStatus || '') === 'issued' },
    { key: 'business_address', label: 'Dedicated business address on file', done: Boolean(profile?.businessAddress) },
    { key: 'business_phone', label: 'Listed business phone number', done: Boolean(profile?.businessPhone) },
    { key: 'business_email_domain', label: 'Business email on a business domain', done: Boolean(profile?.businessEmail && profile?.businessDomain) },
    { key: 'bank_account', label: 'Business bank account opened', done: Boolean(profile?.hasBankAccount) },
    { key: 'duns', label: 'D-U-N-S number obtained', done: Boolean(profile?.dunsNumber) },
    { key: 'starter_vendors', label: 'At least 3 starter vendor accounts opened', done: openVendors.length >= 3, detail: `${openVendors.length} open vendor account(s)` },
    { key: 'reporting_vendors', label: 'Vendor accounts that report to a business bureau', done: reportingVendors.length >= 2, detail: `${reportingVendors.length} reporting` }
  ].map((i): FoundationItem => {
    const overriddenDone = stored.get(i.key)?.done;
    return { ...i, done: typeof overriddenDone === 'boolean' ? overriddenDone || i.done : i.done, note: note(i.key) };
  });

  const completed = items.filter((i) => i.done).length;
  const score = Math.round((completed / items.length) * 100);
  const stage =
    score >= 85 ? 'established' : score >= 55 ? 'building' : score >= 25 ? 'foundational' : 'not_started';

  const nextSteps = items.filter((i) => !i.done).slice(0, 4).map((i) => `Complete: ${i.label}.`);
  if (!nextSteps.length) nextSteps.push('Foundation looks complete — keep vendor accounts current and monitor bureau reporting.');

  return {
    disclosure: BUSINESS_CREDIT_DISCLOSURE,
    foundation: items,
    completed,
    total: items.length,
    score,
    stage,
    nextSteps,
    generatedAt: new Date().toISOString()
  };
}
