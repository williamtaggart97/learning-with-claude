// Canonical writer for LearnLaterItems (R13). Server-only.
// Every creator — lookup callouts, skip callouts, assessor items — goes
// through upsertLearnLaterItem so the dedupe rule lives in one place.
import "server-only";
import { normalizeLearnLaterTitle } from "@/lib/api-contract";
import { db, type LearnLaterOrigin, type Prisma } from "@/lib/db";
import type { LearnLaterCallout, LearnLaterItemDTO } from "@/lib/types";

type Tx = Prisma.TransactionClient | typeof db;

export interface UpsertLearnLaterInput {
  userId: string;
  callout: LearnLaterCallout;
  origin: LearnLaterOrigin;
  sourceConversationId: string | null;
  sourceMessageId: string | null;
}

export type LearnLaterItemWithConcept = Prisma.LearnLaterItemGetPayload<{
  include: { concept: { select: { slug: true } } };
}>;

/**
 * R13 upsert-by-rule. Reuses an existing `queued` item for the same
 * (userId, conceptId) — or, when the callout has no catalog concept, the same
 * normalized title — instead of creating a duplicate. conceptId is resolved
 * from callout.conceptSlug only when that slug is already in the catalog
 * (this function never creates Concepts). Returns the (existing or new) item.
 */
export async function upsertLearnLaterItem(
  input: UpsertLearnLaterInput,
  tx: Tx = db,
): Promise<{ item: LearnLaterItemWithConcept; created: boolean }> {
  const { userId, callout } = input;
  const include = { concept: { select: { slug: true } } } as const;

  const concept = callout.conceptSlug
    ? await tx.concept.findUnique({ where: { slug: callout.conceptSlug }, select: { id: true } })
    : null;

  if (concept) {
    const existing = await tx.learnLaterItem.findFirst({
      where: { userId, conceptId: concept.id, status: "queued" },
      orderBy: { createdAt: "desc" },
      include,
    });
    if (existing) return { item: existing, created: false };
  } else {
    const key = normalizeLearnLaterTitle(callout.title);
    const queued = await tx.learnLaterItem.findMany({
      where: { userId, status: "queued", conceptId: null },
      select: { id: true, title: true },
    });
    const match = queued.find((q) => normalizeLearnLaterTitle(q.title) === key);
    if (match) {
      const existing = await tx.learnLaterItem.findUnique({ where: { id: match.id }, include });
      if (existing) return { item: existing, created: false };
    }
  }

  const item = await tx.learnLaterItem.create({
    data: {
      userId,
      conceptId: concept?.id ?? null,
      title: callout.title.trim(),
      preview: callout.preview.trim(),
      appliedContext: callout.appliedContext.trim(),
      origin: input.origin,
      sourceConversationId: input.sourceConversationId,
      sourceMessageId: input.sourceMessageId,
    },
    include,
  });
  return { item, created: true };
}

/** Local DTO mapper (kept here so the pipeline doesn't depend on 2a's dto.ts). */
export function learnLaterItemToDTO(item: LearnLaterItemWithConcept): LearnLaterItemDTO {
  return {
    id: item.id,
    title: item.title,
    preview: item.preview,
    appliedContext: item.appliedContext,
    conceptSlug: item.concept?.slug ?? null,
    status: item.status,
    origin: item.origin,
    sourceConversationId: item.sourceConversationId,
    sourceMessageId: item.sourceMessageId,
    createdAt: item.createdAt.toISOString(),
  };
}
