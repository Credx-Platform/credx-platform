import { useState, useEffect } from 'react';

interface AnalysisTabProps {
  token: string;
  clientId: string;
  clientName: string;
  clientAddress?: string | null;
}

type BureauKey = 'equifax' | 'experian' | 'transunion';

interface BureauSummary {
  bureau: BureauKey;
  label: string;
  totalAccounts: number;
  negativeAccounts: number;
  totalBalance: number;
  accounts: Array<{
    creditorName: string;
    accountNumber: string | null;
    accountType: string | null;
    status: string | null;
    balance: number;
    isNegative: boolean;
  }>;
}

interface Finding {
  id: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  bureausAffected: BureauKey[];
  accounts?: string[];
  recommendation: string;
}

interface DisputeOpportunity {
  accountName: string;
  accountNumber: string | null;
  issue: string;
  bureaus: BureauKey[];
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

interface ActionPhase {
  phase: number;
  title: string;
  description: string;
  estimatedWeeks: number;
  tasks: string[];
}

interface CreditAnalysis {
  generatedAt: string;
  clientProfile: {
    name: string;
    email: string;
    dob?: string | null;
    ssnLast4?: string | null;
    address?: string | null;
    employer?: string | null;
  };
  bureauSummaries: BureauSummary[];
  overallStats: {
    totalAccounts: number;
    totalNegativeAccounts: number;
    totalBalance: number;
    estimatedScoreRange?: string;
  };
  keyFindings: Finding[];
  disputeOpportunities: DisputeOpportunity[];
  actionPlan: ActionPhase[];
  clientFacingSummary: string;
  educationSection: string;
}

const API_BASE = (import.meta.env.VITE_API_URL ?? '').trim() || '';

function severityColor(severity: string): string {
  switch (severity) {
    case 'critical': return '#dc2626';
    case 'high': return '#ea580c';
    case 'medium': return '#ca8a04';
    case 'low': return '#16a34a';
    default: return '#6b7280';
  }
}

function severityBg(severity: string): string {
  switch (severity) {
    case 'critical': return '#fef2f2';
    case 'high': return '#fff7ed';
    case 'medium': return '#fefce8';
    case 'low': return '#f0fdf4';
    default: return '#f9fafb';
  }
}

function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    utilization: 'Utilization',
    inconsistency: 'Inconsistency',
    duplicate: 'Duplicate',
    stale_info: 'Stale Info',
    challengeable: 'Challengeable',
    derogatory: 'Derogatory',
    other: 'Other'
  };
  return labels[category] || category;
}

function bureauLabel(b: BureauKey): string {
  return b === 'equifax' ? 'Equifax' : b === 'experian' ? 'Experian' : 'TransUnion';
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function AnalysisTab({ token, clientId, clientName, clientAddress }: AnalysisTabProps) {
  const [analysis, setAnalysis] = useState<CreditAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'overview' | 'findings' | 'disputes' | 'plan' | 'summary'>('overview');
  const [copied, setCopied] = useState(false);

  const fetchAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/clients/${clientId}/analysis`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        if (response.status === 404) {
          setAnalysis(null);
          return;
        }
        throw new Error('Failed to load analysis');
      }
      const data = await response.json();
      setAnalysis(data.analysis as CreditAnalysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading analysis');
    } finally {
      setLoading(false);
    }
  };

  const generateAnalysis = async () => {
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/clients/${clientId}/analysis/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error('Failed to generate analysis');
      const data = await response.json();
      setAnalysis(data.analysis as CreditAnalysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error generating analysis');
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    fetchAnalysis();
  }, [clientId, token]);

  const copySummary = () => {
    if (!analysis) return;
    navigator.clipboard.writeText(analysis.clientFacingSummary).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading) {
    return (
      <div className="analysis-tab">
        <div className="analysis-loading">Loading analysis...</div>
      </div>
    );
  }

  if (!analysis && !loading) {
    return (
      <div className="analysis-tab">
        <div className="analysis-empty">
          <h3>No Analysis Available</h3>
          <p>Generate a credit analysis for {clientName} based on their uploaded credit reports.</p>
          {error && <div className="analysis-error">{error}</div>}
          <button
            className="analysis-generate-btn"
            onClick={generateAnalysis}
            disabled={generating}
          >
            {generating ? 'Generating...' : 'Generate Credit Analysis'}
          </button>
        </div>
      </div>
    );
  }

  if (!analysis) return null;

  const profile = analysis.clientProfile;
  const stats = analysis.overallStats;

  return (
    <div className="analysis-tab">
      <style>{`
        .analysis-tab { padding: 1.5rem; }
        .analysis-header { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; margin-bottom:1.5rem; flex-wrap:wrap; }
        .analysis-header h3 { margin:0; font-size:1.25rem; color:#1e293b; }
        .analysis-header p { margin:.35rem 0 0; color:#64748b; }
        .analysis-actions { display:flex; gap:.75rem; flex-wrap:wrap; }
        .analysis-generate-btn { padding:.65rem 1.25rem; border:none; border-radius:8px; background:#2563eb; color:#fff; font-weight:600; cursor:pointer; font-size:.875rem; }
        .analysis-generate-btn:hover { background:#1d4ed8; }
        .analysis-generate-btn:disabled { opacity:.6; cursor:not-allowed; }
        .analysis-empty { text-align:center; padding:3rem; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:14px; }
        .analysis-empty h3 { margin:0 0 .5rem; color:#1e293b; }
        .analysis-empty p { color:#64748b; margin-bottom:1.5rem; }
        .analysis-error { background:#fef2f2; border:1px solid #fecaca; color:#991b1b; padding:.75rem; border-radius:6px; margin:1rem 0; }
        .analysis-loading { text-align:center; padding:3rem; color:#64748b; }

        .analysis-nav { display:flex; gap:.25rem; border-bottom:2px solid #e2e8f0; margin-bottom:1.5rem; background:#f8fafc; padding:.5rem .5rem 0; border-radius:8px 8px 0 0; }
        .analysis-nav-btn { padding:.65rem 1rem; border:none; background:transparent; color:#64748b; font-weight:500; font-size:.875rem; cursor:pointer; border-radius:6px 6px 0 0; transition:all .2s; }
        .analysis-nav-btn:hover { color:#1e293b; background:rgba(59,130,246,.1); }
        .analysis-nav-btn.active { background:#2563eb; color:#fff; }

        .analysis-section { display:grid; gap:1.5rem; }
        .analysis-card { background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:1.25rem; box-shadow:0 12px 32px rgba(15,23,42,.06); }
        .analysis-card h4 { margin:0 0 1rem; font-size:1.05rem; color:#0f172a; }
        .analysis-card h4 .badge { display:inline-flex; align-items:center; gap:.35rem; padding:.2rem .6rem; border-radius:999px; font-size:.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.04em; margin-left:.5rem; }

        .profile-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:1rem; }
        .profile-field { display:flex; flex-direction:column; gap:.25rem; }
        .profile-field strong { font-size:.75rem; text-transform:uppercase; letter-spacing:.04em; color:#64748b; }
        .profile-field span { font-size:.875rem; color:#0f172a; font-weight:500; }

        .stats-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:1rem; }
        .stat-tile { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:1rem; text-align:center; }
        .stat-tile .value { font-size:1.5rem; font-weight:700; color:#0f172a; }
        .stat-tile .label { font-size:.75rem; color:#64748b; margin-top:.25rem; text-transform:uppercase; letter-spacing:.04em; }

        .bureau-table { width:100%; border-collapse:collapse; font-size:.875rem; }
        .bureau-table th { background:#f8fafc; padding:.75rem; text-align:left; font-weight:600; color:#374151; border-bottom:1px solid #e2e8f0; }
        .bureau-table td { padding:.75rem; border-bottom:1px solid #f1f5f9; }
        .bureau-table tr:hover { background:#f8fafc; }
        .bureau-table .negative { color:#dc2626; font-weight:600; }
        .bureau-table .positive { color:#16a34a; }

        .finding-card { border:1px solid #e5e7eb; border-radius:10px; padding:1rem; background:#fff; }
        .finding-card .finding-header { display:flex; justify-content:space-between; align-items:center; gap:.75rem; margin-bottom:.5rem; flex-wrap:wrap; }
        .finding-card .finding-title { font-weight:600; color:#0f172a; font-size:.9rem; }
        .finding-card .finding-badges { display:flex; gap:.35rem; flex-wrap:wrap; }
        .finding-card .severity-badge { padding:.2rem .55rem; border-radius:999px; font-size:.7rem; font-weight:700; text-transform:uppercase; letter-spacing:.04em; }
        .finding-card .category-badge { padding:.2rem .55rem; border-radius:999px; font-size:.7rem; font-weight:600; background:#f1f5f9; color:#475569; }
        .finding-card .finding-desc { color:#64748b; font-size:.85rem; line-height:1.5; margin-bottom:.5rem; }
        .finding-card .finding-rec { color:#0f172a; font-size:.82rem; background:#f8fafc; padding:.5rem .75rem; border-radius:6px; border-left:3px solid #2563eb; }
        .finding-card .finding-bureaus { display:flex; gap:.25rem; margin-top:.5rem; }
        .finding-card .bureau-tag { padding:.15rem .4rem; border-radius:4px; font-size:.7rem; font-weight:600; background:#eff6ff; color:#2563eb; }

        .dispute-list { display:grid; gap:.75rem; }
        .dispute-card { border:1px solid #e5e7eb; border-radius:10px; padding:1rem; background:#fff; display:grid; gap:.5rem; }
        .dispute-card .dispute-top { display:flex; justify-content:space-between; align-items:center; gap:.75rem; flex-wrap:wrap; }
        .dispute-card .dispute-name { font-weight:600; color:#0f172a; }
        .dispute-card .priority-badge { padding:.2rem .55rem; border-radius:999px; font-size:.7rem; font-weight:700; text-transform:uppercase; }
        .dispute-card .dispute-issue { color:#64748b; font-size:.85rem; }
        .dispute-card .dispute-reason { color:#0f172a; font-size:.82rem; background:#f8fafc; padding:.4rem .6rem; border-radius:6px; }
        .dispute-card .dispute-bureaus { display:flex; gap:.25rem; }

        .plan-timeline { display:grid; gap:1rem; }
        .phase-card { border:1px solid #e5e7eb; border-radius:10px; padding:1rem; background:#fff; position:relative; padding-left:2.5rem; }
        .phase-card .phase-num { position:absolute; left:.75rem; top:1rem; width:1.5rem; height:1.5rem; border-radius:50%; background:#2563eb; color:#fff; display:flex; align-items:center; justify-content:center; font-size:.75rem; font-weight:700; }
        .phase-card .phase-title { font-weight:600; color:#0f172a; margin-bottom:.25rem; }
        .phase-card .phase-desc { color:#64748b; font-size:.85rem; margin-bottom:.5rem; }
        .phase-card .phase-weeks { font-size:.75rem; color:#2563eb; font-weight:600; margin-bottom:.5rem; }
        .phase-card .phase-tasks { list-style:none; padding:0; margin:0; }
        .phase-card .phase-tasks li { font-size:.82rem; color:#475569; padding:.2rem 0; padding-left:1rem; position:relative; }
        .phase-card .phase-tasks li::before { content:'→'; position:absolute; left:0; color:#2563eb; font-size:.7rem; }

        .summary-box { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:1.25rem; }
        .summary-box pre { white-space:pre-wrap; font-family:inherit; font-size:.85rem; line-height:1.6; color:#374151; margin:0; }
        .copy-btn { padding:.5rem 1rem; border:1px solid #cbd5e1; border-radius:6px; background:#fff; color:#374151; font-size:.875rem; cursor:pointer; margin-bottom:.75rem; }
        .copy-btn:hover { background:#f1f5f9; }
        .copy-btn.copied { background:#dcfce7; color:#166534; border-color:#86efac; }
      `}</style>

      <div className="analysis-header">
        <div>
          <h3>Credit Analysis Report</h3>
          <p>Generated {new Date(analysis.generatedAt).toLocaleString()} · {analysis.keyFindings.length} findings · {analysis.disputeOpportunities.length} dispute opportunities</p>
        </div>
        <div className="analysis-actions">
          <button className="analysis-generate-btn" onClick={generateAnalysis} disabled={generating}>
            {generating ? 'Regenerating...' : 'Regenerate'}
          </button>
        </div>
      </div>

      {error && <div className="analysis-error">{error}</div>}

      <div className="analysis-nav">
        {[
          { key: 'overview' as const, label: 'Overview' },
          { key: 'findings' as const, label: `Findings (${analysis.keyFindings.length})` },
          { key: 'disputes' as const, label: `Disputes (${analysis.disputeOpportunities.length})` },
          { key: 'plan' as const, label: 'Action Plan' },
          { key: 'summary' as const, label: 'Client Summary' }
        ].map(section => (
          <button
            key={section.key}
            className={`analysis-nav-btn ${activeSection === section.key ? 'active' : ''}`}
            onClick={() => setActiveSection(section.key)}
          >
            {section.label}
          </button>
        ))}
      </div>

      <div className="analysis-section">
        {activeSection === 'overview' && (
          <>
            <div className="analysis-card">
              <h4>Client Profile</h4>
              <div className="profile-grid">
                <div className="profile-field">
                  <strong>Name</strong>
                  <span>{profile.name}</span>
                </div>
                <div className="profile-field">
                  <strong>Email</strong>
                  <span>{profile.email}</span>
                </div>
                <div className="profile-field">
                  <strong>SSN Last 4</strong>
                  <span>{profile.ssnLast4 ? `•••-••-${profile.ssnLast4}` : 'Not on file'}</span>
                </div>
                <div className="profile-field">
                  <strong>Address</strong>
                  <span>{profile.address || 'Not on file'}</span>
                </div>
                <div className="profile-field">
                  <strong>DOB</strong>
                  <span>{profile.dob ? 'On file (encrypted)' : 'Not on file'}</span>
                </div>
                <div className="profile-field">
                  <strong>Estimated Score Range</strong>
                  <span>{stats.estimatedScoreRange || 'Unknown'}</span>
                </div>
              </div>
            </div>

            <div className="analysis-card">
              <h4>Overall Statistics</h4>
              <div className="stats-grid">
                <div className="stat-tile">
                  <div className="value">{stats.totalAccounts}</div>
                  <div className="label">Total Accounts</div>
                </div>
                <div className="stat-tile">
                  <div className="value" style={{ color: '#dc2626' }}>{stats.totalNegativeAccounts}</div>
                  <div className="label">Negative Accounts</div>
                </div>
                <div className="stat-tile">
                  <div className="value">{formatCurrency(stats.totalBalance)}</div>
                  <div className="label">Total Balance</div>
                </div>
                <div className="stat-tile">
                  <div className="value">{analysis.disputeOpportunities.length}</div>
                  <div className="label">Dispute Ops</div>
                </div>
              </div>
            </div>

            <div className="analysis-card">
              <h4>Bureau Comparison</h4>
              <table className="bureau-table">
                <thead>
                  <tr>
                    <th>Bureau</th>
                    <th>Total Accounts</th>
                    <th>Negative</th>
                    <th>Total Balance</th>
                    <th>Top Accounts</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.bureauSummaries.map(b => (
                    <tr key={b.bureau}>
                      <td><strong>{b.label}</strong></td>
                      <td>{b.totalAccounts}</td>
                      <td className={b.negativeAccounts > 0 ? 'negative' : 'positive'}>
                        {b.negativeAccounts}
                      </td>
                      <td>{formatCurrency(b.totalBalance)}</td>
                      <td>
                        {b.accounts.slice(0, 3).map(a => (
                          <div key={a.creditorName} style={{ fontSize: '.8rem', color: a.isNegative ? '#dc2626' : '#16a34a' }}>
                            {a.creditorName} {a.balance > 0 ? `($${a.balance.toLocaleString()})` : ''}
                          </div>
                        ))}
                        {b.accounts.length > 3 && <div style={{ fontSize: '.75rem', color: '#64748b' }}>+{b.accounts.length - 3} more</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeSection === 'findings' && (
          <div className="analysis-card">
            <h4>Key Findings <span className="badge" style={{ background: '#fef2f2', color: '#dc2626' }}>{analysis.keyFindings.filter(f => f.severity === 'critical').length} Critical</span></h4>
            <div className="dispute-list">
              {analysis.keyFindings.map(finding => (
                <div key={finding.id} className="finding-card" style={{ background: severityBg(finding.severity) }}>
                  <div className="finding-header">
                    <span className="finding-title">{finding.title}</span>
                    <div className="finding-badges">
                      <span className="severity-badge" style={{ background: severityColor(finding.severity), color: '#fff' }}>
                        {finding.severity}
                      </span>
                      <span className="category-badge">{categoryLabel(finding.category)}</span>
                    </div>
                  </div>
                  <div className="finding-desc">{finding.description}</div>
                  <div className="finding-rec"><strong>Recommendation:</strong> {finding.recommendation}</div>
                  <div className="finding-bureaus">
                    {finding.bureausAffected.map(b => (
                      <span key={b} className="bureau-tag">{bureauLabel(b)}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'disputes' && (
          <div className="analysis-card">
            <h4>Dispute Opportunities</h4>
            <div className="dispute-list">
              {analysis.disputeOpportunities.map((op, idx) => (
                <div key={idx} className="dispute-card">
                  <div className="dispute-top">
                    <span className="dispute-name">{op.accountName}</span>
                    <span className="priority-badge" style={{
                      background: op.priority === 'high' ? '#fef2f2' : op.priority === 'medium' ? '#fefce8' : '#f0fdf4',
                      color: op.priority === 'high' ? '#dc2626' : op.priority === 'medium' ? '#ca8a04' : '#16a34a'
                    }}>
                      {op.priority} priority
                    </span>
                  </div>
                  <div className="dispute-issue">{op.issue}</div>
                  <div className="dispute-reason"><strong>Dispute reason:</strong> {op.reason}</div>
                  <div className="dispute-bureaus">
                    {op.bureaus.map(b => (
                      <span key={b} className="bureau-tag">{bureauLabel(b)}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'plan' && (
          <div className="analysis-card">
            <h4>Recommended Action Plan</h4>
            <div className="plan-timeline">
              {analysis.actionPlan.map(phase => (
                <div key={phase.phase} className="phase-card">
                  <span className="phase-num">{phase.phase}</span>
                  <div className="phase-title">{phase.title}</div>
                  <div className="phase-desc">{phase.description}</div>
                  <div className="phase-weeks">~{phase.estimatedWeeks} weeks</div>
                  <ul className="phase-tasks">
                    {phase.tasks.map((task, i) => (
                      <li key={i}>{task}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'summary' && (
          <div className="analysis-card">
            <h4>Client-Facing Summary</h4>
            <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={copySummary}>
              {copied ? '✓ Copied!' : 'Copy to Clipboard'}
            </button>
            <div className="summary-box">
              <pre>{analysis.clientFacingSummary}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
