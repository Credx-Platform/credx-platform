import { useEffect, useMemo, useState, type FormEvent } from 'react';

const API_BASE = (import.meta.env.VITE_API_URL ?? '').trim() ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:3000'
    : '');

type AffiliateVerifyResponse = {
  subAgent: {
    name: string;
    email?: string | null;
    affiliateId: string;
    referralCode: string;
    referralLink: string;
    policyAcceptedAt?: string | null;
  };
};

type Status =
  | { kind: 'loading' }
  | { kind: 'invalid'; message: string }
  | { kind: 'ready'; affiliate: AffiliateVerifyResponse['subAgent'] }
  | { kind: 'submitting'; affiliate: AffiliateVerifyResponse['subAgent'] }
  | { kind: 'success'; setupLink: string };

export default function AffiliateOnboarding() {
  const rawToken = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('token') ?? '';
  }, []);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [accepted, setAccepted] = useState(false);
  const [signature, setSignature] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!rawToken) {
      setStatus({ kind: 'invalid', message: 'This affiliate onboarding link is missing its secure token.' });
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
          setStatus({ kind: 'invalid', message: body?.error ?? 'This affiliate onboarding link is invalid or expired.' });
          return;
        }
        setStatus({ kind: 'ready', affiliate: (body as AffiliateVerifyResponse).subAgent });
      } catch (error) {
        if (!cancelled) setStatus({ kind: 'invalid', message: error instanceof Error ? error.message : 'Unable to verify affiliate link.' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rawToken]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status.kind !== 'ready') return;
    setFormError(null);
    if (!accepted) {
      setFormError('You must confirm the affiliate policy before login setup.');
      return;
    }
    if (signature.trim().length < 2) {
      setFormError('Type your legal name in the signature box.');
      return;
    }
    setStatus({ kind: 'submitting', affiliate: status.affiliate });
    try {
      const response = await fetch(`${API_BASE}/api/sub-agents/onboarding/${encodeURIComponent(rawToken)}/sign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accepted, signature: signature.trim() })
      });
      const text = await response.text();
      const body = text ? JSON.parse(text) : null;
      if (!response.ok) {
        setFormError(body?.error ?? 'Could not save affiliate policy signature.');
        setStatus({ kind: 'ready', affiliate: status.affiliate });
        return;
      }
      setStatus({ kind: 'success', setupLink: body.setupLink });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save affiliate policy signature.');
      setStatus({ kind: 'ready', affiliate: status.affiliate });
    }
  };

  if (status.kind === 'loading') {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <p className="eyebrow">CredX Affiliate</p>
          <h1>Verifying your link...</h1>
          <p className="helper-text">One moment while we confirm your secure affiliate onboarding link.</p>
        </div>
      </div>
    );
  }

  if (status.kind === 'invalid') {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <p className="eyebrow">CredX Affiliate</p>
          <h1>This link cannot be used</h1>
          <div className="error-banner">{status.message}</div>
          <p className="helper-text">Ask CredX to resend your affiliate onboarding email.</p>
        </div>
      </div>
    );
  }

  if (status.kind === 'success') {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <p className="eyebrow">CredX Affiliate</p>
          <h1>Policy confirmed</h1>
          <p className="helper-text">Your secure admin login setup link is ready. We also emailed it to you.</p>
          <a className="button-link" href={status.setupLink}>Set up sub-agent admin login</a>
        </div>
      </div>
    );
  }

  const affiliate = status.affiliate;
  const submitting = status.kind === 'submitting';

  return (
    <div className="auth-shell">
      <form className="auth-card affiliate-policy-card" onSubmit={submit} method="post">
        <p className="eyebrow">CredX Affiliate</p>
        <h1>Affiliate policy acknowledgment</h1>
        <p className="helper-text">
          Hi {affiliate.name}. Review the policy below, sign it, then the next page will set up your sub-agent admin login.
        </p>
        <div className="affiliate-policy-summary">
          <strong>Affiliate ID</strong>
          <span>{affiliate.affiliateId}</span>
          <strong>Referral link</strong>
          <code>{affiliate.referralLink}</code>
        </div>
        <div className="policy-box">
          <p>CredX provides credit education, credit-report review support, lawful dispute strategy, and financial rebuilding guidance. Affiliates may introduce prospects to CredX using their assigned referral link.</p>
          <p>Affiliates must not promise deletions, guaranteed score increases, guaranteed approvals, guaranteed funding, or legal representation. Affiliates must not tell consumers to lie, fabricate facts, or submit inaccurate information.</p>
          <p>Affiliates must clearly explain that Cesar and CredX analysis tools are AI-assisted education and workflow support, not a lawyer, lender, credit bureau, or guaranteed-results service.</p>
          <p>Affiliate marketing must be truthful, clear, and respectful. CredX may pause or remove an affiliate link if the affiliate misrepresents CredX services or violates these rules.</p>
        </div>
        <label className="checkbox-row">
          <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} disabled={submitting} />
          <span>I have read and agree to the CredX affiliate policy.</span>
        </label>
        <label>
          <span>Signature</span>
          <input value={signature} onChange={(event) => setSignature(event.target.value)} placeholder="Type your legal name" disabled={submitting} />
        </label>
        {formError ? <div className="error-banner">{formError}</div> : null}
        <button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Confirm policy'}</button>
      </form>
    </div>
  );
}
