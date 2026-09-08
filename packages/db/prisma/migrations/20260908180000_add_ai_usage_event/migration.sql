-- SaaS Phase E: AI usage + cost ledger (2026-09-08)
-- SAFETY: fully additive. No DROP / no type change. Idempotent.

-- CreateTable
CREATE TABLE IF NOT EXISTS "AiUsageEvent" (
    "id" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'ai-gateway',
    "model" TEXT NOT NULL,
    "promptVersion" TEXT,
    "clientId" TEXT,
    "userId" TEXT,
    "plan" TEXT,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiUsageEvent_task_createdAt_idx" ON "AiUsageEvent"("task", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiUsageEvent_clientId_createdAt_idx" ON "AiUsageEvent"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiUsageEvent_userId_createdAt_idx" ON "AiUsageEvent"("userId", "createdAt");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "AiUsageEvent" ADD CONSTRAINT "AiUsageEvent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
