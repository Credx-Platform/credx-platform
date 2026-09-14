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

## Portal integration and verification follow-up

The customer portal now requests `/api/saas/state` on every authenticated bootstrap/reload. Durable lesson completions and quiz attempts are merged into the masterclass view, and Cesar conversation/message writes use the authenticated durable conversation endpoints (with the legacy Cesar response endpoint retained for response generation). The legacy progress payload remains loaded for existing dispute/document screens while migration is incremental.

| Capability | Durable API | Portal status | Evidence |
| --- | --- | --- | --- |
| Onboarding goals/state | `/api/saas/onboarding` | Goals editor is available in the portal's Goals & Tasks tab and reloads from durable bootstrap | `saas.integration.test.ts` reload assertion; web build |
| Readiness score/explanation/history | Existing readiness routes + state history | Existing readiness panel and snapshot flow; history returned in durable bootstrap | route/UI inspection; existing readiness tests |
| Action plans/milestones | `/api/saas/action-plan`, `/api/saas/milestones/:key` | Goals & Tasks tab lists owned durable items and supports completion/achievement updates; existing team tasks remain intact | `saas.integration.test.ts`; web build |
| Lessons/quizzes | `/api/saas/lessons/*`, `/api/saas/quizzes/*` | Masterclass completion/attempts mirrored and reload from durable state | `saas.integration.test.ts`; web build |
| Document vault | Existing authenticated document routes/storage repair | Existing portal document flow retained; no storage changes in this branch | prior commit `5620093` preserved |
| Cesar limits/conversations | `/api/saas/conversations/*` + Cesar chat | Conversation history bootstraps and new messages persist durably; generation remains legacy endpoint | ownership test; web build |
| Subscription/entitlements | Durable subscription in `/api/saas/state` | Bootstrap exposes current plan/status; billing UI remains existing flow | route schema/state response |
| Notifications | Durable notifications in `/api/saas/state` | Bootstrap exposes latest notifications; existing notification component remains API-backed | route schema/state response |
| Export/deletion requests | `/api/saas/export`, `/api/saas/deletion` | Goals & Tasks tab exposes authenticated export and deletion request controls with status feedback | `saas.integration.test.ts`; web build |
| Admin/audit | `/api/saas/admin/overview`; existing audit records | Staff/admin role gate present; audit UI remains existing surface | route role middleware |

Disposable PostgreSQL verification used the local `credx-launch-tests-20260913` container at `127.0.0.1:55438`. A clean disposable database was baselined with the checked-in Prisma baseline and all 16 subsequent migrations applied successfully via `prisma migrate deploy`; the existing journey database received only the durable migration SQL. Results: API build passed, web build passed, all 71 integration tests passed (including durable reload/ownership, privacy requests, audit writes, and stale workflow conflict), and no production database, deployment, email, or payment provider was contacted. Cesar quota enforcement is verified by the existing AI integration coverage: once usage exceeds the plan budget, usage is marked not-allowed; Cesar's documented deterministic fallback remains available when provider AI is unavailable or quota is exhausted.
