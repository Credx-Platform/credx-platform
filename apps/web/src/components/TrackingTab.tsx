import { useState } from 'react';
import type { DisputeItem } from './DisputeManager';

interface TrackingTabProps {
  token: string;
  items: DisputeItem[];
  onItemsChange: () => void;
}

const API_BASE = (import.meta.env.VITE_API_URL ?? '').trim() || '';

export function TrackingTab({ token, items, onItemsChange }: TrackingTabProps) {
  const [viewMode, setViewMode] = useState<'current' | 'archive'>('current');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [updating, setUpdating] = useState(false);

  const currentItems = items.filter(i => i.status === 'IN_DISPUTE' || i.status === 'PENDING');
  const archiveItems = items.filter(i => i.status === 'DELETED' || i.status === 'VERIFIED');
  const displayItems = viewMode === 'current' ? currentItems : archiveItems;

  const handleCheckAll = (checked: boolean) => {
    if (checked) {
      setSelectedItems(new Set(displayItems.map(i => i.id)));
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

  const getDaysOverdue = (dueDate: string | null) => {
    if (!dueDate) return null;
    const due = new Date(dueDate);
    const now = new Date();
    const diff = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  };

  const isOverdue = (dueDate: string | null) => {
    const days = getDaysOverdue(dueDate);
    return days !== null && days > 30;
  };

  const handleArchiveRound = async () => {
    if (selectedItems.size === 0) return;
    setUpdating(true);
    try {
      // Archive logic here
      onItemsChange();
      setSelectedItems(new Set());
    } finally {
      setUpdating(false);
    }
  };

  const handleResend = async () => {
    if (selectedItems.size === 0) return;
    setUpdating(true);
    try {
      // Resend logic here
      alert(`Resending ${selectedItems.size} items`);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="tracking-tab">
      <style>{`
        .tracking-tab {
          padding: 1.5rem;
        }

        .tracking-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .tracking-header h3 {
          font-size: 1.25rem;
          color: #1e293b;
        }

        .tracking-actions {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        .btn {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          font-size: 0.875rem;
          transition: all 0.2s;
        }

        .btn-warning {
          background: #f59e0b;
          color: white;
        }

        .btn-warning:hover {
          background: #d97706;
        }

        .btn-info {
          background: #0ea5e9;
          color: white;
        }

        .btn-info:hover {
          background: #0284c7;
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

        .tracking-table-container {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          overflow: hidden;
        }

        .tracking-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
        }

        .tracking-table th {
          background: #f8fafc;
          padding: 0.75rem;
          text-align: left;
          font-weight: 600;
          color: #374151;
          border-bottom: 1px solid #e2e8f0;
        }

        .tracking-table td {
          padding: 0.75rem;
          border-bottom: 1px solid #f1f5f9;
        }

        .tracking-table tr:hover {
          background: #f8fafc;
        }

        .overdue {
          color: #dc2626;
          font-weight: 600;
        }

        .due-soon {
          color: #d97706;
        }

        .status-badge {
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .status-pending {
          background: #fef3c7;
          color: #92400e;
        }

        .status-in-dispute {
          background: #dbeafe;
          color: #1e40af;
        }

        .bureau-tag {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 4px;
          font-size: 0.625rem;
          font-weight: 700;
          margin-right: 4px;
        }

        .bureau-efx {
          background: #ddd6fe;
          color: #5b21b6;
        }

        .bureau-xpn {
          background: #bfdbfe;
          color: #1e40af;
        }

        .bureau-tu {
          background: #bbf7d0;
          color: #166534;
        }

        .round-badge {
          background: #1e293b;
          color: white;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .empty-state {
          text-align: center;
          padding: 3rem;
          color: #64748b;
        }

        .quick-actions {
          display: flex;
          gap: 0.5rem;
          padding: 0.75rem;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
        }

        .quick-actions button {
          padding: 0.375rem 0.75rem;
          font-size: 0.75rem;
        }

        .stats-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
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

        .stat-card.overdue-stat {
          border-color: #fecaca;
          background: #fef2f2;
        }

        .stat-card.overdue-stat .number {
          color: #dc2626;
        }
      `}</style>

      <div className="tracking-header">
        <h3>Dispute Tracking</h3>
        <div className="tracking-actions">
          <button className="btn btn-warning" onClick={handleArchiveRound} disabled={updating || selectedItems.size === 0}>
            Archive Round
          </button>
          <button className="btn btn-info" onClick={handleResend} disabled={updating || selectedItems.size === 0}>
            Re-Send
          </button>
          <div className="view-toggle">
            <button 
              className={viewMode === 'current' ? 'active' : ''} 
              onClick={() => setViewMode('current')}
            >
              Current
            </button>
            <button 
              className={viewMode === 'archive' ? 'active' : ''} 
              onClick={() => setViewMode('archive')}
            >
              Archive
            </button>
          </div>
        </div>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="number">{currentItems.length}</div>
          <div className="label">Active Disputes</div>
        </div>
        <div className="stat-card overdue-stat">
          <div className="number">
            {currentItems.filter(i => isOverdue(i.dueDate)).length}
          </div>
          <div className="label">Overdue</div>
        </div>
        <div className="stat-card">
          <div className="number">{archiveItems.length}</div>
          <div className="label">Archived</div>
        </div>
      </div>

      <div className="tracking-table-container">
        {selectedItems.size > 0 && (
          <div className="quick-actions">
            <span>{selectedItems.size} selected</span>
          </div>
        )}

        <table className="tracking-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={selectedItems.size === displayItems.length && displayItems.length > 0}
                  onChange={(e) => handleCheckAll(e.target.checked)}
                />
              </th>
              <th>Round</th>
              <th>Furnisher</th>
              <th>Account</th>
              <th>Bureaus</th>
              <th>Status</th>
              <th>Due Date</th>
              <th>Days</th>
            </tr>
          </thead>
          <tbody>
            {displayItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty-state">
                  No {viewMode} disputes to display.
                </td>
              </tr>
            ) : (
              displayItems.map(item => {
                const daysOverdue = getDaysOverdue(item.dueDate);
                const overdue = isOverdue(item.dueDate);
                
                return (
                  <tr key={item.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedItems.has(item.id)}
                        onChange={(e) => handleCheckItem(item.id, e.target.checked)}
                      />
                    </td>
                    <td>
                      <span className="round-badge">R-{item.currentRound}</span>
                    </td>
                    <td>{item.furnisher}</td>
                    <td>{item.accountNumber || '-'}</td>
                    <td>
                      {item.disputeEquifax && <span className="bureau-tag bureau-efx">EFX</span>}
                      {item.disputeExperian && <span className="bureau-tag bureau-xpn">XPN</span>}
                      {item.disputeTransunion && <span className="bureau-tag bureau-tu">TU</span>}
                    </td>
                    <td>
                      <span className={`status-badge status-${item.status.toLowerCase().replace('_', '-')}`}>
                        {item.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      {item.dueDate 
                        ? new Date(item.dueDate).toLocaleDateString() 
                        : '-'
                      }
                    </td>
                    <td className={overdue ? 'overdue' : daysOverdue && daysOverdue > 25 ? 'due-soon' : ''}>
                      {daysOverdue !== null ? `${daysOverdue}d` : '-'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
