# CredX Prisma migrations

## History / why the baseline exists

Production (`credxapi-production`) was originally bootstrapped with
`prisma db push`, not `prisma migrate`. Only four incremental migrations were
ever committed, and they assume the base tables already exist. There was no
`_init` migration.

To move CredX onto a proper migration workflow **without touching production
data**, this directory now contains:

| Migration | Purpose |
| --- | --- |
| `00000000000000_baseline` | Full schema as it stood at commit `04d4d8a` (pre-SaaS). Represents what production already has. **Must be marked as applied, never run, on prod.** |
| `20250610160000_add_dispute_letter_fields` | Pre-existing. Idempotent (`IF NOT EXISTS`). |
| `20260616131500_add_student_client_status` | Pre-existing. `ADD VALUE IF NOT EXISTS`. |
| `20260616131600_mark_existing_masterclass_leads_as_students` | Pre-existing data backfill. |
| `20260717120000_add_masterclass_payment_provider` | Pre-existing. Idempotent. |
| `20260907120000_saas_transformation_additive` | **New.** Org/team model, webhook ledger + idempotency, job queue + worker heartbeat, ErrorEvent, ReadinessScoreSnapshot, CreditScore, sub-agent/affiliate tables, Client org/referral columns. Fully additive, all statements idempotent, **no DROP / no column-type changes**. |
| `20260907130000_add_subscription_invoice_models` | **New.** Persistent `Subscription` (recurring plan lifecycle, reconciled from Stripe/PayPal/manual) + `Invoice` (billing document history), both client-scoped. Fully additive, all statements idempotent, **no DROP / no column-type changes**. |
| `20260907140000_readiness_next_best_action_details` | **New.** `ReadinessScoreSnapshot.nextBestActionDetails JSONB DEFAULT '[]'` — persists the structured/ranked next-best-action list. Single `ADD COLUMN IF NOT EXISTS`. |
| `20260908120000_add_client_assignment` | **New.** `ClientAssignment` (professional ↔ client, `@@unique([clientId, userId])`) so an org member can be made responsible for specific clients. Fully additive, idempotent. |

The full chain was verified against a throwaway PostgreSQL 16 instance
(`prisma migrate deploy` from empty → all nine apply cleanly, zero schema drift
vs `schema.prisma`; the new `20260907130000` / `20260907140000` migrations were
re-run and confirmed idempotent).

## First-time production adoption (run once, owner-approved)

```bash
# 1. Take a fresh backup first (see docs/DISASTER_RECOVERY.md).

# 2. Tell Prisma prod already has the baseline + the 4 historical migrations:
DATABASE_URL=<prod> npx prisma migrate resolve --applied 00000000000000_baseline           --schema packages/db/prisma/schema.prisma
DATABASE_URL=<prod> npx prisma migrate resolve --applied 20250610160000_add_dispute_letter_fields --schema packages/db/prisma/schema.prisma
DATABASE_URL=<prod> npx prisma migrate resolve --applied 20260616131500_add_student_client_status --schema packages/db/prisma/schema.prisma
DATABASE_URL=<prod> npx prisma migrate resolve --applied 20260616131600_mark_existing_masterclass_leads_as_students --schema packages/db/prisma/schema.prisma
DATABASE_URL=<prod> npx prisma migrate resolve --applied 20260717120000_add_masterclass_payment_provider --schema packages/db/prisma/schema.prisma

# 3. Dry-run the only migration that will actually execute:
DATABASE_URL=<prod> npx prisma migrate diff \
  --from-url <prod> \
  --to-schema-datamodel packages/db/prisma/schema.prisma --script
#    Review the output. It should match 20260907120000_saas_transformation_additive
#    (or be a strict subset — prod may already have some objects from db push).

# 4. Apply:
DATABASE_URL=<prod> npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
```

Because `20260907120000` is idempotent, re-running it is safe.

## Ongoing workflow

New schema changes: `npx prisma migrate dev --create-only`, review the SQL,
keep it additive/reversible, then commit. Never edit an applied migration.
