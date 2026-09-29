// Router + framing (A1, L1–L5, P5): one Haiku structured-output call.
// Claude gets a FLAT JSON schema (no discriminated union) — the reply is
// normalized and then parsed with RouterResultSchema (see schemas.ts).
import "server-only";
import { FRAMING, MODELS } from "@/config";
import { callStructured } from "@/lib/claude/client";
import { formatLearner, ROUTER_SYSTEM, routerUserPrompt, type LearnerSnapshot, type PromptTurn } from "@/lib/claude/prompts";
import { asksForDeliverable, explicitFraming, type ExplicitFraming } from "@/lib/pipeline/route-policy";
import { RouterResultSchema } from "@/lib/schemas";
import type { FramingQuestion, LearnLaterCallout, RouterResult } from "@/lib/types";

/** JSON schema for one Learn It Later callout (shared with the assessor). */
export const CALLOUT_JSON = {
  type: "object",
  properties: {
    title: { type: "string" },
    preview: { type: "string" },
    appliedContext: { type: "string" },
    conceptSlug: { type: "string" },
  },
  required: ["title", "preview", "appliedContext", "conceptSlug"],
  additionalProperties: false,
} as const;

export const ROUTER_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["concept", "lookup", "task"] },
    rationale: { type: "string" },
    closeCall: { type: "boolean" },
    conceptSlugs: { type: "array", items: { type: "string" } },
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
    skipCallout: { anyOf: [CALLOUT_JSON, { type: "null" }] },
    callouts: { type: "array", items: CALLOUT_JSON },
    whyCallout: { anyOf: [CALLOUT_JSON, { type: "null" }] },
  },
  required: ["kind", "rationale", "closeCall", "conceptSlugs", "framingQuestions", "skipCallout", "callouts", "whyCallout"],
  additionalProperties: false,
};

interface RawCallout {
  title?: unknown;
  preview?: unknown;
  appliedContext?: unknown;
  conceptSlug?: unknown;
}
interface RawRouter {
  kind?: unknown;
  rationale?: unknown;
  closeCall?: unknown;
  conceptSlugs?: unknown;
  framingQuestions?: { prompt?: unknown; format?: unknown; options?: unknown }[];
  skipCallout?: RawCallout | null;
  callouts?: RawCallout[];
  whyCallout?: RawCallout | null;
}

export function toSlug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const DONT_KNOW_OPTION = /^(i\s*do(n['’‘`]?|\s*no)t\s*know|not\s*sure|unsure|none of the above|no idea)\.?$/i;

export function normalizeCallout(raw: RawCallout | null | undefined): LearnLaterCallout | null {
  if (!raw) return null;
  const title = str(raw.title);
  const preview = str(raw.preview);
  const appliedContext = str(raw.appliedContext);
  if (!title || !preview || !appliedContext) return null;
  const slug = toSlug(str(raw.conceptSlug));
  return { title, preview, appliedContext, ...(slug ? { conceptSlug: slug } : {}) };
}

/** Same concept (by slug) or same title — the R13 dedupe would merge them anyway. */
function sameCallout(a: LearnLaterCallout, b: LearnLaterCallout): boolean {
  if (a.conceptSlug && b.conceptSlug) return a.conceptSlug === b.conceptSlug;
  return a.title.trim().toLowerCase() === b.title.trim().toLowerCase();
}

export function normalizeQuestions(raw: RawRouter["framingQuestions"]): FramingQuestion[] {
  const out: FramingQuestion[] = [];
  for (const q of raw ?? []) {
    const prompt = str(q?.prompt);
    if (!prompt) continue;
    let format: FramingQuestion["format"] =
      q?.format === "multiple_choice" || q?.format === "multi_select" ? q.format : "short_answer";
    const seen = new Set<string>();
    const options: string[] = [];
    for (const o of Array.isArray(q?.options) ? q.options : []) {
      const opt = str(o);
      if (!opt || DONT_KNOW_OPTION.test(opt) || seen.has(opt.toLowerCase())) continue;
      seen.add(opt.toLowerCase());
      options.push(opt);
    }
    if (format !== "short_answer" && options.length < 2) format = "short_answer";
    const id = `q${out.length + 1}`;
    out.push(format === "short_answer" ? { id, prompt, format } : { id, prompt, format, options });
    if (out.length >= FRAMING.maxQuestions) break;
  }
  return out;
}

/** At most this many ranked hidden-decision candidates are kept on the result (E2). */
export const MAX_CALLOUTS = 3;

/**
 * Flat model output → RouterResult (throws if unusable). Exported for tests.
 * `message` (the user message) is only used to pick the fallback kind when a
 * concept result has no usable framing.
 */
/** Stand-ins for an explicit "I want to learn" as the very first message: nothing for the model to build on. */
const EMPTY_QUESTION: FramingQuestion = {
  id: "q1",
  prompt: "What would you like to learn? Describe as much as you can: the topic, what it's for, and where you're starting from.",
  format: "short_answer",
};
const EMPTY_SKIP_CALLOUT: LearnLaterCallout = {
  title: "Getting started",
  preview:
    "Learning mode asks a question or two before answering, so the answer starts where you are. Say what you're working on and it builds from there.",
  appliedContext: "You asked to learn but haven't named a topic yet.",
};

export function normalizeRouterOutput(raw: unknown, message = "", explicit: ExplicitFraming | null = null): RouterResult {
  const r = (raw ?? {}) as RawRouter;
  const conceptSlugs = [
    ...new Set((Array.isArray(r.conceptSlugs) ? r.conceptSlugs : []).map((s) => toSlug(str(s))).filter(Boolean)),
  ].slice(0, 3);
  const rationale = str(r.rationale);
  const allCallouts = (r.callouts ?? []).map(normalizeCallout).filter((c): c is LearnLaterCallout => !!c);
  /** Ranked callouts, minus anything that repeats `lead` (or each other), capped. */
  const ranked = (lead: LearnLaterCallout | null) => {
    const out: LearnLaterCallout[] = [];
    for (const c of allCallouts) {
      if (lead && sameCallout(c, lead)) continue;
      if (out.some((o) => sameCallout(o, c))) continue;
      out.push(c);
    }
    return out.slice(0, MAX_CALLOUTS);
  };

  if (r.kind === "concept") {
    // A close call between concept and lookup is framed with exactly one
    // question: enough to engage the learner, not a quiz. Enforced here even
    // if the model wrote more.
    // An explicit request to learn fixes the tier: no topic in the message →
    // one question (a close call); a topic named → the full 2–3 question framing.
    const closeCall = explicit ? explicit !== "topic" : r.closeCall === true;
    let framingQuestions = normalizeQuestions(r.framingQuestions).slice(0, closeCall ? 1 : FRAMING.maxQuestions);
    let skipCallout = normalizeCallout(r.skipCallout);
    if (explicit === "empty") {
      if (framingQuestions.length === 0) framingQuestions = [EMPTY_QUESTION];
      skipCallout ??= EMPTY_SKIP_CALLOUT;
    }
    if (framingQuestions.length >= FRAMING.minQuestions && skipCallout) {
      return RouterResultSchema.parse({
        kind: "concept",
        conceptSlugs,
        rationale: closeCall ? `${rationale} [close call: 1 question]` : rationale,
        framingQuestions,
        skipCallout,
        ...(closeCall ? { closeCall } : {}),
      });
    }
    // Unusable framing → answer now so the user still gets an answer: a task
    // if the message asks for a deliverable, else a lookup. The skipCallout
    // (if any) leads the ranked callouts.
    const callouts = skipCallout ? [skipCallout, ...ranked(skipCallout)] : ranked(null);
    const degraded = `${rationale} [degraded: no usable framing]`;
    return RouterResultSchema.parse(
      asksForDeliverable(message)
        ? { kind: "task", conceptSlugs, rationale: degraded, callouts, whyCallout: null }
        : { kind: "lookup", conceptSlugs, rationale: degraded, callouts },
    );
  }
  // A task or lookup may carry ONE framing question (vague or parroted request).
  const single = normalizeQuestions(r.framingQuestions).slice(0, 1);
  const framing = single.length ? { framingQuestions: single } : {};
  if (r.kind === "lookup") {
    return RouterResultSchema.parse({ kind: "lookup", conceptSlugs, rationale, callouts: ranked(null), ...framing });
  }
  if (r.kind === "task") {
    const whyCallout = normalizeCallout(r.whyCallout);
    // Drop hidden-decision callouts that repeat the why card BEFORE capping.
    return RouterResultSchema.parse({
      kind: "task",
      conceptSlugs,
      rationale,
      callouts: ranked(whyCallout),
      whyCallout,
      ...framing,
    });
  }
  throw new Error("router: missing kind");
}

export interface RouteInput {
  message: string;
  /** Recent turns BEFORE the new message (oldest first). */
  turns: PromptTurn[];
  learner: LearnerSnapshot;
  catalog: { slug: string; name: string }[];
  /** False while the framing timer is running: a task/lookup must not carry a framing question. */
  taskFramingOpen: boolean;
}

/**
 * Classify the message and (for concepts) write framing questions. Never
 * throws for model problems: on failure it falls back to a plain lookup so
 * the user still gets an answer (logged).
 */
export const ROUTER_TIMEOUT_MS = 15_000;

export async function routeMessage(input: RouteInput, signal?: AbortSignal): Promise<RouterResult> {
  const timeout = AbortSignal.timeout(ROUTER_TIMEOUT_MS);
  const callSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const explicit = explicitFraming(input.message, input.turns);
  // First message, just "I want to learn": nothing to build on, so skip the
  // model and ask the learner to describe what they want to learn.
  if (explicit === "empty") {
    return normalizeRouterOutput(
      { kind: "concept", rationale: "explicit learning request with no topic or history: ask the learner to describe it" },
      input.message,
      explicit,
    );
  }
  const call = (retry: boolean) =>
    callStructured({
      label: retry ? "router-explicit-retry" : "router",
      model: MODELS.router,
      maxTokens: 2000,
      system: ROUTER_SYSTEM,
      messages: [
        {
          role: "user",
          content:
            routerUserPrompt({
              message: input.message,
              turns: input.turns.slice(-6),
              learnerText: formatLearner(input.learner),
              catalog: input.catalog,
              taskFramingOpen: input.taskFramingOpen,
              explicit,
            }) +
            (retry
              ? '\nThe learner explicitly asked to learn, so kind MUST be "concept": follow the explicit learning requests section.'
              : ""),
        },
      ],
      jsonSchema: ROUTER_JSON_SCHEMA,
      parse: (raw) => normalizeRouterOutput(raw, input.message, explicit),
      signal: callSignal,
    });
  try {
    const first = await call(false);
    // The learner asked to learn but the model answered task/lookup (or its
    // framing was unusable): ask once more with the kind pinned.
    if (explicit && first.kind !== "concept") {
      try {
        const second = await call(true);
        if (second.kind === "concept") return second;
      } catch (err) {
        if (signal?.aborted) throw err;
      }
    }
    return first;
  } catch (err) {
    // Only a request abort (client disconnect) propagates; a timeout or any
    // model/API failure degrades to a plain lookup.
    if (signal?.aborted) throw err;
    console.error(`[router] failed${timeout.aborted ? " (timeout)" : ""}; falling back to lookup:`, err);
    return { kind: "lookup", conceptSlugs: [], rationale: "router failed — fallback", callouts: [] };
  }
}
