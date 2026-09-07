# CredX launch-readiness audit — 2026-09-07

## Verdict

**Not Ready for a 9/10 launch sign-off.** The existing 24-category rubric computes to **7.0/10** (168/240), whereas its narrative says 7.9 without explaining weights. This is a repository maturity baseline, **not a verified production rating**. Live launch readiness is lower-confidence and not assigned a fabricated numerical score.

The upgrade contains substantial real SaaS functionality, but the public deployment does not expose the new pages or health routes. Passing source tests must not be confused with production verification.

Scope: original `CredX_OpenClaw_Codex_Master_Prompt` (sections 0–79), existing PRODUCT_ROADMAP, SAAS_AUDIT and transformation report; source review, production read-only HTTP probes, fresh local build, unit and isolated database integration tests. Branch: `saas-transformation`; initial commit `f30c09a`. No production deployment, migration, payment, customer mutation, email, credential rotation, or load test performed.

## 1. Verified production evidence

Checks at approximately 15:05–15:11 UTC, September 7:

| Surface | Result | Interpretation |
| --- | --- | --- |
| Apex homepage | Redirects to www, HTTP 200, Railway server | Public web is reachable on Railway |
| `/product`, `/team`, `/financial-readiness`, `/security` | HTTP 200 but identical homepage body | False-positive page health; actual new pages not served |
| Homepage and those pages | Same SHA-256 prefix `db70d9d03da297c0`, same old credit-education title | Not distinct SaaS page artifacts |
| `/pricing`, `/privacy`, `/terms` | HTTP 200, distinct titles/body hashes | Existing pages reachable; legal sufficiency not assessed |
| Web `/api/billing/entitlements/me` | HTTP 404 | New entitlement endpoint unavailable through public web |
| Railway API `/health` | HTTP 200, status ok | API process reachable only; does not establish database health |
| Railway API `/health/db`, `/health/queue` | HTTP 404 | Upgrade health routes unavailable |
| Public web security headers | HSTS, nosniff, SAMEORIGIN present; CSP absent | Useful baseline, CSP hardening remains |

Local `apps/web/server.mjs` explicitly maps the new routes to distinct product/team/readiness artifacts. Production differs. Exact deployed commit and Railway deployment configuration were not retrieved, so stale deployment versus configuration mismatch remains to be determined.

## 2. Findings and changes

### P0 release gate — upgrade not verified live (guide §§9–10, 29, 76)

The evidence above prevents a Production Verified label. Prepare and review service-specific Railway builds, database compatibility, rollback and staging flows before releasing both web and API. Do not use Vercel to deploy the live domain.

### High — canceled subscription could regain paid access (FIXED LOCALLY; §§45, 51)

`apps/api/src/lib/entitlements.ts` previously fell through to client lifecycle when a persistent subscription was canceled/unpaid/paused/incomplete. A stale ACTIVE/PAST_DUE client could therefore regain Premium access after cancellation. Explicit non-entitled subscription state now suppresses this fallback. Separately granted masterclass education remains available. Legacy clients with no subscription retain current behavior; active subscriptions with unknown plan codes still use the legacy fallback and should be reviewed as part of billing reconciliation.

Regression coverage exercises terminated subscription states against both stale lifecycle states and separately granted education.

### High — premium modules did not enforce plan rights (FIXED LOCALLY; §§18, 45)

Funding Readiness and Business Credit checked authentication and ownership but not `can_use_funding_readiness` / `can_use_business_credit`. The plan catalog restricted these to Premium while API access did not. Added shared `middleware/entitlement.ts`, resolving current subscription and education access, and applied it to every route in both modules. Unauthorized feature access now returns 403 with `ENTITLEMENT_REQUIRED`. Existing authentication and ownership checks remain. Regression HTTP/database tests prove free clients cannot read or write these paid modules; entitled fixtures and cross-client denial tests continue to pass.

This is not a claim that every paid endpoint has been audited. Review the remaining Cesar, document, report and professional feature paths for consistent enforcement. New 403 upgrade messaging should be browser-tested before release.

### High — webhook ledger does not guarantee concurrent single processing (OPEN; §§15, 51, 73)

`lib/webhookLedger.ts` only short-circuits duplicates already PROCESSED. Duplicates in PROCESSING fall through; `beginProcessing` is an unconditional update rather than an atomic claim/lease. Concurrent deliveries can enter the processor together. DEAD_LETTER is also allowed to fall through on redelivery despite the documented maximum-attempt posture. This is a source-confirmed control gap, **not evidence of actual duplicate charges**. The safety of each side effect depends on its own idempotency.

Required verification: concurrent same-event delivery, mid-processing crash, duplicate provider IDs, stale/out-of-order subscription updates, and retry exhaustion. Implement atomic ownership/lease plus transaction-safe business idempotency and controlled recovery before claiming exactly-once behavior.

### Medium — AI budget is not a hard spending ceiling (OPEN; §§17–18)

`lib/ai/quota.ts` fails open on a usage-query error and checks historical usage without an atomic reservation. Concurrent paid calls can pass the same budget check. Graceful fallback is valuable, but availability need not imply unlimited paid calls: retain deterministic responses when budget accounting is unavailable; add bounded reservations/provider spend caps and concurrency tests.

### High assurance gap — operational claims not independently verified (OPEN; §§13, 21–22)

Reports claim production migrations and backup/restore verification on September 8, later than this audit's runtime date September 7. They cannot be accepted as fresh proof. Current production migration state, actual latest restorable backup, cron execution, retention, off-host copy, alerts, and provider configuration were not rechecked. Sentry/analytics code existing does not establish delivery or alerting. A database restored from an empty migration chain is not a production-backup restore test.

### Product and revenue gaps (OPEN; §§26, 45–46, 52, 60–61)

Self-service upgrade/downgrade/cancellation, proration/dunning and the goal-first onboarding journey remain incomplete in the roadmap. Existing catalog mixes recurring Essential/Family fees and a one-time Premium product; do not change prices or commercial promises without an explicit business decision. Verify software/support separation and attorney review; no legal approval is implied by this audit.

## 3. Verification actually run

| Check | Result |
| --- | --- |
| Baseline `npm run build` | PASS, API + web |
| Baseline `npm test` | 59 pass; 53 DB tests skipped |
| All migrations into isolated PostgreSQL 16 | PASS |
| Baseline integration tests, serial files | 53 pass, 0 fail, 0 skipped |
| After fixes `npm run build` | PASS, API + web |
| After fixes `npm test` | 61 pass; 55 DB tests skipped in this command |
| After fixes integration tests, serial files | 55 pass, 0 fail, 0 skipped |
| `git diff --check` | PASS |

Combined post-fix coverage: **116 passing tests across the unit and integration runs**. Integration tests use a disposable local-only database, never production. Serial file execution avoids shared-fixture cleanup races. No dedicated lint script exists in the root package; compilation is not presented as a lint pass.

Not performed: authenticated production browser journeys, mobile/accessibility review, email delivery, real/sandbox checkout lifecycle, signed-document expiry, payment concurrency and out-of-order event tests, provider outage matrix, seeded authenticated load test, dependency vulnerability scan, exhaustive security assessment, production backup restoration, or legal review. This report is not a penetration-test certification.

## 4. Path to a defensible 9/10 — ranked acceptance gates

1. **Close payment correctness gaps:** atomic webhook processing, concurrency/crash/out-of-order tests; reconcile provider and local subscription/invoice state. No duplicate effects and no stale paid access.
2. **Complete paid-access enforcement:** audit all catalog rights end-to-end, including canceled, unpaid, trialing, overdue, legacy and education-only users. Confirm independent purchases are not incorrectly revoked.
3. **Prove critical user journeys in staging:** signup → verification/login → goal/profile → readiness/action → paid activation → modules/reports → cancellation; password reset/logout; cross-user document and organization denial. Store dated results.
4. **Verify production data safety:** current migration status and schema compatibility, fresh backup plus successful restore, retention and rollback evidence. Never equate migration tests with backup recovery.
5. **Release the correct Railway artifacts:** service-specific manifests, reviewed migration plan, API then web, healthy dependencies, smoke tests on final www URLs and rollback rehearsal. Each new page must render the intended distinct application.
6. **Operationalize alerts and jobs:** prove a scrubbed test error reaches monitoring and alerts its owner; demonstrate worker drain/retry/recovery and scheduled snapshots/check-ins. Dedicated worker only when operationally justified.
7. **Finish self-service subscription management:** provider-backed invoices, cancellation, plan changes and overdue treatment with agreed pricing; exercise sandbox billing events end-to-end.
8. **Verify document/privacy controls and public claims:** signed URL expiry, tenant permissions, retention/deletion, actual vendor disclosures and attorney-reviewed software/support separation.
9. **Run representative performance/UX checks:** seeded authenticated staging load with latency/error budgets, database connection headroom, mobile/browser/accessibility checks. Health-only throughput is not customer-flow capacity.
10. **Re-score using evidence:** refresh all 24 areas, state weights if used, require ≥9.0 overall plus no unresolved critical/high release blockers and no unverified critical production journey. Defer white-label/RAG/public API and premature infrastructure until justified.

These are acceptance gates, not a promise that adding a monitoring vendor alone yields 9/10. Additional code work remains possible without external accounts; provider/legal decisions and deployment evidence still need their own resolution.

## 5. Handoff and deployment status

**Status: Not Ready.** Two defects repaired locally, all executed checks passing, no production changes. Preserve the ongoing `saas-transformation` work; do not blindly deploy the entire accumulated branch from this audit. No new environment variables or migrations introduced by these fixes. Existing provider/environment needs are documented in the transformation report (names only).

Source scorecard corrected to distinguish arithmetic from previous estimates. This audit does not supersede historical implementation details; it corrects their launch-readiness interpretation.
