import { useState, useEffect, useMemo } from 'react';

interface AnalysisTabProps {
  token: string;
  clientId: string;
  clientName: string;
  clientAddress?: string | null;
}

type BureauKey = 'experian' | 'equifax' | 'transunion';
type AccountCategory = 'collection' | 'charge_off' | 'late_payment' | 'derogatory' | 'positive' | 'inquiry' | 'public_record' | 'unknown';

interface BureauAccountFields {
  accountNumber: string | null;
  highBalance: number | null;
  lastVerified: string | null;
  dateOfLastActivity: string | null;
  dateReported: string | null;
  dateOpened: string | null;
  balanceOwed: number | null;
  closedDate: string | null;
  accountRating: string | null;
  accountDescription: string | null;
  disputeStatus: string | null;
  creditorType: string | null;
  accountStatus: string | null;
  paymentStatus: string | null;
  comments: string | null;
  paymentAmount: number | null;
  dateOfLastPayment: string | null;
  termMonths: number | null;
  pastDueAmount: number | null;
  accountType: string | null;
  paymentFrequency: string | null;
  creditLimit: number | null;
}

interface PaymentHistoryGrid {
  months: string[];
  experian: (string | null)[];
  equifax: (string | null)[];
  transunion: (string | null)[];
}

interface PersonalProfileColumn {
  reportDate: string | null;
  name: string | null;
  alsoKnownAs: string | null;
  dateOfBirth: string | null;
  currentAddress: string | null;
  previousAddresses: string[];
  employers: string[];
}

interface PersonalProfile {
  experian: PersonalProfileColumn | null;
  equifax: PersonalProfileColumn | null;
  transunion: PersonalProfileColumn | null;
  publicRecords: string[];
}

interface BureauScore { bureau: 'EXPERIAN' | 'EQUIFAX' | 'TRANSUNION'; score: number | null; pulledAt: string | null }

interface AccountDetail {
  creditorName: string;
  category: AccountCategory;
  isNegative: boolean;
  experian: BureauAccountFields | null;
  equifax: BureauAccountFields | null;
  transunion: BureauAccountFields | null;
  paymentHistory: PaymentHistoryGrid | null;
  inconsistencies: string[];
}

interface AccountSummaryRow {
  index: number;
  type: string;
  creditorName: string;
  accountNumber: string | null;
  status: string | null;
  lastReported: string | null;
  balance: number | null;
  pastDue: number | null;
  dateOpened?: string | null;
}

interface FicoFactor {
  factor: string;
  weight: number;
  title: string;
  finding: string;
  courseOfAction: string;
}

interface DisputeOpportunity {
  accountName: string;
  accountNumber: string | null;
  issue: string;
  bureaus: BureauKey[];
  reason: string;
  priority: 'high' | 'medium' | 'low';
  fieldKey?: string;
  perBureauValues?: Partial<Record<BureauKey, string | number | null>>;
}

interface ActionPhase {
  phase: number;
  title: string;
  description: string;
  estimatedWeeks: number;
  tasks: string[];
}

interface NextStepBlock {
  title: string;
  description: string;
  bullets: string[];
}

interface CreditAnalysis {
  generatedAt: string;
  branding: { companyName: string; email: string | null; phone: string | null; website: string | null };
  clientProfile: { name: string; email: string; dob?: string | null; ssnLast4?: string | null; address?: string | null; employer?: string | null };
  bureauScores: BureauScore[];
  summaryTiles: {
    creditCards: { total: number; open: number; closed: number; maxed: number };
    loans: { total: number; open: number; closed: number };
    derogatory: {
      latePayments: number; collections: number; chargeOffs: number; repossessions: number;
      foreclosures: number; inquiries: number; shortSales: number; judgments: number;
      taxLiens: number; includedInBk: number; bankruptcies: number; totalNegative: number;
    };
  };
  keyFactors: { recent24Months: AccountSummaryRow[]; statuteOfLimitations: AccountSummaryRow[] };
  ficoFactors: FicoFactor[];
  negativesByCategory: { collections: AccountSummaryRow[]; chargeOffs: AccountSummaryRow[]; latePayments: AccountSummaryRow[] };
  personalProfile: PersonalProfile;
  negativeAccounts: AccountDetail[];
  positiveAccounts: AccountDetail[];
  disputeOpportunities: DisputeOpportunity[];
  actionPlan: ActionPhase[];
  nextSteps: NextStepBlock[];
  clientFacingSummary: string;
  educationSection: string;
}

const API_BASE = (import.meta.env.VITE_API_URL ?? '').trim() || '';

const BUREAU_LABEL: Record<BureauKey, string> = {
  experian: 'Experian',
  equifax: 'Equifax',
  transunion: 'TransUnion'
};

const BUREAU_COLOR: Record<BureauKey, string> = {
  experian: '#1e40af',
  equifax: '#991b1b',
  transunion: '#0f766e'
};

const FIELD_ROWS: Array<{ key: keyof BureauAccountFields; label: string; isMoney?: boolean }> = [
  { key: 'accountNumber', label: 'Account #' },
  { key: 'highBalance', label: 'High Balance', isMoney: true },
  { key: 'lastVerified', label: 'Last Verified' },
  { key: 'dateOfLastActivity', label: 'Date of Last Activity' },
  { key: 'dateReported', label: 'Date Reported' },
  { key: 'dateOpened', label: 'Date Opened' },
  { key: 'balanceOwed', label: 'Balance Owed', isMoney: true },
  { key: 'closedDate', label: 'Closed Date' },
  { key: 'accountRating', label: 'Account Rating' },
  { key: 'accountDescription', label: 'Account Description' },
  { key: 'disputeStatus', label: 'Dispute Status' },
  { key: 'creditorType', label: 'Creditor Type' },
  { key: 'accountStatus', label: 'Account Status' },
  { key: 'paymentStatus', label: 'Payment Status' },
  { key: 'comments', label: 'Comments' },
  { key: 'paymentAmount', label: 'Payment Amount', isMoney: true },
  { key: 'dateOfLastPayment', label: 'Date of Last Payment' },
  { key: 'termMonths', label: 'No. of Months (terms)' },
  { key: 'pastDueAmount', label: 'Past Due Amount', isMoney: true },
  { key: 'accountType', label: 'Account Type' },
  { key: 'paymentFrequency', label: 'Payment Frequency' },
  { key: 'creditLimit', label: 'Credit Limit', isMoney: true }
];

const PROFILE_ROWS: Array<{ key: keyof PersonalProfileColumn; label: string }> = [
  { key: 'reportDate', label: 'Credit Report Date' },
  { key: 'name', label: 'Name' },
  { key: 'alsoKnownAs', label: 'Also Known As' },
  { key: 'dateOfBirth', label: 'Date of Birth' },
  { key: 'currentAddress', label: 'Current Address' },
  { key: 'previousAddresses', label: 'Previous Addresses' },
  { key: 'employers', label: 'Employers' }
];

function formatCurrency(n: number | null | undefined): string {
  if (n === null || n === undefined) return '';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function formatCell(value: unknown, isMoney = false): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join('\n');
  if (typeof value === 'number') return isMoney ? formatCurrency(value) : String(value);
  return String(value);
}

function severityScore(score: number | null): { color: string; label: string } {
  if (score === null) return { color: '#94a3b8', label: '—' };
  if (score >= 740) return { color: '#16a34a', label: 'Very Good' };
  if (score >= 670) return { color: '#65a30d', label: 'Good' };
  if (score >= 580) return { color: '#ca8a04', label: 'Fair' };
  return { color: '#dc2626', label: 'Poor' };
}

function ScoreGauge({ score, label, color }: { score: number | null; label: string; color: string }) {
  const sev = severityScore(score);
  return (
    <div className="score-gauge">
      <div className="score-gauge-label" style={{ color }}>{label}</div>
      <div className="score-gauge-circle" style={{ borderColor: sev.color }}>
        <div className="score-gauge-num">{score ?? '—'}</div>
        <div className="score-gauge-rating">{sev.label}</div>
      </div>
    </div>
  );
}

function PaymentHistoryRow({ history }: { history: PaymentHistoryGrid }) {
  const cellStyle = (val: string | null) => {
    if (val === null) return { background: '#f8fafc', color: '#94a3b8' };
    if (val === 'OK') return { background: '#dcfce7', color: '#166534' };
    if (val === 'UN') return { background: '#fef3c7', color: '#854d0e' };
    if (val === 'CO') return { background: '#fecaca', color: '#7f1d1d', fontWeight: 700 };
    if (/\d/.test(val)) return { background: '#fecaca', color: '#7f1d1d', fontWeight: 600 };
    return { background: '#f1f5f9', color: '#475569' };
  };
  return (
    <div className="payment-history">
      <div className="ph-title">Two-year payment history</div>
      <table className="ph-table">
        <thead>
          <tr>
            <th></th>
            {history.months.map((m, i) => <th key={i}>{m}</th>)}
          </tr>
        </thead>
        <tbody>
          {(['experian', 'equifax', 'transunion'] as const).map(b => (
            <tr key={b}>
              <td className="ph-bureau" style={{ color: BUREAU_COLOR[b] }}>{b === 'experian' ? 'XPN' : b === 'equifax' ? 'EFX' : 'TU'}</td>
              {history[b].map((cell, i) => (
                <td key={i} className="ph-cell" style={cellStyle(cell)}>{cell ?? ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AccountDetailBlock({ account }: { account: AccountDetail }) {
  const inconsistent = new Set(account.inconsistencies);
  return (
    <div className="account-block">
      <div className="account-block-header">{account.creditorName}</div>
      <table className="account-table">
        <thead>
          <tr>
            <th></th>
            {(['experian', 'equifax', 'transunion'] as const).map(b => (
              <th key={b} style={{ color: BUREAU_COLOR[b] }}>{BUREAU_LABEL[b]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FIELD_ROWS.map(row => {
            const isFlagged = inconsistent.has(row.key as string);
            return (
              <tr key={row.key as string}>
                <td className="account-table-label">{row.label}</td>
                {(['experian', 'equifax', 'transunion'] as const).map(b => {
                  const fields = account[b];
                  const v = fields ? (fields as Record<string, unknown>)[row.key as string] : null;
                  const isPresent = v !== null && v !== undefined && v !== '';
                  // Highlight only present cells on flagged rows; missing cells show muted.
                  const cellClass = isFlagged && isPresent ? 'cell-flagged' : '';
                  return (
                    <td key={b} className={`account-table-cell ${cellClass}`}>
                      {fields === null ? <span className="cell-missing">not reported</span> : formatCell(v, row.isMoney)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {account.paymentHistory && <PaymentHistoryRow history={account.paymentHistory} />}
    </div>
  );
}

function AccountSummaryTable({ rows, columns, title }: {
  rows: AccountSummaryRow[];
  columns: Array<'index' | 'type' | 'creditorName' | 'accountNumber' | 'status' | 'lastReported' | 'balance' | 'pastDue' | 'dateOpened'>;
  title?: string;
}) {
  if (!rows.length) return null;
  const colLabel: Record<string, string> = {
    index: 'Account', type: 'Type', creditorName: 'Name', accountNumber: 'Number',
    status: 'Status', lastReported: 'Last Reported', balance: 'Balance', pastDue: 'Past Due',
    dateOpened: 'Date Opened'
  };
  return (
    <div className="summary-table-wrap">
      {title && <div className="summary-table-title">{title}</div>}
      <table className="summary-table">
        <thead>
          <tr>{columns.map(c => <th key={c}>{colLabel[c]}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map(c => {
                const v = (r as Record<string, unknown>)[c];
                if (c === 'balance' || c === 'pastDue') return <td key={c}>{formatCurrency(v as number | null)}</td>;
                return <td key={c}>{v as string | number | null ?? ''}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PersonalProfileBlock({ profile }: { profile: PersonalProfile }) {
  // Detect inconsistent rows across bureaus
  const inconsistent = new Set<string>();
  for (const row of PROFILE_ROWS) {
    const values: string[] = [];
    for (const b of ['experian', 'equifax', 'transunion'] as const) {
      const col = profile[b];
      if (!col) continue;
      const v = col[row.key];
      if (v === null || v === undefined) continue;
      const s = Array.isArray(v) ? v.join('|').toLowerCase().trim() : String(v).toLowerCase().trim();
      if (s) values.push(s);
    }
    if (new Set(values).size > 1) inconsistent.add(row.key as string);
  }
  return (
    <div className="account-block">
      <div className="account-block-header">Personal Profile</div>
      <table className="account-table">
        <thead>
          <tr>
            <th></th>
            {(['experian', 'equifax', 'transunion'] as const).map(b => (
              <th key={b} style={{ color: BUREAU_COLOR[b] }}>{BUREAU_LABEL[b]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PROFILE_ROWS.map(row => {
            const flagged = inconsistent.has(row.key as string);
            return (
              <tr key={row.key as string}>
                <td className="account-table-label">{row.label}</td>
                {(['experian', 'equifax', 'transunion'] as const).map(b => {
                  const col = profile[b];
                  const v = col ? col[row.key] : null;
                  const isPresent = v !== null && v !== undefined && (Array.isArray(v) ? v.length > 0 : v !== '');
                  return (
                    <td key={b} className={`account-table-cell ${flagged && isPresent ? 'cell-flagged' : ''}`}>
                      {col === null ? <span className="cell-missing">not reported</span> : (Array.isArray(v) ? v.join(', ') : formatCell(v))}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {profile.publicRecords.length > 0 && (
        <div className="public-records">
          <strong>Public Records:</strong> {profile.publicRecords.join('; ')}
        </div>
      )}
      {profile.publicRecords.length === 0 && (
        <div className="public-records-empty">Public Records: No data found.</div>
      )}
    </div>
  );
}

export function AnalysisTab({ token, clientId, clientName }: AnalysisTabProps) {
  const [analysis, setAnalysis] = useState<CreditAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/clients/${clientId}/analysis`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        if (response.status === 404) { setAnalysis(null); return; }
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

  useEffect(() => { fetchAnalysis(); }, [clientId, token]);

  const inconsistencyCount = useMemo(() => {
    if (!analysis) return 0;
    return [...analysis.negativeAccounts, ...analysis.positiveAccounts].reduce((s, a) => s + a.inconsistencies.length, 0);
  }, [analysis]);

  if (loading) {
    return <div className="analysis-tab"><div className="analysis-loading">Loading analysis…</div></div>;
  }

  if (!analysis) {
    return (
      <div className="analysis-tab">
        <AnalysisStyles />
        <div className="analysis-empty">
          <h3>No analysis on file yet</h3>
          <p>Upload a 3-bureau credit report (PDF or HTML) and an analysis will be generated automatically. You can also generate one manually for {clientName}.</p>
          {error && <div className="analysis-error">{error}</div>}
          <button className="btn-primary" onClick={generateAnalysis} disabled={generating}>
            {generating ? 'Generating…' : 'Generate Credit Analysis'}
          </button>
        </div>
      </div>
    );
  }

  const { branding, clientProfile, bureauScores, summaryTiles, keyFactors, ficoFactors,
    negativesByCategory, personalProfile, negativeAccounts, positiveAccounts,
    disputeOpportunities, actionPlan, nextSteps } = analysis;

  return (
    <div className="analysis-tab">
      <AnalysisStyles />

      <div className="analysis-toolbar">
        <div>
          <strong>Credit Analysis Report</strong>
          <span className="muted"> · Generated {new Date(analysis.generatedAt).toLocaleString()}</span>
        </div>
        <div className="toolbar-actions">
          <button className="btn-secondary" onClick={() => window.print()}>Print / Save PDF</button>
          <button className="btn-primary" onClick={generateAnalysis} disabled={generating}>
            {generating ? 'Regenerating…' : 'Regenerate'}
          </button>
        </div>
      </div>

      {error && <div className="analysis-error">{error}</div>}

      {/* COVER */}
      <section className="report-section cover-section">
        <div className="cover-brand">{branding.companyName}</div>
        {branding.email && <div className="cover-contact">Email: {branding.email}</div>}
        <h1 className="cover-title">Credit Analysis Report For</h1>
        <h2 className="cover-name">{clientProfile.name}</h2>
        <p className="cover-tagline">This report provides an overview of which accounts are impacting your credit score.</p>
        <div className="cover-prepared">Prepared by</div>
        <div className="cover-prepared-name">{branding.companyName}</div>
        <div className="cover-date">{new Date(analysis.generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
      </section>

      {/* SCORE SNAPSHOT */}
      <section className="report-section">
        <h2 className="section-title">Credit Analysis</h2>
        <p className="section-sub">This report is an overview of your credit profile.</p>
        <div className="score-row">
          {(['EQUIFAX', 'EXPERIAN', 'TRANSUNION'] as const).map(b => {
            const s = bureauScores.find(x => x.bureau === b);
            const labelKey = b.toLowerCase() as BureauKey;
            return (
              <ScoreGauge
                key={b}
                score={s?.score ?? null}
                label={BUREAU_LABEL[labelKey]}
                color={BUREAU_COLOR[labelKey]}
              />
            );
          })}
        </div>
      </section>

      {/* SUMMARY TILES */}
      <section className="report-section two-col">
        <div className="tile-card">
          <div className="tile-title">Credit Cards & Loans</div>
          <div className="tile-sub">Open and closed accounts</div>
          <table className="tile-table">
            <tbody>
              <tr><td>Credit Cards</td><td>{summaryTiles.creditCards.total}</td></tr>
              <tr><td>Open Credit Cards</td><td>{summaryTiles.creditCards.open}</td></tr>
              <tr><td>Closed Credit Cards</td><td>{summaryTiles.creditCards.closed}</td></tr>
              <tr><td>Maxed Credit Cards</td><td>{summaryTiles.creditCards.maxed}</td></tr>
              <tr><td>Loan Accounts</td><td>{summaryTiles.loans.total}</td></tr>
              <tr><td>Open Loan Accounts</td><td>{summaryTiles.loans.open}</td></tr>
              <tr><td>Closed Loan Accounts</td><td>{summaryTiles.loans.closed}</td></tr>
            </tbody>
          </table>
        </div>
        <div className="tile-card">
          <div className="tile-title">Derogatory Accounts</div>
          <div className="tile-sub">Your negative items</div>
          <table className="tile-table">
            <tbody>
              <tr><td>Late Payments</td><td>{summaryTiles.derogatory.latePayments}</td><td>Short Sales</td><td>{summaryTiles.derogatory.shortSales}</td></tr>
              <tr><td>Collections</td><td>{summaryTiles.derogatory.collections}</td><td>Judgments</td><td>{summaryTiles.derogatory.judgments}</td></tr>
              <tr><td>Charge-Offs</td><td>{summaryTiles.derogatory.chargeOffs}</td><td>Tax Liens</td><td>{summaryTiles.derogatory.taxLiens}</td></tr>
              <tr><td>Repossessions</td><td>{summaryTiles.derogatory.repossessions}</td><td>Included in BK</td><td>{summaryTiles.derogatory.includedInBk}</td></tr>
              <tr><td>Foreclosures</td><td>{summaryTiles.derogatory.foreclosures}</td><td>Bankruptcies</td><td>{summaryTiles.derogatory.bankruptcies}</td></tr>
              <tr><td>Inquiries</td><td>{summaryTiles.derogatory.inquiries}</td><td className="td-strong">Total Negative</td><td className="td-strong-red">{summaryTiles.derogatory.totalNegative}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* KEY FACTORS — RECENT 24 MONTHS + STATUTE */}
      {keyFactors.recent24Months.length > 0 && (
        <section className="report-section">
          <h2 className="section-title">Key Factors</h2>
          <div className="grey-banner">Negative accounts within the first 24 months — most damaging to score</div>
          <AccountSummaryTable
            rows={keyFactors.recent24Months}
            columns={['index', 'type', 'creditorName', 'accountNumber', 'status', 'lastReported', 'balance', 'pastDue']}
          />
          <div className="explainer-box">
            <strong>Explanation / Course of action:</strong> Per FICO, derogatory items reported within the last 24 months are the most damaging to your score because of the recency. Our priority is to challenge any inaccurate, incomplete, or unverifiable account in this window first.
          </div>
        </section>
      )}

      {keyFactors.statuteOfLimitations.length > 0 && (
        <section className="report-section">
          <div className="grey-banner">Accounts within the statute of limitations where furnishers could possibly sue</div>
          <AccountSummaryTable
            rows={keyFactors.statuteOfLimitations}
            columns={['index', 'type', 'creditorName', 'accountNumber', 'status', 'dateOpened', 'balance', 'pastDue']}
          />
          <div className="explainer-box">
            <strong>Explanation / Course of action:</strong> Each state sets a statute of limitations on collection lawsuits. Accounts inside that window may still be enforceable in court — review with your representative before disputing in a way that re-ages the debt.
          </div>
        </section>
      )}

      {/* FICO 5 FACTORS */}
      <section className="report-section">
        <h2 className="section-title">Key Factors Regarding Your Credit Score</h2>
        <div className="fico-factors">
          {ficoFactors.map(f => (
            <div key={f.factor} className="fico-card">
              <div className="fico-head">{f.title} is {f.weight}% of your score</div>
              <div className="fico-body">{f.finding}</div>
              <div className="fico-action"><strong>Course of action:</strong> {f.courseOfAction}</div>
            </div>
          ))}
        </div>
      </section>

      {/* NEGATIVES BY CATEGORY */}
      {(negativesByCategory.collections.length || negativesByCategory.chargeOffs.length || negativesByCategory.latePayments.length) > 0 && (
        <section className="report-section">
          <h2 className="section-title">All Negative Accounts Listed</h2>
          {negativesByCategory.collections.length > 0 && (
            <AccountSummaryTable
              title="Collections"
              rows={negativesByCategory.collections}
              columns={['creditorName', 'accountNumber', 'status', 'dateOpened', 'balance', 'pastDue']}
            />
          )}
          {negativesByCategory.chargeOffs.length > 0 && (
            <AccountSummaryTable
              title="Charge-offs"
              rows={negativesByCategory.chargeOffs}
              columns={['creditorName', 'accountNumber', 'status', 'dateOpened', 'balance', 'pastDue']}
            />
          )}
          {negativesByCategory.latePayments.length > 0 && (
            <AccountSummaryTable
              title="Late Payments"
              rows={negativesByCategory.latePayments}
              columns={['creditorName', 'accountNumber', 'status', 'dateOpened', 'balance', 'pastDue']}
            />
          )}
        </section>
      )}

      {/* PERSONAL PROFILE */}
      <section className="report-section">
        <h2 className="section-title">Credit Report — Personal Profile</h2>
        <PersonalProfileBlock profile={personalProfile} />
      </section>

      {/* NEGATIVE ACCOUNTS DETAIL (3-BUREAU DIFF) */}
      {negativeAccounts.length > 0 && (
        <section className="report-section">
          <h2 className="section-title">Negative Accounts</h2>
          <p className="section-sub">Pink-highlighted cells show fields where bureaus disagree — each one is a disputable inaccuracy under FCRA § 611.</p>
          {negativeAccounts.map((a, i) => <AccountDetailBlock key={`${a.creditorName}-${i}`} account={a} />)}
        </section>
      )}

      {/* POSITIVE ACCOUNTS */}
      {positiveAccounts.length > 0 && (
        <section className="report-section">
          <h2 className="section-title">Positive Accounts</h2>
          <p className="section-sub">Accounts in good standing — protect these by paying on time and keeping balances low.</p>
          {positiveAccounts.map((a, i) => <AccountDetailBlock key={`${a.creditorName}-${i}`} account={a} />)}
        </section>
      )}

      {/* DISPUTE PLAN */}
      {disputeOpportunities.length > 0 && (
        <section className="report-section">
          <h2 className="section-title">Dispute Plan & Reasoning</h2>
          <p className="section-sub">{disputeOpportunities.length} dispute opportunities identified. {inconsistencyCount} based on cross-bureau inconsistencies.</p>
          <div className="dispute-list">
            {disputeOpportunities.map((d, i) => (
              <div key={i} className="dispute-card">
                <div className="dispute-head">
                  <div>
                    <div className="dispute-name">{d.accountName}</div>
                    {d.accountNumber && <div className="dispute-acct">acct {d.accountNumber}</div>}
                  </div>
                  <span className={`badge badge-${d.priority}`}>{d.priority}</span>
                </div>
                <div className="dispute-issue">{d.issue}</div>
                <div className="dispute-reason"><strong>Reason:</strong> {d.reason}</div>
                <div className="dispute-bureaus">
                  {d.bureaus.map(b => <span key={b} className="bureau-pill">{BUREAU_LABEL[b]}</span>)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ACTION PLAN */}
      <section className="report-section">
        <h2 className="section-title">Recommended Action Plan</h2>
        <div className="phase-list">
          {actionPlan.map(p => (
            <div key={p.phase} className="phase-card">
              <div className="phase-num">{p.phase}</div>
              <div className="phase-body">
                <div className="phase-title">{p.title}</div>
                <div className="phase-desc">{p.description}</div>
                <div className="phase-weeks">~{p.estimatedWeeks} weeks</div>
                <ul className="phase-tasks">
                  {p.tasks.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* NEXT STEPS */}
      <section className="report-section">
        <h2 className="section-title">Next Steps to a Better Credit Score</h2>
        {nextSteps.map((n, i) => (
          <div key={i} className="next-step-card">
            <div className="next-step-title">{n.title}</div>
            <div className="next-step-desc">{n.description}</div>
            <ul className="next-step-bullets">
              {n.bullets.map((b, bi) => <li key={bi}>{b}</li>)}
            </ul>
          </div>
        ))}
      </section>

      {/* CLOSER */}
      <section className="report-section closer-section">
        <h2 className="closer-title">Welcome to the family</h2>
        <p className="closer-tagline">We are ready to assist with improving your credit score.</p>
        <div className="closer-brand">{branding.companyName}</div>
        {branding.email && <div className="closer-contact">{branding.email}</div>}
        {branding.website && <div className="closer-contact">{branding.website}</div>}
        {branding.phone && <div className="closer-contact">{branding.phone}</div>}
      </section>
    </div>
  );
}

function AnalysisStyles() {
  return (
    <style>{`
      .analysis-tab { padding: 1.5rem; max-width: 1100px; margin: 0 auto; }
      .analysis-loading, .analysis-empty { text-align: center; padding: 3rem; color: #64748b; }
      .analysis-empty { background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 14px; }
      .analysis-empty h3 { margin: 0 0 .5rem; color: #1e293b; }
      .analysis-error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: .75rem; border-radius: 6px; margin: 1rem 0; }
      .btn-primary { padding: .65rem 1.25rem; border: none; border-radius: 8px; background: #2563eb; color: #fff; font-weight: 600; cursor: pointer; font-size: .875rem; }
      .btn-primary:hover { background: #1d4ed8; }
      .btn-primary:disabled { opacity: .6; cursor: not-allowed; }
      .btn-secondary { padding: .65rem 1.25rem; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; color: #334155; font-weight: 500; cursor: pointer; font-size: .875rem; }
      .btn-secondary:hover { background: #f1f5f9; }

      .analysis-toolbar { display: flex; justify-content: space-between; align-items: center; padding: .75rem 1rem; background: #f8fafc; border-radius: 8px; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem; }
      .toolbar-actions { display: flex; gap: .5rem; }
      .muted { color: #64748b; font-weight: 400; }

      .report-section { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.5rem 1.75rem; margin-bottom: 1.5rem; box-shadow: 0 6px 18px rgba(15, 23, 42, .04); }
      .section-title { margin: 0 0 .25rem; font-size: 1.4rem; color: #0f172a; text-align: center; }
      .section-sub { margin: 0 0 1.25rem; color: #64748b; text-align: center; font-size: .9rem; }

      .cover-section { text-align: center; padding: 3rem 2rem; }
      .cover-brand { font-size: 1.1rem; font-weight: 700; color: #0f172a; }
      .cover-contact { color: #64748b; font-size: .9rem; margin-bottom: 2rem; }
      .cover-title { font-size: 1.5rem; color: #334155; font-weight: 500; margin: 0; }
      .cover-name { font-size: 2.5rem; color: #0f172a; margin: .25rem 0 1rem; }
      .cover-tagline { color: #64748b; font-size: .95rem; margin-bottom: 3rem; }
      .cover-prepared { color: #475569; font-size: 1rem; }
      .cover-prepared-name { font-size: 1.5rem; font-weight: 700; color: #0f172a; margin: .25rem 0; }
      .cover-date { color: #64748b; font-size: .95rem; }

      .score-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; align-items: center; }
      .score-gauge { text-align: center; }
      .score-gauge-label { font-size: 1.25rem; font-weight: 700; margin-bottom: .5rem; }
      .score-gauge-circle { width: 140px; height: 140px; margin: 0 auto; border-radius: 50%; border: 8px solid; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #fff; }
      .score-gauge-num { font-size: 2rem; font-weight: 800; color: #0f172a; }
      .score-gauge-rating { font-size: .8rem; color: #64748b; }

      .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
      .tile-card { background: #fff; }
      .tile-title { background: #e2e8f0; text-align: center; font-weight: 700; padding: .75rem; border-radius: 6px 6px 0 0; }
      .tile-sub { text-align: center; color: #64748b; font-size: .85rem; padding: .5rem 0; }
      .tile-table { width: 100%; border-collapse: collapse; font-size: .9rem; }
      .tile-table td { padding: .5rem .75rem; border-top: 1px solid #f1f5f9; }
      .tile-table td:nth-child(2), .tile-table td:nth-child(4) { text-align: right; font-weight: 600; }
      .td-strong { font-weight: 700; }
      .td-strong-red { color: #dc2626; font-weight: 700; }

      .grey-banner { background: #e2e8f0; padding: .75rem 1rem; font-weight: 700; text-align: center; border-radius: 6px; margin-bottom: 1rem; color: #0f172a; }
      .summary-table-wrap { margin-bottom: 1.25rem; }
      .summary-table-title { background: #e2e8f0; padding: .6rem 1rem; font-weight: 700; text-align: center; border-radius: 6px 6px 0 0; }
      .summary-table { width: 100%; border-collapse: collapse; font-size: .85rem; }
      .summary-table th { background: #f8fafc; padding: .5rem; text-align: left; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #475569; font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; }
      .summary-table td { padding: .5rem; border-bottom: 1px solid #f1f5f9; }
      .summary-table tr:hover { background: #f8fafc; }
      .explainer-box { background: #f8fafc; border-left: 3px solid #2563eb; padding: .75rem 1rem; margin-top: .5rem; font-size: .85rem; color: #475569; line-height: 1.5; border-radius: 4px; }

      .fico-factors { display: grid; gap: 1rem; }
      .fico-card { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
      .fico-head { background: #f1f5f9; padding: .65rem 1rem; font-weight: 700; color: #0f172a; }
      .fico-body { padding: .75rem 1rem; color: #475569; line-height: 1.5; font-size: .9rem; }
      .fico-action { padding: .65rem 1rem; background: #fafbfc; border-top: 1px solid #f1f5f9; font-size: .85rem; color: #0f172a; }

      .account-block { margin-bottom: 1.5rem; }
      .account-block-header { background: #475569; color: #fff; padding: .65rem 1rem; font-weight: 700; border-radius: 6px 6px 0 0; }
      .account-table { width: 100%; border-collapse: collapse; font-size: .82rem; }
      .account-table th { padding: .65rem .5rem; background: #fff; font-weight: 700; font-size: 1rem; text-align: center; border-bottom: 2px solid #e2e8f0; }
      .account-table-label { padding: .55rem .75rem; background: #fff; color: #475569; font-weight: 600; text-align: right; border-bottom: 1px solid #f1f5f9; width: 24%; }
      .account-table-cell { padding: .55rem .75rem; text-align: center; border-bottom: 1px solid #f1f5f9; color: #0f172a; }
      .cell-flagged { background: #fef2f2; color: #991b1b; font-weight: 600; }
      .cell-missing { color: #cbd5e1; font-style: italic; font-size: .8em; }

      .payment-history { margin-top: .75rem; }
      .ph-title { font-weight: 600; color: #0f172a; margin-bottom: .35rem; font-size: .85rem; }
      .ph-table { width: 100%; border-collapse: collapse; font-size: .65rem; }
      .ph-table th { padding: .15rem .25rem; text-align: center; font-weight: 500; color: #64748b; font-size: .7rem; }
      .ph-bureau { text-align: right; font-weight: 700; padding-right: .35rem; font-size: .75rem; }
      .ph-cell { padding: .15rem; text-align: center; border: 1px solid #fff; font-size: .65rem; min-width: 1.4rem; }

      .public-records { padding: .75rem 1rem; background: #f8fafc; border-radius: 4px; margin-top: .5rem; font-size: .85rem; }
      .public-records-empty { padding: .5rem 1rem; color: #94a3b8; font-size: .85rem; font-style: italic; text-align: center; }

      .dispute-list { display: grid; gap: .75rem; }
      .dispute-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; }
      .dispute-head { display: flex; justify-content: space-between; align-items: flex-start; gap: .5rem; margin-bottom: .5rem; }
      .dispute-name { font-weight: 700; color: #0f172a; }
      .dispute-acct { font-size: .75rem; color: #94a3b8; }
      .dispute-issue { color: #475569; font-size: .9rem; margin-bottom: .35rem; }
      .dispute-reason { font-size: .85rem; color: #0f172a; background: #f8fafc; padding: .5rem .75rem; border-left: 3px solid #2563eb; border-radius: 4px; margin-bottom: .5rem; }
      .dispute-bureaus { display: flex; gap: .35rem; }
      .bureau-pill { padding: .15rem .55rem; background: #eff6ff; color: #2563eb; border-radius: 999px; font-size: .7rem; font-weight: 600; }
      .badge { padding: .2rem .65rem; border-radius: 999px; font-size: .7rem; font-weight: 700; text-transform: uppercase; }
      .badge-high { background: #fef2f2; color: #dc2626; }
      .badge-medium { background: #fefce8; color: #ca8a04; }
      .badge-low { background: #f0fdf4; color: #16a34a; }

      .phase-list { display: grid; gap: 1rem; }
      .phase-card { display: flex; gap: 1rem; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; }
      .phase-num { flex-shrink: 0; width: 2rem; height: 2rem; border-radius: 50%; background: #2563eb; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; }
      .phase-body { flex: 1; }
      .phase-title { font-weight: 700; color: #0f172a; }
      .phase-desc { color: #475569; font-size: .9rem; margin: .25rem 0; }
      .phase-weeks { color: #2563eb; font-size: .8rem; font-weight: 600; margin-bottom: .35rem; }
      .phase-tasks { list-style: none; padding: 0; margin: 0; }
      .phase-tasks li { font-size: .85rem; color: #334155; padding-left: 1rem; position: relative; padding-bottom: .15rem; }
      .phase-tasks li::before { content: '→'; position: absolute; left: 0; color: #2563eb; }

      .next-step-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: .75rem; }
      .next-step-title { font-weight: 700; color: #0f172a; margin-bottom: .35rem; }
      .next-step-desc { color: #475569; font-size: .9rem; line-height: 1.5; margin-bottom: .5rem; }
      .next-step-bullets { padding-left: 1.25rem; margin: 0; color: #334155; font-size: .85rem; }

      .closer-section { text-align: center; padding: 3rem 2rem; }
      .closer-title { font-size: 2rem; margin: 0 0 .5rem; color: #0f172a; }
      .closer-tagline { color: #64748b; margin-bottom: 2rem; }
      .closer-brand { font-size: 1.5rem; font-weight: 700; color: #0f172a; }
      .closer-contact { color: #475569; font-size: .95rem; }

      @media print {
        .analysis-toolbar { display: none; }
        .report-section { page-break-inside: avoid; box-shadow: none; border: 1px solid #ddd; }
        .account-block { page-break-inside: avoid; }
      }
    `}</style>
  );
}
