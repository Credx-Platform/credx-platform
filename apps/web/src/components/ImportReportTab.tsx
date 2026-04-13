import { useState, useRef } from 'react';

interface ImportReportTabProps {
  token: string;
  onImportComplete: () => void;
}

const API_BASE = (import.meta.env.VITE_API_URL ?? '').trim() || '';

export function ImportReportTab({ token, onImportComplete }: ImportReportTabProps) {
  const [selectedClient, setSelectedClient] = useState('');
  const [clients, setClients] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch clients on mount
  useState(() => {
    fetch(`${API_BASE}/api/clients`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setClients(data.clients || []))
      .catch(console.error);
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!selectedClient) {
      setError('Please select a client first');
      return;
    }

    setUploading(true);
    setError(null);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('clientId', selectedClient);

      const response = await fetch(`${API_BASE}/api/disputes/import/csv`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Import failed');
      }

      const result = await response.json();
      setUploadResult(result);
      onImportComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="import-tab">
      <style>{`
        .import-tab {
          padding: 1.5rem;
        }

        .import-header {
          margin-bottom: 2rem;
        }

        .import-header h3 {
          font-size: 1.25rem;
          color: #1e293b;
          margin-bottom: 0.5rem;
        }

        .import-header p {
          color: #64748b;
          font-size: 0.875rem;
        }

        .import-section {
          background: #f8fafc;
          border-radius: 8px;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
          border: 1px solid #e2e8f0;
        }

        .import-section h4 {
          font-size: 1rem;
          color: #1e293b;
          margin-bottom: 1rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .import-section h4::before {
          content: '';
          width: 4px;
          height: 20px;
          background: #3b82f6;
          border-radius: 2px;
        }

        .form-group {
          margin-bottom: 1rem;
        }

        .form-group label {
          display: block;
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
          margin-bottom: 0.5rem;
        }

        .form-group select {
          width: 100%;
          padding: 0.625rem;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 0.875rem;
          background: white;
        }

        .upload-zone {
          border: 2px dashed #d1d5db;
          border-radius: 8px;
          padding: 2rem;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
          background: white;
        }

        .upload-zone:hover {
          border-color: #3b82f6;
          background: #eff6ff;
        }

        .upload-zone.dragover {
          border-color: #3b82f6;
          background: #dbeafe;
        }

        .upload-icon {
          font-size: 2.5rem;
          margin-bottom: 1rem;
        }

        .upload-text {
          color: #374151;
          font-weight: 500;
          margin-bottom: 0.5rem;
        }

        .upload-hint {
          color: #6b7280;
          font-size: 0.875rem;
        }

        .csv-template {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 1rem;
          margin-top: 1rem;
        }

        .csv-template h5 {
          font-size: 0.875rem;
          color: #374151;
          margin-bottom: 0.75rem;
        }

        .csv-template code {
          display: block;
          background: #1e293b;
          color: #e2e8f0;
          padding: 0.75rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-family: monospace;
          overflow-x: auto;
        }

        .import-result {
          background: #f0fdf4;
          border: 1px solid #86efac;
          color: #166534;
          padding: 1rem;
          border-radius: 6px;
          margin-top: 1rem;
        }

        .import-error {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #991b1b;
          padding: 1rem;
          border-radius: 6px;
          margin-top: 1rem;
        }

        .toggle-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-top: 1rem;
        }

        .toggle-switch {
          position: relative;
          width: 44px;
          height: 24px;
        }

        .toggle-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .toggle-slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: #d1d5db;
          border-radius: 24px;
          transition: 0.3s;
        }

        .toggle-slider:before {
          content: '';
          position: absolute;
          height: 18px;
          width: 18px;
          left: 3px;
          bottom: 3px;
          background: white;
          border-radius: 50%;
          transition: 0.3s;
        }

        input:checked + .toggle-slider {
          background: #3b82f6;
        }

        input:checked + .toggle-slider:before {
          transform: translateX(20px);
        }
      `}</style>

      <div className="import-header">
        <h3>Import Credit Report</h3>
        <p>Upload credit report data via CSV to quickly add dispute items.</p>
      </div>

      <div className="import-section">
        <h4>1. Select Client</h4>
        <div className="form-group">
          <label>Client</label>
          <select 
            value={selectedClient} 
            onChange={(e) => setSelectedClient(e.target.value)}
          >
            <option value="">Select a client...</option>
            {clients.map(client => (
              <option key={client.id} value={client.id}>
                {client.user.firstName} {client.user.lastName} ({client.user.email})
              </option>
            ))}
          </select>
        </div>

        <div className="toggle-row">
          <label className="toggle-switch">
            <input type="checkbox" />
            <span className="toggle-slider"></span>
          </label>
          <span>Enable Credit Score Automation</span>
        </div>
      </div>

      <div className="import-section">
        <h4>2. Upload CSV File</h4>
        <div 
          className="upload-zone"
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="upload-icon">📁</div>
          <div className="upload-text">
            {uploading ? 'Uploading...' : 'Click to upload CSV file'}
          </div>
          <div className="upload-hint">
            Supports: Furnisher, Account Number, Account Type, Balance, EFX, XPN, TU, Reason
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            disabled={uploading}
          />
        </div>

        <div className="csv-template">
          <h5>CSV Template Format:</h5>
          <code>
            furnisher,accountNumber,accountType,balance,equifax,experian,transunion,reason,instructions
            <br />
            CREDITONEBNK,1234567890,COLLECTION,1500.00,true,true,false,"Not mine","Please investigate"
            <br />
            MIDLAND CREDIT,0987654321,CHARGE_OFF,2300.00,true,false,true,"Dispute balance",""
          </code>
        </div>

        {uploadResult && (
          <div className="import-result">
            ✅ Successfully imported {uploadResult.count} dispute items!
          </div>
        )}

        {error && (
          <div className="import-error">
            ❌ Error: {error}
          </div>
        )}
      </div>
    </div>
  );
}
