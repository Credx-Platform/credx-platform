import { useEffect, useMemo, useState, type FormEvent } from 'react';

const API_BASE = (import.meta.env.VITE_API_URL ?? '').trim() ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:3000'
    : '');

type Partner = {
  name: string;
  email?: string | null;
  affiliateId: string;
  referralCode: string;
  referralLink: string;
  policyAcceptedAt?: string | null;
  programTier: 'CREATOR' | 'AMBASSADOR' | 'PARTNER';
  initialCommissionBps: number;
  recurringCommissionBps: number;
  recurringMonths: number;
  overrideCommissionBps: number;
  payoutHoldDays: number;
};

type Status =
  | { kind: 'loading' }
  | { kind: 'invalid'; message: string }
  | { kind: 'ready'; partner: Partner }
  | { kind: 'submitting'; partner: Partner }
  | { kind: 'success'; setupLink: string };

export default function AffiliateOnboarding() {
  const rawToken = useMemo(() => typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('token') ?? '', []);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [accepted, setAccepted] = useState(false);
  const [signature, setSignature] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!rawToken) {
      setStatus({ kind: 'invalid', message: 'This Creator Partner onboarding link is missing its secure token.' });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${API_BASE}/api/sub-agents/onboarding/${encodeURIComponent(rawToken)}`);
        const text = await response.text();
        const body = text ? JSON.parse(text) : null;
        if (cancelled) return;
        if (!response.ok) {
          setStatus({ kind: 'invalid', message: body?.error ?? 'This Creator Partner onboarding link is invalid or expired.' });
          return;
        }
        setStatus({ kind: 'ready', partner: body.subAgent as Partner });
      } catch (error) {
        if (!cancelled) setStatus({ kind: 'invalid', message: error instanceof Error ? error.message : 'Unable to verify partner link.' });
      }
    })();
    return () => { cancelled = true; };
  }, [rawToken]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status.kind !== 'ready') return;
    setFormError(null);
    if (!accepted) {
      setFormError('You must accept the Creator Partner Agreement before login setup.');
      return;
    }
    if (signature.trim().length < 2) {
      setFormError('Type your legal name in the signature box.');
      return;
    }
    setStatus({ kind: 'submitting', partner: status.partner });
    try {
      const response = await fetch(`${API_BASE}/api/sub-agents/onboarding/${encodeURIComponent(rawToken)}/sign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accepted, signature: signature.trim() })
      });
      const text = await response.text();
      const body = text ? JSON.parse(text) : null;
      if (!response.ok) {
        setFormError(body?.error ?? 'Could not save the Creator Partner Agreement signature.');
        setStatus({ kind: 'ready', partner: status.partner });
        return;
      }
      setStatus({ kind: 'success', setupLink: body.setupLink });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save the Creator Partner Agreement signature.');
      setStatus({ kind: 'ready', partner: status.partner });
    }
  };

  if (status.kind === 'loading') return <div className="auth-shell"><div className="auth-card"><p className="eyebrow">CredX Creator Partner</p><h1>Verifying your link...</h1><p className="helper-text">One moment while we confirm your secure partner onboarding link.</p></div></div>;

  if (status.kind === 'invalid') return <div className="auth-shell"><div className="auth-card"><p className="eyebrow">CredX Creator Partner</p><h1>This link cannot be used</h1><div className="error-banner">{status.message}</div><p className="helper-text">Ask CredX to resend your Creator Partner onboarding email.</p></div></div>;

  if (status.kind === 'success') return <div className="auth-shell"><div className="auth-card"><p className="eyebrow">CredX Creator Partner</p><h1>Agreement signed</h1><p className="helper-text">Your secure Partner Dashboard setup link is ready. We also emailed it to you.</p><a className="button-link" href={status.setupLink}>Set up Partner Dashboard login</a></div></div>;

  const partner = status.partner;
  const submitting = status.kind === 'submitting';
  const tier = partner.programTier.charAt(0) + partner.programTier.slice(1).toLowerCase();

  return (
    <div className="auth-shell">
      <form className="auth-card affiliate-policy-card" onSubmit={submit} method="post">
        <p className="eyebrow">CredX Creator Partner</p>
        <h1>Creator Partner Agreement</h1>
        <p className="helper-text">Hi {partner.name}. Review and sign the agreement below, then activate your Partner Dashboard.</p>
        <div className="affiliate-policy-summary">
          <strong>Partner ID</strong><span>{partner.affiliateId}</span>
          <strong>Tracking link</strong><code>{partner.referralLink}</code>
          <strong>Program tier</strong><span>{tier}</span>
          <strong>Commission schedule</strong><span>{partner.initialCommissionBps / 100}% initial · {partner.recurringCommissionBps / 100}% recurring for up to {partner.recurringMonths} months</span>
        </div>
        <div className="policy-box">
          <p><strong>1. Independent contractor.</strong> You are an independent contractor, not a CredX employee, legal representative, franchisee, or joint venturer. You control when and how you promote approved CredX offers and are responsible for your own expenses and taxes.</p>
          <p><strong>2. Attribution and commissions.</strong> Commissions apply only to qualifying payments CredX collects from customers attributed through your assigned tracking link or code. Your current schedule is {partner.initialCommissionBps / 100}% of an initial qualifying payment and {partner.recurringCommissionBps / 100}% of qualifying subscription payments for up to {partner.recurringMonths} months. An approved partner you directly recruit may generate a {partner.overrideCommissionBps / 100}% override on that partner's qualifying direct sales. CredX records determine attribution, subject to good-faith correction of errors.</p>
          <p><strong>3. Payouts, refunds, and chargebacks.</strong> Commissions are reviewed monthly and become eligible after a {partner.payoutHoldDays}-day refund and chargeback hold. Refunds, chargebacks, duplicate transactions, fraud, self-referrals, unauthorized incentives, or unpaid balances void or reverse the related commission. CredX may offset reversals against future commissions.</p>
          <p><strong>4. No earnings or consumer-result guarantees.</strong> CredX does not guarantee income, traffic, conversions, or recurring revenue. You may not promise deletions, score increases, funding, approvals, loans, credit limits, timelines, legal representation, or any particular consumer result.</p>
          <p><strong>5. Approved marketing and disclosures.</strong> Use current CredX-approved claims, scripts, links, and brand assets. Clearly and conspicuously disclose your financial relationship with CredX wherever you promote it, including social posts, Stories, Reels, Lives, videos, and direct endorsements. A disclosure such as “Paid partner of CredX” or “I may earn a commission” must be easy to notice and understand.</p>
          <p><strong>6. Brand and content rights.</strong> You retain ownership of original content you create. By submitting approved partnership content to CredX, you grant CredX a non-exclusive, worldwide, royalty-free license during the partnership and for 12 months afterward to repost, display, and promote that content with attribution. Any broader paid-ad or perpetual usage requires separate written approval.</p>
          <p><strong>7. Authority and customer data.</strong> You may not bind CredX, change pricing, negotiate contracts, issue refunds, collect customer payments, or present yourself as a CredX credit, legal, lending, or financial expert unless separately authorized in writing. Keep customer activity inside CredX; do not download, retain, or request Social Security numbers, reports, identity documents, payment data, or other sensitive information.</p>
          <p><strong>8. Training and monitoring.</strong> Complete required disclosure and claims training, follow updated guidance, and cooperate with reasonable monitoring or correction requests. CredX may pause a link or content while reviewing a compliance concern.</p>
          <p><strong>9. Termination.</strong> Either party may end the partnership. Properly earned recurring commissions on customers referred before termination continue under the schedule above, unless termination resulted from fraud, material misrepresentation, data misuse, or another serious violation. CredX may immediately terminate for those violations.</p>
          <p><strong>10. Program changes.</strong> CredX may change future commission rates, tiers, offers, or program rules with written notice. Changes do not reduce commissions already earned under the terms in effect when the qualifying payment was collected.</p>
          <p><strong>Agreement version:</strong> creator-partner-v1-2026-09-28.</p>
        </div>
        <label className="checkbox-row"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} disabled={submitting} /><span>I have read and agree to the CredX Creator Partner Agreement, including the commission, disclosure, approved-claims, data, and termination terms.</span></label>
        <label><span>Signature</span><input value={signature} onChange={(event) => setSignature(event.target.value)} placeholder="Type your legal name" disabled={submitting} /></label>
        {formError ? <div className="error-banner">{formError}</div> : null}
        <button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Sign agreement and continue'}</button>
      </form>
    </div>
  );
}
