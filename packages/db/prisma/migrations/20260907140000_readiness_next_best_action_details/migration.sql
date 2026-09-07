-- SaaS Transformation: richer readiness next-best-action mapping (2026-09-07)
-- Adds ReadinessScoreSnapshot.nextBestActionDetails to persist the structured,
-- ranked next-best-action list (category + priority + potential points + portal
-- deep-link) alongside the existing flat string array.
--
-- SAFETY: fully additive. No DROP / no type change. Idempotent.

ALTER TABLE "ReadinessScoreSnapshot"
  ADD COLUMN IF NOT EXISTS "nextBestActionDetails" JSONB NOT NULL DEFAULT '[]';
