import { useState, useEffect, useMemo } from 'react';
import type { DisputeItem, ImportedTradeline } from './DisputeManager';

interface AddItemTabProps {
  token: string;
  items: DisputeItem[];
  selectedClientId: string;
  selectedClientLabel?: string;
  onItemCreated: () => void;
  onItemsChange: () => void;
  selectedItemIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onOpenBureaus: () => void;
  tradelines?: ImportedTradeline[];
  onRefreshTradelines?: () => void;
  onPickTradeline?: (key: string) => void;
  onGoToBureaus?: () => void;
  onGoToCreditors?: () => void;
  onPickTradelineForCreditors?: (key: string) => void;
}

const API_BASE = (import.meta.env.VITE_API_URL ?? '').trim() || '';

function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
}

function bureauList(item: DisputeItem): string {
  const out: string[] = [];
  if (item.disputeEquifax) out.push('Equifax');
  if (item.disputeExperian) out.push('Experian');
  if (item.disputeTransunion) out.push('TransUnion');
  return out.join(', ') || '—';
}

function openPrintWindow(clientLabel: string, items: DisputeItem[]) {
  const today = new Date().toLocaleString();
  const rows = items.map((d) => `
    <tr>
      <td>${escapeHtml(d.furnisher)}</td>
      <td>${escapeHtml(d.accountNumber || '—')}</td>
      <td>${escapeHtml((d.accountType || '').replace('_', ' '))}</td>
      <td>${d.balance != null ? `$${Number(d.balance).toLocaleString()}` : '—'}</td>
      <td>${escapeHtml(bureauList(d))}</td>
      <td>${escapeHtml(d.reason || '—')}</td>
      <td>Round ${d.currentRound}</td>
      <td>${escapeHtml(d.status.replace('_', ' '))}</td>
    </tr>
  `).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>CredX Dispute Print List — ${escapeHtml(clientLabel)}</title>
  <style>
    body{font-family:Inter,Arial,sans-serif;color:#0f1929;padding:24px;}
    h1{font-size:18px;margin:0 0 4px;}
    .sub{font-size:12px;color:#475569;margin-bottom:16px;}
    table{width:100%;border-collapse:collapse;font-size:12px;}
    th,td{padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top;}
    th{background:#f1f5f9;text-transform:uppercase;font-size:10px;letter-spacing:0.06em;color:#334155;}
    tr:nth-child(even) td{background:#fafbfc;}
    @media print { @page { margin: 0.6in; } }
  </style>
  </head><body>
  <h1>CredX Dispute Print List</h1>
  <div class="sub">${escapeHtml(clientLabel)} · ${items.length} items · ${escapeHtml(today)}</div>
  <table>
    <thead><tr><th>Furnisher</th><th>Account</th><th>Type</th><th>Balance</th><th>Bureaus</th><th>Reason</th><th>Round</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <script>window.onload=function(){window.print();}</script>
  </body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
}

export function AddItemTab({ token, items, selectedClientId, selectedClientLabel, onItemsChange, selectedItemIds, onSelectionChange, onOpenBureaus, tradelines = [], onRefreshTradelines, onPickTradeline, onGoToBureaus, onGoToCreditors, onPickTradelineForCreditors }: AddItemTabProps) {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set(selectedItemIds));
  const [showOnlyNegative, setShowOnlyNegative] = useState(true);

  useEffect(() => {
    setSelectedItems(new Set(selectedItemIds));
  }, [selectedItemIds]);

  // Collapse 3-bureau duplicates into one row per furnisher+account.
  const groupedTradelines = useMemo(() => {
    const map = new Map<string, { key: string; sample: ImportedTradeline; bureaus: Set<'EXPERIAN' | 'EQUIFAX' | 'TRANSUNION'> }>();
    for (const t of tradelines) {
      const key = `${(t.creditorName || '').trim().toLowerCase()}|${(t.accountNumber || '').trim()}`;
      const entry = map.get(key);
      if (entry) entry.bureaus.add(t.bureau);
      else map.set(key, { key, sample: t, bureaus: new Set([t.bureau]) });
    }
    return Array.from(map.values());
  }, [tradelines]);

  // Mark which tradelines are already in the dispute pipeline.
  const usedTradelineKeys = useMemo(() => {
    const used = new Set<string>();
    for (const item of items) {
      used.add(`${(item.furnisher || '').trim().toLowerCase()}|${(item.accountNumber || '').trim()}`);
    }
    return used;
  }, [items]);

  const visibleTradelines = useMemo(() => {
    return groupedTradelines.filter((g) => {
      if (showOnlyNegative && !g.sample.isNegative) return false;
      return true;
    });
  }, [groupedTradelines, showOnlyNegative]);

  const toggleItemSelect = (id: string) => {
    const next = new Set(selectedItems);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedItems(next);
    onSelectionChange(Array.from(next));
  };

  const selectAllItems = () => {
    const next = new Set(items.map((i) => i.id));
    setSelectedItems(next);
    onSelectionChange(Array.from(next));
  };

  const clearItemSelection = () => {
    setSelectedItems(new Set());
    onSelectionChange([]);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this item from the print list?')) return;
    try {
      const response = await fetch(`${API_BASE}/api/disputes/items/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Delete failed');
      onItemsChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedItems.size === 0) return;
    if (!confirm(`Remove ${selectedItems.size} item(s) from the print list?`)) return;
    try {
      const response = await fetch(`${API_BASE}/api/disputes/bulk/delete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedItems) })
      });
      if (!response.ok) throw new Error('Bulk delete failed');
      clearItemSelection();
      onItemsChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Bulk delete failed');
    }
  };

  const printAll = () => {
    if (!items.length) return;
    openPrintWindow(selectedClientLabel || 'Client', items);
  };

  const printSelected = () => {
    if (!selectedItems.size) return;
    const picks = items.filter((i) => selectedItems.has(i.id));
    openPrintWindow(selectedClientLabel || 'Client', picks);
  };

  return (
    <div className="add-item-tab">
      <style>{`
        .add-item-tab { padding: 1.5rem; }
        .ait-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem; flex-wrap:wrap; gap:1rem; }
        .ait-header h3 { font-size:1.25rem; color:#1e293b; margin:0; }
        .ait-client { padding:0.6rem 0.95rem; border:1px solid #d1d5db; border-radius:6px; min-width:250px; background:#fff; color:#0f172a; font-size: 0.875rem; }

        .ait-empty { background:#fff; border:1px dashed #cbd5e1; border-radius:10px; padding:2rem; text-align:center; color:#64748b; font-size:0.9rem; }
        .ait-empty strong { color:#1e293b; display:block; margin-bottom:0.4rem; font-size:1rem; }

        .ready-print { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:1.25rem; }
        .ready-print__header { display:flex; justify-content:space-between; align-items:center; gap:0.75rem; flex-wrap:wrap; margin-bottom:1rem; }
        .ready-print__title { color:#1e293b; font-weight:700; font-size:0.95rem; }
        .ready-print__title small { display:block; color:#64748b; font-size:0.78rem; font-weight:500; margin-top:2px; }
        .ready-print__actions { display:flex; gap:0.5rem; flex-wrap:wrap; }
        .ready-print__btn { padding:0.55rem 1rem; border-radius:6px; font-weight:600; font-size:0.85rem; cursor:pointer; border:1px solid transparent; transition: transform .15s ease, opacity .15s ease; }
        .ready-print__btn:hover:not(:disabled) { transform: translateY(-1px); }
        .ready-print__btn:disabled { opacity:0.55; cursor:not-allowed; }
        .ready-print__btn--primary { background:#00c6fb; color:#0f1929; border-color:#00c6fb; }
        .ready-print__btn--ghost { background:transparent; color:#475569; border-color:#cbd5e1; }
        .ready-print__btn--danger { background:transparent; color:#b91c1c; border-color:#fecaca; }

        .ait-bulk { display:flex; gap:0.5rem; flex-wrap:wrap; padding:0.65rem 0.9rem; background:rgba(0,198,251,0.06); border:1px solid rgba(0,198,251,0.32); border-radius:8px; margin-bottom:0.75rem; align-items:center; font-size:0.85rem; color:#0a4f7a; }

        .ait-table { width:100%; border-collapse:collapse; font-size:0.85rem; background:#fff; border-radius:8px; overflow:hidden; }
        .ait-table th { background:#f1f5f9; text-align:left; padding:0.6rem 0.75rem; font-size:0.72rem; letter-spacing:0.06em; text-transform:uppercase; color:#475569; }
        .ait-table td { padding:0.65rem 0.75rem; border-top:1px solid #e2e8f0; vertical-align:top; color:#0f172a; }
        .ait-table tr:hover td { background:rgba(0,198,251,0.04); }
        .ait-table input[type="checkbox"] { width:16px; height:16px; accent-color:#00c6fb; cursor:pointer; }
        .ait-row-actions button { background:transparent; border:none; color:#64748b; cursor:pointer; font-size:0.8rem; padding:0.25rem 0.5rem; border-radius:4px; }
        .ait-row-actions button:hover { color:#b91c1c; background:rgba(220,38,38,0.06); }

        .ait-status { display:inline-block; padding:2px 8px; border-radius:999px; font-size:0.7rem; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; }
        .ait-status--PENDING { background:#e2e8f0; color:#334155; }
        .ait-status--IN_DISPUTE { background:rgba(59,130,246,0.18); color:#1e40af; }
        .ait-status--DELETED { background:rgba(34,197,94,0.18); color:#166534; }
        .ait-status--UPDATED { background:rgba(234,179,8,0.18); color:#854d0e; }
        .ait-status--VERIFIED { background:rgba(220,38,38,0.18); color:#991b1b; }

        .ait-bureau-chips { display:flex; gap:3px; flex-wrap:wrap; }
        .ait-bureau-chip { font-size:0.65rem; padding:2px 6px; border-radius:999px; font-weight:700; letter-spacing:0.04em; }
        .ait-bureau-chip--EX { background:rgba(59,130,246,0.14); color:#1e40af; }
        .ait-bureau-chip--EQ { background:rgba(34,197,94,0.14); color:#166534; }
        .ait-bureau-chip--TU { background:rgba(168,85,247,0.14); color:#6b21a8; }
      `}</style>

      <div className="ait-header">
        <div>
          <h3>Add Items</h3>
          <div style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 2 }}>
            Pick accounts from the imported report (top) → build a batch on Bureaus or Creditors → print from Ready to Print (below).
          </div>
        </div>
        <div className="ait-client">{selectedClientLabel || 'Pick a client at the top.'}</div>
      </div>

      {/* TOP — imported tradelines */}
      <div className="tradeline-suggest" style={{ marginBottom: '1.5rem' }}>
        <div className="tradeline-suggest__header">
          <div className="tradeline-suggest__title">
            Accounts from imported credit report
            <small>
              {tradelines.length
                ? `${visibleTradelines.length} of ${groupedTradelines.length} shown · click an account to open it in Bureaus`
                : 'No accounts parsed yet. Upload a credit report on the Import Report tab.'}
            </small>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#475569' }}>
              <input type="checkbox" checked={showOnlyNegative} onChange={(e) => setShowOnlyNegative(e.target.checked)} />
              Negative only
            </label>
            {onRefreshTradelines ? (
              <button type="button" onClick={onRefreshTradelines} style={{ fontSize: 12, padding: '4px 10px', background: 'transparent', border: '1px solid #cbd5e1', borderRadius: 6, color: '#475569', cursor: 'pointer' }}>
                ↻ Refresh
              </button>
            ) : null}
            {onGoToBureaus ? (
              <button type="button" onClick={onGoToBureaus} style={{ fontSize: 12, padding: '4px 10px', background: '#00c6fb', color: '#0f1929', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}>
                Open Bureaus tab →
              </button>
            ) : null}
            {onGoToCreditors ? (
              <button type="button" onClick={onGoToCreditors} style={{ fontSize: 12, padding: '4px 10px', background: '#a855f7', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}>
                Open Creditors tab →
              </button>
            ) : null}
          </div>
        </div>

        {tradelines.length ? (
          <div>
            {visibleTradelines.length ? visibleTradelines.map((g) => {
              const used = usedTradelineKeys.has(g.key);
              return (
                <div
                  key={g.key}
                  className="tradeline-row"
                  style={used ? { opacity: 0.5, cursor: 'default' } : undefined}
                  title={used ? 'Already in dispute pipeline' : 'Send to Bureaus or Creditors'}
                >
                  <span style={{ width: 16, height: 16, display: 'inline-block' }} />
                  <div>
                    <div className="tradeline-row__name">
                      {g.sample.creditorName || 'Unknown creditor'}
                      {used ? <span style={{ marginLeft: 8, fontSize: 11, color: '#64748b', fontWeight: 500 }}>· already disputed</span> : null}
                    </div>
                    <div className="tradeline-row__sub">
                      {g.sample.accountNumber ? `Acct ${g.sample.accountNumber} · ` : ''}{g.sample.accountType || 'Unknown type'}{g.sample.status ? ` · ${g.sample.status}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {Array.from(g.bureaus).sort().map((b) => (
                      <span key={b} className={`tradeline-row__bureau tradeline-row__bureau--${b === 'EXPERIAN' ? 'EX' : b === 'EQUIFAX' ? 'EQ' : 'TU'}`}>
                        {b === 'EXPERIAN' ? 'EX' : b === 'EQUIFAX' ? 'EQ' : 'TU'}
                      </span>
                    ))}
                  </div>
                  <span className="tradeline-row__balance">{g.sample.balance != null ? `$${Number(g.sample.balance).toLocaleString()}` : '—'}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {!used && onPickTradeline ? (
                      <button type="button" onClick={(ev) => { ev.stopPropagation(); onPickTradeline(g.key); }} style={{ fontSize: 11, padding: '3px 8px', background: '#00c6fb', color: '#0f1929', border: 'none', borderRadius: 4, fontWeight: 700, cursor: 'pointer' }}>
                        → Bureaus
                      </button>
                    ) : null}
                    {!used && onPickTradelineForCreditors ? (
                      <button type="button" onClick={(ev) => { ev.stopPropagation(); onPickTradelineForCreditors(g.key); }} style={{ fontSize: 11, padding: '3px 8px', background: '#a855f7', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 700, cursor: 'pointer' }}>
                        → Creditors
                      </button>
                    ) : null}
                  </div>
                  <span className={g.sample.isNegative ? 'tradeline-row__neg' : ''} aria-hidden={!g.sample.isNegative}>
                    {g.sample.isNegative ? 'Negative' : ''}
                  </span>
                </div>
              );
            }) : (
              <div style={{ padding: '14px', color: '#64748b', fontSize: 13, textAlign: 'center' }}>
                {showOnlyNegative ? 'No negative accounts in this report. Uncheck "Negative only" to see all (including inquiries).' : 'No accounts parsed yet.'}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* BOTTOM — Ready to Print */}
      <div className="ready-print">
        <div className="ready-print__header">
          <div className="ready-print__title">
            Ready to Print
            <small>
              {items.length
                ? `${items.length} dispute item${items.length === 1 ? '' : 's'} on file for ${selectedClientLabel || 'this client'}`
                : 'Dispute items will land here as you save them on the Dispute tab.'}
            </small>
          </div>
          <div className="ready-print__actions">
            <button type="button" className="ready-print__btn ready-print__btn--ghost" onClick={onOpenBureaus} disabled={!items.length}>
              Generate bureau letters →
            </button>
            <button type="button" className="ready-print__btn ready-print__btn--primary" onClick={printAll} disabled={!items.length}>
              🖨 Print all ({items.length})
            </button>
          </div>
        </div>

        {selectedItems.size > 0 ? (
          <div className="ait-bulk">
            <strong>{selectedItems.size} selected</strong>
            <button type="button" className="ready-print__btn ready-print__btn--primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={printSelected}>
              🖨 Print selected
            </button>
            <button type="button" className="ready-print__btn ready-print__btn--danger" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={handleBulkDelete}>
              Remove
            </button>
            <button type="button" className="ready-print__btn ready-print__btn--ghost" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={clearItemSelection}>
              Clear
            </button>
          </div>
        ) : items.length ? (
          <div className="ait-bulk">
            <button type="button" className="ready-print__btn ready-print__btn--ghost" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={selectAllItems}>
              Select all
            </button>
            <span style={{ color: '#64748b', fontSize: '0.78rem' }}>Tip: select a subset to print or remove just those items.</span>
          </div>
        ) : null}

        {items.length ? (
          <table className="ait-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}></th>
                <th>Furnisher</th>
                <th>Account</th>
                <th>Type</th>
                <th>Balance</th>
                <th>Bureaus</th>
                <th>Round</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedItems.has(item.id)}
                      onChange={() => toggleItemSelect(item.id)}
                      aria-label={`Select ${item.furnisher}`}
                    />
                  </td>
                  <td>
                    <strong>{item.furnisher}</strong>
                    {item.reason ? <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: 2 }}>{item.reason}</div> : null}
                  </td>
                  <td>{item.accountNumber || '—'}</td>
                  <td>{(item.accountType || '').replace('_', ' ')}</td>
                  <td>{item.balance != null ? `$${Number(item.balance).toLocaleString()}` : '—'}</td>
                  <td>
                    <div className="ait-bureau-chips">
                      {item.disputeEquifax ? <span className="ait-bureau-chip ait-bureau-chip--EQ">EQ</span> : null}
                      {item.disputeExperian ? <span className="ait-bureau-chip ait-bureau-chip--EX">EX</span> : null}
                      {item.disputeTransunion ? <span className="ait-bureau-chip ait-bureau-chip--TU">TU</span> : null}
                    </div>
                  </td>
                  <td>Round {item.currentRound}</td>
                  <td><span className={`ait-status ait-status--${item.status}`}>{item.status.replace('_', ' ')}</span></td>
                  <td className="ait-row-actions">
                    <button type="button" onClick={() => handleDelete(item.id)} title="Remove">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="ait-empty">
            <strong>No items in the print list yet.</strong>
            <div>
              Head to the{' '}
              <button type="button" onClick={onGoToBureaus} style={{ background: 'transparent', border: 'none', color: '#00c6fb', textDecoration: 'underline', cursor: 'pointer', font: 'inherit', padding: 0 }}>Bureaus tab</button>
              {' '}or the{' '}
              <button type="button" onClick={onGoToCreditors} style={{ background: 'transparent', border: 'none', color: '#a855f7', textDecoration: 'underline', cursor: 'pointer', font: 'inherit', padding: 0 }}>Creditors tab</button>
              {' '}to add an account from the imported report.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
