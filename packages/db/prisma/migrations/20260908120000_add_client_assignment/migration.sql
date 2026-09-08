-- SaaS Transformation Phase C1: professional <-> client assignment (2026-09-08)
-- Adds ClientAssignment so an organization member ("professional") can be made
-- responsible for specific clients, enforced by the tenant-query helpers.
--
-- SAFETY: fully additive. No DROP / no type change. Idempotent.

-- CreateTable
CREATE TABLE IF NOT EXISTS "ClientAssignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClientAssignment_organizationId_userId_idx" ON "ClientAssignment"("organizationId", "userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClientAssignment_clientId_idx" ON "ClientAssignment"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ClientAssignment_clientId_userId_key" ON "ClientAssignment"("clientId", "userId");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "ClientAssignment" ADD CONSTRAINT "ClientAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "ClientAssignment" ADD CONSTRAINT "ClientAssignment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "ClientAssignment" ADD CONSTRAINT "ClientAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
