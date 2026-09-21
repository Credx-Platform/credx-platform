-- Admin/client task management (2026-09-11)
-- SAFETY: fully additive. No DROP / no type change. Idempotent.

ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'general';
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;

CREATE INDEX IF NOT EXISTS "Task_clientId_idx" ON "Task"("clientId");
CREATE INDEX IF NOT EXISTS "Task_completed_idx" ON "Task"("completed");
