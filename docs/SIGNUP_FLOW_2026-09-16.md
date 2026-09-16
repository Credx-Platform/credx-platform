# Sign-up Flow Adjustment — 2026-09-16

## What changed and why

The credit-report upload (and monitoring-provider step) sat inside the client
sign-up wizard and was stalling clients before they finished the application.
Sign-up no longer waits on a credit report. The report is now added later,
from inside the client portal.

## New client flow

1. Register (provisional password, session issued — unchanged).
2. Step 1 — sign the CredX agreement (unchanged; CROA disclosures intact).
3. Step 2 — complete intake / detailed profile (unchanged).
4. **Welcome to CredX** — after pressing "Save intake" the wizard shows a
   welcome card with an inline password-setup form. Submitting it calls the
   new authenticated `POST /api/auth/set-password` endpoint.
5. First sign-in — a dismissible banner reminds the client to add their
   credit report and points to **Analysis & Reports**.
6. Portal overview — brief explanation of how to add the report (upload
   PDF/HTML or save provider credentials); the existing Analysis & Reports
   upload remains the only upload path.

## Backend

- `POST /api/applications`: workflow stage after intake is now
  `application_completed` (was `report_required`); `workflow.next` is
  `['set_portal_password', 'add_credit_report_in_portal']`. The portal-ready
  email now fires here (gates — contract signed + profile filled — are
  satisfied at this point; the existing once-per-client guard still applies),
  preserving the emailed setup link as a recovery path.
- `POST /api/auth/set-password` (new, authenticated): sets the password for
  the signed-in user (the sign-up session uses a provisional password the
  client never sees). For post-application clients it also marks onboarding
  complete (`onboarding.status: 'completed'`, `completedAt`) the first time
  the password is set. The token-based `/api/auth/password-setup/*` flow is
  untouched and remains the close-the-browser recovery path.

## Backward compatibility

- In-flight clients at legacy stages (`report_required`, `portal_unlocked`,
  `upload_credit_report`, `credit_report_received`) without a completed
  onboarding see the same welcome/password card, which un-stalls them; the
  emailed setup link also still works for them.
- Report upload behaviour in **Analysis & Reports** is unchanged, including
  the owner/dispute-manager notifications and the `dispute_review_pending`
  stage transition that fire when a report is uploaded.
- No billing, dispute, pricing, or disclosure changes.

## Verification (disposable PostgreSQL, since removed)

- `npm run build` (API + web) — passed.
- `npm run test:web` — 5/5 passed.
- `npm run test` — 72 unit passed (71 DB-gated skipped without
  `TEST_DATABASE_URL`, as designed).
- `npm run test:db-safety` — 7/7 passed.
- `npm run test:integration` — 71/71 passed on a disposable database
  (schema synced via guarded db-push).
- Live smoke test against a running API on the disposable database:
  register → contract → application (`next_step: password_setup`, stage
  `application_completed`) → inline set-password → onboarding `completed` →
  login with the new password succeeds; short password rejected with 400.
- `git diff --check` clean.

## Known notes

- The register route sets the initial stage to `contract_pending` (existing
  behaviour, not changed here).
- The report-reminder banner dismissal is stored in `localStorage` (a UI
  preference only); the source of truth for report state remains server-side.
- No production deployment performed; targets the pending
  `release/saas-identity-20260915` line (PR #11) so the change ships with it.
