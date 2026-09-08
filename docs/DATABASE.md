# Database

## CURRENT

- ORM: Prisma.
- Provider: PostgreSQL via `DATABASE_URL`.
- Schema: `packages/db/prisma/schema.prisma` (single canonical schema; the legacy `packages/db/prisma.schema.prisma` was removed 2026-09-07).

Core models include:

- `User`, `Client`, `Lead`
- `ClientProgress`
- `CreditReport`, `Tradeline`, `CreditScore`
- `ReadinessScoreSnapshot`
- `Dispute`, `DisputeItem`, `DisputeRound`, `Furnisher`
- `Payment`, `Agreement`, `Document`, `Task`, `Note`
- `AuditLog`, `ActivityEvent`
- `SubAgent`, `SubAgentContact`

## MIGRATIONS

Migrations exist under `packages/db/prisma/migrations`.

Recent migrations include masterclass payment provider and sub-agent referral/onboarding fields.

Latest pending migration:

- `20260903072000_add_readiness_score_snapshots` adds dedicated persisted history for the proprietary CredX Readiness Score and backfills any early marker-based snapshots.

## GAPS

- No `Plan`, `Subscription`, or `Entitlement` model yet.
- No `Organization`, `OrganizationMember`, role assignment, or tenant boundary model yet.
- No webhook event ledger model yet.
- No job table or queue metadata model yet.
- Readiness score history now has a dedicated table, but the migration has not been applied to production.
- Backup/restore policy is not documented.
- PgBouncer usage is not confirmed.

## RULES

- Use migrations for schema changes.
- Do not run destructive production migrations without explicit authorization.
- Add indexes for new lookup/filter paths.
- Paginate staff/client lists before scale.
