# CredX SaaS Audit

Scores are current-state estimates from the repository, not marketing claims.
Last revised 2026-09-08 (branch `saas-transformation`, session 3 / Phase C1–C3 —
see `SAAS_TRANSFORMATION_REPORT_2026-09-07.md` §19–§23).

| Area | Current Score | Current State | Target |
| --- | ---: | --- | ---: |
| Product Identity | 5 | Homepage/product page lead with "Credit Intelligence & Financial Readiness Platform"; app + README still mix in credit-service language. Legal review pending. | 9 |
| Recurring Software Value | 8 | Subscriptions drive entitlements; portal, education, analysis, ranked readiness actions, plus two new persistent software modules — Funding Readiness and Business Credit Workspace (models + API + `/financial-readiness` UI). No self-serve plan management UI or proration. | 9 |
| User Accounts | 8 | JWT auth, users, roles, password setup, org memberships. | 9 |
| Dashboard | 7 | Client + admin portals; readiness panel wired. | 9 |
| Automation | 8 | DB-backed job queue + runner (in-process + standalone worker), backoff, heartbeat, graceful stop; analysis-email producers on it; readiness-snapshot batch schedulable via `cron:readiness-snapshots`. Still request-path for some AI/report work. | 9 |
| Data Model | 9 | Single canonical Prisma schema; 9-migration chain, all additive + idempotent, verified zero-drift on PG16; org/webhook/job/error/readiness + `Subscription`/`Invoice` models. | 9 |
| Analytics | 4 | Env-gated `analytics.ts` with PII stripping + 2 wired events; no provider provisioned, few call sites. | 8 |
| Subscription Architecture | 7 | `resolveClientEntitlements()` derives the plan from a persistent `Subscription` row (ACTIVE/TRIALING/PAST_DUE) with lifecycle-status fallback; unpaid users get FREE. `Subscription`/`Invoice` reconciled from Stripe webhooks. No proration, dunning automation, or self-serve management. | 9 |
| Self-Service Onboarding | 7 | Signup, application, document upload, masterclass onboarding. | 9 |
| AI Integration | 6 | Cesar + report extraction; provider abstraction partial; cost/usage controls incomplete. | 9 |
| Progress Tracking | 8 | ClientProgress, activity, persisted readiness snapshots + history now including the ranked next-best-action detail per snapshot. | 9 |
| Retention Mechanics | 5 | Masterclass/progress emails; notifications/check-ins not built. | 8 |
| B2B Capability | 7 | Org create + member role management (last-owner protected) + `ClientAssignment` + assign/unassign routes + a minimal `/team` professional workspace (create org, invite, roles, create + assign clients). No white-label / branding / org usage limits yet. | 9 |
| Multi-Tenant Architecture | 7 | `tenancy.ts` guards + `tenantQueries.ts` data-access helpers scoping every org read (own-doc, org client lists, `ClientAssignment` professional scoping); 17 DB-level + route-level integration tests. Org-creation + member-role + assignment routes shipped. Not yet applied to disputes/documents write paths org-wide. | 9 |
| Security | 7 | Helmet, rate limits, PII encryption, auth, response sanitizer; invitation token verified by hash; error ledger + Sentry forwarding now PII-scrubbed (emails / SSNs / JWTs / bearer tokens / blocked keys). Storage policy + secret-rotation gaps remain. | 9 |
| Compliance | 7 | CROA/FCRA-aware contracts + gates; readiness score carries the non-FICO disclosure; positioning changes still need attorney sign-off. | 9 |
| Documentation | 6 | Phase 0 doc set + migration adoption runbook + this audit + 2026-09-07 report. | 9 |
| API Readiness | 6 | `/api` + `/api/v1` mounts; no public API auth/versioning/quotas. | 8 |
| Integration Readiness | 7 | Stripe + PayPal webhook handlers now run every event through the webhook-event ledger: dedupe on external event id, replay short-circuit, PROCESSED/RETRYING/DEAD_LETTER states, provider-safe retry. Other providers (DocuSign, SendGrid) not yet wired. | 9 |
| Scalability | 6 | Stateless web/API; DB job queue with a working runner (multi-runner-safe, splittable to a dedicated process); local load-test harness establishes a ~4k req/s single-process baseline. Postgres pooling / PgBouncer still unconfigured. | 9 |
| Reliability | 7 | `/health`, `/health/db`, `/health/queue`; graceful API + worker shutdown; replay-safe webhooks with dead-lettering; job backoff runtime; fail-soft optional providers; error ledger in global handler. | 9 |
| Observability | 6 | ErrorEvent ledger + webhook-event ledger + worker heartbeats via `/health/queue`; env-gated Sentry forwarding (API) + browser error reporting, both PII-scrubbed and no-op without a DSN. No dashboards / APM provisioned yet. | 8 |
| Disaster Recovery | 4 | `DISASTER_RECOVERY.md` + migration rollback runbook; provider backup schedule/retention still unverified. | 8 |
| Performance | 6 | Rate limits, static serving; web PDF stack code-split into lazy vendor chunks (no >500 kB chunk); some sync external work in request paths remains. | 8 |

## Overall

Before (2026-09-03): **5.3 / 10**
After 09-07 session 1: **5.9 / 10**
After 09-07 session 2: **6.5 / 10**
After 09-08 session 3 (Phase C1): **6.8 / 10**
After 09-08 session 3 (Phase C2): **7.1 / 10**
After 09-08 session 3 (Phase C3): **7.3 / 10**

Target: 9.5+/10 after phased implementation, verification, and infrastructure
configuration. Sessions 2–3 delivered real recurring-software mechanics
(persistent subscriptions driving entitlements, job-queue runner, replay-safe
webhooks, DB-level tenant-isolation tests, ranked readiness actions, org/team
management + client assignment, Funding Readiness + Business Credit modules,
env-gated Sentry + a local load-test harness). The remaining gap to 9.5 is
mostly infrastructure the owner must provision (Postgres backups verified — done;
APM/analytics providers, PgBouncer, dedicated worker service), white-label B2B
depth, seeded load scenarios, and attorney-reviewed positioning — not core code.
