-- CreateEnum
CREATE TYPE "SlotVariant" AS ENUM ('card', 'walkthrough', 'quickcheck', 'apply', 'none');

-- CreateEnum
CREATE TYPE "SlotEngagement" AS ENUM ('dig_in', 'walkthrough_started', 'quickcheck_answered', 'apply_clicked');

-- CreateTable
CREATE TABLE "SlotImpression" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userMessageId" TEXT NOT NULL,
    "answerMode" TEXT NOT NULL,
    "learnLaterItemId" TEXT,
    "featuredTitle" TEXT NOT NULL,
    "featuredConceptSlug" TEXT,
    "candidates" JSONB NOT NULL,
    "candidateCount" INTEGER NOT NULL,
    "featuredRank" INTEGER,
    "featuredIsWhy" BOOLEAN NOT NULL DEFAULT false,
    "topPickProbability" DOUBLE PRECISION NOT NULL,
    "variant" "SlotVariant" NOT NULL,
    "drawnVariant" "SlotVariant" NOT NULL,
    "fallbackReason" TEXT,
    "eligibleVariants" "SlotVariant"[],
    "weights" JSONB NOT NULL,
    "forced" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "engagement" "SlotEngagement",
    "engagedAt" TIMESTAMP(3),
    "digInAt" TIMESTAMP(3),
    "digInConversationId" TEXT,
    "walkthroughStartedAt" TIMESTAMP(3),
    "walkthroughExchangeId" TEXT,
    "quickcheckAnsweredAt" TIMESTAMP(3),
    "quickcheckResponse" JSONB,
    "applyClickedAt" TIMESTAMP(3),
    "applyMessageId" TEXT,

    CONSTRAINT "SlotImpression_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SlotImpression_messageId_key" ON "SlotImpression"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "SlotImpression_walkthroughExchangeId_key" ON "SlotImpression"("walkthroughExchangeId");

-- CreateIndex
CREATE INDEX "SlotImpression_userId_createdAt_idx" ON "SlotImpression"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SlotImpression_createdAt_idx" ON "SlotImpression"("createdAt");

-- CreateIndex
CREATE INDEX "SlotImpression_conversationId_idx" ON "SlotImpression"("conversationId");

-- CreateIndex
CREATE INDEX "SlotImpression_learnLaterItemId_idx" ON "SlotImpression"("learnLaterItemId");

-- AddForeignKey
ALTER TABLE "SlotImpression" ADD CONSTRAINT "SlotImpression_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotImpression" ADD CONSTRAINT "SlotImpression_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotImpression" ADD CONSTRAINT "SlotImpression_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotImpression" ADD CONSTRAINT "SlotImpression_learnLaterItemId_fkey" FOREIGN KEY ("learnLaterItemId") REFERENCES "LearnLaterItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
