-- Agent enrollment: public "Become an Agent" applications (2026-09-18)
-- SAFETY: fully additive. New table + indexes only. No DROP / no type change /
-- no change to existing tables or rows. Idempotent.

-- CreateTable
CREATE TABLE IF NOT EXISTS "AgentApplication" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "firstNameEncrypted" TEXT NOT NULL,
    "lastNameEncrypted" TEXT NOT NULL,
    "emailEncrypted" TEXT NOT NULL,
    "phoneEncrypted" TEXT NOT NULL,
    "motivationEncrypted" TEXT,
    "state" TEXT,
    "experience" TEXT,
    "source" TEXT,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AgentApplication_status_idx" ON "AgentApplication"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AgentApplication_createdAt_idx" ON "AgentApplication"("createdAt");
