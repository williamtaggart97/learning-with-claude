-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('user', 'assistant');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('text', 'framing', 'answer');

-- CreateEnum
CREATE TYPE "ConversationOrigin" AS ENUM ('chat', 'dig_in');

-- CreateEnum
CREATE TYPE "FramingStatus" AS ENUM ('pending', 'answered', 'skipped');

-- CreateEnum
CREATE TYPE "EntryPoint" AS ENUM ('code', 'concept', 'worked_example');

-- CreateEnum
CREATE TYPE "LearnLaterStatus" AS ENUM ('queued', 'dug_in', 'dismissed');

-- CreateEnum
CREATE TYPE "LearnLaterOrigin" AS ENUM ('skipped', 'flagged');

-- CreateEnum
CREATE TYPE "PersonaKey" AS ENUM ('maya', 'dev', 'sam');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "demoSessionId" TEXT NOT NULL,
    "personaKey" "PersonaKey" NOT NULL,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAssessedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New chat',
    "origin" "ConversationOrigin" NOT NULL DEFAULT 'chat',
    "learnLaterItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "kind" "MessageKind" NOT NULL DEFAULT 'text',
    "content" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FramingExchange" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userMessageId" TEXT NOT NULL,
    "framingMessageId" TEXT,
    "answerMessageId" TEXT,
    "questions" JSONB NOT NULL,
    "responses" JSONB,
    "conceptSlugs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "skipCallout" JSONB,
    "status" "FramingStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "FramingExchange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Concept" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Concept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConceptMastery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConceptMastery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningStyle" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "intuitionVsFormal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "intuitionVsFormalConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "intuitionVsFormalOverridden" BOOLEAN NOT NULL DEFAULT false,
    "entryPoint" "EntryPoint",
    "entryPointConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "entryPointOverridden" BOOLEAN NOT NULL DEFAULT false,
    "briefVsThorough" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "briefVsThoroughConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "briefVsThoroughOverridden" BOOLEAN NOT NULL DEFAULT false,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningStyle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserContext" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "field" TEXT,
    "projects" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dataTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "userEdited" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnLaterItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conceptId" TEXT,
    "title" TEXT NOT NULL,
    "preview" TEXT NOT NULL,
    "appliedContext" TEXT NOT NULL,
    "sourceConversationId" TEXT,
    "sourceMessageId" TEXT,
    "status" "LearnLaterStatus" NOT NULL DEFAULT 'queued',
    "origin" "LearnLaterOrigin" NOT NULL DEFAULT 'flagged',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnLaterItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateIndex
CREATE INDEX "User_isTemplate_personaKey_idx" ON "User"("isTemplate", "personaKey");

-- CreateIndex
CREATE UNIQUE INDEX "User_demoSessionId_personaKey_key" ON "User"("demoSessionId", "personaKey");

-- CreateIndex
CREATE INDEX "Conversation_userId_updatedAt_idx" ON "Conversation"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Conversation_learnLaterItemId_idx" ON "Conversation"("learnLaterItemId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FramingExchange_userMessageId_key" ON "FramingExchange"("userMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "FramingExchange_framingMessageId_key" ON "FramingExchange"("framingMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "FramingExchange_answerMessageId_key" ON "FramingExchange"("answerMessageId");

-- CreateIndex
CREATE INDEX "FramingExchange_userId_status_idx" ON "FramingExchange"("userId", "status");

-- CreateIndex
CREATE INDEX "FramingExchange_conversationId_idx" ON "FramingExchange"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "Concept_slug_key" ON "Concept"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ConceptMastery_userId_conceptId_key" ON "ConceptMastery"("userId", "conceptId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningStyle_userId_key" ON "LearningStyle"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserContext_userId_key" ON "UserContext"("userId");

-- CreateIndex
CREATE INDEX "LearnLaterItem_userId_status_idx" ON "LearnLaterItem"("userId", "status");

-- CreateIndex
CREATE INDEX "LearnLaterItem_sourceConversationId_idx" ON "LearnLaterItem"("sourceConversationId");

-- CreateIndex
CREATE INDEX "LearnLaterItem_sourceMessageId_idx" ON "LearnLaterItem"("sourceMessageId");

-- CreateIndex
CREATE INDEX "LearnLaterItem_conceptId_idx" ON "LearnLaterItem"("conceptId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_learnLaterItemId_fkey" FOREIGN KEY ("learnLaterItemId") REFERENCES "LearnLaterItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FramingExchange" ADD CONSTRAINT "FramingExchange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FramingExchange" ADD CONSTRAINT "FramingExchange_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FramingExchange" ADD CONSTRAINT "FramingExchange_userMessageId_fkey" FOREIGN KEY ("userMessageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FramingExchange" ADD CONSTRAINT "FramingExchange_framingMessageId_fkey" FOREIGN KEY ("framingMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FramingExchange" ADD CONSTRAINT "FramingExchange_answerMessageId_fkey" FOREIGN KEY ("answerMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptMastery" ADD CONSTRAINT "ConceptMastery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptMastery" ADD CONSTRAINT "ConceptMastery_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningStyle" ADD CONSTRAINT "LearningStyle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserContext" ADD CONSTRAINT "UserContext_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnLaterItem" ADD CONSTRAINT "LearnLaterItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnLaterItem" ADD CONSTRAINT "LearnLaterItem_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnLaterItem" ADD CONSTRAINT "LearnLaterItem_sourceConversationId_fkey" FOREIGN KEY ("sourceConversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnLaterItem" ADD CONSTRAINT "LearnLaterItem_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
