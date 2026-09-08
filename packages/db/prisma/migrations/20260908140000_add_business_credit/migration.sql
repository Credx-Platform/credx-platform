-- SaaS Phase C2: Business Credit Workspace (2026-09-08)
-- SAFETY: fully additive. No DROP / no type change. Idempotent.

-- CreateTable
CREATE TABLE IF NOT EXISTS "BusinessCreditProfile" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "legalName" TEXT,
    "entityType" TEXT,
    "formationState" TEXT,
    "einStatus" TEXT NOT NULL DEFAULT 'none',
    "einLast4" TEXT,
    "dunsNumber" TEXT,
    "businessPhone" TEXT,
    "businessEmail" TEXT,
    "businessAddress" TEXT,
    "businessDomain" TEXT,
    "hasBankAccount" BOOLEAN NOT NULL DEFAULT false,
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessCreditProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BusinessVendorAccount" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "accountType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROSPECT',
    "reportsTo" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "creditLimit" DECIMAL(65,30),
    "openedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessVendorAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BusinessTradeline" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "creditorName" TEXT NOT NULL,
    "accountType" TEXT,
    "balance" DECIMAL(65,30),
    "creditLimit" DECIMAL(65,30),
    "status" TEXT,
    "reportedTo" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "openedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessTradeline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BusinessCreditProfile_clientId_key" ON "BusinessCreditProfile"("clientId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BusinessVendorAccount_profileId_status_idx" ON "BusinessVendorAccount"("profileId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BusinessTradeline_profileId_idx" ON "BusinessTradeline"("profileId");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "BusinessCreditProfile" ADD CONSTRAINT "BusinessCreditProfile_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "BusinessVendorAccount" ADD CONSTRAINT "BusinessVendorAccount_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "BusinessCreditProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "BusinessTradeline" ADD CONSTRAINT "BusinessTradeline_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "BusinessCreditProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
