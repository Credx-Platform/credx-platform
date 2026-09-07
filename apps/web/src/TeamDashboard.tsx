import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

/**
 * Minimal professional / team workspace.
 *
 * Reuses the client-portal auth token (`credx-client-token`) — a professional
 * logs in at /portal, then opens /team. Scope: create an organization, invite
 * members + set roles, create clients, assign clients to members, see the
 * client list. Tenant isolation is enforced server-side by the org routes.
 */

const API_BASE = (import.meta.env.VITE_API_URL ?? '').trim() ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:3000'
    : '');
const TOKEN_KEY = 'credx-client-token';

type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'BILLING' | 'VIEWER';

type Membership = {
  role: Role;
  organization: { id: string; name: string; slug: string; _count?: { members: number; clients: number } };
};

type Member = { userId: string; role: Role; user: { id: string; email: string; firstName: string; lastName: string } };

type OrgClient = {
  id: string;
  status: string;
  serviceTier: string;
  customerType: string;
  createdAt: string;
  user: { firstName: string; lastName: string; email: string };
  assignments: Array<{ userId: string }>;
};

async function api<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...(init?.headers || {})
    }
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

const ROLE_OPTIONS: Role[] = ['ADMIN', 'MEMBER', 'BILLING', 'VIEWER'];

export default function TeamDashboard() {
  const token = useMemo(() => localStorage.getItem(TOKEN_KEY), []);
  const [memberships, setMemberships] = useState<Membership[] | null>(null);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [clients, setClients] = useState<OrgClient[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const activeMembership = memberships?.find((m) => m.organization.slug === activeSlug) || null;
  const canManage = activeMembership && ['OWNER', 'ADMIN'].includes(activeMembership.role);

  const loadOrgs = useCallback(async () => {
    if (!token) return;
    const data = await api<{ memberships: Membership[] }>('/api/org', token);
    setMemberships(data.memberships);
    setActiveSlug((cur) => cur || data.memberships[0]?.organization.slug || null);
  }, [token]);

  const loadOrgDetail = useCallback(async (slug: string) => {
    if (!token) return;
    const [m, c] = await Promise.all([
      api<{ members: Member[] }>(`/api/org/${slug}/members`, token),
      api<{ clients: OrgClient[] }>(`/api/org/${slug}/clients`, token)
    ]);
    setMembers(m.members);
    setClients(c.clients);
  }, [token]);

  useEffect(() => { loadOrgs().catch((e) => setError(e.message)); }, [loadOrgs]);
  useEffect(() => {
    if (activeSlug) loadOrgDetail(activeSlug).catch((e) => setError(e.message));
  }, [activeSlug, loadOrgDetail]);

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true); setError(null); setNotice(null);
    try { await fn(); setNotice(ok); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  if (!token) {
    return (
      <div className="panel" style={{ maxWidth: 480, margin: '80px auto' }}>
        <h2>CredX Team Workspace</h2>
        <p>Please sign in to your CredX account first, then return here.</p>
        <a className="primary-button" href="/portal">Go to sign in</a>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
      <div className="panel-header">
        <div>
          <p className="eyebrow">CredX</p>
          <h1>Team Workspace</h1>
        </div>
        {memberships && memberships.length > 0 && (
          <select value={activeSlug ?? ''} onChange={(e) => setActiveSlug(e.target.value)}>
            {memberships.map((m) => (
              <option key={m.organization.slug} value={m.organization.slug}>
                {m.organization.name} ({m.role})
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success">{notice}</p>}

      {memberships && memberships.length === 0 && (
        <CreateOrg busy={busy} onCreate={(name) => run(async () => {
          await api('/api/org', token, { method: 'POST', body: JSON.stringify({ name }) });
          await loadOrgs();
        }, 'Organization created.')} />
      )}

      {activeMembership && (
        <>
          <section className="panel">
            <h2>Members</h2>
            <table className="data-table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th>{canManage && <th></th>}</tr></thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.userId}>
                    <td>{m.user.firstName} {m.user.lastName}</td>
                    <td>{m.user.email}</td>
                    <td>
                      {canManage && m.role !== 'OWNER' ? (
                        <select
                          value={m.role}
                          disabled={busy}
                          onChange={(e) => run(async () => {
                            await api(`/api/org/${activeSlug}/members/${m.userId}`, token, {
                              method: 'PATCH', body: JSON.stringify({ role: e.target.value })
                            });
                            await loadOrgDetail(activeSlug!);
                          }, 'Role updated.')}
                        >
                          {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      ) : m.role}
                    </td>
                    {canManage && (
                      <td>
                        {m.role !== 'OWNER' && (
                          <button className="ghost-button" disabled={busy} onClick={() => run(async () => {
                            await api(`/api/org/${activeSlug}/members/${m.userId}`, token, { method: 'DELETE' });
                            await loadOrgDetail(activeSlug!);
                          }, 'Member removed.')}>Remove</button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {canManage && (
              <InviteForm busy={busy} onInvite={(email, role) => run(async () => {
                const r = await api<{ inviteUrl: string }>(`/api/org/${activeSlug}/invite`, token, {
                  method: 'POST', body: JSON.stringify({ email, role })
                });
                setNotice(`Invite created. Share this link: ${window.location.origin}${r.inviteUrl}`);
                await loadOrgDetail(activeSlug!);
              }, 'Invitation created.')} />
            )}
          </section>

          <section className="panel">
            <h2>Clients</h2>
            <table className="data-table">
              <thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Assigned to</th></tr></thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td>{c.user.firstName} {c.user.lastName}</td>
                    <td>{c.user.email}</td>
                    <td>{c.status}</td>
                    <td>
                      {canManage ? (
                        <select
                          value=""
                          disabled={busy}
                          onChange={(e) => {
                            const userId = e.target.value;
                            if (!userId) return;
                            run(async () => {
                              await api(`/api/org/${activeSlug}/clients/${c.id}/assignments`, token, {
                                method: 'POST', body: JSON.stringify({ userId })
                              });
                              await loadOrgDetail(activeSlug!);
                            }, 'Client assigned.');
                          }}
                        >
                          <option value="">
                            {c.assignments.length
                              ? members.filter((m) => c.assignments.some((a) => a.userId === m.userId)).map((m) => `${m.user.firstName}`).join(', ')
                              : 'Assign…'}
                          </option>
                          {members.map((m) => (
                            <option key={m.userId} value={m.userId}>{m.user.firstName} {m.user.lastName}</option>
                          ))}
                        </select>
                      ) : (
                        c.assignments.length ? 'You' : '—'
                      )}
                    </td>
                  </tr>
                ))}
                {clients.length === 0 && <tr><td colSpan={4}>No clients yet.</td></tr>}
              </tbody>
            </table>
            {canManage && (
              <NewClientForm busy={busy} onCreate={(v) => run(async () => {
                await api(`/api/org/${activeSlug}/clients`, token, { method: 'POST', body: JSON.stringify(v) });
                await loadOrgDetail(activeSlug!);
              }, 'Client created.')} />
            )}
          </section>
        </>
      )}

      {memberships && memberships.length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary>Create another organization</summary>
          <CreateOrg busy={busy} onCreate={(name) => run(async () => {
            await api('/api/org', token, { method: 'POST', body: JSON.stringify({ name }) });
            await loadOrgs();
          }, 'Organization created.')} />
        </details>
      )}
    </div>
  );
}

function CreateOrg({ busy, onCreate }: { busy: boolean; onCreate: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <form className="field-grid" onSubmit={(e: FormEvent) => { e.preventDefault(); if (name.trim()) onCreate(name.trim()); }}>
      <label>Organization name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Credit Pros" required minLength={2} />
      </label>
      <button className="primary-button" disabled={busy || name.trim().length < 2}>Create organization</button>
    </form>
  );
}

function InviteForm({ busy, onInvite }: { busy: boolean; onInvite: (email: string, role: Role) => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('MEMBER');
  return (
    <form className="field-grid" onSubmit={(e: FormEvent) => { e.preventDefault(); if (email) onInvite(email, role); }}>
      <label>Invite by email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@example.com" required />
      </label>
      <label>Role
        <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>
      <button className="ghost-button" disabled={busy}>Send invite</button>
    </form>
  );
}

function NewClientForm({ busy, onCreate }: { busy: boolean; onCreate: (v: { firstName: string; lastName: string; email: string }) => void }) {
  const [v, setV] = useState({ firstName: '', lastName: '', email: '' });
  const ok = v.firstName && v.lastName && v.email;
  return (
    <form className="field-grid" onSubmit={(e: FormEvent) => { e.preventDefault(); if (ok) onCreate(v); }}>
      <label>First name<input value={v.firstName} onChange={(e) => setV({ ...v, firstName: e.target.value })} required /></label>
      <label>Last name<input value={v.lastName} onChange={(e) => setV({ ...v, lastName: e.target.value })} required /></label>
      <label>Email<input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} required /></label>
      <button className="ghost-button" disabled={busy || !ok}>Add client</button>
    </form>
  );
}
