-- SaaS Phase D: platform reports (2026-09-08)
-- SAFETY: fully additive. No DROP / no type change. Idempotent.

-- CreateTable
CREATE TABLE IF NOT EXISTS "PlatformReport" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "format" TEXT NOT NULL DEFAULT 'html',
    "title" TEXT NOT NULL,
    "html" TEXT,
    "data" JSONB,
    "disclosure" TEXT NOT NULL,
    "dataSources" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlatformReport_clientId_kind_createdAt_idx" ON "PlatformReport"("clientId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlatformReport_status_idx" ON "PlatformReport"("status");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "PlatformReport" ADD CONSTRAINT "PlatformReport_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
