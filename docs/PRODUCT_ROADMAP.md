# CredX Product Roadmap

Status legend: Completed · In Progress · Planned · Blocked · External Dependency

## Phase 0 - Infrastructure & Reliability

- Completed: repo architecture audit; Phase 0 doc set.
- Completed: hardcoded database URL removed from local smoke-test helpers.
- Completed: health checks moved outside global rate limiter; `/health/db` added.
- Completed: migration history reconciled — 4 deleted migrations restored,
  dangerous full-schema squash removed, `00000000000000_baseline` +
  `20260907120000_saas_transformation_additive` added and verified against a
  throwaway Postgres; adoption runbook in `packages/db/prisma/migrations/README.md`.
- Completed: duplicate Prisma schema file removed (single canonical schema).
- In Progress: DB-backed job queue primitives (`lib/queue.ts`) — no runner yet.
- Planned: verify Railway service config + Postgres backup schedule/retention.
- External Dependency: monitoring provider (APM) selection.

## Phase 1 - SaaS Foundation

- In Progress: product-first positioning (public pages done; app + legal pending).
- Completed: central plan/entitlement resolution (`resolveClientEntitlements`) —
  effective plan derives from client lifecycle; unpaid users get FREE tier;
  `/api/billing/entitlements/me` wired; unit tested.
- Completed: persistent `Subscription` / `Invoice` models (migration 20260907130000);
  `resolveClientEntitlements` derives the plan from live subscription state;
  reconciled from Stripe webhooks.
- Planned: SaaS onboarding path (account → goal → profile → readiness → action plan).

## Phase 2 - Intelligence Engine

- Completed: CredX Readiness Score engine + authenticated endpoints + snapshot
  history model + focused tests + non-FICO disclosure.
- Completed: Action Plan engine (`lib/actionPlan.ts`) generates prioritized tasks
  from readiness categories; build-blocking type errors fixed.
- Completed: ranked next-best-action mapping (`nextBestActionDetails` — category,
  priority, potential points, portal deep-link) persisted per snapshot.
- Completed: periodic snapshot batch schedulable via
  `scripts/credx-ops-cron.mjs readiness-snapshots` (enqueues
  `analysis:readiness-snapshot-all`, drained by the queue runner).
- Completed: `lib/ai/` provider abstraction — per-task config, `runChat`/`runJson`
  with retry + timeout + token limits, cost ledger (`AiUsageEvent`), versioned
  prompt registry. Cesar + report extraction migrated onto it.
- Completed: AI cost protection — per-plan token quotas wired to the entitlement
  resolver, Cesar rate limit + graceful degrade, `/api/ai/usage` +
  `/api/monitoring/ai`.
- Planned: multi-provider failover + streaming; embeddings/RAG for the Learning
  Center.

## Phase 3 - Engagement

- Completed: masterclass progress tracking.
- Completed: in-app notifications — `Notification` model, bell UI, producers
  (milestone / readiness change / new action / report ready), mark read.
- Completed: weekly check-in (§41) — `WeeklyCheckIn` model, portal card,
  queue-driven readiness recompute, `weekly-checkins` cron nudge.
- Completed: platform reports (§43) — `PlatformReport` model, async
  Readiness Report + Credit Profile Summary (queue-generated HTML with
  data-source + no-guarantee disclosures), portal card.
- Planned: email digest of unread notifications; learning→dashboard
  recommendation surfacing; `readiness_score_created` / `account_created`
  analytics events are wired, remaining events (lesson_*, tool_used,
  subscription_*) pending.

## Phase 4 - Professional Platform

- Completed: Organization / OrganizationMember / OrganizationInvitation models.
- Completed: tenant-isolation authorization helpers (`lib/tenancy.ts`) + unit
  tests incl. cross-tenant rejection; org routes refactored to use them;
  invitation acceptance now verifies the token hash.
- Completed: org creation route; member role management (last-owner protected);
  `ClientAssignment` model + assign/unassign routes; `tenantQueries.ts`
  data-access helpers scoping every org-bound read.
- Completed: DB-level tenant-isolation integration tests (`test:integration`,
  TEST_DATABASE_URL-gated) — 17 tests hitting real Prisma / real HTTP.
- Completed: minimal `/team` professional workspace (create org, invite, roles,
  create + assign clients, client list).
- Planned: white-label / branding config, partner dashboards, org usage limits.

## Phase 4b - Financial Readiness

- Completed: Funding Readiness module — `FundingReadinessProfile` model,
  `lib/fundingReadiness.ts` (utilization / inquiry / derogatory / profile-depth /
  income indicators + preparation + document checklists + readiness band),
  `/api/funding-readiness` routes, `/financial-readiness` portal UI. Carries the
  "CredX does not guarantee approval or funding" disclosure on every result.
- Completed: Business Credit Workspace — `BusinessCreditProfile` +
  `BusinessVendorAccount` + `BusinessTradeline` models, 9-item foundation
  assessment, `/api/business-credit` routes (profile + vendor + tradeline CRUD,
  ownership-checked), Business Credit tab in the portal UI.
- Planned: connect readiness/business-credit signals into the action plan and
  cron reminders; optional D&B / business-bureau data integrations.

## Phase 5 - Integrations & API

- In Progress: payment, email, AI, blob, Lob, Turnstile integrations.
- Completed: `WebhookEvent` + `IdempotencyKey` models + `lib/webhookLedger.ts`.
- Completed: ledger wired into the Stripe + PayPal webhook handlers
  (`processWebhookWithLedger` — dedupe, replay short-circuit, dead-lettering);
  Stripe `customer.subscription.*` / `invoice.*` reconcile persistent state.
- Planned: wire the ledger into DocuSign / other provider handlers.
- Planned: internal API versioning + rate-limit policy; public API controls.

## Phase 6 - Enterprise / White Label

- Planned: organization branding config, partner dashboards, org-level usage limits.

## Phase 7 - Scale & Ops

- In Progress: env-gated product analytics (`lib/analytics.ts`) + error ledger.
- Completed: DB-backed job queue runner (`lib/queueRunner.ts`) + producers +
  standalone `worker.ts`; graceful shutdown; `/health/queue`. Redis not needed.
- Completed: web chunk code-split — html2pdf ~985 kB blob replaced by lazy
  vendor-jspdf / vendor-html2canvas chunks; no build warning.
- Completed: env-gated Sentry forwarding (`lib/sentryForward.ts`) wired into the
  API error path + a browser error hook (`errorReporting.ts`), both PII-scrubbed
  and no-op without a DSN.
- Completed: local load-testing harness (`scripts/loadtest.mjs`, `npm run
  loadtest`) — refuses non-local targets; `docs/LOAD_TESTING.md` documents a
  ~4k req/s single-process baseline.
- Planned: seeded target-flow load scenarios; DB profiling; PgBouncer;
  provision a Sentry/APM project + dashboards; dedicated worker service.
