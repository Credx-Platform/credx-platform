import { useEffect, useMemo, useState, type FormEvent } from 'react';

const API_BASE = (import.meta.env.VITE_API_URL ?? '').trim() ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:3000'
    : '');

const TOKEN_KEY = 'credx-client-token';
const USER_KEY = 'credx-client-user';

type VerifyResponse = {
  valid: true;
  email: string;
  firstName: string;
  purpose: 'setup' | 'reset';
  expiresAt: string;
};

type CompleteResponse = {
  user: { id: string; email: string; firstName: string; lastName: string; role: 'CLIENT' | 'STAFF' | 'ADMIN' };
  token: string;
};

type Status =
  | { kind: 'verifying' }
  | { kind: 'invalid'; message: string }
  | { kind: 'ready'; verify: VerifyResponse }
  | { kind: 'submitting'; verify: VerifyResponse }
  | { kind: 'success' };

export default function SetPassword() {
  const rawToken = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('token') ?? '';
  }, []);

  const [status, setStatus] = useState<Status>({ kind: 'verifying' });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!rawToken) {
      setStatus({ kind: 'invalid', message: 'This link is missing its security token. Request a new email and try again.' });
      return;
    }
    if (!API_BASE) {
      setStatus({ kind: 'invalid', message: 'Portal is not configured for this environment. Please contact support.' });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${API_BASE}/api/auth/password-setup/verify?token=${encodeURIComponent(rawToken)}`);
        const text = await response.text();
        const body = text ? JSON.parse(text) : null;
        if (cancelled) return;
        if (!response.ok) {
          setStatus({ kind: 'invalid', message: body?.error ?? 'This link is invalid or expired.' });
          return;
        }
        setStatus({ kind: 'ready', verify: body as VerifyResponse });
      } catch (error) {
        if (cancelled) return;
        setStatus({ kind: 'invalid', message: error instanceof Error ? error.message : 'Unable to verify link.' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rawToken]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status.kind !== 'ready') return;
    setFormError(null);

    if (password.length < 8) {
      setFormError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setFormError('Passwords do not match.');
      return;
    }

    setStatus({ kind: 'submitting', verify: status.verify });
    try {
      const response = await fetch(`${API_BASE}/api/auth/password-setup/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: rawToken, password })
      });
      const text = await response.text();
      const body = text ? JSON.parse(text) : null;
      if (!response.ok) {
        setFormError(body?.error ?? 'Could not set password.');
        setStatus({ kind: 'ready', verify: status.verify });
        return;
      }

      const complete = body as CompleteResponse;
      localStorage.setItem(TOKEN_KEY, complete.token);
      localStorage.setItem(USER_KEY, JSON.stringify(complete.user));
      setStatus({ kind: 'success' });
      window.location.assign('/portal');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not set password.');
      setStatus({ kind: 'ready', verify: status.verify });
    }
  };

  if (status.kind === 'verifying') {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <p className="eyebrow">CredX Portal</p>
          <h1>Verifying your link…</h1>
          <p className="helper-text">One moment while we confirm your secure setup link.</p>
        </div>
      </div>
    );
  }

  if (status.kind === 'invalid') {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <p className="eyebrow">CredX Portal</p>
          <h1>This link can't be used</h1>
          <div className="error-banner">{status.message}</div>
          <p className="helper-text">
            For security, setup links expire after 72 hours and can only be used once. Email <a href="mailto:hello@credxme.com">hello@credxme.com</a> and we'll send a fresh link.
          </p>
        </div>
      </div>
    );
  }

  if (status.kind === 'success') {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <p className="eyebrow">CredX Portal</p>
          <h1>Password saved</h1>
          <p className="helper-text">Taking you to your portal…</p>
        </div>
      </div>
    );
  }

  const verify = status.verify;
  const isReset = verify.purpose === 'reset';
  const headline = isReset ? 'Reset your CredX password' : 'Set up your CredX password';
  const submitting = status.kind === 'submitting';

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={handleSubmit} method="post" autoComplete="on" noValidate>
        <p className="eyebrow">CredX Portal</p>
        <h1>{headline}</h1>
        <p className="helper-text">
          Hi {verify.firstName || 'there'} — choose a password for <strong>{verify.email}</strong>. You'll use it to sign in to your portal at credxme.com/portal.
        </p>
        <label htmlFor="setup-password">
          <span>New password</span>
        </label>
        <div className="password-field-row">
          <input
            id="setup-password"
            name="new-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
            disabled={submitting}
          />
          <button type="button" className="ghost-button password-toggle" onClick={() => setShowPassword((current) => !current)} aria-controls="setup-password" aria-label={showPassword ? 'Hide password' : 'Show password'}>
            {showPassword ? 'Hide' : 'View'}
          </button>
        </div>
        <label htmlFor="setup-password-confirm">
          <span>Confirm password</span>
        </label>
        <div className="password-field-row">
          <input
            id="setup-password-confirm"
            name="confirm-password"
            type={showConfirm ? 'text' : 'password'}
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder="Re-enter password"
            disabled={submitting}
          />
          <button type="button" className="ghost-button password-toggle" onClick={() => setShowConfirm((current) => !current)} aria-controls="setup-password-confirm" aria-label={showConfirm ? 'Hide password' : 'Show password'}>
            {showConfirm ? 'Hide' : 'View'}
          </button>
        </div>
        {formError ? <div className="error-banner">{formError}</div> : null}
        <button type="submit" disabled={submitting}>{submitting ? 'Saving…' : isReset ? 'Reset password' : 'Set password & continue'}</button>
        <p className="helper-text">Link expires {new Date(verify.expiresAt).toLocaleString()}.</p>
      </form>
    </div>
  );
}
