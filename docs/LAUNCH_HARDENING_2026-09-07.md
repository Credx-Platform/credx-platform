# CredX launch hardening continuation — September 7, 2026

## Status

**Not Ready for production or 9/10 sign-off.** Authorized continuation after the independent audit; includes the user's additional request to revise all legal pages while preserving analysis and consultation before billing. No production modifications or deployment performed.

## Changes implemented

- Webhook ledger: unique-insert race handling, atomic eligible-state claim, contention returns failure for provider retry without spending the owner's retry budget, five-failure dead-letter enforcement, provider/type identity validation. No automatic takeover of PROCESSING rows: crashed attempts require reconciliation because side effects may already have occurred.
- Setup payment settlement: per-client PostgreSQL transaction lock, atomic payment/audit writes, repeat payment-intent deduplication. Stripe checkout uses the canonical payment intent and amount_total, waits for a paid one-time checkout; recurring invoice success only reconciles the invoice rather than recording another setup fee.
- AI: quota database failures deny the paid call while preserving deterministic fallback; Cesar now resolves persistent subscription status rather than only legacy client status. This is not yet a hard concurrent provider-spend ceiling.
- Six legal pages, signed support/education template and portal legal wording revised. See `legal-review-2026-09-07/REVIEW-MEMO.md` for the material changes and unresolved formalities. Existing consumer rights and before-billing gates remain intact.

## Verification

- Production build: PASS (API + web).
- Unit run: 61 pass, 63 database tests skipped in that command.
- Separate serial database integration run: 63 pass, 0 fail, 0 skipped.
- Combined: **124 tests pass**, including six webhook concurrency/retry/recovery tests and two settlement/billing-gate tests.
- Six HTML pages: one heading, balanced containers/paragraphs and internal policy links checked.
- Backup file `credx-prod-20260907-105217.dump` restored successfully to a separate scratch database using PostgreSQL 18. PG16 restore tooling rejected dump format 1.16; use compatible restore tooling. Restore yielded 31 public tables and one completed migration in that older snapshot. No customer record contents printed or exported in this report.

## Newly verified production evidence (read-only)

- Railway API active deployment is dated August 23, 2026, consistent with missing live SaaS routes.
- Live database has 33 public tables. Subscription, Invoice, JobQueue and Organization exist; AiUsageEvent, PlatformReport and Notification do not.
- Eight completed migration names through `20260907140000_readiness_next_best_action_details` were returned, plus a historical unfinished row whose rollback status was not queried. Repository contains **15 migration SQL files**, not the historical report's claimed 18. Seven September-8-named migration files remain beyond that completed sequence. Migration checksums, rollback flags and schema drift need review before applying anything.
- API environment presence checks: Stripe signing/payment configuration and PII_ENCRYPTION_KEY present; SENTRY_DSN, ANALYTICS_ENABLED, POSTHOG_API_KEY and BLOB_READ_WRITE_TOKEN absent. Presence is not validity or successful provider operation. No secret values emitted.

## Remaining gates

- Provision/connect a private document store and verify authorized upload/download/expiry; enable monitoring and deliver a test alert. Use provider/Railway protected settings, never chat credentials.
- Fresh backup, migration status/rollback/checksum/drift review, then compatible migration and service-specific Railway release. The restored snapshot predates the currently applied schema and is not the required fresh pre-migration backup.
- Full signup/billing/cancellation/document/browser journey tests and completed contract/disclosure formalities, detailed service/payment terms and legal review identified in the legal memo.
- Provider reconciliation and out-of-order subscription events; cross-event/cross-client payment identity protection and PayPal browser/webhook races need further testing. The new per-client lock does not claim cross-client uniqueness for a forged/misassociated provider reference.
- AI concurrent reservations/spending ceiling, self-service subscription management, representative authenticated load testing, worker crash recovery and operational alerting.

## Webhook recovery procedure

For PROCESSING rows left by a crash or DEAD_LETTER rows, do not blindly replay. Stop/identify the owning processor; reconcile the provider event and every database/external side effect; record the operator decision. If fully applied, mark the event processed with evidence. If safe to retry, explicitly reset to a retryable state only after establishing prior side effects are idempotent or compensated. Use a narrowly scoped reviewed operation; no bulk reset. In-flight duplicates intentionally receive failure rather than a false success acknowledgment.

## Deployment boundaries

No application or database changes were applied to production. The full branch cannot be represented as deployment-ready with its missing tables/storage and incomplete legal execution flow. The user's authorization to continue is retained; these are unresolved prerequisites, not a repeated request for permission.
