import React, { useMemo, useState } from 'react';

type Status = 'Not Started' | 'In Progress' | 'Completed';

type Agency = {
  name: string;
  category: 'Major Bureaus' | 'Specialty Reporting' | 'Banking Reports';
  actionLabel: string;
  url: string;
  note: string;
};

const agencies: Agency[] = [
  { name: 'Experian', category: 'Major Bureaus', actionLabel: 'Manage Freeze', url: 'https://www.experian.com/help/credit-freeze/', note: 'Freeze or unfreeze your Experian credit file.' },
  { name: 'Equifax', category: 'Major Bureaus', actionLabel: 'Manage Freeze', url: 'https://www.equifax.com/personal/credit-report-services/credit-freeze/', note: 'Freeze or unfreeze your Equifax credit file.' },
  { name: 'TransUnion', category: 'Major Bureaus', actionLabel: 'Manage Freeze', url: 'https://www.transunion.com/credit-freeze', note: 'Freeze or unfreeze your TransUnion credit file.' },
  { name: 'LexisNexis', category: 'Specialty Reporting', actionLabel: 'Freeze / Opt Out', url: 'https://consumer.risk.lexisnexis.com/', note: 'Manage eligible consumer disclosure, freeze, and opt-out actions.' },
  { name: 'Innovis', category: 'Specialty Reporting', actionLabel: 'Manage Freeze', url: 'https://www.innovis.com/personal/securityFreeze', note: 'Manage an Innovis security freeze.' },
  { name: 'CoreLogic', category: 'Specialty Reporting', actionLabel: 'Consumer Resources', url: 'https://www.corelogic.com/privacy-policy/', note: 'Access CoreLogic consumer privacy and disclosure resources.' },
  { name: 'ChexSystems', category: 'Banking Reports', actionLabel: 'Open ChexSystems', url: 'https://www.chexsystems.com/', note: 'Request reports, review banking records, and manage disputes.' },
  { name: 'Early Warning Services', category: 'Banking Reports', actionLabel: 'Consumer Services', url: 'https://www.earlywarning.com/consumer-information', note: 'Access consumer disclosure and dispute resources.' }
];

export default function PrivacySecurityCommandPost() {
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const grouped = useMemo(() => agencies.reduce<Record<string, Agency[]>>((acc, agency) => {
    (acc[agency.category] ||= []).push(agency);
    return acc;
  }, {}), []);

  const completed = Object.values(statuses).filter((value) => value === 'Completed').length;

  return (
    <section className="card" aria-labelledby="privacy-security-title">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">CredX Client Protection</p>
          <h2 id="privacy-security-title">Credit Privacy & Security Command Post</h2>
          <p>Manage freezes, opt-outs, specialty reports, banking-report disputes, and your Caesar-assisted progress in one place.</p>
        </div>
        <div className="status-pill">{completed} of {agencies.length} marked complete</div>
      </div>

      <div className="notice-card">
        <strong>Self-reported tracking:</strong> CredX helps you organize and track actions. Agency portals remain the source of record, and you control final submission and identity verification.
      </div>

      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} className="privacy-agency-group">
          <h3>{category}</h3>
          <div className="privacy-agency-grid">
            {items.map((agency) => {
              const status = statuses[agency.name] ?? 'Not Started';
              return (
                <article key={agency.name} className="privacy-agency-card">
                  <div>
                    <h4>{agency.name}</h4>
                    <p>{agency.note}</p>
                  </div>
                  <div className="privacy-agency-actions">
                    <a className="ghost-button" href={agency.url} target="_blank" rel="noreferrer">{agency.actionLabel} →</a>
                    <select
                      aria-label={`${agency.name} status`}
                      value={status}
                      onChange={(event) => setStatuses((current) => ({ ...current, [agency.name]: event.target.value as Status }))}
                    >
                      <option>Not Started</option>
                      <option>In Progress</option>
                      <option>Completed</option>
                    </select>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ))}

      <div className="privacy-caesar-panel">
        <div>
          <p className="eyebrow">Caesar Activity Center</p>
          <h3>Assisted actions</h3>
          <p>Caesar can prepare forms, organize documents, and guide the workflow. Client action is required for identity checks, CAPTCHAs, credentials, and final authorization.</p>
        </div>
        <div className="privacy-status-flow">Not Started → Caesar Preparing → Client Action Required → Submitted → Waiting for Response → Completed</div>
      </div>

      <div className="privacy-chexsystems-panel">
        <p className="eyebrow">ChexSystems Workspace</p>
        <h3>Report and dispute workflow</h3>
        <div className="privacy-status-flow">Get Report → Review Accounts → Start Dispute → Upload Evidence → Track 30-Day Window → Results → Next Action</div>
      </div>
    </section>
  );
}
