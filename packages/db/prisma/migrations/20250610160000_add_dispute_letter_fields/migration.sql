-- AddDisputeLetterFields
-- Migration: Add dispute letter tracking to Document and DisputeItem models

-- First check if DocumentType enum exists and add values if not already present
DO $$
BEGIN
    -- Check if DISPUTE_LETTER already exists in the enum
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'DISPUTE_LETTER' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'DocumentType')
    ) THEN
        ALTER TYPE "DocumentType" ADD VALUE 'DISPUTE_LETTER';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'DISPUTE_RESPONSE' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'DocumentType')
    ) THEN
        ALTER TYPE "DocumentType" ADD VALUE 'DISPUTE_RESPONSE';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'DISPUTE_EVIDENCE' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'DocumentType')
    ) THEN
        ALTER TYPE "DocumentType" ADD VALUE 'DISPUTE_EVIDENCE';
    END IF;
END $$;

-- Add dispute letter fields to Document
ALTER TABLE "Document" 
ADD COLUMN IF NOT EXISTS "disputeItemId" UUID,
ADD COLUMN IF NOT EXISTS "roundNumber" INTEGER,
ADD COLUMN IF NOT EXISTS "letterType" TEXT,
ADD COLUMN IF NOT EXISTS "bureau" TEXT,
ADD COLUMN IF NOT EXISTS "letterStatus" TEXT DEFAULT 'DRAFTED';

-- Add foreign key to DisputeItem (only if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'Document_disputeItemId_fkey' 
        AND table_name = 'Document'
    ) THEN
        ALTER TABLE "Document" 
        ADD CONSTRAINT "Document_disputeItemId_fkey" 
        FOREIGN KEY ("disputeItemId") REFERENCES "DisputeItem"(id) ON DELETE SET NULL;
    END IF;
EXCEPTION
    WHEN others THEN
        -- If the constraint fails due to type mismatch, skip it
        RAISE NOTICE 'Could not add foreign key constraint: %', SQLERRM;
END $$;

-- Add dispute letter tracking to DisputeItem
ALTER TABLE "DisputeItem"
ADD COLUMN IF NOT EXISTS "letterGenerated" BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS "letterSent" BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS "letterDocumentId" UUID,
ADD COLUMN IF NOT EXISTS "generatedAt" TIMESTAMP,
ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP,
ADD COLUMN IF NOT EXISTS "analysisId" TEXT,
ADD COLUMN IF NOT EXISTS "priority" TEXT DEFAULT 'MEDIUM';
