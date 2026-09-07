import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DisputeManager } from './components/DisputeManager';
import { AnalysisTab } from './components/AnalysisTab';
import { renderBestPrintHtml } from './printing';
import { SiteFooter } from './components/SiteFooter.js';

type Plan = {
  code: string;
  setupFee: number;
  monthly: number | null;
  note?: string;
};

type User = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  role: 'CLIENT' | 'AFFILIATE' | 'STAFF' | 'ADMIN';
};

type StaffUser = User & {
  createdAt: string;
  updatedAt: string;
};

type ClientEducationProgress = {
  masterclassEnrolled?: boolean;
  masterclassAccess?: boolean;
  masterclassProgress?: string[];
  masterclassPassedQuizzes?: string[];
  masterclassQuizAttempts?: Record<string, { count: number; lastAttemptAt: string; cooldownUntil?: string | null }>;
  enrolledAt?: string;
};

type ClientProgress = {
  education?: ClientEducationProgress;
  analysis?: unknown;
  scores?: { equifax?: number | null; experian?: number | null; transunion?: number | null };
  workflow?: { stage?: string; next?: string[] };
  uploadedDocs?: Array<{ name?: string; fileName?: string; type?: string; uploadedAt?: string; secure?: boolean; sizeBytes?: number }>;
  onboarding?: {
    status?: string;
    signupAt?: string | null;
    completedAt?: string | null;
    monitoringProvider?: string | null;
    monitoringHasCredentials?: boolean;
    monitoringUsername?: string | null;
    monitoringPassword?: string | null;
    monitoringSubmittedAt?: string | null;
    monitoringSkippedAt?: string | null;
    smsConsent?: boolean;
    smsConsentCapturedAt?: string | null;
    smsConsentLanguage?: string | null;
    smsConsentSource?: string | null;
    signature?: {
      dataUrl?: string;
      signedName?: string;
      signedAt?: string;
      agreementText?: string;
      disclosureStatement?: string;
      cancellationNotice?: { heading?: string; text?: string } | null;
      contractId?: string;
      ipAddress?: string | null;
      userAgent?: string | null;
    } | null;
    [key: string]: unknown;
  } | null;
};

type DocumentRecord = {
  id: string;
  type?: string | null;
  fileName?: string | null;
  s3Key?: string | null;
  contentType?: string | null;
  uploadedAt?: string | null;
  createdAt?: string | null;
  roundNumber?: number | null;
  letterType?: string | null;
  bureau?: string | null;
  letterStatus?: string | null;
};

type ClientRecord = {
  id: string;
  customerType?: string | null;
  referralCodeAtSignup?: string | null;
  referredBySubAgentId?: string | null;
  referredBySubAgent?: Pick<SubAgentRecord, 'id' | 'name' | 'affiliateId' | 'referralCode'> | null;
  status: 'LEAD' | 'STUDENT' | 'CONTRACT_SENT' | 'INTAKE_RECEIVED' | 'ANALYSIS_READY' | 'UPGRADE_OFFERED' | 'ACTIVE' | 'PAST_DUE' | 'RESTRICTED' | 'CANCELLED';
  serviceTier: 'ESSENTIAL' | 'AGGRESSIVE' | 'FAMILY';
  analysisSummary?: string | null;
  disputePlanSummary?: string | null;
  estimatedTimelineMonths?: number | null;
  portalRestricted?: boolean;
  setupFeePaid?: boolean;
  ssnLast4?: string | null;
  dobEncrypted?: string | null;
  currentAddressLine1?: string | null;
  currentAddressLine2?: string | null;
  currentCity?: string | null;
  currentState?: string | null;
  currentPostalCode?: string | null;
  createdAt: string;
  updatedAt: string;
  user: User;
  disputes: Array<{ id: string; status: string }>;
  payments: Array<{ id: string; status: string; type?: string; amount?: number | string; provider?: string | null; paidAt?: string | null }>;
  documents: DocumentRecord[];
  activities: Array<{ id: string; message: string; createdAt: string }>;
  progress?: ClientProgress | null;
};

type ClientDetail = ClientRecord & {
  disputeItems?: Array<{
    id: string;
    furnisher: string;
    accountNumber?: string | null;
    accountType: string;
    status: string;
    currentRound: number;
    reason?: string | null;
    dueDate?: string | null;
    createdAt: string;
  }>;
  progress?: ClientProgress | null;
  creditReports?: Array<{ id: string; bureau: string; pulledAt: string; score?: number | null; tradelines: Array<{ id: string }> }>;
  tasks?: Array<{ id: string; title?: string | null; status?: string | null }>;
};

type ClientProfileForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  serviceTier: ClientRecord['serviceTier'];
  currentAddressLine1: string;
  currentAddressLine2: string;
  currentCity: string;
  currentState: string;
  currentPostalCode: string;
  ssnFull: string;
  dob: string;
  portalRestricted: boolean;
};

type LeadRecord = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  creditGoal?: string | null;
  referralSource?: string | null;
  referralName?: string | null;
  referralOther?: string | null;
  offerInterest?: string | null;
  offerEligibleUntil?: string | null;
  createdAt: string;
  notes?: string | null;
};

type LeadPipelineRow = {
  id: string;
  rawLeadId?: string;
  clientId?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  creditGoal?: string | null;
  sourceLabel: string;
  sourceDetail?: string | null;
  sourceType: string;
  interest?: string | null;
  submittedAt: string;
  status: string;
  statusLabel: string;
  isPendingPayment: boolean;
  isRegistered: boolean;
};

type SubAgentLeadRow = LeadPipelineRow & {
  subAgentId: string;
  subAgentName: string;
  subAgentCode: string;
};

type DisputeRecord = {
  id: string;
  creditorName: string;
  bureau: 'EXPERIAN' | 'TRANSUNION' | 'EQUIFAX';
  status: 'PENDING' | 'LETTER_SENT' | 'RESPONSE_DUE' | 'COMPLETED' | 'REJECTED';
  round: number;
  reason?: string;
  createdAt: string;
  client: {
    id: string;
    user: User;
  };
};

type AffiliateLink = {
  label: string;
  url: string;
  category: string;
  placement: string;
  disclosure: string;
};

type SubAgentContact = {
  id: string;
  status: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  creditGoal?: string | null;
  sourceUrl?: string | null;
  landingPath?: string | null;
  ipAddress?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  location?: string | null;
  userAgent?: string | null;
  createdAt: string;
};

type SubAgentRecord = {
  id: string;
  affiliateId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  referralCode: string;
  status: string;
  notes?: string | null;
  policyAcceptedAt?: string | null;
  createdAt: string;
  contacts: SubAgentContact[];
  referredClients?: Array<{
    id: string;
    status: string;
    createdAt: string;
    user: { firstName: string; lastName: string; email: string };
  }>;
};

type LoginResponse = {
  user: User;
  token: string;
};

const API_BASE = (import.meta.env.VITE_API_URL ?? '').trim() ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:3000'
    : '');
const TOKEN_KEY = 'credx-admin-token';
const USER_KEY = 'credx-admin-user';

const AFFILIATE_LINKS: AffiliateLink[] = [
  { label: 'Self Lender', url: 'https://self.inc/refer/16452347', category: 'credit_builder', placement: 'Client portal, Credit Builders', disclosure: 'CredX may earn compensation if a client opens an account through this link.' },
  { label: 'Credit Strong', url: 'https://creditstrong.referralrock.com/l/3JAMES442/', category: 'credit_builder', placement: 'Client portal, Credit Builders', disclosure: 'CredX may earn compensation if a client opens an account through this link.' },
  { label: 'Rent Reporters', url: 'https://prf.hn/click/camref:1101l52pUS', category: 'rent_reporting', placement: 'Client portal, Credit Builders', disclosure: 'CredX may earn compensation if a client buys reporting services through this link.' },
  { label: 'Credit Builder Card', url: 'https://www.creditbuildercard.com/mgf.html', category: 'builder_card', placement: 'Client portal, Credit Builders', disclosure: 'CredX may earn compensation if a client opens an account through this link.' },
  { label: 'Grow Credit', url: 'https://growcredit.com/?kid=12BYTD', category: 'subscription_reporting', placement: 'Client portal, Credit Builders', disclosure: 'CredX may earn compensation if a client signs up through this link.' },
  { label: 'Kovo', url: 'https://kovocredit.com/r/O6LDVXN7', category: 'credit_builder', placement: 'Client portal, Credit Builders', disclosure: 'CredX may earn compensation if a client signs up through this link.' },
  { label: 'Ava', url: 'https://meetava.app.link/tdMaQUdV7Rb', category: 'rent_utility_reporting', placement: 'Client portal, Credit Builders', disclosure: 'CredX may earn compensation if a client signs up through this link.' }
];

function parseApiResponse(text: string, response: Response) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const contentType = response.headers.get('content-type') || 'unknown content type';
    const preview = text.replace(/\s+/g, ' ').trim().slice(0, 120);
    throw new Error(
      response.ok
        ? `The server returned ${contentType}, not JSON.`
        : `Request failed: ${response.status}${preview ? ` - ${preview}` : ''}`
    );
  }
}

async function apiFetch<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  if (!headers.has('content-type') && init?.body) headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers
  });

  const text = await response.text();
  const body = parseApiResponse(text, response);

  if (!response.ok) {
    throw new Error(body?.error ?? `Request failed: ${response.status}`);
  }

  return body as T;
}

async function apiUpload<T>(path: string, token: string, formData: FormData): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: formData
  });
  const text = await response.text();
  const body = parseApiResponse(text, response);
  if (!response.ok) throw new Error(body?.error ?? `Upload failed: ${response.status}`);
  return body as T;
}

async function downloadApiFile(path: string, token: string, filename: string) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Download failed: ${response.status}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function money(value: number | null) {
  if (value == null) return 'Custom';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatMaskedSsn(last4?: string | null) {
  return last4 ? `•••-••-${last4}` : 'Not on file';
}

function statusClass(status: string) {
  return `status-badge status-${status.toLowerCase()}`;
}

function statusLabel(status: string) {
  if (status === 'UPGRADE_OFFERED') return 'Pending Payment';
  return status.replace(/_/g, ' ');
}

function bureauLabel(bureau: DisputeRecord['bureau']) {
  return bureau === 'TRANSUNION' ? 'TransUnion' : bureau === 'EQUIFAX' ? 'Equifax' : 'Experian';
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function bureauScoreFromAnalysis(analysis: unknown, bureau: 'EXPERIAN' | 'EQUIFAX' | 'TRANSUNION') {
  const scores = isObjectRecord(analysis) && Array.isArray(analysis.bureauScores) ? analysis.bureauScores : [];
  const match = scores.find((score) => isObjectRecord(score) && score.bureau === bureau);
  return isObjectRecord(match) && typeof match.score === 'number' ? match.score : null;
}

function reportProfileRows(analysis: unknown) {
  const profile = isObjectRecord(analysis) && isObjectRecord(analysis.personalProfile) ? analysis.personalProfile : null;
  if (!profile) return [];
  const rows = [
    ['Name', 'name'],
    ['Date of birth', 'dateOfBirth'],
    ['Current address', 'currentAddress'],
    ['Also known as', 'alsoKnownAs'],
    ['Employers', 'employers']
  ] as const;
  return rows.map(([label, key]) => {
    const values = (['experian', 'equifax', 'transunion'] as const).map((bureau) => {
      const col = isObjectRecord(profile[bureau]) ? profile[bureau] : null;
      const value = col ? col[key] : null;
      if (Array.isArray(value)) return value.filter(Boolean).join(', ');
      return typeof value === 'string' && value.trim() ? value.trim() : null;
    }).filter((value): value is string => !!value);
    return { label, value: values[0] || null };
  }).filter((row) => row.value);
}

function isMasterclassStudent(progress?: ClientProgress | null) {
  const education = progress?.education;
  if (education?.masterclassEnrolled === true) return true;

  const onboarding = progress?.onboarding;
  if (!onboarding) return false;

  const signupIntake = onboarding.signupIntake;
  const lastSignupIntake = onboarding.lastSignupIntake;

  return (
    onboarding.initialOfferInterest === 'masterclass' ||
    onboarding.lastOfferInterest === 'masterclass' ||
    onboarding.status === 'masterclass' ||
    onboarding.track === 'masterclass' ||
    (isObjectRecord(signupIntake) && signupIntake.planPath === 'masterclass') ||
    (isObjectRecord(lastSignupIntake) && lastSignupIntake.planPath === 'masterclass')
  );
}

function isStudentClient(client: ClientRecord) {
  return client.status === 'STUDENT' || isMasterclassStudent(client.progress);
}

function hasPaidMasterclassAccess(client: ClientRecord) {
  return isStudentClient(client) && client.payments.some((payment) => payment.type === 'MASTERCLASS' && payment.status === 'PAID');
}

function clientTierLabel(client: ClientRecord) {
  return isStudentClient(client) ? 'MASTERCLASS' : client.serviceTier;
}

function clientDisplayStatus(client: ClientRecord) {
  if (hasPaidMasterclassAccess(client) || (isStudentClient(client) && client.progress?.education?.masterclassAccess)) {
    return 'Active Student';
  }
  return statusLabel(client.status);
}

function textValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function hasPaidService(client: ClientRecord) {
  return client.setupFeePaid === true || client.payments.some((payment) => payment.status === 'PAID');
}

function isUnpaidApplication(client: ClientRecord) {
  return ['LEAD', 'CONTRACT_SENT', 'INTAKE_RECEIVED', 'ANALYSIS_READY', 'UPGRADE_OFFERED'].includes(client.status) && !hasPaidService(client);
}

function sourceTypeFor(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes('referral') || normalized.includes('referred') || normalized.includes('friend')) return 'referral';
  if (normalized.includes('masterclass') || normalized.includes('class')) return 'masterclass';
  if (normalized.includes('instagram') || normalized.includes('facebook') || normalized.includes('tiktok') || normalized.includes('social')) return 'social';
  if (normalized.includes('google') || normalized.includes('website') || normalized.includes('organic') || normalized.includes('search')) return 'web';
  if (normalized.includes('direct')) return 'direct';
  if (normalized.includes('other')) return 'other';
  return 'signup';
}

function humanizeSource(value: string) {
  return value.replace(/[_-]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function leadSourceInfo(lead: LeadRecord) {
  const label = textValue(lead.referralSource) || 'Landing Page';
  const detail = [lead.referralName, lead.referralOther].map(textValue).filter(Boolean).join(' · ');
  return {
    label: humanizeSource(label),
    detail: detail || null,
    type: sourceTypeFor(label)
  };
}

function clientSourceInfo(client: ClientRecord, lead?: LeadRecord) {
  const onboarding = client.progress?.onboarding;
  const signupIntake = isObjectRecord(onboarding?.signupIntake) ? onboarding?.signupIntake : null;
  const lastSignupIntake = isObjectRecord(onboarding?.lastSignupIntake) ? onboarding?.lastSignupIntake : null;
  const fallbackLead = lead ? leadSourceInfo(lead) : null;
  const label =
    textValue(onboarding?.referralSource) ||
    textValue(signupIntake?.referralSource) ||
    textValue(lastSignupIntake?.referralSource) ||
    fallbackLead?.label ||
    'Signup';
  const detail =
    textValue(onboarding?.referralDetail) ||
    textValue(signupIntake?.referralDetail) ||
    textValue(lastSignupIntake?.referralDetail) ||
    textValue(signupIntake?.referralName) ||
    textValue(lastSignupIntake?.referralName) ||
    fallbackLead?.detail ||
    null;
  const interest =
    textValue(onboarding?.initialOfferInterest) ||
    textValue(onboarding?.lastOfferInterest) ||
    textValue(signupIntake?.planPath) ||
    textValue(lastSignupIntake?.planPath) ||
    lead?.offerInterest ||
    null;

  return {
    label: humanizeSource(label),
    detail,
    type: sourceTypeFor(label),
    interest
  };
}

function clientReferralLabel(client: ClientRecord) {
  if (client.referredBySubAgent) {
    return client.referredBySubAgent.name;
  }
  if (client.referralCodeAtSignup) return `Sub Agent (${client.referralCodeAtSignup})`;
  const source = clientSourceInfo(client);
  if (source.detail) return `${source.label} - ${source.detail}`;
  return source.label;
}

function buildLeadPipelineRows(leads: LeadRecord[], clients: ClientRecord[]): LeadPipelineRow[] {
  const leadByEmail = new Map(leads.map((lead) => [lead.email.toLowerCase(), lead]));
  const clientEmails = new Set<string>();
  const rows: LeadPipelineRow[] = [];

  for (const client of clients) {
    if (!isUnpaidApplication(client)) continue;
    const email = client.user.email.toLowerCase();
    clientEmails.add(email);
    const matchingLead = leadByEmail.get(email);
    const source = clientSourceInfo(client, matchingLead);
    rows.push({
      id: `client-${client.id}`,
      clientId: client.id,
      firstName: client.user.firstName,
      lastName: client.user.lastName,
      email: client.user.email,
      phone: null,
      creditGoal: matchingLead?.creditGoal || null,
      sourceLabel: source.label,
      sourceDetail: source.detail,
      sourceType: source.type,
      interest: source.interest,
      submittedAt: matchingLead?.createdAt || client.createdAt,
      status: client.status,
      statusLabel: statusLabel(client.status),
      isPendingPayment: client.status === 'UPGRADE_OFFERED' || client.payments.some((payment) => payment.status === 'PENDING'),
      isRegistered: true
    });
  }

  for (const lead of leads) {
    if (clientEmails.has(lead.email.toLowerCase())) continue;
    const source = leadSourceInfo(lead);
    rows.push({
      id: `lead-${lead.id}`,
      rawLeadId: lead.id,
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      creditGoal: lead.creditGoal,
      sourceLabel: source.label,
      sourceDetail: source.detail,
      sourceType: source.type,
      interest: lead.offerInterest,
      submittedAt: lead.createdAt,
      status: 'AWAITING_SIGNUP',
      statusLabel: 'Awaiting Signup',
      isPendingPayment: false,
      isRegistered: false
    });
  }

  return rows.sort((a, b) => +new Date(b.submittedAt) - +new Date(a.submittedAt));
}

function DisputeSnapshot({ disputes }: { disputes: DisputeRecord[] }) {
  const navigate = useNavigate();
  const active = disputes.filter((item) => !['COMPLETED', 'REJECTED'].includes(item.status));
  const responseDue = disputes.filter((item) => item.status === 'RESPONSE_DUE').length;
  const lettersSent = disputes.filter((item) => item.status === 'LETTER_SENT').length;
  const recent = [...disputes]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 5);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Dispute Section</p>
          <h2>Live dispute pipeline</h2>
          <p className="helper-text">Track what is active, what is due, and which client files need the next move.</p>
        </div>
      </div>

      <div className="dispute-summary-grid">
        <div className="stat-card"><span>Active disputes</span><strong>{active.length}</strong></div>
        <div className="stat-card"><span>Response due</span><strong>{responseDue}</strong></div>
        <div className="stat-card"><span>Letters sent</span><strong>{lettersSent}</strong></div>
        <div className="stat-card"><span>Total dispute items</span><strong>{disputes.length}</strong></div>
      </div>

      <div className="dispute-spotlight-grid">
        {recent.length ? recent.map((dispute) => (
          <article key={dispute.id} className="dispute-spotlight-card clickable-card" onClick={() => navigate(`/clients/${dispute.client.id}?tab=disputes`)}>
            <div className="dispute-card-top">
              <div>
                <strong>{dispute.creditorName}</strong>
                <div className="cell-subtext">{dispute.client.user.firstName} {dispute.client.user.lastName}</div>
              </div>
              <span className={statusClass(dispute.status)}>{dispute.status.replace('_', ' ')}</span>
            </div>
            <div className="dispute-meta">
              <span>{bureauLabel(dispute.bureau)}</span>
              <span>Round {dispute.round}</span>
              <span>{formatDate(dispute.createdAt)}</span>
            </div>
            <div className="change-chip">
              <span>Reason</span>
              <strong>{dispute.reason || 'Dispute reason pending update.'}</strong>
            </div>
          </article>
        )) : (
          <div className="empty-state-card">
            <strong>No dispute items yet</strong>
            <p>Imported and created dispute items will appear here for the admin team.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function SubAgentsRoute({ token, subAgents, leads, clients, onRefresh }: { token: string; subAgents: SubAgentRecord[]; leads: LeadRecord[]; clients: ClientRecord[]; onRefresh: () => Promise<void> }) {
  const navigate = useNavigate();
  const [agentName, setAgentName] = useState('');
  const [agentEmail, setAgentEmail] = useState('');
  const [agentPhone, setAgentPhone] = useState('');
  const [agentCode, setAgentCode] = useState('');
  const [savingAgent, setSavingAgent] = useState(false);
  const [refreshingActivity, setRefreshingActivity] = useState(false);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyingAgentId, setCopyingAgentId] = useState<string | null>(null);
  const [copiedAgentId, setCopiedAgentId] = useState<string | null>(null);
  const [emailingAgentId, setEmailingAgentId] = useState<string | null>(null);
  const [emailedAgentId, setEmailedAgentId] = useState<string | null>(null);
  const [selectedLeadAgentId, setSelectedLeadAgentId] = useState<string>('ALL');

  const activeAgents = subAgents.filter((agent) => agent.status === 'ACTIVE');
  const totalLinkEvents = subAgents.reduce((sum, agent) => sum + (agent.contacts?.length || 0), 0);
  const totalRegistrations = subAgents.reduce(
    (sum, agent) => {
      const contactRegistrations = (agent.contacts || []).filter((event) => event.status.includes('CLIENT')).length;
      return sum + Math.max(contactRegistrations, agent.referredClients?.length || 0);
    },
    0
  );

  const subAgentLeadRows = useMemo<SubAgentLeadRow[]>(() => {
    const agentsById = new Map(subAgents.map((agent) => [agent.id, agent]));
    const agentsByCode = new Map(subAgents.map((agent) => [agent.referralCode.toLowerCase(), agent]));
    const agentsByName = new Map(subAgents.map((agent) => [agent.name.toLowerCase(), agent]));
    const rows: SubAgentLeadRow[] = [];
    const seen = new Set<string>();

    for (const client of clients) {
      const onboarding = client.progress?.onboarding || {};
      const signupIntake = isObjectRecord(onboarding.signupIntake) ? onboarding.signupIntake : null;
      const storedReferralCode =
        client.referralCodeAtSignup ||
        textValue(onboarding.subAgentReferralCode) ||
        textValue(onboarding.referralDetail) ||
        textValue(signupIntake?.subAgentReferralCode);
      const agent = (client.referredBySubAgentId ? agentsById.get(client.referredBySubAgentId) : null) ||
        (storedReferralCode ? agentsByCode.get(storedReferralCode.toLowerCase()) : null) ||
        null;
      if (!agent || client.status === 'CANCELLED') continue;
      const source = clientSourceInfo(client);
      const rowKey = `client-${client.id}`;
      seen.add(rowKey);
      rows.push({
        id: rowKey,
        clientId: client.id,
        firstName: client.user.firstName,
        lastName: client.user.lastName,
        email: client.user.email,
        phone: client.user.phone,
        creditGoal: null,
        sourceLabel: source.label,
        sourceDetail: source.detail,
        sourceType: source.type,
        interest: source.interest,
        submittedAt: client.createdAt,
        status: client.status,
        statusLabel: statusLabel(client.status),
        isPendingPayment: client.status === 'UPGRADE_OFFERED' || client.payments.some((payment) => payment.status === 'PENDING'),
        isRegistered: true,
        subAgentId: agent.id,
        subAgentName: agent.name,
        subAgentCode: agent.referralCode
      });
    }

    for (const lead of leads) {
      const code = textValue(lead.referralName) || textValue(lead.referralOther);
      const agent = (code ? agentsByCode.get(code.toLowerCase()) : null) ||
        (lead.referralSource ? agentsByName.get(lead.referralSource.toLowerCase()) : null) ||
        null;
      if (!agent) continue;
      const rowKey = `lead-${lead.id}`;
      if (seen.has(rowKey)) continue;
      const source = leadSourceInfo(lead);
      rows.push({
        id: rowKey,
        rawLeadId: lead.id,
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone,
        creditGoal: lead.creditGoal,
        sourceLabel: source.label,
        sourceDetail: source.detail,
        sourceType: source.type,
        interest: lead.offerInterest,
        submittedAt: lead.createdAt,
        status: 'AWAITING_SIGNUP',
        statusLabel: 'Awaiting Signup',
        isPendingPayment: false,
        isRegistered: false,
        subAgentId: agent.id,
        subAgentName: agent.name,
        subAgentCode: agent.referralCode
      });
    }

    return rows.sort((a, b) => +new Date(b.submittedAt) - +new Date(a.submittedAt));
  }, [clients, leads, subAgents]);

  const visibleSubAgentLeadRows = selectedLeadAgentId === 'ALL'
    ? subAgentLeadRows
    : subAgentLeadRows.filter((lead) => lead.subAgentId === selectedLeadAgentId);

  const referralUrl = (code: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.credxme.com';
    return `${origin}/api/sub-agents/track/${encodeURIComponent(code)}`;
  };

  const openLeadRow = (lead: Pick<SubAgentLeadRow, 'clientId' | 'rawLeadId' | 'email'>) => {
    if (lead.clientId) {
      navigate(`/clients/${lead.clientId}?tab=overview`);
      return;
    }
    const params = new URLSearchParams();
    params.set('search', lead.email);
    if (lead.rawLeadId) params.set('focus', lead.rawLeadId);
    navigate(`/leads?${params.toString()}`);
  };

  const showNewLeadList = (agentId: string = 'ALL') => {
    setSelectedLeadAgentId(agentId);
    window.setTimeout(() => {
      document.getElementById('subagent-new-leads')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  const showNotice = (message: string, ms = 2200) => {
    setCopyNotice(message);
    window.setTimeout(() => setCopyNotice(null), ms);
  };

  const copyText = async (value: string, label: string) => {
    if (!value) return false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();
        if (!copied) throw new Error('Fallback copy failed');
      }
      showNotice(`${label} copied`);
      return true;
    } catch {
      window.prompt('Copy this affiliate link:', value);
      showNotice('Copy dialog opened for this browser session', 2600);
      return false;
    }
  };

  const copyAgentLink = async (agent: SubAgentRecord) => {
    setError(null);
    setCopyingAgentId(agent.id);
    setCopiedAgentId(null);
    try {
      const copied = await copyText(referralUrl(agent.referralCode), `${agent.name} link`);
      if (copied) {
        setCopiedAgentId(agent.id);
        window.setTimeout(() => {
          setCopiedAgentId((current) => current === agent.id ? null : current);
        }, 2200);
      }
    } finally {
      setCopyingAgentId(null);
    }
  };

  const refreshActivityScan = async () => {
    setRefreshingActivity(true);
    setError(null);
    try {
      await onRefresh();
      showNotice('Sub-agent activity and signup scan refreshed', 2600);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to refresh sub-agent activity');
    } finally {
      setRefreshingActivity(false);
    }
  };

  const createSubAgent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingAgent(true);
    setError(null);
    try {
      await apiFetch<{ subAgent: SubAgentRecord }>('/api/sub-agents', token, {
        method: 'POST',
        body: JSON.stringify({
          name: agentName,
          email: agentEmail,
          phone: agentPhone,
          referralCode: agentCode
        })
      });
      setAgentName('');
      setAgentEmail('');
      setAgentPhone('');
      setAgentCode('');
      await onRefresh();
      showNotice('Sub-agent created');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create sub-agent');
    } finally {
      setSavingAgent(false);
    }
  };

  const deleteSubAgent = async (agent: SubAgentRecord) => {
    if (!window.confirm(`Delete ${agent.name}? Existing referred clients will stay in Clients and be marked as former sub-agent referrals.`)) return;
    setError(null);
    try {
      await apiFetch<{ success: boolean }>(`/api/sub-agents/${agent.id}`, token, { method: 'DELETE' });
      await onRefresh();
      showNotice('Sub-agent deleted');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete sub-agent');
    }
  };

  const sendAffiliateOnboarding = async (agent: SubAgentRecord) => {
    if (!agent.email) {
      setError('Add an email address before sending affiliate onboarding.');
      return;
    }
    setEmailingAgentId(agent.id);
    setEmailedAgentId(null);
    setError(null);
    try {
      const response = await apiFetch<{ success: boolean; delivery?: { skipped?: boolean; reason?: string } }>(`/api/sub-agents/${agent.id}/onboarding-email`, token, { method: 'POST' });
      if (!response.success || response.delivery?.skipped) {
        setError(response.delivery?.reason || 'Affiliate onboarding email could not be sent.');
        return;
      }
      setEmailedAgentId(agent.id);
      showNotice(`Affiliate onboarding sent to ${agent.email}`, 2600);
      await onRefresh();
      window.setTimeout(() => {
        setEmailedAgentId((current) => current === agent.id ? null : current);
      }, 2600);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Unable to send affiliate onboarding');
    } finally {
      setEmailingAgentId(null);
    }
  };

  const sortedEvents = (agent: SubAgentRecord) => [...(agent.contacts || [])]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  const linkStats = (agent: SubAgentRecord) => {
    const events = sortedEvents(agent);
    const clicks = events.filter((event) => event.status === 'CLICKED').length;
    const contactRegistrations = events.filter((event) => event.status.includes('CLIENT')).length;
    const clientRegistrations = agent.referredClients?.length || 0;
    const registrations = Math.max(contactRegistrations, clientRegistrations);
    const submitted = events.filter((event) => event.status === 'CONTACT_SUBMITTED').length;
    const uniqueIps = new Set(events.map((event) => event.ipAddress).filter(Boolean)).size;
    const lastClient = [...(agent.referredClients || [])].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0] || null;
    const lastEvent = events[0] || null;
    const lastActivityAt = [lastEvent?.createdAt, lastClient?.createdAt]
      .filter(Boolean)
      .sort((a, b) => +new Date(b as string) - +new Date(a as string))[0] || null;
    return {
      events,
      clicks,
      registrations,
      clientRegistrations,
      submitted,
      uniqueIps,
      lastEvent,
      lastClient,
      lastActivityAt
    };
  };

  const sourceLabel = (event: SubAgentContact) => event.sourceUrl || event.landingPath || 'Direct / unknown';

  const locationLabel = (event: SubAgentContact) => event.location || [event.city, event.region, event.country].filter(Boolean).join(', ') || 'Unknown';

  const deviceLabel = (event: SubAgentContact) => {
    const agent = event.userAgent || '';
    if (!agent) return 'Unknown';
    const platform = /iPhone|iPad|iPod/i.test(agent)
      ? 'iOS'
      : /Android/i.test(agent)
        ? 'Android'
        : /Windows/i.test(agent)
          ? 'Windows'
          : /Macintosh|Mac OS/i.test(agent)
            ? 'Mac'
            : 'Device';
    const browser = /Edg\//i.test(agent)
      ? 'Edge'
      : /Chrome\//i.test(agent)
        ? 'Chrome'
        : /Safari\//i.test(agent)
          ? 'Safari'
          : /Firefox\//i.test(agent)
            ? 'Firefox'
            : 'Browser';
    return `${platform} / ${browser}`;
  };

  return (
    <div className="page-grid subagent-page">
      <section className="hero-card hero-card--compact subagent-hero">
        <div>
          <p className="eyebrow">Sub-agent network</p>
          <h1>Referral Agents &amp; Contacts</h1>
          <p>Create a custom social link for each sub-agent. Link events are tracked back to that person so you can see who is sending attention to CredX.</p>
        </div>
        <div className="hero-stats">
          <div className="stat-card"><span>Sub Agents</span><strong>{subAgents.length}</strong></div>
          <div className="stat-card"><span>Active</span><strong>{activeAgents.length}</strong></div>
          <div className="stat-card"><span>Link Events</span><strong>{totalLinkEvents}</strong></div>
          <div className="stat-card"><span>Registrations</span><strong>{totalRegistrations}</strong></div>
          <button type="button" className="stat-card stat-card--interactive" onClick={() => showNewLeadList('ALL')}><span>New Leads</span><strong>{subAgentLeadRows.length}</strong></button>
          <div className="stat-card"><span>Link Type</span><strong>Social</strong></div>
        </div>
      </section>

      <section className="panel two-col affiliate-setup-grid">
        <div>
          <div className="panel-header">
            <div>
              <p className="eyebrow">Hire a sub-agent</p>
              <h2>Create their custom link</h2>
              <p className="helper-text">Give this link to the sub-agent for Instagram, TikTok, Facebook, or any profile bio. Every click records as a link event under that affiliate.</p>
            </div>
          </div>
          <form className="field-stack" onSubmit={createSubAgent}>
            <label>
              <span>Sub-agent name</span>
              <input value={agentName} onChange={(event) => setAgentName(event.target.value)} placeholder="Example: Jasmine Smith" required />
            </label>
            <label>
              <span>Email</span>
              <input value={agentEmail} onChange={(event) => setAgentEmail(event.target.value)} placeholder="agent@example.com" />
            </label>
            <div className="field-grid">
              <label>
                <span>Phone</span>
                <input value={agentPhone} onChange={(event) => setAgentPhone(event.target.value)} placeholder="Optional" />
              </label>
              <label>
                <span>Custom code</span>
                <input value={agentCode} onChange={(event) => setAgentCode(event.target.value)} placeholder="jasmine-credit" />
              </label>
            </div>
            <button type="submit" disabled={savingAgent}>{savingAgent ? 'Creating...' : 'Create Sub-Agent Link'}</button>
            {error ? <p className="helper-text helper-text--error">{error}</p> : null}
            {copyNotice ? <p className="helper-text helper-text--success">{copyNotice}</p> : null}
          </form>
        </div>

        <div>
          <div className="panel-header">
            <div>
              <p className="eyebrow">Workflow</p>
              <h2>How the social link works</h2>
            </div>
          </div>
          <ol className="setup-steps">
            <li><strong>Create the sub-agent</strong><span>CredX generates a custom tracking link tied to their name and code.</span></li>
            <li><strong>They post the link</strong><span>The link can go in Instagram bio, stories, posts, TikTok, Facebook, or DMs.</span></li>
            <li><strong>Prospect clicks</strong><span>The click is saved as a link event under that sub-agent, then the prospect is sent to signup.</span></li>
            <li><strong>Admin reviews link usage</strong><span>Open the dropdown under an affiliate to see clicks, IPs, source pages, device data, and registrations.</span></li>
          </ol>
        </div>
      </section>

      <section className="panel" id="subagent-new-leads">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Sub-agent leads</p>
            <h2>New leads by time</h2>
            <p className="helper-text">Use this when more than one sub-agent has fresh activity. Rows are newest first and click through to the client record or filtered lead row.</p>
          </div>
          <div className="lead-toolbar">
            <select
              className="search-input"
              value={selectedLeadAgentId}
              onChange={(event) => setSelectedLeadAgentId(event.target.value)}
              aria-label="Filter new leads by sub-agent"
            >
              <option value="ALL">All sub-agents</option>
              {subAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </select>
            <button type="button" className="ghost-button" onClick={refreshActivityScan} disabled={refreshingActivity}>
              {refreshingActivity ? 'Scanning...' : 'Refresh Scan'}
            </button>
          </div>
        </div>
        {visibleSubAgentLeadRows.length ? (
          <div className="table-wrapper">
            <table className="data-table lead-pipeline-table">
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Sub-agent</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Interest</th>
                  <th>Submitted</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleSubAgentLeadRows.map((lead) => (
                  <tr key={lead.id} className="clickable-row" onClick={() => openLeadRow(lead)}>
                    <td>
                      <strong>{lead.firstName} {lead.lastName}</strong>
                      <span className="table-subtext">{lead.creditGoal || 'No goal captured'}</span>
                    </td>
                    <td>
                      <strong>{lead.subAgentName}</strong>
                      <span className="table-subtext">{lead.subAgentCode}</span>
                    </td>
                    <td>{lead.email}</td>
                    <td>{lead.phone || '—'}</td>
                    <td>{lead.interest || '—'}</td>
                    <td>{formatDateTime(lead.submittedAt)}</td>
                    <td>
                      <span className={lead.isPendingPayment ? 'status-pill status-pill--warning' : lead.isRegistered ? 'status-pill status-pill--ok' : 'status-pill'}>
                        {lead.statusLabel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state-card">
            <strong>No new sub-agent leads in this view</strong>
            <p>Click Refresh Scan after a test signup or switch back to all sub-agents.</p>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Sub-agent roster</p>
            <h2>Links ready to share</h2>
            <p className="helper-text">Copy the link and give it to the sub-agent for their social profiles.</p>
          </div>
          <button type="button" className="ghost-button" onClick={refreshActivityScan} disabled={refreshingActivity}>
            {refreshingActivity ? 'Scanning...' : 'Refresh Scan'}
          </button>
        </div>
        {subAgents.length ? (
          <div className="table-wrapper affiliate-roster-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Sub Agent</th>
                  <th>Status</th>
                  <th>ID / Code</th>
                  <th>Clicks</th>
                  <th>Signups</th>
                  <th>IPs</th>
                  <th>Last Event</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {subAgents.map((agent) => {
                  const stats = linkStats(agent);
                  return (
                    <React.Fragment key={agent.id}>
                      <tr>
                        <td>
                          <strong>{agent.name}</strong>
                          <span className="table-subtext">{agent.email || agent.phone || 'No contact info on file'}</span>
                        </td>
                        <td><span className={agent.status === 'ACTIVE' ? 'status-pill status-pill--ok' : 'status-pill status-pill--warning'}>{agent.status}</span></td>
                        <td>
                          <strong>{agent.affiliateId}</strong>
                          <span className="table-subtext">{agent.referralCode}</span>
                        </td>
                        <td>{stats.clicks}</td>
                        <td>
                          {stats.registrations ? (
                            <button type="button" className="link-button" onClick={() => showNewLeadList(agent.id)}>
                              {stats.registrations}
                            </button>
                          ) : '0'}
                        </td>
                        <td>{stats.uniqueIps}</td>
                        <td>{stats.lastActivityAt ? formatDate(stats.lastActivityAt) : 'No activity'}</td>
                        <td>
                          <div className="inline-actions affiliate-row-actions">
                            <button type="button" className="ghost-button" aria-label={`Copy ${agent.name} affiliate link`} disabled={copyingAgentId === agent.id} onClick={(event) => { event.preventDefault(); event.stopPropagation(); copyAgentLink(agent); }}>
                              <span className="action-label-full">{copyingAgentId === agent.id ? 'Copying...' : copiedAgentId === agent.id ? 'Copied' : 'Copy'}</span><span className="action-label-short">{copiedAgentId === agent.id ? 'Done' : 'Copy'}</span>
                            </button>
                            <button type="button" className="ghost-button" aria-label={`Email ${agent.name} affiliate onboarding`} disabled={!agent.email || emailingAgentId === agent.id} title={!agent.email ? 'Add an email address before sending onboarding' : undefined} onClick={(event) => { event.preventDefault(); event.stopPropagation(); sendAffiliateOnboarding(agent); }}>
                              <span className="action-label-full">{emailingAgentId === agent.id ? 'Sending...' : emailedAgentId === agent.id ? 'Sent' : 'Email'}</span><span className="action-label-short">{emailedAgentId === agent.id ? 'Sent' : 'Email'}</span>
                            </button>
                            <button type="button" className="ghost-button danger-button" aria-label={`Delete ${agent.name}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); deleteSubAgent(agent); }}>
                              <span className="action-label-full">Delete</span><span className="action-label-short">Del</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                      <tr className="affiliate-usage-row">
                        <td colSpan={8}>
                          <details className="link-usage-details">
                            <summary>View link usage details ({stats.events.length})</summary>
                            <code className="inline-copy-code affiliate-roster-link">{referralUrl(agent.referralCode)}</code>
                            {agent.referredClients?.length ? (
                              <div className="subagent-signup-list">
                                <strong>Referred signups</strong>
                                {agent.referredClients.slice(0, 8).map((client) => (
                                  <button
                                    type="button"
                                    key={client.id}
                                    className="subagent-signup-link"
                                    onClick={() => openLeadRow({ clientId: client.id, email: client.user.email })}
                                  >
                                    <span>{client.user.firstName} {client.user.lastName}</span>
                                    <span>{client.status.replace(/_/g, ' ')}</span>
                                    <span>{formatDateTime(client.createdAt)}</span>
                                  </button>
                                ))}
                              </div>
                            ) : null}
                            {stats.events.length ? (
                              <div className="table-wrapper link-usage-table">
                                <table className="data-table">
                                  <thead>
                                    <tr>
                                      <th>Date / Time</th>
                                      <th>Source</th>
                                      <th>Event</th>
                                      <th>Location</th>
                                      <th>IP</th>
                                      <th>Device</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {stats.events.map((event) => (
                                      <tr key={event.id}>
                                        <td>{formatDateTime(event.createdAt)}</td>
                                        <td>{sourceLabel(event)}</td>
                                        <td><span className="status-pill">{event.status.replace(/_/g, ' ')}</span></td>
                                        <td>{locationLabel(event)}</td>
                                        <td>{event.ipAddress || 'Unknown'}</td>
                                        <td>{deviceLabel(event)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <div className="empty-state-card">No link events for this affiliate yet.</div>
                            )}
                          </details>
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state-card">No sub-agents yet. Create one above to generate the first social link.</div>}
      </section>
    </div>
  );
}

function Overview({ clients, disputes, plans, leadPipelineCount }: { clients: ClientRecord[]; disputes: DisputeRecord[]; plans: Plan[]; leadPipelineCount: number }) {
  const navigate = useNavigate();
  const totalClients = clients.length;
  const activeClients = clients.filter((client) => client.status === 'ACTIVE').length;
  const analysisReady = clients.filter((client) => client.status === 'ANALYSIS_READY').length;
  const pendingDisputes = disputes.filter((dispute) => !['COMPLETED', 'REJECTED'].includes(dispute.status)).length;
  const masterclassStudents = clients.filter(isStudentClient).length;

  const recentActivity = clients
    .flatMap((client) => {
      if (client.activities.length) {
        return client.activities.map((activity) => ({
          id: activity.id,
          clientId: client.id,
          name: `${client.user.firstName} ${client.user.lastName}`,
          text: activity.message,
          createdAt: activity.createdAt
        }));
      }

      return [
        {
          id: `client-${client.id}`,
          clientId: client.id,
          name: `${client.user.firstName} ${client.user.lastName}`,
          text: `Client record updated, status ${client.status.toLowerCase().replace('_', ' ')}`,
          createdAt: client.updatedAt
        }
      ];
    })
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 4);

  return (
    <div className="page-grid">
      <section className="hero-card">
        <div>
          <p className="eyebrow">CredX Admin Portal</p>
          <h1>Client Dashboard &amp; Dispute Operations</h1>
          <p>
            Centralize onboarding, disputes, client tracking, and staff workflow in one live CredX workspace.
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><p className="eyebrow">Quick Stats</p><h2>At a glance</h2></div></div>
        <div className="hero-stats">
          <button className="stat-card stat-card--interactive" onClick={() => navigate('/clients')}><span>Clients</span><strong>{totalClients}</strong></button>
          <button className="stat-card stat-card--interactive" onClick={() => navigate('/leads')}><span>Leads</span><strong>{leadPipelineCount}</strong></button>
          <button className="stat-card stat-card--interactive" onClick={() => navigate('/clients?view=students')}><span>Masterclass Students</span><strong>{masterclassStudents}</strong></button>
          <button className="stat-card stat-card--interactive" onClick={() => navigate('/clients?status=ANALYSIS_READY')}><span>Analysis Ready</span><strong>{analysisReady}</strong></button>
          <button className="stat-card stat-card--interactive" onClick={() => navigate('/clients?status=ACTIVE')}><span>Active Clients</span><strong>{activeClients}</strong></button>
          <button className="stat-card stat-card--interactive" onClick={() => navigate('/disputes')}><span>Pending Disputes</span><strong>{pendingDisputes}</strong></button>
        </div>
      </section>

      <section className="panel two-col">
        <div>
          <h2>Recent Client Activity</h2>
          <ul className="activity-list">
            {recentActivity.length ? recentActivity.map((item) => (
              <li key={item.id} className="clickable-card" onClick={() => navigate(`/clients/${item.clientId}?tab=activity`)}>
                <strong>{item.name}</strong>
                <span>{item.text}</span>
              </li>
            )) : <li><strong>No recent activity</strong><span>Client activity will appear here as work starts moving.</span></li>}
          </ul>
        </div>
        <div>
          <h2>Analysis to Upgrade Pipeline</h2>
          <div className="quick-actions quick-actions--plans">
            {clients.filter((client) => ['INTAKE_RECEIVED', 'ANALYSIS_READY', 'UPGRADE_OFFERED', 'PAST_DUE', 'RESTRICTED'].includes(client.status)).slice(0, 4).map((client) => (
              <div key={client.id} className="plan-card clickable-card" onClick={() => navigate(`/clients/${client.id}?tab=overview`)}>
                <strong>{client.user.firstName} {client.user.lastName}</strong>
                <span>Status {statusLabel(client.status)}</span>
                <span>Timeline {client.estimatedTimelineMonths ? `${client.estimatedTimelineMonths} months` : 'Pending analysis'}</span>
                {client.analysisSummary ? <small>{client.analysisSummary.slice(0, 90)}{client.analysisSummary.length > 90 ? '…' : ''}</small> : <small>Analysis not published yet.</small>}
              </div>
            ))}
          </div>
          <p className="helper-text">Clients should receive analysis and a rough dispute timeline before service upgrade and active dispute work begin.</p>
        </div>
      </section>

      <DisputeSnapshot disputes={disputes} />
    </div>
  );
}

const CLIENT_STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: 'NEW', label: 'New Arrivals' },
  { key: 'LEAD', label: 'Leads' },
  { key: 'STUDENT', label: 'Students' },
  { key: 'CONTRACT_SENT', label: 'Contract Sent' },
  { key: 'INTAKE_RECEIVED', label: 'Intake' },
  { key: 'ANALYSIS_READY', label: 'Analysis Ready' },
  { key: 'UPGRADE_OFFERED', label: 'Upgrade' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'PAST_DUE', label: 'Past Due' },
  { key: 'RESTRICTED', label: 'Restricted' },
  { key: 'CANCELLED', label: 'Cancelled' }
];

function Leads({ token, leads, clients }: { token: string; leads: LeadRecord[]; clients: ClientRecord[] }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const leadRows = useMemo(() => buildLeadPipelineRows(leads, clients), [leads, clients]);

  useEffect(() => {
    setSearchQuery(searchParams.get('search') || '');
  }, [searchParams]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return leadRows;
    const q = searchQuery.toLowerCase();
    return leadRows.filter((l) =>
      l.firstName.toLowerCase().includes(q) ||
      l.lastName.toLowerCase().includes(q) ||
      l.email.toLowerCase().includes(q) ||
      (l.phone || '').toLowerCase().includes(q) ||
      (l.creditGoal || '').toLowerCase().includes(q) ||
      l.sourceLabel.toLowerCase().includes(q) ||
      (l.sourceDetail || '').toLowerCase().includes(q) ||
      (l.interest || '').toLowerCase().includes(q) ||
      l.statusLabel.toLowerCase().includes(q)
    );
  }, [leadRows, searchQuery]);

  const awaitingSignup = filtered.filter((l) => !l.isRegistered).length;
  const pendingPayment = filtered.filter((l) => l.isPendingPayment).length;
  const exportCompatibilityCsv = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await downloadApiFile('/api/compatibility/lead-client-records?format=csv', token, 'credx-lead-client-records.csv');
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Unable to export compatibility CSV');
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Lead Pipeline</p>
          <h2>Leads</h2>
          <p className="helper-text">Track every lead from first source through onboarding, analysis, and payment activation.</p>
          <div className="filter-summary">
            <span>Showing <strong>{filtered.length}</strong> of <strong>{leadRows.length}</strong></span>
            <span>· <strong>{awaitingSignup}</strong> awaiting signup</span>
            <span>· <strong>{pendingPayment}</strong> pending payment</span>
          </div>
          {exportError ? <p className="helper-text helper-text--error">{exportError}</p> : null}
        </div>
        <div className="lead-toolbar">
          <input
            type="search"
            className="search-input"
            placeholder="Search name, email, phone…"
            value={searchQuery}
            onChange={(e) => {
              const next = e.target.value;
              setSearchQuery(next);
              const params = new URLSearchParams(searchParams);
              if (next.trim()) {
                params.set('search', next);
              } else {
                params.delete('search');
                params.delete('focus');
              }
              setSearchParams(params, { replace: true });
            }}
          />
          <button type="button" className="ghost-button" onClick={exportCompatibilityCsv} disabled={exporting}>
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state-card">
          <strong>No leads yet</strong>
          <p>Lead form submissions and unpaid client signups will appear here.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table lead-pipeline-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Goal</th>
                <th>Source</th>
                <th>Interest</th>
                <th>Submitted</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => {
                return (
                  <tr
                    key={lead.id}
                    className={`${lead.clientId ? 'clickable-row' : ''} ${lead.isPendingPayment ? 'lead-row--pending-payment' : ''}`}
                    onClick={() => {
                      if (lead.clientId) navigate(`/clients/${lead.clientId}?tab=overview`);
                    }}
                  >
                    <td>{lead.firstName} {lead.lastName}</td>
                    <td>{lead.email}</td>
                    <td>{lead.phone || '—'}</td>
                    <td>{lead.creditGoal || '—'}</td>
                    <td>
                      <div className="lead-source-cell">
                        <span className={`source-bubble source-bubble--${lead.sourceType}`}>{lead.sourceLabel}</span>
                        <span>{lead.sourceDetail ? `Referred from ${lead.sourceDetail}` : `Referred from ${lead.sourceLabel}`}</span>
                      </div>
                    </td>
                    <td>{lead.interest || '—'}</td>
                    <td>{formatDate(lead.submittedAt)}</td>
                    <td>
                      <span className={lead.isPendingPayment ? 'status-pill status-pill--warning' : lead.isRegistered ? 'status-pill status-pill--ok' : 'status-pill'}>
                        {lead.statusLabel}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Clients({ clients, subAgents, token, onRefresh }: { clients: ClientRecord[]; subAgents: SubAgentRecord[]; token: string; onRefresh: () => Promise<void> }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddClient, setShowAddClient] = useState(false);
  const [manualClient, setManualClient] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    serviceTier: 'ESSENTIAL',
    status: 'LEAD',
    subAgentId: ''
  });
  const [savingClient, setSavingClient] = useState(false);
  const [deletingClientId, setDeletingClientId] = useState<string | null>(null);
  const [clientFormNotice, setClientFormNotice] = useState<string | null>(null);
  const statusFilter = searchParams.get('status');
  const viewParam = searchParams.get('view');
  const activeView: 'all' | 'students' = viewParam === 'students' ? 'students' : 'all';
  const hasActiveFilter = Boolean(statusFilter) || searchQuery.trim().length > 0;

  const isStudent = (c: ClientRecord) => isStudentClient(c);

  const studentClients = clients.filter(isStudent);

  const displayedClients = activeView === 'students' ? studentClients : clients;

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of displayedClients) counts[c.status] = (counts[c.status] || 0) + 1;
    counts.NEW = (counts.LEAD || 0) + (counts.INTAKE_RECEIVED || 0);
    return counts;
  }, [displayedClients]);

  const filteredClients = useMemo(() => {
    let next = displayedClients;
    if (statusFilter === 'NEW') {
      next = next.filter((client) => client.status === 'LEAD' || client.status === 'INTAKE_RECEIVED');
    } else if (statusFilter) {
      next = next.filter((client) => client.status === statusFilter);
    }
    if (!searchQuery.trim()) return next;
    const query = searchQuery.toLowerCase();
    return next.filter(client =>
      client.user.firstName.toLowerCase().includes(query) ||
      client.user.lastName.toLowerCase().includes(query) ||
      client.user.email.toLowerCase().includes(query) ||
      client.status.toLowerCase().includes(query) ||
      clientReferralLabel(client).toLowerCase().includes(query)
    );
  }, [displayedClients, searchQuery, statusFilter]);

  const addManualClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingClient(true);
    setClientFormNotice(null);
    try {
      await apiFetch<{ client: ClientRecord }>('/api/clients', token, {
        method: 'POST',
        body: JSON.stringify(manualClient)
      });
      setManualClient({ firstName: '', lastName: '', email: '', phone: '', serviceTier: 'ESSENTIAL', status: 'LEAD', subAgentId: '' });
      setShowAddClient(false);
      await onRefresh();
      setClientFormNotice('Client added');
    } catch (error) {
      setClientFormNotice(error instanceof Error ? error.message : 'Unable to add client');
    } finally {
      setSavingClient(false);
      window.setTimeout(() => setClientFormNotice(null), 2600);
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    const next = new URLSearchParams(searchParams);
    next.delete('status');
    setSearchParams(next);
  };

  const deleteClient = async (client: ClientRecord) => {
    const fullName = `${client.user.firstName} ${client.user.lastName}`.trim();
    if (!window.confirm(`Delete customer profile for ${fullName}?\n\nThis removes the customer login, profile, documents, agreements, payments, dispute records, tasks, and activity history. This cannot be undone.`)) return;
    setDeletingClientId(client.id);
    setClientFormNotice(null);
    try {
      await apiFetch(`/api/clients/${client.id}`, token, { method: 'DELETE' });
      await onRefresh();
      setClientFormNotice(`${fullName} deleted`);
    } catch (error) {
      setClientFormNotice(error instanceof Error ? error.message : 'Unable to delete customer');
    } finally {
      setDeletingClientId(null);
      window.setTimeout(() => setClientFormNotice(null), 3200);
    }
  };

  const setStatus = (status: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (status) next.set('status', status);
    else next.delete('status');
    setSearchParams(next);
  };

  const switchView = (view: 'all' | 'students') => {
    setSearchQuery('');
    const next = new URLSearchParams();
    if (view === 'students') next.set('view', 'students');
    setSearchParams(next);
  };

  return (
    <div className="page-grid">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Client Management</p>
            <h2>Customers</h2>
            <div className="filter-summary">
              <span>Showing <strong>{filteredClients.length}</strong> of <strong>{displayedClients.length}</strong> {activeView === 'students' ? 'students' : 'clients'}</span>
              {statusFilter ? <span>· <strong>{statusFilter.replace(/_/g, ' ')}</strong></span> : null}
              {searchQuery.trim() ? <span>· search: <strong>"{searchQuery.trim()}"</strong></span> : null}
              {hasActiveFilter ? (
                <button type="button" className="filter-summary__clear" onClick={clearFilters}>
                  Clear · show all ({displayedClients.length})
                </button>
              ) : null}
            </div>
          </div>
          <div className="search-box">
            <input
              type="text"
              placeholder="Search clients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button type="button" className="ghost-button" onClick={() => setShowAddClient((value) => !value)}>
              {showAddClient ? 'Close' : 'Add Client'}
            </button>
          </div>
        </div>

        {showAddClient ? (
          <form className="manual-client-form" onSubmit={addManualClient}>
            <div className="field-grid">
              <label><span>First name</span><input value={manualClient.firstName} onChange={(event) => setManualClient({ ...manualClient, firstName: event.target.value })} required /></label>
              <label><span>Last name</span><input value={manualClient.lastName} onChange={(event) => setManualClient({ ...manualClient, lastName: event.target.value })} required /></label>
              <label><span>Email</span><input type="email" value={manualClient.email} onChange={(event) => setManualClient({ ...manualClient, email: event.target.value })} required /></label>
              <label><span>Phone</span><input value={manualClient.phone} onChange={(event) => setManualClient({ ...manualClient, phone: event.target.value })} /></label>
              <label>
                <span>Status</span>
                <select value={manualClient.status} onChange={(event) => setManualClient({ ...manualClient, status: event.target.value })}>
                  {CLIENT_STATUS_FILTERS.filter((status) => status.key !== 'NEW').map((status) => <option key={status.key} value={status.key}>{status.label}</option>)}
                </select>
              </label>
              <label>
                <span>Tier</span>
                <select value={manualClient.serviceTier} onChange={(event) => setManualClient({ ...manualClient, serviceTier: event.target.value })}>
                  <option value="ESSENTIAL">Essential</option>
                  <option value="AGGRESSIVE">Aggressive</option>
                  <option value="FAMILY">Family</option>
                </select>
              </label>
              <label>
                <span>Referral</span>
                <select value={manualClient.subAgentId} onChange={(event) => setManualClient({ ...manualClient, subAgentId: event.target.value })}>
                  <option value="">Manual / direct client</option>
                  {subAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} ({agent.affiliateId})</option>)}
                </select>
              </label>
            </div>
            <button type="submit" disabled={savingClient}>{savingClient ? 'Adding...' : 'Add Client'}</button>
            {clientFormNotice ? <p className="helper-text">{clientFormNotice}</p> : null}
          </form>
        ) : clientFormNotice ? <p className="helper-text">{clientFormNotice}</p> : null}

        <div className="view-switcher">
          <button
            type="button"
            className={`tab ${activeView === 'all' ? 'active' : ''}`}
            onClick={() => switchView('all')}
          >
            All Clients ({clients.length})
          </button>
          <button
            type="button"
            className={`tab ${activeView === 'students' ? 'active' : ''}`}
            onClick={() => switchView('students')}
          >
            Masterclass Students ({studentClients.length})
          </button>
        </div>

        <div className="filter-bar" role="tablist" aria-label="Filter by status">
          <button
            type="button"
            role="tab"
            aria-selected={!statusFilter}
            className={`filter-chip ${!statusFilter ? 'filter-chip--active' : ''}`}
            onClick={() => setStatus(null)}
          >
            All <span className="filter-chip__count">{displayedClients.length}</span>
          </button>
          {CLIENT_STATUS_FILTERS.filter((s) => (statusCounts[s.key] || 0) > 0 || s.key === statusFilter).map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={statusFilter === s.key}
              className={`filter-chip ${statusFilter === s.key ? 'filter-chip--active' : ''}`}
              onClick={() => setStatus(s.key)}
            >
              {s.label} <span className="filter-chip__count">{statusCounts[s.key] || 0}</span>
            </button>
          ))}
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Referral</th>
                <th>Status</th>
                <th>Tier</th>
                <th>Reports / Uploads</th>
                <th>Analysis</th>
                <th>Disputes</th>
                <th>Last Activity</th>
                {activeView === 'students' ? <th>Lesson Progress</th> : null}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.length ? filteredClients.map((client) => (
                <tr key={client.id} className="clickable-row" onClick={() => navigate(`/clients/${client.id}`)}>
                  <td>
                    <strong>{client.user.firstName} {client.user.lastName}</strong>
                    <div className="cell-subtext">{client.user.email}</div>
                  </td>
                  <td>{clientReferralLabel(client)}</td>
                  <td><span className={statusClass(client.status)}>{clientDisplayStatus(client)}</span></td>
                  <td>{clientTierLabel(client)}</td>
                  <td>{client.documents.length} uploads</td>
                  <td>{client.estimatedTimelineMonths ? `${client.estimatedTimelineMonths} mo` : 'Pending'}</td>
                  <td>{client.disputes.length} items</td>
                  <td>{formatDate(client.updatedAt)}</td>
                  {activeView === 'students' ? (
                    <td>
                      {(() => {
                        const edu = client.progress?.education;
                        const completed = edu?.masterclassProgress?.length || 0;
                        const passed = edu?.masterclassPassedQuizzes?.length || 0;
                        return (
                          <span style={{ fontSize: '0.85rem' }}>
                            {completed}/6 days - {passed} quizzes passed
                          </span>
                        );
                      })()}
                    </td>
                  ) : null}
                  <td>
                    <button
                      type="button"
                      className="ghost-button danger-button"
                      disabled={deletingClientId === client.id}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        deleteClient(client);
                      }}
                    >
                      {deletingClientId === client.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={activeView === 'students' ? 10 : 9} className="empty-row">
                    {searchQuery ? 'No clients match your search.' : activeView === 'students' ? 'No masterclass students yet.' : 'No clients yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Employees({ users, currentUser }: { users: StaffUser[]; currentUser: User | null }) {
  const staffUsers = users
    .filter((staffUser) => staffUser.role === 'ADMIN' || staffUser.role === 'STAFF')
    .sort((a, b) => {
      if (a.id === currentUser?.id) return -1;
      if (b.id === currentUser?.id) return 1;
      if (a.role !== b.role) return a.role === 'ADMIN' ? -1 : 1;
      return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    });
  const headAdmins = staffUsers.filter((staffUser) => staffUser.role === 'ADMIN');
  const inHouseStaff = staffUsers.filter((staffUser) => staffUser.role === 'STAFF');

  const staffTitle = (staffUser: StaffUser) => {
    if (staffUser.role === 'ADMIN') return staffUser.id === currentUser?.id ? 'Head Admin' : 'Admin';
    return 'In-house Staff';
  };

  const accessLabel = (staffUser: StaffUser) => staffUser.role === 'ADMIN'
    ? 'Full access'
    : 'Staff access';

  return (
    <div className="page-grid">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">In-house team</p>
            <h2>Employees</h2>
            <div className="filter-summary">
              <span><strong>{headAdmins.length}</strong> head admin/admin</span>
              <span>· <strong>{inHouseStaff.length}</strong> staff</span>
            </div>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Position</th>
                <th>Access</th>
                <th>Phone</th>
                <th>Added</th>
              </tr>
            </thead>
            <tbody>
              {staffUsers.length ? staffUsers.map((staffUser) => (
                <tr key={staffUser.id}>
                  <td>
                    <strong>{staffUser.firstName} {staffUser.lastName}</strong>
                    <div className="cell-subtext">{staffUser.email}</div>
                  </td>
                  <td>{staffTitle(staffUser)}</td>
                  <td><span className={staffUser.role === 'ADMIN' ? 'status-pill status-pill--ok' : 'status-pill status-pill--warning'}>{accessLabel(staffUser)}</span></td>
                  <td>{staffUser.phone || '-'}</td>
                  <td>{formatDate(staffUser.createdAt)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="empty-row">No in-house staff accounts yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

type ClientWorkspaceTab = 'overview' | 'profile' | 'documents' | 'disputes' | 'activity' | 'analysis';

function ClientDetailRoute({ token }: { token: string }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingClient, setDeletingClient] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestedTab = searchParams.get('tab') as ClientWorkspaceTab | null;
  const [activeTab, setActiveTab] = useState<ClientWorkspaceTab>(requestedTab || 'overview');
  const [statusValue, setStatusValue] = useState('LEAD');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadType, setUploadType] = useState<'credit_report' | 'identity' | 'proof_of_address' | 'other'>('credit_report');
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<ClientProfileForm>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    serviceTier: 'ESSENTIAL',
    currentAddressLine1: '',
    currentAddressLine2: '',
    currentCity: '',
    currentState: '',
    currentPostalCode: '',
    ssnFull: '',
    dob: '',
    portalRestricted: false
  });

  const hydrateProfileForm = (nextClient: ClientDetail) => {
    setProfileForm({
      firstName: nextClient.user.firstName || '',
      lastName: nextClient.user.lastName || '',
      email: nextClient.user.email || '',
      phone: nextClient.user.phone || '',
      serviceTier: nextClient.serviceTier || 'ESSENTIAL',
      currentAddressLine1: nextClient.currentAddressLine1 || '',
      currentAddressLine2: nextClient.currentAddressLine2 || '',
      currentCity: nextClient.currentCity || '',
      currentState: nextClient.currentState || '',
      currentPostalCode: nextClient.currentPostalCode || '',
      ssnFull: '',
      dob: '',
      portalRestricted: !!nextClient.portalRestricted
    });
  };

  useEffect(() => {
    if (requestedTab) setActiveTab(requestedTab);
  }, [requestedTab]);

  const refetchClient = async () => {
    if (!id) return;
    try {
      const updated = await apiFetch<{ client: ClientDetail }>(`/api/clients/${id}`, token);
      setClient(updated.client);
    } catch (err) {
      console.error('Refetch failed', err);
    }
  };

  const submitAdminUpload = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!uploadFile || !client) {
      setUploadError('Choose a file first.');
      return;
    }
    setUploading(true);
    setUploadError(null);
    setUploadMessage(null);
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      fd.append('type', uploadType);
      await apiUpload(`/api/progress/clients/${client.id}/docs/upload`, token, fd);
      setUploadFile(null);
      setUploadMessage(uploadType === 'credit_report'
        ? 'Uploaded — analysis is running in the background. If it does not appear, open Analysis and use Generate from existing reports to retry this uploaded file.'
        : 'Uploaded.');
      await refetchClient();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    apiFetch<{ client: ClientDetail }>(`/api/clients/${id}`, token)
      .then((response) => {
        setClient(response.client);
        setStatusValue(response.client.status);
        hydrateProfileForm(response.client);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, token]);

  const saveStatus = async () => {
    if (!client) return;
    setSaving(true);
    try {
      const response = await apiFetch<{ client: ClientDetail }>(`/api/clients/${client.id}/status`, token, {
        method: 'PATCH',
        body: JSON.stringify({ status: statusValue })
      });
      setClient(response.client);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save status');
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!client) return;
    setSaving(true);
    setProfileNotice(null);
    try {
      const profilePayload = {
        ...profileForm,
        ssnFull: profileForm.ssnFull.replace(/\D/g, '').slice(0, 9)
      } as ClientProfileForm & { dobEncrypted?: string; ssnFull: string };
      if (profileForm.dob.trim()) {
        profilePayload.dobEncrypted = profileForm.dob.trim();
      }
      if (!profilePayload.ssnFull) {
        delete (profilePayload as Partial<typeof profilePayload>).ssnFull;
      }
      const response = await apiFetch<{ client: ClientDetail }>(`/api/clients/${client.id}/profile`, token, {
        method: 'PATCH',
        body: JSON.stringify(profilePayload)
      });
      setClient(response.client);
      setStatusValue(response.client.status);
      hydrateProfileForm(response.client);
      setEditingProfile(false);
      setProfileNotice('Profile updated');
    } catch (err) {
      setProfileNotice(err instanceof Error ? err.message : 'Unable to save profile');
    } finally {
      setSaving(false);
      window.setTimeout(() => setProfileNotice(null), 3200);
    }
  };

  const deleteClientProfile = async () => {
    if (!client) return;
    const fullName = `${client.user.firstName} ${client.user.lastName}`.trim();
    if (!window.confirm(`Delete customer profile for ${fullName}?\n\nThis removes the customer login, profile, documents, agreements, payments, dispute records, tasks, and activity history. This cannot be undone.`)) return;
    setDeletingClient(true);
    setProfileNotice(null);
    try {
      await apiFetch(`/api/clients/${client.id}`, token, { method: 'DELETE' });
      navigate('/clients');
    } catch (err) {
      setProfileNotice(err instanceof Error ? err.message : 'Unable to delete customer');
    } finally {
      setDeletingClient(false);
    }
  };

  if (loading) return <section className="panel"><p className="helper-text">Loading client workspace...</p></section>;
  if (error) return <section className="panel"><div className="error-banner">{error}</div></section>;
  if (!client) return <section className="panel"><p className="helper-text">Client not found.</p></section>;

  const fullName = `${client.user.firstName} ${client.user.lastName}`;
  const disputeItems = client.disputeItems || [];
  const documents = client.documents || [];
  const activities = client.activities || [];
  const progressScores = client.progress?.scores || {};
  const scores = {
    equifax: typeof progressScores.equifax === 'number' ? progressScores.equifax : bureauScoreFromAnalysis(client.progress?.analysis, 'EQUIFAX') ?? client.creditReports?.find((report) => report.bureau === 'EQUIFAX')?.score ?? null,
    experian: typeof progressScores.experian === 'number' ? progressScores.experian : bureauScoreFromAnalysis(client.progress?.analysis, 'EXPERIAN') ?? client.creditReports?.find((report) => report.bureau === 'EXPERIAN')?.score ?? null,
    transunion: typeof progressScores.transunion === 'number' ? progressScores.transunion : bureauScoreFromAnalysis(client.progress?.analysis, 'TRANSUNION') ?? client.creditReports?.find((report) => report.bureau === 'TRANSUNION')?.score ?? null
  };
  const reportProfile = reportProfileRows(client.progress?.analysis);
  const tabs: Array<{ key: ClientWorkspaceTab; label: string }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'profile', label: 'Profile' },
    { key: 'documents', label: 'Documents' },
    { key: 'disputes', label: 'Disputes' },
    { key: 'analysis', label: 'Analysis' },
    { key: 'activity', label: 'Activity' }
  ];

  return (
    <div className="page-grid">
      <section className="hero-card hero-card--compact">
        <div>
          <p className="eyebrow">Client Workspace</p>
          <h1>{fullName}</h1>
          <p>{client.analysisSummary || 'Open each section below to manage profile details, uploads, dispute items, and activity.'}</p>
          <div className="client-workspace-actions">
            <button className="ghost-button" onClick={() => navigate('/clients')}>Back to Customers</button>
          </div>
        </div>
        <div className="hero-stats">
          <div className="stat-card"><span>Status</span><strong>{client.status.replace('_', ' ')}</strong></div>
          <div className="stat-card"><span>Documents</span><strong>{documents.length}</strong></div>
          <div className="stat-card"><span>Dispute Items</span><strong>{disputeItems.length}</strong></div>
        </div>
      </section>

      <section className="client-workspace-single">
        <div className="panel client-workspace-main">
          <header className="client-workspace-header">
            <div className="client-mini-profile">
              <div className="client-avatar">{client.user.firstName?.[0] || 'C'}{client.user.lastName?.[0] || ''}</div>
              <div>
                <strong>{fullName}</strong>
                <div className="cell-subtext">{client.user.email}</div>
              </div>
            </div>
            <label className="client-workspace-section-picker">
              <span className="eyebrow">Section</span>
              <select
                value={activeTab}
                onChange={(e) => setActiveTab(e.target.value as ClientWorkspaceTab)}
              >
                {tabs.map((tab) => (
                  <option key={tab.key} value={tab.key}>{tab.label}</option>
                ))}
              </select>
            </label>
          </header>

          {activeTab === 'overview' ? (
            <div className="client-section-stack">
              <div>
                <h3>Account summary</h3>
                <ul className="detail-list">
                  <li><strong>Email</strong><span>{client.user.email}</span></li>
                  <li><strong>Status</strong><span>{clientDisplayStatus(client)}</span></li>
                  <li><strong>Tier</strong><span>{clientTierLabel(client)}</span></li>
                  <li><strong>Timeline</strong><span>{client.estimatedTimelineMonths ? `${client.estimatedTimelineMonths} months` : 'Pending'}</span></li>
                  <li><strong>Workflow</strong><span>{client.progress?.workflow?.stage || 'Not started'}</span></li>
                </ul>
              </div>
              <div>
                <h3>Latest score snapshot</h3>
                <ul className="detail-list">
                  <li><strong>Equifax</strong><span>{scores.equifax ?? '—'}</span></li>
                  <li><strong>Experian</strong><span>{scores.experian ?? '—'}</span></li>
                  <li><strong>TransUnion</strong><span>{scores.transunion ?? '—'}</span></li>
                  <li><strong>Reports</strong><span>{client.creditReports?.length || 0}</span></li>
                </ul>
              </div>
              <div>
                <h3>Dispute progress</h3>
                <ul className="detail-list">
                  <li><strong>Total items</strong><span>{disputeItems.length}</span></li>
                  <li><strong>Documents</strong><span>{documents.length}</span></li>
                  <li><strong>Last update</strong><span>{formatDate(client.updatedAt)}</span></li>
                  <li><strong>Portal status</strong><span>{client.portalRestricted ? 'Restricted' : 'Open'}</span></li>
                </ul>
              </div>
              <div>
                <h3>Next actions</h3>
                <ul className="detail-list">
                  <li><strong>Workflow stage</strong><span>{client.progress?.workflow?.stage || 'Not started'}</span></li>
                  <li><strong>Next queue</strong><span>{client.progress?.workflow?.next?.join(', ') || 'Pending update'}</span></li>
                </ul>
              </div>
              <MasterclassProgressPanel client={client} progress={client.progress || null} />
            </div>
          ) : null}

          {activeTab === 'profile' ? (
            <div className="client-section-stack">
              <div>
                <div className="profile-section-title">
                  <h3>Profile details</h3>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      if (client) hydrateProfileForm(client);
                      setEditingProfile((value) => !value);
                      setProfileNotice(null);
                    }}
                  >
                    {editingProfile ? 'Cancel Edit' : 'Edit Profile'}
                  </button>
                </div>
                <ul className="detail-list">
                  <li><strong>Name</strong><span>{fullName}</span></li>
                  <li><strong>Email</strong><span>{client.user.email}</span></li>
                  <li><strong>Phone</strong><span>{client.user.phone || 'Not on file'}</span></li>
                  <li><strong>SMS consent</strong><span>{client.progress?.onboarding?.smsConsent ? `Yes${client.progress.onboarding.smsConsentCapturedAt ? ` (${formatDate(client.progress.onboarding.smsConsentCapturedAt)})` : ''}` : 'No / not captured'}</span></li>
                  <li><strong>Address</strong><span>{[client.currentAddressLine1, client.currentAddressLine2, client.currentCity, client.currentState, client.currentPostalCode].filter(Boolean).join(', ') || 'Not on file'}</span></li>
                  <li><strong>Social Security number</strong><span>{formatMaskedSsn(client.ssnLast4)}</span></li>
                  <li><strong>Date of birth</strong><span>{client.dobEncrypted ? 'On file' : 'Not on file'}</span></li>
                  <li><strong>Portal access</strong><span>{client.portalRestricted ? 'Restricted' : 'Open'}</span></li>
                  <li><strong>Student tier</strong><span>{clientTierLabel(client)}</span></li>
                  <li><strong>Student status</strong><span>{clientDisplayStatus(client)}</span></li>
                </ul>
                {reportProfile.length || scores.equifax || scores.experian || scores.transunion ? (
                  <>
                    <h3>Report details</h3>
                    <ul className="detail-list">
                      <li><strong>Equifax score</strong><span>{scores.equifax ?? '—'}</span></li>
                      <li><strong>Experian score</strong><span>{scores.experian ?? '—'}</span></li>
                      <li><strong>TransUnion score</strong><span>{scores.transunion ?? '—'}</span></li>
                      {reportProfile.map((row) => (
                        <li key={row.label}><strong>{row.label}</strong><span>{row.value}</span></li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {editingProfile ? (
                  <form className="profile-edit-form" onSubmit={saveProfile}>
                    <div className="field-grid">
                      <label><span>First name</span><input value={profileForm.firstName} onChange={(event) => setProfileForm({ ...profileForm, firstName: event.target.value })} required /></label>
                      <label><span>Last name</span><input value={profileForm.lastName} onChange={(event) => setProfileForm({ ...profileForm, lastName: event.target.value })} required /></label>
                      <label><span>Email</span><input type="email" value={profileForm.email} onChange={(event) => setProfileForm({ ...profileForm, email: event.target.value })} required /></label>
                      <label><span>Phone</span><input value={profileForm.phone} onChange={(event) => setProfileForm({ ...profileForm, phone: event.target.value })} /></label>
                      <label>
                        <span>Tier</span>
                        <select value={profileForm.serviceTier} onChange={(event) => setProfileForm({ ...profileForm, serviceTier: event.target.value as ClientRecord['serviceTier'] })}>
                          <option value="ESSENTIAL">Essential</option>
                          <option value="AGGRESSIVE">Aggressive</option>
                          <option value="FAMILY">Family</option>
                        </select>
                      </label>
                      <label><span>Social Security number</span><input type="password" inputMode="numeric" maxLength={11} value={profileForm.ssnFull} onChange={(event) => setProfileForm({ ...profileForm, ssnFull: event.target.value.replace(/\D/g, '').slice(0, 9) })} placeholder={client.ssnLast4 ? formatMaskedSsn(client.ssnLast4) : '123456789'} autoComplete="off" /></label>
                      <label><span>Date of birth</span><input type="date" value={profileForm.dob} onChange={(event) => setProfileForm({ ...profileForm, dob: event.target.value })} /></label>
                      <label><span>Address line 1</span><input value={profileForm.currentAddressLine1} onChange={(event) => setProfileForm({ ...profileForm, currentAddressLine1: event.target.value })} /></label>
                      <label><span>Address line 2</span><input value={profileForm.currentAddressLine2} onChange={(event) => setProfileForm({ ...profileForm, currentAddressLine2: event.target.value })} /></label>
                      <label><span>City</span><input value={profileForm.currentCity} onChange={(event) => setProfileForm({ ...profileForm, currentCity: event.target.value })} /></label>
                      <label><span>State</span><input value={profileForm.currentState} onChange={(event) => setProfileForm({ ...profileForm, currentState: event.target.value })} /></label>
                      <label><span>ZIP</span><input value={profileForm.currentPostalCode} onChange={(event) => setProfileForm({ ...profileForm, currentPostalCode: event.target.value })} /></label>
                      <label className="checkbox-field">
                        <input type="checkbox" checked={profileForm.portalRestricted} onChange={(event) => setProfileForm({ ...profileForm, portalRestricted: event.target.checked })} />
                        <span>Restrict portal access</span>
                      </label>
                    </div>
                    <div className="client-workspace-actions">
                      <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Profile'}</button>
                      <button type="button" className="ghost-button" onClick={() => { hydrateProfileForm(client); setEditingProfile(false); }}>Cancel</button>
                    </div>
                    <p className="helper-text">SSN and DOB are encrypted after save. Leave either blank unless adding or replacing it; saved SSNs display with the first five digits covered.</p>
                  </form>
                ) : null}
                {profileNotice ? <p className="helper-text">{profileNotice}</p> : null}
              </div>
              <SignupIntakePanel onboarding={client.progress?.onboarding || null} />
              <MonitoringCredentialsPanel onboarding={client.progress?.onboarding || null} />
              <div>
                <h3>Admin controls</h3>
                <div className="field-grid">
                  <label>
                    <span>Status</span>
                    <select value={statusValue} onChange={(e) => setStatusValue(e.target.value)}>
                      {['LEAD','STUDENT','CONTRACT_SENT','INTAKE_RECEIVED','ANALYSIS_READY','UPGRADE_OFFERED','ACTIVE','PAST_DUE','RESTRICTED','CANCELLED'].map((status) => (
                        <option key={status} value={status}>{status.replace('_', ' ')}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="client-workspace-actions">
                  <button onClick={saveStatus} disabled={saving}>{saving ? 'Saving...' : 'Save Status'}</button>
                  {client.progress?.analysis && client.status !== 'ACTIVE' ? (
                    <button
                      className="ghost-button"
                      style={{ borderColor: '#22c55e', color: '#22c55e', fontWeight: 600 }}
                      onClick={async () => {
                        if (!confirm(`Activate ${fullName} and generate Round 1 dispute letters? No payment is taken now — the fee is billed only after the analysis review is completed and the cancellation window has passed.`)) return;
                        setSaving(true);
                        try {
                          const activateOnce = (override: boolean) =>
                            apiFetch<{ success: boolean; lettersGenerated: number; errors?: string[] }>(`/api/clients/${client.id}/activate`, token, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify(override ? { stateReviewOverride: true } : {})
                            });
                          let res = await activateOnce(false);
                          if (!res.success && res.errors?.some((e) => e.startsWith('STATE_REVIEW_REQUIRED'))) {
                            const msg = res.errors.find((e) => e.startsWith('STATE_REVIEW_REQUIRED')) || '';
                            if (confirm(`${msg.replace('STATE_REVIEW_REQUIRED: ', '')}\n\nOverride and proceed anyway? This is logged for compliance.`)) {
                              res = await activateOnce(true);
                            }
                          }
                          if (res.success) {
                            alert(`✅ ${fullName} is now ACTIVE. ${res.lettersGenerated} dispute letter(s) generated. Bill the setup fee after the analysis review is completed and confirmed.`);
                            const updated = await apiFetch<{ client: ClientDetail }>(`/api/clients/${client.id}`, token);
                            setClient(updated.client);
                            setStatusValue('ACTIVE');
                          } else {
                            alert(`Activation blocked:\n${(res.errors || ['Unknown error']).join('\n')}`);
                          }
                        } catch (err) {
                          alert(`Activation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
                        } finally {
                          setSaving(false);
                        }
                      }}
                      disabled={saving}
                    >
                      🚀 Activate & Generate Letters
                    </button>
                  ) : null}
                  {client.status === 'ACTIVE' ? (
                    <button
                      className="ghost-button"
                      style={{ borderColor: '#a855f7', color: '#a855f7' }}
                      onClick={async () => {
                        const trackingNumber = prompt(`Record proof of mailing for ${fullName} (letters mailed outside Lob).\n\nTracking number (recommended, blank to skip):`);
                        if (trackingNumber === null) return;
                        setSaving(true);
                        try {
                          await apiFetch<{ success: boolean }>(`/api/disputes/mark-mailed`, token, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ clientId: client.id, trackingNumber: trackingNumber.trim() || undefined })
                          });
                          alert(`✅ Mailing proof recorded.`);
                        } catch (err) {
                          alert(`Could not record mailing proof: ${err instanceof Error ? err.message : 'Unknown error'}`);
                        } finally {
                          setSaving(false);
                        }
                      }}
                      disabled={saving}
                    >
                      📮 Record Mailing Proof
                    </button>
                  ) : null}
                  {client.progress?.analysis ? (
                    <button
                      className="ghost-button"
                      style={{ borderColor: '#f59e0b', color: '#b45309', fontWeight: 600 }}
                      onClick={async () => {
                        if (!confirm(`Mark the setup fee as PAID for ${fullName}? Only after the analysis review is completed and the CROA 3-business-day window has passed — the API refuses otherwise.`)) return;
                        setSaving(true);
                        try {
                          const res = await apiFetch<{ success: boolean; payment: any }>(`/api/clients/${client.id}/mark-paid-and-activate`, token, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({})
                          });
                          alert(`✅ Setup fee settled: $${res.payment.amount} ${res.payment.currency}.`);
                          const updated = await apiFetch<{ client: ClientDetail }>(`/api/clients/${client.id}`, token);
                          setClient(updated.client);
                        } catch (err) {
                          alert(`Payment not recorded: ${err instanceof Error ? err.message : 'Unknown error'}`);
                        } finally {
                          setSaving(false);
                        }
                      }}
                      disabled={saving}
                    >
                      💳 Mark Setup Fee Paid
                    </button>
                  ) : null}
                  {client.status === 'ACTIVE' && client.progress?.analysis ? (
                    <button
                      className="ghost-button"
                      style={{ borderColor: '#00c6fb', color: '#00c6fb' }}
                      onClick={async () => {
                        if (!confirm(`Regenerate dispute letters for ${fullName}? This will delete old dispute items and letters, then create fresh ones from the current analysis.`)) return;
                        setSaving(true);
                        try {
                          const res = await apiFetch<{ success: boolean; lettersGenerated: number; documents: any[] }>(`/api/clients/${client.id}/regenerate-letters`, token, { method: 'POST' });
                          if (res.success) {
                            alert(`✅ Regenerated ${res.lettersGenerated} dispute letter(s) for ${fullName}.`);
                            const updated = await apiFetch<{ client: ClientDetail }>(`/api/clients/${client.id}`, token);
                            setClient(updated.client);
                          } else {
                            alert('Regeneration completed but no letters were generated. Check analysis data.');
                          }
                        } catch (err) {
                          alert(`Regeneration failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
                        } finally {
                          setSaving(false);
                        }
                      }}
                      disabled={saving}
                    >
                      🔄 Regenerate Letters
                    </button>
                  ) : null}
                  {client.progress?.analysis ? (
                    <button
                      className="ghost-button"
                      style={{ borderColor: '#7c3aed', color: '#6d28d9', fontWeight: 600 }}
                      onClick={async () => {
                        if (!confirm(`Generate a high-priority CFPB/FTC escalation packet for ${fullName}? This creates a draft packet only; it does not file anything externally.`)) return;
                        setSaving(true);
                        try {
                          const res = await apiFetch<{ success: boolean; document: any; content: string; opportunities: number; lettersIncluded: number; client: ClientDetail }>(`/api/clients/${client.id}/escalation-packet`, token, { method: 'POST' });
                          if (res.success) {
                            setClient(res.client);
                            openPrintDocument(`CFPB / FTC Escalation Packet - ${fullName}`, res.content, { preferDisputeLetter: false });
                            alert(`✅ Escalation packet generated for ${res.opportunities} disputed account(s). ${res.lettersIncluded} high-level letter reference(s) included.`);
                          }
                        } catch (err) {
                          alert(`Escalation packet failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
                        } finally {
                          setSaving(false);
                        }
                      }}
                      disabled={saving}
                    >
                      🧾 CFPB/FTC Packet
                    </button>
                  ) : null}
                  {client.disputeItems && client.disputeItems.length > 0 ? (
                    <button
                      className="ghost-button"
                      style={{ borderColor: '#ef4444', color: '#ef4444' }}
                      onClick={async () => {
                        if (!confirm(`Clear all dispute items and letters for ${fullName}? This cannot be undone.`)) return;
                        setSaving(true);
                        try {
                          await apiFetch<{ success: boolean }>(`/api/clients/${client.id}/clear-disputes`, token, { method: 'POST' });
                          alert(`✅ Cleared all dispute items for ${fullName}.`);
                          const updated = await apiFetch<{ client: ClientDetail }>(`/api/clients/${client.id}`, token);
                          setClient(updated.client);
                        } catch (err) {
                          alert(`Clear failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
                        } finally {
                          setSaving(false);
                        }
                      }}
                      disabled={saving}
                    >
                      🗑️ Clear Disputes
                    </button>
                  ) : null}
                </div>
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <p className="helper-text" style={{ color: '#f87171', marginBottom: '0.5rem' }}>⚠️ Staff action — use only when client needs a fresh start.</p>
                  <button
                    style={{ background: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b', padding: '0.5rem 0.75rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                    onClick={async () => {
                      if (!confirm(`Reset ${fullName}'s file? This will wipe credit reports, uploaded documents, analysis JSON, and reset them to LEAD status. This cannot be undone.`)) return;
                      setSaving(true);
                      try {
                        const res = await apiFetch<{ success: boolean }>(`/api/clients/${client.id}/reset`, token, { method: 'POST' });
                        if (res.success) {
                          const updated = await apiFetch<{ client: ClientDetail }>(`/api/clients/${client.id}`, token);
                          setClient(updated.client);
                          setStatusValue('LEAD');
                        }
                      } catch (err) {
                        alert(`Reset failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
                      } finally {
                        setSaving(false);
                      }
                    }}
                  >🗑️ Reset / Start Fresh</button>
                </div>
              </div>
              {(() => {
                const sig = client.progress?.onboarding?.signature;
                if (!sig || !sig.signedAt) {
                  return (
                    <div>
                      <h3>Signed agreement</h3>
                      <p className="helper-text">No signed agreement on file yet. The client signs during onboarding at /portal.</p>
                    </div>
                  );
                }
                return (
                  <div className="signed-agreement-card">
                    <div className="signed-agreement-card__header">
                      <div className="signed-agreement-card__title">
                        Signed CredX service agreement
                        <small>{sig.signedName || 'Client'} · {formatDate(sig.signedAt)}</small>
                      </div>
                      <span className="signed-agreement-card__badge">✓ Signed</span>
                    </div>
                    <ul className="detail-list">
                      <li><strong>Signed by</strong><span>{sig.signedName || 'Client'}</span></li>
                      <li><strong>Signed at</strong><span>{formatDate(sig.signedAt)}</span></li>
                      {sig.contractId ? <li><strong>Contract ID</strong><span style={{ fontFamily: 'var(--cx-font-mono)', fontSize: '12px' }}>{sig.contractId}</span></li> : null}
                      {sig.ipAddress ? <li><strong>IP address</strong><span>{sig.ipAddress}</span></li> : null}
                    </ul>
                    {sig.dataUrl ? (
                      <div className="signature-display" aria-label="Client signature">
                        <img src={sig.dataUrl} alt={`Signature of ${sig.signedName || 'client'}`} />
                      </div>
                    ) : null}
                    {sig.agreementText ? (
                      <details>
                        <summary>View agreement text</summary>
                        <div>{sig.agreementText}</div>
                      </details>
                    ) : null}
                    {sig.disclosureStatement ? (
                      <details>
                        <summary>View required disclosures</summary>
                        <div>{sig.disclosureStatement}</div>
                      </details>
                    ) : null}
                  </div>
                );
              })()}
              <div className="danger-zone">
                <h3>Delete customer profile</h3>
                <p className="helper-text">Removes this customer login, profile, documents, agreements, payments, dispute records, tasks, and activity history.</p>
                <button type="button" className="ghost-button danger-button" onClick={deleteClientProfile} disabled={deletingClient}>
                  {deletingClient ? 'Deleting...' : 'Delete Customer'}
                </button>
              </div>
            </div>
          ) : null}

          {activeTab === 'documents' ? (
            <div className="client-section-stack">
              <div className="upload-card">
                <div className="upload-card__header">
                  <span className="upload-card__icon" aria-hidden="true">📄</span>
                  <div>
                    <div className="upload-card__title">Upload on behalf of {client.user.firstName}</div>
                    <div className="upload-card__hint">
                      Credit reports trigger the same extraction + analysis pipeline as the client portal.
                    </div>
                  </div>
                </div>
                <form onSubmit={submitAdminUpload} className="field-grid">
                  <label>
                    <span>File</span>
                    <input
                      type="file"
                      accept=".pdf,.html,.htm,.png,.jpg,.jpeg,.webp"
                      onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    />
                  </label>
                  <label>
                    <span>Document type</span>
                    <select value={uploadType} onChange={(e) => setUploadType(e.target.value as typeof uploadType)}>
                      <option value="credit_report">Credit report</option>
                      <option value="identity">Identity document</option>
                      <option value="proof_of_address">Proof of address</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <button type="submit" disabled={uploading || !uploadFile}>
                    {uploading ? 'Uploading…' : 'Upload securely'}
                  </button>
                </form>
                {uploadMessage ? <div className="upload-status upload-status--success">{uploadMessage}</div> : null}
                {uploadError ? <div className="upload-status upload-status--error">{uploadError}</div> : null}
              </div>
              <div>
                <h3>Documents on file ({documents.length})</h3>
                {documents.length ? (
                  <table className="data-table">
                    <thead><tr><th>Document</th><th>Type</th><th>Uploaded</th></tr></thead>
                    <tbody>
                      {documents.map((doc: any) => (
                        <tr key={doc.id}>
                          <td>{doc.fileName || doc.id}</td>
                          <td>{doc.type || 'Unknown'}</td>
                          <td>{formatDate(doc.createdAt || doc.uploadedAt || client.updatedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="helper-text">No documents uploaded yet.</p>}
              </div>
            </div>
          ) : null}

          {activeTab === 'disputes' ? (
            <div className="client-section-stack">
              <div>
                <h3>Dispute items</h3>
                {disputeItems.length ? (
                  <table className="data-table">
                    <thead><tr><th>Furnisher</th><th>Account</th><th>Status</th><th>Round</th><th>Reason</th></tr></thead>
                    <tbody>
                      {disputeItems.map((item) => (
                        <tr key={item.id}>
                          <td>{item.furnisher}</td>
                          <td>{item.accountNumber || '—'}</td>
                          <td><span className={statusClass(item.status)}>{item.status.replace('_', ' ')}</span></td>
                          <td>{item.currentRound}</td>
                          <td>{item.reason || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="helper-text">No dispute items for this client yet.</p>}
              </div>
            </div>
          ) : null}

          {activeTab === 'activity' ? (
            <div className="client-section-stack">
              <div>
                <h3>Activity</h3>
                {activities.length ? (
                  <ul className="activity-list">
                    {activities.map((item) => (
                      <li key={item.id}>
                        <strong>{formatDate(item.createdAt)}</strong>
                        <span>{item.message}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="helper-text">No activity yet.</p>}
              </div>
            </div>
          ) : null}

          {activeTab === 'analysis' ? (
            <AnalysisTab
              token={token}
              clientId={client.id}
              clientName={fullName}
              clientAddress={[
                client.currentAddressLine1,
                client.currentCity,
                client.currentState,
                client.currentPostalCode
              ].filter(Boolean).join(', ') || undefined}
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}

type OnboardingData = NonNullable<NonNullable<ClientDetail['progress']>['onboarding']>;

function formatSignupIntakeValue(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Not provided';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function SignupIntakePanel({ onboarding }: { onboarding: OnboardingData | null }) {
  const intake = (onboarding?.signupIntake || null) as Record<string, unknown> | null;
  if (!intake) {
    return (
      <div>
        <h3>Signup intake</h3>
        <p className="helper-text">No guided signup answers are stored yet.</p>
      </div>
    );
  }

  const rows = [
    ['Path', intake.planPath],
    ['Contact confirmed', intake.contactAuthConfirmed],
    ['Masterclass timeline', intake.masterclassTimeline],
    ['Specialist interest', intake.specialistInterest],
    ['AI scope', intake.aiPlanScope],
    ['Single tier', intake.singleTier],
    ['Family members', intake.familyMembers],
    ['Quoted deposit', intake.quotedDeposit],
    ['Quoted monthly', intake.quotedMonthly]
  ].filter(([, value]) => value !== null && value !== undefined && value !== '');

  return (
    <div>
      <h3>Signup intake</h3>
      <ul className="detail-list">
        {rows.map(([label, value]) => (
          <li key={label as string}><strong>{label as string}</strong><span>{formatSignupIntakeValue(value)}</span></li>
        ))}
      </ul>
      {onboarding?.signupAt ? <p className="helper-text" style={{ marginTop: 8 }}>Submitted {formatDate(onboarding.signupAt)}</p> : null}
    </div>
  );
}

function MonitoringCredentialsPanel({ onboarding }: { onboarding: OnboardingData | null }) {
  const provider = onboarding?.monitoringProvider || null;
  const username = onboarding?.monitoringUsername || null;
  const password = onboarding?.monitoringPassword || null;
  const hasCredentials = Boolean(onboarding?.monitoringHasCredentials && username && password);
  const submittedAt = onboarding?.monitoringSubmittedAt || null;
  const skippedAt = onboarding?.monitoringSkippedAt || null;
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copyPassword = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 1800);
    } catch {
      setCopyState('failed');
      setTimeout(() => setCopyState('idle'), 1800);
    }
  };

  if (!hasCredentials) {
    return (
      <div>
        <h3>Credit report login credentials</h3>
        <p className="helper-text">
          {skippedAt
            ? `Client skipped the monitoring step on ${formatDate(skippedAt)}. Ask them to add credentials from the portal to enable staff pulls.`
            : 'Not on file yet. Once the client submits monitoring credentials from the portal, the username and password show here.'}
        </p>
        {provider ? <p className="helper-text"><strong>Provider on file:</strong> {provider}</p> : null}
      </div>
    );
  }

  return (
    <div>
      <h3>Credit report login credentials</h3>
      <ul className="detail-list">
        <li><strong>Provider</strong><span>{provider}</span></li>
        <li><strong>Username</strong><span style={{ fontFamily: 'var(--cx-font-mono)' }}>{username}</span></li>
        <li>
          <strong>Password</strong>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span aria-hidden="true">••••••••</span>
            <button
              type="button"
              onClick={copyPassword}
              style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
            >
              {copyState === 'copied' ? '✓ Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy password'}
            </button>
          </span>
        </li>
        {submittedAt ? <li><strong>Submitted</strong><span>{formatDate(submittedAt)}</span></li> : null}
      </ul>
      <p className="helper-text" style={{ marginTop: '8px' }}>
        Password is decrypted server-side for staff only and never rendered on screen. Use Copy password to log in on the client's behalf.
      </p>
    </div>
  );
}

function MasterclassProgressPanel({ client, progress }: { client: ClientDetail; progress: ClientDetail['progress'] }) {
  const education = progress?.education || {};
  if (!isMasterclassStudent(progress)) return null;

  const completedDays = education.masterclassProgress || [];
  const passedQuizzes = education.masterclassPassedQuizzes || [];
  const attempts = education.masterclassQuizAttempts || {};
  const totalDays = 6;
  const progressPct = Math.round((completedDays.length / totalDays) * 100);
  const hasAnalysis = !!(client.analysisSummary || progress?.analysis);

  const dayLabels: Record<string, string> = {
    'day-1-credit-fundamentals': 'Day 1 - Credit Fundamentals',
    'day-2-disputes-decoded': 'Day 2 - Disputes Decoded',
    'day-3-advanced-tactics': 'Day 3 - Advanced Tactics',
    'day-4-building-positive-credit': 'Day 4 - Building Positive Credit',
    'day-5-business-credit': 'Day 5 - Business Credit',
    'bonus-generational-wealth': 'Bonus - Generational Wealth'
  };

  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0 }}>Masterclass Progress</h3>
      </div>
      <ul className="detail-list">
        <li><strong>Status</strong><span>{clientDisplayStatus(client)}</span></li>
        <li><strong>Tier</strong><span>{clientTierLabel(client)}</span></li>
        <li><strong>Enrolled</strong><span>{education.enrolledAt ? formatDate(education.enrolledAt) : 'Yes'}</span></li>
        <li><strong>Days completed</strong><span>{completedDays.length} / {totalDays} ({progressPct}%)</span></li>
        <li><strong>Quizzes passed</strong><span>{passedQuizzes.length} / {totalDays}</span></li>
        <li><strong>Uploads</strong><span>{client.documents.length}</span></li>
        <li><strong>Analysis</strong><span>{hasAnalysis ? 'Ready' : 'Open if they opt in for intake review'}</span></li>
        <li><strong>Disputes</strong><span>Blank placeholder for the Day 3 dispute builder</span></li>
      </ul>
      {completedDays.length > 0 ? (
        <div style={{ marginTop: '0.75rem' }}>
          <p style={{ margin: '0 0 0.4rem', fontSize: '0.85rem', opacity: 0.8 }}><strong>Completed lessons:</strong></p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {completedDays.map((slug) => (
              <span key={slug} style={{ background: 'rgba(34,197,94,0.18)', color: '#86efac', border: '1px solid rgba(34,197,94,0.4)', borderRadius: 6, padding: '2px 8px', fontSize: '0.78rem' }}>
                Completed: {dayLabels[slug] || slug}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {Object.keys(attempts).length > 0 ? (
        <div style={{ marginTop: '0.75rem' }}>
          <p style={{ margin: '0 0 0.4rem', fontSize: '0.85rem', opacity: 0.8 }}><strong>Quiz attempts:</strong></p>
          <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.82rem', opacity: 0.85 }}>
            {Object.entries(attempts).map(([slug, log]) => (
              <li key={slug}>
                {dayLabels[slug] || slug}: {log.count} attempt{log.count === 1 ? '' : 's'}
                {log.cooldownUntil && new Date(log.cooldownUntil).getTime() > Date.now() ? ` (cooldown until ${formatDate(log.cooldownUntil)})` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function formatClientAddress(client?: Pick<ClientRecord, 'currentAddressLine1' | 'currentAddressLine2' | 'currentCity' | 'currentState' | 'currentPostalCode'> | null) {
  if (!client) return '[Client Address]';
  const street = [client.currentAddressLine1, client.currentAddressLine2].filter(Boolean).join(', ');
  const cityLine = [client.currentCity, client.currentState, client.currentPostalCode].filter(Boolean).join(', ');
  return [street, cityLine].filter(Boolean).join('\n') || '[Client Address]';
}

function bureauMailingAddress(bureau: DisputeRecord['bureau']) {
  if (bureau === 'EQUIFAX') return 'P.O. Box 740256\nAtlanta, GA 30374-0256';
  if (bureau === 'EXPERIAN') return 'P.O. Box 4500\nAllen, TX 75013';
  return 'P.O. Box 2000\nChester, PA 19016';
}

function buildAdminDisputeLetter(dispute: DisputeRecord, client?: ClientRecord) {
  const clientName = `${dispute.client.user.firstName} ${dispute.client.user.lastName}`;
  const bureau = bureauLabel(dispute.bureau);
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const identityLine = client?.ssnLast4 ? `SSN: ***-**-${client.ssnLast4}` : 'SSN: [last four only]';
  const disputeReason = dispute.reason || 'Account type may be inaccurate or incomplete. Please investigate and correct or delete any unsupported reporting.';
  return `${clientName}
${formatClientAddress(client)}
${identityLine}

${bureau}
${bureauMailingAddress(dispute.bureau)}

${today}

${dispute.creditorName}: Account number: [last four or partial account number only], ${disputeReason}

I am writing to formally dispute the accuracy and validity of certain items appearing on my credit report in accordance with my rights under the Fair Credit Reporting Act (FCRA) (15 U.S.C. § 1681 et seq.) and the Fair Debt Collection Practices Act (FDCPA) (15 U.S.C. § 1692 et seq.). I request investigation of the following item because it may be inaccurate, incomplete, unverifiable, or unauthorized.

1. Unauthorized Third-Party Collections
Under 15 U.S.C. § 1692e, false or misleading debt-collection reporting may violate federal law. I am requesting verification of the alleged debt, including:
• A copy of the original signed contract proving my consent and liability for this debt.
• A chain of custody showing how the debt was acquired.
• Proof that this debt was lawfully assigned in compliance with 15 U.S.C. § 1692g (Validation of Debts).

If the above documentation cannot be provided, please update, correct, or delete any reporting that cannot be verified as accurate and complete.

2. Unauthorized Inquiries
Per 15 U.S.C. § 1681b, a company must have permissible purpose to conduct a hard inquiry on my credit report. I dispute any inquiry connected to this item if it was not authorized by me.

Under 15 U.S.C. § 1681n, any entity that unlawfully accesses my credit file without proper authorization is subject to statutory damages, attorney's fees, and punitive damages.

Request for Investigation and Response
As required under 15 U.S.C. § 1681i (Procedure in Case of Disputed Accuracy), you have 30 days to conduct a reasonable investigation and correct or delete information that cannot be verified as accurate and complete. If the investigation does not address these concerns, I may consider appropriate follow-up options, including a complaint to the Consumer Financial Protection Bureau (CFPB), the Federal Trade Commission (FTC), or the Attorney General's Office.

Please send a written response explaining the verification, corrections, deletions, or other updates made for this disputed account and any related inquiry.

Please send all correspondence to my mailing address listed above.

Sincerely,
${clientName}`;
}

// Print via a hidden iframe rather than window.open. window.open is silently
// blocked when called after an `await` (the user-gesture has expired), which is
// exactly how every print button here is wired — so popups never appeared.
type PrintableSignature = {
  dataUrl?: string;
  signedName?: string | null;
  signedAt?: string | null;
} | null;

function openPrintDocument(title: string, body: string, options?: {
  preferDisputeLetter?: boolean;
  signatureDataUrl?: string | null;
  signatureName?: string | null;
  signatureDate?: string | null;
}) {
  const html = renderBestPrintHtml(title, body, options);
  const existing = document.getElementById('credx-admin-print-frame');
  if (existing) existing.remove();

  const iframe = document.createElement('iframe');
  iframe.id = 'credx-admin-print-frame';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  iframe.srcdoc = html;
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      // ignore
    }
  };
  document.body.appendChild(iframe);
}

function printAdminDisputeQueue(disputes: DisputeRecord[], clients: ClientRecord[] = []) {
  const today = new Date().toLocaleString();
  const clientById = new Map(clients.map((client) => [client.id, client]));
  const letters = disputes.map((d, index) => {
    const client = clientById.get(d.client.id);
    const body = buildAdminDisputeLetter(d, client);
    return `<section class="letter${index > 0 ? ' page-break' : ''}">
      <pre>${escapeAdmin(body)}</pre>
    </section>`;
  }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>CredX Dispute Letters — ${today}</title>
<style>
  body{font-family:Arial,sans-serif;padding:0.55in;color:#111827;line-height:1.35;}
  pre{white-space:pre-wrap;font:13px/1.35 Arial,sans-serif;margin:0;}
  .page-break{page-break-before:always;}
  .empty{color:#64748b;font-size:13px;}
  @page{margin:0.55in;}
  @media print{ body{padding:0;} }
</style></head><body>
  ${letters || '<div class="empty">No dispute letters ready to print.</div>'}
</body></html>`;
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch {} }, 250);
}

function escapeAdmin(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
}

function DisputesRoute({ token, disputes, clients }: { token: string; disputes: DisputeRecord[]; clients: ClientRecord[] }) {
  const active = disputes.filter((item) => !['COMPLETED', 'REJECTED'].includes(item.status));
  const completed = disputes.filter((item) => item.status === 'COMPLETED').length;
  const responseDue = disputes.filter((item) => item.status === 'RESPONSE_DUE').length;
  const [clientFilter, setClientFilter] = useState('');
  const [bureauFilter, setBureauFilter] = useState('');
  const [sortKey, setSortKey] = useState<'status' | 'client' | 'creditor' | 'bureau' | 'round'>('status');

  const clientsById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const bureauOptions = useMemo(() => {
    const set = new Set<DisputeRecord['bureau']>();
    disputes.forEach((d) => { if (d.bureau) set.add(d.bureau); });
    return Array.from(set).sort();
  }, [disputes]);

  const STATUS_ORDER: Record<string, number> = {
    RESPONSE_DUE: 0, IN_DISPUTE: 1, LETTER_SENT: 2, NEW: 3, COMPLETED: 4, REJECTED: 5
  };

  const rows = useMemo(() => {
    let r = disputes.slice();
    if (clientFilter) r = r.filter((d) => d.client.id === clientFilter);
    if (bureauFilter) r = r.filter((d) => d.bureau === bureauFilter);
    r.sort((a, b) => {
      switch (sortKey) {
        case 'client':
          return `${a.client.user.lastName} ${a.client.user.firstName}`.localeCompare(`${b.client.user.lastName} ${b.client.user.firstName}`);
        case 'creditor':
          return (a.creditorName || '').localeCompare(b.creditorName || '');
        case 'bureau':
          return bureauLabel(a.bureau).localeCompare(bureauLabel(b.bureau));
        case 'round':
          return a.round - b.round;
        case 'status':
        default:
          return (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
      }
    });
    return r;
  }, [disputes, clientFilter, bureauFilter, sortKey]);

  const printRow = (d: DisputeRecord) => {
    const client = clientsById.get(d.client.id);
    openPrintDocument(`${d.creditorName} - ${bureauLabel(d.bureau)}`, buildAdminDisputeLetter(d, client));
  };

  return (
    <div className="page-grid">
      <section className="hero-card hero-card--compact">
        <div>
          <p className="eyebrow">Admin Dispute Manager</p>
          <h1>Dispute Operations</h1>
          <p>Work client files from report upload through add dispute, bureau dispute, creditor or collector disputes, response handling, tracking, and results.</p>
        </div>
        <div className="hero-stats">
          <div className="stat-card"><span>Active</span><strong>{active.length}</strong></div>
          <div className="stat-card"><span>Response due</span><strong>{responseDue}</strong></div>
          <div className="stat-card"><span>Completed</span><strong>{completed}</strong></div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Client Dispute Manager</p>
            <h2>Build and track disputes</h2>
            <p className="helper-text">This admin-only section starts from the analysis report so staff can work only the disputeable negative items for a selected client.</p>
          </div>
        </div>
        <DisputeManager token={token} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Global Tracking</p>
            <h2>All dispute items ({rows.length})</h2>
            <p className="helper-text">Print a single letter from any row, or send the filtered set to Bulk Print.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => printAdminDisputeQueue(rows, clients)} disabled={!rows.length}>
              🖨 Bulk print ({rows.length})
            </button>
            <button type="button" className="ghost-button" onClick={() => window.location.assign('/adminportal/print')}>
              Open Bulk Print
            </button>
          </div>
        </div>

        <div className="filter-summary" style={{ marginBottom: '14px', display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="print-center-filter">
            <span>Client</span>
            <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
              <option value="">All clients</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.user.firstName} {c.user.lastName}</option>)}
            </select>
          </label>
          <label className="print-center-filter">
            <span>Bureau</span>
            <select value={bureauFilter} onChange={(e) => setBureauFilter(e.target.value)}>
              <option value="">All bureaus</option>
              {bureauOptions.map((b) => <option key={b} value={b}>{bureauLabel(b)}</option>)}
            </select>
          </label>
          <label className="print-center-filter">
            <span>Sort by</span>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as typeof sortKey)}>
              <option value="status">Status</option>
              <option value="client">Client</option>
              <option value="creditor">Creditor</option>
              <option value="bureau">Bureau</option>
              <option value="round">Round</option>
            </select>
          </label>
        </div>

        {rows.length ? (
          <div className="dispute-route-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Creditor</th>
                  <th>Bureau</th>
                  <th>Status</th>
                  <th>Round</th>
                  <th>Reason</th>
                  <th style={{ textAlign: 'right' }}>Letter</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id}>
                    <td>{d.client.user.firstName} {d.client.user.lastName}</td>
                    <td>{d.creditorName}</td>
                    <td>{bureauLabel(d.bureau)}</td>
                    <td><span className={statusClass(d.status)}>{d.status.replace(/_/g, ' ')}</span></td>
                    <td>Round {d.round}</td>
                    <td>{d.reason || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button type="button" className="ghost-button" onClick={() => printRow(d)}>🖨 Print</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state-card">No dispute items match this filter.</div>
        )}
      </section>
    </div>
  );
}

function PrintCenterRoute({ token, clients, disputes }: { token: string; clients: ClientRecord[]; disputes: DisputeRecord[] }) {
  const [clientFilter, setClientFilter] = useState('');
  const visibleClients = useMemo(() => (
    clientFilter ? clients.filter((client) => client.id === clientFilter) : clients
  ), [clientFilter, clients]);
  const visibleDisputes = useMemo(() => (
    clientFilter ? disputes.filter((dispute) => dispute.client.id === clientFilter) : disputes
  ), [clientFilter, disputes]);
  const visibleDocuments = visibleClients.flatMap((client) => (client.documents || []).map((document) => ({ client, document })));
  const signedAgreements = visibleClients
    .map((client) => ({ client, signature: client.progress?.onboarding?.signature }))
    .filter((entry) => entry.signature?.signedAt);
  const analysisDocs = visibleClients.filter((client) => client.analysisSummary || client.disputePlanSummary);
  const canPrintUploadedDocument = (document: DocumentRecord) => {
    const storage = document.s3Key || '';
    const name = document.fileName || '';
    return /^https?:\/\//i.test(storage) || document.contentType?.startsWith('text/') || name.toLowerCase().endsWith('.txt');
  };

  const printUploadedDocument = async (client: ClientRecord, document: DocumentRecord) => {
    if (!canPrintUploadedDocument(document)) {
      alert('This older upload only has secure metadata on file, not a printable file URL. Re-upload it from the client Documents tab and it will print from here.');
      return;
    }
    try {
      const result = await apiFetch<{ document: DocumentRecord; content?: string; url?: string; signature?: PrintableSignature }>(
        `/api/clients/${client.id}/documents/${document.id}/print`,
        token
      );
      const title = result.document.fileName || document.fileName || 'CredX document';
      if (result.content) {
        const prefersDisputeLayout = result.document?.letterType === 'CONSOLIDATED_DISPUTE'
          || result.document?.type === 'DISPUTE_LETTER'
          || /dispute/i.test(result.document?.fileName || title);
        openPrintDocument(title, result.content, {
          preferDisputeLetter: prefersDisputeLayout,
          signatureDataUrl: result.signature?.dataUrl || null,
          signatureName: result.signature?.signedName || null,
          signatureDate: result.signature?.signedAt || null
        });
        return;
      }
      if (result.url && /^https?:\/\//i.test(result.url)) {
        const w = window.open('', '_blank', 'width=900,height=700');
        if (!w) return;
        const isImage = (result.document.contentType || '').startsWith('image/');
        w.document.open();
        w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeAdmin(title)}</title><style>
          body{margin:0;padding:18px;font-family:Arial,sans-serif;color:#0f172a;}
          iframe{width:100%;height:calc(100vh - 40px);border:0;} img{max-width:100%;height:auto;display:block;margin:0 auto;}
          @media print{body{padding:0;} iframe{height:100vh;}}
        </style></head><body>${isImage ? `<img src="${escapeAdmin(result.url)}" alt="${escapeAdmin(title)}">` : `<iframe src="${escapeAdmin(result.url)}"></iframe>`}<script>window.onload=function(){setTimeout(function(){window.print();},500);}</script></body></html>`);
        w.document.close();
        w.focus();
        return;
      }
      alert('This document is on file, but it does not have a browser-printable file URL yet.');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Unable to print document');
    }
  };

  const printAgreement = (client: ClientRecord) => {
    const sig = client.progress?.onboarding?.signature;
    if (!sig) return;
    const fullName = `${client.user.firstName} ${client.user.lastName}`;
    const body = `Signed CredX Service Agreement

Client: ${fullName}
Email: ${client.user.email}
Signed by: ${sig.signedName || fullName}
Signed at: ${sig.signedAt ? formatDate(sig.signedAt) : 'Not recorded'}
Contract ID: ${sig.contractId || 'Not recorded'}

AGREEMENT
${sig.agreementText || 'Agreement text not stored on this record.'}

REQUIRED DISCLOSURES
${sig.disclosureStatement || 'Disclosure statement not stored on this record.'}

${sig.cancellationNotice?.heading ? `${sig.cancellationNotice.heading}\n${sig.cancellationNotice.text || ''}` : ''}`;
    openPrintDocument(`${fullName} - Signed Agreement`, body);
  };

  const printAnalysis = (client: ClientRecord) => {
    const fullName = `${client.user.firstName} ${client.user.lastName}`;
    const body = `CredX Client Analysis Summary

Client: ${fullName}
Email: ${client.user.email}
Status: ${client.status.replace('_', ' ')}
Tier: ${client.serviceTier}
Estimated timeline: ${client.estimatedTimelineMonths ? `${client.estimatedTimelineMonths} months` : 'Pending'}

ANALYSIS SUMMARY
${client.analysisSummary || 'No analysis summary stored.'}

DISPUTE PLAN
${client.disputePlanSummary || 'No dispute plan summary stored.'}`;
    openPrintDocument(`${fullName} - Analysis Summary`, body);
  };

  return (
    <div className="page-grid">
      <section className="hero-card hero-card--compact">
        <div>
          <p className="eyebrow">Admin Print Center</p>
          <h1>Print packets, letters, and client documents</h1>
          <p>Use this section for dispute letters, uploaded documents, signed agreements, and analysis summaries before mailing or saving to PDF.</p>
        </div>
        <div className="hero-stats">
          <div className="stat-card"><span>Letters</span><strong>{visibleDisputes.length}</strong></div>
          <div className="stat-card"><span>Uploads</span><strong>{visibleDocuments.length}</strong></div>
          <div className="stat-card"><span>Agreements</span><strong>{signedAgreements.length}</strong></div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Print Queue</p>
            <h2>All printable documents</h2>
            <p className="helper-text">Filter to one client or print the full dispute batch from the CredX letter format.</p>
          </div>
          <label className="print-center-filter">
            <span>Client</span>
            <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
              <option value="">All clients</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.user.firstName} {client.user.lastName}</option>)}
            </select>
          </label>
        </div>

        <div className="bulk-print-toolbar">
          <button type="button" onClick={() => printAdminDisputeQueue(visibleDisputes, clients)} disabled={!visibleDisputes.length}>
            🖨 Bulk print dispute letters ({visibleDisputes.length})
          </button>
          <span className="helper-text" style={{ margin: 0 }}>Prints one formatted letter page per dispute item.</span>
        </div>

        <div className="print-center-grid">
          <section className="print-center-section">
            <h3>Dispute letters</h3>
            {visibleDisputes.length ? (
              <div className="print-center-list">
                {visibleDisputes.map((dispute) => {
                  const client = clients.find((item) => item.id === dispute.client.id);
                  return (
                    <div className="print-center-row" key={dispute.id}>
                      <div>
                        <strong>{dispute.creditorName}</strong>
                        <span>{dispute.client.user.firstName} {dispute.client.user.lastName} · {bureauLabel(dispute.bureau)} · Round {dispute.round}</span>
                      </div>
                      <button type="button" className="ghost-button" onClick={() => openPrintDocument(`${dispute.creditorName} - ${bureauLabel(dispute.bureau)}`, buildAdminDisputeLetter(dispute, client))}>Print</button>
                    </div>
                  );
                })}
              </div>
            ) : <p className="helper-text">No dispute letters in this print queue.</p>}
          </section>

          <section className="print-center-section">
            <h3>Uploaded and generated documents</h3>
            {visibleDocuments.length ? (
              <div className="print-center-list">
                {visibleDocuments.map(({ client, document }) => (
                  <div className="print-center-row" key={document.id}>
                    <div>
                      <strong>{document.fileName || document.id}</strong>
                      <span>{client.user.firstName} {client.user.lastName} · {(document.type || 'Document').replace(/_/g, ' ')}{document.bureau ? ` · ${document.bureau}` : ''}{canPrintUploadedDocument(document) ? '' : ' · Re-upload needed'}</span>
                    </div>
                    <button type="button" className="ghost-button" onClick={() => printUploadedDocument(client, document)} disabled={!canPrintUploadedDocument(document)}>Print</button>
                  </div>
                ))}
              </div>
            ) : <p className="helper-text">No uploaded documents found for this filter.</p>}
          </section>

          <section className="print-center-section">
            <h3>Signed agreements</h3>
            {signedAgreements.length ? (
              <div className="print-center-list">
                {signedAgreements.map(({ client, signature }) => (
                  <div className="print-center-row" key={client.id}>
                    <div>
                      <strong>{client.user.firstName} {client.user.lastName}</strong>
                      <span>Signed {signature?.signedAt ? formatDate(signature.signedAt) : 'date pending'}</span>
                    </div>
                    <button type="button" className="ghost-button" onClick={() => printAgreement(client)}>Print</button>
                  </div>
                ))}
              </div>
            ) : <p className="helper-text">No signed agreements found for this filter.</p>}
          </section>

          <section className="print-center-section">
            <h3>Analysis summaries</h3>
            {analysisDocs.length ? (
              <div className="print-center-list">
                {analysisDocs.map((client) => (
                  <div className="print-center-row" key={client.id}>
                    <div>
                      <strong>{client.user.firstName} {client.user.lastName}</strong>
                      <span>{client.status.replace('_', ' ')} · {client.estimatedTimelineMonths ? `${client.estimatedTimelineMonths} month timeline` : 'Timeline pending'}</span>
                    </div>
                    <button type="button" className="ghost-button" onClick={() => printAnalysis(client)}>Print</button>
                  </div>
                ))}
              </div>
            ) : <p className="helper-text">No analysis summaries found for this filter.</p>}
          </section>
        </div>
      </section>
    </div>
  );
}

const BRAND_LOGO = '/images/credx-logo-1.jpg';

function LoginScreen({
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  loading,
  error
}: {
  email: string;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  loading: boolean;
  error: string | null;
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="brand-mark brand-mark--centered">
          <img src={BRAND_LOGO} alt="CredX" className="brand-logo" />
        </div>
        <p className="eyebrow">CredX Staff Access</p>
        <h1>Admin Portal Login</h1>
        <p className="helper-text">
          Use an existing staff or admin account. Stripe is not required for this step, we're wiring the portal first.
        </p>
        <label>
          <span>Email</span>
          <input value={email} onChange={(event) => onEmailChange(event.target.value)} placeholder="admin@credxme.com" />
        </label>
        <label htmlFor="admin-login-password">
          <span>Password</span>
        </label>
        <div className="password-field-row">
          <input id="admin-login-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => onPasswordChange(event.target.value)} placeholder="Password" />
          <button type="button" className="ghost-button password-toggle" onClick={() => setShowPassword((current) => !current)} aria-controls="admin-login-password" aria-label={showPassword ? 'Hide password' : 'Show password'}>
            {showPassword ? 'Hide' : 'View'}
          </button>
        </div>
        {error ? <div className="error-banner">{error}</div> : null}
        <button type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
        <div className="security-note" role="note" aria-label="Security details">
          <span aria-hidden="true" className="security-note-icon">🔒</span>
          <div>
            <strong>Staff-only · Encrypted in transit</strong>
            <span>Admin sessions run over HTTPS and are tied to your role. Failed sign-ins are logged. Sign out when you finish.</span>
          </div>
        </div>
      </form>
    </div>
  );
}

function TasksRoute() {
  const [tasks, setTasks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('credx_admin_tasks') || '[]'); }
    catch { return []; }
  });
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, pending, today, overdue

  const TOKEN_KEY = '***';
  const API_BASE = (import.meta.env.VITE_API_URL ?? '').trim() || '';

  // Auto-fetch clients and sync tasks
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setLoading(false); return; }

    fetch(`${API_BASE}/api/clients`, { headers: { authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        const clientsList = data?.clients || [];
        setClients(clientsList);
        // Sync tasks to match current client states
        syncTasksFromClients(clientsList);
        setLoading(false);
      })
      .catch(() => {
        // Demo mode if API fails
        const demo = [
          { id: 'c1', user: { firstName: 'James', lastName: 'Malloy', email: 'james@example.com' }, status: 'ANALYSIS_READY', serviceTier: 'ESSENTIAL', estimatedTimelineMonths: 4, disputes: [{id:'d1',status:'PENDING'}], documents: [{id:'doc1'}], currentAddressLine1: '123 Main St', currentCity: 'Newark', currentState: 'NJ' },
          { id: 'c2', user: { firstName: 'Darnell', lastName: 'Robinson', email: 'darnell@example.com' }, status: 'ACTIVE', serviceTier: 'AGGRESSIVE', estimatedTimelineMonths: 6, disputes: [{id:'d2',status:'LETTER_SENT'},{id:'d3',status:'PENDING'}], documents: [{id:'doc2'},{id:'doc3'}], currentAddressLine1: '456 Oak Ave', currentCity: 'Jersey City', currentState: 'NJ' },
          { id: 'c3', user: { firstName: 'Yvonne', lastName: 'Thompson', email: 'yvonne@example.com' }, status: 'UPGRADE_OFFERED', serviceTier: 'FAMILY', estimatedTimelineMonths: 3, disputes: [], documents: [{id:'doc4'}], currentAddressLine1: '789 Pine Rd', currentCity: 'Paterson', currentState: 'NJ' },
          { id: 'c4', user: { firstName: 'Anthony', lastName: 'Reyes', email: 'anthony@example.com' }, status: 'INTAKE_RECEIVED', serviceTier: 'ESSENTIAL', estimatedTimelineMonths: null, disputes: [], documents: [], currentAddressLine1: '321 Elm St', currentCity: 'Trenton', currentState: 'NJ' },
        ];
        setClients(demo);
        syncTasksFromClients(demo);
        setLoading(false);
      });
  }, []);

  const syncTasksFromClients = (clientList) => {
    const existing = JSON.parse(localStorage.getItem('credx_admin_tasks') || '[]');
    const now = new Date().toISOString();
    const today = new Date().toISOString().split('T')[0];

    // Map each client to ONE task based on their current status
    const generated = clientList.map(client => {
      const fullName = `${client.user?.firstName || ''} ${client.user?.lastName || ''}`.trim() || 'Client';
      const existingTask = existing.find(t => t.clientId === client.id && !t.completed);

      // Determine task based on status
      let task = null;
      switch (client.status) {
        case 'LEAD':
          task = {
            id: `task_${client.id}_lead`,
            clientId: client.id,
            title: `📞 Contact ${fullName} — schedule onboarding call`,
            priority: 'medium',
            due: today,
            category: 'Client Follow-up',
            notes: `Lead: ${client.user?.email || ''}. Goal: get them to submit intake docs.`,
            action: 'Send onboarding link',
            nextStatus: 'INTAKE_RECEIVED'
          };
          break;

        case 'INTAKE_RECEIVED':
          const missingDocs = 3 - (client.documents?.length || 0);
          task = {
            id: `task_${client.id}_intake`,
            clientId: client.id,
            title: `📄 Collect documents from ${fullName} (${missingDocs > 0 ? missingDocs + ' missing' : 'complete'})`,
            priority: missingDocs > 0 ? 'high' : 'medium',
            due: today,
            category: 'Admin',
            notes: `Address: ${[client.currentAddressLine1, client.currentCity, client.currentState].filter(Boolean).join(', ') || 'Not on file'}. Need ID, proof of address, credit reports.`,
            action: missingDocs > 0 ? 'Send reminder' : 'Run analysis',
            nextStatus: 'ANALYSIS_READY'
          };
          break;

        case 'ANALYSIS_READY':
          task = {
            id: `task_${client.id}_analysis`,
            clientId: client.id,
            title: `📊 Schedule analysis interview with ${fullName}`,
            priority: 'high',
            due: today,
            category: 'Client Follow-up',
            notes: `Analysis complete. Timeline: ${client.estimatedTimelineMonths || '?'} months. Dispute plan ready. Email analysis and schedule call.`,
            action: 'Email analysis + schedule call',
            nextStatus: 'UPGRADE_OFFERED'
          };
          break;

        case 'UPGRADE_OFFERED':
          task = {
            id: `task_${client.id}_upgrade`,
            clientId: client.id,
            title: `💳 Follow up with ${fullName} — plan upgrade decision`,
            priority: 'high',
            due: today,
            category: 'Billing',
            notes: `${client.serviceTier} tier selected. Awaiting payment confirmation or upgrade to full service.`,
            action: 'Send payment link / follow up',
            nextStatus: 'ACTIVE'
          };
          break;

        case 'ACTIVE':
          const pendingDisputes = client.disputes?.filter(d => d.status === 'PENDING').length || 0;
          const sentDisputes = client.disputes?.filter(d => d.status === 'LETTER_SENT').length || 0;
          const responseDue = client.disputes?.filter(d => d.status === 'RESPONSE_DUE').length || 0;

          if (pendingDisputes > 0) {
            task = {
              id: `task_${client.id}_disputes`,
              clientId: client.id,
              title: `📨 Send Round 1 disputes — ${fullName} (${pendingDisputes} items ready)`,
              priority: 'high',
              due: today,
              category: 'Dispute',
              notes: `${pendingDisputes} dispute items generated and ready to mail. Verify address, print, send certified mail.`,
              action: 'Send certified mail',
              nextStatus: null // stays ACTIVE, updates dispute status
            };
          } else if (responseDue > 0) {
            task = {
              id: `task_${client.id}_response`,
              clientId: client.id,
              title: `📋 Review bureau responses — ${fullName} (${responseDue} due)`,
              priority: 'high',
              due: today,
              category: 'Dispute',
              notes: 'Bureau responses received. Review outcomes, plan Round 2 if needed.',
              action: 'Review responses',
              nextStatus: null
            };
          } else if (sentDisputes > 0) {
            task = {
              id: `task_${client.id}_track`,
              clientId: client.id,
              title: `📍 Track delivery — ${fullName} (${sentDisputes} letters sent)`,
              priority: 'medium',
              due: today,
              category: 'Dispute',
              notes: 'Letters sent. Confirm delivery within 3-5 days. Update status when received.',
              action: 'Check tracking',
              nextStatus: null
            };
          } else {
            task = {
              id: `task_${client.id}_active`,
              clientId: client.id,
              title: `✅ Check in with ${fullName} — active client status`,
              priority: 'low',
              due: today,
              category: 'Client Follow-up',
              notes: 'Client is active. No pending disputes. Good time for monthly check-in.',
              action: 'Monthly check-in',
              nextStatus: null
            };
          }
          break;

        case 'PAST_DUE':
          task = {
            id: `task_${client.id}_pastdue`,
            clientId: client.id,
            title: `⚠️ Payment past due — ${fullName}`,
            priority: 'high',
            due: today,
            category: 'Billing',
            notes: 'Payment failed or overdue. Contact client to resolve billing issue.',
            action: 'Call client about payment',
            nextStatus: 'ACTIVE'
          };
          break;

        case 'RESTRICTED':
          task = {
            id: `task_${client.id}_restricted`,
            clientId: client.id,
            title: `🔒 Portal restricted — ${fullName} (needs resolution)`,
            priority: 'medium',
            due: today,
            category: 'Admin',
            notes: 'Client portal is restricted. Determine reason and reactivate or close account.',
            action: 'Review restriction',
            nextStatus: 'ACTIVE'
          };
          break;

        default:
          task = {
            id: `task_${client.id}_general`,
            clientId: client.id,
            title: `📋 Review ${fullName} — status: ${client.status}`,
            priority: 'medium',
            due: today,
            category: 'Admin',
            notes: `Client status: ${client.status}. Review and update as needed.`,
            action: 'Review client',
            nextStatus: null
          };
      }

      return {
        ...task,
        completed: existingTask?.completed || false,
        completedAt: existingTask?.completedAt || null,
        createdAt: existingTask?.createdAt || now,
      };
    });

    // Merge: keep existing completed tasks, replace current ones
    const completedTasks = existing.filter(t => t.completed && !generated.find(g => g.id === t.id));
    const merged = [...generated, ...completedTasks];
    setTasks(merged);
    localStorage.setItem('credx_admin_tasks', JSON.stringify(merged));
  };

  const completeTask = (taskId) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const updated = tasks.map(t => t.id === taskId ? { ...t, completed: true, completedAt: new Date().toISOString() } : t);
    setTasks(updated);
    localStorage.setItem('credx_admin_tasks', JSON.stringify(updated));

    // In production, this would also update the client status via API
    // For now, we show a confirmation
    const client = clients.find(c => c.id === task.clientId);
    if (client && task.nextStatus) {
      alert(`✅ Task complete for ${client.user?.firstName || 'Client'}!\n\nNext step: ${task.nextStatus.replace('_', ' ')}\n\n(Connect API to auto-update client status)`);
    }
  };

  const deleteTask = (id) => {
    if (!confirm('Remove this task from your list?')) return;
    const updated = tasks.filter(t => t.id !== id);
    setTasks(updated);
    localStorage.setItem('credx_admin_tasks', JSON.stringify(updated));
  };

  const clearCompleted = () => {
    if (!confirm('Clear all completed tasks?')) return;
    const updated = tasks.filter(t => !t.completed);
    setTasks(updated);
    localStorage.setItem('credx_admin_tasks', JSON.stringify(updated));
  };

  // Filter tasks
  let filtered = tasks.filter(t => !t.completed);
  if (filter === 'all') filtered = tasks;
  else if (filter === 'completed') filtered = tasks.filter(t => t.completed);
  else if (filter === 'today') filtered = tasks.filter(t => !t.completed && t.due === new Date().toISOString().split('T')[0]);
  else if (filter === 'overdue') filtered = tasks.filter(t => !t.completed && t.due < new Date().toISOString().split('T')[0]);

  // Sort by priority then due date
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  filtered.sort((a, b) => (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1));

  const total = tasks.length;
  const pending = tasks.filter(t => !t.completed).length;
  const completed = tasks.filter(t => t.completed).length;
  const highPriority = tasks.filter(t => !t.completed && t.priority === 'high').length;
  const todayStr = new Date().toISOString().split('T')[0];

  const priorityDot = (p) => {
    const colors = { high: '#dc2626', medium: '#d97706', low: '#16a34a' };
    return <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: colors[p] || '#9ca3af', marginRight: '6px' }} />;
  };

  if (loading) return (
    <div className="page-grid">
      <div className="panel"><p className="helper-text">Loading tasks from your client book...</p></div>
    </div>
  );

  return (
    <div className="page-grid">
      {/* Stats */}
      <div className="task-metrics">
        <div className="stat-card" style={{ borderLeft: '3px solid #00c6fb' }}><span>Total</span><strong>{total}</strong></div>
        <div className="stat-card" style={{ borderLeft: '3px solid #d97706' }}><span>Pending</span><strong style={{ color: '#d97706' }}>{pending}</strong></div>
        <div className="stat-card" style={{ borderLeft: '3px solid #16a34a' }}><span>Done</span><strong style={{ color: '#16a34a' }}>{completed}</strong></div>
        <div className="stat-card" style={{ borderLeft: '3px solid #dc2626' }}><span>High Priority</span><strong style={{ color: '#dc2626' }}>{highPriority}</strong></div>
      </div>

      {/* Filters */}
      <div className="filter-bar task-filter-bar">
        {[
          { key: 'pending', label: 'Pending' },
          { key: 'today', label: 'Due Today' },
          { key: 'overdue', label: 'Overdue' },
          { key: 'all', label: 'All Tasks' },
          { key: 'completed', label: 'Completed' },
        ].map(f => (
          <button key={f.key} className={`filter-chip ${filter === f.key ? 'filter-chip--active' : ''}`} onClick={() => setFilter(f.key)}>
            {f.label} <span className="filter-chip__count">{f.key === 'pending' ? pending : f.key === 'today' ? tasks.filter(t => !t.completed && t.due === todayStr).length : f.key === 'overdue' ? tasks.filter(t => !t.completed && t.due < todayStr).length : f.key === 'completed' ? completed : total}</span>
          </button>
        ))}
        <div className="task-filter-spacer">
          <button className="btn btn-outline" onClick={clearCompleted}>Clear Completed</button>
        </div>
      </div>

      {/* Task List */}
      <section className="panel">
        {filtered.length === 0 ? (
          <div className="empty-state-card" style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>✅</div>
            <strong>No tasks here</strong>
            <p className="helper-text">All caught up! Tasks will appear when clients need action.</p>
          </div>
        ) : (
          <div className="task-list">
            {filtered.map(task => {
              const isOverdue = task.due && !task.completed && task.due < todayStr;
              const client = clients.find(c => c.id === task.clientId);
              return (
                <div key={task.id} className={`task-row ${isOverdue ? 'task-row--overdue' : ''}`}>
                  <div className="task-row__dot">{priorityDot(task.priority)}</div>
                  <div className="task-row__body">
                    <div className="task-row__titleline">
                      <span className="task-row__title">{task.title}</span>
                      <span className={`task-row__tag task-row__tag--${String(task.category || 'admin').toLowerCase().replace(/\s+/g, '-')}`}>
                        {task.category}
                      </span>
                      {isOverdue && <span className="task-row__overdue">OVERDUE</span>}
                    </div>
                    <div className="task-row__meta">
                      {task.due ? new Date(task.due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No date'} · {client?.user ? `${client.user.firstName} ${client.user.lastName}` : 'Client'} · <strong>{task.action}</strong>
                    </div>
                  </div>
                  <div className="task-row__actions">
                    {!task.completed && (
                      <button className="task-row__button" onClick={() => completeTask(task.id)}>
                        Complete
                      </button>
                    )}
                    <button className="task-row__delete" onClick={() => deleteTask(task.id)} aria-label="Delete task">
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function AffiliateDashboard({ token, user, onLogout }: { token: string; user: User; onLogout: () => void }) {
  const [subAgent, setSubAgent] = useState<SubAgentRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ subAgent: SubAgentRecord }>('/api/sub-agents/me', token)
      .then((response) => {
        if (!cancelled) setSubAgent(response.subAgent);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Unable to load affiliate dashboard');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const events = [...(subAgent?.contacts || [])].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const clicks = events.filter((event) => event.status === 'CLICKED').length;
  const signups = events.filter((event) => event.status.includes('CLIENT')).length;
  const uniqueIps = new Set(events.map((event) => event.ipAddress).filter(Boolean)).size;
  const referralLink = subAgent ? `${window.location.origin}/api/sub-agents/track/${encodeURIComponent(subAgent.referralCode)}` : '';

  const sourceLabel = (event: SubAgentContact) => event.sourceUrl || event.landingPath || 'Direct / unknown';
  const deviceLabel = (event: SubAgentContact) => {
    const agent = event.userAgent || '';
    if (!agent) return 'Unknown';
    const platform = /iPhone|iPad|iPod/i.test(agent) ? 'iOS' : /Android/i.test(agent) ? 'Android' : /Windows/i.test(agent) ? 'Windows' : /Macintosh|Mac OS/i.test(agent) ? 'Mac' : 'Device';
    const browser = /Edg\//i.test(agent) ? 'Edge' : /Chrome\//i.test(agent) ? 'Chrome' : /Safari\//i.test(agent) ? 'Safari' : /Firefox\//i.test(agent) ? 'Firefox' : 'Browser';
    return `${platform} / ${browser}`;
  };

  const copyLink = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopyNotice('Affiliate link copied');
      window.setTimeout(() => setCopyNotice(null), 2200);
    } catch {
      setCopyNotice('Copy unavailable in this browser session');
    }
  };

  return (
    <div className="shell affiliate-admin-shell">
      <main className="main">
        <header className="topbar topbar--themed" style={{ ['--section-accent' as string]: '#00c6fb' } as React.CSSProperties}>
          <div>
            <h1 className="top-title">Affiliate dashboard</h1>
            <p className="helper-text">Signed in as {user.email}</p>
          </div>
          <div className="topbar-actions">
            <button className="ghost-button" onClick={onLogout}>Sign out</button>
          </div>
        </header>
        {error ? <div className="error-banner">{error}</div> : null}
        {!subAgent ? (
          <section className="panel"><p className="helper-text">Loading affiliate dashboard...</p></section>
        ) : (
          <div className="page-grid subagent-page">
            <section className="hero-card hero-card--compact subagent-hero">
              <div>
                <p className="eyebrow">CredX affiliate</p>
                <h1>{subAgent.name}</h1>
                <p>Use your link in posts, bios, messages, and campaigns. CredX tracks the activity back to your affiliate record.</p>
              </div>
              <div className="hero-stats">
                <div className="stat-card"><span>Clicks</span><strong>{clicks}</strong></div>
                <div className="stat-card"><span>Signups</span><strong>{signups}</strong></div>
                <div className="stat-card"><span>Unique IPs</span><strong>{uniqueIps}</strong></div>
                <div className="stat-card"><span>Affiliate ID</span><strong>{subAgent.affiliateId}</strong></div>
              </div>
            </section>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Your link</p>
                  <h2>Affiliate link</h2>
                </div>
                <button type="button" className="ghost-button" onClick={copyLink}>Copy link</button>
              </div>
              <code className="inline-copy-code">{referralLink}</code>
              {copyNotice ? <p className="helper-text helper-text--success">{copyNotice}</p> : null}
            </section>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Tracking</p>
                  <h2>Link usage details</h2>
                </div>
              </div>
              {events.length ? (
                <div className="table-wrapper link-usage-table">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Source</th>
                        <th>Event</th>
                        <th>IP</th>
                        <th>Device</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((event) => (
                        <tr key={event.id}>
                          <td>{formatDate(event.createdAt)}</td>
                          <td>{sourceLabel(event)}</td>
                          <td><span className="status-pill">{event.status.replace(/_/g, ' ')}</span></td>
                          <td>{event.ipAddress || 'Unknown'}</td>
                          <td>{deviceLabel(event)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="empty-state-card">No link events yet.</div>}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [disputes, setDisputes] = useState<DisputeRecord[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [subAgents, setSubAgents] = useState<SubAgentRecord[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    if (user?.role === 'AFFILIATE') return;

    let cancelled = false;
    setDataLoading(true);
    setError(null);

    Promise.all([
      apiFetch<{ clients: ClientRecord[] }>('/api/clients', token),
      apiFetch<{ disputes: DisputeRecord[] }>('/api/disputes', token),
      apiFetch<{ plans: Plan[] }>('/api/billing/plans', token),
      apiFetch<{ leads: LeadRecord[] }>('/api/leads', token),
      apiFetch<{ subAgents: SubAgentRecord[] }>('/api/sub-agents', token),
      apiFetch<StaffUser[]>('/api/users', token)
    ])
      .then(([clientsResponse, disputesResponse, plansResponse, leadsResponse, subAgentsResponse, usersResponse]) => {
        if (cancelled) return;
        setClients(clientsResponse.clients);
        setDisputes(disputesResponse.disputes);
        setPlans(plansResponse.plans);
        setLeads(leadsResponse.leads);
        setSubAgents(subAgentsResponse.subAgents);
        setStaffUsers(usersResponse);
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setError(fetchError.message);
        setToken(null);
        setUser(null);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, user?.role]);

  const statsTitle = useMemo(() => {
    if (!user) return 'Staff Mode';
    return `${user.role} Mode`;
  }, [user]);
  const leadPipelineRows = useMemo(() => buildLeadPipelineRows(leads, clients), [leads, clients]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let response: LoginResponse;
      try {
        response = await apiFetch<LoginResponse>('/api/auth/login', undefined, {
          method: 'POST',
          body: JSON.stringify({ email, password })
        });
      } catch (primaryLoginError) {
        response = await apiFetch<LoginResponse>('/api/sub-agents/login', undefined, {
          method: 'POST',
          body: JSON.stringify({ email, password })
        }).catch(() => {
          throw primaryLoginError;
        });
      }

      setToken(response.token);
      setUser(response.user);
      localStorage.setItem(TOKEN_KEY, response.token);
      localStorage.setItem(USER_KEY, JSON.stringify(response.user));
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    setClients([]);
    setDisputes([]);
    setLeads([]);
    setSubAgents([]);
    setStaffUsers([]);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  };

  const refreshSubAgents = async () => {
    if (!token) return;
    const [subAgentsResponse, clientsResponse] = await Promise.all([
      apiFetch<{ subAgents: SubAgentRecord[] }>('/api/sub-agents', token),
      apiFetch<{ clients: ClientRecord[] }>('/api/clients', token)
    ]);
    setSubAgents(subAgentsResponse.subAgents);
    setClients(clientsResponse.clients);
  };

  const refreshClients = async () => {
    if (!token) return;
    const response = await apiFetch<{ clients: ClientRecord[] }>('/api/clients', token);
    setClients(response.clients);
  };

  if (!token) {
    return (
      <LoginScreen
        email={email}
        password={password}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={handleLogin}
        loading={loading}
        error={error}
      />
    );
  }

  if (user?.role === 'AFFILIATE') {
    return <AffiliateDashboard token={token} user={user} onLogout={handleLogout} />;
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand-mark">
          <img src={BRAND_LOGO} alt="CredX" className="brand-logo" />
        </div>
        <nav>
          <NavLink to="/" end>Overview</NavLink>
          <NavLink to="/leads">Leads</NavLink>
          <NavLink to="/clients">Clients</NavLink>
          <NavLink to="/disputes">Disputes</NavLink>
          <NavLink to="/print">Print Center</NavLink>
          <NavLink to="/tasks">Tasks</NavLink>
          <NavLink to="/sub-agents">Sub Agents</NavLink>
          <NavLink to="/employees">Employees</NavLink>
        </nav>
      </aside>
      <main className="main">
        {(() => {
          const path = location.pathname;
          const accent = path.startsWith('/disputes')
            ? '#f59e0b'
            : path.startsWith('/print')
              ? '#14b8a6'
            : path.startsWith('/clients')
              ? '#a855f7'
                : path.startsWith('/leads')
                  ? '#22c55e'
                : path.startsWith('/tasks')
                  ? '#22d3ee'
                : path.startsWith('/sub-agents') || path.startsWith('/employees')
                  ? '#f97316'
                  : '#00c6fb';
          const sectionLabel = path.startsWith('/disputes')
            ? 'Disputes operations'
            : path.startsWith('/print')
              ? 'Print center'
            : path.startsWith('/clients')
              ? 'Client management'
              : path.startsWith('/leads')
                ? 'Lead pipeline'
                : path.startsWith('/tasks')
                  ? 'Task checklist'
                : path.startsWith('/employees')
                  ? 'Employee tools'
                : path.startsWith('/sub-agents')
                  ? 'Sub agents'
                  : 'Operations dashboard';
          return (
            <header className="topbar topbar--themed" style={{ ['--section-accent' as string]: accent } as React.CSSProperties}>
              <div>
                <h1 className="top-title">{sectionLabel}</h1>
              </div>
              <div className="topbar-actions">
                <button className="ghost-button" onClick={handleLogout}>Sign out</button>
              </div>
            </header>
          );
        })()}

        <select
          className="mobile-nav-select"
          value={location.pathname.startsWith('/disputes') ? '/disputes' : location.pathname.startsWith('/print') ? '/print' : location.pathname.startsWith('/clients') ? '/clients' : location.pathname.startsWith('/leads') ? '/leads' : location.pathname.startsWith('/tasks') ? '/tasks' : location.pathname.startsWith('/sub-agents') ? '/sub-agents' : location.pathname.startsWith('/employees') ? '/employees' : '/'}
          onChange={(e) => {
            const value = e.target.value;
            navigate(value);
          }}
          aria-label="Admin section"
        >
          <option value="/">Overview</option>
          <option value="/leads">Leads</option>
          <option value="/clients">Clients</option>
          <option value="/disputes">Disputes</option>
          <option value="/print">Print Center</option>
          <option value="/tasks">Tasks</option>
          <option value="/sub-agents">Sub Agents</option>
          <option value="/employees">Employees</option>
        </select>

        {error ? <div className="error-banner">{error}</div> : null}
        <Routes>
          <Route path="/" element={<Overview clients={clients} disputes={disputes} plans={plans} leadPipelineCount={leadPipelineRows.length} />} />
          <Route path="/leads" element={<Leads token={token} leads={leads} clients={clients} />} />
          <Route path="/clients" element={<Clients clients={clients} subAgents={subAgents} token={token} onRefresh={refreshClients} />} />
          <Route path="/clients/:id" element={<ClientDetailRoute token={token} />} />
          <Route path="/disputes" element={<DisputesRoute token={token} disputes={disputes} clients={clients} />} />
          <Route path="/print" element={<PrintCenterRoute token={token} clients={clients} disputes={disputes} />} />
          <Route path="/tasks" element={<TasksRoute />} />
          <Route path="/sub-agents" element={<SubAgentsRoute token={token} subAgents={subAgents} leads={leads} clients={clients} onRefresh={refreshSubAgents} />} />
          <Route path="/employees" element={<Employees users={staffUsers} currentUser={user} />} />
        </Routes>
        <SiteFooter />
      </main>
    </div>
  );
}
