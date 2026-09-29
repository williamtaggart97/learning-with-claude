// Learner profile (P1–P6): GET/PATCH /api/profile. Server-only.
import "server-only";
import { db, type Prisma, type User } from "@/lib/db";
import { learnLaterItemInclude, toConceptDTO, toLearnLaterItemDTO, toLearningStyleDTO, toUserContextDTO } from "@/lib/dto";
import { MAX_DISMISSED_LEARN_LATER } from "@/lib/learn-later-list";
import { PERSONAS } from "@/lib/personas";
import { stylePatchData } from "@/lib/style-patch";
import { suggestTopics } from "@/lib/suggested-topics";
import { computeTier, progressToNextTier } from "@/lib/tiers";
import type { ProfileDTO, ProfilePatch, TierInputs } from "@/lib/types";

/** Tier inputs (P7): answered framing exchanges + ConceptMastery rows. */
export async function getTierInputs(userId: string): Promise<TierInputs> {
  const [answeredFramingCount, conceptCount] = await Promise.all([
    db.framingExchange.count({ where: { userId, status: "answered" } }),
    db.conceptMastery.count({ where: { userId } }),
  ]);
  return { answeredFramingCount, conceptCount };
}

const LEARN_LATER_STATUS_ORDER = { queued: 0, dug_in: 1, dismissed: 2 } as const;
/** Dismissed items listed in the profile (the queue's "Dismissed" section), most recently dismissed first. */
const MAX_DISMISSED = MAX_DISMISSED_LEARN_LATER;

export async function getProfile(user: User): Promise<ProfileDTO> {
  const [answeredFramingCount, masteries, style, context, items, dismissedItems] = await Promise.all([
    db.framingExchange.count({ where: { userId: user.id, status: "answered" } }),
    db.conceptMastery.findMany({ where: { userId: user.id }, include: { concept: true } }),
    db.learningStyle.findUnique({ where: { userId: user.id } }),
    db.userContext.findUnique({ where: { userId: user.id } }),
    db.learnLaterItem.findMany({
      where: { userId: user.id, status: { not: "dismissed" } },
      include: learnLaterItemInclude,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    }),
    db.learnLaterItem.findMany({
      where: { userId: user.id, status: "dismissed" },
      include: learnLaterItemInclude,
      // Status changes bump updatedAt, so this is "most recently dismissed first".
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: MAX_DISMISSED,
    }),
  ]);

  const inputs: TierInputs = { answeredFramingCount, conceptCount: masteries.length };
  const tier = computeTier(inputs);

  // Concepts: most recently updated first (what Claude learned most
  // recently); ties broken by score, then name.
  const concepts = masteries
    .map(toConceptDTO)
    .sort(
      (a, b) =>
        Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || b.score - a.score || a.name.localeCompare(b.name),
    );

  // Learn It Later: queued first, then dug_in; newest first within each.
  const learnLater = items
    .map(toLearnLaterItemDTO)
    .sort(
      (a, b) =>
        LEARN_LATER_STATUS_ORDER[a.status] - LEARN_LATER_STATUS_ORDER[b.status] ||
        Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );

  const userContext = context ? toUserContextDTO(context) : null;

  return {
    persona: PERSONAS[user.personaKey],
    tier,
    progress: progressToNextTier(inputs),
    answeredFramingCount,
    concepts,
    learningStyle: style ? toLearningStyleDTO(style) : null,
    userContext,
    learnLater,
    dismissedLearnLater: dismissedItems.map(toLearnLaterItemDTO),
    suggestedTopics: tier >= 2 ? suggestTopics(concepts, learnLater, userContext) : [],
    lastAssessedAt: user.lastAssessedAt ? user.lastAssessedAt.toISOString() : null,
  };
}

// ─── PATCH /api/profile ─────────────────────────────────────────────────────

/** Thrown by patchProfile below Tier 2 (route → 403 tier_locked). */
export class TierLockedError extends Error {
  constructor() {
    super("Profile editing unlocks at Tier 2");
    this.name = "TierLockedError";
  }
}

/**
 * Tier 2 only (P6): apply user corrections. Edited style dimensions get
 * `*Overridden = true` and confidence 1 (the user told us);
 * `resetLearningStyle` clears overrides and hands the dimension back to the
 * assessor (see stylePatchData in src/lib/style-patch.ts); context edits set
 * `userEdited = true`. Returns the fresh ProfileDTO.
 */
export async function patchProfile(user: User, patch: ProfilePatch): Promise<ProfileDTO> {
  if (computeTier(await getTierInputs(user.id)) < 2) throw new TierLockedError();

  const ops: Prisma.PrismaPromise<unknown>[] = [];

  const ls = patch.learningStyle;
  const resets = patch.resetLearningStyle ?? [];
  if ((ls && Object.keys(ls).length) || resets.length) {
    // Resets depend on the current row (only overridden dimensions change).
    const current = resets.length ? await db.learningStyle.findUnique({ where: { userId: user.id } }) : null;
    const data = stylePatchData(current, patch);
    if (Object.keys(data).length) {
      ops.push(
        db.learningStyle.upsert({
          where: { userId: user.id },
          update: data,
          create: { ...data, user: { connect: { id: user.id } } },
        }),
      );
    }
  }

  const uc = patch.userContext;
  if (uc && Object.keys(uc).length) {
    const clean = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
    const data = {
      ...(uc.field !== undefined && { field: uc.field?.trim() || null }),
      ...(uc.projects !== undefined && { projects: clean(uc.projects) }),
      ...(uc.dataTypes !== undefined && { dataTypes: clean(uc.dataTypes) }),
      ...(uc.notes !== undefined && { notes: uc.notes?.trim() || null }),
      userEdited: true,
    };
    ops.push(
      db.userContext.upsert({
        where: { userId: user.id },
        update: data,
        create: { ...data, user: { connect: { id: user.id } } },
      }),
    );
  }

  if (ops.length) await db.$transaction(ops);
  return getProfile(user);
}
