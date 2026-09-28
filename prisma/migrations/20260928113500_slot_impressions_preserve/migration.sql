-- Preserve slot experiment data across persona resets (E5): the id columns
-- become plain-text snapshots and new nullable *RefId columns carry the
-- foreign keys with ON DELETE SET NULL. Also snapshots the featured concept's
-- mastery at impression time.

-- DropForeignKey
ALTER TABLE "SlotImpression" DROP CONSTRAINT "SlotImpression_conversationId_fkey";

-- DropForeignKey
ALTER TABLE "SlotImpression" DROP CONSTRAINT "SlotImpression_learnLaterItemId_fkey";

-- DropForeignKey
ALTER TABLE "SlotImpression" DROP CONSTRAINT "SlotImpression_messageId_fkey";

-- DropForeignKey
ALTER TABLE "SlotImpression" DROP CONSTRAINT "SlotImpression_userId_fkey";

-- AlterTable
ALTER TABLE "SlotImpression" ADD COLUMN     "conversationRefId" TEXT,
ADD COLUMN     "featuredMasteryAtImpression" DOUBLE PRECISION,
ADD COLUMN     "learnLaterItemRefId" TEXT,
ADD COLUMN     "messageRefId" TEXT,
ADD COLUMN     "userRefId" TEXT;

-- Backfill the live references from the snapshots (all rows still resolve;
-- the old FKs were ON DELETE CASCADE / SET NULL).
UPDATE "SlotImpression" SET
    "userRefId" = "userId",
    "conversationRefId" = "conversationId",
    "messageRefId" = "messageId",
    "learnLaterItemRefId" = "learnLaterItemId";

-- CreateIndex
CREATE UNIQUE INDEX "SlotImpression_messageRefId_key" ON "SlotImpression"("messageRefId");

-- CreateIndex
CREATE INDEX "SlotImpression_userRefId_idx" ON "SlotImpression"("userRefId");

-- CreateIndex
CREATE INDEX "SlotImpression_conversationRefId_idx" ON "SlotImpression"("conversationRefId");

-- CreateIndex
CREATE INDEX "SlotImpression_learnLaterItemRefId_idx" ON "SlotImpression"("learnLaterItemRefId");

-- AddForeignKey
ALTER TABLE "SlotImpression" ADD CONSTRAINT "SlotImpression_userRefId_fkey" FOREIGN KEY ("userRefId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotImpression" ADD CONSTRAINT "SlotImpression_conversationRefId_fkey" FOREIGN KEY ("conversationRefId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotImpression" ADD CONSTRAINT "SlotImpression_messageRefId_fkey" FOREIGN KEY ("messageRefId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotImpression" ADD CONSTRAINT "SlotImpression_learnLaterItemRefId_fkey" FOREIGN KEY ("learnLaterItemRefId") REFERENCES "LearnLaterItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

