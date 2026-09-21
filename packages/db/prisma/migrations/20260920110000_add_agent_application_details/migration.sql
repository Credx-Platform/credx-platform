ALTER TABLE "AgentApplication" ADD COLUMN IF NOT EXISTS "professionalTitleEncrypted" TEXT;
ALTER TABLE "AgentApplication" ADD COLUMN IF NOT EXISTS "socialMediaEncrypted" TEXT;
ALTER TABLE "AgentApplication" ADD COLUMN IF NOT EXISTS "backgroundReferencesEncrypted" TEXT;
