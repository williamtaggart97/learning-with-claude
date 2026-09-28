/**
 * API CONTRACT — routes implemented by phases 2a/2b, consumed by the UI (3/4).
 * Rules are numbered (R1…) so phases can cite them.
 *
 * ── General ──────────────────────────────────────────────────────────────────
 *
 * R1  Same-origin, cookie-scoped. `lm_session` (COOKIES.session) identifies
 *     the browser session, `lm_persona` (COOKIES.persona) the active persona.
 *     The server resolves the current session-clone User from those (creating
 *     the session/clone on first use). Clients never send a userId. Session
 *     ids are random UUIDs; the resolver must reject the value "template"
 *     (TEMPLATE_DEMO_SESSION_ID — the demoSessionId of persona template rows)
 *     and bump User.lastSeenAt (throttling the write is fine).
 * R2  JSON routes return JSON. Errors are `ApiError` (use `apiError()`) with:
 *       400 bad_request   zod validation failed / responses don't match questions
 *       401 unauthorized  passcode gate (src/proxy.ts; every /api/* except /api/passcode)
 *       403 tier_locked   e.g. PATCH /api/profile below Tier 2
 *       404 not_found     ids not owned by the current user count as not found
 *       409 conflict      e.g. framing exchange not pending
 *       429 rate_limited  sent BEFORE any stream starts; includes retryAfterSeconds
 *                         and a Retry-After header
 *       500 internal
 *       503 unavailable   server misconfigured (passcode gate fails closed in prod)
 * R3  Streaming routes return `application/x-ndjson`: one `ChatStreamEvent` per
 *     line, produced with `ndjsonResponse()` and read with `readNdjson()`
 *     (src/lib/ndjson.ts). A stream ends with exactly one terminal event:
 *     `framing`, `done`, or `error`. Throw `PublicError` for messages safe to
 *     show; anything else is logged and sent as "Something went wrong". A
 *     client disconnect calls the generator's `return()` — abort upstream
 *     Claude requests in its `finally`.
 * R4  Timestamps in DTOs are ISO-8601 strings.
 * R5  Whenever a route adds a Message to a conversation it must also touch
 *     `Conversation.updatedAt` (e.g. `conversation.update({ data: { updatedAt:
 *     new Date() } })` in the same transaction) — sidebar ordering depends on it.
 *
 * ── Rate limits (X3) ─────────────────────────────────────────────────────────
 *
 * R6  "Chat-cost" routes (POST /api/chat, POST /api/framing/[id]/answer)
 *     check, in order, and stop at the first failure (so rejected requests
 *     don't burn the shared buckets):
 *       1. session  key RATE_LIMIT_KEYS.session(demoSessionId)  rule RATE_LIMIT.session
 *       2. ip       key RATE_LIMIT_KEYS.ip(clientIp(headers))   rule RATE_LIMIT.ip
 *       3. global   key RATE_LIMIT_KEYS.globalDaily()           rule RATE_LIMIT.globalDaily
 *     using `hitRateLimit(key, rule)` and `clientIp(headers)` from
 *     src/lib/rate-limit.ts. Any failure → 429 (R2). Exemption: the dig-in
 *     kickoff (R9). Values are env-overridable (src/config.ts).
 * R7  POST /api/passcode is throttled per IP (RATE_LIMIT_KEYS.passcode,
 *     RATE_LIMIT.passcode; default 10 attempts / 15 min).
 *
 * ── Chat ─────────────────────────────────────────────────────────────────────
 *
 * POST /api/chat                       body ChatRequest → NDJSON ChatStreamEvent
 * R8  Order of operations:
 *       a. Validate; resolve the user; load the conversation (404 if not
 *          owned) or create one if conversationId is omitted.
 *       b. Dig-in kickoff? → R9 and stop.
 *       c. Rate limit (R6).
 *       d. If the conversation has a `pending` FramingExchange, mark it
 *          `skipped` (abandoned: its skipCallout is NOT queued; it doesn't
 *          count toward progress).
 *       e. Store the user message (R5), then run the router (A1).
 *     Concept path:  conversation → framing
 *       Create the assistant message (kind "framing", data { exchangeId },
 *       content may be "") and the FramingExchange (questions, conceptSlugs,
 *       skipCallout from the router). The stream ends; the UI shows the card
 *       and later calls the framing-answer route.
 *     Lookup path:   conversation → answer_delta… → callouts? → done
 *       Persist the answer message and its callout items (R13) first, then
 *       emit `callouts` (persisted LearnLaterItemDTOs), then `done`.
 * R9  Dig-in kickoff: detected SERVER-SIDE — conversation.origin = "dig_in"
 *     and it has zero assistant messages (ChatRequest has no flag). The route
 *     stores the user message, skips the rate limit and the router, and goes
 *     straight to the answerer with the dig-in prompt (Q4): connect back to
 *     the original problem (the item's appliedContext / source conversation),
 *     then to other problems relevant to the user's context.
 *     Stream: conversation → answer_delta… → done. Later messages in a dig-in
 *     conversation follow the normal flow (R8).
 *
 * POST /api/framing/[exchangeId]/answer
 *                                      body FramingAnswerRequest → NDJSON
 * R10 404 if not owned; 409 conflict if the exchange is not `pending`; then
 *     rate limit (R6). Counts toward the limit whether answered or skipped.
 *     skip = false: validate responses (R11), store them, mark `answered`
 *       (answeredAt), then stream the answer shaped by the responses (L6) and
 *       learning style (L7).
 *       Stream: progress? → answer_delta… → callouts? → done
 *       `progress` is emitted when the answered-exchange count changed; its
 *       `unlocked` drives the immediate Tier-unlock celebration (X7).
 *     skip = true ("just answer"): mark `skipped` (doesn't count toward
 *       progress), queue the stored skipCallout as a LearnLaterItem with
 *       origin "skipped" (R13 dedupe applies; sourceMessageId = the
 *       triggering user message), then answer directly (no framing shaping).
 *       Stream: answer_delta… → callouts → done, where `callouts` includes
 *       the queued skip item so the UI can show "saved to Learn It Later".
 *     Either way: store the answer message (kind "answer", R5) and set
 *     FramingExchange.answerMessageId.
 * R11 Framing responses are validated against the STORED questions (zod only
 *     checks shape + the dontKnow ⇔ answer === null rule): exactly one
 *     response per question id, no unknown ids; when dontKnow is false:
 *       short_answer     answer is a non-empty string
 *       multiple_choice  answer is a string that is one of the options
 *       multi_select     answer is a string[] (non-empty, no duplicates)
 *                        that is a subset of the options
 *     Violations → 400 bad_request.
 *
 * ── Assessor (A3) and profile refresh ────────────────────────────────────────
 *
 * R12 After an answer (lookup, framing answer, skip or dig-in), the route runs
 *     the assessor via `after()` from "next/server" (runs after the response
 *     finishes and survives on Vercel; register it in the handler and have the
 *     callback await the stream's outcome, skipping on error). It never delays
 *     `done`. When it finishes it sets User.lastAssessedAt (even if nothing
 *     changed). Set `maxDuration` on the route to cover answer + assessor.
 *     UI rule: remember profile.tier and profile.lastAssessedAt before
 *     sending; after `done`, refetch GET /api/profile at ~1.5s and ~4s,
 *     stopping early once lastAssessedAt changes. If the new tier is higher
 *     than the remembered one (and it wasn't already celebrated via a
 *     `progress` event), show the unlock celebration — this catches a Tier 2
 *     unlock via 8 concepts, which only the assessor can cause.
 *
 * ── Learn It Later ───────────────────────────────────────────────────────────
 *
 * R13 Creating items (lookup callouts, skip callouts, assessor items) is an
 *     upsert-by-rule: if a `queued` item already exists for the same
 *     (userId, conceptId) — or, when the item has no concept, the same
 *     (userId, normalizeLearnLaterTitle(title)) — reuse it instead of creating
 *     a duplicate (return the existing item in `callouts`). conceptId comes
 *     from conceptSlug when that slug is in the catalog, else null. Items
 *     record sourceConversationId and sourceMessageId. Answer messages store
 *     the ids in data.calloutItemIds (AnswerMessageData).
 *
 * POST  /api/learn-later/[id]/dig-in   → DigInResponse
 *   Creates a Conversation (origin "dig_in", learnLaterItemId = id), sets the
 *   item status to "dug_in", and returns a kickoff message. The UI navigates
 *   to the conversation and immediately sends `kickoffMessage` via
 *   POST /api/chat { conversationId, message: kickoffMessage } (R9).
 * PATCH /api/learn-later/[id]          body LearnLaterPatch → LearnLaterItemDTO
 *   Dismiss (or restore) a queued item.
 *
 * ── Conversations ────────────────────────────────────────────────────────────
 *
 * GET  /api/conversations              → ConversationsResponse (updatedAt desc)
 * GET  /api/conversations/[id]         → ConversationDTO
 * R14 MessageDTO is discriminated on `kind`. Message.data stores only
 *     references; DTOs are joined server-side:
 *       framing → from the FramingExchange (questions, responses, status)
 *       answer  → callouts = LearnLaterItemDTOs for data.calloutItemIds, in
 *                 order, current state, missing ids dropped
 *       text    → data null
 *
 * ── Profile ──────────────────────────────────────────────────────────────────
 *
 * GET   /api/profile                   → ProfileDTO (includes lastAssessedAt, R12)
 * PATCH /api/profile                   body ProfilePatch → ProfileDTO
 *   Tier 2 only (403 tier_locked otherwise). Edited style dimensions get
 *   `*Overridden = true`; context edits set `userEdited = true`.
 *
 * ── Personas (X4–X6) ─────────────────────────────────────────────────────────
 *
 * GET  /api/persona                    → PersonaStateResponse
 * POST /api/persona                    body PersonaSwitchRequest → PersonaStateResponse
 *   Sets the persona cookie; clones the template for this session if needed.
 * POST /api/persona/reset              → PersonaStateResponse
 *   Deletes this session's clone of the current persona (cascade) and
 *   re-copies the template (the User with demoSessionId = "template").
 *
 * ── Passcode gate (X2) — implemented in phase 1 ──────────────────────────────
 *
 * POST /api/passcode                   body { passcode } → { ok: true } | ApiError
 *   Sets the httpOnly `lm_passcode` cookie (HMAC, never plaintext). 401 wrong
 *   passcode, 429 throttled (R7), 503 misconfigured.
 */
import type {
  ConversationSummaryDTO,
  FramingQuestion,
  LearnLaterItemDTO,
  PersonaKey,
  PersonaSummary,
  Tier,
  TierProgress,
} from "./types";

export type {
  ChatRequest,
  ConversationDTO,
  FramingAnswerRequest,
  LearnLaterItemDTO,
  LearnLaterPatch,
  MessageDTO,
  PersonaSwitchRequest,
  ProfileDTO,
  ProfilePatch,
} from "./types";

// ─── Route paths ────────────────────────────────────────────────────────────

export const API_ROUTES = {
  chat: "/api/chat",
  framingAnswer: (exchangeId: string) => `/api/framing/${encodeURIComponent(exchangeId)}/answer`,
  conversations: "/api/conversations",
  conversation: (id: string) => `/api/conversations/${encodeURIComponent(id)}`,
  profile: "/api/profile",
  learnLaterItem: (id: string) => `/api/learn-later/${encodeURIComponent(id)}`,
  learnLaterDigIn: (id: string) => `/api/learn-later/${encodeURIComponent(id)}/dig-in`,
  persona: "/api/persona",
  personaReset: "/api/persona/reset",
  passcode: "/api/passcode",
} as const;

// ─── Streaming events (NDJSON) ──────────────────────────────────────────────

/** First event of POST /api/chat. */
export interface ConversationEvent {
  type: "conversation";
  conversationId: string;
  /** Id of the stored user message. */
  userMessageId: string;
  /** Present when the conversation was just created (for the sidebar). */
  title?: string;
}

/** Concept path: terminal event of POST /api/chat. */
export interface FramingEvent {
  type: "framing";
  exchangeId: string;
  /** Id of the assistant message (kind "framing"). */
  messageId: string;
  questions: FramingQuestion[];
}

/** Emitted by the framing-answer route when progress changed (R10). */
export interface ProgressEvent {
  type: "progress";
  progress: TierProgress;
  /** Tier newly reached by this exchange, or null. */
  unlocked: Tier | null;
}

/** A chunk of answer markdown; append in order. */
export interface AnswerDeltaEvent {
  type: "answer_delta";
  text: string;
}

/** Learn It Later items for this answer — already persisted (R13), with ids. */
export interface CalloutsEvent {
  type: "callouts";
  items: LearnLaterItemDTO[];
}

/** Terminal: answer fully stored. The assessor runs afterwards (R12). */
export interface DoneEvent {
  type: "done";
  /** Id of the assistant answer message. */
  messageId: string;
}

/** Terminal: something failed mid-stream. `message` is safe to display (R3). */
export interface ErrorEvent {
  type: "error";
  message: string;
}

export type ChatStreamEvent =
  | ConversationEvent
  | FramingEvent
  | ProgressEvent
  | AnswerDeltaEvent
  | CalloutsEvent
  | DoneEvent
  | ErrorEvent;

// ─── JSON responses ─────────────────────────────────────────────────────────

export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "tier_locked"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "internal"
  | "unavailable";

export interface ApiError {
  error: string;
  code: ApiErrorCode;
  /** For rate_limited: seconds until the window resets. */
  retryAfterSeconds?: number;
}

export interface ConversationsResponse {
  conversations: ConversationSummaryDTO[];
}

export interface DigInResponse {
  conversationId: string;
  /** First user message the UI auto-sends to POST /api/chat (R9). */
  kickoffMessage: string;
}

export interface PersonaStateResponse {
  current: PersonaSummary;
  personas: PersonaSummary[];
}

export interface PasscodeResponse {
  ok: true;
}

/**
 * Helper for route handlers (and the proxy): a typed JSON error response.
 * Sets Retry-After when retryAfterSeconds is given.
 */
export function apiError(
  status: number,
  code: ApiErrorCode,
  error: string,
  extra?: Pick<ApiError, "retryAfterSeconds">,
): Response {
  const body: ApiError = { error, code, ...extra };
  const headers = extra?.retryAfterSeconds ? { "Retry-After": String(extra.retryAfterSeconds) } : undefined;
  return Response.json(body, { status, headers });
}

/**
 * Title key for Learn It Later dedupe (R13): lowercase, strip punctuation,
 * collapse whitespace. Compare in app code (no DB column).
 */
export function normalizeLearnLaterTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Re-export for convenience in UI code. */
export type { PersonaKey };
