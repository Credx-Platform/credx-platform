-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CLIENT', 'STAFF', 'ADMIN');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('LEAD', 'STUDENT', 'CONTRACT_SENT', 'INTAKE_RECEIVED', 'ANALYSIS_READY', 'UPGRADE_OFFERED', 'ACTIVE', 'PAST_DUE', 'RESTRICTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServiceTier" AS ENUM ('ESSENTIAL', 'AGGRESSIVE', 'FAMILY');

-- CreateEnum
CREATE TYPE "Bureau" AS ENUM ('EXPERIAN', 'TRANSUNION', 'EQUIFAX');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('PENDING', 'LETTER_SENT', 'RESPONSE_DUE', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('SETUP_FEE', 'MONTHLY', 'MASTERCLASS');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('DRAFT', 'SENT', 'SIGNED', 'VOIDED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('IDENTITY', 'PROOF_OF_ADDRESS', 'CREDIT_REPORT', 'CONTRACT', 'DISPUTE_LETTER', 'DISPUTE_RESPONSE', 'DISPUTE_EVIDENCE', 'OTHER');

-- CreateEnum
CREATE TYPE "DisputeItemStatus" AS ENUM ('PENDING', 'IN_DISPUTE', 'DELETED', 'UPDATED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "FurnisherType" AS ENUM ('CREDITOR', 'COLLECTOR', 'BUREAU');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('LATE_PAYMENT', 'COLLECTION', 'CHARGE_OFF', 'INQUIRY', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CLIENT',
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordSetupToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'setup',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordSetupToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "creditGoal" TEXT,
    "referralSource" TEXT,
    "referralName" TEXT,
    "referralOther" TEXT,
    "offerInterest" TEXT,
    "offerEligibleUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ssnEncrypted" TEXT,
    "ssnLast4" TEXT,
    "dobEncrypted" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'LEAD',
    "serviceTier" "ServiceTier" NOT NULL DEFAULT 'ESSENTIAL',
    "currentAddressLine1" TEXT,
    "currentAddressLine2" TEXT,
    "currentCity" TEXT,
    "currentState" TEXT,
    "currentPostalCode" TEXT,
    "analysisSummary" TEXT,
    "disputePlanSummary" TEXT,
    "estimatedTimelineMonths" INTEGER,
    "upgradeOfferedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "flaggedAt" TIMESTAMP(3),
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "setupFeePaid" BOOLEAN NOT NULL DEFAULT false,
    "portalRestricted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientProgress" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "completedDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "passedQuizzes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "uploadedDocs" JSONB NOT NULL DEFAULT '[]',
    "disputes" JSONB NOT NULL DEFAULT '[]',
    "scores" JSONB NOT NULL DEFAULT '{"equifax":null,"experian":null,"transunion":null}',
    "onboarding" JSONB NOT NULL DEFAULT '{"status":"pending","signupAt":null,"completedAt":null}',
    "workflow" JSONB NOT NULL DEFAULT '{"stage":"signup_received","updatedAt":null,"next":["complete_onboarding","upload_credit_report"]}',
    "education" JSONB NOT NULL DEFAULT '{"masterclassEnrolled":false,"masterclassAccess":false,"masterclassProgress":[],"affiliateLinks":[]}',
    "analysis" JSONB,
    "disputeStrategy" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditReport" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "bureau" "Bureau" NOT NULL,
    "source" TEXT,
    "pulledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "score" INTEGER,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tradeline" (
    "id" TEXT NOT NULL,
    "creditReportId" TEXT NOT NULL,
    "creditorName" TEXT NOT NULL,
    "accountNumber" TEXT,
    "accountType" TEXT,
    "status" TEXT,
    "balance" DECIMAL(65,30),
    "isNegative" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tradeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "creditorName" TEXT NOT NULL,
    "accountNumber" TEXT,
    "bureau" "Bureau" NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "status" "DisputeStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "letterSentAt" TIMESTAMP(3),
    "responseDueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountType" "AccountType",
    "balance" DECIMAL(65,30),
    "dateAdded" TIMESTAMP(3),
    "disputeEquifax" BOOLEAN NOT NULL DEFAULT false,
    "disputeExperian" BOOLEAN NOT NULL DEFAULT false,
    "disputeTransunion" BOOLEAN NOT NULL DEFAULT false,
    "customInstruction" TEXT,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisputeItem" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "furnisher" TEXT NOT NULL,
    "accountNumber" TEXT,
    "accountType" "AccountType" NOT NULL DEFAULT 'OTHER',
    "balance" DECIMAL(65,30),
    "dateAdded" TIMESTAMP(3),
    "disputeEquifax" BOOLEAN NOT NULL DEFAULT false,
    "disputeExperian" BOOLEAN NOT NULL DEFAULT false,
    "disputeTransunion" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "customInstruction" TEXT,
    "currentRound" INTEGER NOT NULL DEFAULT 1,
    "status" "DisputeItemStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "letterGenerated" BOOLEAN NOT NULL DEFAULT false,
    "letterSent" BOOLEAN NOT NULL DEFAULT false,
    "letterDocumentId" UUID,
    "generatedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "analysisId" TEXT,
    "priority" TEXT DEFAULT 'MEDIUM',

    CONSTRAINT "DisputeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisputeRound" (
    "id" TEXT NOT NULL,
    "disputeItemId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "sentDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "equifaxStatus" TEXT,
    "experianStatus" TEXT,
    "transunionStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisputeRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Furnisher" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FurnisherType" NOT NULL DEFAULT 'CREDITOR',
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Furnisher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "type" "PaymentType" NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "stripePaymentIntentId" TEXT,
    "stripeInvoiceId" TEXT,
    "provider" TEXT,
    "providerRef" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agreement" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "docusignEnvelopeId" TEXT,
    "status" "AgreementStatus" NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "contentType" TEXT,
    "content" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disputeItemId" TEXT,
    "roundNumber" INTEGER,
    "letterType" TEXT,
    "bureau" TEXT,
    "letterStatus" TEXT DEFAULT 'DRAFTED',

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordSetupToken_tokenHash_key" ON "PasswordSetupToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordSetupToken_userId_idx" ON "PasswordSetupToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordSetupToken_expiresAt_idx" ON "PasswordSetupToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Client_userId_key" ON "Client"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientProgress_clientId_key" ON "ClientProgress"("clientId");

-- CreateIndex
CREATE INDEX "ClientProgress_clientId_idx" ON "ClientProgress"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Furnisher_name_key" ON "Furnisher"("name");

-- CreateIndex
CREATE INDEX "Payment_providerRef_idx" ON "Payment"("providerRef");

-- CreateIndex
CREATE UNIQUE INDEX "Document_clientId_fileName_key" ON "Document"("clientId", "fileName");

-- AddForeignKey
ALTER TABLE "PasswordSetupToken" ADD CONSTRAINT "PasswordSetupToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientProgress" ADD CONSTRAINT "ClientProgress_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditReport" ADD CONSTRAINT "CreditReport_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tradeline" ADD CONSTRAINT "Tradeline_creditReportId_fkey" FOREIGN KEY ("creditReportId") REFERENCES "CreditReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeItem" ADD CONSTRAINT "DisputeItem_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeRound" ADD CONSTRAINT "DisputeRound_disputeItemId_fkey" FOREIGN KEY ("disputeItemId") REFERENCES "DisputeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_disputeItemId_fkey" FOREIGN KEY ("disputeItemId") REFERENCES "DisputeItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

