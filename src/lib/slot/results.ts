// Readout for the end-of-answer slot experiment (E5). Server-only.
//
// Everything is derived from SlotImpression plus joins, so no extra event
// table is needed.
//
// Analysis unit and grouping: one impression = one randomized assignment.
// Primary and secondary metrics are grouped by the DRAWN variant
// (intent-to-treat): a walkthrough / quickcheck / apply draw whose payload
// wasn't ready falls back to showing the card, and counting it under "card"
// would bias both arms. The shown-variant view and the fallback rate per
// drawn variant are reported separately.
//
//   primary     engaged in the same session: first engagement within
//               EXPERIMENT.sessionWindowMinutes of the impression
//   secondary   - Learn It Later dig-ins on the featured item within 7 days
//                 (from the slot or the queue). A dig-in is credited only to
//                 the LATEST impression of that item before it, and only if
//                 the dig-in conversation has ≥ 1 message.
//               - walk-through framing exchanges completed (answered)
//               - quick checks correct (among answered quick checks)
//               - mastery change on the featured concept within 7 days,
//                 EXCLUDING quick-check evidence (source "quickcheck"), so the
//                 quick-check arm isn't credited for its own measurement
//   guardrail   the conversation ended right after the answer: no engagement
//               and no USER-INITIATED follow-up message within the session
//               window. Slot-generated user messages (walk-through / apply,
//               Message.data.origin = "slot") and the replies to them don't
//               count. Impressions younger than the window are excluded
//               (right-censored).
//   eligibility-conditional comparisons: variants with eligibility rules
//               (walkthrough, apply — and quickcheck for symmetry) are
//               compared against card and none only among impressions where
//               that variant was eligible.
//
// Impressions survive persona resets (SetNull FKs + snapshot ids). When the
// user row is gone, the joined facts (dig-in conversations, framing
// exchanges, messages, masteries) are gone too: those rows keep their primary
// metric but drop out of the secondary metrics and the guardrail.
//
// Forced (dev-override) impressions are excluded. Demo traffic won't reach
// significance: this is instrumentation and a readout, not a verdict.
import "server-only";
import { EXPERIMENT } from "@/config";
import { db } from "@/lib/db";
import { MAX_MASTERY_EVIDENCE } from "@/lib/pipeline/assess";
import { MasteryEvidenceSchema } from "@/lib/schemas";
import { SLOT_VARIANTS } from "@/lib/slot/policy";
import type { MasteryEvidence, SlotVariant } from "@/lib/types";

const DAY_MS = 24 * 60 * 60_000;
export const SECONDARY_WINDOW_MS = 7 * DAY_MS;
export const MAX_ROWS = 10_000;

export interface RateCell {
  n: number;
  /** null when n = 0 */
  rate: number | null;
  count: number;
}

export interface MeanCell {
  n: number;
  mean: number | null;
}

/** One row per DRAWN variant (intent-to-treat). */
export interface VariantRow {
  variant: SlotVariant;
  /** Impressions drawn as this variant. */
  impressions: number;
  /** Impressions where this variant was eligible (whatever was drawn). */
  eligibleImpressions: number;
  engagedInSession: RateCell;
  engagedEver: RateCell;
  /** Drawn as this variant but shown as something else (payload not ready / failed). */
  fellBack: RateCell;
  digIn7d: RateCell;
  /** Walk-through framing answered, per drawn walkthrough impression. */
  framingCompleted: RateCell | null;
  /** Correct among ANSWERED quick checks (a quality measure, not ITT). */
  quickcheckCorrect: RateCell | null;
  masteryDelta7d: MeanCell;
  endedAfter: RateCell;
}

/** Shown-variant view (secondary). */
export interface ShownRow {
  variant: SlotVariant;
  impressions: number;
  engagedInSession: RateCell;
}

export interface ConditionalArm {
  /** The drawn variant of this arm. */
  arm: SlotVariant;
  impressions: number;
  engagedInSession: RateCell | null;
  digIn7d: RateCell;
  endedAfter: RateCell;
}

/** `variant` vs card vs none, among impressions where `variant` was eligible. */
export interface ConditionalComparison {
  variant: SlotVariant;
  eligibleImpressions: number;
  arms: ConditionalArm[];
}

export interface RankRow {
  label: string;
  impressions: number;
  engagedInSession: RateCell;
  digIn7d: RateCell;
}

export interface SlotResults {
  generatedAt: string;
  active: boolean;
  sessionWindowMinutes: number;
  contentWaitMs: number;
  topPickProbability: number;
  weights: Record<SlotVariant, number>;
  enabled: Record<SlotVariant, boolean>;
  totals: {
    impressions: number;
    forcedExcluded: number;
    users: number;
    /** Impressions whose demo user was since reset/deleted (secondary metrics unavailable). */
    userGone: number;
    /** Impressions younger than the session window (excluded from the guardrail). */
    censored: number;
    /** True when the MAX_ROWS cap was hit: only the newest MAX_ROWS impressions are included. */
    truncated: boolean;
    maxRows: number;
    engagedInSession: RateCell;
    endedAfter: RateCell;
  };
  /** ITT: grouped by drawn variant. */
  byVariant: VariantRow[];
  /** Secondary: grouped by the variant actually shown. */
  byShown: ShownRow[];
  conditional: ConditionalComparison[];
  /** E2: engagement by the featured item's router rank (non-control draws only). */
  byRank: RankRow[];
  /** E2 sanity check: share of rank-1 picks among impressions where the draw had a choice. */
  rankDraw: { randomizable: number; rank1: number; share: number | null };
  engagementKinds: Record<string, number>;
}

/** One impression with every joined fact the readout needs. */
export interface ImpressionFacts {
  userId: string;
  /** The demo user was reset/deleted: joined facts below are unknown (null). */
  userGone: boolean;
  createdAt: Date;
  variant: SlotVariant;
  drawnVariant: SlotVariant;
  eligible: SlotVariant[];
  featuredRank: number | null;
  featuredIsWhy: boolean;
  candidateCount: number;
  engagement: string | null;
  engagedAt: Date | null;
  walkthroughStarted: boolean;
  /** null when unknown (user gone). */
  framingCompleted: boolean | null;
  /** null when the quick check wasn't answered. */
  quickcheckCorrect: boolean | null;
  /** null when unknown (user gone). */
  digIn7d: boolean | null;
  /** Mastery change on the featured concept within 7 days (quick checks excluded); null when no mastery/slug/user. */
  masteryDelta7d: number | null;
  /** Whether the conversation still exists, so follow-ups are knowable. */
  conversationKnown: boolean;
  /** First user-initiated (not slot-generated) user message after the answer, or null. */
  firstFollowUpAt: Date | null;
}

function cell(count: number, n: number): RateCell {
  return { n, count, rate: n ? count / n : null };
}

/** Rate over rows where `pred` is known (null = excluded from the denominator). */
function rateOf<T>(rows: T[], pred: (r: T) => boolean | null): RateCell {
  let n = 0;
  let count = 0;
  for (const r of rows) {
    const v = pred(r);
    if (v === null) continue;
    n++;
    if (v) count++;
  }
  return cell(count, n);
}

function meanOf<T>(rows: T[], val: (r: T) => number | null): MeanCell {
  const xs = rows.map(val).filter((x): x is number => x !== null && Number.isFinite(x));
  return { n: xs.length, mean: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null };
}

/** Engaged within the session window. */
export function engagedInSession(r: Pick<ImpressionFacts, "engagedAt" | "createdAt">, windowMs: number): boolean {
  return !!r.engagedAt && r.engagedAt.getTime() - r.createdAt.getTime() <= windowMs;
}

/**
 * Guardrail: did the conversation end right after the answer? null when not
 * knowable — the impression is younger than the session window
 * (right-censored) or its conversation is gone (user reset). Any engagement
 * within the window counts as "not ended", whatever the variant; so does a
 * user-initiated follow-up message within the window.
 */
export function endedAfter(r: ImpressionFacts, windowMs: number, now: Date): boolean | null {
  if (now.getTime() - r.createdAt.getTime() < windowMs) return null;
  if (!r.conversationKnown) return null;
  if (engagedInSession(r, windowMs)) return false;
  if (r.firstFollowUpAt && r.firstFollowUpAt.getTime() - r.createdAt.getTime() <= windowMs) return false;
  return true;
}

/** Pure aggregation over loaded rows (exported for tests). */
export function aggregate(
  rows: ImpressionFacts[],
  forcedExcluded: number,
  now = new Date(),
  opts: { truncated?: boolean } = {},
): SlotResults {
  const windowMs = EXPERIMENT.sessionWindowMinutes * 60_000;
  const inSession = (r: ImpressionFacts) => engagedInSession(r, windowMs);
  const ended = (r: ImpressionFacts) => endedAfter(r, windowMs, now);

  const byVariant: VariantRow[] = SLOT_VARIANTS.map((variant) => {
    const rs = rows.filter((r) => r.drawnVariant === variant);
    const n = rs.length;
    const answeredQc = rs.filter((r) => r.quickcheckCorrect !== null);
    return {
      variant,
      impressions: n,
      eligibleImpressions: rows.filter((r) => r.eligible.includes(variant)).length,
      engagedInSession: cell(rs.filter(inSession).length, n),
      engagedEver: cell(rs.filter((r) => !!r.engagedAt).length, n),
      fellBack: cell(rs.filter((r) => r.variant !== variant).length, n),
      digIn7d: rateOf(rs, (r) => r.digIn7d),
      framingCompleted: variant === "walkthrough" ? rateOf(rs, (r) => r.framingCompleted) : null,
      quickcheckCorrect: variant === "quickcheck" ? cell(answeredQc.filter((r) => r.quickcheckCorrect).length, answeredQc.length) : null,
      masteryDelta7d: meanOf(rs, (r) => r.masteryDelta7d),
      endedAfter: rateOf(rs, ended),
    };
  });

  const byShown: ShownRow[] = SLOT_VARIANTS.map((variant) => {
    const rs = rows.filter((r) => r.variant === variant);
    return { variant, impressions: rs.length, engagedInSession: cell(rs.filter(inSession).length, rs.length) };
  });

  const conditional: ConditionalComparison[] = (["walkthrough", "quickcheck", "apply"] as const).map((variant) => {
    const pool = rows.filter((r) => r.eligible.includes(variant));
    const arms = ([variant, "card", "none"] as const).map((arm): ConditionalArm => {
      const rs = pool.filter((r) => r.drawnVariant === arm);
      return {
        arm,
        impressions: rs.length,
        engagedInSession: arm === "none" ? null : cell(rs.filter(inSession).length, rs.length),
        digIn7d: rateOf(rs, (r) => r.digIn7d),
        endedAfter: rateOf(rs, ended),
      };
    });
    return { variant, eligibleImpressions: pool.length, arms };
  });

  // E2: the control (none) shows nothing, so it says nothing about which item engages.
  const treated = rows.filter((r) => r.drawnVariant !== "none");
  const rankGroups: { label: string; match: (r: ImpressionFacts) => boolean }[] = [
    { label: "Why card (always featured)", match: (r) => r.featuredIsWhy },
    { label: "Rank 1 (only candidate)", match: (r) => !r.featuredIsWhy && r.featuredRank === 1 && r.candidateCount === 1 },
    { label: "Rank 1 (drawn)", match: (r) => !r.featuredIsWhy && r.featuredRank === 1 && r.candidateCount > 1 },
    { label: "Rank 2", match: (r) => r.featuredRank === 2 },
    { label: "Rank 3", match: (r) => r.featuredRank === 3 },
  ];
  const byRank = rankGroups.map(({ label, match }) => {
    const rs = treated.filter(match);
    return {
      label,
      impressions: rs.length,
      engagedInSession: cell(rs.filter(inSession).length, rs.length),
      digIn7d: rateOf(rs, (r) => r.digIn7d),
    };
  });

  const randomizable = rows.filter((r) => !r.featuredIsWhy && r.candidateCount > 1);
  const rank1 = randomizable.filter((r) => r.featuredRank === 1).length;
  const engagementKinds: Record<string, number> = {};
  for (const r of rows) if (r.engagement) engagementKinds[r.engagement] = (engagementKinds[r.engagement] ?? 0) + 1;

  return {
    generatedAt: now.toISOString(),
    active: EXPERIMENT.active,
    sessionWindowMinutes: EXPERIMENT.sessionWindowMinutes,
    contentWaitMs: EXPERIMENT.contentWaitMs,
    topPickProbability: EXPERIMENT.topPickProbability,
    weights: { ...EXPERIMENT.weights },
    enabled: { ...EXPERIMENT.enabled },
    totals: {
      impressions: rows.length,
      forcedExcluded,
      users: new Set(rows.map((r) => r.userId)).size,
      userGone: rows.filter((r) => r.userGone).length,
      censored: rows.filter((r) => now.getTime() - r.createdAt.getTime() < windowMs).length,
      truncated: !!opts.truncated,
      maxRows: MAX_ROWS,
      engagedInSession: cell(treated.filter(inSession).length, treated.length),
      endedAfter: rateOf(rows, ended),
    },
    byVariant,
    byShown,
    conditional,
    byRank,
    rankDraw: { randomizable: randomizable.length, rank1, share: randomizable.length ? rank1 / randomizable.length : null },
    engagementKinds,
  };
}

// ─── Pure helpers for the joins (exported for tests) ────────────────────────

/**
 * Dig-in credit (E5 secondary): each dig-in on an item is credited to the
 * LATEST impression of that item created at or before the dig-in, and only
 * if the dig-in came within 7 days of it. Callers pass only dig-in
 * conversations with ≥ 1 message. Returns the credited impression keys.
 */
export function creditDigIns(
  impressions: { key: string; itemId: string | null; createdAt: Date }[],
  digIns: { itemId: string; at: Date }[],
): Set<string> {
  const byItem = new Map<string, { key: string; t: number }[]>();
  for (const i of impressions) {
    if (!i.itemId) continue;
    const list = byItem.get(i.itemId) ?? [];
    list.push({ key: i.key, t: i.createdAt.getTime() });
    byItem.set(i.itemId, list);
  }
  const credited = new Set<string>();
  for (const d of digIns) {
    const at = d.at.getTime();
    let best: { key: string; t: number } | null = null;
    for (const i of byItem.get(d.itemId) ?? []) {
      if (i.t <= at && (!best || i.t > best.t)) best = i;
    }
    if (best && at - best.t <= SECONDARY_WINDOW_MS) credited.add(best.key);
  }
  return credited;
}

/**
 * Mastery change on the featured concept within 7 days of the impression,
 * excluding quick-check evidence. Normally the sum of the evidence deltas in
 * the window. If the evidence log (capped at MAX_MASTERY_EVIDENCE entries) no
 * longer reaches back to the impression and the window is still open, falls
 * back to current score − the score snapshotted on the impression, minus the
 * quick-check deltas still visible. null when the user has no mastery row.
 */
export function masteryDelta7d(input: {
  t0: number;
  now: number;
  snapshot: number | null;
  current: { score: number; evidence: Pick<MasteryEvidence, "delta" | "at" | "source">[] } | null;
}): number | null {
  const { t0, now, snapshot, current } = input;
  if (!current) return null;
  const end = t0 + SECONDARY_WINDOW_MS;
  const dated = current.evidence
    .map((e) => ({ ...e, t: Date.parse(e.at) }))
    .filter((e) => Number.isFinite(e.t));
  const inWindow = dated.filter((e) => e.t >= t0 && e.t <= end);
  const quick = inWindow.filter((e) => e.source === "quickcheck");
  const other = inWindow.filter((e) => e.source !== "quickcheck");
  const oldest = dated.length ? Math.min(...dated.map((e) => e.t)) : Infinity;
  const truncated = current.evidence.length >= MAX_MASTERY_EVIDENCE && oldest > t0;
  if (truncated && snapshot !== null && now <= end) {
    return round4(current.score - snapshot - quick.reduce((a, e) => a + e.delta, 0));
  }
  return round4(other.reduce((a, e) => a + e.delta, 0));
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** A Message.data value marks a slot-generated user message (walk-through / apply). */
export function isSlotGeneratedMessage(data: unknown): boolean {
  return !!data && typeof data === "object" && !Array.isArray(data) && (data as Record<string, unknown>).origin === "slot";
}

// ─── Loader ─────────────────────────────────────────────────────────────────

/**
 * Load + join everything, then aggregate. Excludes forced (dev-override)
 * impressions unless includeForced (a debugging view: /results?forced=1).
 */
export async function getSlotResults(opts: { includeForced?: boolean } = {}): Promise<SlotResults> {
  const now = new Date();
  const [rows, forcedCount] = await Promise.all([
    db.slotImpression.findMany({
      where: opts.includeForced ? {} : { forced: false },
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS,
    }),
    db.slotImpression.count({ where: { forced: true } }),
  ]);

  const live = rows.filter((r) => r.userRefId);
  const itemIds = [...new Set(live.map((r) => r.learnLaterItemId).filter((x): x is string => !!x))];
  const exchangeIds = live.map((r) => r.walkthroughExchangeId).filter((x): x is string => !!x);
  const conversationIds = [...new Set(rows.filter((r) => r.conversationRefId).map((r) => r.conversationId))];
  const userIds = [...new Set(live.map((r) => r.userId))];
  const slugs = [...new Set(live.map((r) => r.featuredConceptSlug).filter((x): x is string => !!x))];
  const oldest = rows.length ? new Date(Math.min(...rows.map((r) => r.createdAt.getTime()))) : now;

  const [digIns, exchanges, userMessages, masteries] = await Promise.all([
    itemIds.length
      ? db.conversation.findMany({
          where: { origin: "dig_in", learnLaterItemId: { in: itemIds }, messages: { some: {} } },
          select: { learnLaterItemId: true, createdAt: true },
        })
      : [],
    exchangeIds.length ? db.framingExchange.findMany({ where: { id: { in: exchangeIds } }, select: { id: true, status: true } }) : [],
    conversationIds.length
      ? db.message.findMany({
          where: { conversationId: { in: conversationIds }, role: "user", createdAt: { gt: oldest } },
          select: { conversationId: true, createdAt: true, data: true },
        })
      : [],
    slugs.length
      ? db.conceptMastery.findMany({
          where: { userId: { in: userIds }, concept: { slug: { in: slugs } } },
          select: { userId: true, score: true, evidence: true, concept: { select: { slug: true } } },
        })
      : [],
  ]);

  const credited = creditDigIns(
    live.map((r) => ({ key: r.id, itemId: r.learnLaterItemId, createdAt: r.createdAt })),
    digIns.filter((c) => c.learnLaterItemId).map((c) => ({ itemId: c.learnLaterItemId!, at: c.createdAt })),
  );
  const exchangeStatus = new Map(exchanges.map((e) => [e.id, e.status]));
  const followUps = new Map<string, number[]>();
  for (const m of userMessages) {
    if (isSlotGeneratedMessage(m.data)) continue;
    const list = followUps.get(m.conversationId) ?? [];
    list.push(m.createdAt.getTime());
    followUps.set(m.conversationId, list);
  }
  const masteryBy = new Map<string, { score: number; evidence: MasteryEvidence[] }>();
  for (const m of masteries) {
    const evidence: MasteryEvidence[] = [];
    for (const e of Array.isArray(m.evidence) ? m.evidence : []) {
      const p = MasteryEvidenceSchema.safeParse(e);
      if (p.success) evidence.push(p.data);
    }
    masteryBy.set(`${m.userId}:${m.concept.slug}`, { score: m.score, evidence });
  }

  const facts: ImpressionFacts[] = rows.map((r) => {
    const userGone = !r.userRefId;
    const t0 = r.createdAt.getTime();
    const quick = r.quickcheckResponse as { correct?: unknown } | null;
    const later = (followUps.get(r.conversationId) ?? []).filter((t) => t > t0);
    let framingCompleted: boolean | null = null;
    if (!userGone) framingCompleted = !!r.walkthroughExchangeId && exchangeStatus.get(r.walkthroughExchangeId) === "answered";
    return {
      userId: r.userId,
      userGone,
      createdAt: r.createdAt,
      variant: r.variant,
      drawnVariant: r.drawnVariant,
      eligible: r.eligibleVariants,
      featuredRank: r.featuredRank,
      featuredIsWhy: r.featuredIsWhy,
      candidateCount: r.candidateCount,
      engagement: r.engagement,
      engagedAt: r.engagedAt,
      walkthroughStarted: !!r.walkthroughStartedAt,
      framingCompleted,
      quickcheckCorrect: quick && typeof quick.correct === "boolean" ? quick.correct : null,
      digIn7d: userGone ? null : credited.has(r.id),
      masteryDelta7d:
        userGone || !r.featuredConceptSlug
          ? null
          : masteryDelta7d({
              t0,
              now: now.getTime(),
              snapshot: r.featuredMasteryAtImpression,
              current: masteryBy.get(`${r.userId}:${r.featuredConceptSlug}`) ?? null,
            }),
      conversationKnown: !!r.conversationRefId,
      firstFollowUpAt: later.length ? new Date(Math.min(...later)) : null,
    };
  });

  return aggregate(facts, opts.includeForced ? 0 : forcedCount, now, { truncated: rows.length >= MAX_ROWS });
}
