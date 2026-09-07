# CredX SaaS Audit

Scores are current-state estimates from the repository, not marketing claims.
Last revised 2026-09-07 (branch `saas-transformation`, session 2 — see
`SAAS_TRANSFORMATION_REPORT_2026-09-07.md` §19).

| Area | Current Score | Current State | Target |
| --- | ---: | --- | ---: |
| Product Identity | 5 | Homepage/product page lead with "Credit Intelligence & Financial Readiness Platform"; app + README still mix in credit-service language. Legal review pending. | 9 |
| Recurring Software Value | 7 | Persistent `Subscription`/`Invoice` objects exist and drive entitlements; portal, education, analysis, ranked readiness actions, workflows. No self-serve plan management UI or proration. | 9 |
| User Accounts | 8 | JWT auth, users, roles, password setup, org memberships. | 9 |
| Dashboard | 7 | Client + admin portals; readiness panel wired. | 9 |
| Automation | 7 | DB-backed job queue with a runner (in-process by default + standalone worker), backoff, heartbeat, graceful stop; analysis-email producers moved onto it. Report/readiness handlers registered; cron scheduling of the batch job still open. | 9 |
| Data Model | 9 | Single canonical Prisma schema; 9-migration chain, all additive + idempotent, verified zero-drift on PG16; org/webhook/job/error/readiness + `Subscription`/`Invoice` models. | 9 |
| Analytics | 4 | Env-gated `analytics.ts` with PII stripping + 2 wired events; no provider provisioned, few call sites. | 8 |
| Subscription Architecture | 7 | `resolveClientEntitlements()` derives the plan from a persistent `Subscription` row (ACTIVE/TRIALING/PAST_DUE) with lifecycle-status fallback; unpaid users get FREE. `Subscription`/`Invoice` reconciled from Stripe webhooks. No proration, dunning automation, or self-serve management. | 9 |
| Self-Service Onboarding | 7 | Signup, application, document upload, masterclass onboarding. | 9 |
| AI Integration | 6 | Cesar + report extraction; provider abstraction partial; cost/usage controls incomplete. | 9 |
| Progress Tracking | 8 | ClientProgress, activity, persisted readiness snapshots + history now including the ranked next-best-action detail per snapshot. | 9 |
| Retention Mechanics | 5 | Masterclass/progress emails; notifications/check-ins not built. | 8 |
| B2B Capability | 5 | Org/member/invitation models + read/invite/accept routes + role checks; no org-creation route or client-assignment UI. | 9 |
| Multi-Tenant Architecture | 6 | `tenancy.ts` pure guards + `tenantQueries.ts` tenant-scoped data-access helpers (own-doc, org-scoped client lists, professional assignment) covered by 9 DB-level integration tests hitting real Prisma. Not yet applied to every org-bound resource; no org-creation route. | 9 |
| Security | 6 | Helmet, rate limits, PII encryption, auth, response sanitizer; invitation token now verified by hash; monitoring/storage policy gaps remain. | 9 |
| Compliance | 7 | CROA/FCRA-aware contracts + gates; readiness score carries the non-FICO disclosure; positioning changes still need attorney sign-off. | 9 |
| Documentation | 6 | Phase 0 doc set + migration adoption runbook + this audit + 2026-09-07 report. | 9 |
| API Readiness | 6 | `/api` + `/api/v1` mounts; no public API auth/versioning/quotas. | 8 |
| Integration Readiness | 7 | Stripe + PayPal webhook handlers now run every event through the webhook-event ledger: dedupe on external event id, replay short-circuit, PROCESSED/RETRYING/DEAD_LETTER states, provider-safe retry. Other providers (DocuSign, SendGrid) not yet wired. | 9 |
| Scalability | 6 | Stateless web/API; DB job queue with a working runner (multi-runner-safe transactional claim, splittable to a dedicated process); Postgres pooling still unconfigured. | 9 |
| Reliability | 7 | `/health`, `/health/db`, `/health/queue`; graceful API + worker shutdown; replay-safe webhooks with dead-lettering; job backoff runtime; fail-soft optional providers; error ledger in global handler. | 9 |
| Observability | 5 | ErrorEvent ledger + webhook-event ledger states + worker heartbeats queryable via `/health/queue`; still no external APM or dashboards. | 8 |
| Disaster Recovery | 4 | `DISASTER_RECOVERY.md` + migration rollback runbook; provider backup schedule/retention still unverified. | 8 |
| Performance | 5 | Rate limits, static serving; large React chunks + some sync external work remain. | 8 |

## Overall

Before (2026-09-03): **5.3 / 10**
After 09-07 session 1: **5.9 / 10**
After 09-07 session 2: **6.5 / 10**

Target: 9.5+/10 after phased implementation, verification, and infrastructure
configuration. Session 2 delivered real recurring-software mechanics (persistent
subscriptions driving entitlements, a working job-queue runner, replay-safe
webhook processing, DB-level tenant-isolation tests, ranked readiness actions).
The remaining gap to 9.5 is mostly infrastructure James must provision
(production migration adoption, Postgres backups, APM/analytics providers,
PgBouncer), org-team B2B surface area, and attorney-reviewed positioning — not
core code.
