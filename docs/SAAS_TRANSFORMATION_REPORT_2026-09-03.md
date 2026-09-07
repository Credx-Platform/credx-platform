# CredX SaaS Transformation Report - 2026-09-03

## 1. Existing Architecture

CredX is an Express/TypeScript API plus Vite/React web monorepo using Prisma/PostgreSQL. It already includes user auth, roles, client portal workflows, admin CRM, leads, contracts, disputes, payments, document handling, education/masterclass progress, Cesar AI, and several external integrations.

## 2. Infrastructure Map

Browser -> CredX Web -> static pages and `/api/*` proxy -> CredX API -> PostgreSQL.

CredX API also integrates with Resend, SendGrid, SMTP, Stripe, PayPal, Vercel Blob, Cloudflare Turnstile, Vercel AI Gateway, Anthropic, Lob, MyFreeScoreNow, and OpenClaw webhook paths when configured.

## 3. Changes Implemented

- Added `/health/db` database dependency check.
- Moved API health routes before the global rate limiter.
- Removed hardcoded PostgreSQL URL from local API smoke-test helpers.
- Added product-first `/product` page.
- Updated homepage metadata, hero positioning, CTA text, and footer platform link.
- Added `/product` server route and sitemap entry.
- Added centralized plan and entitlement definitions in `apps/api/src/lib/entitlements.ts`.
- Updated `/api/billing/plans` to use the central plan catalog.
- Added authenticated `/api/billing/entitlements/me` for current-user entitlement lookup.
- Added authenticated `/api/progress/readiness` for the proprietary CredX Readiness Score.
- Added authenticated `/api/progress/readiness/snapshot` backed by a dedicated readiness snapshot table.
- Added focused tests for the readiness scoring engine.
- Added a member-portal overview panel that displays the CredX Readiness Score, data-quality status, next-best actions, lowest scoring areas, and the non-FICO disclosure.
- Added Phase 0 SaaS documentation set.
- Created pending Skill Workshop proposal: `credx-saas-transformation-20260903-c1e8473ed3`.

## 4. New SaaS Capabilities

- Public `/product` page now explains current CredX platform modules and clearly marks future SaaS modules as planned.
- API now has separate core and database health signals.
- API now has a single code-level source for Masterclass, Essential, Premium, and Family plan entitlements. Intake review remains a pre-plan flow, not a SaaS plan.
- Authenticated users can now request a CredX Readiness Score derived from their profile, report, analysis, education, and task signals.
- Authenticated users can now save readiness score snapshots and view recent score history in the portal.
- The member portal now presents the readiness score as an actual dashboard module instead of leaving the metric API-only.

## 5. Reliability Improvements

- Core health checks are no longer subject to the general API rate limiter.
- Database health is isolated at `/health/db`; optional AI/email/payment/storage providers are not required for core health.

## 6. Database Changes

Added pending Prisma migration `20260903072000_add_readiness_score_snapshots` for `ReadinessScoreSnapshot`, with an index on `(clientId, createdAt)` and a backfill for any early marker-based snapshots. The live score still computes from existing client, progress, task, and credit-report data; persisted snapshots store the calculated score, label, data quality, categories, strengths, opportunities, and next-best actions.

## 7. Infrastructure Changes

No live infrastructure was changed. Railway manifests were documented; deployment was not performed.

## 8. Before vs After Positioning

Before: homepage and README leaned toward credit education/credit repair portal language.

After: first public surface now leads with "Credit Intelligence & Financial Readiness Platform" while keeping support and dispute-related workflows accurate and non-guaranteed.

## 9. SaaS Score

Current estimate from `docs/SAAS_AUDIT.md`: 5.2/10. Target remains 9.5+/10 after phased implementation.

## 10. Remaining Gaps

- Central plan/entitlement model.
- Deeper CredX Readiness Score next-best-action mapping.
- Worker/queue architecture.
- Organization/team model and tenant isolation tests.
- Product analytics and error monitoring.
- Provider-verified backup/restore runbook.

## 11. Security Findings

Critical: hardcoded PostgreSQL URL existed in ignored local smoke-test helpers. Removed locally; rotate the credential if it was valid.

Medium: no central monitoring provider evident.

Medium: backup/restore policy not documented from provider settings.

Low: duplicate Prisma schema path exists and should be reconciled.

## 12. Compliance Review Items

- Legal review recommended before broad public repositioning from service-forward to software-platform-forward.
- Keep CROA/FCRA disclosures and no-guarantee language intact.
- Do not claim bureau integration, funding approvals, deletions, or legal representation.

## 13. Test Results

- `npm run build:api`: passed.
- `npm run build:web`: passed with existing large chunk warning for `html2pdf`.
- `npm run build:api`: passed again after entitlement changes.
- `npm run test:readiness`: passed.
- `npm run build:api`: passed after readiness endpoint wiring.
- `npm run build:web`: passed after member-portal readiness panel wiring, with the existing large chunk warning for `html2pdf`.
- `npm run prisma:generate`: passed after readiness snapshot schema addition.
- `npm run test:readiness`: passed after readiness snapshot persistence wiring.
- `npm run build:api`: passed after readiness snapshot persistence wiring.
- Local smoke: `GET /product` returned 200 from web server.
- Local smoke: homepage contains updated platform positioning and product CTA.

## 14. Deployment Status

Not Ready.

Reason: repository has a large pre-existing dirty worktree, no staging verification was performed, and no owner-approved production deploy was attempted.

## 15. Required Environment Variables

Names only:

- `DATABASE_URL`
- `JWT_SECRET`
- `APP_URL`
- `API_URL`
- `CORS_ALLOWED_ORIGINS`
- `PII_ENCRYPTION_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `SENDGRID_API_KEY`
- `SENDGRID_FROM_EMAIL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_WEBHOOK_ID`
- `BLOB_READ_WRITE_TOKEN`
- `TURNSTILE_SECRET_KEY`
- `TURNSTILE_SITE_KEY`
- `AI_GATEWAY_API_KEY`
- `ANTHROPIC_API_KEY`
- `LOB_API_KEY`
- `MYFREESCORENOW_API_KEY`
- `OPENCLAW_SIGNUP_WEBHOOK_URL`
- `OPENCLAW_SIGNUP_WEBHOOK_TOKEN`

## 16. External Dependencies

- Railway service confirmation.
- Database backup confirmation.
- Credential rotation for exposed PostgreSQL URL if valid.
- Monitoring provider selection.
- Analytics provider selection.
- Legal review of SaaS positioning and terms/disclosures.

## 17. Infrastructure Risks

- Queue/worker absence can make AI, email, report, and webhook work too synchronous as usage grows.
- PgBouncer/pooling status is unconfirmed.
- Default `railway.json` is web-shaped and can misdeploy API if used blindly.
- Large frontend chunks should be code-split before scale.

## 18. Next 10 Highest-Impact Tasks

1. Rotate any credential represented by the removed hardcoded PostgreSQL URL.
2. Confirm Railway web/API services and active manifests.
3. Confirm PostgreSQL backups, retention, and restore steps.
4. Reconcile duplicate Prisma schema file.
5. Add centralized plan and entitlement models/service.
6. Add deeper readiness next-best-action mapping and automated periodic snapshots.
7. Add webhook event ledger and idempotency table.
8. Add worker/queue architecture for email, AI, reports, and retries.
9. Add organization/member/client-assignment model and authorization tests.
10. Add Sentry or equivalent monitoring with PII-safe metadata.
