// Authoring format for persona seed content. prisma/seed.ts turns this into
// template rows with deterministic ids ("tpl-<persona>-…"), consistent
// relations and ascending timestamps. Clones remap every id (src/lib/persona.ts).
import type { EntryPoint, FramingQuestion, FramingResponse, LearnLaterCallout, PersonaKey, StyleDimension } from "../../src/lib/types";

/**
 * Markdown tag: String.raw semantics (backslashes for KaTeX stay literal),
 * plus two conveniences for writing inside a template literal:
 *   \`  → `        (inline code)
 *   ~~~ → ```      (fence at line start)
 * Leading/trailing blank lines are trimmed and common indentation removed.
 */
export function md(strings: TemplateStringsArray, ...values: unknown[]): string {
  const raw = String.raw({ raw: strings.raw }, ...values)
    .replace(/\\`/g, "`")
    .replace(/^(\s*)~~~/gm, "$1```");
  const lines = raw.replace(/^\n+|\s+$/g, "").split("\n");
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^ */)![0].length);
  const cut = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(cut)).join("\n");
}

/** A framing exchange: user message → framing message → (responses) → answer. */
export interface SeedExchangeTurn {
  kind: "exchange";
  /** Unique within the persona, e.g. "c1.x1". Used by evidence/source refs. */
  ref: string;
  user: string;
  /** Short lead-in shown above the framing card (may be ""). */
  framingIntro: string;
  conceptSlugs: string[];
  questions: FramingQuestion[];
  /** Required for answered; omitted for skipped. */
  responses?: FramingResponse[];
  status: "answered" | "skipped";
  skipCallout: LearnLaterCallout;
  /** For skipped exchanges: ref of the LearnLater item the skipCallout became. */
  skipItemRef?: string;
  answer: string;
  /** Minutes the user spent on the framing card (default 3). */
  thinkMinutes?: number;
}

/**
 * A lookup or task: user message → immediate answer (optionally with
 * callouts). Both routes skip framing, so the stored rows are identical.
 */
export interface SeedLookupTurn {
  kind: "lookup";
  ref: string;
  user: string;
  answer: string;
  /** LearnLater item refs shown as callouts on the answer, in order. */
  calloutRefs?: string[];
}

export type SeedTurn = SeedExchangeTurn | SeedLookupTurn;

export interface SeedConversation {
  ref: string;
  title: string;
  /** Days before seed time the conversation started. */
  daysAgo: number;
  /**
   * Offset (hours, fractional ok) of the first message from the start of its
   * UTC day. RELATIVE ONLY: it spaces conversations within a day and orders
   * them; it is not a wall-clock time — clones shift every timestamp so the
   * newest activity lands shortly before "now" (src/lib/persona.ts).
   */
  startHour: number;
  turns: SeedTurn[];
}

export interface SeedMasteryEvidence {
  /** Turn ref the evidence came from (its user message becomes messageId). */
  ref: string;
  note: string;
  delta: number;
}

/** Score = sum of evidence deltas, clamped to 0..1 (keeps the profile honest). */
export interface SeedMastery {
  slug: string;
  evidence: SeedMasteryEvidence[];
}

export interface SeedStyle {
  intuitionVsFormal: number;
  intuitionVsFormalConfidence: number;
  entryPoint: EntryPoint | null;
  entryPointConfidence: number;
  briefVsThorough: number;
  briefVsThoroughConfidence: number;
  evidence: { dimension: StyleDimension; ref: string; note: string }[];
}

export interface SeedContext {
  field: string | null;
  projects: string[];
  dataTypes: string[];
  notes: string | null;
}

export interface SeedLearnLater {
  ref: string;
  conceptSlug: string | null;
  title: string;
  preview: string;
  appliedContext: string;
  origin: "skipped" | "flagged";
  status: "queued" | "dug_in" | "dismissed";
  /**
   * Where it came from. `message: "user"` → the turn's user message (skip
   * callouts), `"answer"` → the turn's answer message (lookup callouts,
   * assessor-flagged items).
   */
  source: { turnRef: string; message: "user" | "answer" } | null;
}

export interface SeedPersona {
  key: PersonaKey;
  displayName: string;
  /** Days before seed time the user "signed up" (before any conversation). */
  createdDaysAgo: number;
  /** null → an empty default row is still created (see prisma/seed.ts). */
  style: SeedStyle | null;
  context: SeedContext | null;
  masteries: SeedMastery[];
  conversations: SeedConversation[];
  learnLater: SeedLearnLater[];
}
