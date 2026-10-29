CREATE TABLE "AdminEmailTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdminEmailTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminEmailTemplate_key_key" ON "AdminEmailTemplate"("key");
CREATE INDEX "AdminEmailTemplate_active_updatedAt_idx" ON "AdminEmailTemplate"("active", "updatedAt");
