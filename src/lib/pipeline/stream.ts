// Shared streaming step: answer → answer_delta… → persist → callouts? → slot? → done.
// Server-only.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ChatStreamEvent } from "@/lib/api-contract";
import { streamAnswer, type AnswerInput } from "@/lib/claude/answerer";
import { ClaudeOutputError } from "@/lib/claude/client";
import { db, type Prisma } from "@/lib/db";
import { PublicError } from "@/lib/ndjson";
import type { AssessmentGate, AssessmentJob } from "@/lib/pipeline/assess";
import type { LearnLaterItemDTO, SlotDTO, TierInputs } from "@/lib/types";

/** Appended to a partial answer the user stopped (client disconnect), like claude.ai. */
export const STOPPED_NOTE = "\n\n_(Stopped.)_";
/** Answer message stored when the user stops a framing answer before any text arrived (R10). */
export const STOPPED_BEFORE_ANSWER_TEXT = "_(Stopped before Claude answered.)_";

/** Appended to a partial answer kept after an upstream failure (framing route only, R10). */
export const ERROR_NOTE = "\n\n_(Claude hit an error; this answer is incomplete.)_";

export interface PersistMeta {
  /**
   * True when `text` is a partial answer: the client stopped it (ends with
   * STOPPED_NOTE) or the answerer failed mid-stream (ends with ERROR_NOTE).
   */
  incomplete: boolean;
}

export interface AnswerStreamOptions {
  answer: AnswerInput;
  signal: AbortSignal;
  /**
   * Store the answer (R5 touch included); return its id and callouts to emit
   * (null = no callouts event). For an incomplete answer (meta.incomplete)
   * only attach callout items that already exist; the result is never emitted.
   */
  persist: (
    text: string,
    meta: PersistMeta,
  ) => Promise<{ messageId: string; callouts: LearnLaterItemDTO[] | null; slot?: SlotDTO | null }>;
  /**
   * On an upstream failure after ≥1 delta, also persist the partial text +
   * ERROR_NOTE (before the `error` event). Default false: nothing is stored.
   */
  keepPartialOnError?: boolean;
  /** Build the assessor job once the answer is stored (R12). */
  job: (messageId: string, text: string) => AssessmentJob;
  gate: AssessmentGate;
}

/**
 * Stream the answer, then persist it and hand the assessor job to the gate.
 *
 * Client disconnect (R3/R10): the generator either sees the upstream abort
 * error or has `return()` called while suspended at a yield. Either way, if at
 * least one delta arrived, the partial text + STOPPED_NOTE is persisted as the
 * answer message (no assessor run, nothing emitted). With no delta nothing is
 * persisted here: callers decide (framing stores a placeholder, chat keeps
 * only the user message).
 */
export async function* answerAndPersist(opts: AnswerStreamOptions): AsyncGenerator<ChatStreamEvent> {
  let text = "";
  // Still "streaming" when `finally` runs ⇒ the client stopped the answer.
  let state: "streaming" | "complete" | "failed" = "streaming";
  try {
    try {
      for await (const chunk of streamAnswer(opts.answer, opts.signal)) {
        text += chunk;
        yield { type: "answer_delta", text: chunk };
      }
    } catch (err) {
      // Normal client disconnect: no error event or log; `finally` keeps the partial answer.
      if (opts.signal.aborted && isAbortError(err)) return;
      state = "failed";
      if (opts.keepPartialOnError && text.trim()) await persistIncomplete(opts, text + ERROR_NOTE);
      throw toPublicError(err);
    }
    if (opts.signal.aborted) return; // upstream ended quietly after an abort: treat as stopped
    state = "complete";
    if (!text.trim()) throw new PublicError("Claude returned an empty answer — please try again.");
    const { messageId, callouts, slot } = await opts.persist(text, { incomplete: false });
    opts.gate.resolve(opts.job(messageId, text));
    if (callouts) yield { type: "callouts", items: callouts };
    if (slot) yield { type: "slot", slot };
    yield { type: "done", messageId };
  } finally {
    opts.gate.cancel(); // no-op if already resolved; a stopped answer is never assessed
    // DB-only work; nothing here takes the (aborted) request signal.
    if (state === "streaming" && text.trim()) await persistIncomplete(opts, text + STOPPED_NOTE);
  }
}

/** Store a partial answer; failures are logged, never thrown (runs in finally/error paths). */
async function persistIncomplete(opts: AnswerStreamOptions, text: string): Promise<void> {
  try {
    await opts.persist(text, { incomplete: true });
  } catch (err) {
    console.error("[stream] failed to persist incomplete answer:", err);
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Anthropic.APIUserAbortError || (err instanceof Error && err.name === "AbortError");
}

/** Map upstream failures to messages that are safe (and useful) to show. */
export function toPublicError(err: unknown): unknown {
  if (err instanceof PublicError) return err;
  if (err instanceof Anthropic.APIUserAbortError) return err;
  if (err instanceof Anthropic.RateLimitError || (err instanceof Anthropic.APIError && (err.status ?? 0) >= 500)) {
    console.error("[claude] upstream error:", err);
    return new PublicError("Claude is busy right now — please try again in a moment.");
  }
  if (err instanceof ClaudeOutputError) {
    console.error("[claude] output error:", err);
    return new PublicError("Claude couldn't answer that one — try rephrasing.");
  }
  return err;
}

/** Abort controller tied to the request and to the generator's lifetime. */
export function linkedAbort(requestSignal: AbortSignal): AbortController {
  const controller = new AbortController();
  if (requestSignal.aborted) controller.abort();
  else requestSignal.addEventListener("abort", () => controller.abort(), { once: true });
  return controller;
}

export async function tierInputs(
  userId: string,
  tx: Prisma.TransactionClient | typeof db = db,
): Promise<TierInputs> {
  const [answeredFramingCount, conceptCount] = await Promise.all([
    tx.framingExchange.count({ where: { userId, status: "answered" } }),
    tx.conceptMastery.count({ where: { userId } }),
  ]);
  return { answeredFramingCount, conceptCount };
}

export async function touchConversation(tx: Prisma.TransactionClient, conversationId: string): Promise<void> {
  await tx.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
}
