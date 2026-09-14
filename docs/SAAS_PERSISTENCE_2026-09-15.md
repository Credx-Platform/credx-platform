# Durable SaaS persistence pass — 2026-09-15

This pass adds the relational source of truth for production portal progress. The
existing `ClientProgress` JSON is retained as a compatibility read model while
new writes can be made durable and queryable without browser local storage.

## Delivered

- `OnboardingState`: goals, current step, status, completion timestamp.
- `LessonCompletion` and `QuizResult`: idempotent lesson completion and append-only quiz attempts.
- `ActionPlanItem` and `Milestone`: owned, keyed progress records with status/concurrency-safe upserts.
- `WorkflowState`: versioned stage state with optimistic concurrency (`expectedVersion`).
- `CesarConversation` / `CesarMessage`: owned durable AI history.
- `DataExportRequest` and `AccountDeletionRequest`: durable privacy requests with duplicate suppression.
- Authenticated `/api/saas/*` endpoints, including a bootstrap `/state` response, secure profile update, and staff/admin overview.
- Existing masterclass/progress writes mirror into relational lesson, quiz, and workflow records.

All client-facing queries scope by the authenticated user's `Client.id`; conversations
and admin overview have explicit ownership/role checks. Input payloads are bounded by
Zod and action-plan/workflow writes use unique keys/version checks for idempotency.

## Verification

- API Prisma generate + TypeScript build: passed.
- Full unit suite: 72 passed, 69 database-gated tests skipped because `TEST_DATABASE_URL` was unavailable.
- Database safety suite: 7 passed.
- `git diff --check`: passed.

## Required release gates

1. Apply migration `20260915090000_add_durable_saas_progress` through the approved non-production/Railway release workflow.
2. Run the integration suite against a disposable PostgreSQL database, including cross-account ownership checks and workflow version conflicts.
3. Wire the portal's current fetch/update hooks to `/api/saas/state` and the typed resource endpoints, then run the browser journey.
4. Reconcile with the separate Railway document-storage repair before any main-branch deployment; this branch intentionally does not alter that release.
5. Run payment sandbox, inbox delivery, backup/restore, monitoring, and production migration verification separately; this pass performed no live charges, emails, or deployment.
