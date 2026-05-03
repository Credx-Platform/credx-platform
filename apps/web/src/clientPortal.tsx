import React, { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent } from 'react';
import MasterclassDashboard from './components/MasterclassDashboard';
import type { LessonDay } from './masterclassCurriculum';

type User = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  role: 'CLIENT' | 'STAFF' | 'ADMIN';
};

type Client = {
  id: string;
  status: string;
  serviceTier: string;
  analysisSummary?: string | null;
  disputePlanSummary?: string | null;
  estimatedTimelineMonths?: number | null;
  portalRestricted?: boolean;
  ssnLast4?: string | null;
  currentAddressLine1?: string | null;
  currentAddressLine2?: string | null;
  currentCity?: string | null;
  currentState?: string | null;
  currentPostalCode?: string | null;
  dobEncrypted?: string | null;
  tasks?: Array<{ id: string; title: string; description?: string | null; completed: boolean; dueAt?: string | null }>;
  activities?: Array<{ id: string; message: string; createdAt: string; type?: string }>;
  disputes?: Array<{ id: string; creditorName: string; bureau: string; status: string; round: number; reason?: string | null; accountNumber?: string | null }>;
  documents?: Array<{ id: string; fileName: string; type: string; uploadedAt: string }>;
};

type Progress = {
  uploadedDocs?: Array<{ name?: string; type?: string; uploadedAt?: string; fileName?: string; url?: string | null }>;
  workflow?: { stage?: string; updatedAt?: string; next?: string[] };
  onboarding?: { status?: string; signupAt?: string | null; completedAt?: string | null; portalReadyEmailSentAt?: string | null };
  tasks?: Array<{ id: string; title: string; description?: string | null; completed: boolean; dueAt?: string | null }>;
  activities?: Array<{ id: string; message: string; createdAt: string; type?: string }>;
  disputes?: Array<Record<string, unknown>>;
  scores?: { equifax?: number | null; experian?: number | null; transunion?: number | null };
  education?: {
    masterclassEnrolled?: boolean;
    masterclassAccess?: boolean;
    masterclassProgress?: string[];
    affiliateLinks?: Array<{ label: string; url: string; category?: string }>;
    enrolledAt?: string | null;
    offerEligibleUntil?: string | null;
  };
  analysis?: { findings?: string[]; [key: string]: unknown } | null;
  disputeStrategy?: { objective?: string; phases?: string[]; [key: string]: unknown } | null;
};

type LoginResponse = {
  user: User;
  token: string;
};

type SessionResponse = User & {
  client: Client | null;
  progress?: Progress | null;
  leadId?: string | null;
  portalUnlocked?: boolean;
};

type ContractTextResponse = {
  agreement: string;
  disclosure: string;
  company?: { name?: string; address?: string };
};

type WizardState = {
  fullName: string;
  email: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  dob: string;
  ssn: string;
  provider: string;
  monitorUsername: string;
  monitorPassword: string;
};

type PortalTab = 'overview' | 'profile' | 'monitoring' | 'disputes' | 'activity' | 'resources' | 'tasks' | 'analysis' | 'masterclass';

type SecureUploadState = {
  file: File | null;
  type: string;
};

const API_BASE = (import.meta.env.VITE_API_URL ?? '').trim() ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:3000'
    : '');
const TOKEN_KEY = 'credx-client-token';
const USER_KEY = 'credx-client-user';
const BRAND_LOGO = '/images/credx-logo-1.jpg';
const DEFAULT_AFFILIATE_LINKS = [
  { label: 'IdentityIQ Credit Monitoring', url: 'https://www.identityiq.com/', category: 'monitoring' },
  { label: 'MyFreeScoreNow Credit Monitoring', url: 'https://www.myfreescorenow.com/', category: 'monitoring' },
  { label: 'Self — Credit Builder Account', url: 'https://self.inc/refer/16452347', category: 'credit_builder' },
  { label: 'Credit Strong', url: 'https://tracking.creditstrong.com/aff_c?aff_id=1491&offer_id=2&source=MGFinstagram', category: 'credit_builder' },
  { label: 'Rent Reporters', url: 'https://prf.hn/click/camref:1101l52pUS', category: 'credit_builder' },
  { label: 'Credit Builder Card', url: 'https://www.creditbuildercard.com/mgf.html', category: 'credit_builder' },
  { label: 'Grow Credit', url: 'https://growcredit.com/?kid=12BYTD', category: 'credit_builder' },
  { label: 'Kovo', url: 'https://kovocredit.com/r/O6LDVXN7', category: 'credit_builder' },
  { label: 'Ava', url: 'https://meetava.app.link/tdMaQUdV7Rb', category: 'credit_builder' },
  { label: 'Kikoff Credit Builder', url: 'https://kikoff.com/', category: 'credit_builder' },
  { label: 'Annual Credit Report', url: 'https://www.annualcreditreport.com/', category: 'reports' }
] as const;

const defaultWizardState: WizardState = {
  fullName: '',
  email: '',
  phone: '',
  address1: '',
  address2: '',
  city: '',
  state: '',
  zip: '',
  dob: '',
  ssn: '',
  provider: '',
  monitorUsername: '',
  monitorPassword: ''
};

async function apiFetch<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  if (!API_BASE) throw new Error('Missing VITE_API_URL for this deployment');

  const headers = new Headers(init?.headers ?? {});
  if (!headers.has('content-type') && init?.body) headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(body?.error ?? `Request failed: ${response.status}`);
  return body as T;
}

async function apiUpload<T>(path: string, token: string, formData: FormData): Promise<T> {
  if (!API_BASE) throw new Error('Missing VITE_API_URL for this deployment');
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: formData
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(body?.error ?? `Request failed: ${response.status}`);
  return body as T;
}

function prettyStatus(value?: string | null) {
  return (value || 'unknown').toLowerCase().replace(/_/g, ' ');
}

function formatDate(value?: string | null) {
  if (!value) return 'Pending';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Pending';
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function maskDob(value?: string | null) {
  if (!value) return 'Not saved';
  const [year, month] = value.split('-');
  return month && year ? `••/${month}/${year}` : 'Saved securely';
}

function maskSensitiveInput(value: string, mode: 'ssn' | 'dob') {
  if (!value) return '';
  if (mode === 'ssn') {
    const digits = value.replace(/\D/g, '').slice(0, 9);
    if (digits.length <= 4) return digits;
    return `***-**-${digits.slice(-4)}`;
  }
  if (mode === 'dob') {
    const trimmed = value.slice(0, 10);
    return trimmed.length >= 7 ? `••/${trimmed.slice(5, 7)}/${trimmed.slice(0, 4)}` : 'Saved securely';
  }
  return value;
}

function normalizeDisputes(client: Client | null, progress: Progress | null) {
  const fromClient = (client?.disputes || []).map((item) => ({
    id: item.id,
    account: item.creditorName,
    bureau: item.bureau,
    status: item.status,
    round: item.round,
    reason: item.reason || 'Reason pending',
    changed: item.status === 'COMPLETED' ? 'Resolved' : item.status === 'REJECTED' ? 'Verified as reported' : 'In progress',
    accountNumber: item.accountNumber || null
  }));

  const fromProgress = (progress?.disputes || []).map((item, index) => {
    const record = item as Record<string, unknown>;
    return {
      id: String(record.id || `progress-${index}`),
      account: String(record.accountName || record.title || 'Reported account'),
      bureau: String(record.bureau || 'All bureaus'),
      status: String(record.status || 'drafted').toUpperCase(),
      round: Number(record.round || 1),
      reason: String(record.reason || record.request || 'Investigation pending'),
      changed: String(record.notes || record.type || 'Draft created'),
      accountNumber: record.accountNumber ? String(record.accountNumber) : null
    };
  });

  return [...fromClient, ...fromProgress].filter((item, index, arr) => arr.findIndex((other) => other.id === item.id) === index);
}

type ScoreBand = { label: string; color: string; range: string };

function scoreBand(score: number): ScoreBand {
  if (score >= 800) return { label: 'Excellent', color: '#2dd4bf', range: '800–850' };
  if (score >= 740) return { label: 'Very Good', color: '#00c6fb', range: '740–799' };
  if (score >= 670) return { label: 'Good', color: '#a3e635', range: '670–739' };
  if (score >= 580) return { label: 'Fair', color: '#facc15', range: '580–669' };
  return { label: 'Poor', color: '#f87171', range: '300–579' };
}

type SectionTheme = { title: string; desc: string; accent: string };
const SECTION_THEMES: Record<Exclude<PortalTab, 'overview'>, SectionTheme> = {
  profile: { title: 'Your Profile', desc: 'Personal info, secure documents, and identity verification details.', accent: '#a855f7' },
  monitoring: { title: 'Credit Monitoring', desc: 'Now lives inside Analysis & Reports — upload, review, and connect monitoring in one place.', accent: '#00c6fb' },
  disputes: { title: 'Disputes', desc: 'Track active dispute items, bureau status, and round progression.', accent: '#f59e0b' },
  activity: { title: 'Activity', desc: 'Timeline of what just happened on your file and what comes next.', accent: '#2dd4bf' },
  resources: { title: 'Credit Builders', desc: 'Partner tools and accounts to rebuild your credit profile.', accent: '#84cc16' },
  tasks: { title: 'Tasks', desc: 'Your action items and what CredX needs from you next.', accent: '#ec4899' },
  analysis: { title: 'Analysis & Reports', desc: 'Upload your credit report, run analysis, and connect monitoring — all in one place.', accent: '#2563eb' },
  masterclass: { title: '5-Day Masterclass', desc: 'Your complete credit repair curriculum — videos, slides, key terms, and action steps.', accent: '#00c6fb' }
};

function SectionHeader({ section }: { section: Exclude<PortalTab, 'overview'> }) {
  const theme = SECTION_THEMES[section];
  return (
    <section
      className="hero-card hero-card--section"
      style={{ ['--section-accent' as any]: theme.accent }}
    >
      <div>
        <h1>{theme.title}</h1>
        <p>{theme.desc}</p>
      </div>
    </section>
  );
}

function CreditScoreGauge({ bureau, score }: { bureau: string; score: number | null }) {
  const hasScore = typeof score === 'number' && Number.isFinite(score);
  const pct = hasScore ? Math.max(0, Math.min(1, ((score as number) - 300) / 550)) : 0;
  const band = hasScore ? scoreBand(score as number) : { label: 'Pending', color: '#8ea4bb', range: '300–850' };

  return (
    <div
      className="score-gauge"
      style={{
        ['--score-color' as any]: band.color,
        ['--score-pct' as any]: pct.toFixed(4)
      }}
    >
      <div className="score-gauge-bureau">{bureau}</div>
      <div className="score-gauge-ring" aria-hidden="true">
        <div className="score-gauge-center">
          <div className="score-gauge-value">{hasScore ? score : '—'}</div>
          <div className="score-gauge-band">{band.label}</div>
        </div>
      </div>
      <div className="score-gauge-foot">
        <span>300</span>
        <span>850</span>
      </div>
    </div>
  );
}

function ClientLogin({
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onResetPassword,
  error,
  loading,
  resetMessage
}: {
  email: string;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onResetPassword: () => void;
  error: string | null;
  loading: boolean;
  resetMessage: string | null;
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="auth-shell client-auth-shell">
      <form className="auth-card client-auth-card" onSubmit={onSubmit} method="post" autoComplete="on" noValidate>
        <div className="brand-mark brand-mark--centered">
          <img src={BRAND_LOGO} alt="CredX" className="brand-logo" />
        </div>
        <p className="eyebrow">CredX Client Access</p>
        <h1>Client Portal Login</h1>
        <p className="helper-text">Sign in to see your credit monitoring, analysis, account activity, disputes, and profile.</p>
        <p className="helper-text">If this is your first time signing in, enter your email and tap <strong>Reset password</strong> to get your secure setup link.</p>
        <label htmlFor="client-login-email">
          <span>Email</span>
          <input id="client-login-email" name="email" type="email" autoComplete="username email" autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="email" enterKeyHint="next" value={email} onChange={(event) => onEmailChange(event.target.value)} placeholder="you@example.com" />
        </label>
        <label htmlFor="client-login-password">
          <span>Password</span>
        </label>
        <div className="password-field-row">
          <input id="client-login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="go" value={password} onChange={(event) => onPasswordChange(event.target.value)} placeholder="Password" />
          <button type="button" className="ghost-button password-toggle" onClick={() => setShowPassword((current) => !current)} aria-controls="client-login-password" aria-label={showPassword ? 'Hide password' : 'Show password'}>
            {showPassword ? 'Hide' : 'View'}
          </button>
        </div>
        {error ? <div className="error-banner">{error}</div> : null}
        {resetMessage ? <div className="helper-text">{resetMessage}</div> : null}
        <button type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
        <button type="button" className="ghost-button" onClick={onResetPassword} disabled={loading} style={{ width: '100%' }}>Reset password</button>
      </form>
    </div>
  );
}

function OnboardingWizard({ token, user, progress, onProgressUpdated }: { token: string; user: User; progress: Progress | null; onProgressUpdated: (nextProgress: Progress) => void; }) {
  const [contractText, setContractText] = useState<ContractTextResponse | null>(null);
  const [loadingContract, setLoadingContract] = useState(true);
  const [busyStep, setBusyStep] = useState<string | null>(null);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [signatureName, setSignatureName] = useState(`${user.firstName} ${user.lastName}`.trim());
  const [contractAgreed, setContractAgreed] = useState(false);
  const [docUpload, setDocUpload] = useState<SecureUploadState>({ file: null, type: 'credit_report' });
  const [wizardState, setWizardState] = useState<WizardState>({ ...defaultWizardState, fullName: `${user.firstName} ${user.lastName}`.trim(), email: user.email, phone: user.phone || '' });
  const affiliateLinks = (progress?.education?.affiliateLinks?.length ? progress.education.affiliateLinks : DEFAULT_AFFILIATE_LINKS).filter((item) => ['monitoring', 'credit_builder'].includes(String(item.category || '').toLowerCase()));

  useEffect(() => {
    let cancelled = false;
    setLoadingContract(true);
    apiFetch<ContractTextResponse>('/api/contracts/text', token)
      .then((response) => { if (!cancelled) setContractText(response); })
      .catch((error) => { if (!cancelled) setWizardError(error.message); })
      .finally(() => { if (!cancelled) setLoadingContract(false); });
    return () => { cancelled = true; };
  }, [token]);

  const stage = progress?.workflow?.stage || 'signup_received';
  const completedAt = progress?.onboarding?.completedAt;
  const needsContract = ['signup_received', 'contract_pending'].includes(stage);
  const needsApplication = ['contract_signed', 'application_pending'].includes(stage);
  const needsMonitoring = stage === 'application_completed';
  const needsUpload = ['portal_unlocked', 'upload_credit_report', 'credit_report_received'].includes(stage) && !completedAt;

  async function refreshProgress() {
    const nextProgress = await apiFetch<Progress>('/api/progress/me', token);
    onProgressUpdated(nextProgress);
  }

  function setField<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setWizardState((current) => ({ ...current, [key]: value }));
  }

  async function submitContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWizardError(null);
    setBusyStep('contract');
    try {
      await apiFetch('/api/contracts', token, { method: 'POST', body: JSON.stringify({ signed_name: signatureName, agreed: contractAgreed }) });
      await refreshProgress();
    } catch (error) {
      setWizardError(error instanceof Error ? error.message : 'Unable to sign contract');
    } finally {
      setBusyStep(null);
    }
  }

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWizardError(null);
    setBusyStep('application');
    try {
      await apiFetch('/api/applications', token, {
        method: 'POST',
        body: JSON.stringify({
          full_name: wizardState.fullName,
          email: wizardState.email,
          phone: wizardState.phone,
          address_line1: wizardState.address1,
          address_line2: wizardState.address2,
          city: wizardState.city,
          state: wizardState.state,
          zip: wizardState.zip,
          dob: wizardState.dob,
          ssn: wizardState.ssn
        })
      });
      await refreshProgress();
    } catch (error) {
      setWizardError(error instanceof Error ? error.message : 'Unable to save intake');
    } finally {
      setBusyStep(null);
    }
  }

  async function submitMonitoring(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWizardError(null);
    setBusyStep('monitoring');
    try {
      await apiFetch('/api/monitoring', token, {
        method: 'POST',
        body: JSON.stringify({ provider: wizardState.provider, username: wizardState.monitorUsername, password: wizardState.monitorPassword })
      });
      await refreshProgress();
    } catch (error) {
      setWizardError(error instanceof Error ? error.message : 'Unable to save monitoring');
    } finally {
      setBusyStep(null);
    }
  }

  async function skipMonitoring() {
    setWizardError(null);
    setBusyStep('monitoring');
    try {
      await apiFetch('/api/monitoring/skip', token, { method: 'POST', body: '{}' });
      await refreshProgress();
    } catch (error) {
      setWizardError(error instanceof Error ? error.message : 'Unable to skip monitoring step');
    } finally {
      setBusyStep(null);
    }
  }

  async function submitDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!docUpload.file) {
      setWizardError('Choose a file first.');
      return;
    }
    setWizardError(null);
    setBusyStep('upload');
    try {
      const formData = new FormData();
      formData.append('file', docUpload.file);
      formData.append('type', docUpload.type);
      await apiUpload('/api/progress/me/docs/upload', token, formData);
      setDocUpload({ file: null, type: 'credit_report' });
      await refreshProgress();
    } catch (error) {
      setWizardError(error instanceof Error ? error.message : 'Unable to save document');
    } finally {
      setBusyStep(null);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header"><div><p className="eyebrow">Onboarding</p><h2>Finish your CredX setup</h2></div></div>
      {wizardError ? <div className="error-banner">{wizardError}</div> : null}
      <div className="dispute-list">
        {loadingContract ? <div className="empty-state-card">Loading your agreement...</div> : null}
        {needsContract && contractText ? <form className="dispute-card-live" onSubmit={submitContract}><div className="dispute-card-top"><strong>Step 1, sign your agreement</strong></div><div className="dispute-meta" style={{ display: 'block' }}><p style={{ whiteSpace: 'pre-wrap', marginBottom: '1rem' }}>{contractText.agreement}</p><p style={{ whiteSpace: 'pre-wrap', marginBottom: '1rem' }}>{contractText.disclosure}</p><input className="chat-input" value={signatureName} onChange={(e) => setSignatureName(e.target.value)} placeholder="Type your full name" /><label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginTop: '1rem' }}><input type="checkbox" checked={contractAgreed} onChange={(e) => setContractAgreed(e.target.checked)} /><span>I have read and agree to the contract and disclosures.</span></label><button className="ghost-button" type="submit" disabled={busyStep === 'contract' || !contractAgreed || !signatureName.trim()} style={{ marginTop: '1rem' }}>{busyStep === 'contract' ? 'Signing...' : 'Sign contract'}</button></div></form> : null}
        {needsApplication ? <form className="dispute-card-live" onSubmit={submitApplication}><div className="dispute-card-top"><strong>Step 2, complete intake</strong><span className="security-note-inline" aria-label="Encrypted">🔒 Encrypted</span></div><div className="field-grid"><input className="chat-input" value={wizardState.fullName} onChange={(e) => setField('fullName', e.target.value)} placeholder="Full name" /><input className="chat-input" value={wizardState.email} onChange={(e) => setField('email', e.target.value)} placeholder="Email" /><input className="chat-input" value={wizardState.phone} onChange={(e) => setField('phone', e.target.value)} placeholder="Phone" /><input className="chat-input" value={wizardState.address1} onChange={(e) => setField('address1', e.target.value)} placeholder="Address line 1" /><input className="chat-input" value={wizardState.address2} onChange={(e) => setField('address2', e.target.value)} placeholder="Address line 2" /><input className="chat-input" value={wizardState.city} onChange={(e) => setField('city', e.target.value)} placeholder="City" /><input className="chat-input" value={wizardState.state} onChange={(e) => setField('state', e.target.value)} placeholder="State" /><input className="chat-input" value={wizardState.zip} onChange={(e) => setField('zip', e.target.value)} placeholder="ZIP" /><input className="chat-input" value={wizardState.dob} onChange={(e) => setField('dob', e.target.value)} placeholder="Date of birth (YYYY-MM-DD)" /><input className="chat-input" type="password" value={wizardState.ssn} onChange={(e) => setField('ssn', e.target.value)} placeholder="SSN" autoComplete="off" /><button className="ghost-button" type="submit" disabled={busyStep === 'application'}>{busyStep === 'application' ? 'Saving...' : 'Save intake'}</button></div><p className="helper-text" style={{ marginTop: '0.5rem' }}>SSN and date of birth are encrypted before they're saved. Only the last 4 digits of your SSN are ever shown back to you.</p></form> : null}
        {needsMonitoring ? <form className="dispute-card-live" onSubmit={submitMonitoring}>
          <div className="dispute-card-top">
            <strong>Step 3, connect credit monitoring (optional)</strong>
            <span className="security-note-inline" aria-label="Optional">Optional</span>
          </div>
          <p className="helper-text" style={{ marginBottom: '0.75rem' }}>
            You can connect now or do it later from inside your portal. Your password setup link will be emailed as soon as this step is either submitted or skipped.
          </p>
          <div className="field-grid">
            <select className="chat-input" value={wizardState.provider} onChange={(e) => setField('provider', e.target.value)}><option value="">Select provider</option><option value="IdentityIQ">IdentityIQ</option><option value="MyFreeScoreNow">MyFreeScoreNow</option></select>
            <input className="chat-input" value={wizardState.monitorUsername} onChange={(e) => setField('monitorUsername', e.target.value)} placeholder="Monitoring username" />
            <input className="chat-input" type="password" value={wizardState.monitorPassword} onChange={(e) => setField('monitorPassword', e.target.value)} placeholder="Monitoring password" />
            <button className="ghost-button" type="submit" disabled={busyStep === 'monitoring' || !wizardState.provider}>{busyStep === 'monitoring' ? 'Saving...' : 'Save monitoring'}</button>
            <button className="ghost-button" type="button" onClick={skipMonitoring} disabled={busyStep === 'monitoring'} style={{ background: 'transparent' }}>{busyStep === 'monitoring' ? 'Saving...' : 'Skip for now'}</button>
          </div>
          <div className="helper-link-grid">{affiliateLinks.map((item, index) => <a key={`${item.url}-${index}`} className="resource-link-card" href={item.url} target="_blank" rel="noreferrer"><strong>{item.label}</strong><span>{String(item.category || '').replace(/_/g, ' ')}</span></a>)}</div>
          <p className="helper-text">Pick a provider and submit credentials, or skip for now and add them later. Either way, your portal is unlocked once this step is acknowledged.</p>
        </form> : null}
        {needsUpload ? <form className="dispute-card-live" onSubmit={submitDocument}><div className="dispute-card-top"><strong>Step 4, upload your credit report</strong></div><div className="field-grid"><input className="chat-input" type="file" accept=".pdf,.html,.htm,.png,.jpg,.jpeg,.webp" onChange={(e: ChangeEvent<HTMLInputElement>) => setDocUpload((current) => ({ ...current, file: e.target.files?.[0] || null }))} /><select className="chat-input" value={docUpload.type} onChange={(e) => setDocUpload((current) => ({ ...current, type: e.target.value }))}><option value="credit_report">Credit report</option><option value="identity">Driver's license or ID</option><option value="proof_of_address">Proof of address</option><option value="other">Other</option></select><button className="ghost-button" type="submit" disabled={busyStep === 'upload' || !docUpload.file}>{busyStep === 'upload' ? 'Uploading...' : 'Upload securely'}</button></div><p className="helper-text">Upload credit reports as PDF or HTML files. JPG, PNG, and WEBP are also accepted for screenshots and supporting images.</p></form> : null}
        {completedAt ? <div className="empty-state-card">Onboarding complete. Your file is now in review.</div> : null}
      </div>
    </section>
  );
}

function CreditMonitoringSection({ token, client, progress, refreshAll }: { token: string; client: Client | null; progress: Progress | null; refreshAll: () => Promise<void>; }) {
  const uploadedDocs = progress?.uploadedDocs || [];
  const creditDocs = uploadedDocs.filter((doc) => (doc.type || '').toLowerCase().includes('credit'));
  const hasCreditReport = creditDocs.length > 0;
  const hasAnalysis = client?.analysisSummary || progress?.analysis;
  const needsUpload = !hasCreditReport;
  const needsAnalysis = hasCreditReport && !hasAnalysis;
  const analysisReady = hasCreditReport && hasAnalysis;

  const [upload, setUpload] = useState<SecureUploadState>({ file: null, type: 'credit_report' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submitDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!upload.file) {
      setError('Choose a file first.');
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append('file', upload.file);
      formData.append('type', upload.type);
      await apiUpload('/api/progress/me/docs/upload', token, formData);
      setUpload({ file: null, type: 'credit_report' });
      setMessage('Document saved.');
      await refreshAll();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Unable to upload document');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-grid">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Credit Monitoring</p>
          <h1>Report upload & analysis</h1>
          <p>This area is dedicated to your monitoring connection, credit report uploads, and the analysis CredX prepares from your file.</p>
        </div>
        <div className="hero-stats">
          <div className="stat-card"><span>Workflow Stage</span><strong>{prettyStatus(progress?.workflow?.stage || client?.status)}</strong></div>
          <div className="stat-card"><span>Reports Uploaded</span><strong>{creditDocs.length}</strong></div>
          <div className="stat-card"><span>Analysis</span><strong>{client?.analysisSummary ? 'Ready' : 'Pending'}</strong></div>
          <div className="stat-card"><span>Next Update</span><strong>{progress?.workflow?.updatedAt ? formatDate(progress.workflow.updatedAt) : 'Pending'}</strong></div>
        </div>
      </section>

      <section className="panel two-col">
        <div>
          <h2>Analysis report</h2>
          {needsUpload && (
            <div className="plan-card" style={{ border: '2px dashed #00c6fb', background: 'rgba(0,198,251,0.05)', padding: '1.5rem', textAlign: 'center' }}>
              <strong style={{ color: '#00c6fb', fontSize: '1.1rem' }}>📋 Upload Your Credit Report</strong>
              <p style={{ margin: '0.75rem 0', color: '#64748b' }}>
                To generate your professional credit analysis, upload your credit report below.
                We accept PDF, HTML, and screenshots.
              </p>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Your analysis will appear here within minutes of upload.
              </p>
            </div>
          )}
          {needsAnalysis && (
            <div className="plan-card" style={{ border: '2px dashed #f59e0b', background: 'rgba(245,158,11,0.05)', padding: '1.5rem', textAlign: 'center' }}>
              <strong style={{ color: '#f59e0b', fontSize: '1.1rem' }}>⏳ Analysis In Progress</strong>
              <p style={{ margin: '0.75rem 0', color: '#64748b' }}>
                Your credit report has been received. The CredX team is preparing your analysis.
              </p>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Check back shortly or refresh this page.
              </p>
            </div>
          )}
          {analysisReady && (
            <>
              <div className="plan-card">
                <strong>Summary</strong>
                <span>{client?.analysisSummary || 'Your analysis report has been published.'}</span>
                {progress?.analysis?.findings?.length ? <small>{progress.analysis.findings.join(' • ')}</small> : null}
              </div>
              <div className="plan-card">
                <strong>Dispute strategy</strong>
                <span>{client?.disputePlanSummary || progress?.disputeStrategy?.objective || 'Your strategy will appear here after report review.'}</span>
                {progress?.disputeStrategy?.phases?.length ? <small>{progress.disputeStrategy.phases.join(' → ')}</small> : null}
              </div>
              <div style={{ marginTop: '12px', textAlign: 'center' }}>
                <button
                  className="ghost-button"
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      const event = new CustomEvent('portal-navigate', { detail: { tab: 'analysis' } });
                      window.dispatchEvent(event);
                    }
                  }}
                  style={{ background: '#2563eb', color: '#fff', border: 'none', fontWeight: 600 }}
                >
                  📊 View Full Analysis Report
                </button>
              </div>
            </>
          )}
        </div>
        <div>
          <h2>Upload credit report</h2>
          {needsUpload && (
            <div className="plan-card" style={{ border: '2px dashed #00c6fb', background: 'rgba(0,198,251,0.05)', padding: '1.5rem', marginBottom: '1rem' }}>
              <strong style={{ color: '#00c6fb', fontSize: '1.1rem' }}>📥 Step 1: Download Your Report</strong>
              <p style={{ margin: '0.75rem 0', color: '#64748b' }}>
                Before uploading, download your credit report from your monitoring provider.
                Most providers allow you to save as PDF or print to PDF.
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                <a href="https://www.identityiq.com" target="_blank" rel="noopener noreferrer" className="ghost-button" style={{ fontSize: '0.8rem', textDecoration: 'none' }}>IdentityIQ ↗</a>
                <a href="https://www.smartcredit.com" target="_blank" rel="noopener noreferrer" className="ghost-button" style={{ fontSize: '0.8rem', textDecoration: 'none' }}>SmartCredit ↗</a>
                <a href="https://www.privacyguard.com" target="_blank" rel="noopener noreferrer" className="ghost-button" style={{ fontSize: '0.8rem', textDecoration: 'none' }}>PrivacyGuard ↗</a>
              </div>
            </div>
          )}
          <form className="dispute-card-live" onSubmit={submitDocument}>
            <div className="field-grid">
              <input className="chat-input" type="file" accept=".pdf,.html,.htm,.png,.jpg,.jpeg,.webp" onChange={(e: ChangeEvent<HTMLInputElement>) => setUpload((current) => ({ ...current, file: e.target.files?.[0] || null }))} />
              <select className="chat-input" value={upload.type} onChange={(e) => setUpload((current) => ({ ...current, type: e.target.value }))}>
                <option value="credit_report">Credit report</option>
                <option value="other">Monitoring screenshot / other</option>
              </select>
              <button className="ghost-button" type="submit" disabled={saving || !upload.file}>{saving ? 'Saving...' : 'Upload securely'}</button>
            </div>
          </form>
          <p className="helper-text">Upload credit reports as PDF or HTML files. JPG, PNG, and WEBP are also accepted for screenshots and supporting images.</p>
          {message ? <div className="helper-text" style={{ marginTop: '10px' }}>{message}</div> : null}
          {error ? <div className="error-banner" style={{ marginTop: '10px' }}>{error}</div> : null}
          <div className="dispute-list" style={{ marginTop: '12px' }}>
            {creditDocs.length ? creditDocs.map((doc, index) => (
              <div key={`${doc.fileName || doc.name}-${index}`} className="plan-card">
                <strong>{doc.fileName || doc.name || 'Credit report'}</strong>
                <span>{prettyStatus(doc.type)}</span>
                <small>Uploaded {formatDateTime(doc.uploadedAt)}{(doc as any).secure ? ' · secure' : ''}</small>
              </div>
            )) : <div className="empty-state-card">No credit report is on file yet.</div>}
          </div>
        </div>
      </section>
    </div>
  );
}

function linkifyMessage(text: string): React.ReactNode[] {
  if (!text) return [];
  // Pattern: real URLs OR the bare keywords "masterclass" / "portal" (case-insensitive).
  const pattern = /(https?:\/\/[^\s)]+|\b(?:masterclass|portal access|portal|client portal)\b)/gi;
  const out: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) out.push(text.slice(lastIndex, match.index));
    const token = match[0];
    const isUrl = /^https?:\/\//i.test(token);
    const lower = token.toLowerCase();
    let href = '#';
    if (isUrl) href = token;
    else if (lower.includes('masterclass')) href = '/portal?welcome=masterclass';
    else href = '/portal';
    out.push(
      <a
        key={`lnk-${key++}`}
        href={href}
        className="msg-link"
        target={isUrl ? '_blank' : undefined}
        rel={isUrl ? 'noopener noreferrer' : undefined}
      >
        {token}
      </a>
    );
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  return out;
}

function ActivitySection({ progress, client }: { progress: Progress | null; client: Client | null; }) {
  const activities = progress?.activities || client?.activities || [];
  const nextUpdate = progress?.workflow?.next?.length ? progress.workflow.next.map(prettyStatus).join(', ') : 'CredX will post the next milestone here once your file advances.';
  return (
    <section className="panel">
      <div className="panel-header"><div><p className="eyebrow">Activity</p><h2>What was done and what comes next</h2></div></div>
      <div className="dispute-list">
        <div className="plan-card"><strong>Next update</strong><span>{linkifyMessage(nextUpdate)}</span><small>Last workflow change: {formatDateTime(progress?.workflow?.updatedAt)}</small></div>
        {activities.length ? activities.slice().sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).map((item) => (
          <div key={item.id} className="dispute-card-live">
            <div className="dispute-card-top"><strong>{linkifyMessage(item.message)}</strong><span>{formatDateTime(item.createdAt)}</span></div>
            <div className="dispute-meta"><span>{prettyStatus(item.type || 'activity')}</span></div>
          </div>
        )) : <div className="empty-state-card">No client-facing activity has been posted yet.</div>}
      </div>
    </section>
  );
}

function DisputesSection({ client, progress }: { client: Client | null; progress: Progress | null; }) {
  const disputes = normalizeDisputes(client, progress);
  return (
    <section className="panel">
      <div className="panel-header"><div><p className="eyebrow">Disputes</p><h2>Accounts, status, and changes</h2></div></div>
      <div className="dispute-list">
        {disputes.length ? disputes.map((dispute) => (
          <div key={dispute.id} className="dispute-card-live">
            <div className="dispute-card-top"><strong>{dispute.account}</strong><span className={`status-badge status-${String(dispute.status).toLowerCase()}`}>{prettyStatus(dispute.status)}</span></div>
            <div className="dispute-meta"><span>{dispute.bureau} · Round {dispute.round}</span><span>{dispute.accountNumber ? `Acct ${dispute.accountNumber}` : 'Account number not shown'}</span></div>
            <div className="dispute-meta"><span><strong>Current status:</strong> {prettyStatus(dispute.status)}</span><span><strong>What changed:</strong> {dispute.changed}</span></div>
            <div className="dispute-change-grid">
              <div className="change-chip"><span>Reason</span><strong>{dispute.reason}</strong></div>
              <div className="change-chip"><span>Last movement</span><strong>{dispute.changed}</strong></div>
              <div className="change-chip"><span>Next step</span><strong>{String(dispute.status).toUpperCase() === 'COMPLETED' ? 'Monitor bureau update' : 'Continue investigation and await response'}</strong></div>
            </div>
          </div>
        )) : <div className="empty-state-card">No dispute accounts have been published to your portal yet.</div>}
      </div>
    </section>
  );
}

function ResourcesSection({ progress }: { progress: Progress | null; }) {
  const affiliateLinks = (progress?.education?.affiliateLinks?.length ? progress.education.affiliateLinks : DEFAULT_AFFILIATE_LINKS);
  const monitoringLinks = affiliateLinks.filter((item) => String(item.category || '').toLowerCase() === 'monitoring');
  const creditBuilderLinks = affiliateLinks.filter((item) => String(item.category || '').toLowerCase() === 'credit_builder');
  const reportLinks = affiliateLinks.filter((item) => String(item.category || '').toLowerCase() === 'reports');

  return (
    <div className="page-grid">
      <section className="hero-card hero-card--compact">
        <div>
          <p className="eyebrow">Resources</p>
          <h1>Affiliate tools & credit builders</h1>
          <p>These are the partner tools currently attached to the CredX experience for onboarding, monitoring, and post-dispute rebuilding.</p>
        </div>
        <div className="hero-stats">
          <div className="stat-card"><span>Monitoring Options</span><strong>{monitoringLinks.length}</strong></div>
          <div className="stat-card"><span>Credit Builders</span><strong>{creditBuilderLinks.length}</strong></div>
          <div className="stat-card"><span>Report Sources</span><strong>{reportLinks.length}</strong></div>
          <div className="stat-card"><span>Masterclass</span><strong>{progress?.education?.masterclassEnrolled ? 'Active' : 'Available'}</strong></div>
        </div>
      </section>

      <section className="panel two-col">
        <div>
          <div className="panel-header"><div><p className="eyebrow">Monitoring</p><h2>Credit monitoring signup links</h2></div></div>
          <div className="dispute-list">
            {monitoringLinks.map((item, index) => <a key={`${item.url}-${index}`} className="plan-card resource-link-card" href={item.url} target="_blank" rel="noreferrer"><strong>{item.label}</strong><span>Use this during onboarding when choosing your provider.</span><small>Open partner link</small></a>)}
          </div>
        </div>
        <div>
          <div className="panel-header"><div><p className="eyebrow">Credit Building</p><h2>Recommended builder accounts</h2></div></div>
          <div className="dispute-list">
            {creditBuilderLinks.map((item, index) => <a key={`${item.url}-${index}`} className="plan-card resource-link-card" href={item.url} target="_blank" rel="noreferrer"><strong>{item.label}</strong><span>Helpful for rebuilding after cleanup and utilization work.</span><small>Open partner link</small></a>)}
          </div>
        </div>
      </section>

      <section className="panel two-col">
        <div>
          <div className="panel-header"><div><p className="eyebrow">Masterclass</p><h2>5-Day Masterclass offer</h2></div></div>
          <div className="dispute-card-live">
            <div className="dispute-card-top"><strong>DIY education + affiliate stack</strong><span className={progress?.education?.masterclassEnrolled ? 'status-badge status-active' : 'status-badge status-pending'}>{progress?.education?.masterclassEnrolled ? 'Enrolled' : 'Available'}</span></div>
            <div className="cell-subtext">Position the masterclass as the self-serve path: five days of guided education, bonus content, and recommended partner tools inside the same CredX ecosystem.</div>
            <div style={{ marginTop: '12px' }}><a className="ghost-button" href="/signup?offer=masterclass">Open masterclass offer</a></div>
          </div>
        </div>
        <div>
          <div className="panel-header"><div><p className="eyebrow">Reports</p><h2>Report access</h2></div></div>
          <div className="dispute-list">
            {reportLinks.map((item, index) => <a key={`${item.url}-${index}`} className="plan-card resource-link-card" href={item.url} target="_blank" rel="noreferrer"><strong>{item.label}</strong><span>Use this when you need a fresh bureau copy for review or upload.</span><small>Open report source</small></a>)}
          </div>
        </div>
      </section>
    </div>
  );
}

function ProfileSection({ token, user, client, refreshAll, onUserUpdated }: { token: string; user: User | null; client: Client | null; refreshAll: () => Promise<void>; onUserUpdated: (next: User) => void; }) {
  const [profile, setProfile] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    phone: user?.phone || '',
    address1: client?.currentAddressLine1 || '',
    address2: client?.currentAddressLine2 || '',
    city: client?.currentCity || '',
    state: client?.currentState || '',
    zip: client?.currentPostalCode || '',
    dob: client?.dobEncrypted || '',
    ssn: ''
  });
  const [docName, setDocName] = useState('');
  const [docType, setDocType] = useState('identity');
  const [verificationUpload, setVerificationUpload] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setProfile({
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      phone: user?.phone || '',
      address1: client?.currentAddressLine1 || '',
      address2: client?.currentAddressLine2 || '',
      city: client?.currentCity || '',
      state: client?.currentState || '',
      zip: client?.currentPostalCode || '',
      dob: client?.dobEncrypted || '',
      ssn: ''
    });
  }, [user, client]);

  const verificationDocs = (client?.documents || []).filter((doc) => ['IDENTITY', 'PROOF_OF_ADDRESS', 'OTHER'].includes(doc.type));

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const nextUser = await apiFetch<User>('/api/users/me/profile', token, { method: 'PUT', body: JSON.stringify({ firstName: profile.firstName, lastName: profile.lastName, phone: profile.phone }) });
      await apiFetch('/api/clients/me/profile', token, {
        method: 'PATCH',
        body: JSON.stringify({
          currentAddressLine1: profile.address1,
          currentAddressLine2: profile.address2,
          currentCity: profile.city,
          currentState: profile.state,
          currentPostalCode: profile.zip,
          dobEncrypted: profile.dob,
          ssnEncrypted: profile.ssn || undefined
        })
      });
      onUserUpdated(nextUser);
      await refreshAll();
      setProfile((current) => ({ ...current, ssn: '' }));
      setMessage('Profile saved securely.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save profile');
    } finally {
      setSaving(false);
    }
  }

  async function uploadVerificationDoc(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!verificationUpload) {
      setError('Choose a file first.');
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append('file', verificationUpload);
      formData.append('type', docType);
      await apiUpload('/api/progress/me/docs/upload', token, formData);
      setDocName('');
      setVerificationUpload(null);
      await refreshAll();
      setMessage('Verification document saved.');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Unable to save document');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-grid">
      <section className="panel two-col">
        <div>
          <div className="panel-header"><div><p className="eyebrow">Profile</p><h2>Edit your information</h2></div></div>
          <form onSubmit={saveProfile} className="dispute-card-live">
            <div className="field-grid">
              <input className="chat-input" value={profile.firstName} onChange={(e) => setProfile((c) => ({ ...c, firstName: e.target.value }))} placeholder="First name" />
              <input className="chat-input" value={profile.lastName} onChange={(e) => setProfile((c) => ({ ...c, lastName: e.target.value }))} placeholder="Last name" />
              <input className="chat-input" value={profile.phone} onChange={(e) => setProfile((c) => ({ ...c, phone: e.target.value }))} placeholder="Phone" />
              <input className="chat-input" value={profile.address1} onChange={(e) => setProfile((c) => ({ ...c, address1: e.target.value }))} placeholder="Address line 1" />
              <input className="chat-input" value={profile.address2} onChange={(e) => setProfile((c) => ({ ...c, address2: e.target.value }))} placeholder="Address line 2" />
              <input className="chat-input" value={profile.city} onChange={(e) => setProfile((c) => ({ ...c, city: e.target.value }))} placeholder="City" />
              <input className="chat-input" value={profile.state} onChange={(e) => setProfile((c) => ({ ...c, state: e.target.value }))} placeholder="State" />
              <input className="chat-input" value={profile.zip} onChange={(e) => setProfile((c) => ({ ...c, zip: e.target.value }))} placeholder="ZIP" />
              <input className="chat-input" value={profile.dob} onChange={(e) => setProfile((c) => ({ ...c, dob: e.target.value }))} placeholder="Date of birth (YYYY-MM-DD)" />
              <input className="chat-input" value={profile.ssn} onChange={(e) => setProfile((c) => ({ ...c, ssn: e.target.value.replace(/\D/g, '').slice(0, 9) }))} placeholder="Full SSN to replace stored value" />
              <button className="ghost-button" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save profile'}</button>
            </div>
          </form>
          <div className="helper-text" style={{ marginTop: '10px' }}>DOB preview: {maskSensitiveInput(profile.dob, 'dob')} · SSN preview: {maskSensitiveInput(profile.ssn, 'ssn') || 'Not entered'}</div>
          {message ? <div className="helper-text" style={{ marginTop: '10px' }}>{message}</div> : null}
          {error ? <div className="error-banner" style={{ marginTop: '10px' }}>{error}</div> : null}
        </div>
        <div>
          <div className="panel-header"><div><p className="eyebrow">Secure File</p><h2>Verification and stored details</h2></div></div>
          <div className="plan-card"><strong>Email</strong><span>{user?.email || 'Not available'}</span></div>
          <div className="plan-card"><strong>Stored SSN</strong><span>{client?.ssnLast4 ? `•••-••-${client.ssnLast4}` : 'Not saved'}</span></div>
          <div className="plan-card"><strong>Stored DOB</strong><span>{maskDob(client?.dobEncrypted)}</span></div>
          <div className="plan-card"><strong>Address on file</strong><span>{[client?.currentAddressLine1, client?.currentAddressLine2, client?.currentCity, client?.currentState, client?.currentPostalCode].filter(Boolean).join(', ') || 'Not saved'}</span></div>
        </div>
      </section>

      <section className="panel two-col">
        <div>
          <div className="panel-header"><div><p className="eyebrow">Verification Documents</p><h2>Upload secure documents</h2></div></div>
          <form className="dispute-card-live" onSubmit={uploadVerificationDoc}>
            <div className="field-grid">
              <input className="chat-input" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e: ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0] || null; setVerificationUpload(file); setDocName(file?.name || ''); }} />
              <select className="chat-input" value={docType} onChange={(e) => setDocType(e.target.value)}>
                <option value="identity">Identity document</option>
                <option value="proof_of_address">Proof of address</option>
                <option value="other">Other verification</option>
              </select>
              <button className="ghost-button" type="submit" disabled={saving || !verificationUpload}>{saving ? 'Saving...' : 'Upload securely'}</button>
            </div>
          </form>
          <p className="helper-text">Sensitive verification files move through the same secured phase-two style flow as the protected onboarding details.</p>
        </div>
        <div>
          <div className="panel-header"><div><p className="eyebrow">Files on Record</p><h2>Uploaded verification documents</h2></div></div>
          <div className="dispute-list">
            {verificationDocs.length ? verificationDocs.map((doc) => <div key={doc.id} className="plan-card"><strong>{doc.fileName}</strong><span>{prettyStatus(doc.type)}</span><small>Uploaded {formatDateTime(doc.uploadedAt)} · secure</small></div>) : <div className="empty-state-card">No verification documents uploaded yet.</div>}
          </div>
        </div>
      </section>
    </div>
  );
}

function AnalysisUploadCard({ token, progress, refreshAll }: { token: string; progress: Progress | null; refreshAll: () => Promise<void>; }) {
  const uploadedDocs = progress?.uploadedDocs || [];
  const creditDocs = uploadedDocs.filter((d) => (d.type || '').toLowerCase().includes('credit'));
  const hasReport = creditDocs.length > 0;
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      setError('Choose a file first.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'credit_report');
      await apiUpload('/api/progress/me/docs/upload', token, fd);
      setFile(null);
      setMessage('Uploaded — generating your analysis now. This page will refresh shortly.');
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel" style={{ borderColor: hasReport ? 'var(--cx-success)' : 'var(--cx-cyan)' }}>
      <div className="panel-header">
        <div>
          <p className="eyebrow" style={{ color: hasReport ? '#22c55e' : '#00c6fb' }}>{hasReport ? 'Report on file' : 'Upload your credit report'}</p>
          <h2>{hasReport ? `${creditDocs.length} report${creditDocs.length === 1 ? '' : 's'} uploaded` : 'Drop your report to generate analysis'}</h2>
        </div>
        <span className="security-note-inline" aria-label="Encrypted">🔒 Encrypted upload</span>
      </div>
      <p className="helper-text" style={{ marginTop: 0 }}>
        Upload the PDF or HTML file you saved from IdentityIQ, MyFreeScoreNow, or any other tri-merge source.
        Your CredX analysis is generated automatically the moment your report lands.
      </p>
      <form onSubmit={submit} className="field-grid" style={{ marginTop: '0.75rem' }}>
        <input
          className="chat-input"
          type="file"
          accept=".pdf,.html,.htm,.png,.jpg,.jpeg,.webp"
          onChange={(e: ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] || null)}
        />
        <button className="ghost-button" type="submit" disabled={busy || !file} style={{ background: '#00c6fb', color: '#060a12', border: 'none', fontWeight: 700 }}>
          {busy ? 'Uploading…' : hasReport ? 'Upload another' : 'Upload report'}
        </button>
      </form>
      {message ? <p className="helper-text" style={{ color: '#22c55e', marginTop: '0.5rem' }}>{message}</p> : null}
      {error ? <div className="error-banner" style={{ marginTop: '0.5rem' }}>{error}</div> : null}
      <p className="helper-text">Accepted formats: PDF, HTML, HTM, PNG, JPG, JPEG, WEBP.</p>
    </section>
  );
}

function MonitoringConnectCard({ token, progress, refreshAll }: { token: string; progress: Progress | null; refreshAll: () => Promise<void>; }) {
  const onboarding = (progress?.onboarding || {}) as Record<string, unknown>;
  const provider = String(onboarding.monitoringProvider || '');
  const hasCredentials = Boolean(onboarding.monitoringHasCredentials);
  const [form, setForm] = useState({ provider: provider || '', username: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiFetch('/api/monitoring', token, {
        method: 'POST',
        body: JSON.stringify({ provider: form.provider, username: form.username, password: form.password })
      });
      setForm({ provider: form.provider, username: '', password: '' });
      setMessage('Monitoring credentials saved.');
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save credentials.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow" style={{ color: hasCredentials ? '#22c55e' : '#94a3b8' }}>Credit Monitoring (optional)</p>
          <h2>{hasCredentials ? `Connected · ${provider}` : 'Connect a provider to let CredX pull on your behalf'}</h2>
        </div>
      </div>
      <p className="helper-text" style={{ marginTop: 0 }}>
        Optional. Without this, you upload reports manually. With this, your CredX team can pull a fresh report and post the analysis without bothering you.
      </p>
      <form onSubmit={submit} className="field-grid" style={{ marginTop: '0.75rem' }}>
        <select className="chat-input" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}>
          <option value="">Select provider</option>
          <option value="IdentityIQ">IdentityIQ</option>
          <option value="MyFreeScoreNow">MyFreeScoreNow</option>
        </select>
        <input className="chat-input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="Monitoring username" autoComplete="off" />
        <input className="chat-input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Monitoring password" autoComplete="new-password" />
        <button className="ghost-button" type="submit" disabled={busy || !form.provider}>{busy ? 'Saving…' : hasCredentials ? 'Update credentials' : 'Save credentials'}</button>
      </form>
      {message ? <p className="helper-text" style={{ color: '#22c55e', marginTop: '0.5rem' }}>{message}</p> : null}
      {error ? <div className="error-banner" style={{ marginTop: '0.5rem' }}>{error}</div> : null}
    </section>
  );
}

function AnalysisSection({ token, client, progress, refreshAll }: { token: string; client: Client | null; progress: Progress | null; refreshAll: () => Promise<void>; }) {
  const analysis = progress?.analysis as any;
  const hasAnalysis = analysis && typeof analysis === 'object' && analysis.keyFindings;

  const findings = hasAnalysis ? (analysis.keyFindings || []) : [];
  const disputeOps = hasAnalysis ? (analysis.disputeOpportunities || []) : [];
  const actionPlan = hasAnalysis ? (analysis.actionPlan || []) : [];
  const bureauSummaries = hasAnalysis ? (analysis.bureauSummaries || []) : [];
  const overallStats = hasAnalysis ? (analysis.overallStats || {}) : {};
  const clientFacingSummary = hasAnalysis ? (analysis.clientFacingSummary || '') : '';
  const educationSection = hasAnalysis ? (analysis.educationSection || '') : '';

  function severityColor(severity: string): string {
    switch (severity) {
      case 'critical': return '#dc2626';
      case 'high': return '#ea580c';
      case 'medium': return '#ca8a04';
      case 'low': return '#16a34a';
      default: return '#6b7280';
    }
  }

  function bureauLabel(b: string): string {
    return b === 'equifax' ? 'Equifax' : b === 'experian' ? 'Experian' : 'TransUnion';
  }

  if (!hasAnalysis) {
    return (
      <div className="page-grid">
        <AnalysisUploadCard token={token} progress={progress} refreshAll={refreshAll} />
        <section className="panel">
          <div className="panel-header"><div><p className="eyebrow">Credit Analysis</p><h2>Your analysis report</h2></div></div>
          <div className="empty-state-card">
            <strong>Analysis appears here automatically</strong>
            <p>Once your credit report uploads above, CredX runs your analysis within seconds. If your file is being reviewed manually, the analysis will show up here when ready.</p>
            <p style={{ marginTop: '12px', fontSize: '0.85rem', color: '#94a3b8' }}>
              Status: {client?.status || 'Pending'} · Reports uploaded: {client?.documents?.filter(d => d.type === 'CREDIT_REPORT').length || 0}
            </p>
          </div>
        </section>
        <MonitoringConnectCard token={token} progress={progress} refreshAll={refreshAll} />
      </div>
    );
  }

  return (
    <div className="page-grid">
      <AnalysisUploadCard token={token} progress={progress} refreshAll={refreshAll} />
      <section className="hero-card hero-card--compact">
        <div>
          <p className="eyebrow">Credit Analysis</p>
          <h1>Your Professional Credit Report Analysis</h1>
          <p>A detailed breakdown of your credit file, findings, and recommended dispute strategy.</p>
        </div>
        <div className="hero-stats">
          <div className="stat-card"><span>Total Accounts</span><strong>{overallStats.totalAccounts || 0}</strong></div>
          <div className="stat-card"><span>Negatives</span><strong style={{ color: '#dc2626' }}>{overallStats.totalNegativeAccounts || 0}</strong></div>
          <div className="stat-card"><span>Total Balance</span><strong>${(overallStats.totalBalance || 0).toLocaleString()}</strong></div>
          <div className="stat-card"><span>Dispute Ops</span><strong>{disputeOps.length}</strong></div>
        </div>
      </section>

      <section className="panel two-col">
        <div>
          <div className="panel-header"><div><p className="eyebrow">Key Findings</p><h2>What we found</h2></div></div>
          <div className="dispute-list">
            {findings.slice(0, 5).map((finding: any, idx: number) => (
              <div key={finding.id || idx} className="dispute-card-live" style={{ borderLeft: `3px solid ${severityColor(finding.severity)}` }}>
                <div className="dispute-card-top">
                  <strong>{finding.title}</strong>
                  <span className="status-badge" style={{ background: severityColor(finding.severity), color: '#fff', textTransform: 'uppercase', fontSize: '0.7rem' }}>
                    {finding.severity}
                  </span>
                </div>
                <div className="dispute-meta"><span>{finding.description}</span></div>
                <div className="dispute-meta" style={{ marginTop: '4px' }}>
                  <span style={{ color: '#2563eb', fontWeight: 600 }}>→ {finding.recommendation}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="panel-header"><div><p className="eyebrow">Bureau Comparison</p><h2>Your 3-bureau snapshot</h2></div></div>
          <div className="dispute-list">
            {bureauSummaries.map((b: any) => (
              <div key={b.bureau} className="plan-card">
                <strong>{b.label}</strong>
                <span>{b.totalAccounts} accounts · {b.negativeAccounts} negative · ${b.totalBalance.toLocaleString()} balance</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><p className="eyebrow">Dispute Opportunities</p><h2>Accounts ready for dispute</h2></div></div>
        <div className="dispute-list">
          {disputeOps.length ? disputeOps.map((op: any, idx: number) => (
            <div key={idx} className="dispute-card-live">
              <div className="dispute-card-top">
                <strong>{op.accountName}</strong>
                <span className="status-badge" style={{
                  background: op.priority === 'high' ? '#fef2f2' : op.priority === 'medium' ? '#fefce8' : '#f0fdf4',
                  color: op.priority === 'high' ? '#dc2626' : op.priority === 'medium' ? '#ca8a04' : '#16a34a'
                }}>
                  {op.priority} priority
                </span>
              </div>
              <div className="dispute-meta"><span>{op.issue}</span></div>
              <div className="dispute-meta" style={{ marginTop: '4px' }}>
                <span style={{ fontWeight: 600 }}>Reason:</span> {op.reason}
              </div>
              <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                {op.bureaus.map((b: string) => (
                  <span key={b} style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, background: '#eff6ff', color: '#2563eb' }}>
                    {bureauLabel(b)}
                  </span>
                ))}
              </div>
            </div>
          )) : <div className="empty-state-card">No dispute opportunities identified yet.</div>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><p className="eyebrow">Action Plan</p><h2>Your 5-phase dispute strategy</h2></div></div>
        <div className="dispute-list">
          {actionPlan.map((phase: any) => (
            <div key={phase.phase} className="dispute-card-live" style={{ paddingLeft: '2.5rem', position: 'relative' }}>
              <span style={{
                position: 'absolute', left: '0.75rem', top: '1rem',
                width: '1.5rem', height: '1.5rem', borderRadius: '50%',
                background: '#2563eb', color: '#fff', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: '0.75rem', fontWeight: 700
              }}>
                {phase.phase}
              </span>
              <div className="dispute-card-top"><strong>{phase.title}</strong><span style={{ color: '#2563eb', fontWeight: 600, fontSize: '0.8rem' }}>~{phase.estimatedWeeks} weeks</span></div>
              <div className="dispute-meta"><span>{phase.description}</span></div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0 0' }}>
                {phase.tasks.map((task: string, i: number) => (
                  <li key={i} style={{ fontSize: '0.82rem', color: '#475569', padding: '2px 0', paddingLeft: '1rem', position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 0, color: '#2563eb', fontSize: '0.7rem' }}>→</span>
                    {task}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="panel two-col">
        <div>
          <div className="panel-header"><div><p className="eyebrow">Education</p><h2>Understanding your credit</h2></div></div>
          <div className="plan-card" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: '0.85rem', color: '#374151' }}>
            {educationSection}
          </div>
        </div>
        <div>
          <div className="panel-header"><div><p className="eyebrow">Summary</p><h2>Your executive summary</h2></div></div>
          <div className="plan-card" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: '0.85rem', color: '#374151' }}>
            {clientFacingSummary}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function ClientPortalApp({ onboardingOnly = false }: { onboardingOnly?: boolean }) {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const urlToken = new URLSearchParams(window.location.search).get('token');
      if (urlToken) return urlToken;
      if (window.location.pathname.startsWith('/start')) return null;
    }
    return localStorage.getItem(TOKEN_KEY);
  });
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/start')) return null;
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [client, setClient] = useState<Client | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PortalTab>('overview');
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeLeaving, setWelcomeLeaving] = useState(false);
  const welcomeShownRef = useRef(false);

  async function refreshAll() {
    if (!token) return;
    const [sessionResponse, progressResponse] = await Promise.all([
      apiFetch<SessionResponse>('/api/auth/me', token),
      apiFetch<Progress>('/api/progress/me', token)
    ]);
    const { client: clientResponse, progress: authProgress, ...userResponse } = sessionResponse;
    setUser(userResponse);
    localStorage.setItem(USER_KEY, JSON.stringify(userResponse));
    setClient(clientResponse);
    setProgress(progressResponse ?? authProgress ?? null);
  }

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/start')) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
  }, []);

  useEffect(() => {
    if (!token) return;

    localStorage.setItem(TOKEN_KEY, token);
    const url = new URL(window.location.href);
    if (url.searchParams.get('token')) {
      url.searchParams.delete('token');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }

    let cancelled = false;
    setDataLoading(true);
    setError(null);

    Promise.all([
      apiFetch<SessionResponse>('/api/auth/me', token),
      apiFetch<Progress>('/api/progress/me', token)
    ])
      .then(([sessionResponse, progressResponse]) => {
        if (cancelled) return;
        const { client: clientResponse, progress: authProgress, ...userResponse } = sessionResponse;
        setUser(userResponse);
        localStorage.setItem(USER_KEY, JSON.stringify(userResponse));
        setClient(clientResponse);
        setProgress(progressResponse ?? authProgress ?? null);
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setError(fetchError.message);
        setToken(null);
        setUser(null);
        setClient(null);
        setProgress(null);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });

    return () => { cancelled = true; };
  }, [token]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<LoginResponse>('/api/auth/login', undefined, { method: 'POST', body: JSON.stringify({ email, password }) });
      if (response.user.role !== 'CLIENT') throw new Error('This login is for clients only');
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

  const handleResetPassword = async () => {
    if (!email.trim()) {
      setError('Enter your email first so I know where to send the reset link.');
      setResetMessage(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setResetMessage(null);
      const response = await apiFetch<{ success: boolean; message: string }>('/api/auth/password-setup/request', undefined, {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), purpose: 'reset' })
      });
      setResetMessage(response.message || 'If that account exists, a reset link has been sent.');
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Unable to send reset link.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    setClient(null);
    setProgress(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    welcomeShownRef.current = false;
    setShowWelcome(false);
    setWelcomeLeaving(false);
  };

  useEffect(() => {
    if (!token || !user || welcomeShownRef.current) return;
    welcomeShownRef.current = true;
    setShowWelcome(true);
    setWelcomeLeaving(false);
    const leaveTimer = setTimeout(() => setWelcomeLeaving(true), 3000);
    const removeTimer = setTimeout(() => setShowWelcome(false), 3400);
    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(removeTimer);
    };
  }, [token, user]);

  const dismissWelcome = () => {
    setWelcomeLeaving(true);
    setTimeout(() => setShowWelcome(false), 350);
  };

  const workflowStage = useMemo(() => prettyStatus(progress?.workflow?.stage || client?.status), [progress?.workflow?.stage, client?.status]);
  const tasks = progress?.tasks || client?.tasks || [];
  const disputes = normalizeDisputes(client, progress);
  const pendingTasks = tasks.filter((task) => !task.completed).length;
  const activeDisputes = disputes.filter((d) => !['COMPLETED', 'REJECTED'].includes(String(d.status).toUpperCase()));
  const disputeHeadline = activeDisputes.length > 0
    ? `${activeDisputes.length} active dispute${activeDisputes.length === 1 ? '' : 's'}`
    : disputes.length > 0
      ? 'All disputes resolved'
      : 'Awaiting dispute strategy';
  const disputeSummary = client?.disputePlanSummary || progress?.disputeStrategy?.objective || client?.analysisSummary || 'Your dispute plan and bureau-by-bureau progress will appear here once your CredX team finalizes strategy.';

  const uploadedDocs = progress?.uploadedDocs || [];
  const creditDocs = uploadedDocs.filter((doc) => (doc.type || '').toLowerCase().includes('credit'));
  const hasCreditReport = creditDocs.length > 0;
  const hasAnalysis = !!(client?.analysisSummary || progress?.analysis);
  const needsAnalysis = hasCreditReport && !hasAnalysis;
  const analysisReady = hasCreditReport && hasAnalysis;

  if (!token) {
    if (onboardingOnly) {
      return <div className="auth-shell client-auth-shell"><div className="auth-card client-auth-card"><div className="brand-mark brand-mark--centered"><img src={BRAND_LOGO} alt="CredX" className="brand-logo" /></div><p className="eyebrow">CredX Onboarding</p><h1>Continue your signup</h1><p className="helper-text">Use the secure link from your welcome email to review your agreement and finish your intake.</p></div></div>;
    }
    return <ClientLogin email={email} password={password} onEmailChange={setEmail} onPasswordChange={setPassword} onSubmit={handleLogin} onResetPassword={handleResetPassword} loading={loading} error={error} resetMessage={resetMessage} />;
  }

  if (onboardingOnly) {
    return (
      <div className="shell client-shell">
        <main className="main" style={{ marginLeft: 0 }}>
          <header className="topbar"><div><div className="brand-row"><img src={BRAND_LOGO} alt="CredX" className="brand-logo brand-logo--small" /><p className="eyebrow">CredX Onboarding</p></div><h1 className="top-title">Complete your signup</h1><p className="helper-text">Review your agreement, finish your intake, and connect your credit monitoring provider.</p></div></header>
          {error ? <div className="error-banner">{error}</div> : null}
          {!progress?.onboarding?.completedAt && user ? <OnboardingWizard token={token} user={user} progress={progress} onProgressUpdated={setProgress} /> : null}
          {progress?.onboarding?.completedAt ? <section className="panel"><div className="empty-state-card">Signup complete. Check your email for the password setup link to access your client portal.</div></section> : null}
        </main>
      </div>
    );
  }

  const [activeMcDay, setActiveMcDay] = useState<LessonDay | null>(null);
  const masterclassEnrolled = !!progress?.education?.masterclassEnrolled;
  const masterclassOnly = masterclassEnrolled && (client?.status || '').toUpperCase() === 'LEAD';
  const completedMasterclassDays = useMemo(
    () => (progress?.education?.masterclassProgress || []).filter((s): s is string => typeof s === 'string'),
    [progress?.education?.masterclassProgress]
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !user) return;
    const url = new URL(window.location.href);
    const welcome = url.searchParams.get('welcome');
    if (welcome === 'masterclass' && masterclassEnrolled) {
      setActiveTab('masterclass');
      url.searchParams.delete('welcome');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      return;
    }
    if (masterclassOnly) {
      setActiveTab('masterclass');
    }
  }, [user?.id, masterclassEnrolled, masterclassOnly]);

  const handleMarkMasterclassDay = async (slug: string) => {
    if (!token) return;
    if (completedMasterclassDays.includes(slug)) return;
    try {
      await apiFetch('/api/masterclass/progress', token, {
        method: 'POST',
        body: JSON.stringify({ daySlug: slug })
      });
      await refreshAll();
    } catch (err) {
      console.warn('Failed to mark masterclass day complete', err);
    }
  };

  // Progressive tier unlock:
  // Tier 0: paid client just landed in portal — Overview + Profile only.
  // Tier 1: report uploaded → Analysis tab unlocks.
  // Tier 2: payment confirmed (status ACTIVE) → full menu including Disputes.
  const clientStatusUpper = (client?.status || '').toUpperCase();
  const tier2 = ['ACTIVE', 'PAST_DUE'].includes(clientStatusUpper);
  const tier1 = tier2 || hasCreditReport || hasAnalysis;

  const navItems: Array<{ key: PortalTab; label: string }> = masterclassOnly
    ? [
        { key: 'masterclass', label: '5-Day Masterclass' },
        { key: 'profile', label: 'Profile' },
        { key: 'resources', label: 'Credit Builders' }
      ]
    : tier2
      ? [
          { key: 'overview', label: 'Overview' },
          ...(masterclassEnrolled ? [{ key: 'masterclass' as PortalTab, label: 'Masterclass' }] : []),
          { key: 'analysis', label: 'Analysis & Reports' },
          { key: 'profile', label: 'Profile' },
          { key: 'disputes', label: 'Disputes' },
          { key: 'activity', label: 'Activity' },
          { key: 'resources', label: 'Credit Builders' },
          { key: 'tasks', label: 'Tasks' }
        ]
      : tier1
        ? [
            { key: 'overview', label: 'Overview' },
            ...(masterclassEnrolled ? [{ key: 'masterclass' as PortalTab, label: 'Masterclass' }] : []),
            { key: 'analysis', label: 'Analysis & Reports' },
            { key: 'profile', label: 'Profile' },
            { key: 'resources', label: 'Credit Builders' }
          ]
        : [
            { key: 'overview', label: 'Overview' },
            ...(masterclassEnrolled ? [{ key: 'masterclass' as PortalTab, label: 'Masterclass' }] : []),
            { key: 'profile', label: 'Profile' }
          ];

  return (
    <div className="shell client-shell">
      <aside className="sidebar">
        <div className="brand-mark"><img src={BRAND_LOGO} alt="CredX" className="brand-logo" /></div>
        <nav>
          {navItems.map((item) => <button key={item.key} type="button" className={`tab ${activeTab === item.key ? 'active' : ''}`} onClick={() => setActiveTab(item.key)}>{item.label}</button>)}
        </nav>
      </aside>
      <main className="main">
        {showWelcome && user ? (
          <div className={`welcome-toast${welcomeLeaving ? ' welcome-toast--leaving' : ''}`} role="status">
            <div className="welcome-toast-content">
              <p className="eyebrow">CredX Portal</p>
              <strong>Welcome back, {user.firstName}</strong>
              <span className="welcome-toast-tier">{client?.serviceTier || 'ESSENTIAL'} plan</span>
            </div>
            <button className="welcome-toast-close" onClick={dismissWelcome} aria-label="Dismiss welcome">×</button>
          </div>
        ) : null}

        {(() => {
          const tabLabel = navItems.find((item) => item.key === activeTab)?.label || 'Dashboard';
          const sectionTheme = activeTab !== 'overview' && (activeTab in SECTION_THEMES) ? SECTION_THEMES[activeTab as Exclude<PortalTab, 'overview'>] : null;
          const isMc = activeTab === 'masterclass';
          const accent = isMc && activeMcDay ? activeMcDay.accent : (sectionTheme?.accent || '#00c6fb');
          const subtitle = isMc && activeMcDay
            ? `${activeMcDay.eyebrow} — ${activeMcDay.tagline}`
            : (sectionTheme?.desc || null);
          const topbarStyle = { ['--section-accent' as string]: accent } as CSSProperties;
          return (
            <header className="topbar topbar--themed" style={topbarStyle}>
              <div>
                <div className="brand-row"><img src={BRAND_LOGO} alt="CredX" className="brand-logo brand-logo--small" /><p className="eyebrow" style={{ color: accent }}>Client Portal</p></div>
                <h1 className="top-title">{tabLabel}</h1>
                {subtitle ? <p className="top-subtitle">{subtitle}</p> : null}
                {dataLoading ? <p className="helper-text">Refreshing your latest CredX progress...</p> : null}
              </div>
              <div className="topbar-actions"><button className="ghost-button" onClick={handleLogout}>Sign out</button></div>
            </header>
          );
        })()}

        <select
          className="mobile-nav-select"
          value={activeTab}
          onChange={(e) => {
            const value = e.target.value;
            if (value === '__signup') { window.location.href = '/signup'; return; }
            setActiveTab(value as PortalTab);
          }}
          aria-label="Portal section"
        >
          {navItems.map((item) => (
            <option key={item.key} value={item.key}>{item.label}</option>
          ))}
          <option value="__signup">Sign up</option>
        </select>

        {error ? <div className="error-banner">{error}</div> : null}
        {client?.portalRestricted ? <div className="error-banner">Your portal access is currently restricted. Contact CredX support for help.</div> : null}

        <div className="page-grid">
          {activeTab === 'overview' ? (
            <>
              <section className="hero-card hero-card--dispute">
                <div className="hero-dispute-content">
                  <p className="eyebrow">Welcome to CredX</p>
                  <h1 className="hero-dispute-title">{user?.firstName ? `Hi ${user.firstName} — your portal is live.` : 'Your portal is live.'}</h1>
                  <p>{tier2
                    ? disputeSummary
                    : tier1
                      ? "Your credit report is on file. Open Analysis & Reports to review your CredX analysis and next steps."
                      : "First step: pull a fresh credit report from one of our partners below, then upload it for your free CredX analysis."}</p>
                  <div className="hero-scores">
                    <CreditScoreGauge bureau="Experian" score={typeof progress?.scores?.experian === 'number' ? progress.scores.experian : null} />
                    <CreditScoreGauge bureau="Equifax" score={typeof progress?.scores?.equifax === 'number' ? progress.scores.equifax : null} />
                    <CreditScoreGauge bureau="TransUnion" score={typeof progress?.scores?.transunion === 'number' ? progress.scores.transunion : null} />
                  </div>
                </div>
              </section>

              {/* Tier 0: no report yet — guide them to pull + upload */}
              {!hasCreditReport && (
                <section className="panel" style={{ border: '2px dashed #00c6fb', background: 'rgba(0,198,251,0.03)' }}>
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow" style={{ color: '#00c6fb' }}>Next Step</p>
                      <h2>Pull your credit report for a free analysis</h2>
                    </div>
                  </div>
                  <div style={{ padding: '0.25rem 0 0' }}>
                    <p style={{ marginBottom: '0.85rem', fontSize: '15px', lineHeight: 1.6 }}>
                      <strong style={{ color: '#cbd5e1' }}>If you skipped credit monitoring on the application</strong>, choose one of these two affiliate providers to pull a fresh tri-merge report.
                      Once it's in your hands, come back here and upload — your CredX analysis is generated automatically.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', margin: '1rem 0 0.75rem' }}>
                      <a
                        href="https://www.identityiq.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ghost-button"
                        style={{ background: '#00c6fb', color: '#060a12', border: 'none', fontWeight: 700, justifyContent: 'center', textDecoration: 'none' }}
                      >
                        Pull report at IdentityIQ ↗
                      </a>
                      <a
                        href="https://www.myfreescorenow.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ghost-button"
                        style={{ background: '#22c55e', color: '#060a12', border: 'none', fontWeight: 700, justifyContent: 'center', textDecoration: 'none' }}
                      >
                        Pull report at MyFreeScoreNow ↗
                      </a>
                    </div>
                    <p className="helper-text" style={{ marginTop: '0.75rem' }}>
                      <strong>Already have it?</strong> Add your monitoring sign-in credentials or upload the report directly — both options live below. The full menu unlocks once your analysis is ready.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginTop: '0.75rem' }}>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => setActiveTab('analysis')}
                        style={{ background: '#101a2b', border: '1px solid rgba(0,198,251,0.35)', color: '#f8fafc', justifyContent: 'center' }}
                      >
                        Add monitoring sign-in credentials →
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => setActiveTab('analysis')}
                        style={{ background: '#101a2b', border: '1px solid rgba(34,197,94,0.35)', color: '#f8fafc', justifyContent: 'center' }}
                      >
                        Upload report for free analysis →
                      </button>
                    </div>
                  </div>
                </section>
              )}

              {needsAnalysis && (
                <section className="panel" style={{ border: '2px dashed #f59e0b', background: 'rgba(245,158,11,0.03)' }}>
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow" style={{ color: '#f59e0b' }}>In Progress</p>
                      <h2>Analysis Being Prepared</h2>
                    </div>
                  </div>
                  <div style={{ padding: '1rem 0' }}>
                    <p>
                      Your credit report was uploaded successfully. The CredX team is reviewing your file
                      and preparing your professional analysis. Check back shortly.
                    </p>
                    <p className="helper-text" style={{ marginTop: '0.75rem' }}>
                      Reports uploaded: {creditDocs.length}
                    </p>
                  </div>
                </section>
              )}

              {analysisReady && (
                <section className="panel" style={{ border: '2px solid #22c55e', background: 'rgba(34,197,94,0.03)' }}>
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow" style={{ color: '#22c55e' }}>Ready</p>
                      <h2>Your Analysis Is Complete</h2>
                    </div>
                  </div>
                  <div style={{ padding: '1rem 0' }}>
                    <p style={{ marginBottom: '1rem' }}>
                      Your professional credit analysis is ready. View your findings, dispute opportunities,
                      and recommended action plan.
                    </p>
                    <button
                      className="ghost-button"
                      onClick={() => setActiveTab('analysis')}
                      style={{ background: '#22c55e', color: '#fff', border: 'none', fontWeight: 700 }}
                    >
                      📊 View Analysis Report
                    </button>
                  </div>
                </section>
              )}

              <section className="panel">
                <div className="panel-header"><div><p className="eyebrow">Workflow</p><h2>Workflow snapshot</h2></div></div>
                <ul className="activity-list">
                  <li><strong>Credit monitoring</strong><span>{progress?.workflow?.next?.length ? progress.workflow.next.map(prettyStatus).join(', ') : 'No next step posted yet.'}</span></li>
                  <li><strong>Analysis report</strong><span>{client?.analysisSummary || 'Pending report review.'}</span></li>
                  <li><strong>Dispute strategy</strong><span>{client?.disputePlanSummary || progress?.disputeStrategy?.objective || 'Pending publication.'}</span></li>
                  <li><strong>Open tasks</strong><span>{pendingTasks} pending · {disputes.length} dispute{disputes.length === 1 ? '' : 's'} on file</span></li>
                </ul>
              </section>
            </>
          ) : null}

          {activeTab === 'profile' ? <ProfileSection token={token} user={user} client={client} refreshAll={refreshAll} onUserUpdated={setUser} /> : null}
          {activeTab === 'disputes' ? <DisputesSection client={client} progress={progress} /> : null}
          {activeTab === 'activity' ? <ActivitySection client={client} progress={progress} /> : null}
          {activeTab === 'resources' ? <ResourcesSection progress={progress} /> : null}
          {activeTab === 'analysis' ? <AnalysisSection token={token} client={client} progress={progress} refreshAll={refreshAll} /> : null}

          {activeTab === 'masterclass' ? (
            <MasterclassDashboard
              firstName={user?.firstName || ''}
              completedDays={completedMasterclassDays}
              onMarkComplete={handleMarkMasterclassDay}
              onActiveDayChange={setActiveMcDay}
            />
          ) : null}

          {activeTab === 'tasks' ? (
            <section className="panel">
              <div className="panel-header"><div><p className="eyebrow">Tasks</p><h2>Your action items</h2></div></div>
              <div className="dispute-list">
                {tasks.length ? tasks.map((task) => <div key={task.id} className="dispute-card-live"><div className="dispute-card-top"><strong>{task.title}</strong><span className={task.completed ? 'status-badge status-active' : 'status-badge status-pending'}>{task.completed ? 'Completed' : 'Open'}</span></div><div className="dispute-meta"><span>{task.description || 'No extra details yet.'}</span><span>{task.dueAt ? `Due ${formatDate(task.dueAt)}` : 'No due date set'}</span></div></div>) : <div className="empty-state-card">No active tasks right now.</div>}
              </div>
            </section>
          ) : null}
        </div>
      </main>
    </div>
  );
}
