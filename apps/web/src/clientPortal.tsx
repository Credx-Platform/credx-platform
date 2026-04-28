import { useEffect, useMemo, useState, type FormEvent } from 'react';

type User = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
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
  tasks?: Array<{ id: string; title: string; description?: string | null; completed: boolean; dueAt?: string | null }>;
  activities?: Array<{ id: string; message: string; createdAt: string; type?: string }>;
  disputes?: Array<{ id: string; creditorName: string; bureau: string; status: string; round: number; reason?: string | null }>;
  documents?: Array<{ id: string; fileName: string; type: string; uploadedAt: string }>;
};

type Progress = {
  uploadedDocs?: Array<{ name?: string; type?: string; uploadedAt?: string; fileName?: string }>;
  workflow?: { stage?: string; updatedAt?: string; next?: string[] };
  onboarding?: { status?: string; signupAt?: string | null; completedAt?: string | null };
  tasks?: Array<{ id: string; title: string; description?: string | null; completed: boolean; dueAt?: string | null }>;
  activities?: Array<{ id: string; message: string; createdAt: string }>;
  disputes?: Array<Record<string, unknown>>;
  scores?: { equifax?: number | null; experian?: number | null; transunion?: number | null };
};

type LoginResponse = {
  user: User;
  token: string;
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

const API_BASE = (import.meta.env.VITE_API_URL ?? '').trim() ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:3000'
    : '');
const TOKEN_KEY = 'credx-client-token';
const USER_KEY = 'credx-client-user';
const BRAND_LOGO = '/images/credx-logo-1.jpg';

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

function prettyStatus(value?: string | null) {
  return (value || 'unknown').toLowerCase().replace(/_/g, ' ');
}

function formatDate(value?: string | null) {
  if (!value) return 'Pending';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function ClientLogin({
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  error,
  loading
}: {
  email: string;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  error: string | null;
  loading: boolean;
}) {
  return (
    <div className="auth-shell client-auth-shell">
      <form className="auth-card client-auth-card" onSubmit={onSubmit}>
        <div className="brand-mark brand-mark--centered">
          <img src={BRAND_LOGO} alt="CredX" className="brand-logo" />
        </div>
        <p className="eyebrow">CredX Client Access</p>
        <h1>Client Portal Login</h1>
        <p className="helper-text">Sign in to see your workflow stage, tasks, activity, and current dispute progress.</p>
        <label>
          <span>Email</span>
          <input value={email} onChange={(event) => onEmailChange(event.target.value)} placeholder="you@example.com" />
        </label>
        <label>
          <span>Password</span>
          <input type="password" value={password} onChange={(event) => onPasswordChange(event.target.value)} placeholder="Password" />
        </label>
        {error ? <div className="error-banner">{error}</div> : null}
        <button type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
      </form>
    </div>
  );
}

function OnboardingWizard({
  token,
  user,
  progress,
  onProgressUpdated
}: {
  token: string;
  user: User;
  progress: Progress | null;
  onProgressUpdated: (nextProgress: Progress) => void;
}) {
  const [contractText, setContractText] = useState<ContractTextResponse | null>(null);
  const [loadingContract, setLoadingContract] = useState(true);
  const [busyStep, setBusyStep] = useState<string | null>(null);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [signatureName, setSignatureName] = useState(`${user.firstName} ${user.lastName}`.trim());
  const [contractAgreed, setContractAgreed] = useState(false);
  const [docName, setDocName] = useState('');
  const [docType, setDocType] = useState('credit_report');
  const [wizardState, setWizardState] = useState<WizardState>({
    ...defaultWizardState,
    fullName: `${user.firstName} ${user.lastName}`.trim(),
    email: user.email
  });

  useEffect(() => {
    let cancelled = false;
    setLoadingContract(true);
    apiFetch<ContractTextResponse>('/api/contracts/text', token)
      .then((response) => {
        if (!cancelled) setContractText(response);
      })
      .catch((error) => {
        if (!cancelled) setWizardError(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingContract(false);
      });
    return () => {
      cancelled = true;
    };
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
      await apiFetch('/api/contracts', token, {
        method: 'POST',
        body: JSON.stringify({ signed_name: signatureName, agreed: contractAgreed })
      });
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
        body: JSON.stringify({
          provider: wizardState.provider,
          username: wizardState.monitorUsername,
          password: wizardState.monitorPassword
        })
      });
      await refreshProgress();
    } catch (error) {
      setWizardError(error instanceof Error ? error.message : 'Unable to save monitoring');
    } finally {
      setBusyStep(null);
    }
  }

  async function submitDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWizardError(null);
    setBusyStep('upload');
    try {
      await apiFetch('/api/progress/me/docs', token, {
        method: 'POST',
        body: JSON.stringify({ name: docName, fileName: docName, type: docType })
      });
      setDocName('');
      await refreshProgress();
    } catch (error) {
      setWizardError(error instanceof Error ? error.message : 'Unable to save document');
    } finally {
      setBusyStep(null);
    }
  }

  return (
    <section className="panel" id="onboarding">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Onboarding</p>
          <h2>Finish your CredX setup</h2>
        </div>
      </div>
      {wizardError ? <div className="error-banner">{wizardError}</div> : null}
      <div className="dispute-list">
        {loadingContract ? <div className="empty-state-card">Loading your agreement...</div> : null}

        {needsContract && contractText ? (
          <form className="dispute-card-live" onSubmit={submitContract}>
            <div className="dispute-card-top"><strong>Step 1, sign your agreement</strong></div>
            <div className="dispute-meta" style={{ display: 'block' }}>
              <p style={{ whiteSpace: 'pre-wrap', marginBottom: '1rem' }}>{contractText.agreement}</p>
              <p style={{ whiteSpace: 'pre-wrap', marginBottom: '1rem' }}>{contractText.disclosure}</p>
              <input className="chat-input" value={signatureName} onChange={(e) => setSignatureName(e.target.value)} placeholder="Type your full name" />
              <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginTop: '1rem' }}>
                <input type="checkbox" checked={contractAgreed} onChange={(e) => setContractAgreed(e.target.checked)} />
                <span>I have read and agree to the contract and disclosures.</span>
              </label>
              <button className="ghost-button" type="submit" disabled={busyStep === 'contract' || !contractAgreed || !signatureName.trim()} style={{ marginTop: '1rem' }}>
                {busyStep === 'contract' ? 'Signing...' : 'Sign contract'}
              </button>
            </div>
          </form>
        ) : null}

        {needsApplication ? (
          <form className="dispute-card-live" onSubmit={submitApplication}>
            <div className="dispute-card-top"><strong>Step 2, complete intake</strong></div>
            <div className="dispute-meta" style={{ display: 'grid', gap: '.75rem' }}>
              <input className="chat-input" value={wizardState.fullName} onChange={(e) => setField('fullName', e.target.value)} placeholder="Full name" />
              <input className="chat-input" value={wizardState.email} onChange={(e) => setField('email', e.target.value)} placeholder="Email" />
              <input className="chat-input" value={wizardState.phone} onChange={(e) => setField('phone', e.target.value)} placeholder="Phone" />
              <input className="chat-input" value={wizardState.address1} onChange={(e) => setField('address1', e.target.value)} placeholder="Address line 1" />
              <input className="chat-input" value={wizardState.address2} onChange={(e) => setField('address2', e.target.value)} placeholder="Address line 2" />
              <input className="chat-input" value={wizardState.city} onChange={(e) => setField('city', e.target.value)} placeholder="City" />
              <input className="chat-input" value={wizardState.state} onChange={(e) => setField('state', e.target.value)} placeholder="State" />
              <input className="chat-input" value={wizardState.zip} onChange={(e) => setField('zip', e.target.value)} placeholder="ZIP" />
              <input className="chat-input" value={wizardState.dob} onChange={(e) => setField('dob', e.target.value)} placeholder="Date of birth (YYYY-MM-DD)" />
              <input className="chat-input" value={wizardState.ssn} onChange={(e) => setField('ssn', e.target.value)} placeholder="SSN" />
              <button className="ghost-button" type="submit" disabled={busyStep === 'application'}>
                {busyStep === 'application' ? 'Saving...' : 'Save intake'}
              </button>
            </div>
          </form>
        ) : null}

        {needsMonitoring ? (
          <form className="dispute-card-live" onSubmit={submitMonitoring}>
            <div className="dispute-card-top"><strong>Step 3, set your monitoring account</strong></div>
            <div className="dispute-meta" style={{ display: 'grid', gap: '.75rem' }}>
              <select className="chat-input" value={wizardState.provider} onChange={(e) => setField('provider', e.target.value)}>
                <option value="">Select provider</option>
                <option value="IdentityIQ">IdentityIQ</option>
                <option value="MyFreeScoreNow">MyFreeScoreNow</option>
              </select>
              <input className="chat-input" value={wizardState.monitorUsername} onChange={(e) => setField('monitorUsername', e.target.value)} placeholder="Monitoring username" />
              <input className="chat-input" type="password" value={wizardState.monitorPassword} onChange={(e) => setField('monitorPassword', e.target.value)} placeholder="Monitoring password" />
              <button className="ghost-button" type="submit" disabled={busyStep === 'monitoring' || !wizardState.provider}>
                {busyStep === 'monitoring' ? 'Saving...' : 'Save monitoring'}
              </button>
            </div>
          </form>
        ) : null}

        {needsUpload ? (
          <form className="dispute-card-live" onSubmit={submitDocument}>
            <div className="dispute-card-top"><strong>Step 4, upload your documents</strong></div>
            <div className="dispute-meta" style={{ display: 'grid', gap: '.75rem' }}>
              <input className="chat-input" value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="Document name, for example experian-report.pdf" />
              <select className="chat-input" value={docType} onChange={(e) => setDocType(e.target.value)}>
                <option value="credit_report">Credit report</option>
                <option value="identity">Driver's license or ID</option>
                <option value="proof_of_address">Proof of address</option>
                <option value="other">Other</option>
              </select>
              <button className="ghost-button" type="submit" disabled={busyStep === 'upload' || !docName.trim()}>
                {busyStep === 'upload' ? 'Uploading...' : 'Save document'}
              </button>
            </div>
          </form>
        ) : null}

        {completedAt ? <div className="empty-state-card">Onboarding complete. Your file is now in review.</div> : null}
      </div>
    </section>
  );
}

export default function ClientPortalApp({ onboardingOnly = false }: { onboardingOnly?: boolean }) {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const urlToken = new URLSearchParams(window.location.search).get('token');
      if (urlToken) return urlToken;
    }
    return localStorage.getItem(TOKEN_KEY);
  });
  const [user, setUser] = useState<User | null>(() => {
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
      apiFetch<User>('/api/users/me', token),
      apiFetch<{ client: Client | null }>('/api/clients/me', token),
      apiFetch<Progress>('/api/progress/me', token)
    ])
      .then(([userResponse, clientResponse, progressResponse]) => {
        if (cancelled) return;
        setUser(userResponse);
        localStorage.setItem(USER_KEY, JSON.stringify(userResponse));
        setClient(clientResponse.client);
        setProgress(progressResponse);
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

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<LoginResponse>('/api/auth/login', undefined, {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      if (response.user.role !== 'CLIENT') {
        throw new Error('This login is for clients only');
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
    setClient(null);
    setProgress(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  };

  const workflowStage = useMemo(() => prettyStatus(progress?.workflow?.stage || client?.status), [progress?.workflow?.stage, client?.status]);
  const tasks = progress?.tasks || client?.tasks || [];
  const activities = progress?.activities || client?.activities || [];
  const disputes = client?.disputes || [];
  const uploadedDocs = progress?.uploadedDocs || [];
  const scoreEntries = progress?.scores || {};

  if (!token) {
    if (onboardingOnly) {
      return (
        <div className="auth-shell client-auth-shell">
          <div className="auth-card client-auth-card">
            <div className="brand-mark brand-mark--centered">
              <img src={BRAND_LOGO} alt="CredX" className="brand-logo" />
            </div>
            <p className="eyebrow">CredX Onboarding</p>
            <h1>Continue your signup</h1>
            <p className="helper-text">Use the secure link from your welcome email to review your agreement and finish your intake.</p>
          </div>
        </div>
      );
    }

    return (
      <ClientLogin
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

  if (onboardingOnly) {
    return (
      <div className="shell client-shell">
        <main className="main" style={{ marginLeft: 0 }}>
          <header className="topbar">
            <div>
              <div className="brand-row">
                <img src={BRAND_LOGO} alt="CredX" className="brand-logo brand-logo--small" />
                <p className="eyebrow">CredX Onboarding</p>
              </div>
              <h1 className="top-title">Complete your signup</h1>
              <p className="helper-text">Review your agreement, finish your intake, and connect your credit monitoring provider.</p>
            </div>
          </header>
          {error ? <div className="error-banner">{error}</div> : null}
          {!progress?.onboarding?.completedAt && user ? (
            <OnboardingWizard token={token} user={user} progress={progress} onProgressUpdated={setProgress} />
          ) : null}
          {progress?.onboarding?.completedAt ? (
            <section className="panel">
              <div className="empty-state-card">
                Signup complete. Check your email for the password setup link to access your client portal.
              </div>
            </section>
          ) : null}
        </main>
      </div>
    );
  }

  return (
    <div className="shell client-shell">
      <aside className="sidebar">
        <div className="brand-mark">
          <img src={BRAND_LOGO} alt="CredX" className="brand-logo" />
        </div>
        <nav>
          <a className="active" href="#overview">Overview</a>
          <a href="#onboarding">Onboarding</a>
          <a href="#tasks">Tasks</a>
          <a href="#activity">Activity</a>
          <a href="#disputes">Disputes</a>
        </nav>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <div className="brand-row">
              <img src={BRAND_LOGO} alt="CredX" className="brand-logo brand-logo--small" />
              <p className="eyebrow">Client Portal</p>
            </div>
            <h1 className="top-title">Welcome back{user ? `, ${user.firstName}` : ''}</h1>
            {dataLoading ? <p className="helper-text">Refreshing your latest CredX progress...</p> : null}
          </div>
          <div className="topbar-actions">
            <div className="admin-pill">{client?.serviceTier || 'ESSENTIAL'} plan</div>
            <button className="ghost-button" onClick={handleLogout}>Sign out</button>
          </div>
        </header>

        {error ? <div className="error-banner">{error}</div> : null}
        {client?.portalRestricted ? <div className="error-banner">Your portal access is currently restricted. Contact CredX support for help.</div> : null}

        <div className="page-grid">
          <section className="hero-card" id="overview">
            <div>
              <p className="eyebrow">Current Status</p>
              <h1 style={{ fontSize: '2rem' }}>{workflowStage}</h1>
              <p>
                {client?.analysisSummary || 'Your account is active in the CredX workflow. Check tasks and recent activity below for the latest updates.'}
              </p>
            </div>
            <div className="hero-stats">
              <div className="stat-card"><span>Portal Status</span><strong>{prettyStatus(client?.status)}</strong></div>
              <div className="stat-card"><span>Timeline</span><strong>{client?.estimatedTimelineMonths ? `${client.estimatedTimelineMonths} mo` : 'Pending'}</strong></div>
              <div className="stat-card"><span>Tasks</span><strong>{tasks.length}</strong></div>
              <div className="stat-card"><span>Disputes</span><strong>{disputes.length}</strong></div>
            </div>
          </section>

          {!progress?.onboarding?.completedAt && user ? (
            <OnboardingWizard token={token} user={user} progress={progress} onProgressUpdated={setProgress} />
          ) : null}

          <section className="panel two-col">
            <div>
              <h2>Workflow</h2>
              <ul className="activity-list">
                <li>
                  <strong>Onboarding</strong>
                  <span>{prettyStatus(progress?.onboarding?.status)} · {formatDate(progress?.onboarding?.completedAt || progress?.onboarding?.signupAt || undefined)}</span>
                </li>
                <li>
                  <strong>Next Steps</strong>
                  <span>{progress?.workflow?.next?.length ? progress.workflow.next.map(prettyStatus).join(', ') : 'Updates will appear here soon.'}</span>
                </li>
                <li>
                  <strong>Dispute Plan</strong>
                  <span>{client?.disputePlanSummary || 'Not published yet.'}</span>
                </li>
              </ul>
            </div>
            <div>
              <h2>Score Snapshot</h2>
              <div className="quick-actions quick-actions--plans">
                <div className="plan-card"><strong>Equifax</strong><span>{scoreEntries.equifax ?? 'Pending'}</span></div>
                <div className="plan-card"><strong>Experian</strong><span>{scoreEntries.experian ?? 'Pending'}</span></div>
                <div className="plan-card"><strong>TransUnion</strong><span>{scoreEntries.transunion ?? 'Pending'}</span></div>
              </div>
            </div>
          </section>

          <section className="panel" id="tasks">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Action Items</p>
                <h2>Your Tasks</h2>
              </div>
            </div>
            <div className="dispute-list">
              {tasks.length ? tasks.map((task) => (
                <div key={task.id} className="dispute-card-live">
                  <div className="dispute-card-top">
                    <strong>{task.title}</strong>
                    <span className={task.completed ? 'status-badge status-active' : 'status-badge status-pending'}>{task.completed ? 'Completed' : 'Open'}</span>
                  </div>
                  <div className="dispute-meta">
                    <span>{task.description || 'No extra details yet.'}</span>
                    <span>{task.dueAt ? `Due ${formatDate(task.dueAt)}` : 'No due date set'}</span>
                  </div>
                </div>
              )) : <div className="empty-state-card">No active tasks right now.</div>}
            </div>
          </section>

          <section className="panel two-col">
            <div id="activity">
              <h2>Recent Activity</h2>
              <ul className="activity-list">
                {activities.length ? activities.slice(0, 8).map((item) => (
                  <li key={item.id}>
                    <strong>{formatDate(item.createdAt)}</strong>
                    <span>{item.message}</span>
                  </li>
                )) : <li><strong>No updates yet</strong><span>As your file moves, updates will appear here.</span></li>}
              </ul>
            </div>
            <div id="disputes">
              <h2>Disputes</h2>
              <div className="dispute-list">
                {disputes.length ? disputes.map((dispute) => (
                  <div key={dispute.id} className="dispute-card-live">
                    <div className="dispute-card-top">
                      <strong>{dispute.creditorName}</strong>
                      <span className={`status-badge status-${dispute.status.toLowerCase()}`}>{prettyStatus(dispute.status)}</span>
                    </div>
                    <div className="dispute-meta">
                      <span>{dispute.bureau} · Round {dispute.round}</span>
                      <span>{dispute.reason || 'Reason pending'}</span>
                    </div>
                  </div>
                )) : <div className="empty-state-card">No disputes have been posted to your portal yet.</div>}
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Documents</p>
                <h2>Uploaded Docs</h2>
              </div>
            </div>
            <div className="quick-actions quick-actions--plans">
              {uploadedDocs.length ? uploadedDocs.map((doc, index) => (
                <div key={`${doc.name || doc.fileName || 'doc'}-${index}`} className="plan-card">
                  <strong>{doc.name || doc.fileName || 'Document'}</strong>
                  <span>{prettyStatus(doc.type)}</span>
                  <small>{formatDate(doc.uploadedAt)}</small>
                </div>
              )) : <div className="empty-state-card">No uploaded documents listed yet.</div>}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
