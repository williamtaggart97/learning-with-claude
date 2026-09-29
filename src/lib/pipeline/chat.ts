// POST /api/chat orchestration (R8, R9). Server-only.
import "server-only";
import { unstable_rethrow } from "next/navigation";
import { after } from "next/server";
import { EXPERIMENT } from "@/config";
import { apiError, type ChatStreamEvent } from "@/lib/api-contract";
import { routeMessage } from "@/lib/claude/router";
import type { LearnerSnapshot, PromptTurn } from "@/lib/claude/prompts";
import { db, Prisma } from "@/lib/db";
import { learnLaterItemToDTO, upsertLearnLaterItem } from "@/lib/learn-later";
import { ndjsonResponse } from "@/lib/ndjson";
import { ASSESSMENT_MAX_WAIT_MS, createAssessmentGate, runAfterStream, type AssessmentGate } from "@/lib/pipeline/assess";
import { loadCatalog, loadLearnerSnapshot, loadTurns } from "@/lib/pipeline/context";
import { classifyDigIn, enforceChatRateLimits, titleFromMessage } from "@/lib/pipeline/guards";
import { alsoSavedCallouts, planRoute } from "@/lib/pipeline/route-policy";
import { answerAndPersist, linkedAbort, touchConversation } from "@/lib/pipeline/stream";
import { ChatRequestSchema } from "@/lib/schemas";
import { getSessionUser } from "@/lib/session";
import { createSlotImpression, devForcedVariant, reconcileSlotContent, resolveSlotContent, startSlot } from "@/lib/slot/service";
import type { FramingMessageData, AnswerMessageData, SlotDTO, SlotVariant } from "@/lib/types";

export async function handleChat(request: Request): Promise<Response> {
  try {
    const parsed = ChatRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError(400, "bad_request", "Invalid chat request");
    const { conversationId, message } = parsed.data;

    const user = await getSessionUser();

    // a. Load (ownership-checked) or defer creation until after the rate limit.
    let existing: Awaited<ReturnType<typeof loadConversation>> = null;
    if (conversationId) {
      existing = await loadConversation(conversationId, user.id);
      if (!existing) return apiError(404, "not_found", "Conversation not found");
    }

    // b. Dig-in kickoff is detected server-side (R9).
    let digIn = { digInAnswer: false, rateLimitExempt: false };
    if (existing?.origin === "dig_in") {
      const [messageCount, assistantCount] = await Promise.all([
        db.message.count({ where: { conversationId: existing.id } }),
        db.message.count({ where: { conversationId: existing.id, role: "assistant" } }),
      ]);
      digIn = classifyDigIn({ origin: existing.origin, messageCount, assistantCount });
    }

    // c. Rate limit (R6) — only the very first dig-in kickoff is exempt.
    if (!digIn.rateLimitExempt) {
      const limited = await enforceChatRateLimits(user.demoSessionId, request.headers);
      if (limited) return limited;
    }

    // d + e. Auto-skip a pending exchange, create the conversation if needed,
    // store the user message and touch updatedAt (R5).
    const { conversation, userMessage, createdTitle } = await db.$transaction(async (tx) => {
      let conv = existing ? { id: existing.id } : null;
      let createdTitle: string | undefined;
      if (!conv) {
        createdTitle = titleFromMessage(message);
        conv = await tx.conversation.create({ data: { userId: user.id, title: createdTitle }, select: { id: true } });
      } else if (!digIn.digInAnswer) {
        // Abandoned: skipCallout NOT queued, doesn't count toward progress.
        await tx.framingExchange.updateMany({
          where: { conversationId: conv.id, status: "pending" },
          data: { status: "skipped" },
        });
      }
      const userMessage = await tx.message.create({
        data: { conversationId: conv.id, role: "user", kind: "text", content: message },
        select: { id: true, createdAt: true },
      });
      // A just-created conversation already has a fresh updatedAt.
      if (existing) await touchConversation(tx, conv.id);
      return { conversation: conv, userMessage, createdTitle };
    });

    const gate = createAssessmentGate();
    after(() => runAfterStream(gate, ASSESSMENT_MAX_WAIT_MS));

    return ndjsonResponse(
      chatEvents({
        userId: user.id,
        conversationId: conversation.id,
        userMessageId: userMessage.id,
        message,
        createdTitle,
        digIn: digIn.digInAnswer ? existing : null,
        gate,
        requestSignal: request.signal,
        forcedVariant: devForcedVariant(request),
      }),
    );
  } catch (err) {
    unstable_rethrow(err); // let Next.js control-flow errors through
    console.error("[chat] request failed:", err);
    return apiError(500, "internal", "Something went wrong — please try again.");
  }
}

/**
 * User messages since the conversation's most recent framing (counting the one
 * just stored), or null if it has never been framed. Feeds the close-call
 * cooldown in planRoute.
 */
async function countMessagesSinceFraming(conversationId: string): Promise<number | null> {
  const last = await db.framingExchange.findFirst({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    select: { userMessage: { select: { createdAt: true } } },
  });
  const framedAt = last?.userMessage.createdAt;
  if (!framedAt) return null;
  return db.message.count({ where: { conversationId, role: "user", createdAt: { gt: framedAt } } });
}

async function loadConversation(id: string, userId: string) {
  return db.conversation.findFirst({
    where: { id, userId },
    select: {
      id: true,
      origin: true,
      learnLaterItem: {
        select: {
          userId: true,
          title: true,
          preview: true,
          appliedContext: true,
          sourceConversationId: true,
          concept: { select: { slug: true } },
        },
      },
    },
  });
}

interface ChatEventsInput {
  userId: string;
  conversationId: string;
  userMessageId: string;
  message: string;
  createdTitle?: string;
  digIn: Awaited<ReturnType<typeof loadConversation>>;
  gate: AssessmentGate;
  requestSignal: AbortSignal;
  /** Dev-only slot variant override (never set in production). */
  forcedVariant: SlotVariant | null;
}

async function* chatEvents(input: ChatEventsInput): AsyncGenerator<ChatStreamEvent> {
  const { userId, conversationId, userMessageId, message } = input;
  const abort = linkedAbort(input.requestSignal);
  try {
    yield {
      type: "conversation",
      conversationId,
      userMessageId,
      ...(input.createdTitle ? { title: input.createdTitle } : {}),
    };

    const [history, learner] = await Promise.all([
      loadTurns(conversationId, { excludeIds: [userMessageId] }),
      loadLearnerSnapshot(userId),
    ]);

    // ── Dig-in kickoff (R9): no router, straight to the Q4 answer.
    if (input.digIn) {
      yield* digInAnswer(input, history, learner, abort.signal);
      return;
    }

    // ── Router (A1).
    const catalog = await loadCatalog(userId);
    let route: Awaited<ReturnType<typeof routeMessage>>;
    try {
      route = await routeMessage({ message, turns: history, learner, catalog }, abort.signal);
    } catch (err) {
      if (abort.signal.aborted) return; // client disconnected mid-route
      throw err;
    }

    // ── Framing policy (L4 deadline, L9 once per topic, L5 one saved item),
    // enforced in code.
    const earlier =
      route.kind === "concept"
        ? await db.framingExchange.findMany({
            where: { conversationId, conceptSlugs: { hasSome: route.conceptSlugs } },
            select: { conceptSlugs: true, status: true },
          })
        : [];
    const messagesSinceFraming =
      route.kind === "concept" && route.closeCall ? await countMessagesSinceFraming(conversationId) : null;
    const plan = planRoute(route, { message, earlier, messagesSinceFraming });
    if (plan.downgraded) {
      console.info(
        `[chat] framing downgraded (${plan.downgraded}; slugs: ${plan.matchedSlugs.join(", ") || "-"}) → ${plan.answerMode}`,
      );
    }
    route = plan.route;

    if (route.kind === "concept") {
      const { exchangeId, messageId } = await db.$transaction(async (tx) => {
        const framingMsg = await tx.message.create({
          data: { conversationId, role: "assistant", kind: "framing", content: "" },
          select: { id: true },
        });
        const exchange = await tx.framingExchange.create({
          data: {
            userId,
            conversationId,
            userMessageId,
            framingMessageId: framingMsg.id,
            questions: route.framingQuestions,
            conceptSlugs: route.conceptSlugs,
            skipCallout: route.skipCallout,
          },
          select: { id: true },
        });
        const data: FramingMessageData = { exchangeId: exchange.id };
        await tx.message.update({ where: { id: framingMsg.id }, data: { data: { ...data } } });
        await touchConversation(tx, conversationId);
        return { exchangeId: exchange.id, messageId: framingMsg.id };
      });
      input.gate.cancel(); // nothing to assess until the framing is answered
      yield { type: "framing", exchangeId, messageId, questions: route.framingQuestions };
      return;
    }

    // ── Lookup / task / direct: answer now (L5, L8).
    // Experiment inactive (EXPERIMENT_ACTIVE=0): no draw, no impression, no `slot` event — the router's
    // top item is saved and emitted via `callouts` exactly as before.
    // Experiment active: the end-of-answer slot (E1–E5) is drawn up front so
    // its payload is generated in parallel with the answer; the featured item
    // is ALWAYS saved (E3) with the answer, along with the router's other
    // candidates; then `callouts` (all saved items) and `slot` are
    // emitted before `done`. A failed draw (startSlot → null) falls back to
    // the inactive behaviour for this answer.
    // E4 priority override: a lookup/task answer can't change the answered-
    // framing count, and concept-count unlocks come from the assessor after
    // `done`, so no tier unlock can coincide with this answer (unlocked: null
    // — planSlot's unlock branch is dead code here, kept for future callers).
    const mode = plan.answerMode ?? "lookup";
    const slotRun = EXPERIMENT.active
      ? await startSlot({
          userId,
          conversationId,
          candidates: plan.candidates,
          learner,
          message,
          turns: history,
          unlocked: null,
          forcedVariant: input.forcedVariant,
          signal: abort.signal,
        })
      : null;
    yield* answerAndPersist({
      answer: { mode, learner, history, message },
      signal: abort.signal,
      gate: input.gate,
      persist: async (text, { incomplete }) => {
        // A stopped answer keeps only the text: its item and slot were never shown.
        // Network wait happens BEFORE the transaction.
        const fetched = !incomplete && slotRun ? await resolveSlotContent(slotRun) : null;
        const featured = incomplete ? null : (slotRun?.plan.featured.callout ?? plan.persist[0] ?? null);
        return db.$transaction(async (tx) => {
          const source = { userId, origin: "flagged", sourceConversationId: conversationId, sourceMessageId: userMessageId } as const;
          const saved = featured ? await upsertLearnLaterItem({ ...source, callout: featured }, tx) : null;
          const item = saved?.item ?? null;
          // The router's other candidates are saved too, so the profile panel
          // always has cards to dig into. Two callouts can resolve to the same
          // queued item (R13): list each item once.
          const shown: NonNullable<typeof item>[] = item ? [item] : [];
          for (const callout of featured ? alsoSavedCallouts(plan.candidates, featured) : []) {
            const { item: extra } = await upsertLearnLaterItem({ ...source, callout }, tx);
            if (!shown.some((s) => s.id === extra.id)) shown.push(extra);
          }
          // The payload describes the item resolved at draw time (R13 reuse);
          // if the saved item differs, fall back to the card.
          const resolved =
            fetched && slotRun && saved ? reconcileSlotContent(slotRun, fetched, saved.created ? null : saved.item.id) : fetched;
          // Everything saved is disclosed, whichever slot arm was drawn
          // (including the "none" control, which shows it passively).
          const data: AnswerMessageData | null = shown.length ? { calloutItemIds: shown.map((s) => s.id) } : null;
          const msg = await tx.message.create({
            data: {
              conversationId,
              role: "assistant",
              kind: "answer",
              content: text,
              data: data ? { ...data } : Prisma.DbNull,
            },
            select: { id: true },
          });
          let slot: SlotDTO | null = null;
          if (saved && slotRun && resolved) {
            slot = await createSlotImpression(tx, {
              run: slotRun,
              resolved,
              userId,
              conversationId,
              userMessageId,
              messageId: msg.id,
              answerMode: mode,
              item: saved.item,
              reusedItem: !saved.created,
            });
          }
          await touchConversation(tx, conversationId);
          return { messageId: msg.id, callouts: shown.length ? shown.map(learnLaterItemToDTO) : null, slot };
        });
      },
      job: (answerMessageId, text) => ({
        userId,
        conversationId,
        userMessageId,
        answerMessageId,
        mode,
        userMessage: message,
        answer: text,
        history,
      }),
    });
  } finally {
    input.gate.cancel();
    abort.abort();
  }
}

async function* digInAnswer(
  input: ChatEventsInput,
  history: PromptTurn[],
  learner: LearnerSnapshot,
  signal: AbortSignal,
): AsyncGenerator<ChatStreamEvent> {
  const { userId, conversationId, userMessageId, message } = input;
  const item = input.digIn?.learnLaterItem && input.digIn.learnLaterItem.userId === userId ? input.digIn.learnLaterItem : null;

  let sourceTurns: PromptTurn[] = [];
  if (item?.sourceConversationId) {
    const owned = await db.conversation.findFirst({
      where: { id: item.sourceConversationId, userId },
      select: { id: true },
    });
    if (owned) sourceTurns = await loadTurns(owned.id, { limit: 8 });
  }

  // The item was deleted (or isn't the user's): answer the kickoff as a plain lookup.
  const mode = item ? "dig_in" : "lookup";
  yield* answerAndPersist({
    answer: item
      ? {
          mode: "dig_in",
          learner,
          history,
          message,
          item: {
            title: item.title,
            preview: item.preview,
            appliedContext: item.appliedContext,
            conceptSlug: item.concept?.slug ?? null,
          },
          sourceTurns,
        }
      : { mode: "lookup", learner, history, message },
    signal,
    gate: input.gate,
    persist: async (text) =>
      db.$transaction(async (tx) => {
        const msg = await tx.message.create({
          data: { conversationId, role: "assistant", kind: "answer", content: text, data: Prisma.DbNull },
          select: { id: true },
        });
        await touchConversation(tx, conversationId);
        return { messageId: msg.id, callouts: null };
      }),
    job: (answerMessageId, text) => ({
      userId,
      conversationId,
      userMessageId,
      answerMessageId,
      mode,
      userMessage: item ? `${message}\n(Learn It Later item: ${item.title})` : message,
      answer: text,
      history,
    }),
  });
}
