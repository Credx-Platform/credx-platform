import React, { useEffect, useMemo, useState } from 'react';

export type PrivacySecurityCommand = 'FREEZE' | 'UNFREEZE' | 'REQUEST_REPORT' | 'OPT_OUT' | 'DISPUTE';

export type PrivacySecurityAgencyAction = {
  command: PrivacySecurityCommand;
  label: string;
  url: string;
};

export type PrivacySecurityAgency = {
  code: string;
  name: string;
  category: 'Major Bureaus' | 'Specialty Reporting' | 'Banking Reports';
  note: string;
  actions: PrivacySecurityAgencyAction[];
};

export type PrivacySecurityRequest = {
  id: string;
  key: string;
  title: string;
  description?: string | null;
  status: string;
  completedAt?: string | null;
  updatedAt: string;
  metadata?: {
    agencyCode?: string;
    agencyName?: string;
    command?: PrivacySecurityCommand;
    stage?: string;
    officialUrl?: string;
    requestedAt?: string;
  };
};

export type PrivacySecurityState = {
  agencies: PrivacySecurityAgency[];
  requests: PrivacySecurityRequest[];
};

type Props = {
  loadState: () => Promise<PrivacySecurityState>;
  requestAction: (input: { agencyCode: string; command: PrivacySecurityCommand; consent: true }) => Promise<unknown>;
  resolveAction: (id: string, outcome: 'CLIENT_COMPLETED' | 'CANCELLED') => Promise<unknown>;
};

const stageLabels: Record<string, string> = {
  REQUESTED: 'Requested',
  CLIENT_ACTION_REQUIRED: 'Client action required',
  CLIENT_CONFIRMED_COMPLETE: 'Completed',
  CANCELLED: 'Cancelled'
};

function requestFor(requests: PrivacySecurityRequest[], agencyCode: string, command: PrivacySecurityCommand) {
  return requests.find((request) => request.metadata?.agencyCode === agencyCode && request.metadata?.command === command);
}

export default function PrivacySecurityCommandPost({ loadState, requestAction, resolveAction }: Props) {
  const [state, setState] = useState<PrivacySecurityState>({ agencies: [], requests: [] });
  const [selected, setSelected] = useState<{ agency: PrivacySecurityAgency; action: PrivacySecurityAgencyAction } | null>(null);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const next = await loadState();
    setState(next);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadState()
      .then((next) => { if (!cancelled) setState(next); })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load privacy and security actions.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadState]);

  const grouped = useMemo(() => state.agencies.reduce<Record<string, Agency[]>>((acc, agency) => {
    (acc[agency.category] ||= []).push(agency);
    return acc;
  }, {}), [state.agencies]);
  const completed = state.requests.filter((request) => request.status === 'COMPLETED').length;
  const active = state.requests.filter((request) => ['OPEN', 'IN_PROGRESS'].includes(request.status)).length;

  const submit = async () => {
    if (!selected || !consent) return;
    const id = `${selected.agency.code}:${selected.action.command}`;
    setPending(id);
    setError(null);
    try {
      await requestAction({ agencyCode: selected.agency.code, command: selected.action.command, consent: true });
      await refresh();
      setSelected(null);
      setConsent(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create this request.');
    } finally {
      setPending(null);
    }
  };

  const resolve = async (request: PrivacySecurityRequest, outcome: 'CLIENT_COMPLETED' | 'CANCELLED') => {
    setPending(request.id);
    setError(null);
    try {
      await resolveAction(request.id, outcome);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update this request.');
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <section className="hero-card hero-card--section privacy-security-hero">
        <div>
          <p className="eyebrow">CredX Client Protection</p>
          <h1>Privacy &amp; Security</h1>
          <p>Request and track credit-file freezes, specialty reports, banking-report actions, and dispute preparation from one secure workspace.</p>
        </div>
        <div className="privacy-security-summary" aria-label="Privacy and security request summary">
          <strong>{active}</strong><span>active</span>
          <strong>{completed}</strong><span>completed</span>
        </div>
      </section>

      <section className="panel privacy-security-notice">
        <strong>You stay in control.</strong>
        <p>CredX can prepare, organize, queue, and track your request. You complete any identity verification, credentials, CAPTCHA, and final authorization required by the official reporting-company portal.</p>
      </section>

      {error ? <div className="error-banner" role="alert">{error}</div> : null}
      {loading ? <section className="panel"><p>Loading privacy and security options…</p></section> : null}

      {!loading && Object.entries(grouped).map(([category, agencies]) => (
        <section key={category} className="panel privacy-agency-group">
          <div className="panel-header"><div><p className="eyebrow">Protection Directory</p><h2>{category}</h2></div></div>
          <div className="privacy-agency-grid">
            {agencies.map((agency) => (
              <article key={agency.code} className={`privacy-agency-card${agency.code === 'chexsystems' ? ' privacy-agency-card--featured' : ''}`}>
                <div>
                  <h3>{agency.name}</h3>
                  <p>{agency.note}</p>
                </div>
                <div className="privacy-command-list">
                  {agency.actions.map((action) => {
                    const request = requestFor(state.requests, agency.code, action.command);
                    const stage = request?.metadata?.stage || (request?.status === 'COMPLETED' ? 'CLIENT_CONFIRMED_COMPLETE' : request?.status === 'DISMISSED' ? 'CANCELLED' : '');
                    const isActive = request && ['OPEN', 'IN_PROGRESS'].includes(request.status);
                    return (
                      <div className="privacy-command-row" key={action.command}>
                        <div>
                          <strong>{action.label}</strong>
                          {request ? <span className={`privacy-request-status privacy-request-status--${request.status.toLowerCase()}`}>{stageLabels[stage] || request.status.replace(/_/g, ' ')}</span> : null}
                        </div>
                        <div className="privacy-command-actions">
                          <a href={action.url} target="_blank" rel="noopener noreferrer" className="ghost-button">Official site ↗</a>
                          {!isActive ? <button type="button" onClick={() => { setSelected({ agency, action }); setConsent(false); }}>{request?.status === 'COMPLETED' ? 'Request again' : action.label}</button> : null}
                        </div>
                        {request && isActive ? (
                          <div className="privacy-request-controls">
                            <button type="button" disabled={pending === request.id} onClick={() => void resolve(request, 'CLIENT_COMPLETED')}>Mark complete</button>
                            <button type="button" className="ghost-button" disabled={pending === request.id} onClick={() => void resolve(request, 'CANCELLED')}>Cancel request</button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      <section className="panel privacy-workflow-panel">
        <div className="panel-header"><div><p className="eyebrow">ChexSystems Dispute Workflow</p><h2>From report request to tracked response</h2></div></div>
        <ol className="privacy-workflow-steps">
          <li>Request the consumer disclosure</li>
          <li>Upload the report and supporting evidence securely</li>
          <li>CredX prepares a factual dispute for review</li>
          <li>You approve and complete any required final submission</li>
          <li>Track the investigation response window and result</li>
        </ol>
      </section>

      {selected ? (
        <div className="privacy-confirmation-backdrop" role="presentation" onClick={() => setSelected(null)}>
          <section className="privacy-confirmation-card" role="dialog" aria-modal="true" aria-labelledby="privacy-confirmation-title" onClick={(event) => event.stopPropagation()}>
            <p className="eyebrow">Confirm command</p>
            <h2 id="privacy-confirmation-title">{selected.action.label} — {selected.agency.name}</h2>
            <p>CredX will prepare and track this request. No password, security answer, or third-party credential is requested here.</p>
            <label className="privacy-consent-row">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              <span>I authorize CredX to prepare and track this request. I understand that I may need to complete identity verification, CAPTCHA, credentials, and final authorization on the official agency site.</span>
            </label>
            <div className="privacy-confirmation-actions">
              <button type="button" className="ghost-button" onClick={() => setSelected(null)}>Cancel</button>
              <button type="button" disabled={!consent || pending !== null} onClick={() => void submit()}>{pending ? 'Submitting…' : 'Submit request'}</button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
