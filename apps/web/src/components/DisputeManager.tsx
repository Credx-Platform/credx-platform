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
};

export function DisputeManager({ token }: DisputeManagerProps) {
  const [activeTab, setActiveTab] = useState<Tab>('add');
  const [items, setItems] = useState<DisputeItem[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [clients, setClients] = useState<Array<{ id: string; user: { firstName: string; lastName: string; email: string } }>>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tradelines, setTradelines] = useState<ImportedTradeline[]>([]);
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
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/api/clients/${selectedClientId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) { setTradelines([]); return; }
      const data = await response.json();
      const reports = data?.client?.creditReports || [];
      const flat: ImportedTradeline[] = [];
      for (const r of reports) {
        for (const t of (r.tradelines || [])) {
          flat.push({
            id: t.id,
            creditorName: t.creditorName,
            accountNumber: t.accountNumber,
            accountType: t.accountType,
            status: t.status,
            balance: t.balance == null ? null : Number(t.balance),
            isNegative: !!t.isNegative,
            bureau: r.bureau
          });
        }
      }
      setTradelines(flat);
    } catch {
      setTradelines([]);
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
