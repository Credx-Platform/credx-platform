# Security

## CURRENT

- Express API uses Helmet.
- CORS is restricted to configured origins in production.
- Global and route-specific rate limits are configured.
- JWT authentication and role checks are present.
- Passwords use bcrypt.
- PII encryption helper exists for SSN/DOB using `PII_ENCRYPTION_KEY`.
- Response sanitizer middleware strips sensitive fields from JSON responses.
- Cloudflare Turnstile is supported for public form protection.
- Private Vercel Blob document handling and signed URLs exist where configured.

## IMPLEMENTED THIS CYCLE

- Removed hardcoded PostgreSQL URL from local database smoke-test helpers.
- Added database health check without exposing connection details.
- Mounted health checks before the global rate limiter.

## GAPS

- No central error-monitoring provider is evident.
- No product analytics privacy policy mapping is evident.
- Backup and restore policy is not documented in provider-backed detail.
- Local ignored files previously contained a hardcoded database URL; assume that credential needs rotation if it was ever valid.
- Some legacy document references can still point to local paths or public URLs.

## RULES

- Never commit `.env` files, API keys, database URLs, or provider tokens.
- Do not collect SSN unless the product flow truly requires it and encryption is configured.
- Do not send full financial profiles, SSNs, documents, passwords, or tokens to analytics.
- Webhook handlers must verify signatures and be idempotent.
