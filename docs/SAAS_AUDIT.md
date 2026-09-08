# CredX SaaS Audit

> **Independent launch review — 2026-09-07:** the 24 category scores then totalled
> 168/240, or **7.0/10 unweighted**, not 7.9. The progression figures below are
> historical estimates without a documented weighting method, not verified launch
> scores. See [launch audit](LAUNCH_AUDIT_2026-09-07.md) and
> [hardening continuation](LAUNCH_HARDENING_2026-09-07.md).
>
> **Re-verified 2026-09-08:** the table now totals **172/240 = 7.2/10 unweighted**
> (Analytics 4→6, Security 7→8, Reliability 7→8). Evidence in
> [VERIFICATION_2026-09-08.md](VERIFICATION_2026-09-08.md).
>
> **This remains a repository score, not a production rating.** Production still
> serves the 2026-08-23 build (commit `04d4d8a`, i.e. pre-transformation): the
> `saas-transformation` branch is 31 commits ahead of `origin/main` and has never
> been deployed. Live `/product`, `/team` and `/financial-readiness` still return
> the homepage, and `/health/db` + `/health/queue` still 404. The owner's
> 2026-09-04 data loss was recovered at the database level on 2026-09-08; that
> recovery did not deploy any code.

Scores are current-state estimates from the repository, not marketing claims.
Last revised 2026-09-08 (branch `saas-transformation`, sessions 3–4 / Phase C1–D —
see `SAAS_TRANSFORMATION_REPORT_2026-09-07.md` §19–§25).

| Area | Current Score | Current State | Target |
| --- | ---: | --- | ---: |
| Product Identity | 5 | Homepage/product page lead with "Credit Intelligence & Financial Readiness Platform"; app + README still mix in credit-service language. Legal review pending. | 9 |
| Recurring Software Value | 8 | Subscriptions drive entitlements; portal, education, analysis, ranked readiness actions, plus two new persistent software modules — Funding Readiness and Business Credit Workspace (models + API + `/financial-readiness` UI). No self-serve plan management UI or proration. | 9 |
| User Accounts | 8 | JWT auth, users, roles, password setup, org memberships. | 9 |
| Dashboard | 8 | Client + admin portals; readiness panel, notification bell, weekly check-in card, platform-reports card, `/team` + `/financial-readiness` workspaces. | 9 |
| Automation | 8 | DB-backed job queue + runner (in-process + standalone worker), backoff, heartbeat, graceful stop; analysis-email producers on it; readiness-snapshot batch schedulable via `cron:readiness-snapshots`. Still request-path for some AI/report work. | 9 |
| Data Model | 9 | Single canonical Prisma schema; **15-migration chain replayed from empty on PostgreSQL 18.6 (2026-09-08): all applied, `migrate diff` reports no difference, 42 tables, all 12 new models present.** Statement audit shows the chain is purely additive — every `ALTER TABLE` is `ADD COLUMN` (8) or `ADD CONSTRAINT` (41); zero DROP/TRUNCATE/DELETE/ALTER COLUMN anywhere in the 15 migrations. Prod migration state is **not** verified from here; the earlier "all migrations applied on prod" claim is unconfirmed. | 9 |
| Analytics | 6 | Env-gated `analytics.ts` with PII stripping. Wired events now **10 of 18**: account_created, readiness_score_created, funding_readiness_completed, business_profile_completed, weekly_checkin_completed, organization_created, client_invited, and subscription_started/upgraded/cancelled (derived from observed state transitions, unit-tested). Still no provider provisioned — `POSTHOG_API_KEY`/`ANALYTICS_ENABLED` absent, so delivery is unproven. | 8 |
| Subscription Architecture | 7 | `resolveClientEntitlements()` derives the plan from a persistent `Subscription` row (ACTIVE/TRIALING/PAST_DUE) with lifecycle-status fallback; unpaid users get FREE. `Subscription`/`Invoice` reconciled from Stripe webhooks. No proration, dunning automation, or self-serve management. | 9 |
| Self-Service Onboarding | 7 | Signup, application, document upload, masterclass onboarding. | 9 |
| AI Integration | 8 | Single `lib/ai/` layer — per-task model/token/timeout/retry config, `runChat`/`runJson`, cost estimation + `AiUsageEvent` ledger, versioned prompt registry. Per-plan token quotas wired to the entitlement resolver; Cesar + extraction degrade gracefully. No multi-provider failover or streaming yet. | 9 |
| Progress Tracking | 8 | ClientProgress, activity, persisted readiness snapshots + history now including the ranked next-best-action detail per snapshot. | 9 |
| Retention Mechanics | 7 | In-app notification bell + producers (milestone / readiness change / new action / report ready), weekly check-in loop that feeds a queue-driven readiness recompute, `weekly-checkins` cron nudge. No email digest yet. | 8 |
| B2B Capability | 7 | Org create + member role management (last-owner protected) + `ClientAssignment` + assign/unassign routes + a minimal `/team` professional workspace (create org, invite, roles, create + assign clients). No white-label / branding / org usage limits yet. | 9 |
| Multi-Tenant Architecture | 7 | `tenancy.ts` guards + `tenantQueries.ts` data-access helpers scoping every org read (own-doc, org client lists, `ClientAssignment` professional scoping); 17 DB-level + route-level integration tests. Org-creation + member-role + assignment routes shipped. Not yet applied to disputes/documents write paths org-wide. | 9 |
| Security | 8 | Helmet, rate limits, PII encryption, auth, response sanitizer; invitation token verified by hash; error ledger + Sentry forwarding PII-scrubbed. **CSP now present on both surfaces** (2026-09-08): API sends `default-src 'none'` + `frame-ancestors 'none'`; web sends an origin-scoped policy allowing only PayPal / Turnstile / Google Fonts / YouTube / the API. Both covered by tests. `'unsafe-inline'` is still required by 4 inline scripts + 13 inline styles — nonces are the tracked follow-up. Storage policy + secret-rotation gaps remain. | 9 |
| Compliance | 7 | CROA/FCRA-aware contracts + gates; readiness score carries the non-FICO disclosure; positioning changes still need attorney sign-off. | 9 |
| Documentation | 7 | Phase 0 set + migration runbook + audit + 2026-09-07 report §1–§24 + verified DR doc + LOAD_TESTING.md. | 9 |
| API Readiness | 6 | `/api` + `/api/v1` mounts; no public API auth/versioning/quotas. | 8 |
| Integration Readiness | 7 | Stripe + PayPal webhook handlers now run every event through the webhook-event ledger: dedupe on external event id, replay short-circuit, PROCESSED/RETRYING/DEAD_LETTER states, provider-safe retry. Other providers (DocuSign, SendGrid) not yet wired. | 9 |
| Scalability | 6 | Stateless web/API; DB job queue with a working runner (multi-runner-safe, splittable to a dedicated process); local load-test harness establishes a ~4k req/s single-process baseline. Postgres pooling / PgBouncer still unconfigured. | 9 |
| Reliability | 8 | `/health`, `/health/db`, `/health/queue`; graceful API + worker shutdown; replay-safe webhooks with dead-lettering; job backoff runtime; fail-soft optional providers; error ledger in global handler. **Routing is now observable** (2026-09-08): unknown paths return a real 404 instead of 200 + index.html, admin SPA deep links resolve to the admin bundle instead of the landing page, and a CI routing test pins all three rules. | 9 |
| Observability | 7 | ErrorEvent + webhook-event ledgers + worker heartbeats (`/health/queue`); env-gated PII-scrubbed Sentry forwarding (API + browser); AI usage + cost ledger with `/api/monitoring/ai` (admin) + `/api/ai/usage` (per-user). No external APM / dashboards provisioned. | 8 |
| Disaster Recovery | 7 | Nightly prod `pg_dump` (03:30, 14-day retention, `/home/ubuntu/backups/credx-db/backup.sh`) with a **passed restore test** (2026-09-08); RPO ≤24h, RTO ~30–60 min documented; migration rollback runbook; replay-safe webhook recovery. Gaps: off-host backup copy, no PITR, restore test not yet automated. | 8 |
| Performance | 6 | Rate limits, static serving; web PDF stack code-split into lazy vendor chunks (no >500 kB chunk); some sync external work in request paths remains. | 8 |

## Overall

Before (2026-09-03): **5.3 / 10**
After 09-07 session 1: **5.9 / 10**
After 09-07 session 2: **6.5 / 10**
After 09-08 session 3 (Phase C1): **6.8 / 10**
After 09-08 session 3 (Phase C2): **7.1 / 10**
After 09-08 session 3 (Phase C3): **7.3 / 10**
After 09-08 session 4 (Phase D): **7.6 / 10**
After 09-08 session 4 (Phase E): **7.9 / 10** *(estimate, superseded)*

Recounted 2026-09-07: **7.0 / 10** (168/240)
Re-verified 2026-09-08: **7.2 / 10** (172/240)

Target: 9.5+/10 after phased implementation, verification, and infrastructure
configuration. Sessions 2–3 delivered real recurring-software mechanics
(persistent subscriptions driving entitlements, job-queue runner, replay-safe
webhooks, DB-level tenant-isolation tests, ranked readiness actions, org/team
management + client assignment, Funding Readiness + Business Credit modules,
env-gated Sentry + a local load-test harness). The remaining gap to 9.5 is
mostly infrastructure the owner must provision (Postgres backups verified — done;
APM/analytics providers, PgBouncer, dedicated worker service), white-label B2B
depth, seeded load scenarios, and attorney-reviewed positioning — not core code.
