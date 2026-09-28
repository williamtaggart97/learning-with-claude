// Offline checks for the end-of-answer slot experiment (E1–E5) and the
// whyCallout guard. No network, no database.
//
// Run: node --conditions=react-server --import tsx --test tests/*.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeSlotContent, shuffleQuickCheck, WALKTHROUGH_BUTTON_LABEL } from "@/lib/claude/slot";
import { normalizeRouterOutput } from "@/lib/claude/router";
import { planRoute, reportsProblem, slotCandidates } from "@/lib/pipeline/route-policy";
import {
  drawFeatured,
  drawVariant,
  eligibleVariants,
  parseSlotVariant,
  planSlot,
  seededRng,
  SLOT_VARIANTS,
  type SlotConfig,
} from "@/lib/slot/policy";
import { applyMessageText, quoteItemTitle, walkthroughMessageText } from "@/lib/api-contract";
import { withExplicitSslMode } from "@/lib/db";
import { isNearDuplicateEntry, mergeList } from "@/lib/pipeline/assess";
import {
  aggregate,
  creditDigIns,
  endedAfter,
  isSlotGeneratedMessage,
  masteryDelta7d,
  type ImpressionFacts,
} from "@/lib/slot/results";
import {
  claimEngagement,
  devForcedVariant,
  quickCheckFeedback,
  releaseEngagement,
  resolveSlotContent,
  type EngagementStore,
  type SlotRun,
} from "@/lib/slot/service";
import type { LearnLaterCallout, RouterResult, SlotVariant } from "@/lib/types";

const callout = (title: string, conceptSlug?: string): LearnLaterCallout => ({
  title,
  preview: `${title} preview.`,
  appliedContext: `${title} applied.`,
  ...(conceptSlug ? { conceptSlug } : {}),
});
const A = callout("A", "a");
const B = callout("B", "b");
const C = callout("C", "c");

const ALL_ON: Record<SlotVariant, boolean> = { card: true, walkthrough: true, quickcheck: true, apply: true, none: true };
const EQUAL: Record<SlotVariant, number> = { card: 1, walkthrough: 1, quickcheck: 1, apply: 1, none: 1 };
const config: SlotConfig = { topPickProbability: 0.6, weights: EQUAL, enabled: ALL_ON };

// ─── E2: featured rank draw ─────────────────────────────────────────────────

test("E2: rank 1 ≈ 60%, ranks 2 and 3 ≈ 20% each (seeded)", () => {
  const rng = seededRng(42);
  const counts = [0, 0, 0, 0];
  const N = 20_000;
  for (let i = 0; i < N; i++) {
    const f = drawFeatured({ why: null, ranked: [A, B, C] }, rng, 0.6);
    assert.ok(f && f.rank !== null && !f.isWhy);
    counts[f.rank]++;
  }
  assert.ok(Math.abs(counts[1] / N - 0.6) < 0.015, `rank1 ${counts[1] / N}`);
  assert.ok(Math.abs(counts[2] / N - 0.2) < 0.015, `rank2 ${counts[2] / N}`);
  assert.ok(Math.abs(counts[3] / N - 0.2) < 0.015, `rank3 ${counts[3] / N}`);
});

test("E2: two candidates split 60/40; the probability knob is honoured", () => {
  const rng = seededRng(7);
  let r1 = 0;
  const N = 10_000;
  for (let i = 0; i < N; i++) if (drawFeatured({ why: null, ranked: [A, B] }, rng, 0.6)!.rank === 1) r1++;
  assert.ok(Math.abs(r1 / N - 0.6) < 0.02);
  let always = 0;
  for (let i = 0; i < 1000; i++) if (drawFeatured({ why: null, ranked: [A, B, C] }, rng, 1)!.rank === 1) always++;
  assert.equal(always, 1000);
  let never = 0;
  for (let i = 0; i < 1000; i++) if (drawFeatured({ why: null, ranked: [A, B, C] }, rng, 0)!.rank === 1) never++;
  assert.equal(never, 0);
});

test("E2: single candidate → rank 1; none → no slot; why card always featured, not randomized", () => {
  const rng = seededRng(1);
  const one = drawFeatured({ why: null, ranked: [A] }, rng, 0.6);
  assert.deepEqual([one?.rank, one?.candidateCount, one?.callout.title], [1, 1, "A"]);
  assert.equal(drawFeatured({ why: null, ranked: [] }, rng, 0.6), null);
  const why = callout("Why it leaks", "data-leakage");
  for (let i = 0; i < 200; i++) {
    const f = drawFeatured({ why, ranked: [A, B, C] }, rng, 0.6)!;
    assert.equal(f.isWhy, true);
    assert.equal(f.rank, null);
    assert.equal(f.callout.title, "Why it leaks");
    assert.equal(f.candidateCount, 3);
  }
});

// ─── E1: eligibility + weighted draw ────────────────────────────────────────

test("E1 eligibility: B needs an unframed concept, D needs user context; disabled variants drop out", () => {
  const base = { hasConceptSlug: true, conceptAlreadyFramed: false, hasUserContext: true, enabled: ALL_ON };
  assert.deepEqual(eligibleVariants(base), [...SLOT_VARIANTS]);
  assert.deepEqual(eligibleVariants({ ...base, hasConceptSlug: false }), ["card", "quickcheck", "apply", "none"]);
  assert.deepEqual(eligibleVariants({ ...base, conceptAlreadyFramed: true }), ["card", "quickcheck", "apply", "none"]);
  assert.deepEqual(eligibleVariants({ ...base, hasUserContext: false }), ["card", "walkthrough", "quickcheck", "none"]);
  assert.deepEqual(eligibleVariants({ ...base, enabled: { ...ALL_ON, quickcheck: false, none: false } }), [
    "card",
    "walkthrough",
    "apply",
  ]);
});

test("E1 weighted draw: equal weights ≈ uniform over eligible; zero weight never drawn", () => {
  const rng = seededRng(99);
  const eligible: SlotVariant[] = ["card", "walkthrough", "quickcheck", "none"];
  const counts: Record<string, number> = {};
  const N = 20_000;
  for (let i = 0; i < N; i++) {
    const v = drawVariant(eligible, EQUAL, rng)!;
    counts[v] = (counts[v] ?? 0) + 1;
  }
  for (const v of eligible) assert.ok(Math.abs(counts[v] / N - 0.25) < 0.015, `${v} ${counts[v] / N}`);
  assert.equal(counts.apply, undefined);

  const skewed = { ...EQUAL, card: 3, none: 0 };
  const c2: Record<string, number> = {};
  for (let i = 0; i < N; i++) {
    const v = drawVariant(eligible, skewed, rng)!;
    c2[v] = (c2[v] ?? 0) + 1;
  }
  assert.equal(c2.none, undefined);
  assert.ok(Math.abs(c2.card / N - 0.6) < 0.015); // 3 / (3+1+1)
  assert.equal(drawVariant([], EQUAL, rng), null);
  assert.equal(drawVariant(["walkthrough", "none"], { ...EQUAL, walkthrough: 0, none: 0 }, rng), "walkthrough");
});

test("planSlot: forced variant only when eligible; weights snapshot covers eligible only; candidate log", () => {
  const input = {
    candidates: { why: null, ranked: [A, B] },
    unlocked: null,
    conceptAlreadyFramed: () => false,
    hasUserContext: false,
    config,
    rng: seededRng(3),
  };
  const forced = planSlot({ ...input, forcedVariant: "quickcheck" })!;
  assert.equal(forced.variant, "quickcheck");
  assert.equal(forced.forced, true);
  const notEligible = planSlot({ ...input, forcedVariant: "apply" })!;
  assert.equal(notEligible.forced, false);
  assert.notEqual(notEligible.variant, "apply");
  assert.deepEqual(Object.keys(notEligible.weights).sort(), ["card", "none", "quickcheck", "walkthrough"]);
  assert.deepEqual(
    notEligible.candidateList.map((c) => [c.callout.title, c.rank, c.why]),
    [
      ["A", 1, false],
      ["B", 2, false],
    ],
  );
  // B is ineligible when the FEATURED concept was already framed here (L9).
  for (let i = 0; i < 50; i++) {
    const p = planSlot({ ...input, rng: seededRng(i), conceptAlreadyFramed: () => true })!;
    assert.ok(!p.eligible.includes("walkthrough"));
  }
});

// ─── E4: priority override ──────────────────────────────────────────────────

test("E4: a tier unlock replaces the slot — no draw, nothing logged", () => {
  const plan = planSlot({
    candidates: { why: null, ranked: [A, B, C] },
    unlocked: 1,
    conceptAlreadyFramed: () => false,
    hasUserContext: true,
    config,
    rng: seededRng(5),
  });
  assert.equal(plan, null);
});

// ─── E3: the featured item is always the one saved ──────────────────────────

test("E3: every variant (incl. control) features — and so saves — exactly one candidate", () => {
  const rng = seededRng(11);
  const seen = new Set<SlotVariant>();
  for (let i = 0; i < 2000; i++) {
    const plan = planSlot({
      candidates: slotCandidates({ kind: "lookup", conceptSlugs: [], rationale: "", callouts: [A, B, C] }),
      unlocked: null,
      conceptAlreadyFramed: () => false,
      hasUserContext: true,
      config,
      rng,
    })!;
    seen.add(plan.variant);
    // chat.ts persists plan.featured.callout whatever the variant.
    assert.ok([A, B, C].includes(plan.featured.callout));
  }
  assert.deepEqual([...seen].sort(), [...SLOT_VARIANTS].sort());
});

test("no candidates (already framed + answered) → no slot", () => {
  const route: RouterResult = { kind: "lookup", conceptSlugs: [], rationale: "", callouts: [] };
  assert.equal(
    planSlot({ candidates: slotCandidates(route), unlocked: null, conceptAlreadyFramed: () => false, hasUserContext: true, config, rng: seededRng(1) }),
    null,
  );
});

// ─── whyCallout guard + cap ─────────────────────────────────────────────────

test("whyCallout guard: dropped for a plain writing request, kept for a problem report", () => {
  const why = callout("Why preprocessing leaks", "data-leakage");
  const task: RouterResult = { kind: "task", conceptSlugs: ["data-leakage"], rationale: "r", callouts: [A], whyCallout: why };
  const email = planRoute(task, { message: "Draft an email to my advisor saying the churn model draft will be ready next week", earlier: [] });
  assert.equal(email.droppedWhy, true);
  assert.equal(email.route.kind === "task" && email.route.whyCallout, null);
  assert.equal(email.candidates.why, null);
  assert.deepEqual(email.candidates.ranked, [A]);

  const bug = planRoute(task, { message: "My cross-validated AUC is 0.99 but it fails on new data, here's my code", earlier: [] });
  assert.equal(bug.droppedWhy, false);
  assert.equal(bug.candidates.why, why);
});

test("reportsProblem heuristic", () => {
  for (const m of [
    "my glmer throws 'Model failed to converge'",
    "why does my groupby return NaN for half the groups?",
    "My AUC is 0.99, seems too good",
    "why are my standard errors enormous?",
    "the estimate flipped sign when I added a covariate",
    "this code doesn't work",
    "I'm getting an error: singular fit",
    "Stan says there were 30 divergent transitions",
  ])
    assert.ok(reportsProblem(m), m);
  for (const m of [
    "Draft an email to my advisor about my progress",
    "Write a function that bins ages into decades",
    "Help me write a response to Reviewer 2 about our sample size",
    "Translate this SAS code to Python",
    "Write the abstract for my readmissions paper",
  ])
    assert.ok(!reportsProblem(m), m);
});

test("router keeps up to 3 ranked candidates", () => {
  const r = normalizeRouterOutput({
    kind: "lookup",
    rationale: "",
    conceptSlugs: [],
    framingQuestions: [],
    skipCallout: null,
    callouts: [A, B, C, callout("D", "d")],
    whyCallout: null,
  });
  assert.equal(r.kind, "lookup");
  assert.deepEqual(r.kind === "lookup" && r.callouts?.map((c) => c.title), ["A", "B", "C"]);
});

// ─── Variant content ────────────────────────────────────────────────────────

test("quick check: normalized (I don't know dropped), shuffled with correct index tracked", () => {
  const raw = { prompt: "Which leaks?", options: ["plan_type", "refund_date", "I don't know", "tenure"], correctIndex: 1, explanation: "It exists only after churn." };
  for (let seed = 0; seed < 30; seed++) {
    const c = normalizeSlotContent("quickcheck", raw, seededRng(seed));
    assert.equal(c.variant, "quickcheck");
    if (c.variant !== "quickcheck") return;
    assert.equal(c.quickcheck.options.length, 3);
    assert.ok(!c.quickcheck.options.includes("I don't know"));
    assert.equal(c.quickcheck.options[c.quickcheck.correctIndex], "refund_date");
  }
  assert.throws(() => normalizeSlotContent("quickcheck", { ...raw, correctIndex: 9 }));
  const s = shuffleQuickCheck({ prompt: "p", options: ["x", "y"], correctIndex: 0, explanation: "e" }, () => 0);
  assert.equal(s.options[s.correctIndex], "x");
});

test("copy: walk-through button is fixed; apply keeps the model's label", () => {
  const w = normalizeSlotContent("walkthrough", { headline: "Want to see why?", subline: "Two quick questions." });
  assert.equal(w.variant === "walkthrough" && w.copy.buttonLabel, WALKTHROUGH_BUTTON_LABEL);
  const a = normalizeSlotContent("apply", { headline: "Check your model", subline: "We'll look at your features.", buttonLabel: "Check my features" });
  assert.equal(a.variant === "apply" && a.copy.buttonLabel, "Check my features");
  assert.throws(() => normalizeSlotContent("apply", { headline: "", subline: "x", buttonLabel: "y" }));
});

test("quick-check feedback", () => {
  const q = { options: ["a", "b"], correctIndex: 1, explanation: "Because." };
  assert.equal(quickCheckFeedback(q, { correct: true, dontKnow: false }), "Right. Because.");
  assert.match(quickCheckFeedback(q, { correct: false, dontKnow: true }), /^The answer is "b"/);
  assert.match(quickCheckFeedback(q, { correct: false, dontKnow: false }), /^Not quite: the answer is "b"/);
});

test("dev override parsing", () => {
  assert.equal(parseSlotVariant("apply"), "apply");
  assert.equal(parseSlotVariant("bogus"), null);
  assert.equal(parseSlotVariant(null), null);
});

// ─── Results aggregation (E5) ───────────────────────────────────────────────

const T0 = new Date("2026-09-01T12:00:00Z");
const MIN = 60_000;
const at = (ms: number) => new Date(T0.getTime() + ms);
const NOW = at(24 * 60 * MIN); // a day later: nothing censored unless created later
const mk = (over: Partial<ImpressionFacts>): ImpressionFacts => ({
  userId: "u1",
  userGone: false,
  createdAt: T0,
  variant: "card",
  drawnVariant: "card",
  eligible: ["card", "quickcheck", "none"],
  featuredRank: 1,
  featuredIsWhy: false,
  candidateCount: 2,
  engagement: null,
  engagedAt: null,
  walkthroughStarted: false,
  framingCompleted: false,
  quickcheckCorrect: null,
  digIn7d: false,
  masteryDelta7d: null,
  conversationKnown: true,
  firstFollowUpAt: null,
  ...over,
});

test("results: ITT groups by DRAWN variant; fallbacks stay in their drawn arm; shown view separate", () => {
  const rows = [
    mk({ engagement: "dig_in", engagedAt: at(MIN), digIn7d: true }),
    mk({ engagement: "dig_in", engagedAt: at(3 * 60 * MIN), featuredRank: 2 }), // outside session
    // quickcheck drawn, content not ready → card shown, and the card was engaged
    mk({ variant: "card", drawnVariant: "quickcheck", engagement: "dig_in", engagedAt: at(MIN) }),
    mk({ variant: "quickcheck", drawnVariant: "quickcheck", engagement: "quickcheck_answered", engagedAt: T0, quickcheckCorrect: true, masteryDelta7d: 0.05 }),
    mk({ variant: "none", drawnVariant: "none" }),
  ];
  const r = aggregate(rows, 2, NOW);
  const card = r.byVariant.find((v) => v.variant === "card")!;
  const qc = r.byVariant.find((v) => v.variant === "quickcheck")!;
  assert.equal(card.impressions, 2);
  assert.deepEqual([card.engagedInSession.count, card.engagedEver.count], [1, 2]);
  assert.equal(card.fellBack.count, 0);
  assert.equal(qc.impressions, 2);
  assert.deepEqual([qc.engagedInSession.count, qc.engagedInSession.n], [2, 2]); // the fallback's engagement counts for C (ITT)
  assert.deepEqual([qc.fellBack.count, qc.fellBack.n], [1, 2]);
  assert.equal(qc.quickcheckCorrect?.rate, 1);
  assert.deepEqual([qc.masteryDelta7d.n, qc.masteryDelta7d.mean], [1, 0.05]);
  // Shown view: the fallback is under card.
  assert.equal(r.byShown.find((v) => v.variant === "card")!.impressions, 3);
  assert.equal(r.byShown.find((v) => v.variant === "quickcheck")!.impressions, 1);
  assert.equal(r.totals.engagedInSession.n, 4); // control excluded
  assert.equal(r.totals.engagedInSession.count, 3);
  assert.equal(r.totals.forcedExcluded, 2);
  assert.equal(r.byRank.find((x) => x.label === "Rank 2")!.impressions, 1);
  assert.deepEqual([r.rankDraw.rank1, r.rankDraw.randomizable], [4, 5]);
  assert.equal(r.totals.truncated, false);
  assert.equal(aggregate(rows, 0, NOW, { truncated: true }).totals.truncated, true);
});

test("results: eligibility-conditional comparisons only use impressions where the variant was eligible", () => {
  const withB: SlotVariant[] = ["card", "walkthrough", "quickcheck", "none"];
  const rows = [
    mk({ drawnVariant: "walkthrough", variant: "walkthrough", eligible: withB, engagedAt: at(MIN), engagement: "walkthrough_started" }),
    mk({ drawnVariant: "card", eligible: withB }),
    mk({ drawnVariant: "none", variant: "none", eligible: withB }),
    mk({ drawnVariant: "card", eligible: ["card", "quickcheck", "none"], engagedAt: at(MIN), engagement: "dig_in" }), // B not eligible
  ];
  const r = aggregate(rows, 0, NOW);
  const b = r.conditional.find((c) => c.variant === "walkthrough")!;
  assert.equal(b.eligibleImpressions, 3);
  const arm = (v: SlotVariant) => b.arms.find((a) => a.arm === v)!;
  assert.deepEqual([arm("walkthrough").impressions, arm("walkthrough").engagedInSession?.count], [1, 1]);
  assert.deepEqual([arm("card").impressions, arm("card").engagedInSession?.count], [1, 0]); // the engaged card outside the pool is excluded
  assert.equal(arm("none").engagedInSession, null);
  assert.equal(r.conditional.find((c) => c.variant === "apply")!.eligibleImpressions, 0);
});

test("results guardrail: engagement or user follow-up = not ended; censored and unknown rows excluded", () => {
  const w = 30 * MIN;
  assert.equal(endedAfter(mk({}), w, NOW), true);
  assert.equal(endedAfter(mk({ engagement: "dig_in", engagedAt: at(MIN) }), w, NOW), false); // any engagement, even with no message
  assert.equal(endedAfter(mk({ engagement: "dig_in", engagedAt: at(2 * w) }), w, NOW), true); // engaged, but after the window
  assert.equal(endedAfter(mk({ firstFollowUpAt: at(5 * MIN) }), w, NOW), false);
  assert.equal(endedAfter(mk({ firstFollowUpAt: at(2 * w) }), w, NOW), true);
  assert.equal(endedAfter(mk({ createdAt: at(24 * 60 * MIN - 5 * MIN) }), w, NOW), null); // right-censored
  assert.equal(endedAfter(mk({ conversationKnown: false }), w, NOW), null); // user reset
  const r = aggregate(
    [
      mk({}),
      mk({ firstFollowUpAt: at(MIN) }),
      mk({ createdAt: at(24 * 60 * MIN - MIN) }),
      mk({ conversationKnown: false, userGone: true, digIn7d: null }),
    ],
    0,
    NOW,
  );
  assert.deepEqual([r.totals.endedAfter.count, r.totals.endedAfter.n], [1, 2]);
  assert.equal(r.totals.censored, 1);
  assert.equal(r.totals.userGone, 1);
  assert.equal(r.byVariant.find((v) => v.variant === "card")!.digIn7d.n, 3); // unknown dig-in excluded
  // Slot-generated user messages don't count as follow-ups.
  assert.equal(isSlotGeneratedMessage({ origin: "slot", impressionId: "i", action: "apply" }), true);
  assert.equal(isSlotGeneratedMessage(null), false);
  assert.equal(isSlotGeneratedMessage({ calloutItemIds: [] }), false);
});

test("results: a dig-in is credited only to the latest earlier impression of the item, within 7 days", () => {
  const imps = [
    { key: "old", itemId: "item1", createdAt: T0 },
    { key: "new", itemId: "item1", createdAt: at(60 * MIN) },
    { key: "later", itemId: "item1", createdAt: at(10 * 24 * 60 * MIN) },
    { key: "other", itemId: "item2", createdAt: T0 },
  ];
  assert.deepEqual([...creditDigIns(imps, [{ itemId: "item1", at: at(2 * 60 * MIN) }])], ["new"]);
  assert.equal(creditDigIns(imps, [{ itemId: "item2", at: at(8 * 24 * 60 * MIN) }]).size, 0); // too late
  assert.equal(creditDigIns(imps, [{ itemId: "item1", at: at(-MIN) }]).size, 0); // before any impression
});

test("results: mastery delta excludes quick-check evidence; truncated log falls back to the snapshot", () => {
  const iso = (ms: number) => at(ms).toISOString();
  const evidence = [
    { delta: 0.1, at: iso(-MIN) }, // before the impression
    { delta: 0.05, at: iso(MIN), source: "quickcheck" as const },
    { delta: 0.08, at: iso(2 * MIN) },
    { delta: 0.2, at: iso(8 * 24 * 60 * MIN) }, // after 7 days
  ];
  assert.equal(masteryDelta7d({ t0: T0.getTime(), now: NOW.getTime(), snapshot: 0.5, current: { score: 0.93, evidence } }), 0.08);
  assert.equal(masteryDelta7d({ t0: T0.getTime(), now: NOW.getTime(), snapshot: 0.5, current: null }), null);
  // 30 entries, all newer than the impression → current − snapshot − visible quick checks.
  const full = Array.from({ length: 30 }, (_, i) => ({
    delta: 0.01,
    at: iso((i + 1) * MIN),
    ...(i === 0 ? { source: "quickcheck" as const } : {}),
  }));
  assert.equal(masteryDelta7d({ t0: T0.getTime(), now: NOW.getTime(), snapshot: 0.4, current: { score: 0.8, evidence: full } }), 0.39);
});

// ─── Resolve / fallback / dev override ──────────────────────────────────────

function runFor(variant: SlotVariant, content: SlotRun["content"]): SlotRun {
  const plan = planSlot({
    candidates: { why: null, ranked: [A] },
    unlocked: null,
    conceptAlreadyFramed: () => false,
    hasUserContext: true,
    config,
    rng: seededRng(1),
    forcedVariant: variant,
  })!;
  assert.equal(plan.variant, variant);
  return { plan, content };
}

test("resolveSlotContent: ready payload, timeout → card, failure → card; card/none never wait", async () => {
  const q = { prompt: "p", options: ["x", "y"], correctIndex: 0, explanation: "e" };
  const ok = await resolveSlotContent(runFor("quickcheck", Promise.resolve({ variant: "quickcheck", quickcheck: q })), 50);
  assert.deepEqual([ok.variant, ok.fallbackReason, ok.payload?.quickcheck?.prompt], ["quickcheck", null, "p"]);
  const slow = await resolveSlotContent(runFor("walkthrough", new Promise(() => {})), 20);
  assert.deepEqual([slow.variant, slow.fallbackReason, slow.payload], ["card", "content_not_ready", null]);
  const failed = await resolveSlotContent(runFor("apply", Promise.resolve(null)), 50);
  assert.deepEqual([failed.variant, failed.fallbackReason], ["card", "content_failed"]);
  const t = Date.now();
  const none = await resolveSlotContent(runFor("none", new Promise(() => {})), 5_000);
  assert.deepEqual([none.variant, none.fallbackReason], ["none", null]);
  assert.ok(Date.now() - t < 1_000);
});

test("devForcedVariant: honoured in dev, always null in production", () => {
  const env = process.env as Record<string, string | undefined>;
  const prev = env.NODE_ENV;
  try {
    env.NODE_ENV = "development";
    assert.equal(devForcedVariant(new Request("http://localhost/api/chat?slotVariant=apply")), "apply");
    assert.equal(devForcedVariant(new Request("http://localhost/api/chat", { headers: { "x-slot-variant": "none" } })), "none");
    assert.equal(devForcedVariant(new Request("http://localhost/api/chat?slotVariant=bogus")), null);
    env.NODE_ENV = "production";
    assert.equal(devForcedVariant(new Request("http://localhost/api/chat?slotVariant=apply")), null);
    assert.equal(devForcedVariant(new Request("http://localhost/api/chat", { headers: { "x-slot-variant": "none" } })), null);
  } finally {
    env.NODE_ENV = prev;
  }
});

// ─── Engagement claim / release ─────────────────────────────────────────────

function fakeStore(row: Record<string, unknown>): EngagementStore {
  const matches = (where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => (v === null ? row[k] == null : row[k] === v));
  const tx = {
    slotImpression: {
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (!matches(where)) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
  };
  return { $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) } as unknown as EngagementStore;
}

test("claimEngagement / releaseEngagement: claim once, release is idempotent, first engagement preserved", async () => {
  const row: Record<string, unknown> = { id: "i1", engagement: null, engagedAt: null, walkthroughStartedAt: null, quickcheckAnsweredAt: null };
  const store = fakeStore(row);
  assert.equal(await claimEngagement("i1", "walkthrough_started", {}, store), true);
  assert.equal(await claimEngagement("i1", "walkthrough_started", {}, store), false); // double click
  assert.equal(row.engagement, "walkthrough_started");
  await releaseEngagement("i1", "walkthrough_started", store);
  await releaseEngagement("i1", "walkthrough_started", store); // idempotent
  assert.deepEqual([row.walkthroughStartedAt, row.engagement, row.engagedAt], [null, null, null]);
  assert.equal(await claimEngagement("i1", "walkthrough_started", {}, store), true); // retry after release

  // A later, different engagement never overwrites the first; releasing it keeps the first.
  assert.equal(await claimEngagement("i1", "quickcheck_answered", { quickcheckResponse: { correct: true } }, store), true);
  assert.equal(row.engagement, "walkthrough_started");
  assert.deepEqual(row.quickcheckResponse, { correct: true });
  await releaseEngagement("i1", "quickcheck_answered", store);
  assert.equal(row.quickcheckAnsweredAt, null);
  assert.equal(row.engagement, "walkthrough_started");
  assert.equal(await claimEngagement("missing", "dig_in", {}, store), false);
});

// ─── whyCallout guard: topic nouns in plain requests ────────────────────────

test("whyCallout guard: bare topic nouns don't count as a problem report", () => {
  for (const m of [
    "Draft an email to my advisor explaining how we fixed the data leakage",
    "Write code to check my predictors for multicollinearity",
    "Write a function that handles null values in my dataframe",
    "Write a convergence check for my MCMC",
  ])
    assert.ok(!reportsProblem(m), m);
  for (const m of [
    "my model failed to converge",
    "the GLMM didn't converge after I added the random slope",
    "lme4 gives a convergence warning",
    "glm says fitted probabilities 0 or 1 occurred — perfect separation?",
    "boundary (singular) fit: see help('isSingular')",
    "there's NaN in my output",
    "I'm getting a negative R-squared",
    "why is my test accuracy higher than train?",
    "ValueError: Input contains NaN",
  ])
    assert.ok(reportsProblem(m), m);
  const why = callout("Why preprocessing leaks", "data-leakage");
  const task: RouterResult = { kind: "task", conceptSlugs: ["data-leakage"], rationale: "r", callouts: [A], whyCallout: why };
  const p = planRoute(task, { message: "Draft an email to my advisor explaining how we fixed the data leakage", earlier: [] });
  assert.equal(p.droppedWhy, true);
  assert.equal(p.candidates.why, null);
});

// ─── Quick-check normalization ──────────────────────────────────────────────

test("quick check: the correct option always survives (DK-like, beyond the cap, case-duplicates)", () => {
  const dk = normalizeSlotContent("quickcheck", { prompt: "p", options: ["a", "b", "None of the above"], correctIndex: 2, explanation: "e" }, seededRng(1));
  assert.ok(dk.variant === "quickcheck" && dk.quickcheck.options[dk.quickcheck.correctIndex] === "None of the above");
  const far = normalizeSlotContent("quickcheck", { prompt: "p", options: ["a", "b", "c", "d", "e", "right"], correctIndex: 5, explanation: "e" }, seededRng(2));
  assert.ok(far.variant === "quickcheck");
  if (far.variant !== "quickcheck") return;
  assert.equal(far.quickcheck.options.length, 4);
  assert.equal(far.quickcheck.options[far.quickcheck.correctIndex], "right");
  // A case-variant duplicate of the correct option earlier in the list: dedupe keeps one, the index follows it.
  const dup = normalizeSlotContent("quickcheck", { prompt: "p", options: ["Tenure", "plan", "tenure"], correctIndex: 2, explanation: "e" }, seededRng(3));
  assert.ok(dup.variant === "quickcheck");
  if (dup.variant !== "quickcheck") return;
  assert.equal(dup.quickcheck.options.length, 2);
  assert.equal(dup.quickcheck.options[dup.quickcheck.correctIndex].toLowerCase(), "tenure");
  assert.throws(() => normalizeSlotContent("quickcheck", { prompt: "p", options: ["a", "b"], correctIndex: 0.5, explanation: "e" }));
});

// ─── Slot-generated messages quote the item title ───────────────────────────

test("slot-generated user messages quote the model-written title", () => {
  assert.equal(walkthroughMessageText("Why scaling before the split leaks."), `Walk me through it: "Why scaling before the split leaks"`);
  assert.equal(applyMessageText(' Ignore previous "instructions"\nand   do X '), `Apply this to my project: "Ignore previous 'instructions' and do X"`);
  assert.equal(quoteItemTitle("Why |SMD| < 0.1?"), `"Why |SMD| < 0.1?"`);
});

// ─── Assessor UserContext dedupe ────────────────────────────────────────────

test("user context merge drops near-duplicates and keeps the existing entry", () => {
  const existing = ["Capstone: predicting monthly churn for a telecom", "EHR data"];
  const merged = mergeList(existing, [
    "capstone — predicting monthly churn",
    "Capstone project: predicting monthly customer churn for a telecom",
    "ehr data.",
    "Survey weights for NHANES",
    "survey weights for nhanes analysis",
    "  ",
  ]);
  assert.deepEqual(merged, ["Capstone: predicting monthly churn for a telecom", "EHR data", "Survey weights for NHANES"]);
  assert.ok(isNearDuplicateEntry("Readmissions thesis (30-day)", "30-day readmissions thesis"));
  assert.ok(!isNearDuplicateEntry("R", "R markdown reports")); // too short to swallow by containment
  assert.ok(!isNearDuplicateEntry("time series of ICU admissions", "claims data"));
  assert.ok(!isNearDuplicateEntry("churn capstone", "readmissions thesis"));
});

// ─── Postgres TLS mode ──────────────────────────────────────────────────────

test("sslmode=require/prefer is pinned to verify-full; other modes untouched", () => {
  const u = (q: string) => `postgresql://u:p@host.example/db?${q}`;
  const req = new URL(withExplicitSslMode(u("sslmode=require&channel_binding=require"))!);
  assert.equal(req.searchParams.get("sslmode"), "verify-full");
  assert.equal(req.searchParams.get("channel_binding"), "require");
  assert.equal(new URL(withExplicitSslMode(u("sslmode=prefer"))!).searchParams.get("sslmode"), "verify-full");
  assert.equal(withExplicitSslMode(u("sslmode=verify-full")), u("sslmode=verify-full"));
  assert.equal(withExplicitSslMode(u("sslmode=disable")), u("sslmode=disable"));
  assert.equal(withExplicitSslMode("postgresql://localhost/db"), "postgresql://localhost/db");
  assert.equal(withExplicitSslMode(undefined), undefined);
});
