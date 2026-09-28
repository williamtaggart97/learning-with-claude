// End-of-answer slot model calls (E1): variant content (B/C/D copy, the C
// quick check) and walk-through framing questions (B, after the answer).
// Haiku, structured output. Server-only.
import "server-only";
import { FRAMING, MODELS } from "@/config";
import { callStructured } from "@/lib/claude/client";
import {
  formatLearner,
  formatSlotLearner,
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

// ─── Copy guards (walkthrough / apply) ──────────────────────────────────────

const STOPWORDS = new Set(
  (
    "a an the and or but if then than so to of in on at by for from with without into onto about over under " +
    "is are was were be been being am do does did done doing have has had having can could would should will shall may might must " +
    "i me my we us our you your yours it its this that these those there here what which who whom whose why how when where " +
    "not no yes just more most much many some any all each every very really also only even still too " +
    "want wants see seeing look looking let lets get gets make makes take takes use using used work works working " +
    "matter matters mattering quick quickly now next same new way ways thing things something " +
    "check apply applies applied project projects model models data dataset analysis result results case cases walk through"
  ).split(" "),
);

const SUFFIXES = ["ational", "ation", "ities", "ions", "ings", "ment", "ness", "ity", "ion", "ing", "ies", "ied", "age", "ed", "es", "ly", "al", "s", "e"];

/** Crude suffix-stripping stemmer: enough to match "leak"/"leakage", "impute"/"imputation". */
export function stemWord(w: string): string {
  for (const suf of SUFFIXES) {
    if (suf === "s" && w.endsWith("ss")) continue;
    if (w.length - suf.length >= 3 && w.endsWith(suf)) {
      return suf === "ies" || suf === "ied" ? `${w.slice(0, -3)}y` : w.slice(0, -suf.length);
    }
  }
  return w;
}

/** Stemmed content words (lowercase, stopwords and words under 3 letters removed). */
export function contentWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length >= 3 && !STOPWORDS.has(w)).map(stemWord);
}

function stemsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 3 && long.startsWith(short);
}

/** Does the headline share at least one content word with the item's title, slug or preview? */
export function headlineAboutItem(headline: string, item: Pick<SlotItemPrompt, "title" | "conceptSlug" | "preview">): boolean {
  const target = contentWords(`${item.title} ${item.conceptSlug ?? ""} ${item.preview}`);
  return contentWords(headline).some((w) => target.some((t) => stemsMatch(w, t)));
}

/** Claude can't run code or see the user's data: apply copy must not promise it (R18). */
const OVERPROMISE = /\b(re)?(comput\w*|calculat\w*|run|runs|running|execut\w*)\b/i;
export const APPLY_FALLBACK_BUTTON = "Show me how";

const shortTitle = (t: string) => (t.length > 90 ? `${t.slice(0, 89)}…` : t);

/**
 * Template headline used when the model's headline drifted to another concept.
 * The title leads so its capitalization stays right ("Probability calibration:
 * …" rather than "why Probability calibration matters").
 */
export function fallbackHeadline(variant: "walkthrough" | "apply", title: string): string {
  return variant === "walkthrough"
    ? `${shortTitle(title)}: want to see why it matters here?`
    : `${shortTitle(title)}: see how it applies to your project`;
}

/** Model output → SlotContent (throws if unusable). Exported for tests. */
export function normalizeSlotContent(
  variant: SlotContentVariant,
  raw: unknown,
  rng: () => number = Math.random,
  item?: Pick<SlotItemPrompt, "title" | "conceptSlug" | "preview">,
): SlotContent {
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
  let headline = str(r.headline);
  let subline = str(r.subline);
  let buttonLabel = variant === "walkthrough" ? WALKTHROUGH_BUTTON_LABEL : str(r.buttonLabel);
  if (item && headline && !headlineAboutItem(headline, item)) headline = fallbackHeadline(variant, item.title);
  if (variant === "apply") {
    if (buttonLabel && OVERPROMISE.test(buttonLabel)) buttonLabel = APPLY_FALLBACK_BUTTON;
    if (item && headline && OVERPROMISE.test(headline)) headline = fallbackHeadline("apply", item.title);
    if (subline && OVERPROMISE.test(subline)) {
      subline = item ? `We'll walk through how ${shortTitle(item.title)} applies to your work.` : "We'll walk through how it applies to your work.";
    }
  }
  const copy = SlotCopySchema.parse({ headline, subline, buttonLabel });
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
          learnerText: formatSlotLearner(input.learner, input.item.conceptSlug),
          turns: input.turns.slice(-4),
        }),
      },
    ],
    jsonSchema: COPY_JSON[variant],
    parse: (raw) => normalizeSlotContent(variant, raw, Math.random, input.item),
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
