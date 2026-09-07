# CredX Architecture

## CURRENT

CredX is a Node/TypeScript monorepo with:

- `apps/api`: Express API with auth, clients, leads, contracts, disputes, billing, progress, masterclass, Cesar, monitoring, sub-agent, credit-score, and email-event routes.
- `apps/web`: Vite/React app plus static public pages served by `server.mjs`.
- `packages/db`: Prisma schema for PostgreSQL.
- `packages/email`: email templates/helpers.
- `packages/shared`: shared package placeholder and letter support.

Current request path:

Browser -> Railway web service -> static files / API proxy -> Railway API service -> Prisma -> PostgreSQL

Optional providers:

- Email: Resend first, SendGrid fallback, SMTP fallback.
- Billing: PayPal and Stripe.
- Document storage: Vercel Blob for private uploads where configured; legacy/local document references still exist.
- AI: Vercel AI Gateway for report extraction/Cesar paths, Anthropic direct path for response ingest.
- Anti-abuse: Cloudflare Turnstile for public forms where configured.
- Mailing: Lob route exists for dispute-letter mailing.

## IMPLEMENTED

- Health endpoint at `/health`.
- Separate database health endpoint at `/health/db`.
- Global, auth, lead, and Cesar rate limiting.
- JWT auth with role-based middleware.
- Prisma models for users, clients, leads, disputes, documents, payments, audit logs, activities, credit reports, scores, and sub-agent referrals.
- PII encryption helper for SSN/DOB fields when `PII_ENCRYPTION_KEY` is configured.

## PLANNED

- Central SaaS entitlement service and plan model.
- Async job/worker layer for email, report generation, AI analysis, webhook retries, and notifications.
- Organization/multi-tenant professional workspace.
- Product analytics and error monitoring.
