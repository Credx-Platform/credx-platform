import { useCallback, useEffect, useState, type FormEvent } from 'react';

const API_BASE = (import.meta.env.VITE_API_URL ?? '').trim() ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:3000'
    : '');

async function api<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(init?.headers || {}) }
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

type Vendor = { id: string; vendorName: string; accountType: string | null; status: string; reportsTo: string[]; creditLimit: number | null };
type Tradeline = { id: string; creditorName: string; accountType: string | null; balance: number | null; creditLimit: number | null; status: string | null; reportedTo: string[] };
type FoundationItem = { key: string; label: string; done: boolean; detail?: string };
type Payload = {
  profile: Record<string, any>;
  vendorAccounts: Vendor[];
  tradelines: Tradeline[];
  assessment: { disclosure: string; foundation: FoundationItem[]; completed: number; total: number; score: number; stage: string; nextSteps: string[] };
};

const ENTITY_TYPES = [['LLC', 'LLC'], ['S_CORP', 'S-Corp'], ['C_CORP', 'C-Corp'], ['SOLE_PROP', 'Sole proprietor'], ['PARTNERSHIP', 'Partnership'], ['NONPROFIT', 'Nonprofit'], ['OTHER', 'Other']];
const EIN_STATUS = [['none', 'Not started'], ['applied', 'Applied'], ['issued', 'Issued']];
const VENDOR_STATUS = ['PROSPECT', 'APPLIED', 'OPEN', 'DECLINED', 'CLOSED'];
const BUREAUS = [['dnb', 'D&B'], ['experian_business', 'Experian Business'], ['equifax_business', 'Equifax Business']];

export default function BusinessCredit({ token }: { token: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => setData(await api<Payload>('/api/business-credit', token)), [token]);
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);

  const run = async (fn: () => Promise<Payload>) => {
    setBusy(true); setError(null);
    try { setData(await fn()); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  if (!data) return <p>{error || 'Loading…'}</p>;
  const { profile, assessment } = data;

  return (
    <div>
      <p className="disclosure-box">{assessment.disclosure}</p>
      {error && <p className="form-error" role="alert">{error}</p>}

      <section className="panel">
        <div className="panel-header">
          <h2>Foundation</h2>
          <span className="status-pill status-pill--medium">{assessment.stage.replace(/_/g, ' ')} · {assessment.completed}/{assessment.total}</span>
        </div>
        <ul className="check-list">
          {assessment.foundation.map((i) => (
            <li key={i.key}>
              <label>
                <input
                  type="checkbox"
                  checked={i.done}
                  disabled={busy}
                  onChange={(e) => run(() => api<Payload>('/api/business-credit/checklist', token, {
                    method: 'PATCH', body: JSON.stringify({ key: i.key, done: e.target.checked })
                  }))}
                />
                <span>{i.label}{i.detail ? <em> — {i.detail}</em> : null}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Business entity</h2>
        <EntityForm busy={busy} profile={profile} onSave={(v) => run(() => api<Payload>('/api/business-credit', token, { method: 'PUT', body: JSON.stringify(v) }))} />
      </section>

      <section className="panel">
        <h2>Vendor accounts</h2>
        <table className="data-table">
          <thead><tr><th>Vendor</th><th>Type</th><th>Status</th><th>Reports to</th><th></th></tr></thead>
          <tbody>
            {data.vendorAccounts.map((v) => (
              <tr key={v.id}>
                <td>{v.vendorName}</td>
                <td>{v.accountType || '—'}</td>
                <td>
                  <select value={v.status} disabled={busy} onChange={(e) => run(() => api<Payload>(`/api/business-credit/vendors/${v.id}`, token, { method: 'PATCH', body: JSON.stringify({ status: e.target.value }) }))}>
                    {VENDOR_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td>{v.reportsTo.map((b) => BUREAUS.find(([k]) => k === b)?.[1] || b).join(', ') || '—'}</td>
                <td><button className="ghost-button" disabled={busy} onClick={() => run(() => api<Payload>(`/api/business-credit/vendors/${v.id}`, token, { method: 'DELETE' }))}>Remove</button></td>
              </tr>
            ))}
            {data.vendorAccounts.length === 0 && <tr><td colSpan={5}>No vendor accounts yet.</td></tr>}
          </tbody>
        </table>
        <AddVendorForm busy={busy} onAdd={(v) => run(() => api<Payload>('/api/business-credit/vendors', token, { method: 'POST', body: JSON.stringify(v) }))} />
      </section>

      <section className="panel">
        <h2>Business tradelines</h2>
        <table className="data-table">
          <thead><tr><th>Creditor</th><th>Limit</th><th>Balance</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {data.tradelines.map((t) => (
              <tr key={t.id}>
                <td>{t.creditorName}</td>
                <td>{t.creditLimit != null ? `$${t.creditLimit}` : '—'}</td>
                <td>{t.balance != null ? `$${t.balance}` : '—'}</td>
                <td>{t.status || '—'}</td>
                <td><button className="ghost-button" disabled={busy} onClick={() => run(() => api<Payload>(`/api/business-credit/tradelines/${t.id}`, token, { method: 'DELETE' }))}>Remove</button></td>
              </tr>
            ))}
            {data.tradelines.length === 0 && <tr><td colSpan={5}>No tradelines yet.</td></tr>}
          </tbody>
        </table>
        <AddTradelineForm busy={busy} onAdd={(v) => run(() => api<Payload>('/api/business-credit/tradelines', token, { method: 'POST', body: JSON.stringify(v) }))} />
      </section>

      <section className="panel">
        <h2>Next steps</h2>
        <ol>{assessment.nextSteps.map((s, i) => <li key={i}>{s}</li>)}</ol>
      </section>
    </div>
  );
}

function EntityForm({ busy, profile, onSave }: { busy: boolean; profile: Record<string, any>; onSave: (v: any) => void }) {
  const [v, setV] = useState({
    legalName: profile.legalName ?? '', entityType: profile.entityType ?? '', formationState: profile.formationState ?? '',
    einStatus: profile.einStatus ?? 'none', einLast4: profile.einLast4 ?? '', dunsNumber: profile.dunsNumber ?? '',
    businessPhone: profile.businessPhone ?? '', businessEmail: profile.businessEmail ?? '',
    businessAddress: profile.businessAddress ?? '', businessDomain: profile.businessDomain ?? '',
    hasBankAccount: Boolean(profile.hasBankAccount)
  });
  useEffect(() => {
    setV({
      legalName: profile.legalName ?? '', entityType: profile.entityType ?? '', formationState: profile.formationState ?? '',
      einStatus: profile.einStatus ?? 'none', einLast4: profile.einLast4 ?? '', dunsNumber: profile.dunsNumber ?? '',
      businessPhone: profile.businessPhone ?? '', businessEmail: profile.businessEmail ?? '',
      businessAddress: profile.businessAddress ?? '', businessDomain: profile.businessDomain ?? '',
      hasBankAccount: Boolean(profile.hasBankAccount)
    });
  }, [profile]);

  return (
    <form className="field-grid" onSubmit={(e: FormEvent) => {
      e.preventDefault();
      onSave({
        legalName: v.legalName || null, entityType: v.entityType || null, formationState: v.formationState || null,
        einStatus: v.einStatus, einLast4: v.einLast4 || null, dunsNumber: v.dunsNumber || null,
        businessPhone: v.businessPhone || null, businessEmail: v.businessEmail || null,
        businessAddress: v.businessAddress || null, businessDomain: v.businessDomain || null,
        hasBankAccount: v.hasBankAccount
      });
    }}>
      <label>Legal name<input value={v.legalName} onChange={(e) => setV({ ...v, legalName: e.target.value })} /></label>
      <label>Entity type
        <select value={v.entityType} onChange={(e) => setV({ ...v, entityType: e.target.value })}>
          <option value="">Select…</option>{ENTITY_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <label>Formation state<input value={v.formationState} onChange={(e) => setV({ ...v, formationState: e.target.value })} maxLength={40} /></label>
      <label>EIN status
        <select value={v.einStatus} onChange={(e) => setV({ ...v, einStatus: e.target.value })}>
          {EIN_STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <label>EIN last 4<input value={v.einLast4} onChange={(e) => setV({ ...v, einLast4: e.target.value.replace(/\D/g, '').slice(0, 4) })} inputMode="numeric" /></label>
      <label>D-U-N-S number<input value={v.dunsNumber} onChange={(e) => setV({ ...v, dunsNumber: e.target.value })} maxLength={20} /></label>
      <label>Business phone<input value={v.businessPhone} onChange={(e) => setV({ ...v, businessPhone: e.target.value })} /></label>
      <label>Business email<input type="email" value={v.businessEmail} onChange={(e) => setV({ ...v, businessEmail: e.target.value })} /></label>
      <label>Business address<input value={v.businessAddress} onChange={(e) => setV({ ...v, businessAddress: e.target.value })} /></label>
      <label>Business domain<input value={v.businessDomain} onChange={(e) => setV({ ...v, businessDomain: e.target.value })} placeholder="acme.com" /></label>
      <label className="checkbox-row"><input type="checkbox" checked={v.hasBankAccount} onChange={(e) => setV({ ...v, hasBankAccount: e.target.checked })} /><span>Business bank account opened</span></label>
      <button className="primary-button" disabled={busy}>Save entity details</button>
    </form>
  );
}

function AddVendorForm({ busy, onAdd }: { busy: boolean; onAdd: (v: any) => void }) {
  const [v, setV] = useState({ vendorName: '', accountType: '', reportsTo: [] as string[] });
  return (
    <form className="field-grid" onSubmit={(e: FormEvent) => { e.preventDefault(); if (v.vendorName) { onAdd({ vendorName: v.vendorName, accountType: v.accountType || null, reportsTo: v.reportsTo }); setV({ vendorName: '', accountType: '', reportsTo: [] }); } }}>
      <label>Vendor name<input value={v.vendorName} onChange={(e) => setV({ ...v, vendorName: e.target.value })} required /></label>
      <label>Account type
        <select value={v.accountType} onChange={(e) => setV({ ...v, accountType: e.target.value })}>
          <option value="">Select…</option>
          {['net_30', 'net_60', 'revolving', 'fleet', 'store_card', 'other'].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <fieldset><legend>Reports to</legend>
        {BUREAUS.map(([k, l]) => (
          <label key={k} className="checkbox-row">
            <input type="checkbox" checked={v.reportsTo.includes(k)} onChange={(e) => setV({ ...v, reportsTo: e.target.checked ? [...v.reportsTo, k] : v.reportsTo.filter((x) => x !== k) })} />
            <span>{l}</span>
          </label>
        ))}
      </fieldset>
      <button className="ghost-button" disabled={busy || !v.vendorName}>Add vendor account</button>
    </form>
  );
}

function AddTradelineForm({ busy, onAdd }: { busy: boolean; onAdd: (v: any) => void }) {
  const [v, setV] = useState({ creditorName: '', creditLimit: '', balance: '', status: '' });
  return (
    <form className="field-grid" onSubmit={(e: FormEvent) => {
      e.preventDefault();
      if (!v.creditorName) return;
      onAdd({
        creditorName: v.creditorName,
        creditLimit: v.creditLimit === '' ? null : Number(v.creditLimit),
        balance: v.balance === '' ? null : Number(v.balance),
        status: v.status || null
      });
      setV({ creditorName: '', creditLimit: '', balance: '', status: '' });
    }}>
      <label>Creditor<input value={v.creditorName} onChange={(e) => setV({ ...v, creditorName: e.target.value })} required /></label>
      <label>Credit limit<input type="number" min={0} value={v.creditLimit} onChange={(e) => setV({ ...v, creditLimit: e.target.value })} /></label>
      <label>Balance<input type="number" min={0} value={v.balance} onChange={(e) => setV({ ...v, balance: e.target.value })} /></label>
      <label>Status
        <select value={v.status} onChange={(e) => setV({ ...v, status: e.target.value })}>
          <option value="">Select…</option>{['current', 'past_due', 'closed'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <button className="ghost-button" disabled={busy || !v.creditorName}>Add tradeline</button>
    </form>
  );
}
