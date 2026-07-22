import { useState, useEffect, useCallback, useMemo } from 'react';
import { ImportReportTab } from './ImportReportTab';
import { AddItemTab } from './AddItemTab';
import { BureausTab } from './BureausTab';
import { CreditorsTab } from './CreditorsTab';
import { TrackingTab } from './TrackingTab';
import { ResultsTab } from './ResultsTab';

export type DisputeItem = {
  id: string;
  clientId: string;
  furnisher: string;
  accountNumber: string | null;
  accountType: 'LATE_PAYMENT' | 'COLLECTION' | 'CHARGE_OFF' | 'INQUIRY' | 'OTHER';
  balance: number | null;
  dateAdded: string | null;
  disputeEquifax: boolean;
  disputeExperian: boolean;
  disputeTransunion: boolean;
  reason: string;
  customInstruction: string | null;
  currentRound: number;
  status: 'PENDING' | 'IN_DISPUTE' | 'DELETED' | 'UPDATED' | 'VERIFIED';
  createdAt: string;
  updatedAt: string;
  dueDate: string | null;
  client?: {
    id: string;
    user: {
      firstName: string;
      lastName: string;
      email: string;
    };
  };
  rounds?: DisputeRound[];
};

export type DisputeRound = {
  id: string;
  disputeItemId: string;
  roundNumber: number;
  sentDate: string;
  dueDate: string;
  status: string;
  notes: string | null;
  equifaxStatus: string | null;
  experianStatus: string | null;
  transunionStatus: string | null;
  createdAt: string;
};

export type Furnisher = {
  id: string;
  name: string;
  type: 'CREDITOR' | 'COLLECTOR' | 'BUREAU';
  address: string | null;
  isActive: boolean;
};

type Tab = 'import' | 'add' | 'bureaus' | 'creditors' | 'collectors' | 'respond' | 'tracking' | 'results';

interface DisputeManagerProps {
  token: string;
}

const API_BASE = (import.meta.env.VITE_API_URL ?? '').trim() || '';

export type ImportedTradeline = {
  id: string;
  creditorName: string;
  accountNumber: string | null;
  accountType: string | null;
  status: string | null;
  balance: number | null;
  isNegative: boolean;
  bureau: 'EXPERIAN' | 'EQUIFAX' | 'TRANSUNION';
  source?: 'credit_report' | 'analysis';
  issue?: string | null;
  reason?: string | null;
  priority?: string | null;
  dateOpened?: string | null;
  lastReported?: string | null;
};

export type TradelineIdentityInput = {
  creditorName?: string | null;
  furnisher?: string | null;
  accountNumber?: string | null;
};

export function tradelineIdentityKey(input: TradelineIdentityInput): string {
  const name = String(input.creditorName || input.furnisher || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  const account = String(input.accountNumber || '').toLowerCase();
  const digits = account.replace(/\D/g, '');
  const accountKey = digits.length >= 4
    ? `last4:${digits.slice(-4)}`
    : account.replace(/[^a-z0-9]+/g, '').slice(-10) || 'no-account';
  return `${name}|${accountKey}`;
}

type ReportDocument = {
  id: string;
  fileName?: string | null;
  type?: string | null;
  uploadedAt?: string | null;
  createdAt?: string | null;
  contentType?: string | null;
};

type SelectedClientContext = {
  documents?: ReportDocument[];
  creditReports?: Array<{
    id: string;
    bureau: 'EXPERIAN' | 'EQUIFAX' | 'TRANSUNION';
    pulledAt: string;
    tradelines?: Array<{
      id: string;
      creditorName?: string | null;
      accountNumber?: string | null;
      accountType?: string | null;
      status?: string | null;
      balance?: number | string | null;
      isNegative?: boolean | null;
    }>;
  }>;
  progress?: {
    analysis?: any;
  } | null;
};

const BUREAU_ALIASES: Record<string, ImportedTradeline['bureau']> = {
  equifax: 'EQUIFAX',
  efx: 'EQUIFAX',
  experian: 'EXPERIAN',
  xpn: 'EXPERIAN',
  transunion: 'TRANSUNION',
  trans: 'TRANSUNION',
  tu: 'TRANSUNION'
};

function toBureau(value: unknown): ImportedTradeline['bureau'] | null {
  const key = String(value || '').trim().toLowerCase().replace(/[^a-z]/g, '');
  if (key.includes('equifax')) return 'EQUIFAX';
  if (key.includes('experian')) return 'EXPERIAN';
  if (key.includes('transunion')) return 'TRANSUNION';
  return BUREAU_ALIASES[key] || null;
}

function toBureaus(value: unknown): ImportedTradeline['bureau'][] {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map(toBureau).filter(Boolean))) as ImportedTradeline['bureau'][];
  }
  if (typeof value === 'string' && value.trim()) {
    return Array.from(new Set(value.split(/[,\|/]+/).map(toBureau).filter(Boolean))) as ImportedTradeline['bureau'][];
  }
  return [];
}

function accountLooksNegative(item: any) {
  return !!item?.isNegative || !!item?.negative || /collection|charge.?off|late|derogatory|past due|negative/i.test(`${item?.status || ''} ${item?.accountType || ''} ${item?.category || ''} ${item?.type || ''}`);
}

function normalizeAccountType(value: unknown): string | null {
  const text = String(value || '').toLowerCase();
  if (text.includes('collection')) return 'COLLECTION';
  if (text.includes('charge')) return 'CHARGE_OFF';
  if (text.includes('late') || text.includes('past due')) return 'LATE_PAYMENT';
  if (text.includes('inquir')) return 'INQUIRY';
  return value ? String(value) : null;
}

function analysisAccountsToTradelines(analysis: any): ImportedTradeline[] {
  if (!analysis || typeof analysis !== 'object') return [];
  const rawAccounts = [
    ...(Array.isArray(analysis.negativeAccounts) ? analysis.negativeAccounts : []),
    ...(Array.isArray(analysis.derogatoryAccounts) ? analysis.derogatoryAccounts : []),
    ...(Array.isArray(analysis.accounts) ? analysis.accounts.filter(accountLooksNegative) : []),
    ...(Array.isArray(analysis.tradelines) ? analysis.tradelines.filter(accountLooksNegative) : []),
    ...(Array.isArray(analysis.disputeOpportunities) ? analysis.disputeOpportunities : [])
  ];

  const out: ImportedTradeline[] = [];
  rawAccounts.forEach((item, index) => {
    const bureaus = toBureaus(item?.bureaus || item?.bureau || item?.reportedBureaus);
    const reportBureaus = bureaus.length ? bureaus : (['EQUIFAX', 'EXPERIAN', 'TRANSUNION'] as ImportedTradeline['bureau'][]);
    const accountName = String(item?.accountName || item?.creditorName || item?.furnisher || item?.name || item?.title || 'Reported account');
    const accountNumber = item?.accountNumber || item?.account || item?.partialAccountNumber || null;
    reportBureaus.forEach((bureau) => {
      out.push({
        id: `analysis-${index}-${bureau}`,
        creditorName: accountName,
        accountNumber: accountNumber ? String(accountNumber) : null,
        accountType: normalizeAccountType(item?.accountType || item?.type || item?.category),
        status: item?.status || item?.reportingStatus || item?.accountStatus || 'Analysis negative',
        balance: item?.balance == null ? null : Number(item.balance),
        isNegative: true,
        bureau,
        source: 'analysis',
        issue: item?.issue || item?.description || item?.finding || null,
        reason: item?.reason || item?.recommendation || item?.recommendedAction || 'Review for inaccurate, incomplete, outdated, inconsistent, or unverifiable reporting.',
        priority: item?.priority || item?.severity || null,
        dateOpened: item?.dateOpened || item?.openedDate || item?.openDate || null,
        lastReported: item?.lastReported || item?.reportedDate || item?.dateReported || item?.updatedAt || null
      });
    });
  });
  return out;
}

function mergeTradelines(rows: ImportedTradeline[]): ImportedTradeline[] {
  const map = new Map<string, ImportedTradeline>();
  for (const row of rows) {
    const key = `${tradelineIdentityKey(row)}|${row.bureau}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
      continue;
    }
    map.set(key, {
      ...existing,
      ...row,
      source: existing.source === 'credit_report' ? existing.source : row.source,
      issue: existing.issue || row.issue,
      reason: existing.reason || row.reason,
      priority: existing.priority || row.priority
    });
  }
  return Array.from(map.values());
}

export function DisputeManager({ token }: DisputeManagerProps) {
  const [activeTab, setActiveTab] = useState<Tab>('add');
  const [items, setItems] = useState<DisputeItem[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [clients, setClients] = useState<Array<{ id: string; user: { firstName: string; lastName: string; email: string } }>>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tradelines, setTradelines] = useState<ImportedTradeline[]>([]);
  const [reportDocuments, setReportDocuments] = useState<ReportDocument[]>([]);
  const [openingReportId, setOpeningReportId] = useState<string | null>(null);
  const [bureausPrefillKey, setBureausPrefillKey] = useState<string | null>(null);
  const [creditorsPrefillKey, setCreditorsPrefillKey] = useState<string | null>(null);
  const [pendingBureausKeys, setPendingBureausKeys] = useState<string[]>([]);
  const [pendingCreditorsKeys, setPendingCreditorsKeys] = useState<string[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/api/clients`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => {
        const nextClients = data.clients || [];
        setClients(nextClients);
        if (!selectedClientId && nextClients[0]?.id) setSelectedClientId(nextClients[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load clients'));
  }, [token]);

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId) || null,
    [clients, selectedClientId]
  );

  const selectedClientLabel = selectedClient
    ? `${selectedClient.user.firstName} ${selectedClient.user.lastName} (${selectedClient.user.email})`
    : '';

  const fetchItems = useCallback(async () => {
    if (!selectedClientId) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/disputes/items?clientId=${encodeURIComponent(selectedClientId)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch items');
      const data = await response.json();
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching items');
    } finally {
      setLoading(false);
    }
  }, [token, selectedClientId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    setSelectedItemIds([]);
  }, [selectedClientId]);

  const fetchTradelines = useCallback(async () => {
    if (!selectedClientId) {
      setTradelines([]);
      setReportDocuments([]);
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/api/clients/${selectedClientId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) { setTradelines([]); setReportDocuments([]); return; }
      const data = await response.json() as { client?: SelectedClientContext };
      const client = data?.client || {};
      const reports = client.creditReports || [];
      const flat: ImportedTradeline[] = [];
      for (const r of reports) {
        for (const t of (r.tradelines || [])) {
          flat.push({
            id: t.id,
            creditorName: t.creditorName || 'Unknown creditor',
            accountNumber: t.accountNumber || null,
            accountType: t.accountType || null,
            status: t.status || null,
            balance: t.balance == null ? null : Number(t.balance),
            isNegative: !!t.isNegative,
            bureau: r.bureau,
            source: 'credit_report'
          });
        }
      }
      const analysisRows = analysisAccountsToTradelines(client.progress?.analysis);
      setTradelines(mergeTradelines([...flat, ...analysisRows]));
      setReportDocuments((client.documents || []).filter((doc) => {
        const type = String(doc.type || '').toUpperCase();
        const name = String(doc.fileName || '').toLowerCase();
        return type === 'CREDIT_REPORT' || name.includes('credit') || name.includes('report');
      }));
    } catch {
      setTradelines([]);
      setReportDocuments([]);
    }
  }, [token, selectedClientId]);

  useEffect(() => {
    fetchTradelines();
  }, [fetchTradelines]);

  const handleItemCreated = () => {
    fetchItems();
    setActiveTab('add');
  };

  const handleAddTradelinesToBureaus = (keys: string[]) => {
    if (!keys.length) return;
    setPendingBureausKeys((p) => [...p, ...keys.filter((k) => !p.includes(k))]);
    setActiveTab('bureaus');
  };

  const handleAddTradelinesToCreditors = (keys: string[]) => {
    if (!keys.length) return;
    setPendingCreditorsKeys((p) => [...p, ...keys.filter((k) => !p.includes(k))]);
    setActiveTab('creditors');
  };

  const handleImportComplete = () => {
    fetchItems();
    setActiveTab('add');
    // Tradelines populate via the background extract+analysis pipeline.
    // Poll a few times so the Add Items tab fills in as the parse finishes.
    let tries = 0;
    const poll = async () => {
      tries++;
      await fetchTradelines();
      if (tries < 15) setTimeout(poll, 4000);
    };
    setTimeout(poll, 3000);
  };

  const openReportDocument = async (doc: ReportDocument) => {
    if (!selectedClientId) return;
    setOpeningReportId(doc.id);
    try {
      const response = await fetch(`${API_BASE}/api/clients/${selectedClientId}/documents/${doc.id}/print`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || `Could not open report: ${response.status}`);
      if (payload.url) {
        window.open(payload.url, '_blank', 'noopener,noreferrer');
        return;
      }
      if (payload.content) {
        const w = window.open('', '_blank', 'noopener,noreferrer');
        if (!w) return;
        const isHtml = /html/i.test(doc.contentType || doc.fileName || '');
        w.document.write(isHtml ? String(payload.content) : `<pre style="white-space:pre-wrap;font-family:Arial,sans-serif;padding:24px;">${String(payload.content).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c])}</pre>`);
        w.document.close();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not open report');
    } finally {
      setOpeningReportId(null);
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'import', label: 'ADD REPORT' },
    { id: 'add', label: 'ADD DISPUTE' },
    { id: 'bureaus', label: 'BUREAU DISPUTE' },
    { id: 'creditors', label: 'CREDITORS' },
    { id: 'collectors', label: 'COLLECTORS' },
    { id: 'respond', label: 'RESPOND' },
    { id: 'tracking', label: 'TRACKING' },
    { id: 'results', label: 'RESULTS' }
  ];

  return (
    <div className="dispute-manager">
      <style>{`
        .dispute-manager {
          --primary: #3b82f6;
          --primary-dark: #2563eb;
          --success: #22c55e;
          --warning: #eab308;
          --danger: #ef4444;
          --bg-primary: #ffffff;
          --bg-secondary: #f8fafc;
          --bg-dark: #1e293b;
          --border: #e2e8f0;
          --text-primary: #1e293b;
          --text-secondary: #64748b;
        }

        .dm-tabs {
          display: flex;
          gap: 0.25rem;
          border-bottom: 2px solid var(--border);
          margin-bottom: 1.5rem;
          background: var(--bg-secondary);
          padding: 0.5rem 0.5rem 0;
          border-radius: 8px 8px 0 0;
          max-width: 100%;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        .dm-tab {
          flex: 0 0 auto;
          padding: 0.75rem 1.25rem;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          font-weight: 500;
          font-size: 0.875rem;
          cursor: pointer;
          border-radius: 6px 6px 0 0;
          transition: all 0.2s;
          text-transform: uppercase;
          letter-spacing: 0.025em;
        }

        .dm-tab:hover {
          color: var(--text-primary);
          background: rgba(59, 130, 246, 0.1);
        }

        .dm-tab.active {
          background: var(--primary);
          color: white;
        }

        .dm-content {
          background: var(--bg-primary);
          border-radius: 8px;
          min-height: 400px;
        }

        .dm-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 3rem;
          color: var(--text-secondary);
        }

        .dm-error {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #991b1b;
          padding: 1rem;
          border-radius: 6px;
          margin: 1rem;
        }

        .dm-client-shell {
          display:grid;
          gap:1rem;
          margin-bottom:1rem;
        }

        .dm-client-bar {
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:1rem;
          padding:1rem 1.1rem;
          background:linear-gradient(180deg,#ffffff,#f8fafc);
          border:1px solid #e2e8f0;
          border-radius:12px;
          flex-wrap:wrap;
        }

        .dm-client-copy strong { display:block; color:#0f172a; font-size:1rem; }
        .dm-client-copy span { color:#64748b; font-size:.875rem; }
        .dm-client-copy { min-width:0; }
        .dm-report-links { display:flex; flex-wrap:wrap; gap:.45rem; align-items:center; }
        .dm-report-link {
          border:1px solid #bfdbfe;
          background:#eff6ff;
          color:#1d4ed8;
          border-radius:7px;
          padding:.45rem .65rem;
          font-size:.78rem;
          font-weight:700;
          cursor:pointer;
          max-width:260px;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }
        .dm-report-link:disabled { opacity:.6; cursor:wait; }

        .dm-client-picker {
          min-width:320px;
          max-width:100%;
          padding:0.75rem 1rem;
          border:1px solid #d1d5db;
          border-radius:10px;
          background:white;
          font-size:.95rem;
        }

        .dm-empty-client {
          padding:2rem;
          text-align:center;
          color:#64748b;
          background:#fff;
          border:1px dashed #cbd5e1;
          border-radius:12px;
        }
        .dm-workflow-rail {
          display:grid;
          grid-template-columns:repeat(4,minmax(0,1fr));
          gap:.65rem;
        }
        .dm-workflow-step {
          padding:.8rem .9rem;
          border:1px solid #e2e8f0;
          background:#fff;
          border-radius:8px;
          color:#334155;
          font-size:.8rem;
        }
        .dm-workflow-step strong { display:block; color:#0f172a; font-size:.9rem; margin-bottom:2px; }
        .dm-placeholder {
          padding:1.5rem;
          display:grid;
          gap:1rem;
        }
        .dm-placeholder-card {
          border:1px solid #e2e8f0;
          background:#fff;
          border-radius:8px;
          padding:1.1rem;
        }
        .dm-placeholder-card h3 { margin:0 0 .35rem; color:#0f172a; font-size:1.05rem; }
        .dm-placeholder-card p { margin:0; color:#64748b; font-size:.9rem; line-height:1.5; }
        .dm-action-grid {
          display:grid;
          grid-template-columns:repeat(3,minmax(0,1fr));
          gap:.75rem;
        }
        .dm-action-tile {
          text-align:left;
          border:1px solid #dbeafe;
          background:#eff6ff;
          color:#1e40af;
          border-radius:8px;
          padding:.85rem;
          font-weight:700;
          cursor:pointer;
        }
        @media (max-width: 720px) {
          .dm-tabs { padding-bottom:0.5rem; border-radius:8px; }
          .dm-tab { padding:0.65rem 1rem; }
          .dm-client-bar { align-items:stretch; }
          .dm-client-picker { width:100%; min-width:0; }
          .dm-workflow-rail, .dm-action-grid { grid-template-columns:1fr; }
        }
      `}</style>

      <div className="dm-client-shell">
        <div className="dm-client-bar">
          <div className="dm-client-copy">
            <strong>Selected client</strong>
            <span>This client context stays active across import, add items, bureaus, tracking, and results.</span>
          </div>
          <select className="dm-client-picker" value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)}>
            <option value="">Select a client...</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.user.firstName} {client.user.lastName} ({client.user.email})
              </option>
            ))}
          </select>
          <div className="dm-report-links">
            {reportDocuments.length ? reportDocuments.slice(0, 3).map((doc) => (
              <button
                key={doc.id}
                type="button"
                className="dm-report-link"
                onClick={() => openReportDocument(doc)}
                disabled={openingReportId === doc.id}
                title={doc.fileName || 'Credit report'}
              >
                {openingReportId === doc.id ? 'Opening...' : `Report: ${doc.fileName || doc.id}`}
              </button>
            )) : <span style={{ color: '#94a3b8', fontSize: '.78rem' }}>No uploaded credit report document found.</span>}
          </div>
        </div>
        <div className="dm-workflow-rail" aria-label="Dispute workflow">
          <div className="dm-workflow-step"><strong>1. Add report</strong>Import or upload the client credit report.</div>
          <div className="dm-workflow-step"><strong>2. Add dispute</strong>Review negative tradelines from analysis.</div>
          <div className="dm-workflow-step"><strong>3. Build letters</strong>Create bureau, creditor, collector, or response work.</div>
          <div className="dm-workflow-step"><strong>4. Track results</strong>Monitor due dates, responses, and outcomes.</div>
        </div>
      </div>

      <div className="dm-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`dm-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="dm-content">
        {!selectedClientId && !loading && !error && <div className="dm-empty-client">Select a client above to begin dispute operations.</div>}
        {loading && <div className="dm-loading">Loading dispute data...</div>}
        
        {error && (
          <div className="dm-error">
            Error: {error}
            <button onClick={fetchItems} style={{ marginLeft: '1rem' }}>Retry</button>
          </div>
        )}

        {!loading && !error && !!selectedClientId && (
          <>
            {activeTab === 'import' && (
              <ImportReportTab 
                token={token} 
                selectedClientId={selectedClientId}
                selectedClientLabel={selectedClientLabel}
                onImportComplete={handleImportComplete}
              />
            )}
            
            {activeTab === 'add' && (
              <AddItemTab
                token={token}
                items={items}
                selectedClientId={selectedClientId}
                selectedClientLabel={selectedClientLabel}
                onItemCreated={handleItemCreated}
                onItemsChange={fetchItems}
                selectedItemIds={selectedItemIds}
                onSelectionChange={setSelectedItemIds}
                onOpenBureaus={() => setActiveTab('bureaus')}
                tradelines={tradelines}
                onRefreshTradelines={fetchTradelines}
                onGoToBureaus={() => setActiveTab('bureaus')}
                onGoToCreditors={() => setActiveTab('creditors')}
                onAddTradelinesToBureaus={handleAddTradelinesToBureaus}
                onAddTradelinesToCreditors={handleAddTradelinesToCreditors}
              />
            )}

            {activeTab === 'bureaus' && (
              <BureausTab
                token={token}
                selectedClientId={selectedClientId}
                selectedClientLabel={selectedClientLabel}
                clientName={selectedClient ? `${selectedClient.user.firstName} ${selectedClient.user.lastName}` : undefined}
                items={items}
                tradelines={tradelines}
                prefillKey={bureausPrefillKey}
                onConsumePrefill={() => setBureausPrefillKey(null)}
                pendingTradelineKeys={pendingBureausKeys}
                onConsumePendingKeys={() => setPendingBureausKeys([])}
                onItemCreated={handleItemCreated}
                onBackToItems={() => setActiveTab('add')}
                onOpenTracking={() => setActiveTab('tracking')}
              />
            )}

            {activeTab === 'creditors' && (
              <CreditorsTab
                token={token}
                selectedClientId={selectedClientId}
                selectedClientLabel={selectedClientLabel}
                clientName={selectedClient ? `${selectedClient.user.firstName} ${selectedClient.user.lastName}` : undefined}
                items={items}
                tradelines={tradelines}
                prefillKey={creditorsPrefillKey}
                onConsumePrefill={() => setCreditorsPrefillKey(null)}
                pendingTradelineKeys={pendingCreditorsKeys}
                onConsumePendingKeys={() => setPendingCreditorsKeys([])}
                onItemCreated={handleItemCreated}
                onBackToItems={() => setActiveTab('add')}
                onOpenTracking={() => setActiveTab('tracking')}
              />
            )}

            {activeTab === 'collectors' && (
              <CreditorsTab
                token={token}
                selectedClientId={selectedClientId}
                selectedClientLabel={selectedClientLabel}
                clientName={selectedClient ? `${selectedClient.user.firstName} ${selectedClient.user.lastName}` : undefined}
                items={items}
                tradelines={tradelines.filter((t) => `${t.accountType || ''} ${t.status || ''} ${t.creditorName || ''}`.toLowerCase().includes('collect'))}
                prefillKey={creditorsPrefillKey}
                onConsumePrefill={() => setCreditorsPrefillKey(null)}
                pendingTradelineKeys={pendingCreditorsKeys}
                onConsumePendingKeys={() => setPendingCreditorsKeys([])}
                onItemCreated={handleItemCreated}
                onBackToItems={() => setActiveTab('add')}
                onOpenTracking={() => setActiveTab('tracking')}
              />
            )}

            {activeTab === 'respond' && (
              <div className="dm-placeholder">
                <div className="dm-placeholder-card">
                  <h3>Respond</h3>
                  <p>Use this desk when a bureau, creditor, or collector response comes in. Start from Tracking to find response-due items, then update Results after the response is reviewed.</p>
                </div>
                <div className="dm-action-grid">
                  <button type="button" className="dm-action-tile" onClick={() => setActiveTab('tracking')}>Open response queue</button>
                  <button type="button" className="dm-action-tile" onClick={() => setActiveTab('results')}>Update results</button>
                  <button type="button" className="dm-action-tile" onClick={() => setActiveTab('bureaus')}>Build bureau reply</button>
                </div>
              </div>
            )}
            
            {activeTab === 'tracking' && (
              <TrackingTab 
                token={token} 
                items={items}
                onItemsChange={fetchItems}
              />
            )}
            
            {activeTab === 'results' && (
              <ResultsTab 
                token={token} 
                items={items}
                onItemsChange={fetchItems}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
