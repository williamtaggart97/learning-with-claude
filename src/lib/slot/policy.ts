// End-of-answer slot experiment (E1–E5): pure draw logic. No I/O, injectable
// RNG, so the distributions are unit-testable offline.
//
// Per immediate answer (lookup / task / direct):
//  1. Priority override (E4): a tier unlock replaces the slot — no draw, no
//     impression logged.
//  2. Featured item (E2): a task's whyCallout is ALWAYS featured when present
//     (L8: "Claude adds a 'why this happened' card" — the task-mode answer even
//     says the card is saved), so it is not part of the randomization and is
//     logged with featuredIsWhy. Otherwise the router's rank 1 with
//     probability topPickProbability, else uniformly among ranks 2..n. With a
//     single candidate there is nothing to randomize (rank 1, logged with
//     candidateCount = 1 so the readout can separate it). No candidate → no
//     slot at all (nothing to surface, nothing logged).
//  3. Variant (E1): filter to eligible + enabled variants, then a weighted draw.
import type { SlotCandidates } from "@/lib/pipeline/route-policy";
import type { LearnLaterCallout, SlotVariant, Tier } from "@/lib/types";

export const SLOT_VARIANTS = ["card", "walkthrough", "quickcheck", "apply", "none"] as const satisfies readonly SlotVariant[];

export type Rng = () => number;

/** Deterministic PRNG (mulberry32) for tests; production uses Math.random. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── E2: featured item ──────────────────────────────────────────────────────

export interface FeaturedPick {
  callout: LearnLaterCallout;
  /** 1-based rank among `ranked`; null when the why card is featured. */
  rank: number | null;
  isWhy: boolean;
  /** Ranked candidates offered to the draw (the why card not counted). */
  candidateCount: number;
}

export function drawFeatured(c: SlotCandidates, rng: Rng, topPickProbability: number): FeaturedPick | null {
  const n = c.ranked.length;
  if (c.why) return { callout: c.why, rank: null, isWhy: true, candidateCount: n };
  if (n === 0) return null;
  let rank = 1;
  if (n > 1 && rng() >= topPickProbability) rank = 2 + Math.min(n - 2, Math.floor(rng() * (n - 1)));
  return { callout: c.ranked[rank - 1], rank, isWhy: false, candidateCount: n };
}

// ─── E1: variant eligibility + weighted draw ────────────────────────────────

export interface EligibilityContext {
  /** The featured item names a concept (needed to frame it: B). */
  hasConceptSlug: boolean;
  /** That concept was already framed in this conversation (L9 — no second framing: B ineligible). */
  conceptAlreadyFramed: boolean;
  /** Known user context: at least one project or data type (D). */
  hasUserContext: boolean;
  enabled: Readonly<Record<SlotVariant, boolean>>;
}

/**
 * Eligible variants, in SLOT_VARIANTS order:
 *   card (A)        always
 *   walkthrough (B) featured concept slug, not already framed here (L9)
 *   quickcheck (C)  always (its question is generated in parallel; if it
 *                   isn't ready by the end of the answer the slot falls back
 *                   to A and the fallback is logged)
 *   apply (D)       known user context
 *   none (E)        always
 * then minus disabled variants.
 */
export function eligibleVariants(ctx: EligibilityContext): SlotVariant[] {
  const ok: Record<SlotVariant, boolean> = {
    card: true,
    walkthrough: ctx.hasConceptSlug && !ctx.conceptAlreadyFramed,
    quickcheck: true,
    apply: ctx.hasUserContext,
    none: true,
  };
  return SLOT_VARIANTS.filter((v) => ok[v] && ctx.enabled[v]);
}

/** Weighted draw among `eligible`. Non-positive weights are never drawn; if all are, the first eligible wins. */
export function drawVariant(
  eligible: readonly SlotVariant[],
  weights: Readonly<Record<SlotVariant, number>>,
  rng: Rng,
): SlotVariant | null {
  if (eligible.length === 0) return null;
  const w = eligible.map((v) => Math.max(0, weights[v] ?? 0));
  const total = w.reduce((a, b) => a + b, 0);
  if (total <= 0) return eligible[0];
  let x = rng() * total;
  for (let i = 0; i < eligible.length; i++) {
    if (w[i] <= 0) continue;
    x -= w[i];
    if (x < 0) return eligible[i];
  }
  // Float edge (x landed exactly on total): last positive-weight variant.
  for (let i = eligible.length - 1; i >= 0; i--) if (w[i] > 0) return eligible[i];
  return eligible[0];
}

// ─── Whole plan ─────────────────────────────────────────────────────────────

export interface SlotConfig {
  topPickProbability: number;
  weights: Readonly<Record<SlotVariant, number>>;
  enabled: Readonly<Record<SlotVariant, boolean>>;
}

export interface SlotPlanInput {
  candidates: SlotCandidates;
  /** Tier newly unlocked by this answer (E4 priority moment), or null. */
  unlocked: Tier | null;
  /** Everything but hasConceptSlug (derived from the featured item). */
  conceptAlreadyFramed: (slug: string) => boolean;
  hasUserContext: boolean;
  config: SlotConfig;
  rng: Rng;
  /** Dev-only forced variant; ignored when not eligible. */
  forcedVariant?: SlotVariant | null;
}

export interface SlotPlan {
  featured: FeaturedPick;
  /** All candidates in router order (a why card first, rank null), for the impression log. */
  candidateList: { callout: LearnLaterCallout; rank: number | null; why: boolean }[];
  variant: SlotVariant;
  eligible: SlotVariant[];
  /** Weights of the eligible variants at draw time. */
  weights: Partial<Record<SlotVariant, number>>;
  topPickProbability: number;
  forced: boolean;
}

/** null = no slot and nothing logged (priority moment, or nothing to feature). */
export function planSlot(input: SlotPlanInput): SlotPlan | null {
  // E4. Currently dead in production: the only caller (POST /api/chat's
  // lookup/task/direct path) always passes unlocked: null, because no tier
  // unlock can coincide with such an answer (see chat.ts). Kept so a future
  // caller that CAN unlock (e.g. a slot on framing answers) gets the rule.
  if (input.unlocked !== null) return null;
  const featured = drawFeatured(input.candidates, input.rng, input.config.topPickProbability);
  if (!featured) return null;
  const slug = featured.callout.conceptSlug ?? null;
  const eligible = eligibleVariants({
    hasConceptSlug: !!slug,
    conceptAlreadyFramed: slug ? input.conceptAlreadyFramed(slug) : false,
    hasUserContext: input.hasUserContext,
    enabled: input.config.enabled,
  });
  const forced = !!input.forcedVariant && eligible.includes(input.forcedVariant);
  const variant = forced ? input.forcedVariant! : drawVariant(eligible, input.config.weights, input.rng);
  if (!variant) return null; // every variant disabled
  const weights: Partial<Record<SlotVariant, number>> = {};
  for (const v of eligible) weights[v] = input.config.weights[v];
  const { why, ranked } = input.candidates;
  const candidateList = [
    ...(why ? [{ callout: why, rank: null, why: true }] : []),
    ...ranked.map((callout, i) => ({ callout, rank: i + 1, why: false })),
  ];
  return {
    featured,
    candidateList,
    variant,
    eligible,
    weights,
    topPickProbability: input.config.topPickProbability,
    forced,
  };
}

/** Variants whose payload is generated by a model call in parallel with the answer. */
export function needsContent(variant: SlotVariant): variant is "walkthrough" | "quickcheck" | "apply" {
  return variant === "walkthrough" || variant === "quickcheck" || variant === "apply";
}

/** Parse a dev-only override value (?slotVariant=…). */
export function parseSlotVariant(v: string | null | undefined): SlotVariant | null {
  return (SLOT_VARIANTS as readonly string[]).includes(v ?? "") ? (v as SlotVariant) : null;
}
