import { useState, useEffect, useMemo } from 'react';
import type { DisputeItem, ImportedTradeline } from './DisputeManager';

interface DisputeTabProps {
  token: string;
  selectedClientId: string;
  selectedClientLabel?: string;
  items: DisputeItem[];
  tradelines: ImportedTradeline[];
  prefillKey?: string | null;
  onConsumePrefill?: () => void;
  onItemCreated: () => void;
}

const API_BASE = (import.meta.env.VITE_API_URL ?? '').trim() || '';

const accountTypes = [
  { value: 'LATE_PAYMENT', label: 'Late Payment' },
  { value: 'COLLECTION', label: 'Collection' },
  { value: 'CHARGE_OFF', label: 'Charge-off' },
  { value: 'INQUIRY', label: 'Inquiry' },
  { value: 'OTHER', label: 'Other' }
];

const disputeReasons = [
  'Not mine',
  'Incorrect balance',
  'Incorrect dates',
  'Account closed',
  'Duplicate account',
  'Identity theft',
  'Statute of limitations',
  'Other'
];

type TradelineGroup = {
  key: string;
  sample: ImportedTradeline;
  bureaus: Set<'EXPERIAN' | 'EQUIFAX' | 'TRANSUNION'>;
};

function groupTradelines(tradelines: ImportedTradeline[]): TradelineGroup[] {
  const map = new Map<string, TradelineGroup>();
  for (const t of tradelines) {
    const key = `${(t.creditorName || '').trim().toLowerCase()}|${(t.accountNumber || '').trim()}`;
    const entry = map.get(key);
    if (entry) entry.bureaus.add(t.bureau);
    else map.set(key, { key, sample: t, bureaus: new Set([t.bureau]) });
  }
  return Array.from(map.values());
}

function inferAccountType(t: ImportedTradeline): 'LATE_PAYMENT' | 'COLLECTION' | 'CHARGE_OFF' | 'INQUIRY' | 'OTHER' {
  const v = `${t.accountType || ''} ${t.status || ''}`.toLowerCase();
  if (v.includes('collection')) return 'COLLECTION';
  if (v.includes('charge')) return 'CHARGE_OFF';
  if (v.includes('inquir')) return 'INQUIRY';
  if (v.includes('late') || v.includes('past due')) return 'LATE_PAYMENT';
  return 'OTHER';
}

const EMPTY_FORM = {
  furnisher: '',
  accountNumber: '',
  accountType: 'OTHER' as 'LATE_PAYMENT' | 'COLLECTION' | 'CHARGE_OFF' | 'INQUIRY' | 'OTHER',
  balance: '' as string,
  dateAdded: '',
  disputeEquifax: false,
  disputeExperian: false,
  disputeTransunion: false,
  reason: '',
  customInstruction: ''
};

export function DisputeTab({ token, selectedClientId, selectedClientLabel, items, tradelines, prefillKey, onConsumePrefill, onItemCreated }: DisputeTabProps) {
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Tradelines already turned into dispute items → "used" set
  const usedTradelineKeys = useMemo(() => {
    const used = new Set<string>();
    for (const item of items) {
      const k = `${(item.furnisher || '').trim().toLowerCase()}|${(item.accountNumber || '').trim()}`;
      used.add(k);
    }
    return used;
  }, [items]);

  const grouped = useMemo(() => groupTradelines(tradelines), [tradelines]);
  const unusedTradelines = useMemo(() => grouped.filter((g) => !usedTradelineKeys.has(g.key)), [grouped, usedTradelineKeys]);

  const applyTradeline = (g: TradelineGroup) => {
    setSelectedKey(g.key);
    setFormData({
      furnisher: g.sample.creditorName || '',
      accountNumber: g.sample.accountNumber || '',
      accountType: inferAccountType(g.sample),
      balance: g.sample.balance != null ? String(g.sample.balance) : '',
      dateAdded: '',
      disputeEquifax: g.bureaus.has('EQUIFAX'),
      disputeExperian: g.bureaus.has('EXPERIAN'),
      disputeTransunion: g.bureaus.has('TRANSUNION'),
      reason: g.sample.isNegative ? 'Not mine' : '',
      customInstruction: ''
    });
    setError(null);
    setSavedNotice(null);
  };

  // Consume an external prefill request (e.g. user clicked a tradeline row in Add Items tab)
  useEffect(() => {
    if (!prefillKey) return;
    const match = grouped.find((g) => g.key === prefillKey);
    if (match) {
      applyTradeline(match);
      onConsumePrefill?.();
    }
  }, [prefillKey, grouped]);

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setSelectedKey('');
    setError(null);
  };

  const handleFurnisherChange = (key: string) => {
    if (!key) { resetForm(); return; }
    const g = unusedTradelines.find((u) => u.key === key) || grouped.find((u) => u.key === key);
    if (g) applyTradeline(g);
  };

  const handleSave = async () => {
    if (!selectedClientId) { setError('Pick a client at the top of the dispute workspace first.'); return; }
    if (!formData.furnisher) { setError('Select a furnisher from the dropdown.'); return; }
    if (!formData.reason) { setError('Pick a dispute reason.'); return; }
    setSaving(true);
    setError(null);
    setSavedNotice(null);
    try {
      const response = await fetch(`${API_BASE}/api/disputes/items`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          clientId: selectedClientId,
          balance: formData.balance ? parseFloat(formData.balance) : null
        })
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Save failed');
      }
      setSavedNotice('Added to Ready to Print on the Add Items tab.');
      resetForm();
      onItemCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndInitiate = async () => {
    if (!selectedClientId) { setError('Pick a client at the top of the dispute workspace first.'); return; }
    if (!formData.furnisher) { setError('Select a furnisher from the dropdown.'); return; }
    if (!formData.reason) { setError('Pick a dispute reason.'); return; }
    setSaving(true);
    setError(null);
    setSavedNotice(null);
    try {
      const saveRes = await fetch(`${API_BASE}/api/disputes/items`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          clientId: selectedClientId,
          balance: formData.balance ? parseFloat(formData.balance) : null
        })
      });
      if (!saveRes.ok) {
        const err = await saveRes.json().catch(() => ({}));
        throw new Error(err.error || 'Save failed');
      }
      const saved = await saveRes.json();
      const itemId = saved?.id;
      if (itemId) {
        await fetch(`${API_BASE}/api/disputes/initiate`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemId,
            clientId: selectedClientId,
            bureaus: {
              equifax: formData.disputeEquifax,
              experian: formData.disputeExperian,
              transunion: formData.disputeTransunion
            }
          })
        });
      }
      setSavedNotice('Saved and dispute initiated. Check Ready to Print on the Add Items tab.');
      resetForm();
      onItemCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save and dispute failed');
    } finally {
      setSaving(false);
    }
  };

  const handleCheckAllBureaus = (checked: boolean) => {
    setFormData((p) => ({ ...p, disputeEquifax: checked, disputeExperian: checked, disputeTransunion: checked }));
  };

  return (
    <div className="dispute-tab">
      <style>{`
        .dispute-tab { padding: 1.5rem; }
        .dispute-tab__header { display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem; flex-wrap:wrap; gap:1rem; }
        .dispute-tab__header h3 { font-size: 1.25rem; color: #1e293b; margin: 0; }
        .dispute-tab__client { padding:0.6rem 0.95rem; border:1px solid #d1d5db; border-radius:6px; min-width:250px; background:#fff; color:#0f172a; font-size: 0.875rem; }
        .dispute-tab__form { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:1.5rem; }
        .dispute-tab__row { display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:1rem; margin-bottom:1rem; }
        .dispute-tab__field { display:flex; flex-direction:column; gap:0.35rem; }
        .dispute-tab__field label { font-size:0.8rem; font-weight:600; color:#374151; text-transform:uppercase; letter-spacing:0.04em; }
        .dispute-tab__field input,
        .dispute-tab__field select,
        .dispute-tab__field textarea { padding:0.6rem 0.75rem; border:1px solid #d1d5db; border-radius:6px; font-size:0.9rem; background:#fff; color:#0f172a; font-family:inherit; }
        .dispute-tab__field input:focus,
        .dispute-tab__field select:focus,
        .dispute-tab__field textarea:focus { outline:none; border-color:#00c6fb; box-shadow:0 0 0 3px rgba(0,198,251,0.15); }
        .dispute-tab__field input:disabled,
        .dispute-tab__field select:disabled { background:#f1f5f9; color:#64748b; cursor:not-allowed; }
        .dispute-tab__notice { padding:0.75rem 1rem; border-radius:8px; font-size:0.875rem; margin-bottom:1rem; }
        .dispute-tab__notice--info { background: rgba(0,198,251,0.08); color: #0a4f7a; border:1px solid rgba(0,198,251,0.32); }
        .dispute-tab__notice--success { background: rgba(34,197,94,0.10); color:#166534; border:1px solid rgba(34,197,94,0.32); }
        .dispute-tab__notice--error { background: rgba(220,38,38,0.10); color:#8a1313; border:1px solid rgba(220,38,38,0.32); }
        .dispute-tab__bureaus { display:flex; gap:1.25rem; flex-wrap:wrap; padding:1rem; background:#fff; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:1rem; }
        .dispute-tab__bureau { display:flex; align-items:center; gap:0.5rem; font-size:0.875rem; color:#374151; font-weight:500; }
        .dispute-tab__bureau input { width:16px; height:16px; accent-color:#00c6fb; }
        .dispute-tab__actions { display:flex; gap:0.75rem; flex-wrap:wrap; margin-top:1rem; padding-top:1rem; border-top:1px solid #e2e8f0; }
        .dispute-tab__btn { padding:0.65rem 1.25rem; border-radius:6px; font-weight:600; font-size:0.875rem; cursor:pointer; border:none; transition: transform .15s ease, opacity .15s ease; }
        .dispute-tab__btn:hover:not(:disabled) { transform: translateY(-1px); }
        .dispute-tab__btn:disabled { opacity:0.55; cursor:not-allowed; }
        .dispute-tab__btn--primary { background:#00c6fb; color:#0f1929; }
        .dispute-tab__btn--success { background:#22c55e; color:#fff; }
        .dispute-tab__btn--ghost { background:transparent; color:#475569; border:1px solid #cbd5e1; }
        .dispute-tab__empty { background:#fff; border:1px dashed #cbd5e1; border-radius:10px; padding:2rem; text-align:center; color:#64748b; font-size:0.9rem; }
      `}</style>

      <div className="dispute-tab__header">
        <h3>Build a dispute item</h3>
        <div className="dispute-tab__client">{selectedClientLabel || 'Pick a client at the top.'}</div>
      </div>

      {!tradelines.length ? (
        <div className="dispute-tab__empty">
          <strong>Import a credit report first.</strong>
          <div style={{ marginTop: '0.5rem' }}>The furnisher dropdown is populated from accounts in the imported report. Use the Import Report tab to upload one.</div>
        </div>
      ) : unusedTradelines.length === 0 ? (
        <div className="dispute-tab__empty">
          <strong>Every account on the report is already in the dispute pipeline.</strong>
          <div style={{ marginTop: '0.5rem' }}>Head to the Add Items tab to manage the items already created, or import a fresh report.</div>
        </div>
      ) : (
        <div className="dispute-tab__form">
          {savedNotice ? <div className="dispute-tab__notice dispute-tab__notice--success">{savedNotice}</div> : null}
          {error ? <div className="dispute-tab__notice dispute-tab__notice--error">{error}</div> : null}
          {!selectedKey ? <div className="dispute-tab__notice dispute-tab__notice--info">Pick an account from the Furnisher dropdown — the rest of the form auto-fills from the imported report.</div> : null}

          <div className="dispute-tab__row">
            <div className="dispute-tab__field">
              <label>Furnisher *</label>
              <select value={selectedKey} onChange={(e) => handleFurnisherChange(e.target.value)}>
                <option value="">— Select account from imported report —</option>
                {unusedTradelines.map((g) => {
                  const bChips = Array.from(g.bureaus).map((b) => b === 'EXPERIAN' ? 'EX' : b === 'EQUIFAX' ? 'EQ' : 'TU').sort().join('/');
                  const acctTail = g.sample.accountNumber ? ` · ${g.sample.accountNumber}` : '';
                  const negTag = g.sample.isNegative ? ' · NEG' : '';
                  return (
                    <option key={g.key} value={g.key}>
                      {g.sample.creditorName || 'Unknown'}{acctTail} · [{bChips}]{negTag}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="dispute-tab__field">
              <label>Account Number</label>
              <input value={formData.accountNumber} onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })} disabled={!selectedKey} />
            </div>

            <div className="dispute-tab__field">
              <label>Account Type</label>
              <select value={formData.accountType} onChange={(e) => setFormData({ ...formData, accountType: e.target.value as typeof formData.accountType })} disabled={!selectedKey}>
                {accountTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="dispute-tab__row">
            <div className="dispute-tab__field">
              <label>Balance</label>
              <input type="number" value={formData.balance} onChange={(e) => setFormData({ ...formData, balance: e.target.value })} placeholder="0.00" disabled={!selectedKey} />
            </div>
            <div className="dispute-tab__field">
              <label>Date Added</label>
              <input type="date" value={formData.dateAdded} onChange={(e) => setFormData({ ...formData, dateAdded: e.target.value })} disabled={!selectedKey} />
            </div>
            <div className="dispute-tab__field">
              <label>Dispute Reason *</label>
              <select value={formData.reason} onChange={(e) => setFormData({ ...formData, reason: e.target.value })} disabled={!selectedKey}>
                <option value="">Select reason...</option>
                {disputeReasons.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          <div className="dispute-tab__bureaus">
            <label className="dispute-tab__bureau">
              <input
                type="checkbox"
                checked={formData.disputeEquifax && formData.disputeExperian && formData.disputeTransunion}
                onChange={(e) => handleCheckAllBureaus(e.target.checked)}
                disabled={!selectedKey}
              />
              Check All
            </label>
            <label className="dispute-tab__bureau">
              <input type="checkbox" checked={formData.disputeEquifax} onChange={(e) => setFormData({ ...formData, disputeEquifax: e.target.checked })} disabled={!selectedKey} />
              EFX (Equifax)
            </label>
            <label className="dispute-tab__bureau">
              <input type="checkbox" checked={formData.disputeExperian} onChange={(e) => setFormData({ ...formData, disputeExperian: e.target.checked })} disabled={!selectedKey} />
              XPN (Experian)
            </label>
            <label className="dispute-tab__bureau">
              <input type="checkbox" checked={formData.disputeTransunion} onChange={(e) => setFormData({ ...formData, disputeTransunion: e.target.checked })} disabled={!selectedKey} />
              TU (TransUnion)
            </label>
          </div>

          <div className="dispute-tab__field">
            <label>Custom Instructions</label>
            <textarea
              rows={2}
              value={formData.customInstruction}
              onChange={(e) => setFormData({ ...formData, customInstruction: e.target.value })}
              placeholder="Optional instructions for this dispute…"
              disabled={!selectedKey}
            />
          </div>

          <div className="dispute-tab__actions">
            <button type="button" className="dispute-tab__btn dispute-tab__btn--primary" onClick={handleSave} disabled={saving || !selectedKey}>
              {saving ? 'Saving…' : 'Save to print list'}
            </button>
            <button type="button" className="dispute-tab__btn dispute-tab__btn--success" onClick={handleSaveAndInitiate} disabled={saving || !selectedKey}>
              Save & initiate dispute
            </button>
            <button type="button" className="dispute-tab__btn dispute-tab__btn--ghost" onClick={resetForm} disabled={saving || !selectedKey}>
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
