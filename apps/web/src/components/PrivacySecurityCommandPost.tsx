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
  category: 'Credit Bureaus' | 'Specialty & Third-Party Reports' | 'ChexSystems';
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
  mode?: 'client' | 'admin';
  clientLabel?: string;
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

export default function PrivacySecurityCommandPost({ loadState, requestAction, resolveAction, mode = 'client', clientLabel }: Props) {
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

  const grouped = useMemo(() => state.agencies.reduce<Record<string, PrivacySecurityAgency[]>>((acc, agency) => {
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
          <p className="eyebrow">{mode === 'admin' ? 'CredX Staff Workspace' : 'CredX Client Protection'}</p>
          <h1>{mode === 'admin' && clientLabel ? `Privacy & Security — ${clientLabel}` : 'Privacy & Security'}</h1>
          <p>Open official reporting-company pages and keep a dated record of freezes, specialty reports, and ChexSystems actions.</p>
        </div>
        <div className="privacy-security-summary" aria-label="Privacy and security request summary">
          <strong>{active}</strong><span>active</span>
          <strong>{completed}</strong><span>completed</span>
        </div>
      </section>

      <section className="panel privacy-security-notice">
        <strong>{mode === 'admin' ? 'Confirm authorization before starting.' : 'You stay in control.'}</strong>
        <p>{mode === 'admin'
          ? 'Staff may open and track an authorized request for this client. The client completes identity verification, credentials, CAPTCHA, freeze PIN handling, and final authorization on the official reporting-company portal.'
          : 'Use the direct official links below. CredX can also organize and track the step, while you complete identity verification, credentials, CAPTCHA, freeze PIN handling, and final authorization on the reporting-company portal.'}</p>
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
                          <a href={action.url} target="_blank" rel="noopener noreferrer" className="ghost-button">Open official site ↗</a>
                          {!isActive ? <button type="button" onClick={() => { setSelected({ agency, action }); setConsent(false); }}>{request?.status === 'COMPLETED' ? 'Track again' : mode === 'admin' ? 'Start for client' : 'Track this step'}</button> : null}
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

      <section className="panel privacy-workflow-panel">
        <div className="panel-header"><div><p className="eyebrow">Activity Log</p><h2>Freeze and reporting history</h2></div></div>
        {state.requests.length ? (
          <div className="privacy-admin-list">
            {[...state.requests].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).map((request) => (
              <article className="privacy-admin-card" key={request.id}>
                <div>
                  <span className={`privacy-request-status privacy-request-status--${request.status.toLowerCase()}`}>{(request.metadata?.stage || request.status).replace(/_/g, ' ')}</span>
                  <h4>{request.title}</h4>
                  <small>Started {request.metadata?.requestedAt ? new Date(request.metadata.requestedAt).toLocaleString() : new Date(request.updatedAt).toLocaleString()}</small>
                  {request.completedAt ? <small> · Completed {new Date(request.completedAt).toLocaleString()}</small> : null}
                </div>
              </article>
            ))}
          </div>
        ) : <p className="helper-text">No freezes or reporting actions have been logged for this client yet.</p>}
      </section>

      {selected ? (
        <div className="privacy-confirmation-backdrop" role="presentation" onClick={() => setSelected(null)}>
          <section className="privacy-confirmation-card" role="dialog" aria-modal="true" aria-labelledby="privacy-confirmation-title" onClick={(event) => event.stopPropagation()}>
            <p className="eyebrow">Confirm command</p>
            <h2 id="privacy-confirmation-title">{selected.action.label} — {selected.agency.name}</h2>
            <p>{mode === 'admin'
              ? 'CredX will open a dated tracking record for this client. Do not enter or store a password, security answer, freeze PIN, or CAPTCHA response here.'
              : 'CredX will open a dated tracking record. No password, security answer, freeze PIN, or third-party credential is requested here.'}</p>
            <label className="privacy-consent-row">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              <span>{mode === 'admin'
                ? 'I confirm the client authorized CredX to start and track this action. I understand the client must complete identity verification, credentials, CAPTCHA, freeze PIN handling, and final authorization.'
                : 'I authorize CredX to prepare and track this request. I understand that I must complete identity verification, credentials, CAPTCHA, freeze PIN handling, and final authorization on the official agency site.'}</span>
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
