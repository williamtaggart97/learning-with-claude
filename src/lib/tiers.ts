// Pure tier logic (P6/P7). No I/O — safe on server and client.
import { TIER_THRESHOLDS } from "@/config";
import type { Tier, TierInputs, TierProgress } from "./types";

export function computeTier({ answeredFramingCount, conceptCount }: TierInputs): Tier {
  const t2 = TIER_THRESHOLDS.tier2;
  if (answeredFramingCount >= t2.framingExchanges || conceptCount >= t2.concepts) return 2;
  if (answeredFramingCount >= TIER_THRESHOLDS.tier1.framingExchanges) return 1;
  return 0;
}

export function progressToNextTier(inputs: TierInputs): TierProgress {
  const { answeredFramingCount, conceptCount } = inputs;
  const tier = computeTier(inputs);

  if (tier === 0) {
    const target = TIER_THRESHOLDS.tier1.framingExchanges;
    return {
      tier,
      nextTier: 1,
      metric: "framing_exchanges",
      current: answeredFramingCount,
      target,
      fraction: clamp01(answeredFramingCount / target),
    };
  }

  if (tier === 1) {
    const { framingExchanges, concepts } = TIER_THRESHOLDS.tier2;
    const framingFraction = answeredFramingCount / framingExchanges;
    const conceptFraction = conceptCount / concepts;
    const useConcepts = conceptFraction > framingFraction;
    return {
      tier,
      nextTier: 2,
      metric: useConcepts ? "concepts" : "framing_exchanges",
      current: useConcepts ? conceptCount : answeredFramingCount,
      target: useConcepts ? concepts : framingExchanges,
      fraction: clamp01(Math.max(framingFraction, conceptFraction)),
    };
  }

  return { tier, nextTier: null, metric: null, current: answeredFramingCount, target: null, fraction: 1 };
}

/** The tier newly reached between two snapshots, or null (drives X7's celebration). */
export function tierUnlocked(before: TierInputs, after: TierInputs): Tier | null {
  const a = computeTier(before);
  const b = computeTier(after);
  return b > a ? b : null;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
