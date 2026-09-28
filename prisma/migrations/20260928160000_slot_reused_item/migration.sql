-- Record whether the end-of-answer slot showed an already-queued Learn It
-- Later item (R13 reuse) instead of a new one; null for older impressions.

-- AlterTable
ALTER TABLE "SlotImpression" ADD COLUMN     "reusedItem" BOOLEAN;
