-- Durable SaaS progress/workflow state. Additive migration; legacy JSON progress
-- remains intact for compatibility and can be backfilled asynchronously.
CREATE TABLE "OnboardingState" (
  "id" TEXT NOT NULL, "clientId" TEXT NOT NULL, "goals" JSONB NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'PENDING', "currentStep" TEXT NOT NULL DEFAULT 'goals',
  "completedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OnboardingState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OnboardingState_clientId_key" ON "OnboardingState"("clientId");
ALTER TABLE "OnboardingState" ADD CONSTRAINT "OnboardingState_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "LessonCompletion" (
  "id" TEXT NOT NULL, "clientId" TEXT NOT NULL, "lessonKey" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "metadata" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "LessonCompletion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LessonCompletion_clientId_lessonKey_key" ON "LessonCompletion"("clientId", "lessonKey");
CREATE INDEX "LessonCompletion_clientId_completedAt_idx" ON "LessonCompletion"("clientId", "completedAt");
ALTER TABLE "LessonCompletion" ADD CONSTRAINT "LessonCompletion_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "QuizResult" (
  "id" TEXT NOT NULL, "clientId" TEXT NOT NULL, "lessonKey" TEXT NOT NULL, "attempt" INTEGER NOT NULL,
  "score" INTEGER NOT NULL, "passed" BOOLEAN NOT NULL, "answers" JSONB NOT NULL DEFAULT '{}',
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuizResult_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QuizResult_clientId_lessonKey_attempt_key" ON "QuizResult"("clientId", "lessonKey", "attempt");
CREATE INDEX "QuizResult_clientId_submittedAt_idx" ON "QuizResult"("clientId", "submittedAt");
ALTER TABLE "QuizResult" ADD CONSTRAINT "QuizResult_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ActionPlanItem" (
  "id" TEXT NOT NULL, "clientId" TEXT NOT NULL, "key" TEXT NOT NULL, "title" TEXT NOT NULL,
  "description" TEXT, "category" TEXT NOT NULL DEFAULT 'GENERAL', "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
  "status" TEXT NOT NULL DEFAULT 'OPEN', "dueAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ActionPlanItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ActionPlanItem_clientId_key_key" ON "ActionPlanItem"("clientId", "key");
CREATE INDEX "ActionPlanItem_clientId_status_idx" ON "ActionPlanItem"("clientId", "status");
ALTER TABLE "ActionPlanItem" ADD CONSTRAINT "ActionPlanItem_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Milestone" (
  "id" TEXT NOT NULL, "clientId" TEXT NOT NULL, "key" TEXT NOT NULL, "title" TEXT NOT NULL,
  "description" TEXT, "achievedAt" TIMESTAMP(3), "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Milestone_clientId_key_key" ON "Milestone"("clientId", "key");
CREATE INDEX "Milestone_clientId_achievedAt_idx" ON "Milestone"("clientId", "achievedAt");
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WorkflowState" (
  "id" TEXT NOT NULL, "clientId" TEXT NOT NULL, "stage" TEXT NOT NULL DEFAULT 'SIGNUP_RECEIVED',
  "state" JSONB NOT NULL DEFAULT '{}', "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkflowState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkflowState_clientId_key" ON "WorkflowState"("clientId");
ALTER TABLE "WorkflowState" ADD CONSTRAINT "WorkflowState_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CesarConversation" (
  "id" TEXT NOT NULL, "clientId" TEXT NOT NULL, "title" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CesarConversation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CesarConversation_clientId_updatedAt_idx" ON "CesarConversation"("clientId", "updatedAt");
ALTER TABLE "CesarConversation" ADD CONSTRAINT "CesarConversation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CesarMessage" (
  "id" TEXT NOT NULL, "conversationId" TEXT NOT NULL, "role" TEXT NOT NULL, "content" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CesarMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CesarMessage_conversationId_createdAt_idx" ON "CesarMessage"("conversationId", "createdAt");
ALTER TABLE "CesarMessage" ADD CONSTRAINT "CesarMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CesarConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DataExportRequest" (
  "id" TEXT NOT NULL, "clientId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3),
  "downloadKey" TEXT, "notes" TEXT, CONSTRAINT "DataExportRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DataExportRequest_clientId_requestedAt_idx" ON "DataExportRequest"("clientId", "requestedAt");
ALTER TABLE "DataExportRequest" ADD CONSTRAINT "DataExportRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AccountDeletionRequest" (
  "id" TEXT NOT NULL, "clientId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "reason" TEXT, "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3), "reviewedBy" TEXT, CONSTRAINT "AccountDeletionRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccountDeletionRequest_clientId_requestedAt_idx" ON "AccountDeletionRequest"("clientId", "requestedAt");
ALTER TABLE "AccountDeletionRequest" ADD CONSTRAINT "AccountDeletionRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
