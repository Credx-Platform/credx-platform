-- SaaS Transformation: additive migration (2026-09-07)
-- Adds: Organization/team model, webhook event ledger + idempotency, job queue +
-- worker heartbeat, error-event monitoring table, CredX Readiness Score snapshots,
-- CreditScore history, affiliate/sub-agent referral tables, and Client org/referral columns.
--
-- SAFETY: fully additive. No DROP TABLE / DROP COLUMN / column-type changes.
-- All statements are idempotent (IF NOT EXISTS / duplicate_object guards) so this
-- migration is safe to apply on a database whose schema was previously maintained
-- with `prisma db push` and may already contain a subset of these objects.

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "WebhookEventStatus" AS ENUM ('RECEIVED', 'VALIDATED', 'PROCESSING', 'PROCESSED', 'FAILED', 'RETRYING', 'DEAD_LETTER');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'FAILED', 'DELAYED', 'PAUSED', 'RETRYING');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'BILLING', 'VIEWER');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AlterEnum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'AFFILIATE';

-- AlterTable
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "customerType" TEXT NOT NULL DEFAULT 'DIRECT',
ADD COLUMN IF NOT EXISTS "organizationId" TEXT,
ADD COLUMN IF NOT EXISTS "referralCodeAtSignup" TEXT,
ADD COLUMN IF NOT EXISTS "referredBySubAgentId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE IF NOT EXISTS "SubAgent" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "referralCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "adminUserId" TEXT,
    "onboardingTokenHash" TEXT,
    "onboardingTokenExpiresAt" TIMESTAMP(3),
    "policyAcceptedAt" TIMESTAMP(3),
    "policySignature" TEXT,
    "policyIpAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SubAgentContact" (
    "id" TEXT NOT NULL,
    "subAgentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CLICKED',
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "creditGoal" TEXT,
    "sourceUrl" TEXT,
    "landingPath" TEXT,
    "ipAddress" TEXT,
    "city" TEXT,
    "region" TEXT,
    "country" TEXT,
    "location" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubAgentContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CreditScore" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "bureau" TEXT,
    "pulledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastPulledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReadinessScoreSnapshot" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "dataQuality" TEXT NOT NULL,
    "categories" JSONB NOT NULL DEFAULT '[]',
    "strengths" JSONB NOT NULL DEFAULT '[]',
    "opportunities" JSONB NOT NULL DEFAULT '[]',
    "nextBestActions" JSONB NOT NULL DEFAULT '[]',
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadinessScoreSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "WebhookEvent" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "signature" TEXT,
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "processedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "externalEventId" TEXT,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "payloadHash" TEXT,
    "response" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "JobQueue" (
    "id" TEXT NOT NULL,
    "queueName" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "delayUntil" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "error" TEXT,
    "result" JSONB,
    "workerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "WorkerHeartbeat" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "queueName" TEXT NOT NULL,
    "hostname" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastBeat" TIMESTAMP(3) NOT NULL,
    "jobsProcessed" INTEGER NOT NULL DEFAULT 0,
    "jobsFailed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "website" TEXT,
    "description" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "planCode" TEXT NOT NULL DEFAULT 'ESSENTIAL',
    "maxMembers" INTEGER NOT NULL DEFAULT 5,
    "maxClients" INTEGER NOT NULL DEFAULT 50,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OrganizationMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrganizationRole" NOT NULL DEFAULT 'MEMBER',
    "clientId" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OrganizationInvitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "OrganizationRole" NOT NULL DEFAULT 'MEMBER',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ErrorEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'error',
    "environment" TEXT NOT NULL DEFAULT 'development',
    "release" TEXT,
    "platform" TEXT NOT NULL DEFAULT 'node',
    "exceptionType" TEXT,
    "exceptionValue" TEXT,
    "exceptionStack" TEXT,
    "userId" TEXT,
    "clientId" TEXT,
    "url" TEXT,
    "method" TEXT,
    "tags" JSONB NOT NULL DEFAULT '{}',
    "extra" JSONB NOT NULL DEFAULT '{}',
    "breadcrumbs" JSONB NOT NULL DEFAULT '[]',
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErrorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SubAgent_affiliateId_key" ON "SubAgent"("affiliateId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SubAgent_referralCode_key" ON "SubAgent"("referralCode");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SubAgent_adminUserId_key" ON "SubAgent"("adminUserId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SubAgent_onboardingTokenHash_key" ON "SubAgent"("onboardingTokenHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SubAgent_status_idx" ON "SubAgent"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SubAgentContact_subAgentId_idx" ON "SubAgentContact"("subAgentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SubAgentContact_createdAt_idx" ON "SubAgentContact"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SubAgentContact_status_idx" ON "SubAgentContact"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReadinessScoreSnapshot_clientId_createdAt_idx" ON "ReadinessScoreSnapshot"("clientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WebhookEvent_externalEventId_key" ON "WebhookEvent"("externalEventId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WebhookEvent_source_eventType_idx" ON "WebhookEvent"("source", "eventType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WebhookEvent_status_createdAt_idx" ON "WebhookEvent"("status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WebhookEvent_externalEventId_idx" ON "WebhookEvent"("externalEventId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "IdempotencyKey_key_key" ON "IdempotencyKey"("key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IdempotencyKey_key_scope_idx" ON "IdempotencyKey"("key", "scope");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "JobQueue_queueName_status_priority_idx" ON "JobQueue"("queueName", "status", "priority");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "JobQueue_queueName_status_createdAt_idx" ON "JobQueue"("queueName", "status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "JobQueue_status_delayUntil_idx" ON "JobQueue"("status", "delayUntil");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WorkerHeartbeat_workerId_key" ON "WorkerHeartbeat"("workerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WorkerHeartbeat_queueName_lastBeat_idx" ON "WorkerHeartbeat"("queueName", "lastBeat");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Organization_slug_idx" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Organization_stripeCustomerId_idx" ON "Organization"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationMember_clientId_key" ON "OrganizationMember"("clientId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrganizationMember_organizationId_role_idx" ON "OrganizationMember"("organizationId", "role");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationInvitation_tokenHash_key" ON "OrganizationInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrganizationInvitation_tokenHash_idx" ON "OrganizationInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrganizationInvitation_expiresAt_idx" ON "OrganizationInvitation"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationInvitation_organizationId_email_key" ON "OrganizationInvitation"("organizationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ErrorEvent_eventId_key" ON "ErrorEvent"("eventId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ErrorEvent_level_occurredAt_idx" ON "ErrorEvent"("level", "occurredAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ErrorEvent_environment_release_idx" ON "ErrorEvent"("environment", "release");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ErrorEvent_userId_occurredAt_idx" ON "ErrorEvent"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ErrorEvent_resolved_occurredAt_idx" ON "ErrorEvent"("resolved", "occurredAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Client_customerType_idx" ON "Client"("customerType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Client_referredBySubAgentId_idx" ON "Client"("referredBySubAgentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Client_organizationId_idx" ON "Client"("organizationId");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "SubAgent" ADD CONSTRAINT "SubAgent_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "SubAgentContact" ADD CONSTRAINT "SubAgentContact_subAgentId_fkey" FOREIGN KEY ("subAgentId") REFERENCES "SubAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "Client" ADD CONSTRAINT "Client_referredBySubAgentId_fkey" FOREIGN KEY ("referredBySubAgentId") REFERENCES "SubAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "Client" ADD CONSTRAINT "Client_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "CreditScore" ADD CONSTRAINT "CreditScore_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "ReadinessScoreSnapshot" ADD CONSTRAINT "ReadinessScoreSnapshot_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

