// Answerer (A2, L6, L7, Q4): Sonnet, streamed as text deltas. Server-only.
import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { MODELS } from "@/config";
import { streamText } from "@/lib/claude/client";
import {
  answererSystem,
  digInUserContent,
  formatFramingQA,
  formatLearner,
  framingAnswerUserContent,
  type AnswerMode,
  type LearnerSnapshot,
  type PromptTurn,
} from "@/lib/claude/prompts";
import type { FramingQuestion, FramingResponse } from "@/lib/types";

export type AnswerInput = {
  learner: LearnerSnapshot;
  /** Conversation turns BEFORE the message being answered (oldest first). */
  history: PromptTurn[];
  /** The user message being answered (for dig-in: the kickoff message). */
  message: string;
} & (
  | { mode: "lookup" | "skip" }
  | { mode: "framing"; questions: FramingQuestion[]; responses: FramingResponse[] }
  | {
      mode: "dig_in";
      item: { title: string; preview: string; appliedContext: string; conceptSlug: string | null };
      /** Turns from the conversation the item came from (may be empty). */
      sourceTurns: PromptTurn[];
    }
);

const MAX_HISTORY_TURNS = 12;
const MAX_TURN_CHARS = 4000;

/** Build the Messages API payload for an answer (exported for tests). */
export function buildAnswerRequest(input: AnswerInput): { system: string; messages: Anthropic.MessageParam[] } {
  const mode: AnswerMode = input.mode;
  let finalContent: string;
  switch (input.mode) {
    case "framing":
      finalContent = framingAnswerUserContent(input.message, formatFramingQA(input.questions, input.responses));
      break;
    case "dig_in":
      finalContent = digInUserContent({ kickoffMessage: input.message, item: input.item, sourceTurns: input.sourceTurns });
      break;
    default:
      finalContent = input.message;
  }

  const history = input.history.slice(-MAX_HISTORY_TURNS).filter((t) => t.text.trim());
  // The API requires the first message to be a user turn.
  while (history.length && history[0].role !== "user") history.shift();
  const messages: Anthropic.MessageParam[] = history.map((t) => ({
    role: t.role,
    content: t.text.length > MAX_TURN_CHARS ? `${t.text.slice(0, MAX_TURN_CHARS)}…` : t.text,
  }));
  messages.push({ role: "user", content: finalContent });

  return { system: answererSystem(mode, formatLearner(input.learner)), messages };
}

/**
 * Stream the answer as markdown text chunks. Stopping iteration (or aborting
 * `signal`) aborts the upstream Claude request (R3).
 */
export function streamAnswer(input: AnswerInput, signal?: AbortSignal): AsyncGenerator<string, void, undefined> {
  const { system, messages } = buildAnswerRequest(input);
  return streamText({
    model: MODELS.answerer,
    // Adaptive thinking (set explicitly in streamText) shares max_tokens with
    // the visible answer, so these leave generous room beyond a long answer
    // (~2–4k tokens). Streaming, so large values carry no timeout risk.
    maxTokens: input.mode === "lookup" ? 8000 : 16000,
    // Low/medium effort keeps thinking short and time-to-first-token
    // reasonable for chat.
    effort: input.mode === "lookup" ? "low" : "medium",
    system,
    messages,
    signal,
  });
}
