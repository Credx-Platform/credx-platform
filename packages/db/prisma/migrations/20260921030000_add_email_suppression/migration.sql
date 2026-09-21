-- Email opt-out list. Additive: CREATE TABLE + indexes only, no changes to
-- existing objects, consistent with the additive-only production policy.
CREATE TABLE "EmailSuppression" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "reason" TEXT NOT NULL DEFAULT 'USER_REQUEST',
  "source" TEXT NOT NULL DEFAULT 'link',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resubscribedAt" TIMESTAMP(3),
  CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmailSuppression_email_key" ON "EmailSuppression"("email");
CREATE INDEX "EmailSuppression_createdAt_idx" ON "EmailSuppression"("createdAt");
