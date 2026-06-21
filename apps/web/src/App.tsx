import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DisputeManager } from './components/DisputeManager';
import { AnalysisTab } from './components/AnalysisTab';

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
  status: 'LEAD' | 'STUDENT' | 'CONTRACT_SENT' | 'INTAKE_RECEIVED' | 'ANALYSIS_READY' | 'UPGRADE_OFFERED' | 'ACTIVE' | 'PAST_DUE' | 'RESTRICTED' | 'CANCELLED';
  serviceTier: 'ESSENTIAL' | 'AGGRESSIVE' | 'FAMILY';
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
  createdAt: string;
  updatedAt: string;
  user: User;
  disputes: Array<{ id: string; status: string }>;
  payments: Array<{ id: string; status: string }>;
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
  creditReports?: Array<{ id: string; bureau: string; pulledAt: string; tradelines: Array<{ id: string }> }>;
  tasks?: Array<{ id: string; title?: string | null; status?: string | null }>;
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

async function apiUpload<T>(path: string, token: string, formData: FormData): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: formData
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(body?.error ?? `Upload failed: ${response.status}`);
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

function bureauLabel(bureau: DisputeRecord['bureau']) {
  return bureau === 'TRANSUNION' ? 'TransUnion' : bureau === 'EQUIFAX' ? 'Equifax' : 'Experian';
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function Overview({ clients, disputes, plans, leadsCount }: { clients: ClientRecord[]; disputes: DisputeRecord[]; plans: Plan[]; leadsCount: number }) {
  const navigate = useNavigate();
  const newLeads = clients.filter((client) => client.status === 'LEAD' || client.status === 'INTAKE_RECEIVED').length;
  const activeClients = clients.filter((client) => client.status === 'ACTIVE').length;
  const analysisReady = clients.filter((client) => ['ANALYSIS_READY', 'UPGRADE_OFFERED'].includes(client.status)).length;
  const pendingDisputes = disputes.filter((dispute) => !['COMPLETED', 'REJECTED'].includes(dispute.status)).length;
  const uploadsAwaitingReview = clients.reduce((sum, client) => sum + client.documents.length, 0);
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
          <button className="stat-card stat-card--interactive" onClick={() => navigate('/leads')}><span>Marketing Leads</span><strong>{leadsCount}</strong></button>
          <button className="stat-card stat-card--interactive" onClick={() => navigate('/clients?status=NEW')}><span>New Leads</span><strong>{newLeads}</strong></button>
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
                <span>Status {client.status.replace('_', ' ')}</span>
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
  { key: 'INTAKE_RECEIVED', label: 'Intake' },
  { key: 'ANALYSIS_READY', label: 'Analysis Ready' },
  { key: 'UPGRADE_OFFERED', label: 'Upgrade' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'PAST_DUE', label: 'Past Due' },
  { key: 'RESTRICTED', label: 'Restricted' },
  { key: 'CANCELLED', label: 'Cancelled' }
];

function Leads({ leads, clients }: { leads: LeadRecord[]; clients: ClientRecord[] }) {
  const [searchQuery, setSearchQuery] = useState('');
  const registeredEmails = useMemo(() => {
    const set = new Set<string>();
    for (const c of clients) set.add(c.user.email.toLowerCase());
    return set;
  }, [clients]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return leads;
    const q = searchQuery.toLowerCase();
    return leads.filter((l) =>
      l.firstName.toLowerCase().includes(q) ||
      l.lastName.toLowerCase().includes(q) ||
      l.email.toLowerCase().includes(q) ||
      (l.phone || '').toLowerCase().includes(q) ||
      (l.creditGoal || '').toLowerCase().includes(q)
    );
  }, [leads, searchQuery]);

  const unconverted = filtered.filter((l) => !registeredEmails.has(l.email.toLowerCase())).length;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Landing Page Submissions</p>
          <h2>Marketing Leads</h2>
          <div className="filter-summary">
            <span>Showing <strong>{filtered.length}</strong> of <strong>{leads.length}</strong></span>
            <span>· <strong>{unconverted}</strong> not yet registered</span>
          </div>
        </div>
        <input
          type="search"
          className="search-input"
          placeholder="Search name, email, phone…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state-card">
          <strong>No leads yet</strong>
          <p>Form submissions from the landing page will appear here.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
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
                const isRegistered = registeredEmails.has(lead.email.toLowerCase());
                const source = [lead.referralSource, lead.referralName, lead.referralOther].filter(Boolean).join(' · ');
                return (
                  <tr key={lead.id}>
                    <td>{lead.firstName} {lead.lastName}</td>
                    <td>{lead.email}</td>
                    <td>{lead.phone || '—'}</td>
                    <td>{lead.creditGoal || '—'}</td>
                    <td>{source || '—'}</td>
                    <td>{lead.offerInterest || '—'}</td>
                    <td>{formatDate(lead.createdAt)}</td>
                    <td>
                      {isRegistered ? (
                        <span className="status-pill status-pill--ok">Registered</span>
                      ) : (
                        <span className="status-pill">Awaiting signup</span>
                      )}
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

function Clients({ clients }: { clients: ClientRecord[] }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const statusFilter = searchParams.get('status');
  const viewParam = searchParams.get('view');
  const activeView: 'paid' | 'students' = viewParam === 'students' ? 'students' : 'paid';
  const hasActiveFilter = Boolean(statusFilter) || searchQuery.trim().length > 0;

  // A "paid" client has moved beyond just being a masterclass lead
  const isPaidClient = (c: ClientRecord) =>
    !['LEAD', 'STUDENT'].includes(c.status) || c.payments.length > 0 || c.disputes.length > 0;
  const isStudent = (c: ClientRecord) => isStudentClient(c);

  const paidClients = clients.filter(isPaidClient);
  const studentClients = clients.filter(isStudent);

  const displayedClients = activeView === 'students' ? studentClients : paidClients;

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
      client.status.toLowerCase().includes(query)
    );
  }, [displayedClients, searchQuery, statusFilter]);

  const clearFilters = () => {
    setSearchQuery('');
    const next = new URLSearchParams(searchParams);
    next.delete('status');
    setSearchParams(next);
  };

  const setStatus = (status: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (status) next.set('status', status);
    else next.delete('status');
    setSearchParams(next);
  };

  const switchView = (view: 'paid' | 'students') => {
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
              <span>Showing <strong>{filteredClients.length}</strong> of <strong>{activeView === 'students' ? studentClients.length : paidClients.length}</strong> {activeView === 'students' ? 'students' : 'paid clients'}</span>
              {statusFilter ? <span>· <strong>{statusFilter.replace(/_/g, ' ')}</strong></span> : null}
              {searchQuery.trim() ? <span>· search: <strong>"{searchQuery.trim()}"</strong></span> : null}
              {hasActiveFilter ? (
                <button type="button" className="filter-summary__clear" onClick={clearFilters}>
                  Clear · show all ({activeView === 'students' ? studentClients.length : paidClients.length})
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
          </div>
        </div>

        <div className="view-switcher">
          <button
            type="button"
            className={`tab ${activeView === 'paid' ? 'active' : ''}`}
            onClick={() => switchView('paid')}
          >
            Paid Clients ({paidClients.length})
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
                <th>Status</th>
                <th>Tier</th>
                <th>Reports / Uploads</th>
                <th>Analysis</th>
                <th>Disputes</th>
                <th>Last Activity</th>
                {activeView === 'students' ? <th>Lesson Progress</th> : null}
              </tr>
            </thead>
            <tbody>
              {filteredClients.length ? filteredClients.map((client) => (
                <tr key={client.id} className="clickable-row" onClick={() => navigate(`/clients/${client.id}`)}>
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
                </tr>
              )) : (
                <tr>
                  <td colSpan={activeView === 'students' ? 8 : 7} className="empty-row">
                    {searchQuery ? 'No clients match your search.' : activeView === 'students' ? 'No masterclass students yet.' : 'No paid clients yet.'}
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

type ClientWorkspaceTab = 'overview' | 'profile' | 'documents' | 'disputes' | 'activity' | 'analysis';

function ClientDetailRoute({ token }: { token: string }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestedTab = searchParams.get('tab') as ClientWorkspaceTab | null;
  const [activeTab, setActiveTab] = useState<ClientWorkspaceTab>(requestedTab || 'overview');
  const [statusValue, setStatusValue] = useState('LEAD');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadType, setUploadType] = useState<'credit_report' | 'identity' | 'proof_of_address' | 'other'>('credit_report');
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

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
        ? 'Uploaded — analysis is running in the background. Refresh in a few seconds to see findings.'
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

  if (loading) return <section className="panel"><p className="helper-text">Loading client workspace...</p></section>;
  if (error) return <section className="panel"><div className="error-banner">{error}</div></section>;
  if (!client) return <section className="panel"><p className="helper-text">Client not found.</p></section>;

  const fullName = `${client.user.firstName} ${client.user.lastName}`;
  const disputeItems = client.disputeItems || [];
  const documents = client.documents || [];
  const activities = client.activities || [];
  const scores = client.progress?.scores || {};
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
                  <li><strong>Tier</strong><span>{client.serviceTier}</span></li>
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
              <MasterclassProgressPanel progress={client.progress || null} />
            </div>
          ) : null}

          {activeTab === 'profile' ? (
            <div className="client-section-stack">
              <div>
                <h3>Profile details</h3>
                <ul className="detail-list">
                  <li><strong>Name</strong><span>{fullName}</span></li>
                  <li><strong>Email</strong><span>{client.user.email}</span></li>
                  <li><strong>Address</strong><span>{[client.currentAddressLine1, client.currentAddressLine2, client.currentCity, client.currentState, client.currentPostalCode].filter(Boolean).join(', ') || 'Not on file'}</span></li>
                  <li><strong>SSN last 4</strong><span>{client.ssnLast4 || 'Not on file'}</span></li>
                </ul>
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
                        if (!confirm(`Mark ${fullName} as paid and activate? This will record a payment, set status to ACTIVE, and auto-generate dispute letters from the current analysis.`)) return;
                        setSaving(true);
                        try {
                          const res = await apiFetch<{ success: boolean; activated: boolean; lettersGenerated: number; payment: any }>(`/api/clients/${client.id}/mark-paid-and-activate`, token, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ amount: 150, currency: 'USD', type: 'SETUP_FEE' })
                          });
                          if (res.success && res.activated) {
                            alert(`✅ ${fullName} is now ACTIVE. ${res.lettersGenerated} dispute letter(s) generated. Payment: $${res.payment.amount} ${res.payment.currency}.`);
                          } else {
                            alert('Activation completed but no letters were generated. Check analysis data.');
                          }
                          const updated = await apiFetch<{ client: ClientDetail }>(`/api/clients/${client.id}`, token);
                          setClient(updated.client);
                          setStatusValue('ACTIVE');
                        } catch (err) {
                          alert(`Activation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
                        } finally {
                          setSaving(false);
                        }
                      }}
                      disabled={saving}
                    >
                      💳 Mark Paid & Activate
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

function MasterclassProgressPanel({ progress }: { progress: ClientDetail['progress'] }) {
  const education = progress?.education || {};
  if (!isMasterclassStudent(progress)) return null;

  const completedDays = education.masterclassProgress || [];
  const passedQuizzes = education.masterclassPassedQuizzes || [];
  const attempts = education.masterclassQuizAttempts || {};
  const totalDays = 6;
  const progressPct = Math.round((completedDays.length / totalDays) * 100);

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
        <li><strong>Enrolled</strong><span>{education.enrolledAt ? formatDate(education.enrolledAt) : 'Yes'}</span></li>
        <li><strong>Days completed</strong><span>{completedDays.length} / {totalDays} ({progressPct}%)</span></li>
        <li><strong>Quizzes passed</strong><span>{passedQuizzes.length} / {totalDays}</span></li>
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
  const disputeReason = dispute.reason || 'Account type is incorrect and not correctly displayed. Please delete.';
  return `${clientName}
${formatClientAddress(client)}
${identityLine}

${bureau}
${bureauMailingAddress(dispute.bureau)}

${today}

${dispute.creditorName}: Account number: [last four or partial account number only], ${disputeReason}

I am writing to formally dispute the accuracy and validity of certain items appearing on my credit report in accordance with my rights under the Fair Credit Reporting Act (FCRA) (15 U.S.C. § 1681 et seq.) and the Fair Debt Collection Practices Act (FDCPA) (15 U.S.C. § 1692 et seq.). I demand the immediate removal of the following item due to its unlawful, inaccurate, incomplete, or unverifiable presence on my credit report.

1. Unauthorized Third-Party Collections
According to 15 U.S.C. § 1692e, it is illegal for a debt collector to report false or misleading information to the credit bureaus. I am requesting verification of the alleged debt, including:
• A copy of the original signed contract proving my consent and liability for this debt.
• A chain of custody showing how the debt was acquired.
• Proof that this debt was lawfully assigned in compliance with 15 U.S.C. § 1692g (Validation of Debts).

Failure to provide the above documentation within 30 days will constitute a violation of 15 U.S.C. § 1692k, making the reporting party liable for damages.

2. Unauthorized Inquiries
Per 15 U.S.C. § 1681b, a company must have permissible purpose to conduct a hard inquiry on my credit report. I demand the immediate removal of any inquiry connected to this disputed item if it was not authorized by me.

Under 15 U.S.C. § 1681n, any entity that unlawfully accesses my credit file without proper authorization is subject to statutory damages, attorney's fees, and punitive damages.

Final Demand
As required under 15 U.S.C. § 1681i (Procedure in Case of Disputed Accuracy), you have 30 days to conduct a thorough investigation and remove the inaccurate information. Failure to do so will result in a complaint being filed with the Consumer Financial Protection Bureau (CFPB), the Federal Trade Commission (FTC), and the Attorney General's Office.

I expect a written response confirming the removal of this disputed account and any related inquiry. Any further attempt to report unverifiable or unauthorized information will be considered a willful violation of federal law.

Please send all correspondence to my mailing address listed above.

Sincerely,
${clientName}`;
}

function openPrintDocument(title: string, body: string) {
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return;
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeAdmin(title)}</title><style>
    body{font-family:Arial,sans-serif;color:#111827;line-height:1.35;padding:0.55in;max-width:8.5in;margin:0 auto;}
    pre{white-space:pre-wrap;font:13px/1.35 Arial,sans-serif;margin:0;}
    @page{margin:0.55in;} @media print{body{padding:0;max-width:none;}}
  </style></head><body><pre>${escapeAdmin(body)}</pre><script>window.onload=function(){window.print();}</script></body></html>`);
  w.document.close();
  w.focus();
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
  const [subTab, setSubTab] = useState<'manager' | 'print'>('manager');

  const disputesByClient = useMemo(() => {
    const groups = new Map<string, { client: DisputeRecord['client']; items: DisputeRecord[] }>();
    for (const d of disputes) {
      const key = d.client.id;
      const existing = groups.get(key);
      if (existing) existing.items.push(d);
      else groups.set(key, { client: d.client, items: [d] });
    }
    return Array.from(groups.values()).sort((a, b) => b.items.length - a.items.length);
  }, [disputes]);

  return (
    <div className="page-grid">
      <section className="hero-card hero-card--compact">
        <div>
          <p className="eyebrow">Dispute Desk</p>
          <h1>Dispute Operations</h1>
          <p>Run imports, add accounts, track bureau status, and bulk-print letters from one place.</p>
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
            <p className="eyebrow">Dispute Section</p>
            <h2>{subTab === 'manager' ? 'Client dispute operations' : 'Bulk Print'}</h2>
            <p className="helper-text">{subTab === 'print'
              ? 'Every dispute item, grouped by client. Print one client at a time or run the full batch from the paper-ready template.'
              : 'Import reports, add items, and track bureau status. Use Bulk Print to print every dispute letter at once.'}</p>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button type="button" className={`tab ${subTab === 'manager' ? 'active' : ''}`} onClick={() => setSubTab('manager')}>Manager</button>
            <button type="button" className={`tab ${subTab === 'print' ? 'active' : ''}`} onClick={() => setSubTab('print')}>Bulk Print ({disputes.length})</button>
          </div>
        </div>

        {subTab === 'manager' ? (
          <>
            <div className="filter-summary" style={{ marginBottom: '14px' }}>
              <button type="button" onClick={() => setSubTab('print')} className="filter-summary__clear" style={{ height: 32, padding: '0 14px', fontSize: 12 }}>
                🖨 Send to Bulk Print ({disputes.length})
              </button>
              <span>Jump straight to the bulk print view when you're ready to mail.</span>
            </div>
            <DisputeManager token={token} />
          </>
        ) : null}

        {subTab === 'print' ? (
          <div>
            <div className="bulk-print-toolbar">
              <button type="button" onClick={() => printAdminDisputeQueue(disputes, clients)} disabled={!disputes.length}>
                🖨 Print all dispute letters ({disputes.length})
              </button>
              <button type="button" className="ghost-button" onClick={() => window.location.assign('/adminportal/print')}>
                Open Print Center
              </button>
              <span className="helper-text" style={{ margin: 0 }}>
                Opens completed letter pages and triggers your browser's print dialog.
              </span>
            </div>

            {disputesByClient.length ? (
              <div className="bulk-print-stack">
                {disputesByClient.map(({ client, items }) => (
                  <div key={client.id} className="bulk-print-card">
                    <div className="bulk-print-card__header">
                      <div>
                        <strong>{client.user.firstName} {client.user.lastName}</strong>
                        <div className="cell-subtext">{client.user.email}</div>
                      </div>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => printAdminDisputeQueue(items, clients)}
                      >
                        🖨 Print {items.length} letter{items.length === 1 ? '' : 's'}
                      </button>
                    </div>
                    <div className="dispute-route-table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Creditor</th>
                            <th>Bureau</th>
                            <th>Status</th>
                            <th>Round</th>
                            <th>Opened</th>
                            <th>Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((d) => (
                            <tr key={d.id}>
                              <td>{d.creditorName}</td>
                              <td>{bureauLabel(d.bureau)}</td>
                              <td><span className={statusClass(d.status)}>{d.status.replace('_', ' ')}</span></td>
                              <td>Round {d.round}</td>
                              <td>{formatDate(d.createdAt)}</td>
                              <td>{d.reason || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state-card">No dispute items to print yet. Add items in the Manager tab.</div>
            )}
          </div>
        ) : null}
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
      const result = await apiFetch<{ document: DocumentRecord; content?: string; url?: string }>(
        `/api/clients/${client.id}/documents/${document.id}/print`,
        token
      );
      const title = result.document.fileName || document.fileName || 'CredX document';
      if (result.content) {
        openPrintDocument(title, result.content);
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

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
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
  const [leads, setLeads] = useState<LeadRecord[]>([]);
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
      apiFetch<{ plans: Plan[] }>('/api/billing/plans', token),
      apiFetch<{ leads: LeadRecord[] }>('/api/leads', token)
    ])
      .then(([clientsResponse, disputesResponse, plansResponse, leadsResponse]) => {
        if (cancelled) return;
        setClients(clientsResponse.clients);
        setDisputes(disputesResponse.disputes);
        setPlans(plansResponse.plans);
        setLeads(leadsResponse.leads);
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
    setLeads([]);
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
          <NavLink to="/leads">Leads</NavLink>
          <NavLink to="/clients">Clients</NavLink>
          <NavLink to="/disputes">Disputes</NavLink>
          <NavLink to="/print">Print Center</NavLink>
          <NavLink to="/tasks">Tasks</NavLink>
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
                  : '#00c6fb';
          const sectionLabel = path.startsWith('/disputes')
            ? 'Disputes operations'
            : path.startsWith('/print')
              ? 'Print center'
            : path.startsWith('/clients')
              ? 'Client management'
              : path.startsWith('/leads')
                ? 'Marketing leads'
                : path.startsWith('/tasks')
                  ? 'Task checklist'
                  : 'Operations dashboard';
          const subtitle = path.startsWith('/disputes')
            ? 'Track every dispute round, bureau status, and outcome across the book.'
            : path.startsWith('/print')
              ? 'Print dispute packets, signed agreements, uploads, and client analysis documents.'
            : path.startsWith('/clients')
              ? 'Search, open, and update client files. Identity data is encrypted at rest.'
              : path.startsWith('/leads')
                ? 'Landing-page submissions awaiting contract and onboarding.'
                : path.startsWith('/tasks')
                  ? 'Track internal tasks, deadlines, and priorities across the team.'
                  : 'Live snapshot of leads, active programs, dispute throughput, and revenue.';
          return (
            <header className="topbar topbar--themed" style={{ ['--section-accent' as string]: accent } as React.CSSProperties}>
              <div>
                <div className="brand-row">
                  <img src={BRAND_LOGO} alt="CredX" className="brand-logo brand-logo--small" />
                  <p className="eyebrow" style={{ color: accent }}>Admin · {user?.role || 'STAFF'}</p>
                </div>
                <h1 className="top-title">{sectionLabel}</h1>
                <p className="top-subtitle">{subtitle}</p>
                {dataLoading ? <p className="helper-text">Refreshing live CredX data...</p> : null}
              </div>
              <div className="topbar-actions">
                <div className="admin-pill">{statsTitle}</div>
                <span className="security-note-inline" aria-label="Encrypted">🔒 Staff-only · Encrypted</span>
                <button className="ghost-button" onClick={handleLogout}>Sign out</button>
              </div>
            </header>
          );
        })()}

        <select
          className="mobile-nav-select"
          value={location.pathname.startsWith('/disputes') ? '/disputes' : location.pathname.startsWith('/print') ? '/print' : location.pathname.startsWith('/clients') ? '/clients' : location.pathname.startsWith('/leads') ? '/leads' : location.pathname.startsWith('/tasks') ? '/tasks' : '/'}
          onChange={(e) => {
            const value = e.target.value;
            if (value === '__signup') { window.location.href = '/signup'; return; }
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
          <option value="__signup">Sign up</option>
        </select>

        {error ? <div className="error-banner">{error}</div> : null}
        <Routes>
          <Route path="/" element={<Overview clients={clients} disputes={disputes} plans={plans} leadsCount={leads.length} />} />
          <Route path="/leads" element={<Leads leads={leads} clients={clients} />} />
          <Route path="/clients" element={<Clients clients={clients} />} />
          <Route path="/clients/:id" element={<ClientDetailRoute token={token} />} />
          <Route path="/disputes" element={<DisputesRoute token={token} disputes={disputes} clients={clients} />} />
          <Route path="/print" element={<PrintCenterRoute token={token} clients={clients} disputes={disputes} />} />
          <Route path="/tasks" element={<TasksRoute />} />
        </Routes>
      </main>
    </div>
  );
}
