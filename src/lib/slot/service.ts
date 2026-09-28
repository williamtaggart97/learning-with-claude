// End-of-answer slot (E1–E5): draw → parallel content → persist impression,
// SlotDTO building and engagement logging. Server-only.
import "server-only";
import { EXPERIMENT } from "@/config";
import type { LearnerSnapshot, PromptTurn } from "@/lib/claude/prompts";
import { generateSlotContent, type SlotContent } from "@/lib/claude/slot";
import { db, Prisma, type SlotEngagement, type SlotVariant } from "@/lib/db";
import { findReusableLearnLaterItem, learnLaterItemToDTO, type LearnLaterItemWithConcept } from "@/lib/learn-later";
import type { ImmediateAnswerMode, SlotCandidates } from "@/lib/pipeline/route-policy";
import { QuickCheckResponseSchema, SlotPayloadSchema } from "@/lib/schemas";
import { needsContent, parseSlotVariant, planSlot, slotContentItem, type SlotPlan } from "@/lib/slot/policy";
import type { QuickCheckResultDTO, SlotDTO, Tier } from "@/lib/types";
import type { z } from "zod";

type Tx = Prisma.TransactionClient | typeof db;
export type SlotPayload = z.infer<typeof SlotPayloadSchema>;

// ─── Dev-only override ──────────────────────────────────────────────────────

/**
 * Force a variant for testing: `?slotVariant=quickcheck` on the request URL
 * (or an `x-slot-variant` header). Ignored in production builds and when the
 * variant isn't eligible for the answer. Forced impressions are flagged and
 * excluded from the results page.
 */
export function devForcedVariant(request: Request): SlotVariant | null {
  if (process.env.NODE_ENV === "production") return null;
  let q: string | null = null;
  try {
    q = new URL(request.url).searchParams.get("slotVariant");
  } catch {
    /* relative URL in tests */
  }
  return parseSlotVariant(q ?? request.headers.get("x-slot-variant"));
}

// ─── Draw + parallel content ────────────────────────────────────────────────

export interface SlotRun {
  plan: SlotPlan;
  /**
   * The already-queued item (R13) the content was written about, resolved at
   * draw time; null when the featured callout will create a new item.
   */
  contentItemId: string | null;
  /** Resolves to the generated payload, or null on failure. Never rejects. */
  content: Promise<SlotContent | null>;
}

export interface StartSlotInput {
  userId: string;
  conversationId: string;
  candidates: SlotCandidates;
  learner: LearnerSnapshot;
  message: string;
  turns: PromptTurn[];
  /** E4 priority moment for this answer (tier unlock), or null. */
  unlocked: Tier | null;
  forcedVariant: SlotVariant | null;
  signal: AbortSignal;
}

/**
 * Draw the featured item and the variant BEFORE the answer streams, and start
 * generating the variant's payload in parallel so it adds no latency.
 * Returns null when there is no slot (priority moment / nothing to feature)
 * or when the draw itself failed (logged): the chat answer never depends on
 * the experiment. Callers only invoke it while EXPERIMENT.active.
 */
export async function startSlot(input: StartSlotInput): Promise<SlotRun | null> {
  try {
    return await drawSlot(input);
  } catch (err) {
    if (!input.signal.aborted) console.error("[slot] draw failed; answering without a slot:", err);
    return null;
  }
}

async function drawSlot(input: StartSlotInput): Promise<SlotRun | null> {
  const framed = await db.framingExchange.findMany({
    where: { conversationId: input.conversationId },
    select: { conceptSlugs: true },
  });
  const framedSlugs = new Set(framed.flatMap((f) => f.conceptSlugs));
  const ctx = input.learner.context;
  const plan = planSlot({
    candidates: input.candidates,
    unlocked: input.unlocked,
    conceptAlreadyFramed: (slug) => framedSlugs.has(slug),
    hasUserContext: !!ctx && (ctx.projects.length > 0 || ctx.dataTypes.length > 0),
    config: EXPERIMENT,
    rng: Math.random,
    forcedVariant: input.forcedVariant,
  });
  if (!plan) return null;
  if (input.forcedVariant && !plan.forced) {
    console.warn(`[slot] forced variant "${input.forcedVariant}" not eligible (eligible: ${plan.eligible.join(", ")})`);
  }
  const v = plan.variant;
  const { callout } = plan.featured;
  // R13: if an already-queued item will be reused, the slot shows THAT item,
  // so its copy must describe it (not the router's fresh callout).
  const reused = await findReusableLearnLaterItem(input.userId, callout);
  const content = needsContent(v)
    ? generateSlotContent(
        v,
        {
          item: slotContentItem(callout, reused),
          message: input.message,
          learner: input.learner,
          turns: input.turns,
        },
        input.signal,
      ).catch((err) => {
        if (!input.signal.aborted) console.warn(`[slot] ${v} content failed:`, err);
        return null;
      })
    : Promise.resolve(null);
  return { plan, contentItemId: reused?.id ?? null, content };
}

export interface ResolvedSlot {
  variant: SlotVariant;
  payload: SlotPayload | null;
  fallbackReason: string | null;
}

const NOT_READY = Symbol("not-ready");

/**
 * Wait (bounded) for the variant payload once the answer has finished. A
 * variant whose payload isn't ready or failed falls back to the card (A) —
 * or to none if the card is disabled — and the reason is logged (E1).
 */
export async function resolveSlotContent(run: SlotRun, waitMs: number = EXPERIMENT.contentWaitMs): Promise<ResolvedSlot> {
  const variant = run.plan.variant;
  if (!needsContent(variant)) return { variant, payload: null, fallbackReason: null };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    run.content,
    new Promise<typeof NOT_READY>((resolve) => {
      timer = setTimeout(() => resolve(NOT_READY), waitMs);
    }),
  ]);
  clearTimeout(timer);
  if (result && result !== NOT_READY) {
    const payload: SlotPayload = result.variant === "quickcheck" ? { quickcheck: result.quickcheck } : { copy: result.copy };
    return { variant, payload, fallbackReason: null };
  }
  const reason = result === NOT_READY ? "content_not_ready" : "content_failed";
  console.info(`[slot] ${variant} → card (${reason})`);
  return { variant: EXPERIMENT.enabled.card ? "card" : "none", payload: null, fallbackReason: reason };
}

/**
 * The variant payload was written about the item resolved at draw time. If
 * the item actually saved differs (the queue changed while the answer
 * streamed, e.g. the reused item was dismissed meanwhile), the copy would
 * describe the wrong item: fall back to the card (E1), like a late payload.
 * `shownReusedId`: the reused item's id, or null when a new item was created.
 */
export function reconcileSlotContent(run: Pick<SlotRun, "contentItemId">, resolved: ResolvedSlot, shownReusedId: string | null): ResolvedSlot {
  if (!needsContent(resolved.variant) || run.contentItemId === shownReusedId) return resolved;
  console.info(`[slot] ${resolved.variant} → card (item_changed)`);
  return { variant: EXPERIMENT.enabled.card ? "card" : "none", payload: null, fallbackReason: "item_changed" };
}

// ─── Persist ────────────────────────────────────────────────────────────────

export interface CreateImpressionInput {
  run: SlotRun;
  /** Already reconciled with the saved item (reconcileSlotContent). */
  resolved: ResolvedSlot;
  userId: string;
  conversationId: string;
  userMessageId: string;
  messageId: string;
  /** "lookup" | "task" | "direct" (ImmediateAnswerMode). */
  answerMode: ImmediateAnswerMode;
  /** The featured item, already upserted (E3). */
  item: LearnLaterItemWithConcept;
  /** False when the upsert created `item`; true when R13 reused a queued one. */
  reusedItem: boolean;
}

/**
 * Log the impression (same transaction as the answer + E3 item) and return its
 * DTO. Writes both the snapshot ids and the live (SetNull) foreign keys, and
 * snapshots the user's current mastery of the featured concept (E5).
 */
export async function createSlotImpression(tx: Tx, input: CreateImpressionInput): Promise<SlotDTO> {
  const { plan } = input.run;
  const { featured } = plan;
  const { resolved } = input;
  const slug = input.item.concept?.slug ?? featured.callout.conceptSlug ?? null;
  const mastery = slug
    ? await tx.conceptMastery.findFirst({ where: { userId: input.userId, concept: { slug } }, select: { score: true } })
    : null;
  const row = await tx.slotImpression.create({
    data: {
      userId: input.userId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      userMessageId: input.userMessageId,
      answerMode: input.answerMode,
      learnLaterItemId: input.item.id,
      userRefId: input.userId,
      conversationRefId: input.conversationId,
      messageRefId: input.messageId,
      learnLaterItemRefId: input.item.id,
      featuredTitle: input.item.title,
      featuredConceptSlug: slug,
      reusedItem: input.reusedItem,
      featuredMasteryAtImpression: mastery?.score ?? null,
      candidates: candidateSnapshot(plan),
      candidateCount: featured.candidateCount,
      featuredRank: featured.rank,
      featuredIsWhy: featured.isWhy,
      topPickProbability: plan.topPickProbability,
      variant: resolved.variant,
      drawnVariant: plan.variant,
      fallbackReason: resolved.fallbackReason,
      eligibleVariants: plan.eligible,
      weights: plan.weights,
      forced: plan.forced,
      payload: resolved.payload ? (resolved.payload as Prisma.InputJsonValue) : Prisma.DbNull,
    },
  });
  const dto = toSlotDTO(row, input.item);
  if (!dto) throw new Error("slot: impression has no renderable payload");
  return dto;
}

/** Candidates as the router ranked them (a why card first), with which one was featured. */
function candidateSnapshot(plan: SlotPlan): Prisma.InputJsonValue {
  return plan.candidateList.map((c) => ({
    title: c.callout.title,
    conceptSlug: c.callout.conceptSlug ?? null,
    why: c.why,
    rank: c.rank,
  }));
}

// ─── DTO ────────────────────────────────────────────────────────────────────

type ImpressionRow = Prisma.SlotImpressionGetPayload<object>;

export function quickCheckFeedback(
  q: { options: string[]; correctIndex: number; explanation: string },
  r: { dontKnow: boolean; correct: boolean },
): string {
  const answer = q.options[q.correctIndex];
  if (r.correct) return `Right. ${q.explanation}`;
  if (r.dontKnow) return `The answer is "${answer}". ${q.explanation}`;
  return `Not quite: the answer is "${answer}". ${q.explanation}`;
}

/**
 * SlotImpression row (+ its featured item) → SlotDTO. Server-only fields
 * (quick-check correct answer, explanation) are exposed only after answering.
 * Returns null if the payload a variant needs is missing (never expected).
 */
export function toSlotDTO(row: ImpressionRow, item: LearnLaterItemWithConcept): SlotDTO | null {
  const base = {
    impressionId: row.id,
    answerMessageId: row.messageId,
    item: learnLaterItemToDTO(item),
    engagement: row.engagement,
    engagedAt: row.engagedAt?.toISOString() ?? null,
  };
  const parsed = SlotPayloadSchema.safeParse(row.payload ?? {});
  const payload = parsed.success ? parsed.data : {};
  switch (row.variant) {
    case "card":
      return { ...base, variant: "card", digInConversationId: row.digInConversationId };
    case "none":
      return { ...base, variant: "none" };
    case "walkthrough":
      if (!payload.copy) return null;
      return { ...base, variant: "walkthrough", copy: payload.copy, exchangeId: row.walkthroughExchangeId };
    case "apply":
      if (!payload.copy) return null;
      return { ...base, variant: "apply", copy: payload.copy, applyMessageId: row.applyMessageId };
    case "quickcheck": {
      const q = payload.quickcheck;
      if (!q) return null;
      const resp = QuickCheckResponseSchema.safeParse(row.quickcheckResponse);
      const result: QuickCheckResultDTO | null = resp.success
        ? {
            selectedIndex: resp.data.selectedIndex,
            dontKnow: resp.data.dontKnow,
            correct: resp.data.correct,
            correctIndex: q.correctIndex,
            feedback: quickCheckFeedback(q, resp.data),
          }
        : null;
      return { ...base, variant: "quickcheck", quickcheck: { prompt: q.prompt, options: q.options, result } };
    }
  }
}

export const impressionItemInclude = {
  learnLaterItem: { include: { concept: { select: { slug: true } } } },
} satisfies Prisma.SlotImpressionInclude;
export type ImpressionWithItem = Prisma.SlotImpressionGetPayload<{ include: typeof impressionItemInclude }>;

/** SlotDTOs for answer messages, keyed by message id (for history, R14). */
export async function loadSlotDTOs(userId: string, messageIds: string[]): Promise<Map<string, SlotDTO>> {
  const out = new Map<string, SlotDTO>();
  if (!messageIds.length) return out;
  const rows = await db.slotImpression.findMany({
    where: { userId, messageId: { in: messageIds } },
    include: impressionItemInclude,
  });
  for (const r of rows) {
    if (!r.learnLaterItem) continue; // featured item deleted: nothing to render
    const dto = toSlotDTO(r, r.learnLaterItem);
    if (dto) out.set(r.messageId, dto);
  }
  return out;
}

export async function loadOwnedImpression(userId: string, id: string): Promise<ImpressionWithItem | null> {
  return db.slotImpression.findFirst({ where: { id, userId }, include: impressionItemInclude });
}

// ─── Engagement (E5 primary) ────────────────────────────────────────────────

const ENGAGEMENT_COLUMN = {
  dig_in: "digInAt",
  walkthrough_started: "walkthroughStartedAt",
  quickcheck_answered: "quickcheckAnsweredAt",
  apply_clicked: "applyClickedAt",
} as const satisfies Record<SlotEngagement, keyof ImpressionRow>;

/** What claim/release need from the Prisma client (injectable for tests). */
export interface EngagementStore {
  $transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
}

/**
 * Record an engagement once: sets its timestamp column (plus `extra`) only if
 * still null, and the impression's first `engagement`/`engagedAt` if unset —
 * both in one transaction, so a crash can't leave a claimed column without the
 * first-engagement fields. Returns false if this engagement was already
 * recorded (a double click, a race) — the atomic claim that makes the
 * Claude-calling routes idempotent.
 */
export async function claimEngagement(
  impressionId: string,
  kind: SlotEngagement,
  extra: Prisma.SlotImpressionUpdateManyMutationInput = {},
  store: EngagementStore = db,
): Promise<boolean> {
  const col = ENGAGEMENT_COLUMN[kind];
  const now = new Date();
  return store.$transaction(async (tx) => {
    const { count } = await tx.slotImpression.updateMany({
      where: { id: impressionId, [col]: null } as Prisma.SlotImpressionWhereInput,
      data: { [col]: now, ...extra } as Prisma.SlotImpressionUpdateManyMutationInput,
    });
    if (count !== 1) return false;
    await tx.slotImpression.updateMany({
      where: { id: impressionId, engagedAt: null },
      data: { engagedAt: now, engagement: kind },
    });
    return true;
  });
}

/**
 * Undo a claim after the engagement failed before producing anything (so the
 * user can retry). Clears the first-engagement fields only if they were set by
 * this kind. Idempotent; never throws.
 */
export async function releaseEngagement(impressionId: string, kind: SlotEngagement, store: EngagementStore = db): Promise<void> {
  const col = ENGAGEMENT_COLUMN[kind];
  try {
    await store.$transaction(async (tx) => {
      await tx.slotImpression.updateMany({
        where: { id: impressionId },
        data: { [col]: null } as Prisma.SlotImpressionUpdateManyMutationInput,
      });
      await tx.slotImpression.updateMany({
        where: { id: impressionId, engagement: kind },
        data: { engagement: null, engagedAt: null },
      });
    });
  } catch (err) {
    console.error(`[slot] failed to release ${kind} claim:`, err);
  }
}
