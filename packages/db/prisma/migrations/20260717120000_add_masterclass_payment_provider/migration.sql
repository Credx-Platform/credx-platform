-- Add MASTERCLASS payment type and processor-agnostic provider reference fields
ALTER TYPE "PaymentType" ADD VALUE IF NOT EXISTS 'MASTERCLASS';

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "provider" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "providerRef" TEXT;

CREATE INDEX IF NOT EXISTS "Payment_providerRef_idx" ON "Payment"("providerRef");
