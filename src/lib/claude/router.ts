// Router + framing (A1, L1–L5, P5): one Haiku structured-output call.
// Claude gets a FLAT JSON schema (no discriminated union) — the reply is
// normalized and then parsed with RouterResultSchema (see schemas.ts).
import "server-only";
import { FRAMING, MODELS } from "@/config";
import { callStructured } from "@/lib/claude/client";
import { formatLearner, ROUTER_SYSTEM, routerUserPrompt, type LearnerSnapshot, type PromptTurn } from "@/lib/claude/prompts";
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
    kind: { type: "string", enum: ["concept", "lookup"] },
    rationale: { type: "string" },
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
  },
  required: ["kind", "rationale", "conceptSlugs", "framingQuestions", "skipCallout", "callouts"],
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
  conceptSlugs?: unknown;
  framingQuestions?: { prompt?: unknown; format?: unknown; options?: unknown }[];
  skipCallout?: RawCallout | null;
  callouts?: RawCallout[];
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

/** Flat model output → RouterResult (throws if unusable). Exported for tests. */
export function normalizeRouterOutput(raw: unknown): RouterResult {
  const r = (raw ?? {}) as RawRouter;
  const conceptSlugs = [
    ...new Set((Array.isArray(r.conceptSlugs) ? r.conceptSlugs : []).map((s) => toSlug(str(s))).filter(Boolean)),
  ].slice(0, 3);
  const rationale = str(r.rationale);
  const callouts = (r.callouts ?? []).map(normalizeCallout).filter((c): c is LearnLaterCallout => !!c).slice(0, 2);

  if (r.kind === "concept") {
    const framingQuestions = normalizeQuestions(r.framingQuestions);
    const skipCallout = normalizeCallout(r.skipCallout);
    if (framingQuestions.length >= FRAMING.minQuestions && skipCallout) {
      return RouterResultSchema.parse({ kind: "concept", conceptSlugs, rationale, framingQuestions, skipCallout });
    }
    // Unusable framing → degrade to a lookup so the user still gets an answer.
    return RouterResultSchema.parse({
      kind: "lookup",
      conceptSlugs,
      rationale: `${rationale} [degraded: no usable framing]`,
      callouts: skipCallout ? [skipCallout] : callouts,
    });
  }
  if (r.kind === "lookup") {
    return RouterResultSchema.parse({ kind: "lookup", conceptSlugs, rationale, callouts });
  }
  throw new Error("router: missing kind");
}

export interface RouteInput {
  message: string;
  /** Recent turns BEFORE the new message (oldest first). */
  turns: PromptTurn[];
  learner: LearnerSnapshot;
  catalog: { slug: string; name: string }[];
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
  try {
    return await callStructured({
      label: "router",
      model: MODELS.router,
      maxTokens: 2000,
      system: ROUTER_SYSTEM,
      messages: [
        {
          role: "user",
          content: routerUserPrompt({
            message: input.message,
            turns: input.turns.slice(-6),
            learnerText: formatLearner(input.learner),
            catalog: input.catalog,
          }),
        },
      ],
      jsonSchema: ROUTER_JSON_SCHEMA,
      parse: normalizeRouterOutput,
      signal: callSignal,
    });
  } catch (err) {
    // Only a request abort (client disconnect) propagates; a timeout or any
    // model/API failure degrades to a plain lookup.
    if (signal?.aborted) throw err;
    console.error(`[router] failed${timeout.aborted ? " (timeout)" : ""}; falling back to lookup:`, err);
    return { kind: "lookup", conceptSlugs: [], rationale: "router failed — fallback", callouts: [] };
  }
}
