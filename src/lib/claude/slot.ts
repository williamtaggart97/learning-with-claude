// End-of-answer slot model calls (E1): variant content (B/C/D copy, the C
// quick check) and walk-through framing questions (B, after the answer).
// Haiku, structured output. Server-only.
import "server-only";
import { FRAMING, MODELS } from "@/config";
import { callStructured } from "@/lib/claude/client";
import {
  formatLearner,
  slotContentSystem,
  slotContentUserPrompt,
  walkthroughUserPrompt,
  WALKTHROUGH_SYSTEM,
  type LearnerSnapshot,
  type PromptTurn,
  type SlotContentVariant,
  type SlotItemPrompt,
} from "@/lib/claude/prompts";
import { normalizeQuestions } from "@/lib/claude/router";
import { QuickCheckPayloadSchema, SlotCopySchema } from "@/lib/schemas";
import type { FramingQuestion, SlotCopy } from "@/lib/types";
import type { z } from "zod";

export type QuickCheckPayload = z.infer<typeof QuickCheckPayloadSchema>;

/** Fixed button text for variant B (canvas copy). */
export const WALKTHROUGH_BUTTON_LABEL = "Walk me through it";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const DONT_KNOW_OPTION = /^(i\s*do(n['’‘`]?|\s*no)t\s*know|not\s*sure|unsure|none of the above|no idea)\.?$/i;

const COPY_JSON = {
  walkthrough: {
    type: "object",
    properties: { headline: { type: "string" }, subline: { type: "string" } },
    required: ["headline", "subline"],
    additionalProperties: false,
  },
  apply: {
    type: "object",
    properties: { headline: { type: "string" }, subline: { type: "string" }, buttonLabel: { type: "string" } },
    required: ["headline", "subline", "buttonLabel"],
    additionalProperties: false,
  },
  quickcheck: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      options: { type: "array", items: { type: "string" } },
      correctIndex: { type: "integer" },
      explanation: { type: "string" },
    },
    required: ["prompt", "options", "correctIndex", "explanation"],
    additionalProperties: false,
  },
} as const satisfies Record<SlotContentVariant, Record<string, unknown>>;

export type SlotContent =
  | { variant: "walkthrough"; copy: SlotCopy }
  | { variant: "apply"; copy: SlotCopy }
  | { variant: "quickcheck"; quickcheck: QuickCheckPayload };

/** Fisher–Yates with an injectable RNG (models put the right answer first too often). */
export function shuffleQuickCheck(q: QuickCheckPayload, rng: () => number = Math.random): QuickCheckPayload {
  const order = q.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { ...q, options: order.map((i) => q.options[i]), correctIndex: order.indexOf(q.correctIndex) };
}

/** Model output → SlotContent (throws if unusable). Exported for tests. */
export function normalizeSlotContent(variant: SlotContentVariant, raw: unknown, rng: () => number = Math.random): SlotContent {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (variant === "quickcheck") {
    const all = Array.isArray(r.options) ? r.options.map(str) : [];
    const correctIndex = typeof r.correctIndex === "number" ? r.correctIndex : -1;
    const correct = Number.isInteger(correctIndex) ? all[correctIndex] : undefined;
    if (!correct) throw new Error("quickcheck: correct option missing");
    // Drop blanks, case-insensitive duplicates and "I don't know"-style
    // distractors (the UI adds its own). The correct option is ALWAYS kept,
    // even if it looks like one of those, and always survives the cap of 4.
    const key = (s: string) => s.toLowerCase();
    const correctKey = key(correct);
    const deduped: string[] = [];
    for (const o of all) {
      if (!o || deduped.some((x) => key(x) === key(o))) continue;
      if (key(o) !== correctKey && DONT_KNOW_OPTION.test(o)) continue;
      deduped.push(o);
    }
    let options = deduped.slice(0, 4);
    if (!options.some((o) => key(o) === correctKey)) {
      options = [...deduped.slice(0, 3), deduped.find((o) => key(o) === correctKey)!];
    }
    const q = QuickCheckPayloadSchema.parse({
      prompt: str(r.prompt),
      options,
      correctIndex: options.findIndex((o) => key(o) === correctKey),
      explanation: str(r.explanation),
    });
    return { variant, quickcheck: shuffleQuickCheck(q, rng) };
  }
  const copy = SlotCopySchema.parse({
    headline: str(r.headline),
    subline: str(r.subline),
    buttonLabel: variant === "walkthrough" ? WALKTHROUGH_BUTTON_LABEL : str(r.buttonLabel),
  });
  return { variant, copy };
}

export interface SlotContentInput {
  item: SlotItemPrompt;
  message: string;
  learner: LearnerSnapshot;
  turns: PromptTurn[];
}

const SLOT_CONTENT_TIMEOUT_MS = 20_000;

/**
 * Generate the payload for a drawn variant. Runs IN PARALLEL with the answer
 * stream (no added latency); the pipeline falls back to the card (A) if it
 * isn't ready in time or fails. Throws on failure.
 */
export async function generateSlotContent(
  variant: SlotContentVariant,
  input: SlotContentInput,
  signal?: AbortSignal,
): Promise<SlotContent> {
  const timeout = AbortSignal.timeout(SLOT_CONTENT_TIMEOUT_MS);
  return callStructured({
    label: `slot:${variant}`,
    model: MODELS.slot,
    maxTokens: 800,
    system: slotContentSystem(variant),
    messages: [
      {
        role: "user",
        content: slotContentUserPrompt({
          item: input.item,
          message: input.message,
          learnerText: formatLearner(input.learner),
          turns: input.turns.slice(-4),
        }),
      },
    ],
    jsonSchema: COPY_JSON[variant],
    parse: (raw) => normalizeSlotContent(variant, raw),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
}

const WALKTHROUGH_JSON: Record<string, unknown> = {
  type: "object",
  properties: {
    framingQuestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          format: { type: "string", enum: ["short_answer", "multiple_choice", "multi_select"] },
          options: { type: "array", items: { type: "string" } },
        },
        required: ["prompt", "format", "options"],
        additionalProperties: false,
      },
    },
  },
  required: ["framingQuestions"],
  additionalProperties: false,
};

/**
 * Variant B: framing questions on the featured concept, after the answer.
 * Same rules as the router's framing (FRAMING_QUESTION_RULES; L1–L3, P5).
 * Throws if no usable questions come back.
 */
export async function generateWalkthroughQuestions(
  input: { item: SlotItemPrompt; learner: LearnerSnapshot; turns: PromptTurn[] },
  signal?: AbortSignal,
): Promise<FramingQuestion[]> {
  const timeout = AbortSignal.timeout(20_000);
  return callStructured({
    label: "slot:walkthrough-framing",
    model: MODELS.slot,
    maxTokens: 1200,
    system: WALKTHROUGH_SYSTEM,
    messages: [
      {
        role: "user",
        content: walkthroughUserPrompt({ item: input.item, learnerText: formatLearner(input.learner), turns: input.turns.slice(-6) }),
      },
    ],
    jsonSchema: WALKTHROUGH_JSON,
    parse: (raw) => {
      const qs = normalizeQuestions((raw as { framingQuestions?: [] } | null)?.framingQuestions);
      if (qs.length < FRAMING.minQuestions) throw new Error("walkthrough: no usable framing questions");
      return qs;
    },
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
}
