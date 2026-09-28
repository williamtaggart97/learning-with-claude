// Loaders that turn DB state into prompt context (learner snapshot, concept
// catalog, conversation turns). Server-only.
import "server-only";
import type { LearnerSnapshot, PromptTurn } from "@/lib/claude/prompts";
import { formatFramingQA } from "@/lib/claude/prompts";
import { CONCEPT_CATALOG } from "@/lib/concept-catalog";
import { db } from "@/lib/db";
import { FramingQuestionsSchema, FramingResponseSchema } from "@/lib/schemas";
import type { FramingQuestion, FramingResponse } from "@/lib/types";

const MAX_CONCEPTS_IN_SNAPSHOT = 40;

export async function loadLearnerSnapshot(userId: string): Promise<LearnerSnapshot> {
  const [masteries, style, context] = await Promise.all([
    db.conceptMastery.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: MAX_CONCEPTS_IN_SNAPSHOT,
      include: { concept: { select: { slug: true, name: true } } },
    }),
    db.learningStyle.findUnique({ where: { userId } }),
    db.userContext.findUnique({ where: { userId } }),
  ]);
  return {
    concepts: masteries.map((m) => ({ slug: m.concept.slug, name: m.concept.name, score: m.score })),
    style: style
      ? {
          intuitionVsFormal: {
            value: style.intuitionVsFormal,
            confidence: style.intuitionVsFormalConfidence,
            overridden: style.intuitionVsFormalOverridden,
          },
          entryPoint: {
            value: style.entryPoint,
            confidence: style.entryPointConfidence,
            overridden: style.entryPointOverridden,
          },
          briefVsThorough: {
            value: style.briefVsThorough,
            confidence: style.briefVsThoroughConfidence,
            overridden: style.briefVsThoroughOverridden,
          },
        }
      : null,
    context: context
      ? { field: context.field, projects: context.projects, dataTypes: context.dataTypes, notes: context.notes }
      : null,
  };
}

export type CatalogEntry = { slug: string; name: string };

const STATIC_CATALOG: CatalogEntry[] = CONCEPT_CATALOG.map((c) => ({ slug: c.slug, name: c.name }));

/** Base catalog + extra concepts (deduped by slug; base entries win). Pure. */
export function mergeCatalog(base: readonly CatalogEntry[], extra: readonly CatalogEntry[]): CatalogEntry[] {
  const bySlug = new Map(base.map((c) => [c.slug, { slug: c.slug, name: c.name }]));
  for (const c of extra) if (!bySlug.has(c.slug)) bySlug.set(c.slug, { slug: c.slug, name: c.name });
  return [...bySlug.values()];
}

/**
 * Prompt catalog for one user: the static CONCEPT_CATALOG plus the concepts
 * this user has a mastery for. Never the global Concept table, so concepts
 * other users introduced don't leak into this user's prompts.
 */
export async function loadCatalog(userId: string): Promise<CatalogEntry[]> {
  const own = await db.conceptMastery.findMany({
    where: { userId },
    select: { concept: { select: { slug: true, name: true } } },
  });
  return mergeCatalog(
    STATIC_CATALOG,
    own.map((m) => m.concept),
  );
}

export function parseQuestions(json: unknown): FramingQuestion[] {
  const r = FramingQuestionsSchema.safeParse(json);
  return r.success ? r.data : [];
}

export function parseResponses(json: unknown): FramingResponse[] | null {
  if (!Array.isArray(json)) return null;
  const out: FramingResponse[] = [];
  for (const item of json) {
    const r = FramingResponseSchema.safeParse(item);
    if (r.success) out.push(r.data);
  }
  return out;
}

/**
 * Conversation turns as flattened text, oldest first. Framing messages are
 * rendered as their questions + responses so later calls see what happened.
 * `before` excludes messages created at/after that time.
 */
export async function loadTurns(
  conversationId: string,
  opts: { before?: Date; excludeIds?: string[]; limit?: number } = {},
): Promise<PromptTurn[]> {
  const rows = await db.message.findMany({
    where: {
      conversationId,
      ...(opts.before ? { createdAt: { lt: opts.before } } : {}),
      ...(opts.excludeIds?.length ? { id: { notIn: opts.excludeIds } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 16,
    include: {
      framingForMessage: { select: { questions: true, responses: true, status: true, answerMessageId: true } },
    },
  });
  rows.reverse();
  const turns: PromptTurn[] = [];
  for (const m of rows) {
    if (m.kind === "framing") {
      const ex = m.framingForMessage;
      if (!ex) continue;
      const qs = parseQuestions(ex.questions);
      const listed = qs.map((q) => `- ${q.prompt}`).join("\n");
      const qa =
        ex.status === "skipped"
          ? ex.answerMessageId
            ? `${listed}\n(The user skipped these and asked for the answer directly.)`
            : // Auto-skipped: the user sent a new message instead (no answer was given).
              `${listed}\n(left unanswered; the user moved on)`
          : formatFramingQA(qs, parseResponses(ex.responses));
      turns.push({ role: "assistant", text: `[Framing questions before answering]\n${qa}` });
      continue;
    }
    if (!m.content.trim()) continue;
    turns.push({ role: m.role, text: m.content });
  }
  return turns;
}
