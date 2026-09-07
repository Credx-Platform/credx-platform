-- SaaS Phase C2: Funding Readiness module (2026-09-08)
-- CredX does NOT guarantee approval or funding — this stores readiness prep only.
-- SAFETY: fully additive. No DROP / no type change. Idempotent.

-- CreateTable
CREATE TABLE IF NOT EXISTS "FundingReadinessProfile" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "objective" TEXT,
    "targetAmount" DECIMAL(65,30),
    "targetTimeframe" TEXT,
    "monthlyIncome" DECIMAL(65,30),
    "incomeType" TEXT,
    "notes" TEXT,
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "documentChecklist" JSONB NOT NULL DEFAULT '[]',
    "lastAssessment" JSONB,
    "lastAssessedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundingReadinessProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FundingReadinessProfile_clientId_key" ON "FundingReadinessProfile"("clientId");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "FundingReadinessProfile" ADD CONSTRAINT "FundingReadinessProfile_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
