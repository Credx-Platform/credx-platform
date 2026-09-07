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

Per `docs/SAAS_AUDIT.md`: **5.3 → 5.9 → 6.5 / 10**. Target 9.5+. The 5.9→6.5
move is the Phase B continuation in §19 (persistent subscriptions, a real job
queue runner, replay-safe webhook processing, DB-level isolation tests, ranked
readiness actions). Still gated on infra provisioning + attorney review for the
higher bands.

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

Status after §19: **3, 4, 5, 7, 8 done** (8 partial — mapping done, cron
scheduling still open). 1, 2, 9 remain James-gated infra. 6, 10 not started.

## 19. Phase B continuation — "Next 10" items 3–8 (session 2, 2026-09-07)

Branch `saas-transformation`, 5 additional commits, not pushed, not deployed.
Small inspect→implement→typecheck→test→build→commit loops. All migrations
additive + idempotent; verified against a throwaway PostgreSQL 16 (9-migration
chain applies from empty with zero drift; new migrations re-run clean).

**`3a3dc91` — persistent Subscription + Invoice models (Next-10 #3)**
- Migration `20260907130000`: `Subscription` (provider, providerSubscriptionId,
  planCode, `SubscriptionStatus`, period, cancelAtPeriodEnd, metadata) and
  `Invoice` (amountDue/Paid, `InvoiceStatus`, period, hostedInvoiceUrl), both
  client-scoped, unique on `(provider, providerId)`.
- `resolveClientEntitlements()` takes an optional `subscription` input that wins
  over the status/serviceTier heuristic: ACTIVE/TRIALING/PAST_DUE grant the
  subscription's plan; UNPAID/PAUSED/CANCELED/INCOMPLETE fall back; unknown plan
  codes fall back safely.
- `lib/subscriptions.ts`: `getCurrentSubscription`, `toSubscriptionPlanInput`,
  `upsertProviderSubscription` (status normalization, idempotent).
- `/api/billing/entitlements/me` resolves against the current subscription and
  echoes its state.

**`4999477` — DB-backed job queue runner + producers (Next-10 #5)**
- `lib/jobs.ts`: handler registry + `enqueueJob()` producer wrapper that never
  throws into a request path — degrades to inline execution when the DB enqueue
  fails or `QUEUE_MODE=inline`; can drop-and-log for safe-to-retry jobs.
- `lib/queueRunner.ts`: `QueueRunner` poll loop — transactional claim
  (multi-runner safe), exponential backoff, heartbeat, interruptible sleep,
  bounded graceful stop. `startInProcessRunner()` runs it inside the API unless
  `QUEUE_INPROCESS=0`.
- `src/worker.ts`: standalone worker entrypoint (`npm run start:worker`) with
  SIGTERM/SIGINT draining, for a future dedicated Railway service.
- Producers: both auto-analysis email sites in `progress.ts` now enqueue instead
  of blocking the upload request on PDF render + send.
- `GET /health/queue`: backlog counts, dead-letter count, worker liveness; never 5xx.
- Verified end-to-end on PG16: enqueue → claim → complete + heartbeat + retry.

**`bb0ac44` — webhook ledger wired into Stripe + PayPal (Next-10 #4)**
- `processWebhookWithLedger()`: record event (dedupe on `externalEventId`) →
  short-circuit PROCESSED replays → run processor once → mark
  PROCESSED / RETRYING / DEAD_LETTER. Never throws.
- Stripe `/api/billing/webhook`: every event flows through the ledger keyed on
  `event.id`; new `handleStripeEvent()` also reconciles persistent state
  (`customer.subscription.*` → subscription upsert; `invoice.*` → Invoice
  upsert). Payment settle path unchanged (settle-only, CROA gate respected).
- PayPal `/api/billing/paypal/webhook`: same ledger wrapper keyed on the PayPal
  event id; existing masterclass enrollment logic preserved.
- `lib/billingWebhooks.ts`: defensive Stripe→CredX mapping (clientId from
  metadata or stripeCustomerId/subscriptionId), optional `STRIPE_PRICE_*`
  price→plan map, idempotent upserts; unresolvable objects no-op instead of
  dead-lettering.
- Verified on PG16: replay does not re-invoke the processor; subscription
  upserts to a single row across events; events land PROCESSED.

**`1acbefe` — DB-level tenant-isolation integration tests (Next-10 #7)**
- `lib/tenantQueries.ts`: single source of truth for tenant-scoped reads —
  `findClientDocumentForUser` (own-client only), `listOrgClientsForUser`
  (membership asserted, scoped), `findOrgClientForUser` (OWNER/ADMIN see any org
  client; a professional MEMBER only sees a client assigned via
  `OrganizationMember.clientId`; cross-tenant + unassigned throw).
- `clients.ts` `GET /me/documents/:id/print` refactored onto the helper.
- `tests/tenantIsolation.integration.test.ts`: 9 tests hitting real Prisma —
  user A cannot read user B docs, Org B owner cannot list Org A clients,
  professional cannot read unassigned or cross-tenant clients, owner can.
- Runs only with `TEST_DATABASE_URL` (`npm run test:integration`); the default
  `npm test` reports them skipped so it never touches the app DATABASE_URL.

**`0f1cf4a` — ranked readiness next-best-action mapping + history (Next-10 #8)**
- `readinessScore.ts`: `nextBestActionDetails[]` — each active opportunity maps
  to a scoring category, ranked by real point headroom (blocker categories
  `creditData`/`derogatory` forced high), with `potentialPoints` and a portal
  deep-link. Flat `nextBestActions`/`opportunities` derived from the same source;
  wording unchanged.
- Migration `20260907140000`: `ReadinessScoreSnapshot.nextBestActionDetails`
  JSONB; persisted at all three snapshot write sites.
- `/api/progress/readiness` history entries carry `topActions` so the portal
  shows each past snapshot's focus.
- `clientPortal.tsx`: ranked action list (priority pill, +pts, CTA link,
  rationale) with graceful fallback; history bars get per-snapshot focus.
- #8 remainder (cron-scheduled periodic snapshots) is still open —
  `generateAllReadinessSnapshots` + the `analysis:readiness-snapshot-all` job
  handler exist but nothing schedules them yet.

### §19 test + build status

- `npm run build:api` — clean. `npm run build:web` — clean (pre-existing
  html2pdf chunk warning only).
- `npm test` — **33 pass / 9 skipped / 0 fail** (`readinessScore` 4,
  `entitlements` 11, `tenancy` 7, `analytics` 4, `jobs` 6, `tenantIsolation`
  integration 9 skipped without `TEST_DATABASE_URL`).
- `npm run test:integration` (against throwaway PG16) — **9 / 9 pass**.
- Migration chain (9) — applies from empty with zero drift; `20260907130000`
  and `20260907140000` re-run confirmed idempotent.
- No running-instance HTTP smoke test; no deployment.

### §19 new env vars (all optional, no-op when unset)

`QUEUE_INPROCESS` (default on; set `0` when a dedicated worker is deployed),
`QUEUE_MODE` (`inline` forces synchronous producers), `QUEUE_POLL_MS`,
`QUEUE_HEARTBEAT_MS`, `QUEUE_STOP_TIMEOUT_MS`,
`STRIPE_PRICE_ESSENTIAL` / `_PREMIUM` / `_FAMILY` / `_MASTERCLASS`
(price-id → plan map for subscription webhooks; metadata `planCode` works without them).

### §19 compliance

No guarantee/deletion/bureau-approval language introduced. Readiness disclosure
unchanged and still test-asserted. Dispute wording in the readiness actions
retains "documented, lawful dispute or validation workflows" phrasing.

## 20. Phase C1 — Phase B leftovers finished (session 3, 2026-09-08)

Branch `saas-transformation`. Prod DB migration adoption was completed by James
out-of-band (8 migrations applied, zero drift, Subscription/Invoice live, nightly
backup cron installed, prod essentially empty / pre-launch). No prod deploy from
this session.

**`1dd98c5` — org creation + member roles + client assignment (Next-10 #6)**
- `POST /api/org` (creator → OWNER, auto-unique slug); `GET /:slug/members`;
  `PATCH`/`DELETE /:slug/members/:userId` (last-owner protected, only OWNER
  grants OWNER, removal clears assignments); `GET /:slug/clients` (OWNER/ADMIN
  all, professional only assigned); `POST /:slug/clients` (ADMIN+, real
  password-setup stub user); `POST`/`DELETE /:slug/clients/:clientId/assignments`.
- New model `ClientAssignment` (migration `20260908120000`, additive/idempotent);
  `tenantQueries.ts` now scopes every org read through it.
- `apps/api/src/app.ts` split out of `index.ts` (`createApp({ disableRateLimits })`)
  so the server boots in-process for route tests.
- Minimal `/team` web workspace (`team.html` + `TeamDashboard.tsx`): reuses the
  portal token; create org, invite + role, create + assign clients, client list.
- Tests: `org.integration.test.ts` — 8 route-level tests (real HTTP + real
  Prisma). `tenantIsolation` seed updated to `ClientAssignment`.

**`ebb7bb8` — readiness snapshot scheduling (Next-10 #8) + web code-split (Next-10 #10)**
- `scripts/credx-ops-cron.mjs readiness-snapshots`: enqueues
  `analysis:readiness-snapshot-all` (queue runner drains it), inline fallback if
  `dist` is missing. `npm run cron:readiness-snapshots`. Existing cron modes
  untouched.
  Suggested crontab: `0 6 * * *  cd <repo> && node scripts/credx-ops-cron.mjs readiness-snapshots`
- `html2pdf` dynamic import now targets `html2pdf.js/src/index.js`; vite
  `manualChunks` splits `jspdf` (391 kB) / `html2canvas` (202 kB) / `dompurify`
  into lazy vendor chunks. `build:web` no longer warns (largest chunk 391 kB,
  all PDF code loads only on dispute-letter download).

### §20 status

- `npm run build` (api + web) — clean, **no warnings**.
- `npm test` — **33 pass / 17 skipped / 0 fail** (skipped = the 2 integration
  files without `TEST_DATABASE_URL`).
- `npm run test:integration` — **17 / 17** (tenantIsolation 9 + org 8) on PG16.
- Migration chain (10) — applies from empty with zero drift; new migration
  re-run idempotent.
- Next-10 after C1: **#3–#8, #10 done.** Remaining: #1/#2 (James — done
  out-of-band), #9 (Sentry/PostHog provisioning — Sentry *code* is C3).

## 21. Phase C2 — Financial Readiness (session 3, 2026-09-08)

Master-spec Phase 4. Branch `saas-transformation`, no prod deploy.

**`d586d4e` — Funding Readiness + Business Credit**

Funding Readiness (item 4):
- `FundingReadinessProfile` (migration `20260908130000`).
- `lib/fundingReadiness.ts` — 5 indicators (utilization, hard inquiries,
  derogatory marks, credit-profile depth, income) derived from the client's own
  data; preparation checklist + document checklist (stored state merged over
  defaults); readiness band + 0–100 score; ranked next steps. Fixed disclosure
  **"CredX does not guarantee approval or funding."** on every result.
- `routes/fundingReadiness.ts` — `GET` (lazy create + assess + persist),
  `PUT` (objective / target amount / timeframe / income), `PATCH /checklist`,
  `PATCH /documents`. All client-scoped by `userId`.

Business Credit Workspace (item 5):
- `BusinessCreditProfile` + `BusinessVendorAccount` + `BusinessTradeline`
  (migration `20260908140000`). EIN stored as `einLast4` + `einStatus` only —
  no full EIN.
- `lib/businessCredit.ts` — 9-item foundation assessment (entity formed, EIN
  issued, business address, business phone, business email on a domain, bank
  account, D-U-N-S, 3+ starter vendors, 2+ reporting vendors) → stage + score +
  next steps + no-guarantee disclosure.
- `routes/businessCredit.ts` — profile `GET`/`PUT`, `PATCH /checklist`, vendor
  accounts + tradelines full CRUD. Every mutation ownership-checked
  (cross-client → 404).

Web:
- New `/financial-readiness` workspace (`readiness.html` +
  `FinancialReadinessWorkspace.tsx` + `BusinessCreditWorkspace.tsx`): tabbed UI,
  disclosures rendered prominently, checklist toggles, entity form, vendor +
  tradeline tables. Reuses the portal token.

### §21 status

- `npm run build` (api + web) — clean, no warnings.
- `npm test` — **42 pass / 30 skipped / 0 fail** (+ `fundingReadiness` 5,
  `businessCredit` 4).
- `npm run test:integration` — **30 / 30** (+ funding 6, business 8).
- Migration chain (12) — zero drift; both new migrations re-run idempotent.
- Compliance: no guarantee / approval / deletion / bureau-force language;
  disclosures are test-asserted constants.

## 22. Phase C3 — Observability & Scale (session 3, 2026-09-08)

Master-spec Phase 6. Code-only, env-gated. Branch `saas-transformation`, no prod deploy.

**`5aa4b31` — Sentry forwarding + browser error reporting (item 6)**
- `apps/api/src/lib/sentryForward.ts`: no-SDK Sentry forwarder. No-op unless
  `SENTRY_DSN` is set. Parses the DSN, POSTs a scrubbed event to the store
  endpoint fire-and-forget (3s `AbortController` timeout).
  `scrubText` / `scrubDeep` redact emails, SSNs, JWTs, `Bearer` tokens,
  card-like numbers, and blocked keys (password / token / ssn / ein /
  authorization / cookie / …), with length + recursion caps.
- `lib/sentry.ts`: `captureException` / `captureMessage` now scrub the payload
  written to the `ErrorEvent` ledger (defense-in-depth) **and** forward to
  Sentry when configured. Unchanged when `SENTRY_DSN` is unset.
- `apps/web/src/errorReporting.ts`: `initErrorReporting()` installs `error` +
  `unhandledrejection` handlers that POST scrubbed events to Sentry. No-op
  unless `VITE_SENTRY_DSN` is set at build time; capped at 10 events/session.
  Wired into all four web entrypoints.
- 6 unit tests (scrubbing + disabled no-op).

**`797528d` — local load-testing harness (item 7)**
- `scripts/loadtest.mjs`: zero-dependency (Node `fetch` + worker pool).
  **Hard-refuses any non-local target** (localhost / 127.0.0.1 / RFC1918 only) —
  no override. Scenarios `health` / `readonly` / `authed` / `mixed`, all
  read-only endpoints. Reports p50/p90/p95/p99, RPS, error rate, status
  histogram; exits non-zero above a 1% error rate. `npm run loadtest`.
- `index.ts`: `DISABLE_RATE_LIMITS=1` disables rate limiters for local load
  testing, honored **only** when `NODE_ENV !== production`.
- `docs/LOAD_TESTING.md` rewritten with usage, a local run recipe, and a
  measured single-process baseline: ~4,000 req/s, p95 ~53 ms, p99 ~82 ms, 0
  errors over ~40k requests at 100 concurrent workers.

### §22 status

- `npm run build` (api + web) — clean, no warnings.
- `npm test` — **47 pass / 30 skipped / 0 fail**.
- `npm run test:integration` — **30 / 30**.
- Migration chain (12) — zero drift.
- New env vars (all optional, no-op when unset): `SENTRY_DSN` (API),
  `VITE_SENTRY_DSN` (web build), `DISABLE_RATE_LIMITS` (local only).

## 23. Merge & deploy readiness (end of session 3)

**Branch `saas-transformation` — ready to merge to `main`.** 20 commits since
`194f285`. No conflicts expected (branch is linear off `main`; `main` has not
moved). No production deploy performed by any session.

Pre-merge checklist (all green):
- `npm run build` clean, no warnings.
- `npm test` 47 pass / 30 skipped / 0 fail; `npm run test:integration` 30/30 on PG16.
- 12-migration chain applies from empty with zero drift; every migration
  additive + idempotent. Prod already carries migrations 1–8 (adopted by the
  owner 2026-09-08); `9`–`12` (`20260907130000`, `20260907140000`,
  `20260908120000`, `20260908130000`, `20260908140000`) are pending
  `migrate deploy`.
- Every new integration (queue runner, Sentry, analytics, Redis, Stripe price
  map) is non-fatal when unconfigured.
- Compliance guardrails intact; no guarantee / approval / deletion / bureau-force
  language; disclosures test-asserted.

### Railway deploy commands (DO NOT RUN — for the owner)

```bash
# 0. from the repo root, on `main` after the merge, with a fresh DB backup taken.

# 1. API service — apply pending migrations (9–12 are additive/idempotent):
railway run --service @credx/api --environment production -- \
  npx prisma migrate deploy --schema packages/db/prisma/schema.prisma

# 2. Deploy API:
#    ensure railway.json is API-shaped (npm run build:api / npm run start:api /
#    health /health) — see AGENTS.md CredX Deployments note — then:
railway up --service @credx/api --environment production

# 3. Deploy web:
railway up --service @credx/web --environment production

# 4. Verify:
railway deployment list --service @credx/api --environment production --limit 3 --json
curl -fsS https://credxapi-production.up.railway.app/health
curl -fsS https://credxapi-production.up.railway.app/health/db
curl -fsS https://credxapi-production.up.railway.app/health/queue
```

Optional env to set on the API service when ready (all no-op until set):
`SENTRY_DSN`, `REDIS_URL` (not required — DB queue works without it),
`POSTHOG_API_KEY` / `ANALYTICS_ENABLED`, `STRIPE_PRICE_ESSENTIAL|PREMIUM|FAMILY|MASTERCLASS`.
Web build env: `VITE_SENTRY_DSN`. Deploy a dedicated worker service later with
`npm run start:worker` + set `QUEUE_INPROCESS=0` on the API.

Still not done (out of scope / owner-gated): PostHog + Sentry provisioning,
white-label config, attorney review of positioning + Terms, PgBouncer, the
seeded target-flow load scenarios, and rotating the old hardcoded DB credential
if it was ever valid.
