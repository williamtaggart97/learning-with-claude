// Shared types — the contract between the data layer (2a), the Claude
// pipeline (2b) and the UI (3/4). Validated shapes are inferred from the zod
// schemas in ./schemas; DTOs (server → UI, already trusted) are declared here.
// Safe to import from client components: type-only zod import, and the
// Prisma enums come from the generated enums module, which has no runtime
// dependencies (never import "@/generated/prisma/client" here).
import type { z } from "zod";
import { PersonaKey as PersonaKeyEnum } from "@/generated/prisma/enums";
import type {
  ConversationOrigin,
  FramingStatus,
  LearnLaterOrigin,
  LearnLaterStatus,
  MessageKind,
  MessageRole,
  SlotEngagement,
  SlotVariant,
} from "@/generated/prisma/enums";
import type {
  AssessedConceptSchema,
  AssessedUserContextSchema,
  AssessorResultSchema,
  ChatRequestSchema,
  ConceptRouterResultSchema,
  EntryPointSchema,
  FramingAnswerRequestSchema,
  FramingQuestionFormatSchema,
  FramingQuestionSchema,
  FramingResponseSchema,
  LearnLaterCalloutSchema,
  LearnLaterPatchSchema,
  LookupRouterResultSchema,
  MasteryEvidenceSchema,
  PersonaKeySchema,
  PersonaSwitchRequestSchema,
  ProfilePatchSchema,
  QuickCheckAnswerRequestSchema,
  RouterResultSchema,
  StyleEvidenceSchema,
  StyleSignalSchema,
  TaskRouterResultSchema,
} from "./schemas";

// ─── Primitives ─────────────────────────────────────────────────────────────

export type PersonaKey = z.infer<typeof PersonaKeySchema>;
export const PERSONA_KEYS: readonly PersonaKey[] = Object.values(PersonaKeyEnum);

/** code | concept | worked_example */
export type EntryPoint = z.infer<typeof EntryPointSchema>;

/**
 * Style dimensions (P2). Sign conventions for the bipolar axes:
 *   intuitionVsFormal: -1 = intuition first … +1 = formal first
 *   briefVsThorough:   -1 = brief          … +1 = thorough
 */
export type StyleDimension = "intuitionVsFormal" | "entryPoint" | "briefVsThorough";

// Mirrors of the Prisma enums (single source: prisma/schema.prisma).
export type {
  ConversationOrigin,
  FramingStatus,
  LearnLaterOrigin,
  LearnLaterStatus,
  MessageKind,
  MessageRole,
  SlotEngagement,
  SlotVariant,
};

// ─── Framing ────────────────────────────────────────────────────────────────

export type FramingQuestionFormat = z.infer<typeof FramingQuestionFormatSchema>;
/** "I don't know" is always offered by the UI and is never in `options`. */
export type FramingQuestion = z.infer<typeof FramingQuestionSchema>;
/** answer: string (short/multiple choice), string[] (multi_select), null when dontKnow. */
export type FramingResponse = z.infer<typeof FramingResponseSchema>;

// ─── Claude pipeline outputs ────────────────────────────────────────────────

export type LearnLaterCallout = z.infer<typeof LearnLaterCalloutSchema>;
export type RouterResult = z.infer<typeof RouterResultSchema>;
export type ConceptRouterResult = z.infer<typeof ConceptRouterResultSchema>;
export type LookupRouterResult = z.infer<typeof LookupRouterResultSchema>;
export type TaskRouterResult = z.infer<typeof TaskRouterResultSchema>;
export type AssessedConcept = z.infer<typeof AssessedConceptSchema>;
export type StyleSignal = z.infer<typeof StyleSignalSchema>;
export type AssessedUserContext = z.infer<typeof AssessedUserContextSchema>;
export type AssessorResult = z.infer<typeof AssessorResultSchema>;

// ─── JSON column payloads ───────────────────────────────────────────────────

export type MasteryEvidence = z.infer<typeof MasteryEvidenceSchema>;
export type StyleEvidence = z.infer<typeof StyleEvidenceSchema>;

// Message.data as STORED in Postgres. Kept minimal: framing state lives on
// FramingExchange and callout state on LearnLaterItem; the DTO builders join
// them in (see MessageDTO below). kind = "text" stores null.

/** Stored Message.data for kind = "framing". */
export interface FramingMessageData {
  exchangeId: string;
}

/** Stored Message.data for kind = "answer" (lookup callouts, already persisted). */
export interface AnswerMessageData {
  /** LearnLaterItem ids streamed in the `callouts` event, in display order. */
  calloutItemIds?: string[];
}

/**
 * Stored Message.data for kind = "text" USER messages created by an
 * end-of-answer slot action ("Walk me through it" / "Apply it", R16/R18)
 * rather than typed by the user. The E5 guardrail ignores them (and the
 * replies to them) when deciding whether the user followed up. Plain typed
 * user messages store null.
 */
export interface SlotUserMessageData {
  origin: "slot";
  impressionId: string;
  action: "walkthrough" | "apply";
}

export type StoredMessageData = FramingMessageData | AnswerMessageData | SlotUserMessageData;

// ─── Tiers (P6/P7) ──────────────────────────────────────────────────────────

export type Tier = 0 | 1 | 2;

export interface TierInputs {
  /** FramingExchange rows with status = "answered". */
  answeredFramingCount: number;
  /** ConceptMastery rows for the user (distinct concepts touched). */
  conceptCount: number;
}

export interface TierProgress {
  tier: Tier;
  /** Next tier, or null when already at the top. */
  nextTier: 1 | 2 | null;
  /** Which count the meter shows (the one closest to unlocking). */
  metric: "framing_exchanges" | "concepts" | null;
  /** Meter numerator/denominator, e.g. 3 / 5. target is null at top tier. */
  current: number;
  target: number | null;
  /** 0..1 progress toward nextTier (1 at top tier). */
  fraction: number;
}

// ─── DTOs: server → UI ──────────────────────────────────────────────────────

export interface PersonaSummary {
  key: PersonaKey;
  displayName: string;
  /** One line for the switcher, e.g. "MPH epidemiology · Tier 2". */
  tagline: string;
}

export interface ConversationSummaryDTO {
  id: string;
  title: string;
  origin: ConversationOrigin;
  learnLaterItemId: string | null;
  /** ISO-8601 */
  createdAt: string;
  updatedAt: string;
}

interface MessageDTOBase {
  id: string;
  role: MessageRole;
  /** Markdown (KaTeX + fenced code). May be empty for framing messages. */
  content: string;
  createdAt: string;
}

export interface TextMessageDTO extends MessageDTOBase {
  kind: "text";
  data: null;
}

/** Built server-side from the FramingExchange relation (not from Message.data). */
export interface FramingMessageDTO extends MessageDTOBase {
  kind: "framing";
  role: "assistant";
  data: {
    exchangeId: string;
    questions: FramingQuestion[];
    /** null until answered (and for skipped exchanges). */
    responses: FramingResponse[] | null;
    status: FramingStatus;
  };
}

/** Callouts resolved from AnswerMessageData.calloutItemIds (current item state). */
export interface AnswerMessageDTO extends MessageDTOBase {
  kind: "answer";
  role: "assistant";
  data: {
    /** Empty for concept answers and lookups without callouts. */
    callouts: LearnLaterItemDTO[];
    /**
     * The end-of-answer slot (E1), joined from SlotImpression by message id.
     * Absent/null for answers without a slot (framing, skip, dig-in, apply,
     * stopped answers, answers with no hidden decision, and every answer while
     * the experiment is inactive). When present, the UI renders the slot
     * INSTEAD of `callouts`: for card / walkthrough / quickcheck / apply,
     * `callouts` holds the same item (backward compat); for "none" (control)
     * `callouts` is EMPTY and nothing is rendered.
     */
    slot?: SlotDTO | null;
  };
}

/** Discriminated on `kind`. */
export type MessageDTO = TextMessageDTO | FramingMessageDTO | AnswerMessageDTO;

export interface ConversationDTO extends ConversationSummaryDTO {
  messages: MessageDTO[];
  /** Set when the last message is an unanswered framing message. */
  pendingFramingExchangeId: string | null;
}

export interface ConceptDTO {
  slug: string;
  name: string;
  domain: string | null;
  /** 0..1 */
  score: number;
  /** Newest first. */
  evidence: MasteryEvidence[];
  updatedAt: string;
}

export interface StyleAxisDTO {
  /** -1..1, see sign conventions on StyleDimension. */
  value: number;
  /** 0..1 */
  confidence: number;
  overridden: boolean;
}

export interface LearningStyleDTO {
  intuitionVsFormal: StyleAxisDTO;
  entryPoint: { value: EntryPoint | null; confidence: number; overridden: boolean };
  briefVsThorough: StyleAxisDTO;
  evidence: StyleEvidence[];
}

export interface UserContextDTO {
  field: string | null;
  projects: string[];
  dataTypes: string[];
  notes: string | null;
  userEdited: boolean;
}

export interface LearnLaterItemDTO {
  id: string;
  title: string;
  preview: string;
  appliedContext: string;
  conceptSlug: string | null;
  status: LearnLaterStatus;
  origin: LearnLaterOrigin;
  sourceConversationId: string | null;
  sourceMessageId: string | null;
  createdAt: string;
}

export interface SuggestedTopic {
  title: string;
  /** Why this is suggested, tied to the user's context / shaky concepts. */
  reason: string;
  conceptSlug?: string;
  /** Pre-filled chat message the UI can send on click. */
  prompt: string;
}

/**
 * GET /api/profile. The server always sends the full profile; the UI gates
 * what it shows by `tier` (Tier 0: queue + meter; Tier 1: read-only profile;
 * Tier 2: editable + suggested topics).
 */
export interface ProfileDTO {
  persona: PersonaSummary;
  tier: Tier;
  progress: TierProgress;
  answeredFramingCount: number;
  concepts: ConceptDTO[];
  learningStyle: LearningStyleDTO | null;
  userContext: UserContextDTO | null;
  /** Status "queued" first, newest first; dismissed items omitted. */
  learnLater: LearnLaterItemDTO[];
  /** Empty below Tier 2. */
  suggestedTopics: SuggestedTopic[];
  /**
   * ISO-8601 time the assessor (A3) last finished for this user, or null.
   * The UI polls GET /api/profile after `done` until this changes.
   */
  lastAssessedAt: string | null;
}

// ─── End-of-answer slot (E1–E5) ─────────────────────────────────────────────

/** Short copy for the walk-through (B) and apply-it (D) boxes. */
export interface SlotCopy {
  /** Bold first line, e.g. "Want to see why leakage inflates AUC this much?" */
  headline: string;
  /** Second line, e.g. "2 quick questions, now that the fix is in." */
  subline: string;
  /** Button text, e.g. "Walk me through it" / "Check my features". */
  buttonLabel: string;
}

/** Outcome of a submitted quick check (C). */
export interface QuickCheckResultDTO {
  /** Index into `options`; null when dontKnow. */
  selectedIndex: number | null;
  dontKnow: boolean;
  correct: boolean;
  /** Revealed only after answering. */
  correctIndex: number;
  /** 1–3 sentences: confirms or corrects, then the one-line why. */
  feedback: string;
}

interface SlotDTOBase {
  /** SlotImpression id — the path segment for the /api/slot/[id]/* routes. */
  impressionId: string;
  /** The answer message this slot sits under. */
  answerMessageId: string;
  /** The featured hidden decision — ALWAYS already saved to Learn It Later (E3). */
  item: LearnLaterItemDTO;
  /** First engagement recorded for this slot (for history rendering). */
  engagement: SlotEngagement | null;
  engagedAt: string | null;
}

/**
 * One end-of-answer box (E1), discriminated on `variant`. "none" is the
 * control: render NOTHING (the item is still queued, E3).
 */
export type SlotDTO =
  | (SlotDTOBase & {
      variant: "card";
      /** Set once "Dig in now" was used from this slot. */
      digInConversationId: string | null;
    })
  | (SlotDTOBase & {
      variant: "walkthrough";
      copy: SlotCopy;
      /** The framing exchange created by "Walk me through it", once clicked. */
      exchangeId: string | null;
    })
  | (SlotDTOBase & {
      variant: "quickcheck";
      quickcheck: {
        prompt: string;
        /** 2–4 options. "I don't know" is NOT included — the UI always adds it. */
        options: string[];
        /** null until answered. */
        result: QuickCheckResultDTO | null;
      };
    })
  | (SlotDTOBase & {
      variant: "apply";
      copy: SlotCopy;
      /** The apply-it answer message, once clicked. */
      applyMessageId: string | null;
    })
  | (SlotDTOBase & { variant: "none" });

// ─── API request bodies ─────────────────────────────────────────────────────

export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type FramingAnswerRequest = z.infer<typeof FramingAnswerRequestSchema>;
export type ProfilePatch = z.infer<typeof ProfilePatchSchema>;
export type LearnLaterPatch = z.infer<typeof LearnLaterPatchSchema>;
export type PersonaSwitchRequest = z.infer<typeof PersonaSwitchRequestSchema>;
export type QuickCheckAnswerRequest = z.infer<typeof QuickCheckAnswerRequestSchema>;
