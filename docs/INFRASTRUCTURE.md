# CredX Infrastructure

## CURRENT

Known from repository configuration:

- Hosting: Railway is the current live target for `credxme.com` and `www.credxme.com`.
- Web service: `railway.web.json` and current `railway.json` build `npm run build:web`, start `npm run start:web`, health-check `/`.
- API service: `railway.api.json` builds `npm run build:api`, starts `npm run start:api`, health-checks `/health`.
- Database: PostgreSQL via Prisma `DATABASE_URL`.
- Storage: Vercel Blob library for private document upload/signing.
- Email: Resend, SendGrid, and SMTP paths.
- Payments: Stripe and PayPal SDK/API paths.
- AI: Vercel AI Gateway plus direct Anthropic response-ingest route.
- Bot/ops notification: OpenClaw signup webhook path.
- Bot protection: Cloudflare Turnstile.

## CURRENT MAP

Browser
-> CredX Web
-> static assets and page routes
-> `/api/*` proxy
-> CredX API
-> PostgreSQL

CredX API
-> Resend / SendGrid / SMTP
-> Stripe / PayPal
-> Vercel Blob
-> AI Gateway / Anthropic
-> Lob
-> OpenClaw webhook

## GAPS

- Redis/queue service is not evident in the codebase.
- PgBouncer is not evident in the codebase.
- Sentry/PostHog or equivalent monitoring/analytics are not evident in the codebase.
- Backup policy is not documented in the repository.
- The default `railway.json` is web-shaped; API deploys require the API manifest or a manifest swap.
