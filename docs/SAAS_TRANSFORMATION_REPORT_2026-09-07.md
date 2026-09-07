# CredX SaaS Transformation Report — 2026-09-07

Branch: `saas-transformation` (off `main`). No production deployment performed.

## 1. Existing Architecture

Express/TypeScript API + Vite/React web, npm workspaces monorepo, Prisma +
PostgreSQL (`packages/db`). Existing capabilities: JWT auth + roles, client
portal, admin CRM, leads, contracts, disputes (CDM-style dispute items/rounds),
payments (Stripe + PayPal), document handling (Vercel Blob), education /
masterclass progress, Cesar AI (Vercel AI Gateway / Anthropic), sub-agent
referral system, credit-report extraction + analysis.

## 2. Infrastructure Map

```
Browser
  -> CredX Web (Railway @credx/web, Vite build + Node static server, /api proxy)
  -> CredX API (Railway @credx/api, Express, health /health + /health/db)
       -> PostgreSQL (Railway plugin)
       -> Resend / SendGrid / SMTP   (email, multi-provider fallback)
       -> Stripe / PayPal            (payments + webhooks)
       -> Vercel Blob                (documents)
       -> Vercel AI Gateway / Anthropic (Cesar, extraction)
       -> Cloudflare Turnstile       (bot protection)
       -> Lob                        (physical mail)
       -> MyFreeScoreNow             (credit score pull)
       -> OpenClaw webhook           (signup notifications)
```

No Redis, no PgBouncer, no external APM. Cron via `scripts/*-cron.mjs`.

## 3. Changes Implemented (this cycle)

**Phase A — stabilize the uncommitted 09-03/09-04 work (commit `fff0b11`):**

- Restored 4 real Prisma migrations that had been deleted; removed the dangerous
  full-schema squash `20260904100000_init`.
- Added `00000000000000_baseline` (pre-SaaS schema) and one additive,
  idempotent SaaS migration `20260907120000_saas_transformation_additive`
  (no DROP, no type changes). Added missing `migration_lock.toml`. Verified the
  full 6-migration chain applies cleanly to an empty PostgreSQL 16 with zero
  drift vs `schema.prisma`. Adoption runbook: `packages/db/prisma/migrations/README.md`.
- Removed the legacy duplicate schema `packages/db/prisma.schema.prisma`; updated
  `docs/DATABASE.md`.
- Fixed build-blocking TS errors in `apps/api/src/lib/actionPlan.ts`
  (possibly-undefined category scores; `task` used-before-declaration).
- `Task.updatedAt` gets `@default(now())` to stay drift-free / safe on existing rows.

**Phase B — roadmap increments:**

- `feat(saas)` commit `5035247`: central entitlement resolution
  (`resolveClientEntitlements` + FREE tier) so unpaid clients cannot receive paid
  entitlements from a `serviceTier` field; wired `/api/billing/entitlements/me`.
  New `apps/api/src/lib/tenancy.ts` pure authorization helpers
  (`assertOrgAccess`, `assertSameTenant`, `scopeToTenant`, role ranking);
  org routes refactored onto them; invitation acceptance now verifies the token
  hash instead of trusting any pending invite for the caller's email.
- `feat(saas)` commit `0839ec4`: `apps/api/src/lib/analytics.ts` — env-gated,
  no-op-by-default product analytics with recursive PII stripping; wired
  `account_created` and `readiness_score_created`.

## 4. New SaaS Capabilities (that actually work now)

- Entitlement lookup that reflects real payment/lifecycle state, with
  `{ plan, entitlements, pastDue, paid }` from `/api/billing/entitlements/me`.
- Reusable tenant-isolation guards enforced in the org routes; cross-tenant and
  insufficient-role access return `403` with a machine code.
- Token-hash-verified organization invitation acceptance.
- Analytics + error capture that are safe when unconfigured.
- A migration workflow that can be adopted on production without data loss.

## 5. Reliability Improvements

- Migration chain verified reproducibly; rollback path documented.
- Error ledger (`lib/sentry.ts` → `ErrorEvent`) already wired into the global
  error handler; now also in org routes. Fire-and-forget, self-swallowing.
- Analytics delivery is fire-and-forget and never throws into a request.
- Job queue primitives (`lib/queue.ts`) are DB-backed — no Redis dependency;
  absence of a runner simply means nothing is enqueued yet.

## 6. Database Changes

- `00000000000000_baseline/migration.sql` — 18 tables, all enums (represents
  current prod).
- `20260907120000_saas_transformation_additive/migration.sql` — adds:
  `SubAgent`, `SubAgentContact`, `CreditScore`, `ReadinessScoreSnapshot`,
  `WebhookEvent`, `IdempotencyKey`, `JobQueue`, `WorkerHeartbeat`,
  `Organization`, `OrganizationMember`, `OrganizationInvitation`, `ErrorEvent`;
  enums `WebhookEventStatus`, `JobStatus`, `OrganizationRole`;
  `Role.AFFILIATE`; `Client.customerType/organizationId/referralCodeAtSignup/referredBySubAgentId`;
  `Task.updatedAt`. Indexes on all new FK/lookup paths. No destructive statements.
- Single canonical schema at `packages/db/prisma/schema.prisma`.

## 7. Infrastructure Changes

None applied. Railway manifests (`railway.api.json`, `railway.web.json`,
`railway.json`) are committed and documented. `railway.json` is still
API-shaped, which matches the API service.

## 8. Before vs After Positioning

Before: service-forward ("credit repair / education portal"). After (public
surface): "Credit Intelligence & Financial Readiness Platform" with product page
and product-first nav, while dispute workflows keep accurate, non-guaranteed
language and CROA/FCRA disclosures. App internals and Terms still read
service-forward and need attorney-reviewed copy before broader repositioning.

## 9. SaaS Score

Per `docs/SAAS_AUDIT.md`: **5.3 → 5.9 / 10**. Target 9.5+. This cycle was
predominantly stabilization plus entitlement/tenancy/analytics foundations.

## 10. Remaining Gaps

- Persistent `Subscription`/`Invoice` models + payment reconciliation.
- Job queue runner + producers (email, AI, reports, webhook retries).
- Webhook ledger not yet wired into Stripe/PayPal/DocuSign handlers.
- Org creation route, client assignments, DB-level tenant-isolation integration tests.
- Deeper readiness next-best-action mapping + scheduled snapshots.
- External APM + analytics provider provisioning; more analytics call sites.
- Verified Postgres backup schedule/retention; PgBouncer evaluation.
- Web code-splitting (html2pdf ~985 kB chunk).
- Attorney review of SaaS positioning + Terms/Disclosures split.

## 11. Security Findings

- **High (fixed):** org invitation acceptance trusted any pending invite for the
  caller's email, ignoring the token. Now verified by `tokenHash`.
- **Medium:** no external error monitoring / alerting; DB ledger only.
- **Medium:** Postgres backup/retention unverified.
- **Low (fixed):** duplicate Prisma schema removed.
- **Low:** `WebhookEvent`/`IdempotencyKey` exist but webhook handlers don't use
  them yet — replay protection is still handler-specific.
- **Carryover:** rotate the DB credential from the previously hardcoded URL if it
  was ever valid (flagged 2026-09-03).

## 12. Compliance Review Items

- Attorney review before broad public repositioning from service- to
  software-forward; Terms should separate "CredX Platform Subscription" from
  "Optional Professional / Credit-Related Support".
- Keep CROA/FCRA disclosures + no-guarantee language intact (unchanged this cycle).
- Readiness Score retains "not a consumer credit score" disclosure (verified in tests).
- No bureau integration / funding approval / deletion guarantee language introduced.

## 13. Test Results

- `npm run build:api` — pass (all cycles).
- `npm run build:web` — pass (pre-existing html2pdf large-chunk warning).
- `npm test` (new; runs `apps/api/tests/*.test.ts`) — 22 pass / 0 fail
  (`readinessScore` 3, `entitlements` 8, `tenancy` 7, `analytics` 4).
- `npm run test:readiness` — pass.
- Migration chain vs throwaway PostgreSQL 16 — 6/6 apply, no drift.
- Smoke tests of live HTTP flows: not run (no running instance this cycle).

## 14. Deployment Status

**Not Ready** — build + unit tests are green, but: no staging verification, no
running-instance smoke test, migration adoption on prod requires the
owner-approved `prisma migrate resolve` + `deploy` sequence, and the DB backup
schedule is unverified.

## 15. Required Environment Variables (names only)

Existing: `DATABASE_URL`, `JWT_SECRET`, `APP_URL`, `API_URL`,
`CORS_ALLOWED_ORIGINS`, `PII_ENCRYPTION_KEY`, `RESEND_API_KEY`,
`RESEND_FROM_EMAIL`, `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `SMTP_HOST`,
`SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`,
`PAYPAL_WEBHOOK_ID`, `BLOB_READ_WRITE_TOKEN`, `TURNSTILE_SECRET_KEY`,
`TURNSTILE_SITE_KEY`, `AI_GATEWAY_API_KEY`, `ANTHROPIC_API_KEY`, `LOB_API_KEY`,
`MYFREESCORENOW_API_KEY`, `OPENCLAW_SIGNUP_WEBHOOK_URL`,
`OPENCLAW_SIGNUP_WEBHOOK_TOKEN`.

New (all optional; features no-op when unset): `SENTRY_DSN`, `SENTRY_ENABLED`,
`REDIS_URL`, `WORKER_ID`, `ANALYTICS_ENABLED`, `POSTHOG_API_KEY`,
`POSTHOG_HOST`.

## 16. External Dependencies (James must configure)

- Railway: confirm web/API service config + active manifest; confirm Postgres
  automated backup schedule + retention.
- Run the one-time `prisma migrate resolve --applied` baseline sequence against
  production (see migrations README) before the first `migrate deploy`.
- Choose + provision an analytics provider (PostHog) and an APM (Sentry) if
  desired; set the env vars.
- Attorney review of positioning + Terms.
- Rotate the previously-hardcoded DB credential if it was valid.

## 17. Infrastructure Risks

- Production migration state is inferred (db-push history); the `migrate diff`
  dry-run in step 3 of the runbook is the safety check before `deploy`.
- No queue runner yet — email/AI/report/webhook work is still synchronous in
  request paths as load grows.
- Single Postgres, pooling unconfirmed.
- Large web chunks slow first paint at scale.

## 18. Next 10 Highest-Impact Tasks

1. Owner-approved production migration adoption (`migrate resolve` baseline +
   `migrate diff` dry-run + `migrate deploy`), after a fresh backup.
2. Confirm + document Railway Postgres backup schedule/retention; run one restore test.
3. Add persistent `Subscription` + `Invoice` models; reconcile from Stripe/PayPal
   payment records; drive `resolveClientEntitlements` from them.
4. Wire `WebhookEvent` + `IdempotencyKey` into Stripe and PayPal webhook handlers.
5. Build the job queue runner (poll `JobQueue`, exponential backoff, heartbeat)
   as a small standalone process; move welcome/analysis emails onto it.
6. Add an org-creation route + client-assignment model/routes; apply
   `assertSameTenant` to every org-bound resource read/write.
7. Add a DB-backed integration-test harness; write tenant-isolation tests that
   hit real Prisma queries (Org A cannot read Org B clients/documents).
8. Deepen readiness next-best-action mapping; schedule periodic snapshots via cron.
9. Provision PostHog + Sentry; expand analytics events (lesson_*, tool_used,
   subscription_*); add a `/api/monitoring/errors` admin view.
10. Code-split the web bundle (lazy-load html2pdf and admin portal); re-run
    `build:web` to clear the chunk warning.
