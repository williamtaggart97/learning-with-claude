// Suggested next topics (P6): stay in the learner's field when they have one.
// Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { maya } from "../prisma/seed-data/maya";
import { CONCEPTS_BY_SLUG } from "@/lib/concept-catalog";
import { homeDomain, suggestTopics } from "@/lib/suggested-topics";
import type { ConceptDTO, LearnLaterItemDTO, UserContextDTO } from "@/lib/types";

function concept(slug: string, score: number): ConceptDTO {
  const c = CONCEPTS_BY_SLUG.get(slug);
  assert.ok(c, `unknown slug ${slug}`);
  return { slug, name: c.name, domain: c.domain, score, evidence: [], updatedAt: "2026-09-01T00:00:00.000Z" };
}

/** Maya's seeded profile, as getProfile() would see it (score = sum of deltas; queue newest first). */
const mayaConcepts = maya.masteries.map((m) => concept(m.slug, m.evidence.reduce((s, e) => s + e.delta, 0)));
const mayaQueue: LearnLaterItemDTO[] = maya.learnLater
  .map((i, n) => ({
    id: i.ref,
    title: i.title,
    preview: i.preview,
    appliedContext: i.appliedContext,
    conceptSlug: i.conceptSlug ?? null,
    status: i.status,
    origin: i.origin,
    sourceConversationId: null,
    sourceMessageId: null,
    createdAt: new Date(Date.UTC(2026, 8, 1 + n)).toISOString(),
  }))
  .reverse();
const mayaContext: UserContextDTO = {
  field: maya.context?.field ?? null,
  projects: maya.context?.projects ?? [],
  dataTypes: maya.context?.dataTypes ?? [],
  notes: maya.context?.notes ?? null,
  userEdited: false,
};

test("suggested topics: Maya's are all marketing", () => {
  assert.equal(homeDomain(mayaConcepts), "marketing");
  const topics = suggestTopics(mayaConcepts, mayaQueue, mayaContext);
  assert.equal(topics.length, 4);
  for (const t of topics) {
    assert.equal(CONCEPTS_BY_SLUG.get(t.conceptSlug!)?.domain, "marketing", `${t.title}: ${t.reason}`);
  }
});

test("suggested topics: falls back to other domains when the home domain runs dry", () => {
  const concepts = [concept("seo-basics", 0.6), concept("positioning", 0.8), concept("p-values", 0.3)];
  const topics = suggestTopics(concepts, [], null);
  assert.ok(topics.some((t) => CONCEPTS_BY_SLUG.get(t.conceptSlug!)?.domain !== "marketing"));
  assert.equal(topics[0].conceptSlug, "copywriting-frameworks");
});

test("suggested topics: no home domain when concepts are spread out", () => {
  const concepts = ["linear-regression", "confounding", "bootstrap", "cross-validation"].map((s) => concept(s, 0.6));
  assert.equal(homeDomain(concepts), null);
});
