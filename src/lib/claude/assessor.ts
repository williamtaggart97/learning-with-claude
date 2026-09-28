// Assessor (A3): background Haiku call with a strict JSON schema, parsed with
// AssessorResultSchema. Pure model call — persistence lives in
// src/lib/pipeline/assess.ts. Server-only.
import "server-only";
import { MODELS } from "@/config";
import { callStructured } from "@/lib/claude/client";
import { CALLOUT_JSON, normalizeCallout, toSlug } from "@/lib/claude/router";
import { ASSESSOR_SYSTEM, assessorUserPrompt, type AssessorPromptInput } from "@/lib/claude/prompts";
import { AssessorResultSchema } from "@/lib/schemas";
import type { AssessorResult, LearnLaterCallout } from "@/lib/types";

/** Hard cap per exchange, whatever the model says (calibration guard). */
export const MAX_MASTERY_DELTA = 0.35;
/** At most this many concepts are assessed per exchange. */
export const MAX_ASSESSED_CONCEPTS = 3;

export const ASSESSOR_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    concepts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          slug: { type: "string" },
          name: { type: "string" },
          domain: { type: "string" },
          masteryDelta: { type: "number" },
          evidence: { type: "string" },
        },
        required: ["slug", "name", "domain", "masteryDelta", "evidence"],
        additionalProperties: false,
      },
    },
    styleSignals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          dimension: { type: "string", enum: ["intuitionVsFormal", "briefVsThorough", "entryPoint"] },
          axisValue: { type: "number" },
          entryPoint: { type: "string", enum: ["code", "concept", "worked_example", ""] },
          evidence: { type: "string" },
        },
        required: ["dimension", "axisValue", "entryPoint", "evidence"],
        additionalProperties: false,
      },
    },
    userContext: {
      type: "object",
      properties: {
        field: { type: "string" },
        projects: { type: "array", items: { type: "string" } },
        dataTypes: { type: "array", items: { type: "string" } },
      },
      required: ["field", "projects", "dataTypes"],
      additionalProperties: false,
    },
    learnLaterItems: { type: "array", items: CALLOUT_JSON },
  },
  required: ["concepts", "styleSignals", "userContext", "learnLaterItems"],
  additionalProperties: false,
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const strList = (v: unknown) =>
  (Array.isArray(v) ? v : []).map(str).filter((s) => s.length > 0 && s.length <= 120);

/** Flat model output → AssessorResult (exported for tests). Drops malformed entries. */
export function normalizeAssessorOutput(raw: unknown): AssessorResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const concepts = (Array.isArray(r.concepts) ? r.concepts : [])
    .map((c: Record<string, unknown>) => {
      const slug = toSlug(str(c?.slug));
      const name = str(c?.name);
      const evidence = str(c?.evidence);
      const delta = typeof c?.masteryDelta === "number" && Number.isFinite(c.masteryDelta) ? c.masteryDelta : 0;
      if (!slug || !name || !evidence) return null;
      const domain = str(c?.domain);
      return {
        slug,
        name,
        ...(domain ? { domain } : {}),
        masteryDelta: clamp(delta, -MAX_MASTERY_DELTA, MAX_MASTERY_DELTA),
        evidence,
      };
    })
    .filter((c) => c !== null)
    .filter((c, i, all) => all.findIndex((o) => o.slug === c.slug) === i)
    .slice(0, MAX_ASSESSED_CONCEPTS);

  const styleSignals = (Array.isArray(r.styleSignals) ? r.styleSignals : [])
    .map((s: Record<string, unknown>) => {
      const evidence = str(s?.evidence);
      if (!evidence) return null;
      if (s?.dimension === "entryPoint") {
        const ep = s.entryPoint;
        return ep === "code" || ep === "concept" || ep === "worked_example"
          ? { dimension: "entryPoint" as const, value: ep, evidence }
          : null;
      }
      if (s?.dimension === "intuitionVsFormal" || s?.dimension === "briefVsThorough") {
        const v = typeof s.axisValue === "number" && Number.isFinite(s.axisValue) ? clamp(s.axisValue, -1, 1) : null;
        return v === null ? null : { dimension: s.dimension, value: v, evidence };
      }
      return null;
    })
    .filter((s) => s !== null);

  const uc = (r.userContext ?? {}) as Record<string, unknown>;
  const field = str(uc.field);
  const projects = strList(uc.projects);
  const dataTypes = strList(uc.dataTypes);

  const learnLaterItems = (Array.isArray(r.learnLaterItems) ? r.learnLaterItems : [])
    .map(normalizeCallout)
    .filter((c): c is LearnLaterCallout => !!c)
    // Never queue the topic that was just taught.
    .filter((c) => !c.conceptSlug || !concepts.some((k) => k.slug === c.conceptSlug))
    .slice(0, 1);

  return AssessorResultSchema.parse({
    concepts,
    styleSignals,
    userContext: {
      ...(field ? { field } : {}),
      ...(projects.length ? { projects } : {}),
      ...(dataTypes.length ? { dataTypes } : {}),
    },
    learnLaterItems,
  });
}

export async function assessExchange(input: AssessorPromptInput, signal?: AbortSignal): Promise<AssessorResult> {
  return callStructured({
    label: "assessor",
    model: MODELS.assessor,
    maxTokens: 2500,
    system: ASSESSOR_SYSTEM,
    messages: [{ role: "user", content: assessorUserPrompt(input) }],
    jsonSchema: ASSESSOR_JSON_SCHEMA,
    parse: normalizeAssessorOutput,
    signal,
  });
}
