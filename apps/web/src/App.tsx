import { FormEvent, useEffect, useMemo, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { DisputeManager } from './components/DisputeManager';

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
  role: 'CLIENT' | 'STAFF' | 'ADMIN';
};

type ClientRecord = {
  id: string;
  status: 'LEAD' | 'CONTRACT_SENT' | 'INTAKE_RECEIVED' | 'ANALYSIS_READY' | 'UPGRADE_OFFERED' | 'ACTIVE' | 'PAST_DUE' | 'RESTRICTED' | 'CANCELLED';
  serviceTier: 'ESSENTIAL' | 'AGGRESSIVE' | 'FAMILY';
  analysisSummary?: string | null;
  disputePlanSummary?: string | null;
  estimatedTimelineMonths?: number | null;
  portalRestricted?: boolean;
  createdAt: string;
  updatedAt: string;
  user: User;
  disputes: Array<{ id: string; status: string }>;
  payments: Array<{ id: string; status: string }>;
  documents: Array<{ id: string }>;
  activities: Array<{ id: string; message: string; createdAt: string }>;
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

async function apiFetch<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  if (!API_BASE) {
    throw new Error('Missing VITE_API_URL for this deployment');
  }

  const headers = new Headers(init?.headers ?? {});
  if (!headers.has('content-type') && init?.body) headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(body?.error ?? `Request failed: ${response.status}`);
  }

  return body as T;
}

function money(value: number | null) {
  if (value == null) return 'Custom';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function statusClass(status: string) {
  return `status-badge status-${status.toLowerCase()}`;
}

function Overview({ clients, disputes, plans }: { clients: ClientRecord[]; disputes: DisputeRecord[]; plans: Plan[] }) {
  const newLeads = clients.filter((client) => client.status === 'LEAD').length;
  const activeClients = clients.filter((client) => client.status === 'ACTIVE').length;
  const analysisReady = clients.filter((client) => ['ANALYSIS_READY', 'UPGRADE_OFFERED'].includes(client.status)).length;
  const pendingDisputes = disputes.filter((dispute) => !['COMPLETED', 'REJECTED'].includes(dispute.status)).length;
  const uploadsAwaitingReview = clients.reduce((sum, client) => sum + client.documents.length, 0);

  const recentActivity = clients
    .flatMap((client) => {
      if (client.activities.length) {
        return client.activities.map((activity) => ({
          id: activity.id,
          name: `${client.user.firstName} ${client.user.lastName}`,
          text: activity.message,
          createdAt: activity.createdAt
        }));
      }

      return [
        {
          id: `client-${client.id}`,
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
          <h1>Client Dashboard & Dispute Operations</h1>
          <p>
            Centralize onboarding, disputes, client tracking, and staff workflow in one live CredX workspace.
          </p>
        </div>
        <div className="hero-stats">
          <div className="stat-card"><span>New Leads</span><strong>{newLeads}</strong></div>
          <div className="stat-card"><span>Analysis Ready</span><strong>{analysisReady}</strong></div>
          <div className="stat-card"><span>Active Clients</span><strong>{activeClients}</strong></div>
          <div className="stat-card"><span>Pending Disputes</span><strong>{pendingDisputes}</strong></div>
        </div>
      </section>

      <section className="panel two-col">
        <div>
          <h2>Recent Client Activity</h2>
          <ul className="activity-list">
            {recentActivity.length ? recentActivity.map((item) => (
              <li key={item.id}>
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
              <div key={client.id} className="plan-card">
                <strong>{client.user.firstName} {client.user.lastName}</strong>
                <span>Status {client.status.replace('_', ' ')}</span>
                <span>Timeline {client.estimatedTimelineMonths ? `${client.estimatedTimelineMonths} months` : 'Pending analysis'}</span>
                {client.analysisSummary ? <small>{client.analysisSummary.slice(0, 90)}{client.analysisSummary.length > 90 ? '…' : ''}</small> : <small>Analysis not published yet.</small>}
              </div>
            ))}
          </div>
          <p className="helper-text">Clients should receive analysis and a rough dispute timeline before service upgrade and active dispute work begin.</p>
        </div>
      </section>
    </div>
  );
}

function Clients({ clients }: { clients: ClientRecord[] }) {
  const [searchQuery, setSearchQuery] = useState('');
  
  const filteredClients = useMemo(() => {
    if (!searchQuery.trim()) return clients;
    const query = searchQuery.toLowerCase();
    return clients.filter(client => 
      client.user.firstName.toLowerCase().includes(query) ||
      client.user.lastName.toLowerCase().includes(query) ||
      client.user.email.toLowerCase().includes(query) ||
      client.status.toLowerCase().includes(query)
    );
  }, [clients, searchQuery]);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Client Management</p>
          <h2>Customers</h2>
        </div>
        <div className="search-box">
          <input
            type="text"
            placeholder="Search clients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.875rem',
              minWidth: '250px'
            }}
          />
        </div>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Client</th>
            <th>Status</th>
            <th>Tier</th>
            <th>Reports / Uploads</th>
            <th>Analysis</th>
            <th>Disputes</th>
            <th>Last Activity</th>
          </tr>
        </thead>
        <tbody>
          {filteredClients.length ? filteredClients.map((client) => (
            <tr key={client.id}>
              <td>
                <strong>{client.user.firstName} {client.user.lastName}</strong>
                <div className="cell-subtext">{client.user.email}</div>
              </td>
              <td><span className={statusClass(client.status)}>{client.status.replace('_', ' ')}</span></td>
              <td>{client.serviceTier}</td>
              <td>{client.documents.length} uploads</td>
              <td>{client.estimatedTimelineMonths ? `${client.estimatedTimelineMonths} mo` : 'Pending'}</td>
              <td>{client.disputes.length} items</td>
              <td>{formatDate(client.updatedAt)}</td>
            </tr>
          )) : (
            <tr>
              <td colSpan={7} className="empty-row">
                {searchQuery ? 'No clients match your search.' : 'No clients yet.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function DisputesRoute({ token }: { token: string }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Dispute Manager</p>
          <h2>Client Dispute Operations</h2>
        </div>
      </div>
      <DisputeManager token={token} />
    </section>
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

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  });
  const [email, setEmail] = useState('admin@credxme.com');
  const [password, setPassword] = useState('StrongPass123');
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [disputes, setDisputes] = useState<DisputeRecord[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(false);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    setDataLoading(true);
    setError(null);

    Promise.all([
      apiFetch<{ clients: ClientRecord[] }>('/api/clients', token),
      apiFetch<{ disputes: DisputeRecord[] }>('/api/disputes', token),
      apiFetch<{ plans: Plan[] }>('/api/billing/plans', token)
    ])
      .then(([clientsResponse, disputesResponse, plansResponse]) => {
        if (cancelled) return;
        setClients(clientsResponse.clients);
        setDisputes(disputesResponse.disputes);
        setPlans(plansResponse.plans);
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
  }, [token]);

  const statsTitle = useMemo(() => {
    if (!user) return 'Staff Mode';
    return `${user.role} Mode`;
  }, [user]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch<LoginResponse>('/api/auth/login', undefined, {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

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
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
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

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand-mark">
          <img src={BRAND_LOGO} alt="CredX" className="brand-logo" />
        </div>
        <nav>
          <NavLink to="/" end>Overview</NavLink>
          <NavLink to="/clients">Clients</NavLink>
          <NavLink to="/disputes">Disputes</NavLink>
        </nav>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <div className="brand-row">
              <img src={BRAND_LOGO} alt="CredX" className="brand-logo brand-logo--small" />
              <p className="eyebrow">Admin Portal</p>
            </div>
            <h1 className="top-title">Operations Dashboard</h1>
            {dataLoading ? <p className="helper-text">Refreshing live CredX data...</p> : null}
          </div>
          <div className="topbar-actions">
            <div className="admin-pill">{statsTitle}</div>
            <button className="ghost-button" onClick={handleLogout}>Sign out</button>
          </div>
        </header>
        {error ? <div className="error-banner">{error}</div> : null}
        <Routes>
          <Route path="/" element={<Overview clients={clients} disputes={disputes} plans={plans} />} />
          <Route path="/clients" element={<Clients clients={clients} />} />
          <Route path="/disputes" element={<DisputesRoute token={token} />} />
        </Routes>
      </main>
    </div>
  );
}
