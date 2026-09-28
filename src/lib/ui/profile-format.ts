// Plain-language formatting for the learner profile (P1, P2, P6). Pure and
// client-safe: used by the profile panel, the header meter and the unlock
// celebration.
import { TIER_THRESHOLDS } from "@/config";
import type { ConceptDTO, EntryPoint, LearningStyleDTO, ProfileDTO, StyleAxisDTO, TierProgress } from "@/lib/types";

// ─── Confidence ─────────────────────────────────────────────────────────────

/** Below this, a style dimension reads "still figuring this out". */
export const LOW_CONFIDENCE = 0.3;
const FAIR_CONFIDENCE = 0.6;

export type ConfidenceLevel = "low" | "early" | "fair" | "set";

export function confidenceLevel(confidence: number, overridden: boolean): ConfidenceLevel {
  if (overridden) return "set";
  if (confidence < LOW_CONFIDENCE) return "low";
  if (confidence < FAIR_CONFIDENCE) return "early";
  return "fair";
}

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  low: "Still figuring this out",
  early: "Early read",
  fair: "Fairly confident",
  set: "You set this",
};

// ─── Style dimensions (P2) ──────────────────────────────────────────────────

export interface AxisMeta {
  key: "intuitionVsFormal" | "briefVsThorough";
  title: string;
  left: string;
  right: string;
}

export const AXES: AxisMeta[] = [
  { key: "intuitionVsFormal", title: "How ideas land", left: "Intuition first", right: "Formal first" },
  { key: "briefVsThorough", title: "How much detail", left: "Brief", right: "Thorough" },
];

export const ENTRY_POINTS: { value: EntryPoint; label: string }[] = [
  { value: "code", label: "Code" },
  { value: "concept", label: "Concept" },
  { value: "worked_example", label: "Worked example" },
];

export const ENTRY_POINT_LABEL: Record<EntryPoint, string> = {
  code: "Code",
  concept: "Concept",
  worked_example: "Worked example",
};

/** Axis position as a short label, e.g. "Leans intuition first". */
export function axisPositionLabel(meta: AxisMeta, value: number): string {
  const mag = Math.abs(value);
  if (mag < 0.2) return "Right in the middle";
  const side = value < 0 ? meta.left : meta.right;
  return `${mag >= 0.6 ? "Strongly" : "Leans"} ${side.toLowerCase()}`;
}

/** One sentence per dimension, second person, for the reveal and the panel. */
export function describeIntuition(value: number): string {
  if (value <= -0.2) return "You like the intuition before the formulas: a picture or an analogy first, the math after.";
  if (value >= 0.2) return "You like the precise definition up front, with the intuition built on top of it.";
  return "You're comfortable with intuition and formalism side by side.";
}

export function describeEntryPoint(value: EntryPoint | null): string {
  switch (value) {
    case "code":
      return "You'd rather start from code you can run and poke at.";
    case "concept":
      return "You want the big idea first, before any code or examples.";
    case "worked_example":
      return "You learn best from a worked example on realistic data.";
    default:
      return "No clear favourite yet for where an explanation should start.";
  }
}

export function describeDetail(value: number): string {
  if (value <= -0.2) return "You prefer short, to-the-point answers.";
  if (value >= 0.2) return "You like thorough answers that cover the edge cases.";
  return "Medium-length answers suit you: enough detail, no essays.";
}

export interface StyleSummaryLine {
  key: "intuitionVsFormal" | "entryPoint" | "briefVsThorough";
  label: string;
  text: string;
  level: ConfidenceLevel;
}

const NOT_SURE_YET = "Not sure yet — a few more framing rounds will tell.";

/**
 * Sentence for a style axis at its confidence level. At low confidence the
 * read is hedged ("Not sure yet — maybe brief") rather than stated as fact.
 * Shared by the unlock reveal and the profile panel so they always agree.
 */
export function axisText(key: AxisMeta["key"], axis: StyleAxisDTO): string {
  const level = confidenceLevel(axis.confidence, axis.overridden);
  if (level === "low") {
    const meta = AXES.find((a) => a.key === key)!;
    if (Math.abs(axis.value) < 0.2) return NOT_SURE_YET;
    const side = axis.value < 0 ? meta.left : meta.right;
    return `Not sure yet — maybe ${side.toLowerCase()}.`;
  }
  return key === "intuitionVsFormal" ? describeIntuition(axis.value) : describeDetail(axis.value);
}

/** Sentence for the entry-point dimension at its confidence level (hedged when low). */
export function entryPointText(entry: LearningStyleDTO["entryPoint"]): string {
  const level = confidenceLevel(entry.confidence, entry.overridden);
  if (level === "low") {
    return entry.value ? `Not sure yet — maybe ${ENTRY_POINT_LABEL[entry.value].toLowerCase()} first.` : NOT_SURE_YET;
  }
  return describeEntryPoint(entry.value);
}

export function summarizeStyle(style: LearningStyleDTO): StyleSummaryLine[] {
  return [
    {
      key: "intuitionVsFormal",
      label: "How ideas land",
      text: axisText("intuitionVsFormal", style.intuitionVsFormal),
      level: confidenceLevel(style.intuitionVsFormal.confidence, style.intuitionVsFormal.overridden),
    },
    {
      key: "entryPoint",
      label: "Where to start",
      text: entryPointText(style.entryPoint),
      level: confidenceLevel(style.entryPoint.confidence, style.entryPoint.overridden),
    },
    {
      key: "briefVsThorough",
      label: "How much detail",
      text: axisText("briefVsThorough", style.briefVsThorough),
      level: confidenceLevel(style.briefVsThorough.confidence, style.briefVsThorough.overridden),
    },
  ];
}

// ─── Mastery (P1) ───────────────────────────────────────────────────────────

/** Same cut points as suggested topics (src/lib/profile.ts): < 0.5 shaky, ≥ 0.75 solid. */
export type MasteryBand = "low" | "mid" | "high";

export function masteryBand(score: number): MasteryBand {
  if (score < 0.5) return "low";
  if (score < 0.75) return "mid";
  return "high";
}

export const MASTERY_LABEL: Record<MasteryBand, string> = {
  low: "Shaky",
  mid: "Getting there",
  high: "Solid",
};

/** Tailwind fill class per band (theme tokens in globals.css). */
export const MASTERY_FILL: Record<MasteryBand, string> = {
  low: "bg-mastery-low",
  mid: "bg-mastery-mid",
  high: "bg-mastery-high",
};

export const pct = (score: number) => `${Math.round(score * 100)}%`;

/** Evidence delta in percentage points: 0.25 → "+25", -0.1 → "−10". */
export function formatDelta(delta: number): string {
  const pts = Math.round(delta * 100);
  if (pts === 0) return "±0";
  return pts > 0 ? `+${pts}` : `−${Math.abs(pts)}`;
}

export type ConceptSort = "shaky" | "recent";

export function sortConcepts(concepts: ConceptDTO[], sort: ConceptSort): ConceptDTO[] {
  const out = [...concepts];
  if (sort === "shaky") return out.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
  return out.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.name.localeCompare(b.name));
}

/** Strongest concepts (solid first), for the reveal. */
export function topConcepts(profile: ProfileDTO, n = 3): ConceptDTO[] {
  return [...profile.concepts].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, n);
}

// ─── Time ───────────────────────────────────────────────────────────────────

const RTF = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "3 days ago", "just now". Client-only (depends on the current time). */
export function relativeTime(iso: string, now = Date.now()): string {
  const seconds = (Date.parse(iso) - now) / 1000;
  if (!Number.isFinite(seconds)) return "";
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return RTF.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

// ─── Unlock unit copy (P6, P7) ──────────────────────────────────────────────
// One user-facing term for what the unlock ladder counts: a "framing round" is
// one set of (up to 3) framing questions Claude asks before answering, counted
// once when answered. Skipped rounds don't count.

export const FRAMING_ROUNDS = "framing rounds";
/** Short gloss for where the term is first introduced. */
export const FRAMING_ROUND_GLOSS = "each time you answer Claude’s framing questions";

/** "1 framing round", "5 framing rounds". */
export function framingRounds(n: number): string {
  return `${n} framing round${n === 1 ? "" : "s"}`;
}

export const TIER1_ROUNDS = TIER_THRESHOLDS.tier1.framingExchanges;
export const TIER2_ROUNDS = TIER_THRESHOLDS.tier2.framingExchanges;
export const TIER2_CONCEPTS = TIER_THRESHOLDS.tier2.concepts;

// ─── Progress meter (P6, P7) ────────────────────────────────────────────────

export interface MeterCopy {
  /** Full sentence (accessible name, wide screens). */
  long: string;
  /** Short label for narrow headers. */
  short: string;
  /** "3/5", or null at the top tier. */
  count: string | null;
}

export function meterCopy(progress: TierProgress): MeterCopy {
  const count = progress.target !== null ? `${progress.current}/${progress.target}` : null;
  if (progress.tier === 0) {
    return {
      long: `Claude is getting to know how you learn — ${count} ${FRAMING_ROUNDS}`,
      short: "Getting to know you",
      count,
    };
  }
  if (progress.tier === 1) {
    const unit = progress.metric === "concepts" ? "concepts" : FRAMING_ROUNDS;
    return {
      long: `Profile unlocked · editing unlocks at ${progress.target} ${unit} — ${count}`,
      short: `Editable at ${progress.target} ${progress.metric === "concepts" ? "concepts" : "rounds"}`,
      count,
    };
  }
  return { long: "Profile unlocked — open your learning profile", short: "Profile unlocked", count: null };
}
