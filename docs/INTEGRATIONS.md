# Integrations

## CURRENT

- Railway: hosting/deploy target.
- PostgreSQL: Prisma database.
- Vercel Blob: private document storage/signed URLs.
- Resend: primary email path.
- SendGrid: email fallback and event webhook route.
- SMTP: email fallback.
- Stripe: webhook/payment handling.
- PayPal: order/capture/webhook handling.
- Lob: dispute letter mailing route.
- Cloudflare Turnstile: public-form bot protection.
- Vercel AI Gateway: AI provider abstraction.
- Anthropic: direct response-ingest AI route.
- OpenClaw: signup notification webhook.
- MyFreeScoreNow: credit score API helper if configured.

## GAPS

- No central integration registry.
- No uniform retry/backoff worker for external calls.
- No central provider status surface.
- No product analytics provider is wired in.
- No Sentry or equivalent error monitoring is evident.

## RULE

Optional integration failure must not crash the core CredX application.
