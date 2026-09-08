import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import BusinessCredit from './BusinessCreditWorkspace';

/**
 * CredX Financial Readiness workspace — Funding Readiness + Business Credit.
 * Reuses the client-portal token. CredX does not guarantee approval or funding.
 */

const API_BASE = (import.meta.env.VITE_API_URL ?? '').trim() ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:3000'
    : '');
const TOKEN_KEY = 'credx-client-token';

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

type Indicator = { key: string; label: string; status: 'strong' | 'fair' | 'attention' | 'unknown'; detail: string };
type ChecklistItem = { key: string; label: string; done: boolean; note?: string };
type FundingAssessment = {
  disclosure: string;
  objective: string | null;
  targetAmount: number | null;
  targetTimeframe: string | null;
  indicators: Indicator[];
  checklist: ChecklistItem[];
  documentChecklist: Array<{ key: string; label: string; provided: boolean }>;
  readiness: { band: string; summary: string; score: number };
  nextSteps: string[];
};
type FundingProfile = {
  objective: string | null;
  targetAmount: number | null;
  targetTimeframe: string | null;
  monthlyIncome: number | null;
  incomeType: string | null;
  notes: string | null;
};

const OBJECTIVES = [
  ['personal_loan', 'Personal loan'], ['auto', 'Auto loan'], ['mortgage_prep', 'Mortgage preparation'],
  ['business_loc', 'Business line of credit'], ['debt_consolidation', 'Debt consolidation'], ['other', 'Other']
];
const TIMEFRAMES = [['3_months', '~3 months'], ['6_months', '~6 months'], ['12_months', '~12 months'], ['exploring', 'Just exploring']];
const INCOME_TYPES = [['w2', 'W-2 employee'], ['self_employed', 'Self-employed'], ['mixed', 'Mixed'], ['other', 'Other']];

const STATUS_LABEL: Record<Indicator['status'], string> = { strong: 'Strong', fair: 'Fair', attention: 'Needs attention', unknown: 'Unknown' };

export default function FinancialReadinessWorkspace() {
  const token = useMemo(() => localStorage.getItem(TOKEN_KEY), []);
  const [tab, setTab] = useState<'funding' | 'business'>('funding');

  if (!token) {
    return (
      <div className="panel" style={{ maxWidth: 480, margin: '80px auto' }}>
        <h2>CredX Financial Readiness</h2>
        <p>Please sign in to your CredX account first, then return here.</p>
        <a className="primary-button" href="/portal">Go to sign in</a>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <p className="eyebrow">CredX</p>
      <h1>Financial Readiness</h1>
      <div className="tab-bar" style={{ margin: '12px 0 20px' }}>
        <button className={`tab ${tab === 'funding' ? 'active' : ''}`} onClick={() => setTab('funding')}>Funding Readiness</button>
        <button className={`tab ${tab === 'business' ? 'active' : ''}`} onClick={() => setTab('business')}>Business Credit</button>
      </div>
      {tab === 'funding' ? <FundingReadiness token={token} /> : <BusinessCredit token={token} />}
    </div>
  );
}

function FundingReadiness({ token }: { token: string }) {
  const [profile, setProfile] = useState<FundingProfile | null>(null);
  const [assessment, setAssessment] = useState<FundingAssessment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const data = await api<{ profile: FundingProfile | null; assessment: FundingAssessment }>('/api/funding-readiness', token);
    setProfile(data.profile);
    setAssessment(data.assessment);
  }, [token]);

  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  if (!assessment) return <p>{error || 'Loading…'}</p>;

  return (
    <div>
      <p className="disclosure-box">{assessment.disclosure}</p>
      {error && <p className="form-error" role="alert">{error}</p>}

      <section className="panel">
        <h2>Your objective</h2>
        <ObjectiveForm
          busy={busy}
          profile={profile}
          onSave={(v) => run(async () => {
            const data = await api<{ profile: FundingProfile; assessment: FundingAssessment }>('/api/funding-readiness', token, {
              method: 'PUT', body: JSON.stringify(v)
            });
            setProfile(data.profile); setAssessment(data.assessment);
          })}
        />
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Readiness signals</h2>
          <span className={`status-pill status-pill--${assessment.readiness.band === 'well_positioned' ? 'strong' : assessment.readiness.band === 'early' ? 'limited' : 'medium'}`}>
            {assessment.readiness.band.replace(/_/g, ' ')} · {assessment.readiness.score}/100
          </span>
        </div>
        <p>{assessment.readiness.summary}</p>
        <ul className="indicator-list">
          {assessment.indicators.map((i) => (
            <li key={i.key} className={`indicator indicator--${i.status}`}>
              <div><strong>{i.label}</strong> <span className="indicator-status">{STATUS_LABEL[i.status]}</span></div>
              <span>{i.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Preparation checklist</h2>
        <ul className="check-list">
          {assessment.checklist.map((c) => (
            <li key={c.key}>
              <label>
                <input
                  type="checkbox"
                  checked={c.done}
                  disabled={busy}
                  onChange={(e) => run(async () => {
                    const data = await api<{ assessment: FundingAssessment }>('/api/funding-readiness/checklist', token, {
                      method: 'PATCH', body: JSON.stringify({ key: c.key, done: e.target.checked })
                    });
                    setAssessment(data.assessment);
                  })}
                />
                <span>{c.label}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Document checklist</h2>
        <ul className="check-list">
          {assessment.documentChecklist.map((d) => (
            <li key={d.key}>
              <label>
                <input
                  type="checkbox"
                  checked={d.provided}
                  disabled={busy}
                  onChange={(e) => run(async () => {
                    const data = await api<{ assessment: FundingAssessment }>('/api/funding-readiness/documents', token, {
                      method: 'PATCH', body: JSON.stringify({ key: d.key, provided: e.target.checked })
                    });
                    setAssessment(data.assessment);
                  })}
                />
                <span>{d.label}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Next steps</h2>
        <ol>{assessment.nextSteps.map((s, idx) => <li key={idx}>{s}</li>)}</ol>
      </section>
    </div>
  );
}

function ObjectiveForm({ busy, profile, onSave }: { busy: boolean; profile: FundingProfile | null; onSave: (v: any) => void }) {
  const [v, setV] = useState({
    objective: profile?.objective ?? '',
    targetAmount: profile?.targetAmount ?? '',
    targetTimeframe: profile?.targetTimeframe ?? '',
    monthlyIncome: profile?.monthlyIncome ?? '',
    incomeType: profile?.incomeType ?? ''
  });
  useEffect(() => {
    setV({
      objective: profile?.objective ?? '',
      targetAmount: profile?.targetAmount ?? '',
      targetTimeframe: profile?.targetTimeframe ?? '',
      monthlyIncome: profile?.monthlyIncome ?? '',
      incomeType: profile?.incomeType ?? ''
    });
  }, [profile]);

  return (
    <form className="field-grid" onSubmit={(e: FormEvent) => {
      e.preventDefault();
      onSave({
        objective: v.objective || null,
        targetAmount: v.targetAmount === '' ? null : Number(v.targetAmount),
        targetTimeframe: v.targetTimeframe || null,
        monthlyIncome: v.monthlyIncome === '' ? null : Number(v.monthlyIncome),
        incomeType: v.incomeType || null
      });
    }}>
      <label>Objective
        <select value={v.objective} onChange={(e) => setV({ ...v, objective: e.target.value })}>
          <option value="">Select…</option>
          {OBJECTIVES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <label>Target amount (USD)
        <input type="number" min={0} value={v.targetAmount} onChange={(e) => setV({ ...v, targetAmount: e.target.value })} />
      </label>
      <label>Timeframe
        <select value={v.targetTimeframe} onChange={(e) => setV({ ...v, targetTimeframe: e.target.value })}>
          <option value="">Select…</option>
          {TIMEFRAMES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <label>Monthly income (USD)
        <input type="number" min={0} value={v.monthlyIncome} onChange={(e) => setV({ ...v, monthlyIncome: e.target.value })} />
      </label>
      <label>Income type
        <select value={v.incomeType} onChange={(e) => setV({ ...v, incomeType: e.target.value })}>
          <option value="">Select…</option>
          {INCOME_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <button className="primary-button" disabled={busy}>Save objective</button>
    </form>
  );
}
