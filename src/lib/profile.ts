// Learner profile (P1–P6): GET/PATCH /api/profile. Server-only.
import "server-only";
import { CONCEPTS_BY_SLUG } from "@/lib/concept-catalog";
import { db, type Prisma, type User } from "@/lib/db";
import { learnLaterItemInclude, toConceptDTO, toLearnLaterItemDTO, toLearningStyleDTO, toUserContextDTO } from "@/lib/dto";
import { MAX_DISMISSED_LEARN_LATER } from "@/lib/learn-later-list";
import { PERSONAS } from "@/lib/personas";
import { stylePatchData } from "@/lib/style-patch";
import { computeTier, progressToNextTier } from "@/lib/tiers";
import type {
  ConceptDTO,
  LearnLaterItemDTO,
  ProfileDTO,
  ProfilePatch,
  SuggestedTopic,
  TierInputs,
  UserContextDTO,
} from "@/lib/types";

/** Tier inputs (P7): answered framing exchanges + ConceptMastery rows. */
export async function getTierInputs(userId: string): Promise<TierInputs> {
  const [answeredFramingCount, conceptCount] = await Promise.all([
    db.framingExchange.count({ where: { userId, status: "answered" } }),
    db.conceptMastery.count({ where: { userId } }),
  ]);
  return { answeredFramingCount, conceptCount };
}

const LEARN_LATER_STATUS_ORDER = { queued: 0, dug_in: 1, dismissed: 2 } as const;
/** Dismissed items listed in the profile (the queue's "Dismissed" section), most recently dismissed first. */
const MAX_DISMISSED = MAX_DISMISSED_LEARN_LATER;

export async function getProfile(user: User): Promise<ProfileDTO> {
  const [answeredFramingCount, masteries, style, context, items, dismissedItems] = await Promise.all([
    db.framingExchange.count({ where: { userId: user.id, status: "answered" } }),
    db.conceptMastery.findMany({ where: { userId: user.id }, include: { concept: true } }),
    db.learningStyle.findUnique({ where: { userId: user.id } }),
    db.userContext.findUnique({ where: { userId: user.id } }),
    db.learnLaterItem.findMany({
      where: { userId: user.id, status: { not: "dismissed" } },
      include: learnLaterItemInclude,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    }),
    db.learnLaterItem.findMany({
      where: { userId: user.id, status: "dismissed" },
      include: learnLaterItemInclude,
      // Status changes bump updatedAt, so this is "most recently dismissed first".
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: MAX_DISMISSED,
    }),
  ]);

  const inputs: TierInputs = { answeredFramingCount, conceptCount: masteries.length };
  const tier = computeTier(inputs);

  // Concepts: most recently updated first (what Claude learned most
  // recently); ties broken by score, then name.
  const concepts = masteries
    .map(toConceptDTO)
    .sort(
      (a, b) =>
        Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || b.score - a.score || a.name.localeCompare(b.name),
    );

  // Learn It Later: queued first, then dug_in; newest first within each.
  const learnLater = items
    .map(toLearnLaterItemDTO)
    .sort(
      (a, b) =>
        LEARN_LATER_STATUS_ORDER[a.status] - LEARN_LATER_STATUS_ORDER[b.status] ||
        Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );

  const userContext = context ? toUserContextDTO(context) : null;

  return {
    persona: PERSONAS[user.personaKey],
    tier,
    progress: progressToNextTier(inputs),
    answeredFramingCount,
    concepts,
    learningStyle: style ? toLearningStyleDTO(style) : null,
    userContext,
    learnLater,
    dismissedLearnLater: dismissedItems.map(toLearnLaterItemDTO),
    suggestedTopics: tier >= 2 ? suggestTopics(concepts, learnLater, userContext) : [],
    lastAssessedAt: user.lastAssessedAt ? user.lastAssessedAt.toISOString() : null,
  };
}

// ─── Suggested next topics (Tier 2; deterministic, no LLM) ─────────────────

/** Below this a concept counts as "shaky"; at/above SOLID it counts as known. */
const SHAKY = 0.5;
const SOLID = 0.75;
const MAX_TOPICS = 4;

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
 * Candidates, in priority order (first reason wins for a slug):
 *   1. Shaky concepts themselves (lowest mastery first) — "Firm up X (mastery N%)."
 *   2. Catalog neighbours of queued Learn It Later items' concepts
 *   3. Catalog neighbours of shaky concepts
 *   4. Catalog neighbours of solid concepts — the natural next step
 * Excluded: concepts already solid, and concepts already sitting in the
 * queue (the queue itself covers those).
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

  const out: SuggestedTopic[] = [];
  const used = new Set<string>();
  /** Returns true if added. */
  const add = (slug: string, reason: string, allowKnown = false): boolean => {
    if (out.length >= MAX_TOPICS || used.has(slug) || queuedSlugs.has(slug)) return false;
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

  // 1. Shaky concepts (at most 2, so the list isn't all remediation).
  for (const c of shaky.slice(0, 2)) {
    add(c.slug, `Firm up ${inSentence(c.name)} (mastery ${pct(c.score)}).`, true);
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
  return out;
}

// ─── PATCH /api/profile ─────────────────────────────────────────────────────

/** Thrown by patchProfile below Tier 2 (route → 403 tier_locked). */
export class TierLockedError extends Error {
  constructor() {
    super("Profile editing unlocks at Tier 2");
    this.name = "TierLockedError";
  }
}

/**
 * Tier 2 only (P6): apply user corrections. Edited style dimensions get
 * `*Overridden = true` and confidence 1 (the user told us);
 * `resetLearningStyle` clears overrides and hands the dimension back to the
 * assessor (see stylePatchData in src/lib/style-patch.ts); context edits set
 * `userEdited = true`. Returns the fresh ProfileDTO.
 */
export async function patchProfile(user: User, patch: ProfilePatch): Promise<ProfileDTO> {
  if (computeTier(await getTierInputs(user.id)) < 2) throw new TierLockedError();

  const ops: Prisma.PrismaPromise<unknown>[] = [];

  const ls = patch.learningStyle;
  const resets = patch.resetLearningStyle ?? [];
  if ((ls && Object.keys(ls).length) || resets.length) {
    // Resets depend on the current row (only overridden dimensions change).
    const current = resets.length ? await db.learningStyle.findUnique({ where: { userId: user.id } }) : null;
    const data = stylePatchData(current, patch);
    if (Object.keys(data).length) {
      ops.push(
        db.learningStyle.upsert({
          where: { userId: user.id },
          update: data,
          create: { ...data, user: { connect: { id: user.id } } },
        }),
      );
    }
  }

  const uc = patch.userContext;
  if (uc && Object.keys(uc).length) {
    const clean = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
    const data = {
      ...(uc.field !== undefined && { field: uc.field?.trim() || null }),
      ...(uc.projects !== undefined && { projects: clean(uc.projects) }),
      ...(uc.dataTypes !== undefined && { dataTypes: clean(uc.dataTypes) }),
      ...(uc.notes !== undefined && { notes: uc.notes?.trim() || null }),
      userEdited: true,
    };
    ops.push(
      db.userContext.upsert({
        where: { userId: user.id },
        update: data,
        create: { ...data, user: { connect: { id: user.id } } },
      }),
    );
  }

  if (ops.length) await db.$transaction(ops);
  return getProfile(user);
}
