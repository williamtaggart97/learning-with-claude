// Empty-state starter prompts (D2): field-neutral generic set, balanced
// concept/lookup/task mix, and one context-tailored prompt when the profile
// matches. Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { BASE, TAILORED, starterPromptsFor, type StarterPrompt } from "@/components/chat/starter-prompts";
import { mentionsDeadline } from "@/lib/pipeline/route-policy";
import type { UserContextDTO } from "@/lib/types";

function counts(ps: StarterPrompt[]) {
  return {
    concept: ps.filter((p) => p.kind === "concept").length,
    lookup: ps.filter((p) => p.kind === "lookup").length,
    task: ps.filter((p) => p.kind === "task").length,
  };
}

function ctx(partial: Partial<UserContextDTO>): UserContextDTO {
  return { field: null, projects: [], dataTypes: [], notes: null, userEdited: false, ...partial };
}

// Maya's tailored prompt is incrementality (her queued Learn It Later topic),
// not attribution, which her seeded conversations already cover.
const INCREMENTALITY = /actually cause sales/i;

const MAYA = ctx({
  field: "Marketing associate, DTC e-commerce (email + paid social)",
  projects: ["Welcome-series subject-line A/B test", "Monthly campaign performance report"],
  dataTypes: ["Klaviyo campaign metrics", "Meta Ads Manager exports"],
});
const DEV = ctx({
  field: "MS Data Science (second year)",
  projects: ["Capstone: predicting monthly churn for a regional internet provider"],
  dataTypes: ["Monthly customer snapshots (~48k customers)"],
  notes: "Works in Python (pandas, scikit-learn, LightGBM).",
});

test("starter prompts: generic set covers all three kinds and has a deadline-free task", () => {
  const c = counts(BASE);
  assert.ok(c.concept >= 2 && c.lookup >= 2 && c.task >= 1, JSON.stringify(c));
  assert.ok(BASE.some((p) => p.kind === "task" && !mentionsDeadline(p.prompt)));
  assert.equal(new Set(BASE.map((p) => p.title)).size, BASE.length);
});

test("starter prompts: no context (Sam) gets the generic set, balanced, no tailored prompt", () => {
  for (const context of [null, ctx({})]) {
    const ps = starterPromptsFor(context);
    assert.deepEqual(ps, BASE.slice(0, 6));
    const c = counts(ps);
    assert.ok(c.concept >= 2 && c.lookup >= 2 && c.task >= 1, JSON.stringify(c));
  }
});

test("starter prompts: generic set doesn't assume data science", () => {
  const shown = BASE.slice(0, 6);
  const dataOnly = shown.filter((p) => p.field === "data" || /p-value|regression|pandas|\bR\b|t-test|bootstrap/i.test(p.prompt));
  assert.ok(dataOnly.length <= 1, dataOnly.map((p) => p.title).join(", "));
  const fields = new Set(shown.map((p) => p.field));
  assert.ok(fields.size >= 3, [...fields].join(", "));
});

test("starter prompts: tailored prompts are deadline-free and replace a same-kind generic prompt", () => {
  for (const t of TAILORED) {
    assert.ok(!mentionsDeadline(t.prompt.prompt), t.prompt.title);
    const replaced = BASE.find((p) => p.title === t.replaces);
    assert.ok(replaced, `${t.prompt.title} replaces a missing title: ${t.replaces}`);
    assert.equal(replaced.kind, t.prompt.kind, t.prompt.title);
  }
});

test("starter prompts: max < 6 still leads with the tailored prompt and keeps the mix", () => {
  for (const max of [1, 2, 3, 4, 5]) {
    const ps = starterPromptsFor(MAYA, max);
    assert.equal(ps.length, max);
    assert.match(ps[0].prompt, INCREMENTALITY);
    assert.deepEqual(counts(ps), counts(BASE.slice(0, max)), `max=${max}`);
  }
  assert.deepEqual(starterPromptsFor(null, 3), BASE.slice(0, 3));
  assert.deepEqual(starterPromptsFor(DEV, 1).map((p) => p.title), ["Picking a churn threshold"]);
});

test("starter prompts: marketing match needs a marketing term, not a bare email or campaign", () => {
  for (const context of [
    ctx({ field: "Policy analyst", projects: ["Political campaign finance data"] }),
    ctx({ field: "PhD student, sociology", notes: "Prefers email over Slack." }),
  ])
    assert.deepEqual(starterPromptsFor(context), BASE.slice(0, 6));
  assert.match(starterPromptsFor(ctx({ field: "Growth lead", projects: ["Q3 paid social tests"] }))[0].prompt, INCREMENTALITY);
});

test("starter prompts: marketer gets the marketing prompt first, mix stays balanced", () => {
  const ps = starterPromptsFor(MAYA);
  assert.equal(ps.length, 6);
  assert.equal(ps[0].kind, "concept");
  assert.match(ps[0].prompt, INCREMENTALITY);
  assert.deepEqual(counts(ps), counts(BASE.slice(0, 6)));
  assert.equal(new Set(ps.map((p) => p.title)).size, ps.length);
  // The marketing-relevant A/B prompt stays; the writing concept makes room.
  assert.ok(ps.some((p) => /A\/B/.test(p.title)));
  assert.ok(!ps.some((p) => /show, don/i.test(p.title)));
});

test("starter prompts: Dev keeps the churn prompt, mix stays balanced", () => {
  const ps = starterPromptsFor(DEV);
  assert.match(ps[0].title, /churn/i);
  assert.equal(ps.filter((p) => /churn/i.test(p.prompt)).length, 1);
  assert.deepEqual(counts(ps), counts(BASE.slice(0, 6)));
});

test("starter prompts: unrelated field gets no tailored prompt", () => {
  assert.deepEqual(starterPromptsFor(ctx({ field: "Nursing student", projects: ["Care plan for a pediatric rotation"] })), BASE.slice(0, 6));
});
