// Offline checks for the end-of-answer slot review fixes: the slot describes
// the item actually shown (R13 reuse), headline drift / apply over-promise
// guards, the narrowed slot prompt, and the client's Learn It Later list
// moves. No network, no database.
//
// Run: node --conditions=react-server --import tsx --test tests/*.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  APPLY_FALLBACK_BUTTON,
  contentWords,
  fallbackHeadline,
  headlineAboutItem,
  normalizeSlotContent,
  stemWord,
} from "@/lib/claude/slot";
import { formatSlotLearner, slotContentUserPrompt, type LearnerSnapshot } from "@/lib/claude/prompts";
import { findReusableLearnLaterItem, type LearnLaterItemWithConcept, type LearnLaterLookupStore } from "@/lib/learn-later";
import { liveLearnLaterItem, MAX_DISMISSED_LEARN_LATER, withLearnLaterItem } from "@/lib/learn-later-list";
import { aggregate, type ImpressionFacts } from "@/lib/slot/results";
import { seededRng, slotContentItem } from "@/lib/slot/policy";
import { reconcileSlotContent, type ResolvedSlot } from "@/lib/slot/service";
import type { LearnLaterCallout, LearnLaterItemDTO } from "@/lib/types";

// ─── R13 lookup (read-only) ─────────────────────────────────────────────────

function row(over: Partial<LearnLaterItemWithConcept> & { id: string; title: string }): LearnLaterItemWithConcept {
  return {
    userId: "u1",
    conceptId: null,
    preview: "p",
    appliedContext: "a",
    status: "queued",
    origin: "flagged",
    sourceConversationId: null,
    sourceMessageId: null,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    updatedAt: new Date("2026-09-01T00:00:00Z"),
    concept: null,
    ...over,
  } as LearnLaterItemWithConcept;
}

/** In-memory stand-in for the Prisma calls the lookup makes. No create: the lookup must never write. */
function fakeStore(concepts: Record<string, string>, items: LearnLaterItemWithConcept[]): LearnLaterLookupStore {
  type Where = { userId?: string; conceptId?: string | null; status?: string; id?: string };
  const matches = (i: LearnLaterItemWithConcept, w: Where) =>
    (w.userId === undefined || i.userId === w.userId) &&
    (w.conceptId === undefined || i.conceptId === w.conceptId) &&
    (w.status === undefined || i.status === w.status) &&
    (w.id === undefined || i.id === w.id);
  return {
    concept: {
      findUnique: async ({ where }: { where: { slug: string } }) => (concepts[where.slug] ? { id: concepts[where.slug] } : null),
    },
    learnLaterItem: {
      findFirst: async ({ where }: { where: Where }) =>
        items.filter((i) => matches(i, where)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
      findMany: async ({ where }: { where: Where }) => items.filter((i) => matches(i, where)),
      findUnique: async ({ where }: { where: Where }) => items.find((i) => i.id === where.id) ?? null,
    },
  } as unknown as LearnLaterLookupStore;
}

const leakCallout: LearnLaterCallout = {
  title: "Leakage from post-discharge features",
  preview: "Features recorded after discharge leak the outcome.",
  appliedContext: "Your readmission model used discharge notes.",
  conceptSlug: "target-leakage",
};

test("findReusableLearnLaterItem: same concept → the queued item; dismissed ones and other users don't count", async () => {
  const queued = row({ id: "q1", title: "Target leakage", conceptId: "c-leak", concept: { slug: "target-leakage" } });
  const store = fakeStore({ "target-leakage": "c-leak" }, [
    row({ id: "d1", title: "Target leakage (old)", conceptId: "c-leak", status: "dismissed" }),
    row({ id: "o1", title: "Target leakage", conceptId: "c-leak", userId: "u2" }),
    queued,
  ]);
  assert.equal((await findReusableLearnLaterItem("u1", leakCallout, store))?.id, "q1");
  assert.equal(await findReusableLearnLaterItem("u3", leakCallout, store), null);
});

test("findReusableLearnLaterItem: no catalog concept → normalized-title match among concept-less items", async () => {
  const store = fakeStore({}, [row({ id: "t1", title: "Welch vs. Student: t test" })]);
  const hit = await findReusableLearnLaterItem("u1", { title: "  welch vs student t test ", conceptSlug: "not-in-catalog" }, store);
  assert.equal(hit?.id, "t1");
  assert.equal(await findReusableLearnLaterItem("u1", { title: "Something else", conceptSlug: undefined }, store), null);
});

// ─── The slot describes the item shown ──────────────────────────────────────

test("slotContentItem: a reused item's title/preview/appliedContext replace the callout's", () => {
  const reused = {
    id: "q1",
    title: "Target leakage",
    preview: "Old preview",
    appliedContext: "Old context",
    concept: { slug: "target-leakage" },
  };
  assert.deepEqual(slotContentItem(leakCallout, reused), {
    title: "Target leakage",
    preview: "Old preview",
    appliedContext: "Old context",
    conceptSlug: "target-leakage",
  });
  assert.deepEqual(slotContentItem(leakCallout, null), { ...leakCallout, conceptSlug: "target-leakage" });
});

test("reconcileSlotContent: payload written for another item → card (item_changed); matching or card untouched", () => {
  const copy: ResolvedSlot = {
    variant: "walkthrough",
    payload: { copy: { headline: "h", subline: "s", buttonLabel: "b" } },
    fallbackReason: null,
  };
  assert.equal(reconcileSlotContent({ contentItemId: "q1" }, copy, "q1"), copy);
  assert.equal(reconcileSlotContent({ contentItemId: null }, copy, null), copy);
  // Reused item dismissed mid-answer → the upsert created a new one.
  assert.deepEqual(reconcileSlotContent({ contentItemId: "q1" }, copy, null), {
    variant: "card",
    payload: null,
    fallbackReason: "item_changed",
  });
  // A new item was expected but another request queued one meanwhile.
  assert.equal(reconcileSlotContent({ contentItemId: null }, copy, "q9").fallbackReason, "item_changed");
  const card: ResolvedSlot = { variant: "card", payload: null, fallbackReason: null };
  assert.equal(reconcileSlotContent({ contentItemId: "q1" }, card, null), card);
});

// ─── Narrowed prompt ────────────────────────────────────────────────────────

const learner: LearnerSnapshot = {
  concepts: [
    { slug: "target-leakage", name: "Target leakage", score: 0.42 },
    { slug: "regularization", name: "Regularization", score: 0.8 },
  ],
  style: {
    intuitionVsFormal: { value: -0.5, confidence: 0.7, overridden: false },
    entryPoint: { value: null, confidence: 0, overridden: false },
    briefVsThorough: { value: 0, confidence: 0.2, overridden: false },
  },
  context: { field: "Biostatistics", projects: ["30-day readmission model"], dataTypes: ["EHR data"], notes: "Prefers R" },
};

test("formatSlotLearner: only the featured concept's mastery + projects and data types", () => {
  const text = formatSlotLearner(learner, "target-leakage");
  assert.match(text, /0\.42/);
  assert.match(text, /30-day readmission model/);
  assert.match(text, /EHR data/);
  for (const absent of ["regularization", "Regularization", "Biostatistics", "Prefers R", "intuition"]) {
    assert.ok(!text.includes(absent), `should not mention ${absent}`);
  }
  assert.match(formatSlotLearner(learner, null), /not assessed yet/);
  assert.match(formatSlotLearner({ ...learner, context: null }, "target-leakage"), /not known/);
});

test("slotContentUserPrompt: card comes last, then the restated headline rule", () => {
  const item = slotContentItem(leakCallout, null);
  const prompt = slotContentUserPrompt({ item, message: "Why is my AUC 0.99?", learnerText: "x", turns: [] });
  assert.ok(prompt.indexOf("<learn_it_later_card>") > prompt.indexOf("<user_message_being_answered>"));
  assert.ok(prompt.indexOf("<learn_it_later_card>") > prompt.indexOf("<learner_profile>"));
  assert.ok(
    prompt.includes(
      "The headline must be about Leakage from post-discharge features (target-leakage). Don't make it about other concepts in the profile or conversation.",
    ),
  );
});

// ─── Headline drift + apply honesty guards ──────────────────────────────────

const item = { title: "Target leakage", conceptSlug: "target-leakage", preview: "Features recorded after the outcome leak it into training." };

test("stemming and content words", () => {
  assert.equal(stemWord("leakage"), "leak");
  assert.equal(stemWord("imputation"), stemWord("impute").slice(0, 5));
  assert.equal(stemWord("losses"), stemWord("loss"));
  assert.deepEqual(contentWords("Want to see why this matters here?"), []);
  assert.ok(headlineAboutItem("Want to see why leaks inflate AUC this much?", item));
  assert.ok(headlineAboutItem("Why features from after the outcome break validation", item));
  assert.ok(!headlineAboutItem("Want to see why regularization shrinks coefficients?", item));
});

test("normalizeSlotContent: a headline about another concept falls back to a template about the item", () => {
  const drift = normalizeSlotContent(
    "walkthrough",
    { headline: "Want to see why regularization shrinks coefficients?", subline: "Two quick questions." },
    seededRng(1),
    item,
  );
  assert.equal(drift.variant === "walkthrough" && drift.copy.headline, fallbackHeadline("walkthrough", "Target leakage"));
  assert.equal(drift.variant === "walkthrough" && drift.copy.headline, "Want to see why Target leakage matters here?");
  const onTopic = normalizeSlotContent("walkthrough", { headline: "Want to see how leakage inflates AUC?", subline: "s" }, seededRng(1), item);
  assert.equal(onTopic.variant === "walkthrough" && onTopic.copy.headline, "Want to see how leakage inflates AUC?");
  // Without the item (old callers) nothing is rewritten.
  const bare = normalizeSlotContent("walkthrough", { headline: "Anything at all?", subline: "s" });
  assert.equal(bare.variant === "walkthrough" && bare.copy.headline, "Anything at all?");
});

test("normalizeSlotContent: apply copy never promises to compute / run / execute", () => {
  const a = normalizeSlotContent(
    "apply",
    { headline: "Check your readmission features for leakage", subline: "We'll run your model without them.", buttonLabel: "Compute my AUC" },
    seededRng(1),
    item,
  );
  assert.ok(a.variant === "apply");
  if (a.variant !== "apply") return;
  assert.equal(a.copy.buttonLabel, APPLY_FALLBACK_BUTTON);
  assert.equal(a.copy.headline, "Check your readmission features for leakage");
  assert.ok(!/\b(run|comput|execut)/i.test(a.copy.subline), a.copy.subline);
  assert.match(a.copy.subline, /Target leakage/);
  for (const label of ["Run it", "Execute check", "Recompute AUC", "Calculate the lift"]) {
    const c = normalizeSlotContent("apply", { headline: "Check leakage in your model", subline: "s", buttonLabel: label }, seededRng(1), item);
    assert.equal(c.variant === "apply" && c.copy.buttonLabel, APPLY_FALLBACK_BUTTON, label);
  }
  const ok = normalizeSlotContent("apply", { headline: "Check leakage in your model", subline: "s", buttonLabel: "Check my features" }, seededRng(1), item);
  assert.equal(ok.variant === "apply" && ok.copy.buttonLabel, "Check my features");
  const promiseHeadline = normalizeSlotContent("apply", { headline: "Run your leakage audit", subline: "s", buttonLabel: "Check" }, seededRng(1), item);
  assert.equal(promiseHeadline.variant === "apply" && promiseHeadline.copy.headline, fallbackHeadline("apply", "Target leakage"));
});

// ─── Results: new vs reused item ────────────────────────────────────────────

test("results: byItemSource separates new, reused and not-recorded impressions (control excluded)", () => {
  const T0 = new Date("2026-09-01T12:00:00Z");
  const base: ImpressionFacts = {
    userId: "u1",
    userGone: false,
    createdAt: T0,
    variant: "card",
    drawnVariant: "card",
    eligible: ["card", "none"],
    featuredRank: 1,
    featuredIsWhy: false,
    candidateCount: 1,
    reusedItem: false,
    engagement: null,
    engagedAt: null,
    walkthroughStarted: false,
    framingCompleted: false,
    quickcheckCorrect: null,
    digIn7d: false,
    masteryDelta7d: null,
    conversationKnown: true,
    firstFollowUpAt: null,
  };
  const r = aggregate(
    [
      base,
      { ...base, reusedItem: true, engagement: "dig_in", engagedAt: new Date(T0.getTime() + 60_000) },
      { ...base, reusedItem: true },
      { ...base, reusedItem: true, drawnVariant: "none", variant: "none" },
    ],
    0,
    new Date(T0.getTime() + 86_400_000),
  );
  const by = Object.fromEntries(r.byItemSource.map((row) => [row.label, row]));
  assert.equal(by["New item"].impressions, 1);
  assert.equal(by["Already-queued item (reused)"].impressions, 2);
  assert.equal(by["Already-queued item (reused)"].engagedInSession.count, 1);
  assert.equal(by["Not recorded"], undefined, "hidden when there are no legacy rows");
  const legacy = aggregate([{ ...base, reusedItem: null }], 0, new Date(T0.getTime() + 86_400_000));
  assert.equal(legacy.byItemSource.find((row) => row.label === "Not recorded")?.impressions, 1);
});

// ─── Client list moves ──────────────────────────────────────────────────────

function dto(id: string, status: LearnLaterItemDTO["status"], createdAt: string): LearnLaterItemDTO {
  return {
    id,
    title: id,
    preview: "p",
    appliedContext: "a",
    conceptSlug: null,
    status,
    origin: "flagged",
    sourceConversationId: null,
    sourceMessageId: null,
    createdAt,
  };
}

test("withLearnLaterItem: dismiss → front of dismissed; restore → queue in profile order; dig in stays listed", () => {
  const a = dto("a", "queued", "2026-09-03T00:00:00Z");
  const b = dto("b", "queued", "2026-09-02T00:00:00Z");
  const c = dto("c", "dug_in", "2026-09-04T00:00:00Z");
  const old = dto("old", "dismissed", "2026-08-01T00:00:00Z");
  const profile = { learnLater: [a, b, c], dismissedLearnLater: [old] };

  const dismissed = withLearnLaterItem(profile, { ...a, status: "dismissed" });
  assert.deepEqual(dismissed.learnLater.map((i) => i.id), ["b", "c"]);
  assert.deepEqual(dismissed.dismissedLearnLater.map((i) => i.id), ["a", "old"]);

  const restored = withLearnLaterItem(dismissed, { ...a, status: "queued" });
  assert.deepEqual(restored.learnLater.map((i) => i.id), ["a", "b", "c"], "queued (newest first) before dug in");
  assert.deepEqual(restored.dismissedLearnLater.map((i) => i.id), ["old"]);

  const dug = withLearnLaterItem(profile, { ...b, status: "dug_in" });
  assert.deepEqual(dug.learnLater.map((i) => `${i.id}:${i.status}`), ["a:queued", "c:dug_in", "b:dug_in"]);
  assert.equal(dug.dismissedLearnLater.length, 1);

  // Other profile fields ride along untouched.
  const withExtra = withLearnLaterItem({ ...profile, tier: 2 }, { ...a, status: "dismissed" });
  assert.equal(withExtra.tier, 2);
});

test("withLearnLaterItem: the local dismissed list is capped like GET /api/profile", () => {
  const many = Array.from({ length: MAX_DISMISSED_LEARN_LATER }, (_, i) => dto(`d${i}`, "dismissed", "2026-08-01T00:00:00Z"));
  const next = withLearnLaterItem({ learnLater: [dto("x", "queued", "2026-09-01T00:00:00Z")], dismissedLearnLater: many }, {
    ...dto("x", "dismissed", "2026-09-01T00:00:00Z"),
  });
  assert.equal(next.dismissedLearnLater.length, MAX_DISMISSED_LEARN_LATER);
  assert.equal(next.dismissedLearnLater[0].id, "x");
  assert.equal(next.dismissedLearnLater.at(-1)?.id, `d${MAX_DISMISSED_LEARN_LATER - 2}`);
});

test("liveLearnLaterItem: the profile's copy wins (e.g. dismissed from the queue panel)", () => {
  const shown = dto("a", "queued", "2026-09-03T00:00:00Z");
  assert.equal(liveLearnLaterItem({ learnLater: [], dismissedLearnLater: [{ ...shown, status: "dismissed" }] }, shown).status, "dismissed");
  assert.equal(liveLearnLaterItem({ learnLater: [], dismissedLearnLater: [] }, shown), shown);
});

