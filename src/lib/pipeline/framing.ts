// POST /api/framing/[exchangeId]/answer orchestration (R10, R11). Server-only.
import "server-only";
import { unstable_rethrow } from "next/navigation";
import { after } from "next/server";
import { apiError, type ChatStreamEvent } from "@/lib/api-contract";
import { db, Prisma } from "@/lib/db";
import { learnLaterItemToDTO, upsertLearnLaterItem, type LearnLaterItemWithConcept } from "@/lib/learn-later";
import { ndjsonResponse } from "@/lib/ndjson";
import { ASSESSMENT_MAX_WAIT_MS, createAssessmentGate, runAfterStream, type AssessmentGate } from "@/lib/pipeline/assess";
import type { FramedDeliver } from "@/lib/claude/prompts";
import { loadLearnerSnapshot, loadTurns, parseQuestions } from "@/lib/pipeline/context";
import { enforceChatRateLimits, validateFramingResponses } from "@/lib/pipeline/guards";
import {
  answerAndPersist,
  linkedAbort,
  STOPPED_BEFORE_ANSWER_TEXT,
  tierInputs,
  touchConversation,
} from "@/lib/pipeline/stream";
import { FramingAnswerRequestSchema, LearnLaterCalloutSchema } from "@/lib/schemas";
import { getSessionUser } from "@/lib/session";
import { progressToNextTier, tierUnlocked } from "@/lib/tiers";
import type { AnswerMessageData, FramingQuestion, FramingResponse, LearnLaterCallout, TierInputs } from "@/lib/types";

class ConflictError extends Error {}

export async function handleFramingAnswer(request: Request, exchangeId: string): Promise<Response> {
  try {
    return await framingAnswer(request, exchangeId);
  } catch (err) {
    unstable_rethrow(err); // let Next.js control-flow errors through
    console.error("[framing] request failed:", err);
    return apiError(500, "internal", "Something went wrong — please try again.");
  }
}

/** Pre-stream work; typed errors are returned as responses, anything unexpected throws. */
async function framingAnswer(request: Request, exchangeId: string): Promise<Response> {
  const parsed = FramingAnswerRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "bad_request", "Invalid framing answer");
  const skip = parsed.data.skip === true;

  const user = await getSessionUser();
  const exchange = await db.framingExchange.findFirst({
    where: { id: exchangeId, userId: user.id },
    select: {
      id: true,
      status: true,
      conversationId: true,
      questions: true,
      skipCallout: true,
      kind: true,
      userMessage: { select: { id: true, content: true, createdAt: true } },
    },
  });
  if (!exchange) return apiError(404, "not_found", "Framing exchange not found");
  if (exchange.status !== "pending") return apiError(409, "conflict", "These framing questions were already answered or skipped");

  // R11 validation before the rate limit, so rejected submissions don't consume quota.
  const questions = parseQuestions(exchange.questions);
  const responses = skip ? [] : parsed.data.responses;
  if (!skip) {
    const problem = validateFramingResponses(questions, responses);
    if (problem) return apiError(400, "bad_request", problem);
  }

  const limited = await enforceChatRateLimits(user.demoSessionId, request.headers);
  if (limited) return limited;

  // A task/lookup exchange (one quick question before the work) saves its
  // featured item whether the user answers or skips; a concept exchange only on skip.
  const framedDeliver: FramedDeliver | null = exchange.kind === "task" || exchange.kind === "lookup" ? exchange.kind : null;
  const skipCallout = skip || framedDeliver ? parseCallout(exchange.skipCallout) : null;

  // Transition out of `pending` atomically (guards double submits → 409).
  // Tier progress: `before` is read inside the transaction; `after` is the
  // same snapshot plus this answered exchange (P7 counts framing exchanges).
  let skipItem: LearnLaterItemWithConcept | null = null;
  let progress: { before: TierInputs; after: TierInputs } | null = null;
  try {
    skipItem = await db.$transaction(async (tx) => {
      const before = skip ? null : await tierInputs(user.id, tx);
      const { count } = await tx.framingExchange.updateMany({
        where: { id: exchange.id, status: "pending" },
        data: skip
          ? { status: "skipped" }
          : { status: "answered", answeredAt: new Date(), responses: responses as Prisma.InputJsonValue },
      });
      if (count !== 1) throw new ConflictError();
      if (before) progress = { before, after: { ...before, answeredFramingCount: before.answeredFramingCount + 1 } };
      if (!skipCallout) return null;
      const { item } = await upsertLearnLaterItem(
        {
          userId: user.id,
          callout: skipCallout,
          origin: framedDeliver ? "flagged" : "skipped",
          sourceConversationId: exchange.conversationId,
          sourceMessageId: exchange.userMessage.id,
        },
        tx,
      );
      return item;
    });
  } catch (err) {
    if (err instanceof ConflictError) return apiError(409, "conflict", "These framing questions were already answered or skipped");
    throw err;
  }

  const gate = createAssessmentGate();
  after(() => runAfterStream(gate, ASSESSMENT_MAX_WAIT_MS));

  return ndjsonResponse(
    framingEvents({
      userId: user.id,
      exchangeId: exchange.id,
      conversationId: exchange.conversationId,
      userMessage: exchange.userMessage,
      questions,
      responses,
      skip,
      framedDeliver,
      skipCallout,
      skipItem,
      progress,
      gate,
      requestSignal: request.signal,
    }),
  );
}

function parseCallout(json: unknown): LearnLaterCallout | null {
  const r = LearnLaterCalloutSchema.safeParse(json);
  return r.success ? r.data : null;
}

interface FramingEventsInput {
  userId: string;
  exchangeId: string;
  conversationId: string;
  userMessage: { id: string; content: string; createdAt: Date };
  questions: FramingQuestion[];
  responses: FramingResponse[];
  skip: boolean;
  /** Set for a task/lookup exchange: the work is delivered after the question. */
  framedDeliver: FramedDeliver | null;
  skipCallout: LearnLaterCallout | null;
  skipItem: LearnLaterItemWithConcept | null;
  progress: { before: TierInputs; after: TierInputs } | null;
  gate: AssessmentGate;
  requestSignal: AbortSignal;
}

async function* framingEvents(input: FramingEventsInput): AsyncGenerator<ChatStreamEvent> {
  const { userId, conversationId, userMessage, skip, framedDeliver } = input;
  const abort = linkedAbort(input.requestSignal);
  // The exchange already left `pending`, so a retry would 409: it must end up
  // with an answer message, or be reopened after a failure (R10).
  let answerStored = false;
  let failed = false;
  const storeAnswer = (text: string) =>
    db.$transaction(async (tx) => {
      const data: AnswerMessageData | null = input.skipItem ? { calloutItemIds: [input.skipItem.id] } : null;
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
      await tx.framingExchange.update({ where: { id: input.exchangeId }, data: { answerMessageId: msg.id } });
      await touchConversation(tx, conversationId);
      answerStored = true;
      return msg.id;
    });
  try {
    if (input.progress) {
      yield {
        type: "progress",
        progress: progressToNextTier(input.progress.after),
        unlocked: tierUnlocked(input.progress.before, input.progress.after),
      };
    }

    const [history, learner] = await Promise.all([
      loadTurns(conversationId, { before: userMessage.createdAt }),
      loadLearnerSnapshot(userId),
    ]);

    yield* answerAndPersist({
      answer: skip
        ? { mode: framedDeliver ?? "skip", learner, history, message: userMessage.content }
        : {
            mode: "framing",
            learner,
            history,
            message: userMessage.content,
            questions: input.questions,
            responses: input.responses,
            ...(framedDeliver ? { deliver: framedDeliver } : {}),
          },
      signal: abort.signal,
      gate: input.gate,
      keepPartialOnError: true,
      persist: async (text) => {
        const messageId = await storeAnswer(text);
        // Skip path (and a task/lookup exchange) always emits `callouts` (with the saved item, if any).
        return {
          messageId,
          callouts: skip || framedDeliver ? (input.skipItem ? [learnLaterItemToDTO(input.skipItem)] : []) : null,
        };
      },
      job: (answerMessageId, text) => ({
        userId,
        conversationId,
        userMessageId: userMessage.id,
        answerMessageId,
        mode: skip ? (framedDeliver ?? "skip") : "framing",
        userMessage: userMessage.content,
        answer: text,
        history,
        ...(skip
          ? framedDeliver
            ? {}
            : { skipCallout: input.skipCallout }
          : { framing: { questions: input.questions, responses: input.responses } }),
      }),
    });
  } catch (err) {
    failed = true;
    // Real failure (not a stop). With ≥1 delta the partial answer + ERROR_NOTE
    // is already stored (keepPartialOnError). With none, reopen the exchange
    // so the user can resubmit — before the `error` event goes out.
    if (!answerStored) await reopenExchange(input.exchangeId);
    throw err;
  } finally {
    input.gate.cancel();
    abort.abort();
    // Stopped before any answer text (during progress/context/first token):
    // store a placeholder answer so the exchange isn't left dangling.
    if (!answerStored && !failed) {
      try {
        await storeAnswer(STOPPED_BEFORE_ANSWER_TEXT);
      } catch (err) {
        console.error("[framing] failed to persist stopped placeholder:", err);
      }
    }
  }
}

/**
 * R10: after a failed answer with no text, put the exchange back to `pending`
 * (responses/answeredAt cleared) so it can be resubmitted. A queued skip item
 * is left in place; R13 dedupe reuses it on the retry. Logged, never thrown.
 */
async function reopenExchange(exchangeId: string): Promise<void> {
  try {
    await db.framingExchange.updateMany({
      where: { id: exchangeId, status: { in: ["answered", "skipped"] }, answerMessageId: null },
      data: { status: "pending", responses: Prisma.DbNull, answeredAt: null },
    });
  } catch (err) {
    console.error("[framing] failed to reopen exchange after an error:", err);
  }
}
