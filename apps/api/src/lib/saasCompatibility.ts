import type { Lead, Prisma } from '@prisma/client';

export type CompatibilityClient = Prisma.ClientGetPayload<{
  include: {
    user: true;
    payments: true;
    disputes: true;
    documents: true;
    progress: true;
  };
}>;

export type CompatibilityRecord = {
  recordType: 'lead' | 'client';
  sourceSystem: 'credx';
  internalId: string;
  externalKey: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  ssnLast4: string;
  referralSource: string;
  referralDetail: string;
  sourceCategory: string;
  selectedOffer: string;
  onboardingStep: string;
  pipelineStatus: string;
  paymentStatus: string;
  serviceTier: string;
  documentCount: number;
  disputeCount: number;
  createdAt: string;
  updatedAt: string;
};

export const compatibilityFields: Array<{ key: keyof CompatibilityRecord; label: string; description: string }> = [
  { key: 'recordType', label: 'Record Type', description: 'Whether the row is a raw lead or registered client.' },
  { key: 'sourceSystem', label: 'Source System', description: 'Origin platform for external syncs.' },
  { key: 'internalId', label: 'Internal ID', description: 'CredX database record ID.' },
  { key: 'externalKey', label: 'External Key', description: 'Stable email-based key for deduplication.' },
  { key: 'firstName', label: 'First Name', description: 'Consumer first name.' },
  { key: 'lastName', label: 'Last Name', description: 'Consumer last name.' },
  { key: 'email', label: 'Email', description: 'Primary email address.' },
  { key: 'phone', label: 'Phone', description: 'Primary phone number.' },
  { key: 'addressLine1', label: 'Address Line 1', description: 'Current mailing address line 1.' },
  { key: 'addressLine2', label: 'Address Line 2', description: 'Current mailing address line 2.' },
  { key: 'city', label: 'City', description: 'Current city.' },
  { key: 'state', label: 'State', description: 'Current state.' },
  { key: 'postalCode', label: 'Postal Code', description: 'Current postal code.' },
  { key: 'ssnLast4', label: 'SSN Last 4', description: 'Last four digits only, never full SSN.' },
  { key: 'referralSource', label: 'Referral Source', description: 'Where the lead/client came from.' },
  { key: 'referralDetail', label: 'Referral Detail', description: 'Friend, partner, campaign, or other source detail.' },
  { key: 'sourceCategory', label: 'Source Category', description: 'Normalized source bucket for reporting.' },
  { key: 'selectedOffer', label: 'Selected Offer', description: 'Program, masterclass, or selected signup path.' },
  { key: 'onboardingStep', label: 'Onboarding Step', description: 'Current intake/onboarding step.' },
  { key: 'pipelineStatus', label: 'Pipeline Status', description: 'Portable sales/client status.' },
  { key: 'paymentStatus', label: 'Payment Status', description: 'Current payment state.' },
  { key: 'serviceTier', label: 'Service Tier', description: 'CredX service tier.' },
  { key: 'documentCount', label: 'Document Count', description: 'Number of stored client documents.' },
  { key: 'disputeCount', label: 'Dispute Count', description: 'Number of dispute records.' },
  { key: 'createdAt', label: 'Created At', description: 'ISO creation timestamp.' },
  { key: 'updatedAt', label: 'Updated At', description: 'ISO update timestamp.' }
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textValue(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function isoDate(value: Date | string | null | undefined): string {
  if (!value) return '';
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function sourceCategory(source: string): string {
  const normalized = source.toLowerCase();
  if (normalized.includes('referral') || normalized.includes('referred') || normalized.includes('friend')) return 'referral';
  if (normalized.includes('masterclass') || normalized.includes('class')) return 'masterclass';
  if (normalized.includes('instagram') || normalized.includes('facebook') || normalized.includes('tiktok') || normalized.includes('social')) return 'social';
  if (normalized.includes('google') || normalized.includes('website') || normalized.includes('organic') || normalized.includes('search')) return 'web';
  if (normalized.includes('direct')) return 'direct';
  if (normalized.includes('other')) return 'other';
  return source ? 'other' : 'unknown';
}

function statusLabel(status: string): string {
  if (status === 'UPGRADE_OFFERED') return 'Pending Payment';
  return status.replace(/_/g, ' ');
}

function clientOnboarding(client: CompatibilityClient): Record<string, unknown> {
  const onboarding = client.progress?.onboarding;
  return isRecord(onboarding) ? onboarding : {};
}

function clientSignupIntake(onboarding: Record<string, unknown>, key: 'signupIntake' | 'lastSignupIntake'): Record<string, unknown> {
  const intake = onboarding[key];
  return isRecord(intake) ? intake : {};
}

function clientReferral(client: CompatibilityClient): { source: string; detail: string; offer: string } {
  const onboarding = clientOnboarding(client);
  const signupIntake = clientSignupIntake(onboarding, 'signupIntake');
  const lastSignupIntake = clientSignupIntake(onboarding, 'lastSignupIntake');

  const source =
    textValue(onboarding.referralSource) ||
    textValue(signupIntake.referralSource) ||
    textValue(lastSignupIntake.referralSource) ||
    'Signup';
  const detail =
    textValue(onboarding.referralDetail) ||
    textValue(signupIntake.referralDetail) ||
    textValue(lastSignupIntake.referralDetail) ||
    textValue(signupIntake.referralName) ||
    textValue(lastSignupIntake.referralName);
  const offer =
    textValue(onboarding.initialOfferInterest) ||
    textValue(onboarding.lastOfferInterest) ||
    textValue(signupIntake.planPath) ||
    textValue(lastSignupIntake.planPath);

  return { source, detail, offer };
}

function onboardingStep(client: CompatibilityClient): string {
  const onboarding = clientOnboarding(client);
  const workflow = isRecord(client.progress?.workflow) ? client.progress?.workflow : {};
  return textValue(workflow.stage) || textValue(onboarding.status) || 'pending';
}

function paymentStatus(client: CompatibilityClient): string {
  if (client.setupFeePaid || client.payments.some((payment) => payment.status === 'PAID')) return 'paid';
  if (client.payments.some((payment) => payment.status === 'FAILED')) return 'failed';
  if (client.payments.some((payment) => payment.status === 'PENDING') || client.status === 'UPGRADE_OFFERED') return 'pending';
  return 'not_started';
}

export function normalizeClientForCompatibility(client: CompatibilityClient): CompatibilityRecord {
  const referral = clientReferral(client);
  return {
    recordType: 'client',
    sourceSystem: 'credx',
    internalId: client.id,
    externalKey: client.user.email.toLowerCase(),
    firstName: client.user.firstName || '',
    lastName: client.user.lastName || '',
    email: client.user.email || '',
    phone: client.user.phone || '',
    addressLine1: client.currentAddressLine1 || '',
    addressLine2: client.currentAddressLine2 || '',
    city: client.currentCity || '',
    state: client.currentState || '',
    postalCode: client.currentPostalCode || '',
    ssnLast4: client.ssnLast4 || '',
    referralSource: referral.source,
    referralDetail: referral.detail,
    sourceCategory: sourceCategory(referral.source),
    selectedOffer: referral.offer,
    onboardingStep: onboardingStep(client),
    pipelineStatus: statusLabel(client.status),
    paymentStatus: paymentStatus(client),
    serviceTier: client.serviceTier,
    documentCount: client.documents.length,
    disputeCount: client.disputes.length,
    createdAt: isoDate(client.createdAt),
    updatedAt: isoDate(client.updatedAt)
  };
}

export function normalizeLeadForCompatibility(lead: Lead): CompatibilityRecord {
  const referralSource = lead.referralSource || 'Landing Page';
  const referralDetail = [lead.referralName, lead.referralOther].map((item) => item?.trim()).filter(Boolean).join(' | ');
  return {
    recordType: 'lead',
    sourceSystem: 'credx',
    internalId: lead.id,
    externalKey: lead.email.toLowerCase(),
    firstName: lead.firstName || '',
    lastName: lead.lastName || '',
    email: lead.email || '',
    phone: lead.phone || '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    ssnLast4: '',
    referralSource,
    referralDetail,
    sourceCategory: sourceCategory(referralSource),
    selectedOffer: lead.offerInterest || '',
    onboardingStep: 'awaiting_signup',
    pipelineStatus: 'Awaiting Signup',
    paymentStatus: 'not_started',
    serviceTier: '',
    documentCount: 0,
    disputeCount: 0,
    createdAt: isoDate(lead.createdAt),
    updatedAt: isoDate(lead.createdAt)
  };
}

export function toCsv(records: CompatibilityRecord[]): string {
  const headers = compatibilityFields.map((field) => field.key);
  const escape = (value: unknown): string => {
    const text = String(value ?? '');
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };

  return [
    headers.join(','),
    ...records.map((record) => headers.map((header) => escape(record[header])).join(','))
  ].join('\n');
}

