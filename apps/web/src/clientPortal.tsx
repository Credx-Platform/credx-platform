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

const API_BASE = (import.meta.env.VITE_API_URL ?? '').trim() ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:3000'
    : '');
const TOKEN_KEY = 'credx-client-token';
const USER_KEY = 'credx-client-user';

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

export default function ClientPortalApp() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
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
    let cancelled = false;
    setDataLoading(true);
    setError(null);

    Promise.all([
      apiFetch<{ client: Client | null }>('/api/clients/me', token),
      apiFetch<Progress>('/api/progress/me', token)
    ])
      .then(([clientResponse, progressResponse]) => {
        if (cancelled) return;
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

  return (
    <div className="shell client-shell">
      <aside className="sidebar">
        <div className="brand">CredX</div>
        <nav>
          <a className="active" href="#overview">Overview</a>
          <a href="#tasks">Tasks</a>
          <a href="#activity">Activity</a>
          <a href="#disputes">Disputes</a>
        </nav>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Client Portal</p>
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
