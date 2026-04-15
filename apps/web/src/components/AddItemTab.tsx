import { useState, useEffect, useCallback } from 'react';
import type { DisputeItem, Furnisher } from './DisputeManager';

interface AddItemTabProps {
  token: string;
  items: DisputeItem[];
  onItemCreated: () => void;
  onItemsChange: () => void;
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

export function AddItemTab({ token, items, onItemCreated, onItemsChange }: AddItemTabProps) {
  const [clients, setClients] = useState<any[]>([]);
  const [furnishers, setFurnishers] = useState<Furnisher[]>([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [editingItem, setEditingItem] = useState<DisputeItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  
  const [formData, setFormData] = useState({
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
  });

  // Fetch clients and furnishers
  useEffect(() => {
    fetch(`${API_BASE}/api/clients`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setClients(data.clients || []))
      .catch(console.error);

    fetch(`${API_BASE}/api/disputes/furnishers`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setFurnishers(data.furnishers || []))
      .catch(console.error);
  }, [token]);

  const resetForm = () => {
    setFormData({
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
    });
    setEditingItem(null);
  };

  const handleCheckAll = (checked: boolean) => {
    if (checked) {
      setSelectedItems(new Set(items.map(i => i.id)));
    } else {
      setSelectedItems(new Set());
    }
  };

  const handleCheckItem = (id: string, checked: boolean) => {
    const newSet = new Set(selectedItems);
    if (checked) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setSelectedItems(newSet);
  };

  const handleCheckAllBureaus = (checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      disputeEquifax: checked,
      disputeExperian: checked,
      disputeTransunion: checked
    }));
  };

  const handleSave = async () => {
    if (!selectedClient) {
      alert('Please select a client first');
      return;
    }
    if (!formData.furnisher) {
      alert('Please enter a furnisher name');
      return;
    }

    setSaving(true);
    try {
      const url = editingItem 
        ? `${API_BASE}/api/disputes/items/${editingItem.id}`
        : `${API_BASE}/api/disputes/items`;
      
      const method = editingItem ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          clientId: selectedClient,
          balance: formData.balance ? parseFloat(formData.balance) : null
        })
      });

      if (!response.ok) throw new Error('Save failed');

      resetForm();
      onItemCreated();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndDispute = async () => {
    if (!selectedClient) {
      alert('Please select a client first');
      return;
    }
    if (!formData.furnisher) {
      alert('Please enter a furnisher name');
      return;
    }

    setSaving(true);
    try {
      // First save the item
      const url = editingItem 
        ? `${API_BASE}/api/disputes/items/${editingItem.id}`
        : `${API_BASE}/api/disputes/items`;
      
      const method = editingItem ? 'PUT' : 'POST';
      
      const saveResponse = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          clientId: selectedClient,
          balance: formData.balance ? parseFloat(formData.balance) : null
        })
      });

      if (!saveResponse.ok) throw new Error('Save failed');
      const savedItem = await saveResponse.json();
      
      // Then initiate dispute for the item
      const itemId = savedItem.id || editingItem?.id;
      if (itemId) {
        const disputeResponse = await fetch(`${API_BASE}/api/disputes/initiate`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            itemId: itemId,
            clientId: selectedClient,
            bureaus: {
              equifax: formData.disputeEquifax,
              experian: formData.disputeExperian,
              transunion: formData.disputeTransunion
            }
          })
        });

        if (!disputeResponse.ok) throw new Error('Dispute initiation failed');
      }
      
      resetForm();
      onItemCreated();
      alert('Item saved and dispute initiated successfully!');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Save and dispute failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    
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
    if (!confirm(`Delete ${selectedItems.size} selected items?`)) return;

    try {
      const response = await fetch(`${API_BASE}/api/disputes/bulk/delete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ids: Array.from(selectedItems) })
      });

      if (!response.ok) throw new Error('Bulk delete failed');
      setSelectedItems(new Set());
      onItemsChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Bulk delete failed');
    }
  };

  const startEdit = (item: DisputeItem) => {
    setEditingItem(item);
    setSelectedClient(item.clientId);
    setFormData({
      furnisher: item.furnisher,
      accountNumber: item.accountNumber || '',
      accountType: item.accountType,
      balance: item.balance?.toString() || '',
      dateAdded: item.dateAdded?.split('T')[0] || '',
      disputeEquifax: item.disputeEquifax,
      disputeExperian: item.disputeExperian,
      disputeTransunion: item.disputeTransunion,
      reason: item.reason,
      customInstruction: item.customInstruction || ''
    });
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      PENDING: '#6b7280',
      IN_DISPUTE: '#3b82f6',
      DELETED: '#22c55e',
      UPDATED: '#eab308',
      VERIFIED: '#ef4444'
    };
    return (
      <span style={{
        background: colors[status] || '#6b7280',
        color: 'white',
        padding: '2px 8px',
        borderRadius: '12px',
        fontSize: '0.75rem',
        fontWeight: 500
      }}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  return (
    <div className="add-item-tab">
      <style>{`
        .add-item-tab {
          padding: 1.5rem;
        }

        .add-item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .add-item-header h3 {
          font-size: 1.25rem;
          color: #1e293b;
        }

        .client-selector {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .client-selector select {
          padding: 0.5rem 1rem;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          min-width: 250px;
        }

        .dispute-form {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
        }

        .form-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .form-field {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }

        .form-field label {
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
        }

        .form-field input,
        .form-field select,
        .form-field textarea {
          padding: 0.5rem;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 0.875rem;
        }

        .form-field input:focus,
        .form-field select:focus,
        .form-field textarea:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .bureau-checkboxes {
          display: flex;
          gap: 1.5rem;
          align-items: center;
          padding: 0.75rem;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          margin-bottom: 1rem;
        }

        .bureau-checkbox {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
        }

        .bureau-checkbox input {
          width: 18px;
          height: 18px;
          accent-color: #3b82f6;
        }

        .form-actions {
          display: flex;
          gap: 0.75rem;
          margin-top: 1rem;
        }

        .btn {
          padding: 0.625rem 1.25rem;
          border: none;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 0.875rem;
        }

        .btn-primary {
          background: #3b82f6;
          color: white;
        }

        .btn-primary:hover {
          background: #2563eb;
        }

        .btn-success {
          background: #22c55e;
          color: white;
        }

        .btn-success:hover {
          background: #16a34a;
        }

        .btn-danger {
          background: #ef4444;
          color: white;
        }

        .btn-danger:hover {
          background: #dc2626;
        }

        .btn-secondary {
          background: #f3f4f6;
          color: #374151;
        }

        .btn-secondary:hover {
          background: #e5e7eb;
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .items-table-container {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          overflow: hidden;
        }

        .items-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
        }

        .items-table th {
          background: #f8fafc;
          padding: 0.75rem;
          text-align: left;
          font-weight: 600;
          color: #374151;
          border-bottom: 1px solid #e2e8f0;
        }

        .items-table td {
          padding: 0.75rem;
          border-bottom: 1px solid #f1f5f9;
        }

        .items-table tr:hover {
          background: #f8fafc;
        }

        .table-actions {
          display: flex;
          gap: 0.5rem;
        }

        .table-actions button {
          padding: 0.25rem 0.5rem;
          font-size: 0.75rem;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }

        .table-actions .edit-btn {
          background: #3b82f6;
          color: white;
        }

        .table-actions .delete-btn {
          background: #ef4444;
          color: white;
        }

        .bulk-actions {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.75rem;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
        }

        .empty-state {
          text-align: center;
          padding: 3rem;
          color: #64748b;
        }

        .bureau-cell {
          text-align: center;
        }

        .bureau-check {
          color: #22c55e;
          font-weight: bold;
        }

        .bureau-x {
          color: #ef4444;
        }
      `}</style>

      <div className="add-item-header">
        <h3>Add Dispute Items</h3>
        <div className="client-selector">
          <label>Client:</label>
          <select 
            value={selectedClient} 
            onChange={(e) => setSelectedClient(e.target.value)}
            disabled={!!editingItem}
          >
            <option value="">Select client...</option>
            {clients.map(client => (
              <option key={client.id} value={client.id}>
                {client.user.firstName} {client.user.lastName}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="dispute-form">
        <div className="form-row">
          <div className="form-field">
            <label>Furnisher *</label>
            <input
              list="furnishers-list"
              value={formData.furnisher}
              onChange={(e) => setFormData({...formData, furnisher: e.target.value})}
              placeholder="Search or type furnisher name"
            />
            <datalist id="furnishers-list">
              {furnishers.map(f => (
                <option key={f.id} value={f.name} />
              ))}
            </datalist>
          </div>
          <div className="form-field">
            <label>Account Number</label>
            <input
              value={formData.accountNumber}
              onChange={(e) => setFormData({...formData, accountNumber: e.target.value})}
              placeholder="Account #"
            />
          </div>
          <div className="form-field">
            <label>Account Type</label>
            <select
              value={formData.accountType}
              onChange={(e) => setFormData({...formData, accountType: e.target.value})}
            >
              {accountTypes.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label>Balance</label>
            <input
              type="number"
              value={formData.balance}
              onChange={(e) => setFormData({...formData, balance: e.target.value})}
              placeholder="0.00"
            />
          </div>
          <div className="form-field">
            <label>Date Added to Report</label>
            <input
              type="date"
              value={formData.dateAdded}
              onChange={(e) => setFormData({...formData, dateAdded: e.target.value})}
            />
          </div>
          <div className="form-field">
            <label>Dispute Reason *</label>
            <select
              value={formData.reason}
              onChange={(e) => setFormData({...formData, reason: e.target.value})}
            >
              <option value="">Select reason...</option>
              {disputeReasons.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="bureau-checkboxes">
          <label className="bureau-checkbox">
            <input
              type="checkbox"
              checked={formData.disputeEquifax && formData.disputeExperian && formData.disputeTransunion}
              onChange={(e) => handleCheckAllBureaus(e.target.checked)}
            />
            <span>Check All</span>
          </label>
          <label className="bureau-checkbox">
            <input
              type="checkbox"
              checked={formData.disputeEquifax}
              onChange={(e) => setFormData({...formData, disputeEquifax: e.target.checked})}
            />
            <span>EFX (Equifax)</span>
          </label>
          <label className="bureau-checkbox">
            <input
              type="checkbox"
              checked={formData.disputeExperian}
              onChange={(e) => setFormData({...formData, disputeExperian: e.target.checked})}
            />
            <span>XPN (Experian)</span>
          </label>
          <label className="bureau-checkbox">
            <input
              type="checkbox"
              checked={formData.disputeTransunion}
              onChange={(e) => setFormData({...formData, disputeTransunion: e.target.checked})}
            />
            <span>TU (TransUnion)</span>
          </label>
        </div>

        <div className="form-field">
          <label>Custom Instructions</label>
          <textarea
            rows={2}
            value={formData.customInstruction}
            onChange={(e) => setFormData({...formData, customInstruction: e.target.value})}
            placeholder="Optional instructions for this dispute..."
          />
        </div>

        <div className="form-actions">
          <button 
            className="btn btn-primary" 
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : (editingItem ? 'Update' : 'Save')}
          </button>
          <button 
            className="btn btn-success" 
            onClick={handleSaveAndDispute}
            disabled={saving || !selectedClient}
          >
            {editingItem ? 'Update & Dispute' : 'Save & Dispute'}
          </button>
          {editingItem && (
            <button className="btn btn-secondary" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="items-table-container">
        {selectedItems.size > 0 && (
          <div className="bulk-actions">
            <span>{selectedItems.size} selected</span>
            <button className="btn btn-danger" onClick={handleBulkDelete}>
              Delete Selected
            </button>
          </div>
        )}
        
        <table className="items-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={selectedItems.size === items.length && items.length > 0}
                  onChange={(e) => handleCheckAll(e.target.checked)}
                />
              </th>
              <th>Furnisher</th>
              <th>Account #</th>
              <th>Type</th>
              <th>EFX</th>
              <th>XPN</th>
              <th>TU</th>
              <th>Status</th>
              <th>Round</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={10} className="empty-state">
                  No dispute items yet. Add your first item above.
                </td>
              </tr>
            ) : (
              items.map(item => (
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
                  <td className="bureau-cell">
                    {item.disputeEquifax ? <span className="bureau-check">✓</span> : <span className="bureau-x">✗</span>}
                  </td>
                  <td className="bureau-cell">
                    {item.disputeExperian ? <span className="bureau-check">✓</span> : <span className="bureau-x">✗</span>}
                  </td>
                  <td className="bureau-cell">
                    {item.disputeTransunion ? <span className="bureau-check">✓</span> : <span className="bureau-x">✗</span>}
                  </td>
                  <td>{getStatusBadge(item.status)}</td>
                  <td>R-{item.currentRound}</td>
                  <td className="table-actions">
                    <button className="edit-btn" onClick={() => startEdit(item)}>Edit</button>
                    <button className="delete-btn" onClick={() => handleDelete(item.id)}>Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
