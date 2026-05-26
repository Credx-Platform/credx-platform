import { useState, useEffect, useMemo } from 'react';
import type { DisputeItem, ImportedTradeline } from './DisputeManager';

interface CreditorsTabProps {
  token: string;
  selectedClientId: string;
  selectedClientLabel?: string;
  clientName?: string;
  clientAddress?: string;
  items: DisputeItem[];
  tradelines: ImportedTradeline[];
  prefillKey?: string | null;
  onConsumePrefill?: () => void;
  pendingTradelineKeys?: string[];
  onConsumePendingKeys?: () => void;
  onItemCreated: () => void;
  onBackToItems: () => void;
  onOpenTracking: () => void;
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
  'Inaccurate Reporting',
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

type BatchEntry = {
  localId: string;
  tradelineKey: string;
  furnisher: string;
  accountNumber: string;
  accountType: 'LATE_PAYMENT' | 'COLLECTION' | 'CHARGE_OFF' | 'INQUIRY' | 'OTHER';
  balance: string;
  dateAdded: string;
  disputeEquifax: boolean;
  disputeExperian: boolean;
  disputeTransunion: boolean;
  reason: string;
  customInstruction: string;
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

function inferAccountType(t: ImportedTradeline): BatchEntry['accountType'] {
  const v = `${t.accountType || ''} ${t.status || ''}`.toLowerCase();
  if (v.includes('collection')) return 'COLLECTION';
  if (v.includes('charge')) return 'CHARGE_OFF';
  if (v.includes('inquir')) return 'INQUIRY';
  if (v.includes('late') || v.includes('past due')) return 'LATE_PAYMENT';
  return 'OTHER';
}

const EMPTY_FORM: Omit<BatchEntry, 'localId' | 'tradelineKey'> = {
  furnisher: '',
  accountNumber: '',
  accountType: 'OTHER',
  balance: '',
  dateAdded: '',
  disputeEquifax: false,
  disputeExperian: false,
  disputeTransunion: false,
  reason: '',
  customInstruction: ''
};

function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
}

function bureausPhrase(e: BatchEntry): string {
  const out: string[] = [];
  if (e.disputeEquifax) out.push('Equifax');
  if (e.disputeExperian) out.push('Experian');
  if (e.disputeTransunion) out.push('TransUnion');
  return out.length ? out.join(', ') : 'all bureaus';
}

function buildCreditorLetter(creditor: string, entries: BatchEntry[], clientName?: string, clientAddress?: string) {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const lines = entries.map((e, i) => {
    return `${i + 1}. Account ${e.accountNumber || '[number on file]'} (${e.accountType.replace(/_/g, ' ')}) — Reason: ${e.reason || 'Reason pending'} — Reported to: ${bureausPhrase(e)}${e.customInstruction ? ` — Instruction: ${e.customInstruction}` : ''}`;
  });
  return `${creditor}\n[Creditor mailing address]\n\nDate: ${today}\n\n${clientName ? `Re: ${clientName}\n` : ''}${clientAddress ? `${clientAddress}\n\n` : ''}Dear ${creditor},\n\nI am writing directly regarding the account(s) listed below that you are furnishing to the consumer reporting agencies. Please investigate each item under your FCRA §623 furnisher obligations and correct or cease reporting any information that is inaccurate, incomplete, or unverifiable.\n\n${lines.join('\n')}\n\nKindly forward your investigation results to the credit reporting agencies indicated and to the mailing address on file.\n\nSincerely,\n${clientName || '[Client Name]'}`;
}

function openLetterWindow(title: string, body: string) {
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;padding:32px;line-height:1.6;color:#111}h1{font-size:20px;margin-bottom:18px}pre{white-space:pre-wrap;font-family:Arial,sans-serif;font-size:14px}</style></head><body><h1>${escapeHtml(title)}</h1><pre>${escapeHtml(body)}</pre><script>window.onload=function(){window.print();}</script></body></html>`);
  w.document.close();
  w.focus();
}

function saveLetterFile(filename: string, body: string) {
  const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function CreditorsTab({
  token,
  selectedClientId,
  selectedClientLabel,
  clientName,
  clientAddress,
  items,
  tradelines,
  prefillKey,
  onConsumePrefill,
  pendingTradelineKeys,
  onConsumePendingKeys,
  onItemCreated,
  onBackToItems,
  onOpenTracking
}: CreditorsTabProps) {
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [batch, setBatch] = useState<BatchEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const usedTradelineKeys = useMemo(() => {
    const used = new Set<string>();
    for (const item of items) {
      used.add(`${(item.furnisher || '').trim().toLowerCase()}|${(item.accountNumber || '').trim()}`);
    }
    for (const e of batch) used.add(e.tradelineKey);
    return used;
  }, [items, batch]);

  const grouped = useMemo(() => groupTradelines(tradelines), [tradelines]);
  const unusedTradelines = useMemo(() => grouped.filter((g) => !usedTradelineKeys.has(g.key)), [grouped, usedTradelineKeys]);

  // Picking an account auto-fills bureau checkboxes from the bureaus reporting that tradeline.
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
  };

  useEffect(() => {
    if (!prefillKey) return;
    const match = grouped.find((g) => g.key === prefillKey);
    if (match) {
      applyTradeline(match);
      onConsumePrefill?.();
    }
  }, [prefillKey, grouped]);

  useEffect(() => {
    if (!pendingTradelineKeys || !pendingTradelineKeys.length) return;
    const additions: BatchEntry[] = [];
    for (const key of pendingTradelineKeys) {
      if (usedTradelineKeys.has(key)) continue;
      const g = grouped.find((x) => x.key === key);
      if (!g) continue;
      additions.push({
        localId: `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        tradelineKey: g.key,
        furnisher: g.sample.creditorName || '',
        accountNumber: g.sample.accountNumber || '',
        accountType: inferAccountType(g.sample),
        balance: g.sample.balance != null ? String(g.sample.balance) : '',
        dateAdded: '',
        disputeEquifax: g.bureaus.has('EQUIFAX'),
        disputeExperian: g.bureaus.has('EXPERIAN'),
        disputeTransunion: g.bureaus.has('TRANSUNION'),
        reason: 'Inaccurate Reporting',
        customInstruction: ''
      });
    }
    if (additions.length) {
      setBatch((b) => [...b, ...additions]);
      setNotice(`Added ${additions.length} account${additions.length === 1 ? '' : 's'} from the imported report. Press Save & generate letters when ready.`);
    }
    onConsumePendingKeys?.();
  }, [pendingTradelineKeys, grouped]);

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

  const handleAddToDispute = () => {
    if (!selectedKey) { setError('Pick an account from the Furnisher dropdown first.'); return; }
    if (!formData.reason) { setError('Pick a dispute reason.'); return; }
    setBatch((b) => [...b, { localId: `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, tradelineKey: selectedKey, ...formData }]);
    setNotice('Added to current creditor batch.');
    resetForm();
  };

  const removeFromBatch = (localId: string) => {
    setBatch((b) => b.filter((e) => e.localId !== localId));
  };

  const clearBatch = () => {
    if (!batch.length) return;
    if (!confirm(`Clear all ${batch.length} item(s) from the creditor batch?`)) return;
    setBatch([]);
  };

  const persistBatch = async () => {
    if (!selectedClientId) throw new Error('Pick a client at the top of the dispute workspace first.');
    if (!batch.length) throw new Error('Add at least one account to the creditor batch.');
    for (const e of batch) {
      const res = await fetch(`${API_BASE}/api/disputes/items`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedClientId,
          furnisher: e.furnisher,
          accountNumber: e.accountNumber,
          accountType: e.accountType,
          balance: e.balance ? parseFloat(e.balance) : null,
          dateAdded: e.dateAdded,
          disputeEquifax: e.disputeEquifax,
          disputeExperian: e.disputeExperian,
          disputeTransunion: e.disputeTransunion,
          reason: e.reason,
          customInstruction: e.customInstruction
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Save failed for ${e.furnisher}`);
      }
    }
  };

  const handleSaveBatch = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await persistBatch();
      setBatch([]);
      setNotice('Batch saved. Items are on the Add Items tab.');
      onItemCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndGenerate = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    const snapshot = batch.slice();
    try {
      await persistBatch();
      setBatch([]);
      onItemCreated();
      // One letter per unique creditor in the batch.
      const byCreditor = new Map<string, BatchEntry[]>();
      for (const e of snapshot) {
        const k = e.furnisher.trim();
        const list = byCreditor.get(k) || [];
        list.push(e);
        byCreditor.set(k, list);
      }
      for (const [creditor, entries] of byCreditor) {
        const body = buildCreditorLetter(creditor, entries, clientName, clientAddress);
        openLetterWindow(`${creditor} — Creditor Dispute Letter`, body);
      }
      setNotice('Batch saved and creditor letters opened in print windows.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save & generate failed');
    } finally {
      setSaving(false);
    }
  };

  const handleCheckAllBureaus = (checked: boolean) => {
    setFormData((p) => ({ ...p, disputeEquifax: checked, disputeExperian: checked, disputeTransunion: checked }));
  };

  // One preview card per unique creditor in the batch.
  const lettersPreview = useMemo(() => {
    const byCreditor = new Map<string, BatchEntry[]>();
    for (const e of batch) {
      const k = e.furnisher.trim();
      const list = byCreditor.get(k) || [];
      list.push(e);
      byCreditor.set(k, list);
    }
    return Array.from(byCreditor.entries()).map(([creditor, entries]) => ({ creditor, entries }));
  }, [batch]);

  return (
    <div className="creditors-tab">
      <style>{`
        .creditors-tab { padding: 1.5rem; display:grid; gap:1.5rem; }
        .ct-header { display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap; }
        .ct-header h3 { margin:0; font-size:1.25rem; color:#1e293b; }
        .ct-header p { margin:.35rem 0 0; color:#64748b; line-height:1.6; max-width:760px; font-size:.9rem; }
        .ct-actions { display:flex; gap:.5rem; flex-wrap:wrap; }
        .ct-btn { padding:.55rem 1rem; border:1px solid transparent; border-radius:8px; font-weight:600; font-size:.85rem; cursor:pointer; transition: transform .15s ease, opacity .15s ease; }
        .ct-btn:hover:not(:disabled) { transform: translateY(-1px); }
        .ct-btn:disabled { opacity:.55; cursor:not-allowed; }
        .ct-btn--primary { background:#a855f7; color:#fff; border-color:#a855f7; }
        .ct-btn--success { background:#22c55e; color:#fff; border-color:#22c55e; }
        .ct-btn--ghost { background:transparent; color:#475569; border-color:#cbd5e1; }
        .ct-btn--danger { background:transparent; color:#b91c1c; border-color:#fecaca; }

        .ct-notice { padding:.75rem 1rem; border-radius:8px; font-size:.875rem; }
        .ct-notice--info { background: rgba(168,85,247,.08); color:#581c87; border:1px solid rgba(168,85,247,.32); }
        .ct-notice--success { background: rgba(34,197,94,.10); color:#166534; border:1px solid rgba(34,197,94,.32); }
        .ct-notice--error { background: rgba(220,38,38,.10); color:#8a1313; border:1px solid rgba(220,38,38,.32); }

        .ct-form { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:1.5rem; }
        .ct-row { display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:1rem; margin-bottom:1rem; }
        .ct-field { display:flex; flex-direction:column; gap:.35rem; }
        .ct-field label { font-size:.8rem; font-weight:600; color:#374151; text-transform:uppercase; letter-spacing:.04em; }
        .ct-field input, .ct-field select, .ct-field textarea { padding:.6rem .75rem; border:1px solid #d1d5db; border-radius:6px; font-size:.9rem; background:#fff; color:#0f172a; font-family:inherit; }
        .ct-field input:focus, .ct-field select:focus, .ct-field textarea:focus { outline:none; border-color:#a855f7; box-shadow:0 0 0 3px rgba(168,85,247,.15); }
        .ct-field input:disabled, .ct-field select:disabled, .ct-field textarea:disabled { background:#f1f5f9; color:#64748b; cursor:not-allowed; }
        .ct-bureaus { display:flex; gap:1.25rem; flex-wrap:wrap; padding:1rem; background:#fff; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:1rem; }
        .ct-bureau { display:flex; align-items:center; gap:.5rem; font-size:.875rem; color:#374151; font-weight:500; }
        .ct-bureau input { width:16px; height:16px; accent-color:#a855f7; }
        .ct-form-actions { display:flex; gap:.75rem; flex-wrap:wrap; padding-top:1rem; border-top:1px solid #e2e8f0; }

        .ct-batch { background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:1.25rem; }
        .ct-batch__header { display:flex; justify-content:space-between; align-items:center; gap:.75rem; flex-wrap:wrap; margin-bottom:.75rem; }
        .ct-batch__title { color:#1e293b; font-weight:700; font-size:.95rem; }
        .ct-batch__title small { display:block; color:#64748b; font-size:.78rem; font-weight:500; margin-top:2px; }
        .ct-batch__list { display:grid; gap:.5rem; }
        .ct-batch__row { display:grid; grid-template-columns: 1fr auto auto auto; gap:.75rem; align-items:center; padding:.65rem .85rem; background:#f8fafc; border:1px solid #e5e7eb; border-radius:8px; }
        .ct-batch__row strong { color:#0f172a; }
        .ct-batch__row .meta { color:#64748b; font-size:.78rem; }
        .ct-chips { display:flex; gap:3px; }
        .ct-chip { font-size:.65rem; padding:2px 6px; border-radius:999px; font-weight:700; letter-spacing:.04em; }
        .ct-chip--EQ { background:rgba(34,197,94,.14); color:#166534; }
        .ct-chip--EX { background:rgba(59,130,246,.14); color:#1e40af; }
        .ct-chip--TU { background:rgba(168,85,247,.14); color:#6b21a8; }

        .ct-letters { display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:1rem; }
        .ct-letter { background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:1rem; display:grid; gap:.75rem; box-shadow:0 12px 32px rgba(15,23,42,.06); }
        .ct-letter h4 { margin:0; font-size:1.05rem; color:#0f172a; }
        .ct-letter p { margin:0; color:#64748b; font-size:.86rem; }
        .ct-letter .pill { display:inline-flex; align-items:center; gap:.5rem; padding:.35rem .7rem; border-radius:999px; background:rgba(168,85,247,.10); color:#6b21a8; font-size:.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.04em; }
        .ct-letter ol { margin:.25rem 0 0; padding-left:1.2rem; color:#0f172a; font-size:.82rem; }
        .ct-letter .letter-actions { display:flex; gap:.5rem; flex-wrap:wrap; }

        .ct-empty { background:#fff; border:1px dashed #cbd5e1; border-radius:10px; padding:2rem; text-align:center; color:#64748b; font-size:.9rem; }
        .ct-empty strong { display:block; color:#1e293b; margin-bottom:.4rem; }
      `}</style>

      <div className="ct-header">
        <div>
          <h3>Creditors — direct dispute</h3>
          <p>Same batch flow as Bureaus, but each saved letter is addressed to the creditor directly under FCRA §623 furnisher obligations. Selecting an account auto-fills which bureaus the creditor reports to.</p>
        </div>
        <div className="ct-actions">
          <button type="button" className="ct-btn ct-btn--ghost" onClick={onBackToItems}>Back to Add Items</button>
          <button type="button" className="ct-btn ct-btn--ghost" onClick={onOpenTracking}>Continue to Tracking</button>
        </div>
      </div>

      {notice ? <div className="ct-notice ct-notice--success">{notice}</div> : null}
      {error ? <div className="ct-notice ct-notice--error">{error}</div> : null}

      {!tradelines.length ? (
        <div className="ct-empty">
          <strong>Import a credit report first.</strong>
          The furnisher dropdown pulls from accounts in the imported report. Use the Import Report tab to upload one.
        </div>
      ) : unusedTradelines.length === 0 ? (
        <div className="ct-empty">
          <strong>Every account on the report is already staged or saved.</strong>
          Items in the dispute pipeline live on the Add Items tab. Import a fresh report to add more.
        </div>
      ) : (
        <div className="ct-form">
          {!selectedKey ? <div className="ct-notice ct-notice--info" style={{ marginBottom: '1rem' }}>Pick a creditor from the dropdown — the bureaus the creditor reports to auto-populate from the imported report.</div> : null}

          <div className="ct-row">
            <div className="ct-field">
              <label>Creditor *</label>
              <select value={selectedKey} onChange={(e) => handleFurnisherChange(e.target.value)}>
                <option value="">— Select creditor account from imported report —</option>
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

            <div className="ct-field">
              <label>Account Number</label>
              <input value={formData.accountNumber} onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })} disabled={!selectedKey} />
            </div>

            <div className="ct-field">
              <label>Account Type</label>
              <select value={formData.accountType} onChange={(e) => setFormData({ ...formData, accountType: e.target.value as BatchEntry['accountType'] })} disabled={!selectedKey}>
                {accountTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="ct-row">
            <div className="ct-field">
              <label>Balance</label>
              <input type="number" value={formData.balance} onChange={(e) => setFormData({ ...formData, balance: e.target.value })} placeholder="0.00" disabled={!selectedKey} />
            </div>
            <div className="ct-field">
              <label>Date Added</label>
              <input type="date" value={formData.dateAdded} onChange={(e) => setFormData({ ...formData, dateAdded: e.target.value })} disabled={!selectedKey} />
            </div>
            <div className="ct-field">
              <label>Dispute Reason *</label>
              <select value={formData.reason} onChange={(e) => setFormData({ ...formData, reason: e.target.value })} disabled={!selectedKey}>
                <option value="">Select reason...</option>
                {disputeReasons.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          <div className="ct-bureaus">
            <label className="ct-bureau">
              <input
                type="checkbox"
                checked={formData.disputeEquifax && formData.disputeExperian && formData.disputeTransunion}
                onChange={(e) => handleCheckAllBureaus(e.target.checked)}
                disabled={!selectedKey}
              />
              Check All
            </label>
            <label className="ct-bureau">
              <input type="checkbox" checked={formData.disputeEquifax} onChange={(e) => setFormData({ ...formData, disputeEquifax: e.target.checked })} disabled={!selectedKey} />
              EFX (Equifax)
            </label>
            <label className="ct-bureau">
              <input type="checkbox" checked={formData.disputeExperian} onChange={(e) => setFormData({ ...formData, disputeExperian: e.target.checked })} disabled={!selectedKey} />
              XPN (Experian)
            </label>
            <label className="ct-bureau">
              <input type="checkbox" checked={formData.disputeTransunion} onChange={(e) => setFormData({ ...formData, disputeTransunion: e.target.checked })} disabled={!selectedKey} />
              TU (TransUnion)
            </label>
          </div>

          <div className="ct-field">
            <label>Custom Instructions</label>
            <textarea
              rows={2}
              value={formData.customInstruction}
              onChange={(e) => setFormData({ ...formData, customInstruction: e.target.value })}
              placeholder="Optional instructions for this dispute…"
              disabled={!selectedKey}
            />
          </div>

          <div className="ct-form-actions">
            <button type="button" className="ct-btn ct-btn--primary" onClick={handleAddToDispute} disabled={!selectedKey || saving}>
              + Add to dispute
            </button>
            <button type="button" className="ct-btn ct-btn--ghost" onClick={resetForm} disabled={!selectedKey || saving}>
              Clear form
            </button>
          </div>
        </div>
      )}

      <div className="ct-batch">
        <div className="ct-batch__header">
          <div className="ct-batch__title">
            Accounts in this creditor dispute
            <small>
              {batch.length
                ? `${batch.length} account${batch.length === 1 ? '' : 's'} queued for ${selectedClientLabel || 'this client'}`
                : 'Queued accounts will appear here. They are not saved until you press Save batch.'}
            </small>
          </div>
          <div className="ct-actions">
            <button type="button" className="ct-btn ct-btn--danger" onClick={clearBatch} disabled={!batch.length || saving}>
              Clear batch
            </button>
            <button type="button" className="ct-btn ct-btn--ghost" onClick={handleSaveBatch} disabled={!batch.length || saving}>
              {saving ? 'Saving…' : 'Save batch'}
            </button>
            <button type="button" className="ct-btn ct-btn--success" onClick={handleSaveAndGenerate} disabled={!batch.length || saving}>
              {saving ? 'Saving…' : 'Save & generate letters'}
            </button>
          </div>
        </div>

        {batch.length ? (
          <div className="ct-batch__list">
            {batch.map((e) => (
              <div key={e.localId} className="ct-batch__row">
                <div>
                  <strong>{e.furnisher}</strong>
                  <div className="meta">{e.accountNumber || '—'} · {e.accountType.replace('_', ' ')} · {e.reason || 'reason pending'}</div>
                </div>
                <div className="ct-chips">
                  {e.disputeEquifax ? <span className="ct-chip ct-chip--EQ">EQ</span> : null}
                  {e.disputeExperian ? <span className="ct-chip ct-chip--EX">EX</span> : null}
                  {e.disputeTransunion ? <span className="ct-chip ct-chip--TU">TU</span> : null}
                </div>
                <div className="meta">{e.balance ? `$${Number(e.balance).toLocaleString()}` : '—'}</div>
                <button type="button" className="ct-btn ct-btn--danger" style={{ padding: '.35rem .7rem' }} onClick={() => removeFromBatch(e.localId)} disabled={saving}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {batch.length ? (
        <div>
          <div className="ct-batch__title" style={{ marginBottom: '.75rem' }}>
            Letter preview
            <small>One letter per creditor. If a creditor appears more than once, their accounts share a single letter.</small>
          </div>
          <div className="ct-letters">
            {lettersPreview.map((l) => (
              <article key={l.creditor} className="ct-letter">
                <div>
                  <span className="pill">Creditor</span>
                  <h4>{l.creditor}</h4>
                  <p>{l.entries.length} account{l.entries.length === 1 ? '' : 's'} addressed on this letter.</p>
                </div>
                <ol>{l.entries.map((e) => <li key={e.localId}>{e.accountNumber || 'account on file'} — {e.reason} <span style={{ color:'#64748b' }}>({bureausPhrase(e)})</span></li>)}</ol>
                <div className="letter-actions">
                  <button type="button" className="ct-btn ct-btn--primary" onClick={() => openLetterWindow(`${l.creditor} — Creditor Dispute Letter`, buildCreditorLetter(l.creditor, l.entries, clientName, clientAddress))}>
                    Print letter
                  </button>
                  <button type="button" className="ct-btn ct-btn--ghost" onClick={() => saveLetterFile(`${l.creditor.toLowerCase().replace(/\s+/g, '-')}-creditor-dispute-letter.txt`, buildCreditorLetter(l.creditor, l.entries, clientName, clientAddress))}>
                    Save .txt
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
