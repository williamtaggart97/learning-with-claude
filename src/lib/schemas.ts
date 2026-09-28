// Zod schemas for every shape that crosses a trust boundary:
//   - Claude structured outputs (router, assessor) — validate before use
//   - API request bodies — validate in route handlers
//   - JSON columns in Postgres (questions, responses, evidence)
// Static types are inferred from these in src/lib/types.ts. Zod v4.
// Enum schemas are built from the Prisma-generated enums module, which is a
// dependency-free, client-safe file ("You can import this file directly").
import { z } from "zod";
import { FRAMING } from "@/config";
import { EntryPoint, LearnLaterStatus, PersonaKey } from "@/generated/prisma/enums";

// ─── Primitives ─────────────────────────────────────────────────────────────

export const PersonaKeySchema = z.enum(PersonaKey);

export const EntryPointSchema = z.enum(EntryPoint);

/** A value on a bipolar style axis. -1 = left pole, +1 = right pole. */
export const StyleAxisValueSchema = z.number().min(-1).max(1);

/** kebab-case concept slug, e.g. "welch-t-test". */
export const ConceptSlugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be kebab-case");

// ─── Framing (L1–L3) ────────────────────────────────────────────────────────

export const FramingQuestionFormatSchema = z.enum([
  "short_answer",
  "multiple_choice",
  "multi_select",
]);

/**
 * One framing question. "I don't know" is ALWAYS offered by the UI and must
 * NOT appear in `options`. `options` is required (2+) for multiple_choice /
 * multi_select and omitted for short_answer.
 */
export const FramingQuestionSchema = z
  .object({
    /** Stable within the exchange, e.g. "q1". */
    id: z.string().min(1),
    prompt: z.string().min(1),
    format: FramingQuestionFormatSchema,
    options: z.array(z.string().min(1)).optional(),
  })
  .refine(
    (q) =>
      q.format === "short_answer"
        ? !q.options || q.options.length === 0
        : !!q.options && q.options.length >= 2,
    { message: "options required (2+) for choice formats, absent for short_answer" },
  );

/**
 * The user's response to one question.
 *  - short_answer / multiple_choice: answer is a string
 *  - multi_select: answer is string[]
 *  - dontKnow = true: answer is null (and only then)
 * Shape-only. The framing-answer route additionally validates responses
 * against the STORED questions (see api-contract.ts, "Framing responses").
 */
export const FramingResponseSchema = z
  .object({
    questionId: z.string().min(1),
    answer: z.union([z.string(), z.array(z.string())]).nullable(),
    dontKnow: z.boolean(),
  })
  .refine((r) => (r.dontKnow ? r.answer === null : r.answer !== null), {
    message: "answer must be null when dontKnow is true, and non-null otherwise",
  });

export const FramingQuestionsSchema = z
  .array(FramingQuestionSchema)
  .min(FRAMING.minQuestions)
  .max(FRAMING.maxQuestions);

// ─── Learn It Later callout (L5, Q3) ────────────────────────────────────────

export const LearnLaterCalloutSchema = z.object({
  /** Short name of the hidden decision/concept, e.g. "Which t-test?" */
  title: z.string().min(1),
  /** 1–3 sentence explanation shown on the card. */
  preview: z.string().min(1),
  /** How it applied to what the user was doing. */
  appliedContext: z.string().min(1),
  conceptSlug: ConceptSlugSchema.optional(),
});

// ─── Router (A1) ────────────────────────────────────────────────────────────

/**
 * Single Haiku call: classify concept | lookup | task + (for concepts) write
 * framing questions. Lean toward "concept" only when choosing between concept
 * and lookup; deliverables and deadline messages are never framed (L4, L8).
 * Framing happens at most once per topic per conversation (L9, enforced in
 * the pipeline). Discriminated on `kind`.
 * (If the structured-output JSON schema needs to be flat, 2b may send a flat
 * variant to Claude but must still parse the reply with this schema.)
 */
const RouterCommon = {
  /** Concepts the message touches (existing catalog slugs or new ones). */
  conceptSlugs: z.array(ConceptSlugSchema),
  /** One sentence; for logs/debugging, never shown to the user. */
  rationale: z.string(),
};

export const ConceptRouterResultSchema = z.object({
  kind: z.literal("concept"),
  ...RouterCommon,
  /** 1–3 framing questions. */
  framingQuestions: FramingQuestionsSchema,
  /**
   * The Learn It Later card queued (origin "skipped") if the user chooses
   * "just answer". Stored on FramingExchange.skipCallout.
   */
  skipCallout: LearnLaterCalloutSchema,
});

export const LookupRouterResultSchema = z.object({
  kind: z.literal("lookup"),
  ...RouterCommon,
  /**
   * Hidden-decision candidates (up to 3), ranked most consequential first
   * (L5, E2). The slot experiment features ONE of them and saves only that
   * one (E3) — see src/lib/slot/policy.ts.
   */
  callouts: z.array(LearnLaterCalloutSchema).optional(),
});

export const TaskRouterResultSchema = z.object({
  kind: z.literal("task"),
  ...RouterCommon,
  /**
   * Hidden decisions behind the work product (L5, L8), ranked most
   * consequential first, like lookup callouts.
   */
  callouts: z.array(LearnLaterCalloutSchema).optional(),
  /**
   * "Why this happened" card (L8): set only when the task stems from a real
   * misconception (e.g. leakage, perfect separation), never for a typo or an
   * environment problem, and only when the message reports a problem with
   * the user's own work (also guarded in code by planRoute). When present it
   * is always the featured, saved item (L5, L8) — never part of the E2 draw.
   */
  whyCallout: LearnLaterCalloutSchema.nullable(),
});

export const RouterResultSchema = z.discriminatedUnion("kind", [
  ConceptRouterResultSchema,
  LookupRouterResultSchema,
  TaskRouterResultSchema,
]);

// ─── Assessor (A3) ──────────────────────────────────────────────────────────

export const AssessedConceptSchema = z.object({
  slug: ConceptSlugSchema,
  name: z.string().min(1),
  /** Optional grouping for new catalog entries, e.g. "hypothesis testing". */
  domain: z.string().optional(),
  /** Change to mastery score (score is clamped to 0..1 when applied). */
  masteryDelta: z.number().min(-1).max(1),
  /** Why — shown in the profile as "why Claude thinks this" (P1). */
  evidence: z.string().min(1),
});

/**
 * A learning-style signal (P2). For the bipolar axes `value` is where this
 * exchange points (-1..1, see sign conventions in types.ts); for entryPoint
 * it is the preferred entry point.
 */
export const StyleSignalSchema = z.discriminatedUnion("dimension", [
  z.object({
    dimension: z.literal("intuitionVsFormal"),
    value: StyleAxisValueSchema,
    evidence: z.string().min(1),
  }),
  z.object({
    dimension: z.literal("briefVsThorough"),
    value: StyleAxisValueSchema,
    evidence: z.string().min(1),
  }),
  z.object({
    dimension: z.literal("entryPoint"),
    value: EntryPointSchema,
    evidence: z.string().min(1),
  }),
]);

/** Newly inferred context; omitted fields mean "nothing new". Projects/dataTypes are additive. */
export const AssessedUserContextSchema = z.object({
  field: z.string().optional(),
  projects: z.array(z.string()).optional(),
  dataTypes: z.array(z.string()).optional(),
});

export const AssessorResultSchema = z.object({
  concepts: z.array(AssessedConceptSchema),
  styleSignals: z.array(StyleSignalSchema),
  userContext: AssessedUserContextSchema,
  learnLaterItems: z.array(LearnLaterCalloutSchema),
});

// ─── JSON column payloads ───────────────────────────────────────────────────

/** ConceptMastery.evidence[] */
export const MasteryEvidenceSchema = z.object({
  note: z.string(),
  delta: z.number(),
  messageId: z.string().optional(),
  /** ISO-8601 timestamp */
  at: z.string(),
  /**
   * Where the evidence came from when it isn't the assessor. "quickcheck" =
   * an end-of-answer quick check (R17); the E5 mastery metric excludes it so
   * the quick-check arm doesn't get credit for its own measurement.
   */
  source: z.enum(["quickcheck"]).optional(),
});

/** LearningStyle.evidence[] */
export const StyleEvidenceSchema = z.object({
  dimension: z.enum(["intuitionVsFormal", "entryPoint", "briefVsThorough"]),
  note: z.string(),
  messageId: z.string().optional(),
  at: z.string(),
});

// ─── API request bodies ─────────────────────────────────────────────────────

/**
 * POST /api/chat. There is no dig-in flag: the route detects a dig-in
 * kickoff SERVER-SIDE (conversation.origin = "dig_in" and it has zero
 * assistant messages) and then bypasses the router — see api-contract.ts.
 */
export const ChatRequestSchema = z.object({
  /** Omit to start a new conversation. */
  conversationId: z.string().optional(),
  message: z.string().trim().min(1).max(8000),
});

export const FramingAnswerRequestSchema = z.object({
  /** One per question (use dontKnow for unanswered ones). */
  responses: z.array(FramingResponseSchema),
  /**
   * "Just answer" — skip framing. Exchange becomes status = skipped, does
   * not count toward progress, and the exchange's stored skipCallout is
   * queued to Learn It Later with origin = skipped (Q1). `responses` is
   * ignored (may be empty).
   */
  skip: z.boolean().optional(),
});

/** The three style dimensions (P2), keyed as in LearningStyleDTO. */
export const StyleDimensionSchema = z.enum(["intuitionVsFormal", "entryPoint", "briefVsThorough"]);

/**
 * PATCH /api/profile — Tier 2 only. Omitted fields are unchanged.
 * `resetLearningStyle` hands dimensions back to Claude ("Reset to Claude's
 * estimate"; see applyStylePatch in src/lib/style-patch.ts). An explicit list
 * rather than `null` values, because `entryPoint: null` already means "no
 * preference". A dimension can't be both set and reset in one patch (400).
 */
export const ProfilePatchSchema = z
  .object({
    learningStyle: z
      .object({
        intuitionVsFormal: StyleAxisValueSchema.optional(),
        entryPoint: EntryPointSchema.nullable().optional(),
        briefVsThorough: StyleAxisValueSchema.optional(),
      })
      .optional(),
    resetLearningStyle: z.array(StyleDimensionSchema).max(3).optional(),
    userContext: z
      .object({
        field: z.string().nullable().optional(),
        projects: z.array(z.string()).optional(),
        dataTypes: z.array(z.string()).optional(),
        notes: z.string().nullable().optional(),
      })
      .optional(),
  })
  .refine((p) => !(p.resetLearningStyle ?? []).some((d) => p.learningStyle?.[d] !== undefined), {
    message: "A style dimension can't be set and reset in the same patch",
    path: ["resetLearningStyle"],
  });

export const LearnLaterPatchSchema = z.object({
  status: z.enum([LearnLaterStatus.queued, LearnLaterStatus.dismissed]),
});

export const PersonaSwitchRequestSchema = z.object({
  personaKey: PersonaKeySchema,
});

export const PasscodeRequestSchema = z.object({
  passcode: z.string().min(1).max(200),
});

// ─── End-of-answer slot (E1–E5) ─────────────────────────────────────────────

/**
 * POST /api/slot/[impressionId]/quickcheck — answer the one-question quick
 * check (C). Exactly one of: selectedIndex (an option index) or dontKnow.
 */
export const QuickCheckAnswerRequestSchema = z
  .object({
    selectedIndex: z.number().int().min(0).max(9).nullable(),
    dontKnow: z.boolean(),
  })
  .refine((r) => (r.dontKnow ? r.selectedIndex === null : r.selectedIndex !== null), {
    message: "selectedIndex must be null when dontKnow is true, and set otherwise",
  });

/** Copy for the walk-through (B) / apply-it (D) boxes. */
export const SlotCopySchema = z.object({
  headline: z.string().min(1).max(160),
  subline: z.string().min(1).max(200),
  buttonLabel: z.string().min(1).max(40),
});

/** Quick check (C) as stored — correctIndex/explanation are server-only until answered. */
export const QuickCheckPayloadSchema = z
  .object({
    prompt: z.string().min(1),
    options: z.array(z.string().min(1)).min(2).max(4),
    correctIndex: z.number().int().min(0),
    /** One or two sentences on why the correct option is right. */
    explanation: z.string().min(1),
  })
  .refine((q) => q.correctIndex < q.options.length, { message: "correctIndex out of range" });

/** SlotImpression.payload */
export const SlotPayloadSchema = z.object({
  copy: SlotCopySchema.optional(),
  quickcheck: QuickCheckPayloadSchema.optional(),
});

/** SlotImpression.quickcheckResponse */
export const QuickCheckResponseSchema = z.object({
  selectedIndex: z.number().int().nullable(),
  dontKnow: z.boolean(),
  correct: z.boolean(),
});
