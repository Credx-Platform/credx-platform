import { useState, useEffect, useCallback } from 'react';
import { ImportReportTab } from './ImportReportTab';
import { AddItemTab } from './AddItemTab';
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

type Tab = 'import' | 'add' | 'tracking' | 'results';

interface DisputeManagerProps {
  token: string;
}

const API_BASE = (import.meta.env.VITE_API_URL ?? '').trim() || '';

export function DisputeManager({ token }: DisputeManagerProps) {
  const [activeTab, setActiveTab] = useState<Tab>('add');
  const [items, setItems] = useState<DisputeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/disputes/items`, {
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
  }, [token]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

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
      `}</style>

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
        {loading && <div className="dm-loading">Loading dispute data...</div>}
        
        {error && (
          <div className="dm-error">
            Error: {error}
            <button onClick={fetchItems} style={{ marginLeft: '1rem' }}>Retry</button>
          </div>
        )}

        {!loading && !error && (
          <>
            {activeTab === 'import' && (
              <ImportReportTab 
                token={token} 
                onImportComplete={handleImportComplete}
              />
            )}
            
            {activeTab === 'add' && (
              <AddItemTab 
                token={token} 
                items={items}
                onItemCreated={handleItemCreated}
                onItemsChange={fetchItems}
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
