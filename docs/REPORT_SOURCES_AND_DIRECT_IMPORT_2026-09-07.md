# Report sources and direct-import readiness — September 7, 2026

## Confirmed product description

Owner clarified that customers sign up, sign the applicable contract, then can upload their report or enroll through provided provider links. Current wording: **credit-profile tracking, report analysis, financial-readiness and credit-building tools**. Month-to-month describes an authorized monthly plan's term, not an average repair-completion promise. One-time products remain one-time.

Third-party MyFreeScoreNow/IdentityIQ monitoring is distinct from CredX itself providing continuous monitoring, automatic refreshes or alerts. Preserve both existing customer paths. Analysis and consultation/review precede billing for credit-related support; full performance and applicable statutory gates still apply.

## Implemented corrections

- Portal onboarding, report area, workflow tasks and optional provider-details card no longer imply that a saved provider name/password is an authenticated API connection.
- Upload action explicitly says upload for analysis; the existing upload handler starts extraction/analysis after accepting the file. This is not a new verified production integration and the existing background work uses setImmediate rather than a durable queue.
- Product page explains signup/agreement/intake → upload OR provider link → analysis/review; removed the customer-facing internal infrastructure diagram.
- Terms/Privacy explain both report sources and separate provider fees/cancellation. Terms distinguish monthly access from repair timeframe. Service agreement, Cesar next-step copy and welcome-email steps aligned.
- Unverified direct-score helper now fails closed with `DIRECT_REPORT_IMPORT_UNAVAILABLE` (HTTP 503 from the authenticated pull route). Existing saved score/latest/history reads remain unchanged. No consumer report was requested, no provider charge incurred, and no production configuration changed.

## MyFreeScoreNow evidence

Production API environment has MYFREESCORENOW_API_KEY configured (presence only; no value printed). This confirms configured access material, **not** integration correctness.

The previous helper issued a generic GET to `https://api.myfreescorenow.com/credit-score` with only a Bearer credential. It sent no member ID, consumer identity, linked provider account or authorization record. Its expected response contained only a score, optional bureau and timestamp, not the full report/tradelines needed by the analysis engine. It also defaulted missing bureau information to TransUnion and did not validate response ownership. No supporting partner API documentation was found in the repository.

That path cannot safely be labeled a customer-specific one-click pull. Rather than send a real consumer request using an undocumented endpoint, it has been disabled locally pending an approved provider contract.

## One-click pull-and-analysis implementation prerequisites

1. Partner API documentation/developer portal and confirmation that the commercial account permits full report retrieval, not merely affiliate enrollment or a score widget.
2. Documented hosted authentication/identity verification and explicit consumer authorization, permissible-purpose requirements, refresh limits and fees. Never assume a general service signature authorizes all future pulls.
3. Stable mapping between the signed-in CredX client and provider consumer/member ID, with a response ownership check. No shared generic score attributed to multiple users.
4. Full-report payload/PDF retrieval contract, bureau/data-date metadata, sandbox fixture and error/rate-limit behavior.
5. Verified private storage, durable import job with duplicate-click protection and retry control, transactional report persistence, then the existing extraction/analysis workflow. No automatic charge or paid support activation.
6. User-visible pending/success/failure states and an upload fallback. Provider enrollment/verification may be a first-time prerequisite; “one click” is only appropriate for an already authorized linked account.
7. Sandbox tests for authorization denial, cross-client linkage, duplicate click, provider outage, timeout, incomplete reports and revoked access before any production consumer pull.

Requested the provider documentation URL via the text-input tool; no credentials requested in chat. Direct-import implementation remains blocked on the documented provider interface. The copy correction and protective endpoint change are completed locally, not deployed.

## Checks

API/web build passed; 62 non-database tests passed, including a new regression proving the unverified helper makes no provider request. The 63 existing DB integration tests were skipped in this command (they passed in the previous hardening cycle; not rerun here). No claim of a new 125-test combined run or live provider smoke test.
