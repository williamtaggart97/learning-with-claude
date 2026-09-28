// Assessor orchestration + persistence (A3, R12). Runs inside `after()`;
// failures are logged, never surfaced. Server-only.
import "server-only";
import { assessExchange } from "@/lib/claude/assessor";
import { formatFramingQA, formatLearner, NEW_CONCEPT_BASELINE, type AnswerMode, type PromptTurn } from "@/lib/claude/prompts";
import { CONCEPTS_BY_SLUG } from "@/lib/concept-catalog";
import { db, Prisma, type EntryPoint } from "@/lib/db";
import { upsertLearnLaterItem } from "@/lib/learn-later";
import { loadCatalog, loadLearnerSnapshot } from "@/lib/pipeline/context";
import { MasteryEvidenceSchema, StyleEvidenceSchema } from "@/lib/schemas";
import type {
  AssessedUserContext,
  AssessorResult,
  FramingQuestion,
  FramingResponse,
  LearnLaterCallout,
  MasteryEvidence,
  StyleEvidence,
  StyleSignal,
} from "@/lib/types";

export interface AssessmentJob {
  userId: string;
  conversationId: string;
  /** The user message that started the exchange (evidence/messageId + item source). */
  userMessageId: string;
  answerMessageId: string;
  mode: AnswerMode;
  userMessage: string;
  answer: string;
  history: PromptTurn[];
  framing?: { questions: FramingQuestion[]; responses: FramingResponse[] };
  skipCallout?: LearnLaterCallout | null;
}

const MAX_MASTERY_EVIDENCE = 30;
const MAX_STYLE_EVIDENCE = 40;
const MAX_CONTEXT_ITEMS = 10;
const ASSESSOR_TIMEOUT_MS = 60_000;
/** Per-row transaction limits (DB work only — no network calls inside). */
const ROW_TX_TIMEOUT_MS = 10_000;
const ROW_TX_ATTEMPTS = 3;
/** Confidence after the first entryPoint signal: like the axes, ~2 agreeing signals to pass 0.2. */
export const ENTRY_POINT_INITIAL_CONFIDENCE = 0.15;
/** How long the `after()` callback waits for the stream to finish before giving up. */
export const ASSESSMENT_MAX_WAIT_MS = 240_000;

/**
 * A promise the route's `after()` callback awaits: the stream resolves it
 * with a job once `done` is persisted, or with null on error/disconnect.
 */
export function createAssessmentGate() {
  let settle!: (job: AssessmentJob | null) => void;
  const promise = new Promise<AssessmentJob | null>((resolve) => (settle = resolve));
  return {
    promise,
    resolve: (job: AssessmentJob) => settle(job),
    cancel: () => settle(null),
  };
}
export type AssessmentGate = ReturnType<typeof createAssessmentGate>;

/** Body of the `after()` callback. Never throws. */
export async function runAfterStream(gate: AssessmentGate, maxWaitMs: number): Promise<void> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), maxWaitMs).unref?.());
  const job = await Promise.race([gate.promise, timeout]);
  if (job) await runAssessment(job);
}

/** Assess one exchange and persist the result. Always sets User.lastAssessedAt. */
export async function runAssessment(job: AssessmentJob): Promise<void> {
  try {
    const [learner, catalog, queued] = await Promise.all([
      loadLearnerSnapshot(job.userId),
      loadCatalog(job.userId),
      db.learnLaterItem.findMany({
        where: { userId: job.userId, status: "queued" },
        select: { title: true },
        take: 30,
      }),
    ]);
    const result = await assessExchange(
      {
        mode: job.mode,
        learnerText: formatLearner(learner),
        catalog,
        queuedTitles: queued.map((q) => q.title),
        turns: job.history.slice(-6),
        userMessage: job.userMessage,
        framingQA: job.framing ? formatFramingQA(job.framing.questions, job.framing.responses) : null,
        answer: job.answer,
        skipCallout: job.skipCallout,
      },
      AbortSignal.timeout(ASSESSOR_TIMEOUT_MS),
    );
    await persistAssessment(job, result);
  } catch (err) {
    console.error("[assessor] failed:", err);
  } finally {
    await db.user
      .update({ where: { id: job.userId }, data: { lastAssessedAt: new Date() } })
      .catch((err) => console.error("[assessor] lastAssessedAt update failed:", err));
  }
}

/**
 * Persist an assessment. Each profile row (one mastery, the style row, the
 * context row) is read-modified-written in its own short SERIALIZABLE
 * transaction, retried on a serialization conflict, so two assessors running
 * concurrently for the same user can't silently drop each other's evidence.
 * One row failing doesn't stop the others.
 */
export async function persistAssessment(job: AssessmentJob, result: AssessorResult): Promise<void> {
  const at = new Date().toISOString();
  type Step = [label: string, run: (tx: Tx) => Promise<unknown>];
  const steps: Step[] = [
    ...result.concepts.map((c): Step => [`concept ${c.slug}`, (tx) => applyConcept(tx, job, c, at)]),
    ...(result.styleSignals.length
      ? [["style", (tx) => applyStyleSignals(tx, job, result.styleSignals, at)] satisfies Step]
      : []),
    ...(hasContext(result.userContext)
      ? [["userContext", (tx) => applyUserContext(tx, job.userId, result.userContext)] satisfies Step]
      : []),
    // Flagged Learn It Later items are queued in every mode (P7 limits concepts, not the queue).
    ...result.learnLaterItems.map(
      (callout): Step => [
        `learnLater ${callout.title}`,
        (tx) =>
          upsertLearnLaterItem(
            {
              userId: job.userId,
              callout,
              origin: "flagged",
              sourceConversationId: job.conversationId,
              sourceMessageId: job.userMessageId,
            },
            tx,
          ),
      ],
    ),
  ];
  for (const [label, step] of steps) {
    try {
      await withRowTx(step);
    } catch (err) {
      console.error(`[assessor] persisting ${label} failed:`, err);
    }
  }
}

type Tx = Prisma.TransactionClient;

async function withRowTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: ROW_TX_TIMEOUT_MS,
      });
    } catch (err) {
      const retryable =
        (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2034" || err.code === "P2002")) ||
        /could not serialize|deadlock/i.test(String((err as Error)?.message ?? ""));
      if (!retryable || attempt >= ROW_TX_ATTEMPTS) throw err;
      await new Promise((r) => setTimeout(r, 25 * attempt + Math.random() * 50));
    }
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round3 = (n: number) => Math.round(n * 1000) / 1000;

function readEvidence<T>(json: unknown, schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }): T[] {
  if (!Array.isArray(json)) return [];
  const out: T[] = [];
  for (const e of json) {
    const r = schema.safeParse(e);
    if (r.success && r.data) out.push(r.data);
  }
  return out;
}

/**
 * P7 (engagement-based concept creation): only an answered framing exchange
 * may add a NEW concept to the learner's profile. Lookup, skip and dig-in
 * exchanges only update concepts the learner already has.
 */
export function canCreateMastery(mode: AnswerMode): boolean {
  return mode === "framing";
}

/**
 * Apply one assessed concept. Returns what happened (for logs/tests). Concept
 * rows are only upserted when a new mastery is actually attached to them.
 */
export async function applyConcept(
  tx: Tx,
  job: AssessmentJob,
  c: AssessorResult["concepts"][number],
  at: string,
): Promise<"created" | "updated" | "ignored"> {
  let concept = await tx.concept.findUnique({ where: { slug: c.slug }, select: { id: true, domain: true } });
  const existing = concept
    ? await tx.conceptMastery.findUnique({
        where: { userId_conceptId: { userId: job.userId, conceptId: concept.id } },
        select: { score: true, evidence: true },
      })
    : null;

  if (!existing && !canCreateMastery(job.mode)) return "ignored";

  if (!concept) {
    const known = CONCEPTS_BY_SLUG.get(c.slug);
    concept = await tx.concept.upsert({
      where: { slug: c.slug },
      create: {
        slug: c.slug,
        name: known?.name ?? c.name,
        domain: known?.domain ?? c.domain ?? null,
        description: known?.description ?? null,
      },
      update: {},
      select: { id: true, domain: true },
    });
  }
  if (!concept.domain && c.domain) await tx.concept.update({ where: { id: concept.id }, data: { domain: c.domain } });

  const before = existing?.score ?? NEW_CONCEPT_BASELINE;
  const after = round3(clamp(before + c.masteryDelta, 0, 1));
  const entry: MasteryEvidence = { note: c.evidence, delta: round3(after - before), messageId: job.userMessageId, at };
  const evidence = [...readEvidence<MasteryEvidence>(existing?.evidence, MasteryEvidenceSchema), entry].slice(
    -MAX_MASTERY_EVIDENCE,
  );

  await tx.conceptMastery.upsert({
    where: { userId_conceptId: { userId: job.userId, conceptId: concept.id } },
    create: { userId: job.userId, conceptId: concept.id, score: after, evidence },
    update: { score: after, evidence },
  });
  return existing ? "updated" : "created";
}

export interface StyleState {
  intuitionVsFormal: number;
  intuitionVsFormalConfidence: number;
  intuitionVsFormalOverridden: boolean;
  briefVsThorough: number;
  briefVsThoroughConfidence: number;
  briefVsThoroughOverridden: boolean;
  entryPoint: EntryPoint | null;
  entryPointConfidence: number;
  entryPointOverridden: boolean;
}

/**
 * Pure style update (exported for tests). Each dimension moves toward the
 * signal with confidence-weighted smoothing: the more confident the current
 * estimate, the less a single signal moves it. "Agrees" is judged against the
 * value BEFORE this signal is applied (a neutral prior agrees with anything).
 * Overridden dimensions (Tier 2 edits) are never touched.
 */
export function nextStyleState(style: StyleState, signals: StyleSignal[]): { next: StyleState; applied: StyleSignal[] } {
  const next: StyleState = { ...style };
  const applied: StyleSignal[] = [];
  for (const s of signals) {
    if (s.dimension === "entryPoint") {
      if (next.entryPointOverridden) continue;
      if (next.entryPoint === s.value) {
        next.entryPointConfidence = round3(clamp(next.entryPointConfidence + (1 - next.entryPointConfidence) * 0.2, 0, 0.95));
      } else if (!next.entryPoint || next.entryPointConfidence < 0.3) {
        next.entryPoint = s.value;
        next.entryPointConfidence = ENTRY_POINT_INITIAL_CONFIDENCE;
      } else {
        next.entryPointConfidence = round3(clamp(next.entryPointConfidence - 0.1, 0, 1));
      }
    } else {
      const dim = s.dimension;
      if (dim === "intuitionVsFormal" ? next.intuitionVsFormalOverridden : next.briefVsThoroughOverridden) continue;
      const confKey = dim === "intuitionVsFormal" ? "intuitionVsFormalConfidence" : "briefVsThoroughConfidence";
      const conf = next[confKey];
      const prior = next[dim];
      // Agreeing signals build confidence faster than contradicting ones.
      const agrees = Math.abs(prior) < 0.1 || Math.abs(s.value) < 0.1 || Math.sign(s.value) === Math.sign(prior);
      const alpha = 0.4 * (1 - 0.7 * conf); // 0.40 when unknown → 0.12 when fully confident
      next[dim] = round3(clamp(prior + alpha * (s.value - prior), -1, 1));
      next[confKey] = round3(clamp(conf + (1 - conf) * (agrees ? 0.15 : 0.05), 0, 0.95));
    }
    applied.push(s);
  }
  return { next, applied };
}

async function applyStyleSignals(tx: Tx, job: AssessmentJob, signals: StyleSignal[], at: string) {
  if (signals.length === 0) return;
  const style = await tx.learningStyle.upsert({ where: { userId: job.userId }, create: { userId: job.userId }, update: {} });
  const { next, applied } = nextStyleState(
    {
      intuitionVsFormal: style.intuitionVsFormal,
      intuitionVsFormalConfidence: style.intuitionVsFormalConfidence,
      intuitionVsFormalOverridden: style.intuitionVsFormalOverridden,
      briefVsThorough: style.briefVsThorough,
      briefVsThoroughConfidence: style.briefVsThoroughConfidence,
      briefVsThoroughOverridden: style.briefVsThoroughOverridden,
      entryPoint: style.entryPoint,
      entryPointConfidence: style.entryPointConfidence,
      entryPointOverridden: style.entryPointOverridden,
    },
    signals,
  );
  if (applied.length === 0) return;

  const newEvidence: StyleEvidence[] = applied.map((s) => ({
    dimension: s.dimension,
    note: s.evidence,
    messageId: job.userMessageId,
    at,
  }));
  const evidence = [...readEvidence<StyleEvidence>(style.evidence, StyleEvidenceSchema), ...newEvidence].slice(
    -MAX_STYLE_EVIDENCE,
  );
  await tx.learningStyle.update({
    where: { id: style.id },
    data: {
      intuitionVsFormal: next.intuitionVsFormal,
      intuitionVsFormalConfidence: next.intuitionVsFormalConfidence,
      briefVsThorough: next.briefVsThorough,
      briefVsThoroughConfidence: next.briefVsThoroughConfidence,
      entryPoint: next.entryPoint,
      entryPointConfidence: next.entryPointConfidence,
      evidence,
    },
  });
}

/** Append new items (case-insensitive dedupe), capped. Exported for tests. */
export function mergeList(existing: string[], incoming: string[] | undefined): string[] {
  const out = [...existing];
  const seen = new Set(existing.map((s) => s.trim().toLowerCase()));
  for (const item of incoming ?? []) {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.trim());
  }
  return out.slice(0, MAX_CONTEXT_ITEMS);
}

const hasContext = (uc: AssessedUserContext) => !!(uc.field || uc.projects?.length || uc.dataTypes?.length);

async function applyUserContext(tx: Tx, userId: string, uc: AssessedUserContext) {
  if (!hasContext(uc)) return;
  const ctx = await tx.userContext.upsert({
    where: { userId },
    create: {
      userId,
      field: uc.field ?? null,
      projects: mergeList([], uc.projects),
      dataTypes: mergeList([], uc.dataTypes),
    },
    update: {},
  });
  const projects = mergeList(ctx.projects, uc.projects);
  const dataTypes = mergeList(ctx.dataTypes, uc.dataTypes);
  // Never overwrite an existing field; once the user has edited their context
  // (P4) the assessor only appends projects/dataTypes and leaves field/notes alone.
  const field = ctx.userEdited ? ctx.field : (ctx.field ?? uc.field ?? null);
  if (field === ctx.field && projects.length === ctx.projects.length && dataTypes.length === ctx.dataTypes.length) return;
  await tx.userContext.update({
    where: { id: ctx.id },
    data: ctx.userEdited ? { projects, dataTypes } : { field, projects, dataTypes },
  });
}
