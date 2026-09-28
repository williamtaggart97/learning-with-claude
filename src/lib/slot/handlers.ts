// /api/slot/[impressionId]/* — engaging with an end-of-answer slot (E1, E5;
// api-contract R15–R18). Every handler checks ownership (404), that the slot
// shows the variant being used (409), and records the engagement exactly once
// (claimEngagement; a repeat → 409). Claude-calling routes (walkthrough,
// apply) go through the chat rate limits (R6). Server-only.
import "server-only";
import { unstable_rethrow } from "next/navigation";
import { after } from "next/server";
import {
  apiError,
  applyMessageText,
  walkthroughMessageText,
  type ChatStreamEvent,
  type QuickCheckAnswerResponse,
} from "@/lib/api-contract";
import type { SlotItemPrompt } from "@/lib/claude/prompts";
import { generateWalkthroughQuestions } from "@/lib/claude/slot";
import { startDigIn } from "@/lib/dig-in";
import { db, Prisma } from "@/lib/db";
import { parseJsonBody } from "@/lib/http";
import { ndjsonResponse, PublicError } from "@/lib/ndjson";
import { applyConcept, ASSESSMENT_MAX_WAIT_MS, createAssessmentGate, runAfterStream, withRowTx } from "@/lib/pipeline/assess";
import { loadLearnerSnapshot, loadTurns } from "@/lib/pipeline/context";
import { enforceChatRateLimits } from "@/lib/pipeline/guards";
import { answerAndPersist, linkedAbort, touchConversation } from "@/lib/pipeline/stream";
import { QuickCheckAnswerRequestSchema, SlotPayloadSchema } from "@/lib/schemas";
import { getSessionUser } from "@/lib/session";
import {
  claimEngagement,
  loadOwnedImpression,
  releaseEngagement,
  toSlotDTO,
  type ImpressionWithItem,
} from "@/lib/slot/service";
import type { FramingMessageData, LearnLaterCallout, SlotUserMessageData } from "@/lib/types";

/** Quick-check evidence on an EXISTING mastery (P7): weaker than a framing answer. */
export const QUICKCHECK_DELTA = { correct: 0.05, wrong: -0.05, dontKnow: -0.02 } as const;

function wrap(label: string, fn: () => Promise<Response>): Promise<Response> {
  return fn().catch((err) => {
    unstable_rethrow(err);
    console.error(`[slot] ${label} failed:`, err);
    return apiError(500, "internal", "Something went wrong — please try again.");
  });
}

type OwnedWithItem = ImpressionWithItem & { learnLaterItem: NonNullable<ImpressionWithItem["learnLaterItem"]> };

/** Ownership + featured item present; else an error response. */
async function loadForEngagement(
  impressionId: string,
): Promise<{ ok: true; user: Awaited<ReturnType<typeof getSessionUser>>; imp: OwnedWithItem } | { ok: false; response: Response }> {
  const user = await getSessionUser();
  const imp = await loadOwnedImpression(user.id, impressionId);
  if (!imp) return { ok: false, response: apiError(404, "not_found", "Slot not found") };
  if (!imp.learnLaterItem) return { ok: false, response: apiError(404, "not_found", "Learn It Later item not found") };
  // The impression outlives its conversation (SetNull FK); nothing to act on then.
  if (!imp.conversationRefId) return { ok: false, response: apiError(404, "not_found", "Conversation not found") };
  return { ok: true, user, imp: imp as OwnedWithItem };
}

/** Message.data tagging a slot-generated user message (the E5 guardrail ignores it). */
function slotMessageData(impressionId: string, action: SlotUserMessageData["action"]): Prisma.InputJsonObject {
  const data: SlotUserMessageData = { origin: "slot", impressionId, action };
  return { ...data };
}

function itemPrompt(imp: OwnedWithItem): SlotItemPrompt {
  const i = imp.learnLaterItem;
  return { title: i.title, preview: i.preview, appliedContext: i.appliedContext, conceptSlug: i.concept?.slug ?? imp.featuredConceptSlug };
}

// ─── R15: dig in from the slot ──────────────────────────────────────────────

/** POST /api/slot/[id]/dig-in → DigInResponse (same as the Learn It Later dig-in; logs `dig_in`). */
export function handleSlotDigIn(impressionId: string): Promise<Response> {
  return wrap("dig-in", async () => {
    const loaded = await loadForEngagement(impressionId);
    if (!loaded.ok) return loaded.response;
    const { user, imp } = loaded;
    if (imp.variant === "none") return apiError(409, "conflict", "This answer has no slot to dig into");
    const result = await startDigIn(user.id, imp.learnLaterItem.id);
    if (!result) return apiError(404, "not_found", "Learn It Later item not found");
    // Repeat clicks reuse the dig-in conversation; only the first is logged.
    await claimEngagement(imp.id, "dig_in", { digInConversationId: result.conversationId });
    return Response.json(result);
  });
}

// ─── R16: walk me through it (B) ────────────────────────────────────────────

/**
 * POST /api/slot/[id]/walkthrough → NDJSON: conversation → framing (terminal),
 * exactly like the concept path of POST /api/chat. Creates a user message
 * (walkthroughMessageText) and a FramingExchange on the featured concept,
 * answered later through POST /api/framing/[exchangeId]/answer (counts toward
 * progress like any framing exchange, P7).
 */
export function handleSlotWalkthrough(request: Request, impressionId: string): Promise<Response> {
  return wrap("walkthrough", async () => {
    const loaded = await loadForEngagement(impressionId);
    if (!loaded.ok) return loaded.response;
    const { user, imp } = loaded;
    if (imp.variant !== "walkthrough") return apiError(409, "conflict", "This slot has no walk-through");
    if (imp.walkthroughStartedAt) return apiError(409, "conflict", "The walk-through was already started");
    const item = itemPrompt(imp);
    // L9: never a second framing exchange on a concept already framed here.
    if (item.conceptSlug) {
      const framed = await db.framingExchange.count({
        where: { conversationId: imp.conversationId, conceptSlugs: { has: item.conceptSlug } },
      });
      if (framed) return apiError(409, "conflict", "This concept was already walked through in this conversation");
    }
    const limited = await enforceChatRateLimits(user.demoSessionId, request.headers);
    if (limited) return limited;
    if (!(await claimEngagement(imp.id, "walkthrough_started"))) {
      return apiError(409, "conflict", "The walk-through was already started");
    }
    return ndjsonResponse(walkthroughEvents({ userId: user.id, imp, item, requestSignal: request.signal }));
  });
}

async function* walkthroughEvents(input: {
  userId: string;
  imp: OwnedWithItem;
  item: SlotItemPrompt;
  requestSignal: AbortSignal;
}): AsyncGenerator<ChatStreamEvent> {
  const { userId, imp, item } = input;
  const conversationId = imp.conversationId;
  const abort = linkedAbort(input.requestSignal);
  let created = false;
  try {
    const [turns, learner] = await Promise.all([loadTurns(conversationId, { limit: 8 }), loadLearnerSnapshot(userId)]);
    let questions;
    try {
      questions = await generateWalkthroughQuestions({ item, learner, turns }, abort.signal);
    } catch (err) {
      if (abort.signal.aborted) return;
      console.error("[slot] walkthrough framing failed:", err);
      throw new PublicError("Couldn't start the walk-through — please try again.");
    }
    if (abort.signal.aborted) return;
    const skipCallout: LearnLaterCallout = {
      title: item.title,
      preview: item.preview,
      appliedContext: item.appliedContext,
      ...(item.conceptSlug ? { conceptSlug: item.conceptSlug } : {}),
    };
    const ids = await db.$transaction(async (tx) => {
      // Like R8d: a still-pending exchange in this conversation is abandoned.
      await tx.framingExchange.updateMany({ where: { conversationId, status: "pending" }, data: { status: "skipped" } });
      const userMsg = await tx.message.create({
        data: {
          conversationId,
          role: "user",
          kind: "text",
          content: walkthroughMessageText(item.title),
          data: slotMessageData(imp.id, "walkthrough"),
        },
        select: { id: true },
      });
      const framingMsg = await tx.message.create({
        data: { conversationId, role: "assistant", kind: "framing", content: "" },
        select: { id: true },
      });
      const exchange = await tx.framingExchange.create({
        data: {
          userId,
          conversationId,
          userMessageId: userMsg.id,
          framingMessageId: framingMsg.id,
          questions,
          conceptSlugs: item.conceptSlug ? [item.conceptSlug] : [],
          skipCallout,
        },
        select: { id: true },
      });
      const data: FramingMessageData = { exchangeId: exchange.id };
      await tx.message.update({ where: { id: framingMsg.id }, data: { data: { ...data } } });
      await tx.slotImpression.update({ where: { id: imp.id }, data: { walkthroughExchangeId: exchange.id } });
      await touchConversation(tx, conversationId);
      return { userMessageId: userMsg.id, messageId: framingMsg.id, exchangeId: exchange.id };
    });
    created = true;
    yield { type: "conversation", conversationId, userMessageId: ids.userMessageId };
    yield { type: "framing", exchangeId: ids.exchangeId, messageId: ids.messageId, questions };
  } finally {
    abort.abort();
    // Nothing was created (failure or disconnect): let the user click again.
    if (!created) await releaseEngagement(imp.id, "walkthrough_started");
  }
}

// ─── R17: quick check (C) ───────────────────────────────────────────────────

/**
 * POST /api/slot/[id]/quickcheck  body QuickCheckAnswerRequest →
 * QuickCheckAnswerResponse. Deterministic feedback (no Claude call); the
 * answer is evidence on the featured concept's EXISTING mastery only (P7:
 * only answered framing exchanges create concepts; a quick check doesn't count
 * toward progress).
 */
export function handleSlotQuickcheck(request: Request, impressionId: string): Promise<Response> {
  return wrap("quickcheck", async () => {
    const body = await parseJsonBody(request, QuickCheckAnswerRequestSchema);
    if (!body.ok) return body.response;
    const loaded = await loadForEngagement(impressionId);
    if (!loaded.ok) return loaded.response;
    const { user, imp } = loaded;
    const q = imp.variant === "quickcheck" ? SlotPayloadSchema.safeParse(imp.payload ?? {}).data?.quickcheck : undefined;
    if (!q) return apiError(409, "conflict", "This slot has no quick check");
    if (imp.quickcheckAnsweredAt) return apiError(409, "conflict", "The quick check was already answered");
    const { selectedIndex, dontKnow } = body.data;
    if (selectedIndex !== null && selectedIndex >= q.options.length) {
      return apiError(400, "bad_request", "selectedIndex is not one of the options");
    }
    const correct = !dontKnow && selectedIndex === q.correctIndex;
    const response = { selectedIndex, dontKnow, correct };
    if (!(await claimEngagement(imp.id, "quickcheck_answered", { quickcheckResponse: response }))) {
      return apiError(409, "conflict", "The quick check was already answered");
    }

    const slug = imp.learnLaterItem.concept?.slug ?? null;
    let mastery: QuickCheckAnswerResponse["mastery"] = null;
    if (slug) {
      const delta = correct ? QUICKCHECK_DELTA.correct : dontKnow ? QUICKCHECK_DELTA.dontKnow : QUICKCHECK_DELTA.wrong;
      const what = correct
        ? "answered a quick check on this correctly"
        : dontKnow
          ? `said "I don't know" to a quick check on this`
          : `picked "${q.options[selectedIndex ?? 0]}" on a quick check on this (the answer was "${q.options[q.correctIndex]}")`;
      try {
        // Same row-level pattern as the assessor: a short SERIALIZABLE
        // read-modify-write, retried on serialization conflicts (P2034), so a
        // concurrent assessor run can't drop this evidence (or vice versa).
        // Tagged source "quickcheck": the E5 mastery metric excludes it.
        const outcome = await withRowTx((tx) =>
          applyConcept(
            tx,
            {
              userId: user.id,
              conversationId: imp.conversationId,
              userMessageId: imp.userMessageId,
              answerMessageId: imp.messageId,
              mode: "lookup", // existing masteries only
              userMessage: "",
              answer: "",
              history: [],
            },
            { slug, name: imp.learnLaterItem.title, masteryDelta: delta, evidence: `You ${what}: "${q.prompt}"` },
            new Date().toISOString(),
            { source: "quickcheck" },
          ),
        );
        if (outcome !== "ignored") {
          const row = await db.conceptMastery.findFirst({
            where: { userId: user.id, concept: { slug } },
            select: { score: true },
          });
          if (row) mastery = { slug, score: row.score, delta };
        }
      } catch (err) {
        console.error("[slot] quickcheck mastery update failed:", err);
      }
    }

    const fresh = await loadOwnedImpression(user.id, imp.id);
    const slot = fresh?.learnLaterItem ? toSlotDTO(fresh, fresh.learnLaterItem) : null;
    if (!slot) return apiError(500, "internal", "Something went wrong — please try again.");
    const out: QuickCheckAnswerResponse = { slot, mastery };
    return Response.json(out);
  });
}

// ─── R18: apply it to my project (D) ────────────────────────────────────────

/**
 * POST /api/slot/[id]/apply → NDJSON: conversation → answer_delta… → done,
 * like the lookup path of POST /api/chat (no callouts, no slot). Stores a
 * user message (applyMessageText) and the answer in the same conversation;
 * the assessor runs afterwards (mode "apply", existing masteries only).
 */
export function handleSlotApply(request: Request, impressionId: string): Promise<Response> {
  return wrap("apply", async () => {
    const loaded = await loadForEngagement(impressionId);
    if (!loaded.ok) return loaded.response;
    const { user, imp } = loaded;
    if (imp.variant !== "apply") return apiError(409, "conflict", "This slot has no apply-it action");
    if (imp.applyClickedAt) return apiError(409, "conflict", "Already applied");
    const limited = await enforceChatRateLimits(user.demoSessionId, request.headers);
    if (limited) return limited;
    if (!(await claimEngagement(imp.id, "apply_clicked"))) return apiError(409, "conflict", "Already applied");

    const item = itemPrompt(imp);
    const conversationId = imp.conversationId;
    let userMessage: { id: string };
    try {
      userMessage = await db.$transaction(async (tx) => {
        await tx.framingExchange.updateMany({ where: { conversationId, status: "pending" }, data: { status: "skipped" } });
        const m = await tx.message.create({
          data: {
            conversationId,
            role: "user",
            kind: "text",
            content: applyMessageText(item.title),
            data: slotMessageData(imp.id, "apply"),
          },
          select: { id: true },
        });
        await touchConversation(tx, conversationId);
        return m;
      });
    } catch (err) {
      await releaseEngagement(imp.id, "apply_clicked");
      throw err;
    }

    const gate = createAssessmentGate();
    after(() => runAfterStream(gate, ASSESSMENT_MAX_WAIT_MS));
    return ndjsonResponse(
      applyEvents({ userId: user.id, imp, item, userMessageId: userMessage.id, gate, requestSignal: request.signal }),
    );
  });
}

async function* applyEvents(input: {
  userId: string;
  imp: OwnedWithItem;
  item: SlotItemPrompt;
  userMessageId: string;
  gate: ReturnType<typeof createAssessmentGate>;
  requestSignal: AbortSignal;
}): AsyncGenerator<ChatStreamEvent> {
  const { userId, imp, item, userMessageId } = input;
  const conversationId = imp.conversationId;
  const message = applyMessageText(item.title);
  const abort = linkedAbort(input.requestSignal);
  let stored = false;
  try {
    yield { type: "conversation", conversationId, userMessageId };
    const [history, learner] = await Promise.all([
      loadTurns(conversationId, { excludeIds: [userMessageId] }),
      loadLearnerSnapshot(userId),
    ]);
    yield* answerAndPersist({
      answer: { mode: "apply", learner, history, message, item },
      signal: abort.signal,
      gate: input.gate,
      persist: async (text) =>
        db.$transaction(async (tx) => {
          const msg = await tx.message.create({
            data: { conversationId, role: "assistant", kind: "answer", content: text, data: Prisma.DbNull },
            select: { id: true },
          });
          await tx.slotImpression.update({ where: { id: imp.id }, data: { applyMessageId: msg.id } });
          await touchConversation(tx, conversationId);
          stored = true;
          return { messageId: msg.id, callouts: null };
        }),
      job: (answerMessageId, text) => ({
        userId,
        conversationId,
        userMessageId,
        answerMessageId,
        mode: "apply",
        userMessage: `${message}\n(Concept: ${item.title} — ${item.preview})`,
        answer: text,
        history,
      }),
    });
  } finally {
    input.gate.cancel();
    abort.abort();
    // No answer text at all (failure, or stopped before the first token):
    // remove the orphan user message and reopen the action for a retry.
    if (!stored) {
      await db.message.deleteMany({ where: { id: userMessageId } }).catch((err) => console.error("[slot] cleanup failed:", err));
      await releaseEngagement(imp.id, "apply_clicked");
    }
  }
}
