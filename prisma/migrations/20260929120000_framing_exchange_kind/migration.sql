-- What kind of message a framing exchange was asked about: "concept" (the
-- default, all existing rows) or "task" / "lookup" (a single question asked
-- before delivering the work).

-- AlterTable
ALTER TABLE "FramingExchange" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'concept';
