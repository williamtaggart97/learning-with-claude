// Suggested next topics (P6, Tier 2; deterministic, no LLM). Pure — used by
// getProfile() in src/lib/profile.ts and by tests.
import { CONCEPTS_BY_SLUG } from "@/lib/concept-catalog";
import type { ConceptDTO, LearnLaterItemDTO, SuggestedTopic, UserContextDTO } from "@/lib/types";

/** Below this a concept counts as "shaky"; at/above SOLID it counts as known. */
const SHAKY = 0.5;
const SOLID = 0.75;
const MAX_TOPICS = 4;
const MAX_FIRM_UPS = 2;

/** Project descriptions ("Predicting churn…" → "predicting churn…"). */
function lowerFirst(text: string): string {
  return /^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text;
}

/**
 * Leading words that stay capitalized mid-sentence: eponyms and proper nouns
 * ("Cox proportional hazards model", "Welch's t-test", "Kaplan–Meier").
 * Acronyms ("ANOVA", "ROC curves", "DAGs") are detected by shape instead.
 */
const PROPER_LEADING_WORDS = new Set([
  "bayes", "bayesian", "benjamini", "bernoulli", "bonferroni", "box", "brier", "chi", "cohen", "cox",
  "fisher", "gaussian", "gini", "holm", "hosmer", "huber", "kaplan", "kolmogorov", "kruskal", "mann",
  "markov", "monte", "pearson", "poisson", "shapiro", "spearman", "student", "tukey", "wald", "welch",
  "wilcoxon",
]);

/**
 * A concept name mid-sentence: "Competing risks" → "competing risks",
 * "The bootstrap" → "the bootstrap". Only a plain capitalized first word
 * (/^[A-Z][a-z]+$/: no hyphen, dash, apostrophe or digit) that isn't a known
 * proper noun is lowercased; anything else keeps its case ("Cox…",
 * "Simpson's paradox", "G-computation", "Nelson–Aalen", "ANOVA", "P-values").
 */
function inSentence(name: string): string {
  const first = name.split(/[\s(]/, 1)[0] ?? "";
  if (!/^[A-Z][a-z]+$/.test(first)) return name;
  if (PROPER_LEADING_WORDS.has(first.toLowerCase())) return name;
  return name[0].toLowerCase() + name.slice(1);
}

function projectPhrase(ctx: UserContextDTO | null): string | null {
  const p = ctx?.projects[0];
  if (!p) return null;
  const stripped = p.includes(":") ? p.slice(p.indexOf(":") + 1).trim() : p;
  return stripped ? lowerFirst(stripped) : null;
}

function promptFor(name: string, ctx: UserContextDTO | null): string {
  const project = projectPhrase(ctx);
  const topic = inSentence(name);
  return project
    ? `I'd like to understand ${topic} better. How would it apply to my work on ${project}?`
    : `I'd like to understand ${topic} better. Can you walk me through it with an example?`;
}

const pct = (score: number) => `${Math.round(score * 100)}%`;

/**
 * The learner's home domain: the catalog domain holding at least half of
 * their concepts (a marketer's "marketing"), or null when their concepts are
 * spread out (a data scientist's regression / inference / causal inference…).
 */
export function homeDomain(concepts: ConceptDTO[]): string | null {
  const counts = new Map<string, number>();
  for (const c of concepts) if (c.domain) counts.set(c.domain, (counts.get(c.domain) ?? 0) + 1);
  for (const [domain, n] of counts) if (n * 2 >= concepts.length) return domain;
  return null;
}

/**
 * Candidates, in priority order (first reason wins for a slug):
 *   1. Shaky concepts themselves (lowest mastery first) — "Firm up X (mastery N%)."
 *   2. Catalog neighbours of queued Learn It Later items' concepts
 *   3. Catalog neighbours of shaky concepts
 *   4. Catalog neighbours of solid concepts — the natural next step
 * Excluded: concepts already solid, and concepts already sitting in the
 * queue (the queue itself covers those).
 *
 * With a home domain, steps 1–4 run first over home-domain candidates only,
 * then again over everything to fill any gaps, so a marketer's list isn't
 * led by statistics just because the catalog links the two.
 */
export function suggestTopics(
  concepts: ConceptDTO[],
  learnLater: LearnLaterItemDTO[],
  ctx: UserContextDTO | null,
): SuggestedTopic[] {
  const mastery = new Map(concepts.map((c) => [c.slug, c]));
  const queued = learnLater.filter((i) => i.status === "queued");
  const queuedSlugs = new Set(queued.map((i) => i.conceptSlug).filter((s): s is string => !!s));
  const byScore = [...concepts].sort((a, b) => a.score - b.score || a.slug.localeCompare(b.slug));
  const shaky = byScore.filter((c) => c.score < SHAKY);
  const solid = [...byScore].reverse().filter((c) => c.score >= SOLID);
  const home = homeDomain(concepts);
  const domainOf = (slug: string) => mastery.get(slug)?.domain ?? CONCEPTS_BY_SLUG.get(slug)?.domain ?? null;

  const out: SuggestedTopic[] = [];
  const used = new Set<string>();
  let homeOnly = home !== null;
  let firmUps = 0;
  /** Returns true if added. */
  const add = (slug: string, reason: string, allowKnown = false): boolean => {
    if (out.length >= MAX_TOPICS || used.has(slug) || queuedSlugs.has(slug)) return false;
    if (homeOnly && domainOf(slug) !== home) return false;
    const known = mastery.get(slug);
    if (known && known.score >= SOLID) return false;
    if (known && !allowKnown) return false; // neighbours should be new territory
    const name = known?.name ?? CONCEPTS_BY_SLUG.get(slug)?.name;
    if (!name) return false;
    used.add(slug);
    out.push({ title: name, reason, conceptSlug: slug, prompt: promptFor(name, ctx) });
    return true;
  };
  // Steps 2–4 take at most one neighbour per source, so reasons stay varied.
  const firstNeighbour = (source: string, reason: string) =>
    (CONCEPTS_BY_SLUG.get(source)?.related ?? []).some((slug) => add(slug, reason));

  for (;;) {
    // 1. Shaky concepts (at most 2, so the list isn't all remediation).
    for (const c of shaky) {
      if (firmUps >= MAX_FIRM_UPS) break;
      if (add(c.slug, `Firm up ${inSentence(c.name)} (mastery ${pct(c.score)}).`, true)) firmUps++;
    }
    // 2. Neighbours of queued Learn It Later concepts.
    for (const item of queued) {
      if (item.conceptSlug) firstNeighbour(item.conceptSlug, `Pairs with "${item.title}", waiting in your Learn It Later queue.`);
    }
    // 3. Neighbours of shaky concepts.
    for (const c of shaky) {
      firstNeighbour(c.slug, `Goes hand in hand with ${inSentence(c.name)}, which you're still firming up (${pct(c.score)}).`);
    }
    // 4. Neighbours of solid concepts.
    for (const c of solid) {
      firstNeighbour(c.slug, `The natural next step after ${inSentence(c.name)}, which you're solid on (${pct(c.score)}).`);
    }
    if (!homeOnly || out.length >= MAX_TOPICS) return out;
    homeOnly = false;
  }
}
