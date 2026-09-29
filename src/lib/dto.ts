// DTO builders (R4, R14): Prisma rows → the server→UI shapes in types.ts.
// Pure mappers plus a couple of loaders that fetch exactly what a DTO needs.
// Server-only (uses the Prisma client); 2b and the UI's server components
// reuse these so every route returns identical shapes.
import "server-only";
import { z } from "zod";
import { db, Prisma } from "@/lib/db";
import { FramingQuestionSchema, FramingResponseSchema, MasteryEvidenceSchema, StyleEvidenceSchema } from "@/lib/schemas";
import { loadSlotDTOs } from "@/lib/slot/service";
import type {
  ConceptDTO,
  ConversationDTO,
  ConversationSummaryDTO,
  FramingQuestion,
  FramingResponse,
  LearnLaterItemDTO,
  LearningStyleDTO,
  MasteryEvidence,
  MessageDTO,
  SlotDTO,
  StyleEvidence,
  UserContextDTO,
} from "@/lib/types";

const iso = (d: Date) => d.toISOString();

/** Parse a JSON array column leniently: keep valid entries, drop the rest. */
function parseArray<T>(schema: z.ZodType<T>, value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const v of value) {
    const r = schema.safeParse(v);
    if (r.success) out.push(r.data);
  }
  return out;
}

// ─── Learn It Later ─────────────────────────────────────────────────────────

/** Include this when loading LearnLaterItems destined for toLearnLaterItemDTO. */
export const learnLaterItemInclude = { concept: { select: { slug: true } } } satisfies Prisma.LearnLaterItemInclude;
export type LearnLaterItemWithConcept = Prisma.LearnLaterItemGetPayload<{ include: typeof learnLaterItemInclude }>;

export function toLearnLaterItemDTO(item: LearnLaterItemWithConcept): LearnLaterItemDTO {
  return {
    id: item.id,
    title: item.title,
    preview: item.preview,
    appliedContext: item.appliedContext,
    conceptSlug: item.concept?.slug ?? null,
    status: item.status,
    origin: item.origin,
    sourceConversationId: item.sourceConversationId,
    sourceMessageId: item.sourceMessageId,
    createdAt: iso(item.createdAt),
  };
}

/** Load items by id for one user, returned in the order of `ids` (missing ids dropped). */
export async function loadLearnLaterItemDTOs(userId: string, ids: string[]): Promise<LearnLaterItemDTO[]> {
  if (!ids.length) return [];
  const rows = await db.learnLaterItem.findMany({
    where: { userId, id: { in: ids } },
    include: learnLaterItemInclude,
  });
  const byId = new Map(rows.map((r) => [r.id, toLearnLaterItemDTO(r)]));
  return ids.map((id) => byId.get(id)).filter((x): x is LearnLaterItemDTO => !!x);
}

// ─── Conversations ──────────────────────────────────────────────────────────

type ConversationRow = Prisma.ConversationGetPayload<object>;

export function toConversationSummaryDTO(c: ConversationRow): ConversationSummaryDTO {
  return {
    id: c.id,
    title: c.title,
    origin: c.origin,
    learnLaterItemId: c.learnLaterItemId,
    createdAt: iso(c.createdAt),
    updatedAt: iso(c.updatedAt),
  };
}

type MessageRow = Prisma.MessageGetPayload<object>;
type ExchangeRow = Prisma.FramingExchangeGetPayload<object>;

/** Callout ids stored on an answer message (AnswerMessageData). */
export function calloutIdsOf(message: Pick<MessageRow, "kind" | "data">): string[] {
  if (message.kind !== "answer" || !message.data || typeof message.data !== "object" || Array.isArray(message.data)) {
    return [];
  }
  const ids = (message.data as Record<string, unknown>).calloutItemIds;
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
}

function exchangeIdOf(message: MessageRow): string | null {
  const d = message.data;
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  const id = (d as Record<string, unknown>).exchangeId;
  return typeof id === "string" ? id : null;
}

/**
 * One MessageDTO (R14). `exchangesById` must contain the conversation's
 * FramingExchanges; `itemsById` the LearnLaterItemDTOs referenced by answers;
 * `slotsByMessageId` the end-of-answer slots (E1) of answer messages.
 * A framing message whose exchange is missing degrades to a text message.
 */
export function toMessageDTO(
  m: MessageRow,
  exchangesById: Map<string, ExchangeRow>,
  itemsById: Map<string, LearnLaterItemDTO>,
  slotsByMessageId: Map<string, SlotDTO> = new Map(),
): MessageDTO {
  const base = { id: m.id, content: m.content, createdAt: iso(m.createdAt) };
  if (m.kind === "framing") {
    const exId = exchangeIdOf(m);
    const ex =
      (exId ? exchangesById.get(exId) : undefined) ??
      [...exchangesById.values()].find((x) => x.framingMessageId === m.id);
    if (ex) {
      const responses = ex.responses === null ? null : parseArray<FramingResponse>(FramingResponseSchema, ex.responses);
      return {
        ...base,
        role: "assistant",
        kind: "framing",
        data: {
          exchangeId: ex.id,
          questions: parseArray<FramingQuestion>(FramingQuestionSchema, ex.questions),
          responses,
          status: ex.status,
        },
      };
    }
    return { ...base, role: m.role, kind: "text", data: null };
  }
  if (m.kind === "answer") {
    const slot = slotsByMessageId.get(m.id) ?? null;
    // Every saved item is listed, including for the "none" control (which
    // renders it passively).
    const callouts = calloutIdsOf(m)
      .map((id) => itemsById.get(id))
      .filter((x): x is LearnLaterItemDTO => !!x);
    return { ...base, role: "assistant", kind: "answer", data: { callouts, slot } };
  }
  return { ...base, role: m.role, kind: "text", data: null };
}

/** Pure builder: conversation + its messages, exchanges and referenced items. */
export function buildConversationDTO(
  conversation: ConversationRow,
  messages: MessageRow[],
  exchanges: ExchangeRow[],
  items: LearnLaterItemDTO[],
  slotsByMessageId: Map<string, SlotDTO> = new Map(),
): ConversationDTO {
  const exchangesById = new Map(exchanges.map((x) => [x.id, x]));
  const itemsById = new Map(items.map((i) => [i.id, i]));
  const sorted = [...messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const dtos = sorted.map((m) => toMessageDTO(m, exchangesById, itemsById, slotsByMessageId));
  const last = dtos.at(-1);
  return {
    ...toConversationSummaryDTO(conversation),
    messages: dtos,
    pendingFramingExchangeId: last?.kind === "framing" && last.data.status === "pending" ? last.data.exchangeId : null,
  };
}

/**
 * Loader: the full ConversationDTO for a conversation OWNED by `userId`, or
 * null (→ 404) if it doesn't exist or belongs to someone else.
 */
export async function getConversationDTO(userId: string, conversationId: string): Promise<ConversationDTO | null> {
  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, userId },
    include: { messages: true, framingExchanges: true },
  });
  if (!conversation) return null;
  const { messages, framingExchanges, ...conv } = conversation;
  const calloutIds = [...new Set(messages.flatMap(calloutIdsOf))];
  const answerIds = messages.filter((m) => m.kind === "answer").map((m) => m.id);
  const [items, slots] = await Promise.all([loadLearnLaterItemDTOs(userId, calloutIds), loadSlotDTOs(userId, answerIds)]);
  return buildConversationDTO(conv, messages, framingExchanges, items, slots);
}

/** Sidebar list, newest first (updatedAt desc — R5 keeps it fresh). */
export async function listConversationSummaries(userId: string): Promise<ConversationSummaryDTO[]> {
  const rows = await db.conversation.findMany({ where: { userId }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }] });
  return rows.map(toConversationSummaryDTO);
}

// ─── Profile pieces ─────────────────────────────────────────────────────────

type MasteryWithConcept = Prisma.ConceptMasteryGetPayload<{ include: { concept: true } }>;

export function toConceptDTO(m: MasteryWithConcept): ConceptDTO {
  const evidence = parseArray<MasteryEvidence>(MasteryEvidenceSchema, m.evidence).sort(
    (a, b) => Date.parse(b.at) - Date.parse(a.at),
  );
  return {
    slug: m.concept.slug,
    name: m.concept.name,
    domain: m.concept.domain,
    score: m.score,
    evidence,
    updatedAt: iso(m.updatedAt),
  };
}

type StyleRow = Prisma.LearningStyleGetPayload<object>;

export function toLearningStyleDTO(s: StyleRow): LearningStyleDTO {
  return {
    intuitionVsFormal: {
      value: s.intuitionVsFormal,
      confidence: s.intuitionVsFormalConfidence,
      overridden: s.intuitionVsFormalOverridden,
    },
    entryPoint: { value: s.entryPoint, confidence: s.entryPointConfidence, overridden: s.entryPointOverridden },
    briefVsThorough: {
      value: s.briefVsThorough,
      confidence: s.briefVsThoroughConfidence,
      overridden: s.briefVsThoroughOverridden,
    },
    // Newest first, like concept evidence.
    evidence: parseArray<StyleEvidence>(StyleEvidenceSchema, s.evidence).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
  };
}

type ContextRow = Prisma.UserContextGetPayload<object>;

export function toUserContextDTO(c: ContextRow): UserContextDTO {
  return {
    field: c.field,
    projects: c.projects,
    dataTypes: c.dataTypes,
    notes: c.notes,
    userEdited: c.userEdited,
  };
}
