// Offline checks for the three-way router (L4, L8, L9) and task-mode
// assessment (P7). No network, no database.
//
// Run: node --conditions=react-server --import tsx --test tests/three-way-router.test.ts
// (react-server lets the "server-only" imports resolve outside Next.js.)
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAnswerRequest } from "@/lib/claude/answerer";
import { assessorUserPrompt } from "@/lib/claude/prompts";
import { normalizeRouterOutput, ROUTER_JSON_SCHEMA } from "@/lib/claude/router";
import { applyConcept, canCreateMastery, type AssessmentJob } from "@/lib/pipeline/assess";
import { alsoSavedCallouts, asksForDeliverable, featuredCallouts, mentionsDeadline, planRoute } from "@/lib/pipeline/route-policy";
import type { RouterResult } from "@/lib/types";

const callout = (title: string, conceptSlug: string) => ({
  title,
  preview: `${title} preview.`,
  appliedContext: `${title} applied.`,
  conceptSlug,
});
const raw = (over: Record<string, unknown>) => ({
  kind: "lookup",
  rationale: "r",
  conceptSlugs: [],
  framingQuestions: [],
  skipCallout: null,
  callouts: [],
  whyCallout: null,
  ...over,
});

// ─── Router schema + normalizer ─────────────────────────────────────────────

test("router JSON schema offers task and requires whyCallout", () => {
  const props = ROUTER_JSON_SCHEMA.properties as Record<string, { enum?: string[] }>;
  assert.deepEqual(props.kind.enum, ["concept", "lookup", "task"]);
  assert.ok((ROUTER_JSON_SCHEMA.required as string[]).includes("whyCallout"));
});

test("task with a whyCallout: duplicate dropped BEFORE the cap, why card is the featured item", () => {
  const r = normalizeRouterOutput(
    raw({
      kind: "task",
      conceptSlugs: ["Data Leakage"],
      callouts: [callout("Leakage again", "data-leakage"), callout("Stratified split", "stratified-split"), callout("CV", "cross-validation")],
      whyCallout: callout("Why scaling before the split leaks", "data-leakage"),
    }),
  );
  assert.equal(r.kind, "task");
  if (r.kind !== "task") return;
  assert.deepEqual(r.conceptSlugs, ["data-leakage"]);
  assert.equal(r.whyCallout?.title, "Why scaling before the split leaks");
  // Deduped first, then capped at 2 → both remaining candidates survive.
  assert.deepEqual(r.callouts?.map((c) => c.conceptSlug), ["stratified-split", "cross-validation"]);
  assert.deepEqual(featuredCallouts(r).map((c) => c.conceptSlug), ["data-leakage"]);
});

test("task without a whyCallout (null or malformed): top-ranked callout is featured", () => {
  for (const whyCallout of [null, { title: "", preview: "", appliedContext: "", conceptSlug: "" }]) {
    const r = normalizeRouterOutput(
      raw({ kind: "task", whyCallout, callouts: [callout("Seed", "reproducibility"), callout("Split", "train-test-split")] }),
    );
    assert.equal(r.kind, "task");
    if (r.kind !== "task") return;
    assert.equal(r.whyCallout, null);
    assert.equal(r.callouts?.length, 2);
    assert.deepEqual(featuredCallouts(r).map((c) => c.conceptSlug), ["reproducibility"]);
  }
});

test("lookup ignores a stray whyCallout", () => {
  const l = normalizeRouterOutput(raw({ whyCallout: callout("x", "x") }));
  assert.equal(l.kind, "lookup");
  assert.ok(!("whyCallout" in l));
});

test("concept with unusable framing degrades to task for a deliverable, else lookup", () => {
  const bad = raw({ kind: "concept", framingQuestions: [], skipCallout: callout("Odds ratio", "odds-ratio") });
  const c = normalizeRouterOutput(bad, "What does an odds ratio of 2 mean?");
  assert.equal(c.kind, "lookup");
  assert.deepEqual(featuredCallouts(c).map((x) => x.conceptSlug), ["odds-ratio"]);
  const t = normalizeRouterOutput(bad, "Can you write the results sentence for my odds ratio?");
  assert.equal(t.kind, "task");
  if (t.kind === "task") assert.equal(t.whyCallout, null);
  assert.deepEqual(featuredCallouts(t).map((x) => x.conceptSlug), ["odds-ratio"]);
});

test("close call: a concept keeps exactly 1 framing question, a clear concept keeps up to 3", () => {
  assert.ok((ROUTER_JSON_SCHEMA.required as string[]).includes("closeCall"));
  const questions = ["What is a debt constant?", "Who bears the risk?", "What happens to DSCR?", "What is a balloon?"].map((prompt) => ({
    prompt,
    format: "short_answer",
    options: [],
  }));
  const framed = (closeCall: boolean) =>
    normalizeRouterOutput(
      raw({ kind: "concept", closeCall, framingQuestions: questions, skipCallout: callout("Debt constant", "debt-constant") }),
    );
  const close = framed(true);
  assert.equal(close.kind, "concept");
  if (close.kind !== "concept") return;
  assert.deepEqual(close.framingQuestions.map((q) => q.prompt), ["What is a debt constant?"]);
  assert.match(close.rationale, /close call/);
  const clear = framed(false);
  if (clear.kind !== "concept") return assert.fail("expected concept");
  assert.equal(clear.framingQuestions.length, 3);
  assert.doesNotMatch(clear.rationale, /close call/);
});

test("alsoSavedCallouts: the other candidates, why card first, capped so a lookup saves at most 3 items", () => {
  const [a, b, c, d] = ["a", "b", "c", "d"].map((s) => callout(s.toUpperCase(), s));
  assert.deepEqual(alsoSavedCallouts({ why: null, ranked: [a, b, c] }, b).map((x) => x.title), ["A", "C"]);
  assert.deepEqual(alsoSavedCallouts({ why: null, ranked: [a] }, a), []);
  // A why card is always the featured one, so the ranked hidden decisions follow it.
  assert.deepEqual(alsoSavedCallouts({ why: d, ranked: [a, b, c] }, d).map((x) => x.title), ["A", "B"]);
});

test("deliverable heuristic", () => {
  for (const m of ["Write a function that bins ages", "Can you draft an email to my advisor?", "help me fix this merge", "I need a paragraph for my methods section", "I need a subject line for the spring sale email", "Can you polish my cover letter?", "I need a creative brief for the spring launch", "I need a formula that flags duplicate emails"])
    assert.ok(asksForDeliverable(m), m);
  for (const m of ["What does a p-value mean?", "Why do we divide by n-1? My draft is due tomorrow.", "Which test should I use?", "I need a brief explanation of p-values", "I need the formula for standard deviation"])
    assert.ok(!asksForDeliverable(m), m);
});

test("unknown kind throws (routeMessage then falls back to lookup)", () => {
  assert.throws(() => normalizeRouterOutput(raw({ kind: "other" })));
});

// ─── Route plan (chat.ts wiring: L4 deadline, L9 once per topic, L5 one item) ─

const concept: RouterResult = {
  kind: "concept",
  conceptSlugs: ["bessel-correction", "sample-variance"],
  rationale: "why n-1",
  framingQuestions: [{ id: "q1", prompt: "What is the sample mean estimating?", format: "short_answer" }],
  skipCallout: callout("Bessel's correction", "bessel-correction"),
};

test("already framed but not answered → lookup, skipCallout is the one saved item", () => {
  const plan = planRoute(concept, {
    message: "Why n-1 again?",
    earlier: [{ conceptSlugs: ["sample-variance", "other"], status: "skipped" }],
  });
  assert.equal(plan.downgraded, "already_framed");
  assert.equal(plan.route.kind, "lookup");
  assert.equal(plan.answerMode, "lookup");
  assert.deepEqual(plan.matchedSlugs, ["sample-variance"]);
  assert.deepEqual(plan.persist.map((c) => c.title), ["Bessel's correction"]);
});

test("already framed AND answered → lookup, nothing re-queued", () => {
  const plan = planRoute(concept, {
    message: "Why n-1 again?",
    earlier: [
      { conceptSlugs: ["bessel-correction"], status: "skipped" },
      { conceptSlugs: ["sample-variance"], status: "answered" },
    ],
  });
  assert.equal(plan.downgraded, "already_framed");
  assert.equal(plan.answerMode, "lookup");
  assert.deepEqual(plan.persist, []);
  assert.deepEqual(plan.matchedSlugs.sort(), ["bessel-correction", "sample-variance"]);
});

test("close-call concept on an already-framed topic is framed again (one question); a full framing is not", () => {
  const earlier = [{ conceptSlugs: ["bessel-correction"], status: "answered" }];
  const again = planRoute({ ...concept, closeCall: true }, { message: "But what about small samples?", earlier });
  assert.equal(again.downgraded, null);
  assert.equal(again.answerMode, null);
  assert.equal(again.route.kind, "concept");
  assert.equal(planRoute(concept, { message: "But what about small samples?", earlier }).downgraded, "already_framed");
});

test("close-call cooldown: framed again only 3 user messages after the last framing", () => {
  const close = { ...concept, closeCall: true };
  const at = (messagesSinceFraming: number | null) =>
    planRoute(close, { message: "But on the origination side", earlier: [], messagesSinceFraming });
  // Never framed in this conversation: no cooldown.
  assert.equal(at(null).downgraded, null);
  // Messages 1 and 2 after a framing are answered straight away, skipCallout saved.
  for (const n of [1, 2]) {
    const p = at(n);
    assert.equal(p.downgraded, "cooldown");
    assert.equal(p.answerMode, "lookup");
    assert.deepEqual(p.persist.map((c) => c.conceptSlug), ["bessel-correction"]);
  }
  // The 3rd message after a framing may be framed again.
  const third = at(3);
  assert.equal(third.downgraded, null);
  assert.equal(third.route.kind, "concept");
  // A full (non-close-call) framing is not subject to the cooldown.
  assert.equal(planRoute(concept, { message: "x", earlier: [], messagesSinceFraming: 1 }).downgraded, null);
});

test("concept on a new topic is framed (earlier exchanges on other slugs ignored)", () => {
  const plan = planRoute(concept, { message: "Why n-1?", earlier: [{ conceptSlugs: ["odds-ratio"], status: "answered" }] });
  assert.equal(plan.downgraded, null);
  assert.equal(plan.answerMode, null);
  assert.equal(plan.route, concept);
  assert.deepEqual(plan.persist, []);
});

test("concept mentioning a deadline → direct answer mode, lookup-shaped, skipCallout saved", () => {
  const plan = planRoute(concept, {
    message: "Why do we divide by n-1? My thesis draft is due tomorrow.",
    earlier: [],
  });
  assert.equal(plan.downgraded, "deadline");
  assert.equal(plan.route.kind, "lookup");
  assert.equal(plan.answerMode, "direct");
  assert.deepEqual(plan.matchedSlugs, concept.conceptSlugs);
  assert.deepEqual(plan.persist.map((c) => c.title), ["Bessel's correction"]);
});

test("concept + deadline + deliverable → task mode", () => {
  const plan = planRoute(concept, { message: "Write the paragraph explaining n-1, I need it by 5pm", earlier: [] });
  assert.equal(plan.downgraded, "deadline");
  assert.equal(plan.route.kind, "task");
  assert.equal(plan.answerMode, "task");
});

test("deadline beats already-framed", () => {
  const plan = planRoute(concept, {
    message: "Remind me why n-1? Defense is in 2 days.",
    earlier: [{ conceptSlugs: ["bessel-correction"], status: "answered" }],
  });
  assert.equal(plan.downgraded, "deadline");
  assert.equal(plan.answerMode, "direct");
});

test("lookup and task results pass through; only the featured item is persisted", () => {
  const task: RouterResult = {
    kind: "task",
    conceptSlugs: ["bessel-correction"],
    rationale: "",
    callouts: [callout("A", "a"), callout("B", "b")],
    whyCallout: callout("Why", "why"),
  };
  const t = planRoute(task, { message: "my glmer throws a convergence warning, need it by Friday", earlier: [{ conceptSlugs: ["bessel-correction"], status: "answered" }] });
  assert.equal(t.route, task);
  assert.equal(t.answerMode, "task");
  assert.equal(t.downgraded, null);
  assert.deepEqual(t.persist.map((c) => c.title), ["Why"]);

  const lookup: RouterResult = { kind: "lookup", conceptSlugs: [], rationale: "", callouts: [callout("A", "a"), callout("B", "b")] };
  const l = planRoute(lookup, { message: "welch t-test in R?", earlier: [] });
  assert.equal(l.answerMode, "lookup");
  assert.deepEqual(l.persist.map((c) => c.title), ["A"]);
  assert.equal(l.route.kind === "lookup" && l.route.callouts?.length, 2); // ranked list kept, not persisted

  const bare: RouterResult = { kind: "lookup", conceptSlugs: [], rationale: "" };
  assert.deepEqual(planRoute(bare, { message: "thanks", earlier: [] }).persist, []);
});

test("deadline detection", () => {
  for (const m of [
    "I need the model done by Friday.",
    "deadline is next week",
    "This is due tomorrow",
    "need it by end of day",
    "Can you do it ASAP",
    "My defense is in 3 hours",
    "before tonight please",
    "the report is due Fri",
    "it's due Friday",
    "chapter due 10/3",
    "can you get this to me by 5pm",
    "my defense is in 2 days",
    "I have a committee meeting tomorrow",
    "need it EOD",
    "due by Monday",
    "due in 2 days",
    "due on Thursday",
    "due at 9am",
    "by this Friday",
    "tomorrow's presentation needs this slide",
    "I'm really short on time here",
    "sorry, in a rush",
    "the campaign goes out tomorrow",
    "the landing page is going live on Friday",
    "I have a client pitch tomorrow",
    "my exam is in 2 days",
    "campaign launches tomorrow",
    "we go live tomorrow",
    "the campaign goes out in 2 hours",
    "my exam is on Friday",
    "the pitch is on Thursday",
    "my final is tomorrow",
    "quiz tomorrow",
    "I have a midterm tonight",
    "our demo is in 3 hours",
  ]) assert.ok(mentionsDeadline(m), m);
  for (const m of [
    "Why do we divide by n-1?",
    "The drop was due to censoring",
    "urgent care visits by month",
    "group by day of week",
    "bin ages by decade",
    "plot ridership by morning and evening peaks",
    "compare admissions by Saturday vs weekday",
    "aggregate claims by end of month",
    "I have data from 2010 until today",
    "the bias is due in part to selection",
    "is the effect due at least partly to confounding?",
    "cortisol levels peak in 2 hours after dosing",
    "the meeting variable is coded 0/1",
    "open rates by day of week",
    "sales went up after the launch",
    "which demographic segments convert best?",
    "Why do sales drop the day after a launch? We saw it after the launch today",
    "what makes a good demo? the demo I saw today was bad",
    "Why do exam scores regress to the mean? The exam results came back today",
    "Why is the learning phase longer when an ad goes live on Friday?",
    "should the final model include the interaction term?",
  ]) assert.ok(!mentionsDeadline(m), m);
});

// ─── Answerer + assessor: task and direct modes ─────────────────────────────

const learner = { concepts: [], style: null, context: null };

test("task answer mode uses the work-product-first instructions", () => {
  const { system, messages } = buildAnswerRequest({ mode: "task", learner, history: [], message: "Draft an email" });
  assert.match(system, /Deliver the work product FIRST/);
  assert.match(system, /deliverable always comes first, whatever their entry-point preference/);
  assert.match(system, /Never add names, numbers, results, dates or project details/);
  assert.match(system, /[placeholders]/);
  assert.match(system, /never name, label or announce it/);
  assert.equal(messages.at(-1)?.content, "Draft an email");
});

test("task mode hides project/data context from the answerer; other modes keep it", () => {
  const withCtx = {
    ...learner,
    context: { field: "MPH, epidemiology", projects: ["30-day readmission thesis"], dataTypes: ["EHR"], notes: "SNF focus" },
  };
  const task = buildAnswerRequest({ mode: "task", learner: withCtx, history: [], message: "Draft an email" }).system;
  assert.match(task, /MPH, epidemiology/);
  assert.doesNotMatch(task, /readmission|EHR|SNF/);
  const lookup = buildAnswerRequest({ mode: "lookup", learner: withCtx, history: [], message: "x" }).system;
  assert.match(lookup, /30-day readmission thesis/);
});

test("direct answer mode: a concise concept answer, no produce-something framing", () => {
  const { system } = buildAnswerRequest({ mode: "direct", learner, history: [], message: "Why n-1? Due tomorrow." });
  assert.match(system, /concept question but is short on time/);
  assert.doesNotMatch(system, /asked you to produce/);
  assert.match(system, /never name, label or announce it/);
  const p = assessorUserPrompt({
    mode: "direct",
    learnerText: "",
    catalog: [],
    queuedTitles: [],
    turns: [],
    userMessage: "Why n-1? Due tomorrow.",
    framingQA: null,
    answer: "Because…",
  });
  assert.match(p, /time pressure/);
  assert.match(p, /only concepts already in the learner's mastery list/);
  assert.equal(canCreateMastery("direct"), false);
});

test("assessor prompt for task mode forbids new concepts", () => {
  const p = assessorUserPrompt({
    mode: "task",
    learnerText: "",
    catalog: [],
    queuedTitles: [],
    turns: [],
    userMessage: "fix my code",
    framingQA: null,
    answer: "done",
  });
  assert.match(p, /was a task/);
  assert.match(p, /only concepts already in the learner's mastery list/);
});

test("task mode never creates a mastery (P7), only updates existing ones", async () => {
  assert.equal(canCreateMastery("task"), false);
  assert.equal(canCreateMastery("lookup"), false);
  assert.equal(canCreateMastery("framing"), true);

  const job: AssessmentJob = {
    userId: "u1",
    conversationId: "c1",
    userMessageId: "m1",
    answerMessageId: "a1",
    mode: "task",
    userMessage: "fix",
    answer: "fixed",
    history: [],
  };
  const assessed = { slug: "data-leakage", name: "Data leakage", masteryDelta: 0.05, evidence: "You spotted it." };
  const fakeTx = (existing: { score: number; evidence: unknown[] } | null) => {
    const writes: unknown[] = [];
    const tx = {
      concept: {
        findUnique: async () => ({ id: "k1", domain: "ml" }),
        upsert: async () => (writes.push("concept.upsert"), { id: "k1", domain: "ml" }),
        update: async () => writes.push("concept.update"),
      },
      conceptMastery: {
        findUnique: async () => existing,
        upsert: async (args: { update: { score: number } }) => writes.push(["mastery.upsert", args.update.score]),
      },
    };
    return { tx: tx as unknown as Parameters<typeof applyConcept>[0], writes };
  };

  const none = fakeTx(null);
  assert.equal(await applyConcept(none.tx, job, assessed, "t"), "ignored");
  assert.deepEqual(none.writes, []);

  const some = fakeTx({ score: 0.5, evidence: [] });
  assert.equal(await applyConcept(some.tx, job, assessed, "t"), "updated");
  assert.deepEqual(some.writes, [["mastery.upsert", 0.55]]);
});

// ─── One framing question on a vague / parroted task or lookup ──────────────

const oneQ = [{ prompt: "Who is the chart for?", format: "short_answer", options: [] }];

test("task and lookup keep at most ONE framing question from the router", () => {
  const task = normalizeRouterOutput(
    raw({ kind: "task", framingQuestions: [...oneQ, { prompt: "Second?", format: "short_answer", options: [] }] }),
  );
  assert.equal(task.kind === "task" && task.framingQuestions?.length, 1);
  const lookup = normalizeRouterOutput(raw({ kind: "lookup", framingQuestions: oneQ }));
  assert.equal(lookup.kind === "lookup" && lookup.framingQuestions?.[0].id, "q1");
  const none = normalizeRouterOutput(raw({ kind: "task" }));
  assert.equal(none.kind === "task" && none.framingQuestions, undefined);
});

test("task/lookup framing question survives only while the timer is open and with no deadline", () => {
  const task = normalizeRouterOutput(raw({ kind: "task", framingQuestions: oneQ }));
  const msg = "make me a chart of my data";
  const open = planRoute(task, { message: msg, earlier: [], messagesSinceFraming: null });
  assert.equal(open.route.kind !== "concept" && open.route.framingQuestions?.length, 1);
  assert.equal(open.answerMode, "task");

  const closed = planRoute(task, { message: msg, earlier: [], messagesSinceFraming: 2 });
  assert.equal(closed.route.kind !== "concept" && closed.route.framingQuestions, undefined);

  const deadline = planRoute(task, { message: `${msg}, due tomorrow`, earlier: [], messagesSinceFraming: 3 });
  assert.equal(deadline.route.kind !== "concept" && deadline.route.framingQuestions, undefined);
});

test("framed task answer follows the task rules and hides project context; framed lookup is quick", () => {
  const withCtx = { concepts: [], style: null, context: { field: "marketing", projects: ["Secret Q3 launch"], dataTypes: [], notes: null } };
  const questions = [{ id: "q1", prompt: "Who is it for?", format: "short_answer" as const }];
  const responses = [{ questionId: "q1", answer: "my manager", dontKnow: false }];
  const task = buildAnswerRequest({ mode: "framing", deliver: "task", learner: withCtx, history: [], message: "chart my data", questions, responses });
  assert.match(task.system, /Deliver the work product first/);
  assert.doesNotMatch(task.system, /Secret Q3 launch/);
  const lookup = buildAnswerRequest({ mode: "framing", deliver: "lookup", learner: withCtx, history: [], message: "x", questions, responses });
  assert.match(lookup.system, /quick lookup/);
  assert.match(lookup.system, /Secret Q3 launch/);
});

// ─── Dig-in: profile connections + closing framing questions ────────────────

test("dig-in answer sees the learner's other concepts and always ends with framing questions", () => {
  const item = { title: "Bessel's correction", preview: "p", appliedContext: "a", conceptSlug: "bessel-correction" };
  const concepts = [
    { slug: "bessel-correction", name: "Bessel's correction", score: 0.3 },
    { slug: "sampling-distribution", name: "Sampling distributions", score: 0.6 },
    { slug: "welch-t-test", name: "Welch t-test", score: 0.8 },
  ];
  const { system, messages } = buildAnswerRequest({
    mode: "dig_in",
    learner: { ...learner, concepts },
    history: [],
    message: "Let's dig into it.",
    item,
    sourceTurns: [],
  });
  const final = String(messages.at(-1)?.content);
  assert.match(final, /<related_concepts>[\s\S]*Sampling distributions \(sampling-distribution\): developing[\s\S]*Welch t-test \(welch-t-test\): solid/);
  assert.doesNotMatch(final.split("<related_concepts>")[1].split("</related_concepts>")[0], /Bessel/);
  assert.match(final, /Their mastery of it: shaky/);
  assert.match(system, /Finish with framing questions, ALWAYS/);
  assert.match(system, /NEVER reveal the answer/);
});

test("dig-in with no other concepts says so instead of inventing connections", () => {
  const { messages } = buildAnswerRequest({
    mode: "dig_in",
    learner,
    history: [],
    message: "Let's dig in.",
    item: { title: "T", preview: "p", appliedContext: "a", conceptSlug: null },
    sourceTurns: [],
  });
  assert.match(String(messages.at(-1)?.content), /<related_concepts>\n\(none yet\)\n<\/related_concepts>/);
});
