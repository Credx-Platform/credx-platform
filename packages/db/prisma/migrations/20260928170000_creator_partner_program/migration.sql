ALTER TABLE "SubAgent"
  ADD COLUMN "policyVersion" TEXT,
  ADD COLUMN "programTier" TEXT NOT NULL DEFAULT 'CREATOR',
  ADD COLUMN "initialCommissionBps" INTEGER NOT NULL DEFAULT 3000,
  ADD COLUMN "recurringCommissionBps" INTEGER NOT NULL DEFAULT 1500,
  ADD COLUMN "recurringMonths" INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN "overrideCommissionBps" INTEGER NOT NULL DEFAULT 500,
  ADD COLUMN "payoutHoldDays" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "applicationId" TEXT,
  ADD COLUMN "recruitedBySubAgentId" TEXT;

ALTER TABLE "AgentApplication"
  ADD COLUMN "primaryPlatform" TEXT,
  ADD COLUMN "audienceSize" TEXT,
  ADD COLUMN "socialProfileEncrypted" TEXT,
  ADD COLUMN "contentFocusEncrypted" TEXT;

CREATE UNIQUE INDEX "SubAgent_applicationId_key" ON "SubAgent"("applicationId");
CREATE INDEX "SubAgent_programTier_idx" ON "SubAgent"("programTier");
CREATE INDEX "SubAgent_recruitedBySubAgentId_idx" ON "SubAgent"("recruitedBySubAgentId");

ALTER TABLE "SubAgent"
  ADD CONSTRAINT "SubAgent_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "AgentApplication"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SubAgent"
  ADD CONSTRAINT "SubAgent_recruitedBySubAgentId_fkey"
  FOREIGN KEY ("recruitedBySubAgentId") REFERENCES "SubAgent"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
