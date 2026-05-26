import { useState, useRef, useEffect, useMemo, useCallback } from 'react';

interface ImportReportTabProps {
  token: string;
  selectedClientId: string;
  selectedClientLabel?: string;
  onImportComplete: () => void;
}

type ScoreHistoryReport = {
  id: string;
  bureau: 'EQUIFAX' | 'EXPERIAN' | 'TRANSUNION';
  pulledAt: string;
  score: number | null;
};

const API_BASE = (import.meta.env.VITE_API_URL ?? '').trim() || '';

const BUREAU_META = [
  { key: 'EQUIFAX' as const, label: 'Equifax', short: 'EFX', tint: '#22c55e' },
  { key: 'EXPERIAN' as const, label: 'Experian', short: 'XPN', tint: '#3b82f6' },
  { key: 'TRANSUNION' as const, label: 'TransUnion', short: 'TU', tint: '#a855f7' }
];

function fmtDate(s: string) {
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

function scoreBand(score: number | null): { label: string; color: string } {
  if (score == null) return { label: '—', color: '#94a3b8' };
  if (score >= 800) return { label: 'Excellent', color: '#16a34a' };
  if (score >= 740) return { label: 'Very Good', color: '#22c55e' };
  if (score >= 670) return { label: 'Good', color: '#84cc16' };
  if (score >= 580) return { label: 'Fair', color: '#f59e0b' };
  return { label: 'Poor', color: '#ef4444' };
}

export function ImportReportTab({ token, selectedClientId, selectedClientLabel, onImportComplete }: ImportReportTabProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trackerEnabled, setTrackerEnabled] = useState(true);
  const [history, setHistory] = useState<ScoreHistoryReport[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchHistory = useCallback(async () => {
    if (!selectedClientId) { setHistory([]); return; }
    try {
      const res = await fetch(`${API_BASE}/api/clients/${selectedClientId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) { setHistory([]); return; }
      const data = await res.json();
      const reports = (data?.client?.creditReports || []) as ScoreHistoryReport[];
      setHistory(reports);
    } catch {
      setHistory([]);
    }
  }, [token, selectedClientId]);

  useEffect(() => {
    setUploadResult(null);
    setError(null);
    fetchHistory();
  }, [selectedClientId, fetchHistory]);

  // Per-bureau score timelines (oldest → newest). Used by the tracker panel.
  const byBureau = useMemo(() => {
    const out = new Map<string, ScoreHistoryReport[]>();
    for (const meta of BUREAU_META) out.set(meta.key, []);
    for (const r of history) {
      const list = out.get(r.bureau);
      if (list) list.push(r);
    }
    for (const [, list] of out) list.sort((a, b) => new Date(a.pulledAt).getTime() - new Date(b.pulledAt).getTime());
    return out;
  }, [history]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!selectedClientId) {
      setError('Please select a client first');
      return;
    }

    setUploading(true);
    setError(null);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'credit_report');

      const response = await fetch(`${API_BASE}/api/progress/clients/${selectedClientId}/docs/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Upload failed: ${response.status}`);
      }

      await response.json();
      setUploadResult({ success: true, count: 0 });
      onImportComplete();
      // Parsing runs async on the server — poll the tracker for the freshly extracted score.
      let tries = 0;
      const poll = async () => {
        tries++;
        await fetchHistory();
        if (tries < 8) setTimeout(poll, 4000);
      };
      setTimeout(poll, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
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

        .tracker-section { background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:1.5rem; }
        .tracker-section h4 { font-size:1rem; color:#1e293b; margin:0 0 .15rem; display:flex; align-items:center; gap:.5rem; }
        .tracker-section .sub { color:#64748b; font-size:.78rem; margin:0 0 1rem; }
        .tracker-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:1rem; }
        .tracker-card { border:1px solid #e2e8f0; border-radius:10px; padding:1rem; background:#f8fafc; }
        .tracker-card-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:.5rem; }
        .tracker-card-bureau { display:flex; align-items:center; gap:.5rem; font-weight:700; color:#0f172a; font-size:.92rem; }
        .tracker-card-chip { font-size:.65rem; padding:2px 7px; border-radius:999px; font-weight:800; letter-spacing:.05em; color:#fff; }
        .tracker-card-latest { display:flex; align-items:baseline; gap:.55rem; margin-bottom:.6rem; }
        .tracker-card-latest .num { font-size:2rem; font-weight:800; color:#0f172a; line-height:1; font-feature-settings:'tnum'; }
        .tracker-card-latest .band { font-size:.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.04em; padding:2px 8px; border-radius:999px; color:#fff; }
        .tracker-card-delta { font-size:.78rem; font-weight:600; }
        .tracker-card-delta.up { color:#16a34a; }
        .tracker-card-delta.down { color:#dc2626; }
        .tracker-card-delta.same { color:#64748b; }
        .tracker-spark { display:flex; gap:2px; align-items:flex-end; height:48px; margin:.55rem 0 .6rem; padding:.25rem; background:#fff; border:1px solid #e2e8f0; border-radius:6px; }
        .tracker-spark .bar { flex:1 1 0; border-radius:2px 2px 0 0; min-width:4px; }
        .tracker-spark .bar.placeholder { background:repeating-linear-gradient(45deg, #f1f5f9, #f1f5f9 4px, #fff 4px, #fff 8px); height:30%; }
        .tracker-history { font-size:.78rem; color:#475569; }
        .tracker-history .row { display:flex; justify-content:space-between; padding:.25rem 0; border-top:1px dashed #e2e8f0; }
        .tracker-history .row:first-child { border-top:none; }
        .tracker-history .row .pulled { color:#64748b; }
        .tracker-history .row .pts { font-weight:700; color:#0f172a; font-feature-settings:'tnum'; }
        .tracker-empty { padding:1rem; text-align:center; color:#64748b; font-size:.85rem; background:#fff; border:1px dashed #cbd5e1; border-radius:8px; }
      `}</style>

      <div className="import-header">
        <h3>Upload Credit Report</h3>
        <p>Upload the client's tri-merge report (PDF, HTML, or screenshot). Runs the same extraction + analysis pipeline used by the client portal — tradelines, findings, and dispute opportunities populate automatically.</p>
      </div>

      <div className="import-section">
        <h4>1. Active Client</h4>
        <div className="form-group">
          <label>Client</label>
          <div style={{padding:'0.75rem 1rem', border:'1px solid #d1d5db', borderRadius:'6px', background:'white', color:'#0f172a'}}>
            {selectedClientLabel || 'Select a client at the top of the dispute workspace.'}
          </div>
        </div>

        <div className="toggle-row">
          <label className="toggle-switch">
            <input type="checkbox" checked={trackerEnabled} onChange={(e) => setTrackerEnabled(e.target.checked)} />
            <span className="toggle-slider"></span>
          </label>
          <span>Credit Score Tracker</span>
          <small style={{ color: '#64748b', fontSize: '.78rem', marginLeft: '.5rem' }}>
            {trackerEnabled ? 'Auto-captures the per-bureau score from every uploaded report and graphs the trend below.' : 'Disabled — scores are still parsed but the tracker panel stays hidden.'}
          </small>
        </div>
      </div>

      <div className="import-section">
        <h4>2. Upload Credit Report File</h4>
        <div
          className="upload-zone"
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="upload-icon">📄</div>
          <div className="upload-text">
            {uploading ? 'Uploading & analyzing…' : 'Click to upload credit report'}
          </div>
          <div className="upload-hint">
            Accepted: PDF, HTML, PNG, JPG, JPEG, WEBP. Extraction + analysis runs in the background; reload to see updated tradelines and dispute opportunities.
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.html,.htm,.png,.jpg,.jpeg,.webp"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            disabled={uploading}
          />
        </div>

        {uploadResult && (
          <div className="import-result">
            ✅ Uploaded — extraction + analysis are running in the background. Refresh in a few seconds to see findings and dispute opportunities.
          </div>
        )}

        {error && (
          <div className="import-error">
            ❌ Error: {error}
          </div>
        )}
      </div>

      {trackerEnabled ? (
        <div className="tracker-section">
          <h4>📈 Credit Score Tracker</h4>
          <p className="sub">Scores are auto-captured from every credit report pulled for this client. Each card shows the latest score, the change vs. the prior pull, and the full history.</p>

          {!history.length ? (
            <div className="tracker-empty">
              No credit reports on file yet. Upload above and the tracker will populate once extraction finishes.
            </div>
          ) : (
            <div className="tracker-grid">
              {BUREAU_META.map((meta) => {
                const timeline = byBureau.get(meta.key) || [];
                const withScores = timeline.filter((r) => typeof r.score === 'number');
                const latest = withScores.length ? withScores[withScores.length - 1] : null;
                const prev = withScores.length > 1 ? withScores[withScores.length - 2] : null;
                const delta = latest && prev && latest.score != null && prev.score != null ? latest.score - prev.score : null;
                const band = scoreBand(latest?.score ?? null);
                const max = withScores.length ? Math.max(...withScores.map((r) => r.score as number)) : 0;
                const min = withScores.length ? Math.min(...withScores.map((r) => r.score as number)) : 0;
                const range = Math.max(max - min, 1);

                return (
                  <article key={meta.key} className="tracker-card">
                    <div className="tracker-card-head">
                      <div className="tracker-card-bureau">
                        <span className="tracker-card-chip" style={{ background: meta.tint }}>{meta.short}</span>
                        {meta.label}
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: '.72rem' }}>{withScores.length} pull{withScores.length === 1 ? '' : 's'}</div>
                    </div>

                    {latest ? (
                      <>
                        <div className="tracker-card-latest">
                          <span className="num">{latest.score}</span>
                          <span className="band" style={{ background: band.color }}>{band.label}</span>
                        </div>
                        {delta != null ? (
                          <div className={`tracker-card-delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : 'same'}`}>
                            {delta > 0 ? '▲' : delta < 0 ? '▼' : '■'} {delta === 0 ? 'No change' : `${delta > 0 ? '+' : ''}${delta} pts vs ${fmtDate(prev!.pulledAt)}`}
                          </div>
                        ) : <div className="tracker-card-delta same">First pull — no prior score to compare.</div>}

                        <div className="tracker-spark" aria-label={`Score history for ${meta.label}`}>
                          {withScores.length > 1 ? withScores.map((r) => {
                            const h = Math.max(15, Math.round(((r.score as number - min) / range) * 100));
                            return <div key={r.id} className="bar" title={`${fmtDate(r.pulledAt)} — ${r.score}`} style={{ height: `${h}%`, background: meta.tint }} />;
                          }) : <div className="bar placeholder" title="Need at least 2 pulls to draw a trend." />}
                        </div>

                        <div className="tracker-history">
                          {withScores.slice().reverse().slice(0, 5).map((r, idx, arr) => {
                            const next = arr[idx + 1];
                            const d = next && r.score != null && next.score != null ? r.score - next.score : null;
                            return (
                              <div key={r.id} className="row">
                                <span className="pulled">{fmtDate(r.pulledAt)}</span>
                                <span className="pts">
                                  {r.score}
                                  {d != null ? <span style={{ marginLeft: 6, color: d > 0 ? '#16a34a' : d < 0 ? '#dc2626' : '#64748b', fontWeight: 600 }}>
                                    {d > 0 ? '+' : ''}{d}
                                  </span> : null}
                                </span>
                              </div>
                            );
                          })}
                          {withScores.length > 5 ? <div style={{ marginTop: 4, color: '#94a3b8', fontSize: '.72rem' }}>+ {withScores.length - 5} earlier pull{withScores.length - 5 === 1 ? '' : 's'}</div> : null}
                        </div>
                      </>
                    ) : (
                      <div className="tracker-empty">No score captured yet for {meta.label}. The next upload that includes this bureau will fill it in.</div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
