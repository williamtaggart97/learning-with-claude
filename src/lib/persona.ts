// Persona cloning (X4–X6). Server-only.
//
// Each browser session gets its own deep copy of a persona template (the
// User with demoSessionId = TEMPLATE_DEMO_SESSION_ID, isTemplate = true).
// Every id is remapped — FK columns AND ids stored inside JSON:
//   Message.data.exchangeId        (FramingMessageData)
//   Message.data.calloutItemIds    (AnswerMessageData)
//   ConceptMastery.evidence[].messageId, LearningStyle.evidence[].messageId
// Timestamps (columns and evidence `at` strings) are shifted so the newest
// seeded activity lands ~CLONE_RECENCY_MS before now, so the sidebar reads
// "recent" whenever a reviewer shows up.
//
// The copy is one transaction of ~10 createMany statements (one round trip
// each on Neon); all ids are pre-generated so no statement depends on
// another's result.
import "server-only";
import { TEMPLATE_DEMO_SESSION_ID } from "@/config";
import { db, Prisma, type User } from "@/lib/db";
import type { PersonaKey } from "@/lib/types";

/** Newest seeded activity in a fresh clone is this long before "now". */
const CLONE_RECENCY_MS = 45 * 60_000;
/** Template rows barely change; cache them briefly to save a Neon round trip per clone. */
const TEMPLATE_CACHE_TTL_MS = 60_000;

function newId(): string {
  return `c${crypto.randomUUID().replace(/-/g, "")}`;
}

async function loadTemplateUncached(personaKey: PersonaKey) {
  return db.user.findUnique({
    where: { demoSessionId_personaKey: { demoSessionId: TEMPLATE_DEMO_SESSION_ID, personaKey } },
    include: {
      conversations: { include: { messages: true, framingExchanges: true } },
      conceptMastery: true,
      learningStyle: true,
      userContext: true,
      learnLaterItems: true,
    },
  });
}

type Template = NonNullable<Awaited<ReturnType<typeof loadTemplateUncached>>>;

const templateCache = new Map<PersonaKey, { at: number; template: Template }>();

async function loadTemplate(personaKey: PersonaKey): Promise<Template> {
  const hit = templateCache.get(personaKey);
  if (hit && Date.now() - hit.at < TEMPLATE_CACHE_TTL_MS) return hit.template;
  const template = await loadTemplateUncached(personaKey);
  if (!template || !template.isTemplate) {
    throw new Error(`Persona template "${personaKey}" not found — run \`npm run db:seed\``);
  }
  templateCache.set(personaKey, { at: Date.now(), template });
  return template;
}

/** JSON column value for createMany: DbNull for SQL NULL. */
function json(value: Prisma.JsonValue | null): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

function newestActivity(t: Template): number | null {
  let newest: number | null = null;
  const bump = (d: Date | null | undefined) => {
    if (d && (newest === null || d.getTime() > newest)) newest = d.getTime();
  };
  for (const c of t.conversations) {
    bump(c.updatedAt);
    for (const m of c.messages) bump(m.createdAt);
  }
  for (const i of t.learnLaterItems) bump(i.updatedAt);
  bump(t.lastAssessedAt);
  return newest;
}

/**
 * Deep-copies the persona template into `sessionId` and returns the clone.
 * If a clone already exists (e.g. a concurrent request won the race) nothing
 * is copied and the existing clone is returned. Prefer ensurePersonaClone(),
 * which skips the template load when the clone exists.
 */
export async function clonePersona(personaKey: PersonaKey, sessionId: string): Promise<User> {
  if (sessionId === TEMPLATE_DEMO_SESSION_ID) throw new Error("Refusing to clone into the template session");
  const t = await loadTemplate(personaKey);

  const now = Date.now();
  const newest = newestActivity(t);
  const shiftMs = newest === null ? 0 : now - CLONE_RECENCY_MS - newest;
  const shift = (d: Date): Date => new Date(d.getTime() + shiftMs);
  const shiftN = (d: Date | null): Date | null => (d ? shift(d) : null);
  const shiftIso = (s: unknown): string => {
    const ms = typeof s === "string" ? Date.parse(s) : NaN;
    return Number.isFinite(ms) ? new Date(ms + shiftMs).toISOString() : new Date(now).toISOString();
  };

  // ── Id maps ──
  const userId = newId();
  const convIds = new Map<string, string>();
  const msgIds = new Map<string, string>();
  const exIds = new Map<string, string>();
  const itemIds = new Map<string, string>();
  for (const c of t.conversations) {
    convIds.set(c.id, newId());
    for (const m of c.messages) msgIds.set(m.id, newId());
    for (const x of c.framingExchanges) exIds.set(x.id, newId());
  }
  for (const i of t.learnLaterItems) itemIds.set(i.id, newId());
  const remap = (map: Map<string, string>, id: string | null): string | null => (id ? (map.get(id) ?? null) : null);

  // Evidence arrays: remap messageId, shift `at`.
  const remapEvidence = (value: Prisma.JsonValue): Prisma.InputJsonValue => {
    if (!Array.isArray(value)) return [];
    return value.map((raw) => {
      const e = { ...(raw as Record<string, unknown>) };
      if (typeof e.messageId === "string") {
        const mapped = msgIds.get(e.messageId);
        if (mapped) e.messageId = mapped;
        else delete e.messageId;
      }
      e.at = shiftIso(e.at);
      return e as Prisma.InputJsonObject;
    });
  };

  // Message.data: exchangeId / calloutItemIds.
  const remapMessageData = (kind: string, data: Prisma.JsonValue | null) => {
    if (data === null || typeof data !== "object" || Array.isArray(data)) return json(null);
    const d = data as Record<string, unknown>;
    if (kind === "framing") {
      // Never fall back to the template's id (R1); a missing mapping drops the
      // link and toMessageDTO falls back to matching on framingMessageId.
      const mapped = typeof d.exchangeId === "string" ? exIds.get(d.exchangeId) : undefined;
      return mapped ? { exchangeId: mapped } : json(null);
    }
    if (kind === "answer") {
      const ids = Array.isArray(d.calloutItemIds) ? d.calloutItemIds : [];
      const mapped = ids.map((id) => (typeof id === "string" ? itemIds.get(id) : undefined)).filter(Boolean) as string[];
      return mapped.length ? { calloutItemIds: mapped } : json(null);
    }
    return json(data);
  };

  const conversations = t.conversations;
  const messages = conversations.flatMap((c) => c.messages);
  const exchanges = conversations.flatMap((c) => c.framingExchanges);
  const digInLinks = conversations.filter((c) => c.learnLaterItemId && itemIds.has(c.learnLaterItemId));

  const userData: Prisma.UserCreateManyInput = {
    id: userId,
    demoSessionId: sessionId,
    personaKey,
    isTemplate: false,
    displayName: t.displayName,
    createdAt: newest === null ? new Date(now) : shift(t.createdAt),
    lastSeenAt: new Date(now),
    lastAssessedAt: shiftN(t.lastAssessedAt),
  };

  // Child inserts, run in order inside the transaction once the user row exists.
  const ops: ((tx: Prisma.TransactionClient) => Promise<unknown>)[] = [];

  if (t.learningStyle) {
    const s = t.learningStyle;
    ops.push((tx) =>
      tx.learningStyle.create({
        data: {
          id: newId(),
          userId,
          intuitionVsFormal: s.intuitionVsFormal,
          intuitionVsFormalConfidence: s.intuitionVsFormalConfidence,
          intuitionVsFormalOverridden: s.intuitionVsFormalOverridden,
          entryPoint: s.entryPoint,
          entryPointConfidence: s.entryPointConfidence,
          entryPointOverridden: s.entryPointOverridden,
          briefVsThorough: s.briefVsThorough,
          briefVsThoroughConfidence: s.briefVsThoroughConfidence,
          briefVsThoroughOverridden: s.briefVsThoroughOverridden,
          evidence: remapEvidence(s.evidence),
          updatedAt: shift(s.updatedAt),
        },
      }),
    );
  }

  if (t.userContext) {
    const c = t.userContext;
    ops.push((tx) =>
      tx.userContext.create({
        data: {
          id: newId(),
          userId,
          field: c.field,
          projects: c.projects,
          dataTypes: c.dataTypes,
          notes: c.notes,
          userEdited: c.userEdited,
          updatedAt: shift(c.updatedAt),
        },
      }),
    );
  }

  if (conversations.length) {
    ops.push((tx) =>
      tx.conversation.createMany({
        data: conversations.map((c) => ({
          id: convIds.get(c.id)!,
          userId,
          title: c.title,
          origin: c.origin,
          learnLaterItemId: null, // linked after items exist (circular FK)
          createdAt: shift(c.createdAt),
          updatedAt: shift(c.updatedAt),
        })),
      }),
    );
  }

  if (messages.length) {
    ops.push((tx) =>
      tx.message.createMany({
        data: messages.map((m) => ({
          id: msgIds.get(m.id)!,
          conversationId: convIds.get(m.conversationId)!,
          role: m.role,
          kind: m.kind,
          content: m.content,
          data: remapMessageData(m.kind, m.data),
          createdAt: shift(m.createdAt),
        })),
      }),
    );
  }

  if (exchanges.length) {
    ops.push((tx) =>
      tx.framingExchange.createMany({
        data: exchanges.map((x) => ({
          id: exIds.get(x.id)!,
          userId,
          conversationId: convIds.get(x.conversationId)!,
          userMessageId: msgIds.get(x.userMessageId)!,
          framingMessageId: remap(msgIds, x.framingMessageId),
          answerMessageId: remap(msgIds, x.answerMessageId),
          questions: json(x.questions) as Prisma.InputJsonValue,
          responses: json(x.responses),
          conceptSlugs: x.conceptSlugs,
          skipCallout: json(x.skipCallout),
          status: x.status,
          createdAt: shift(x.createdAt),
          answeredAt: shiftN(x.answeredAt),
        })),
      }),
    );
  }

  if (t.conceptMastery.length) {
    ops.push((tx) =>
      tx.conceptMastery.createMany({
        data: t.conceptMastery.map((cm) => ({
          id: newId(),
          userId,
          conceptId: cm.conceptId,
          score: cm.score,
          evidence: remapEvidence(cm.evidence),
          createdAt: shift(cm.createdAt),
          updatedAt: shift(cm.updatedAt),
        })),
      }),
    );
  }

  if (t.learnLaterItems.length) {
    ops.push((tx) =>
      tx.learnLaterItem.createMany({
        data: t.learnLaterItems.map((i) => ({
          id: itemIds.get(i.id)!,
          userId,
          conceptId: i.conceptId,
          title: i.title,
          preview: i.preview,
          appliedContext: i.appliedContext,
          sourceConversationId: remap(convIds, i.sourceConversationId),
          sourceMessageId: remap(msgIds, i.sourceMessageId),
          status: i.status,
          origin: i.origin,
          createdAt: shift(i.createdAt),
          updatedAt: shift(i.updatedAt),
        })),
      }),
    );
  }

  // Dig-in conversations → their Learn It Later item (rare; one statement each).
  for (const c of digInLinks) {
    ops.push((tx) =>
      tx.conversation.update({
        where: { id: convIds.get(c.id)! },
        data: { learnLaterItemId: itemIds.get(c.learnLaterItemId!)!, updatedAt: shift(c.updatedAt) },
      }),
    );
  }

  // ON CONFLICT DO NOTHING on (demoSessionId, personaKey): if a concurrent
  // request is cloning the same persona, this insert waits for it and then
  // inserts nothing — we skip the children and return the winner's row.
  const created = await db.$transaction(
    async (tx) => {
      const [user] = await tx.user.createManyAndReturn({ data: [userData], skipDuplicates: true });
      if (!user) return null;
      for (const op of ops) await op(tx);
      return user;
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
  return created ?? db.user.findUniqueOrThrow({ where: { demoSessionId_personaKey: { demoSessionId: sessionId, personaKey } } });
}

/** Get this session's clone of the persona, cloning the template if missing. */
export async function ensurePersonaClone(personaKey: PersonaKey, sessionId: string): Promise<User> {
  const where = { demoSessionId_personaKey: { demoSessionId: sessionId, personaKey } };
  const existing = await db.user.findUnique({ where });
  if (existing) return existing;
  // Concurrency: clonePersona's INSERT … ON CONFLICT DO NOTHING (skipDuplicates)
  // is the single mechanism — a racing request blocks on the winner's
  // uncommitted row, inserts nothing, and returns the winner's clone.
  return clonePersona(personaKey, sessionId);
}

/** "Reset this persona" (X6): delete the session clone (cascade) and re-clone. */
export async function resetPersona(sessionId: string, personaKey: PersonaKey): Promise<User> {
  if (sessionId === TEMPLATE_DEMO_SESSION_ID) throw new Error("Refusing to reset the template session");
  await db.user.deleteMany({ where: { demoSessionId: sessionId, personaKey, isTemplate: false } });
  return ensurePersonaClone(personaKey, sessionId);
}
