// Seed: concept catalog (upsert by slug) + persona TEMPLATE users (X4).
// Run with `npm run db:seed` (prisma.config.ts → `tsx prisma/seed.ts`).
//
// Idempotent: each persona's template user (demoSessionId = "template") is
// deleted — cascading to all its rows — and recreated with deterministic ids
// ("tpl-<persona>-…"). Session clones are separate users and are untouched;
// they only pick up new template content after "Reset this persona".
//
// Timestamps are relative to the time the seed runs; clonePersona() shifts
// them again so a clone's newest activity is always recent.
import { config as loadEnv } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { TEMPLATE_DEMO_SESSION_ID } from "../src/config";
import { FramingQuestionsSchema, FramingResponseSchema, LearnLaterCalloutSchema } from "../src/lib/schemas";
import type { FramingQuestion, FramingResponse, MasteryEvidence, StyleEvidence } from "../src/lib/types";
import { CONCEPT_CATALOG, SEED_PERSONAS } from "./seed-data";
import type { SeedExchangeTurn, SeedPersona } from "./seed-data/types";

loadEnv({ path: [".env.local", ".env"], quiet: true });

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL (or DIRECT_URL) is not set");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

// ─── Validation (fail loudly: this is demo content) ─────────────────────────

/** R11: responses must match the stored questions exactly. */
function validateResponses(ref: string, questions: FramingQuestion[], responses: FramingResponse[]) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  if (responses.length !== questions.length) throw new Error(`${ref}: one response per question required`);
  const seen = new Set<string>();
  for (const r of responses) {
    FramingResponseSchema.parse(r);
    const q = byId.get(r.questionId);
    if (!q || seen.has(r.questionId)) throw new Error(`${ref}: bad/duplicate questionId ${r.questionId}`);
    seen.add(r.questionId);
    if (r.dontKnow) continue;
    if (q.format === "short_answer" && !(typeof r.answer === "string" && r.answer.trim())) {
      throw new Error(`${ref}/${q.id}: short_answer needs a non-empty string`);
    }
    if (q.format === "multiple_choice" && !(typeof r.answer === "string" && q.options!.includes(r.answer))) {
      throw new Error(`${ref}/${q.id}: multiple_choice answer must be one of the options`);
    }
    if (q.format === "multi_select") {
      const a = r.answer;
      if (!Array.isArray(a) || !a.length || new Set(a).size !== a.length || !a.every((x) => q.options!.includes(x))) {
        throw new Error(`${ref}/${q.id}: multi_select answer must be a non-empty subset of options`);
      }
    }
  }
}

function validatePersona(p: SeedPersona, catalog: Set<string>) {
  const turnRefs = new Set<string>();
  const itemRefs = new Set(p.learnLater.map((i) => i.ref));
  const checkSlug = (where: string, slug: string | null | undefined) => {
    if (slug && !catalog.has(slug)) throw new Error(`${p.key} ${where}: unknown concept slug "${slug}"`);
  };
  for (const c of p.conversations) {
    for (const t of c.turns) {
      if (turnRefs.has(t.ref)) throw new Error(`${p.key}: duplicate turn ref ${t.ref}`);
      turnRefs.add(t.ref);
      if (t.kind === "exchange") {
        FramingQuestionsSchema.parse(t.questions);
        LearnLaterCalloutSchema.parse(t.skipCallout);
        t.conceptSlugs.forEach((s) => checkSlug(t.ref, s));
        checkSlug(`${t.ref} skipCallout`, t.skipCallout.conceptSlug);
        if (t.status === "answered") validateResponses(`${p.key}/${t.ref}`, t.questions, t.responses ?? []);
        if (t.status === "skipped" && (t.responses || !t.skipItemRef || !itemRefs.has(t.skipItemRef))) {
          throw new Error(`${p.key}/${t.ref}: skipped exchanges need skipItemRef and no responses`);
        }
      } else {
        for (const r of t.calloutRefs ?? []) if (!itemRefs.has(r)) throw new Error(`${p.key}/${t.ref}: unknown callout ${r}`);
      }
    }
  }
  for (const m of p.masteries) {
    checkSlug("mastery", m.slug);
    for (const e of m.evidence) if (!turnRefs.has(e.ref)) throw new Error(`${p.key} mastery ${m.slug}: unknown ref ${e.ref}`);
  }
  for (const e of p.style?.evidence ?? []) if (!turnRefs.has(e.ref)) throw new Error(`${p.key} style: unknown ref ${e.ref}`);
  for (const i of p.learnLater) {
    checkSlug(`item ${i.ref}`, i.conceptSlug);
    if (i.source && !turnRefs.has(i.source.turnRef)) throw new Error(`${p.key} item ${i.ref}: unknown source ${i.source.turnRef}`);
  }
}

// ─── Build rows ─────────────────────────────────────────────────────────────

interface TurnInfo {
  convId: string;
  userMsgId: string;
  answerMsgId: string;
  userAt: Date;
  answerAt: Date;
}

function buildPersona(p: SeedPersona, seedNow: number, conceptIds: Map<string, string>) {
  const tid = (...parts: string[]) => ["tpl", p.key, ...parts].join("-").replace(/[^A-Za-z0-9-]/g, "-");
  const userId = tid("user");
  const itemId = (ref: string) => tid(ref);
  const turns = new Map<string, TurnInfo>();

  const conversations: Prisma.ConversationCreateManyInput[] = [];
  const messages: Prisma.MessageCreateManyInput[] = [];
  const exchanges: Prisma.FramingExchangeCreateManyInput[] = [];

  for (const c of p.conversations) {
    const convId = tid(c.ref);
    const dayStart = Math.floor((seedNow - c.daysAgo * DAY) / DAY) * DAY;
    // startHour is a relative offset only (see SeedConversation.startHour).
    let t = dayStart + c.startHour * 60 * MIN;
    let n = 0;
    const msgId = () => `${convId}-m${++n}`;
    const firstAt = t;

    for (const turn of c.turns) {
      const userMsgId = msgId();
      const userAt = new Date(t);
      messages.push({ id: userMsgId, conversationId: convId, role: "user", kind: "text", content: turn.user, data: Prisma.DbNull, createdAt: userAt });

      let answerAt: Date;
      let answerMsgId: string;
      if (turn.kind === "exchange") {
        const x = turn as SeedExchangeTurn;
        const framingMsgId = msgId();
        answerMsgId = msgId();
        const exchangeId = tid(x.ref);
        const framingAt = new Date(t + 6_000);
        const submittedAt = new Date(framingAt.getTime() + (x.thinkMinutes ?? 3) * MIN);
        answerAt = new Date(submittedAt.getTime() + 25_000);
        messages.push({
          id: framingMsgId,
          conversationId: convId,
          role: "assistant",
          kind: "framing",
          content: x.framingIntro,
          data: { exchangeId },
          createdAt: framingAt,
        });
        const calloutItemIds = x.status === "skipped" && x.skipItemRef ? [itemId(x.skipItemRef)] : [];
        messages.push({
          id: answerMsgId,
          conversationId: convId,
          role: "assistant",
          kind: "answer",
          content: x.answer,
          data: calloutItemIds.length ? { calloutItemIds } : Prisma.DbNull,
          createdAt: answerAt,
        });
        exchanges.push({
          id: exchangeId,
          userId,
          conversationId: convId,
          userMessageId: userMsgId,
          framingMessageId: framingMsgId,
          answerMessageId: answerMsgId,
          questions: x.questions as unknown as Prisma.InputJsonValue,
          responses: x.status === "answered" ? (x.responses as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
          conceptSlugs: x.conceptSlugs,
          skipCallout: x.skipCallout as unknown as Prisma.InputJsonValue,
          status: x.status,
          createdAt: framingAt,
          answeredAt: x.status === "answered" ? submittedAt : null,
        });
      } else {
        answerAt = new Date(t + 15_000);
        answerMsgId = msgId();
        const calloutItemIds = (turn.calloutRefs ?? []).map(itemId);
        messages.push({
          id: answerMsgId,
          conversationId: convId,
          role: "assistant",
          kind: "answer",
          content: turn.answer,
          data: calloutItemIds.length ? { calloutItemIds } : Prisma.DbNull,
          createdAt: answerAt,
        });
      }
      turns.set(turn.ref, { convId, userMsgId, answerMsgId, userAt, answerAt });
      // Next message: reading time scales a little with the answer's length.
      const answerLen = turn.answer.length;
      t = answerAt.getTime() + (3 + Math.min(6, answerLen / 600)) * MIN;
    }

    const last = [...turns.values()].filter((i) => i.convId === convId).at(-1);
    conversations.push({
      id: convId,
      userId,
      title: c.title,
      origin: "chat",
      createdAt: new Date(firstAt),
      updatedAt: last ? last.answerAt : new Date(firstAt),
    });
  }

  const evidenceAt = (ref: string) => new Date(turns.get(ref)!.answerAt.getTime() + 40_000);

  const masteries: Prisma.ConceptMasteryCreateManyInput[] = p.masteries.map((m) => {
    const evidence: MasteryEvidence[] = m.evidence.map((e) => ({
      note: e.note,
      delta: e.delta,
      messageId: turns.get(e.ref)!.userMsgId,
      at: evidenceAt(e.ref).toISOString(),
    }));
    const times = m.evidence.map((e) => evidenceAt(e.ref).getTime());
    const score = Math.round(Math.min(1, Math.max(0, m.evidence.reduce((s, e) => s + e.delta, 0))) * 100) / 100;
    return {
      id: tid("cm", m.slug),
      userId,
      conceptId: conceptIds.get(m.slug)!,
      score,
      evidence: evidence as unknown as Prisma.InputJsonValue,
      createdAt: new Date(Math.min(...times)),
      updatedAt: new Date(Math.max(...times)),
    };
  });

  const items: Prisma.LearnLaterItemCreateManyInput[] = p.learnLater.map((i) => {
    const src = i.source ? turns.get(i.source.turnRef)! : null;
    const at = src
      ? new Date((i.source!.message === "user" ? src.answerAt.getTime() - 20_000 : src.answerAt.getTime() + 40_000))
      : new Date(seedNow - DAY);
    return {
      id: itemId(i.ref),
      userId,
      conceptId: i.conceptSlug ? (conceptIds.get(i.conceptSlug) ?? null) : null,
      title: i.title,
      preview: i.preview,
      appliedContext: i.appliedContext,
      sourceConversationId: src?.convId ?? null,
      sourceMessageId: src ? (i.source!.message === "user" ? src.userMsgId : src.answerMsgId) : null,
      status: i.status,
      origin: i.origin,
      createdAt: at,
      updatedAt: at,
    };
  });

  const allAnswers = [...turns.values()].map((i) => i.answerAt.getTime());
  const lastAssessedAt = allAnswers.length ? new Date(Math.max(...allAnswers) + 45_000) : null;
  const createdAt = new Date(seedNow - p.createdDaysAgo * DAY - (p.conversations.length ? DAY / 2 : 0));

  const s = p.style;
  const styleEvidence: StyleEvidence[] = (s?.evidence ?? []).map((e) => ({
    dimension: e.dimension,
    note: e.note,
    messageId: turns.get(e.ref)!.userMsgId,
    at: evidenceAt(e.ref).toISOString(),
  }));
  const styleUpdatedAt = styleEvidence.length
    ? new Date(Math.max(...styleEvidence.map((e) => Date.parse(e.at))))
    : createdAt;

  return {
    user: {
      id: userId,
      demoSessionId: TEMPLATE_DEMO_SESSION_ID,
      personaKey: p.key,
      isTemplate: true,
      displayName: p.displayName,
      createdAt,
      lastSeenAt: createdAt,
      lastAssessedAt,
    } satisfies Prisma.UserCreateInput,
    style: {
      id: tid("style"),
      userId,
      intuitionVsFormal: s?.intuitionVsFormal ?? 0,
      intuitionVsFormalConfidence: s?.intuitionVsFormalConfidence ?? 0,
      entryPoint: s?.entryPoint ?? null,
      entryPointConfidence: s?.entryPointConfidence ?? 0,
      briefVsThorough: s?.briefVsThorough ?? 0,
      briefVsThoroughConfidence: s?.briefVsThoroughConfidence ?? 0,
      evidence: styleEvidence as unknown as Prisma.InputJsonValue,
      updatedAt: styleUpdatedAt,
    } satisfies Prisma.LearningStyleUncheckedCreateInput,
    context: {
      id: tid("context"),
      userId,
      field: p.context?.field ?? null,
      projects: p.context?.projects ?? [],
      dataTypes: p.context?.dataTypes ?? [],
      notes: p.context?.notes ?? null,
      updatedAt: lastAssessedAt ?? createdAt,
    } satisfies Prisma.UserContextUncheckedCreateInput,
    conversations,
    messages,
    exchanges,
    masteries,
    items,
  };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const started = Date.now();
  const catalogSlugs = new Set(CONCEPT_CATALOG.map((c) => c.slug));
  for (const p of SEED_PERSONAS) validatePersona(p, catalogSlugs);

  // 1. Concept catalog (never deleted — the assessor may have added more).
  const concepts = await db.$transaction(
    CONCEPT_CATALOG.map((c) =>
      db.concept.upsert({
        where: { slug: c.slug },
        create: { slug: c.slug, name: c.name, domain: c.domain, description: c.description },
        update: { name: c.name, domain: c.domain, description: c.description },
        select: { id: true, slug: true },
      }),
    ),
  );
  const conceptIds = new Map(concepts.map((c) => [c.slug, c.id]));
  console.log(`concepts: ${concepts.length} upserted`);

  // 2. Persona templates.
  const seedNow = Date.now();
  for (const p of SEED_PERSONAS) {
    const rows = buildPersona(p, seedNow, conceptIds);
    await db.$transaction([
      db.user.deleteMany({ where: { demoSessionId: TEMPLATE_DEMO_SESSION_ID, personaKey: p.key } }),
      db.user.create({ data: rows.user }),
      db.learningStyle.create({ data: rows.style }),
      db.userContext.create({ data: rows.context }),
      db.conversation.createMany({ data: rows.conversations }),
      db.message.createMany({ data: rows.messages }),
      db.framingExchange.createMany({ data: rows.exchanges }),
      db.conceptMastery.createMany({ data: rows.masteries }),
      db.learnLaterItem.createMany({ data: rows.items }),
    ]);
    const answered = rows.exchanges.filter((x) => x.status === "answered").length;
    console.log(
      `${p.key}: ${rows.conversations.length} conversations, ${rows.messages.length} messages, ` +
        `${rows.exchanges.length} framing exchanges (${answered} answered), ${rows.masteries.length} concepts, ` +
        `${rows.items.length} learn-later items`,
    );
  }
  console.log(`seed done in ${Date.now() - started} ms`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
