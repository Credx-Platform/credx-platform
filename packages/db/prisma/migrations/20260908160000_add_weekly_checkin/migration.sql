-- SaaS Phase D: weekly check-in (2026-09-08)
-- SAFETY: fully additive. No DROP / no type change. Idempotent.

-- CreateTable
CREATE TABLE IF NOT EXISTS "WeeklyCheckIn" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "balancesChanged" BOOLEAN,
    "balancesNote" TEXT,
    "creditLimitChanged" BOOLEAN,
    "creditLimitNote" TEXT,
    "newAccountOpened" BOOLEAN,
    "newAccountNote" TEXT,
    "accountClosed" BOOLEAN,
    "accountClosedNote" TEXT,
    "incomeChanged" BOOLEAN,
    "incomeNote" TEXT,
    "hardInquiry" BOOLEAN,
    "freeText" TEXT,
    "changeSummary" JSONB NOT NULL DEFAULT '[]',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WeeklyCheckIn_clientId_submittedAt_idx" ON "WeeklyCheckIn"("clientId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WeeklyCheckIn_clientId_weekKey_key" ON "WeeklyCheckIn"("clientId", "weekKey");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "WeeklyCheckIn" ADD CONSTRAINT "WeeklyCheckIn_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
