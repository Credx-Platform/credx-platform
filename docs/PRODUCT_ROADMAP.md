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
- Planned: persistent `Subscription` / `Invoice` models + Stripe/PayPal reconcile.
- Planned: SaaS onboarding path (account → goal → profile → readiness → action plan).

## Phase 2 - Intelligence Engine

- Completed: CredX Readiness Score engine + authenticated endpoints + snapshot
  history model + focused tests + non-FICO disclosure.
- Completed: Action Plan engine (`lib/actionPlan.ts`) generates prioritized tasks
  from readiness categories; build-blocking type errors fixed.
- In Progress: deeper next-best-action mapping; automated periodic snapshots
  (`lib/readinessSnapshots.ts` exists, not scheduled).

## Phase 3 - Engagement

- In Progress: masterclass progress tracking.
- Planned: weekly check-ins, in-app notifications, learning→dashboard recommendations.
- Planned: `readiness_score_created` / `account_created` analytics events are wired;
  remaining events (lesson_*, tool_used, subscription_*) pending.

## Phase 4 - Professional Platform

- Completed: Organization / OrganizationMember / OrganizationInvitation models.
- Completed: tenant-isolation authorization helpers (`lib/tenancy.ts`) + unit
  tests incl. cross-tenant rejection; org routes refactored to use them;
  invitation acceptance now verifies the token hash.
- Planned: org creation route, roles UI, client assignments, white-label config.
- Planned: DB-level tenant-isolation integration tests (needs a test DB harness).

## Phase 5 - Integrations & API

- In Progress: payment, email, AI, blob, Lob, Turnstile integrations.
- Completed: `WebhookEvent` + `IdempotencyKey` models + `lib/webhookLedger.ts`.
- Planned: wire the ledger into Stripe/PayPal/DocuSign webhook handlers.
- Planned: internal API versioning + rate-limit policy; public API controls.

## Phase 6 - Enterprise / White Label

- Planned: organization branding config, partner dashboards, org-level usage limits.

## Phase 7 - Scale & Ops

- In Progress: env-gated product analytics (`lib/analytics.ts`) + error ledger.
- Planned: job queue runner + producers; Redis only if/when justified.
- Planned: load-testing suite execution; DB profiling; slow-endpoint optimization.
- Planned: code-split large web chunks (html2pdf ~985 kB).
