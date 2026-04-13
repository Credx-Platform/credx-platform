import { useState } from 'react';
import type { DisputeItem } from './DisputeManager';

interface ResultsTabProps {
  token: string;
  items: DisputeItem[];
  onItemsChange: () => void;
}

const API_BASE = (import.meta.env.VITE_API_URL ?? '').trim() || '';

type BureauStatus = 'PENDING' | 'DELETED' | 'UPDATED' | 'VERIFIED';

export function ResultsTab({ token, items, onItemsChange }: ResultsTabProps) {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [updating, setUpdating] = useState(false);
  const [viewMode, setViewMode] = useState<'results' | 'progress'>('results');

  // Items that are in dispute or have results
  const resultsItems = items.filter(i => 
    i.status === 'IN_DISPUTE' || 
    i.status === 'DELETED' || 
    i.status === 'UPDATED' || 
    i.status === 'VERIFIED'
  );

  const handleCheckAll = (checked: boolean) => {
    if (checked) {
      setSelectedItems(new Set(resultsItems.map(i => i.id)));
    } else {
      setSelectedItems(new Set());
    }
  };

  const handleCheckItem = (id: string, checked: boolean) => {
    const newSet = new Set(selectedItems);
    if (checked) newSet.add(id);
    else newSet.delete(id);
    setSelectedItems(newSet);
  };

  const handleUpdateStatus = async (itemId: string, status: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/disputes/items/${itemId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status })
      });

      if (!response.ok) throw new Error('Update failed');
      onItemsChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Update failed');
    }
  };

  const handleBulkEmail = () => {
    if (selectedItems.size === 0) return;
    alert(`Preparing to email deletion results for ${selectedItems.size} items...`);
  };

  const handleUpdateScore = () => {
    if (selectedItems.size === 0) return;
    alert(`Updating score history for ${selectedItems.size} items...`);
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, { bg: string; text: string }> = {
      PENDING: { bg: '#f3f4f6', text: '#6b7280' },
      IN_DISPUTE: { bg: '#dbeafe', text: '#1e40af' },
      DELETED: { bg: '#d1fae5', text: '#065f46' },
      UPDATED: { bg: '#fef3c7', text: '#92400e' },
      VERIFIED: { bg: '#fee2e2', text: '#991b1b' }
    };
    return colors[status] || colors.PENDING;
  };

  const bureauColors: Record<BureauStatus, { bg: string; text: string }> = {
    PENDING: { bg: '#f3f4f6', text: '#6b7280' },
    DELETED: { bg: '#d1fae5', text: '#065f46' },
    UPDATED: { bg: '#fef3c7', text: '#92400e' },
    VERIFIED: { bg: '#fee2e2', text: '#991b1b' }
  };

  const getBureauStatusBadge = (status: BureauStatus) => {
    const colors = bureauColors[status] || bureauColors.PENDING;
    return (
      <span style={{
        background: colors.bg,
        color: colors.text,
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '0.625rem',
        fontWeight: 600,
        textTransform: 'uppercase'
      }}>
        {status}
      </span>
    );
  };

  return (
    <div className="results-tab">
      <style>{`
        .results-tab {
          padding: 1.5rem;
        }

        .results-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .results-header h3 {
          font-size: 1.25rem;
          color: #1e293b;
        }

        .results-actions {
          display: flex;
          gap: 0.75rem;
          align-items: center;
          flex-wrap: wrap;
        }

        .btn {
          padding: 0.625rem 1.25rem;
          border: none;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          font-size: 0.875rem;
          transition: all 0.2s;
        }

        .btn-success {
          background: #22c55e;
          color: white;
        }

        .btn-success:hover {
          background: #16a34a;
        }

        .btn-warning {
          background: #f59e0b;
          color: white;
        }

        .btn-warning:hover {
          background: #d97706;
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .view-toggle {
          display: flex;
          background: #f1f5f9;
          border-radius: 6px;
          padding: 0.25rem;
        }

        .view-toggle button {
          padding: 0.5rem 1rem;
          border: none;
          background: transparent;
          cursor: pointer;
          border-radius: 4px;
          font-size: 0.875rem;
        }

        .view-toggle button.active {
          background: white;
          color: #3b82f6;
          font-weight: 500;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .stats-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .stat-card {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 1rem;
          text-align: center;
        }

        .stat-card .number {
          font-size: 1.5rem;
          font-weight: 700;
          color: #1e293b;
        }

        .stat-card .label {
          font-size: 0.75rem;
          color: #64748b;
          margin-top: 0.25rem;
        }

        .stat-card.success {
          border-color: #bbf7d0;
          background: #f0fdf4;
        }

        .stat-card.success .number {
          color: #16a34a;
        }

        .results-table-container {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          overflow: hidden;
        }

        .results-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
        }

        .results-table th {
          background: #f8fafc;
          padding: 0.75rem;
          text-align: left;
          font-weight: 600;
          color: #374151;
          border-bottom: 1px solid #e2e8f0;
        }

        .results-table td {
          padding: 0.75rem;
          border-bottom: 1px solid #f1f5f9;
        }

        .results-table tr:hover {
          background: #f8fafc;
        }

        .status-badge {
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .bureau-status-select {
          padding: 0.25rem;
          font-size: 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          min-width: 80px;
        }

        .empty-state {
          text-align: center;
          padding: 3rem;
          color: #64748b;
        }

        .progress-report {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 2rem;
          text-align: center;
        }

        .progress-report h4 {
          margin-bottom: 1rem;
          color: #1e293b;
        }

        .progress-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 1.5rem;
          margin-top: 1.5rem;
        }

        .progress-stat {
          background: white;
          border-radius: 8px;
          padding: 1.5rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .progress-stat .value {
          font-size: 2rem;
          font-weight: 700;
          color: #3b82f6;
        }

        .progress-stat .label {
          font-size: 0.875rem;
          color: #64748b;
          margin-top: 0.5rem;
        }

        .checkbox-col {
          width: 40px;
        }

        .bulk-actions {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.75rem;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
        }
      `}</style>

      <div className="results-header">
        <h3>Dispute Results</h3>
        <div className="results-actions">
          <button 
            className="btn btn-success" 
            onClick={handleBulkEmail}
            disabled={updating || selectedItems.size === 0}
          >
            Email Deletion Results
          </button>
          <button 
            className="btn btn-warning" 
            onClick={handleUpdateScore}
            disabled={updating || selectedItems.size === 0}
          >
            Update Score/History
          </button>
          <div className="view-toggle">
            <button 
              className={viewMode === 'results' ? 'active' : ''} 
              onClick={() => setViewMode('results')}
            >
              Results
            </button>
            <button 
              className={viewMode === 'progress' ? 'active' : ''} 
              onClick={() => setViewMode('progress')}
            >
              Progress Report
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'results' ? (
        <>
          <div className="stats-row">
            <div className="stat-card success">
              <div className="number">
                {resultsItems.filter(i => i.status === 'DELETED').length}
              </div>
              <div className="label">Deleted</div>
            </div>
            <div className="stat-card">
              <div className="number">
                {resultsItems.filter(i => i.status === 'UPDATED').length}
              </div>
              <div className="label">Updated</div>
            </div>
            <div className="stat-card">
              <div className="number">
                {resultsItems.filter(i => i.status === 'VERIFIED').length}
              </div>
              <div className="label">Verified</div>
            </div>
            <div className="stat-card">
              <div className="number">
                {resultsItems.filter(i => i.status === 'IN_DISPUTE').length}
              </div>
              <div className="label">In Dispute</div>
            </div>
          </div>

          <div className="results-table-container">
            {selectedItems.size > 0 && (
              <div className="bulk-actions">
                <span>{selectedItems.size} selected</span>
              </div>
            )}

            <table className="results-table">
              <thead>
                <tr>
                  <th className="checkbox-col">
                    <input
                      type="checkbox"
                      checked={selectedItems.size === resultsItems.length && resultsItems.length > 0}
                      onChange={(e) => handleCheckAll(e.target.checked)}
                    />
                  </th>
                  <th>Furnisher</th>
                  <th>Account #</th>
                  <th>Type</th>
                  <th>EFX Status</th>
                  <th>XPN Status</th>
                  <th>TU Status</th>
                  <th>Overall</th>
                </tr>
              </thead>
              <tbody>
                {resultsItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="empty-state">
                      No results to display. Process disputes first.
                    </td>
                  </tr>
                ) : (
                  resultsItems.map(item => {
                    const statusColors = getStatusColor(item.status);
                    return (
                      <tr key={item.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedItems.has(item.id)}
                            onChange={(e) => handleCheckItem(item.id, e.target.checked)}
                          />
                        </td>
                        <td>{item.furnisher}</td>
                        <td>{item.accountNumber || '-'}</td>
                        <td>{item.accountType.replace('_', ' ')}</td>
                        <td>
                          <select 
                            className="bureau-status-select"
                            value={item.disputeEquifax ? 'PENDING' : 'PENDING'}
                            onChange={(e) => {}}
                          >
                            <option value="PENDING">Pending</option>
                            <option value="DELETED">Deleted</option>
                            <option value="UPDATED">Updated</option>
                            <option value="VERIFIED">Verified</option>
                          </select>
                        </td>
                        <td>
                          <select 
                            className="bureau-status-select"
                            value={item.disputeExperian ? 'PENDING' : 'PENDING'}
                            onChange={(e) => {}}
                          >
                            <option value="PENDING">Pending</option>
                            <option value="DELETED">Deleted</option>
                            <option value="UPDATED">Updated</option>
                            <option value="VERIFIED">Verified</option>
                          </select>
                        </td>
                        <td>
                          <select 
                            className="bureau-status-select"
                            value={item.disputeTransunion ? 'PENDING' : 'PENDING'}
                            onChange={(e) => {}}
                          >
                            <option value="PENDING">Pending</option>
                            <option value="DELETED">Deleted</option>
                            <option value="UPDATED">Updated</option>
                            <option value="VERIFIED">Verified</option>
                          </select>
                        </td>
                        <td>
                          <span 
                            className="status-badge"
                            style={{ 
                              background: statusColors.bg, 
                              color: statusColors.text 
                            }}
                          >
                            {item.status.replace('_', ' ')}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="progress-report">
          <h4>📊 Client Progress Report</h4>
          <p>Overview of dispute outcomes and credit improvement</p>
          
          <div className="progress-stats">
            <div className="progress-stat">
              <div className="value">
                {Math.round((resultsItems.filter(i => i.status === 'DELETED').length / Math.max(resultsItems.length, 1)) * 100)}%
              </div>
              <div className="label">Deletion Rate</div>
            </div>
            <div className="progress-stat">
              <div className="value">{resultsItems.length}</div>
              <div className="label">Total Disputed</div>
            </div>
            <div className="progress-stat">
              <div className="value">
                {resultsItems.filter(i => i.status === 'DELETED').length}
              </div>
              <div className="label">Successfully Deleted</div>
            </div>
            <div className="progress-stat">
              <div className="value">
                {resultsItems.filter(i => i.status === 'IN_DISPUTE').length}
              </div>
              <div className="label">Still In Dispute</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
