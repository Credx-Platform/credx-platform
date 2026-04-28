import { useState, useEffect, useCallback, useMemo } from 'react';
import { ImportReportTab } from './ImportReportTab';
import { AddItemTab } from './AddItemTab';
import { BureausTab } from './BureausTab';
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

type Tab = 'import' | 'add' | 'bureaus' | 'tracking' | 'results';

interface DisputeManagerProps {
  token: string;
}

const API_BASE = (import.meta.env.VITE_API_URL ?? '').trim() || '';

export function DisputeManager({ token }: DisputeManagerProps) {
  const [activeTab, setActiveTab] = useState<Tab>('add');
  const [items, setItems] = useState<DisputeItem[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [clients, setClients] = useState<Array<{ id: string; user: { firstName: string; lastName: string; email: string } }>>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleItemCreated = () => {
    fetchItems();
    setActiveTab('tracking');
  };

  const handleImportComplete = () => {
    fetchItems();
    setActiveTab('add');
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'import', label: 'IMPORT REPORT' },
    { id: 'add', label: 'ADD ITEM' },
    { id: 'bureaus', label: 'BUREAUS' },
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
        }

        .dm-tab {
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

        .dm-client-picker {
          min-width:320px;
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
              />
            )}

            {activeTab === 'bureaus' && (
              <BureausTab
                items={items}
                selectedItemIds={selectedItemIds}
                onBackToItems={() => setActiveTab('add')}
                onOpenTracking={() => setActiveTab('tracking')}
              />
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
