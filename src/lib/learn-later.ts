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

const itemInclude = { concept: { select: { slug: true } } } as const;

/** What the R13 lookup needs from the Prisma client (a fake works in tests). */
export interface LearnLaterLookupStore {
  concept: Pick<Tx["concept"], "findUnique">;
  learnLaterItem: Pick<Tx["learnLaterItem"], "findFirst" | "findMany" | "findUnique">;
}

/**
 * The R13 lookup shared by findReusableLearnLaterItem and the upsert:
 * resolves the callout's catalog concept (never creates one) and the
 * `queued` item that would be reused for it, if any.
 */
async function resolveReuse(
  userId: string,
  callout: Pick<LearnLaterCallout, "title" | "conceptSlug">,
  tx: LearnLaterLookupStore,
): Promise<{ conceptId: string | null; existing: LearnLaterItemWithConcept | null }> {
  const concept = callout.conceptSlug
    ? await tx.concept.findUnique({ where: { slug: callout.conceptSlug }, select: { id: true } })
    : null;

  if (concept) {
    const existing = await tx.learnLaterItem.findFirst({
      where: { userId, conceptId: concept.id, status: "queued" },
      orderBy: { createdAt: "desc" },
      include: itemInclude,
    });
    return { conceptId: concept.id, existing };
  }
  const key = normalizeLearnLaterTitle(callout.title);
  const queued = await tx.learnLaterItem.findMany({
    where: { userId, status: "queued", conceptId: null },
    select: { id: true, title: true },
  });
  const match = queued.find((q) => normalizeLearnLaterTitle(q.title) === key);
  const existing = match ? await tx.learnLaterItem.findUnique({ where: { id: match.id }, include: itemInclude }) : null;
  return { conceptId: null, existing };
}

/**
 * Read-only R13 lookup: the existing `queued` item upsertLearnLaterItem would
 * reuse for this callout — same (userId, conceptId), or, when the callout has
 * no catalog concept, the same normalized title — or null when a new item
 * would be created. The end-of-answer slot uses it to describe the item that
 * will actually be shown.
 */
export async function findReusableLearnLaterItem(
  userId: string,
  callout: Pick<LearnLaterCallout, "title" | "conceptSlug">,
  tx: LearnLaterLookupStore = db,
): Promise<LearnLaterItemWithConcept | null> {
  return (await resolveReuse(userId, callout, tx)).existing;
}

/**
 * R13 upsert-by-rule. Reuses the item findReusableLearnLaterItem finds instead
 * of creating a duplicate. conceptId is resolved from callout.conceptSlug only
 * when that slug is already in the catalog (this function never creates
 * Concepts). Returns the (existing or new) item.
 */
export async function upsertLearnLaterItem(
  input: UpsertLearnLaterInput,
  tx: Tx = db,
): Promise<{ item: LearnLaterItemWithConcept; created: boolean }> {
  const { userId, callout } = input;
  const { conceptId, existing } = await resolveReuse(userId, callout, tx);
  if (existing) return { item: existing, created: false };

  const item = await tx.learnLaterItem.create({
    data: {
      userId,
      conceptId,
      title: callout.title.trim(),
      preview: callout.preview.trim(),
      appliedContext: callout.appliedContext.trim(),
      origin: input.origin,
      sourceConversationId: input.sourceConversationId,
      sourceMessageId: input.sourceMessageId,
    },
    include: itemInclude,
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
