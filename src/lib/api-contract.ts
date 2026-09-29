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
 *     Stopping (client disconnect) keeps what was streamed, like claude.ai:
 *     if ≥1 answer_delta was sent, the partial text plus a trailing
 *     "\n\n_(Stopped.)_" is stored as the answer message (kind "answer", R5;
 *     callout items that already exist are attached, lookup/task callouts
 *     are not created) and the assessor does NOT run (R12). Stopped before any
 *     delta: the framing-answer route stores an answer message containing
 *     just "_(Stopped before Claude answered.)_" (R10); POST /api/chat keeps
 *     only the user message. The UI shows its local partial text on stop and
 *     reconciles with GET /api/conversations/[id] later. DB writes after the
 *     disconnect never use the aborted request signal.
 * R4  Timestamps in DTOs are ISO-8601 strings.
 * R5  Whenever a route adds a Message to a conversation it must also touch
 *     `Conversation.updatedAt` (e.g. `conversation.update({ data: { updatedAt:
 *     new Date() } })` in the same transaction) — sidebar ordering depends on it.
 *
 * ── Rate limits (X3) ─────────────────────────────────────────────────────────
 *
 * R6  "Chat-cost" routes (POST /api/chat, POST /api/framing/[id]/answer,
 *     POST /api/slot/[id]/walkthrough, POST /api/slot/[id]/apply)
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
 *       e. Store the user message (R5), then run the router (A1): kind
 *          concept | lookup | task (L4).
 *       f. Framing policy, enforced in code after the router (planRoute in
 *          src/lib/pipeline/route-policy.ts), deadline checked first:
 *          - a concept result whose message mentions a deadline (L4) is
 *            answered immediately in "direct" answer mode (a concise, complete
 *            concept answer; the route stays lookup-shaped) — or in "task"
 *            mode if the message asks for a deliverable. Saved item: the
 *            skipCallout.
 *          - a concept result sharing a conceptSlug with ANY FramingExchange
 *            already in this conversation (L9, framing once per topic) becomes
 *            a lookup. If any matching exchange was `answered`, nothing is
 *            saved (the user just worked through it); otherwise the
 *            skipCallout is the saved item.
 *          Downgrades are logged with the matched slugs.
 *     Concept path:  conversation → framing
 *       Create the assistant message (kind "framing", data { exchangeId },
 *       content may be "") and the FramingExchange (questions, conceptSlugs,
 *       skipCallout from the router). The stream ends; the UI shows the card
 *       and later calls the framing-answer route.
 *     Lookup path:   conversation → answer_delta… → callouts? → slot? → done
 *       Persist the answer message, its ONE featured Learn It Later item
 *       (R13, L5, E3) and — only while the experiment is active — the slot
 *       impression first, then emit `callouts` (a one-item list of the
 *       featured LearnLaterItemDTO plus any also-saved items), then
 *       `slot` (R15, active only), then `done`. Inactive: the featured item
 *       is the router's top pick and the stream is exactly
 *       … → callouts? → done. Active: the featured item is drawn per E2 (see
 *       R15). Deadline-downgraded concepts use this path with the "direct"
 *       answer mode.
 *     Task path (L8): conversation → answer_delta… → callouts? → slot? → done
 *       Same stream and persistence as the lookup path; the answerer runs in
 *       "task" mode (work product first). A whyCallout, when present, is
 *       always the featured item; else the E2 draw over the ranked
 *       hidden-decision callouts. whyCallout is dropped in code when the
 *       message reports no problem with the user's own work (planRoute).
 *       Clients need no task-specific handling.
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
 * R10 Order: 404 if not owned → 409 conflict if the exchange is not
 *     `pending` → validate responses (R11, skip = false only; 400) → rate
 *     limit (R6; 429) → transition out of `pending` atomically (update where
 *     status = "pending"; a lost race → 409) → stream. Validation comes
 *     before the rate limit so rejected submissions don't consume quota.
 *     Accepted submissions count toward the limit whether answered or skipped.
 *     skip = false: store the responses, mark `answered` (answeredAt), then
 *       stream the answer shaped by the responses (L6) and learning style (L7).
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
 *     FramingExchange.answerMessageId. This holds even when the user stops
 *     the stream (R3): the partial answer + "_(Stopped.)_", or, with no text
 *     yet, "_(Stopped before Claude answered.)_", becomes the answer message,
 *     so the exchange never stays answered/skipped without one (a retry
 *     would 409). A stopped exchange still counts toward progress if it was
 *     answered; the assessor doesn't run for it.
 *     Upstream failure (Claude busy/refusal/network, empty answer — not a
 *     stop): the stream still ends with the `error` event (R3), and before
 *     it the exchange is settled so it isn't stuck:
 *       ≥1 answer_delta sent → the partial text + "\n\n_(Claude hit an
 *         error; this answer is incomplete.)_" is stored as the answer
 *         message and answerMessageId is set (no assessor run).
 *       no delta → the exchange is reverted to `pending` (responses and
 *         answeredAt cleared) so the user can resubmit the same card. A
 *         queued skip item stays; R13 dedupe reuses it on the retry. If a
 *         `progress` event was already sent, the answered count silently
 *         drops back (the UI may have shown an unlock that the successful
 *         retry re-announces); this is accepted.
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
 * R12 After an answer (lookup, task, direct, framing answer, skip or
 *     dig-in), the route runs the assessor via `after()` from "next/server"
 *     (runs after the response finishes and survives on Vercel; register it in the handler and have the
 *     callback await the stream's outcome, skipping on error). It never delays
 *     `done`. When it finishes it sets User.lastAssessedAt (even if nothing
 *     changed); it typically lands ~4–6s after `done`. It does not run for a
 *     stopped answer (R3). Set `maxDuration` on the route to cover answer +
 *     assessor.
 *     UI rule: remember profile.tier and profile.lastAssessedAt before
 *     sending; after `done`, refetch GET /api/profile at ~1.5s, 4s, 8s and
 *     12s, stopping early once lastAssessedAt differs from the remembered
 *     pre-send value. If the new tier is higher
 *     than the remembered one (and it wasn't already celebrated via a
 *     `progress` event), show the unlock celebration — this catches a Tier 2
 *     unlock via 8 concepts, which only the assessor can cause.
 *
 * ── Learn It Later ───────────────────────────────────────────────────────────
 *
 * R13 Creating items (lookup/task callouts, skip callouts, assessor items) is an
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
 *                 order, current state, missing ids dropped; slot = the
 *                 SlotDTO joined from SlotImpression by message id (optional
 *                 field; null/absent when the answer had no slot, R15)
 *       text    → data null
 *
 * ── End-of-answer slot (E1–E5) ───────────────────────────────────────────────
 *
 * R15 Master switch: EXPERIMENT.active (env EXPERIMENT_ACTIVE; default TRUE
 *     now that the UI renders the slot — set EXPERIMENT_ACTIVE=0 to turn it
 *     off).
 *       Inactive: nothing below happens. No draw, no SlotImpression, no
 *         `slot` event, MessageDTO.data.slot is null; the router's top item is
 *         saved and emitted via `callouts` exactly as before (R8).
 *       Active: lookup / task / direct answers from POST /api/chat end with
 *         at most one box, as follows.
 *     Before the answer streams the server draws (src/lib/slot/policy.ts):
 *       featured item (E2): a task's whyCallout if present (fixed, L8), else
 *         router rank 1 with EXPERIMENT.topPickProbability (0.6), otherwise a
 *         lower rank uniformly (up to 3 candidates). No candidate → no slot.
 *       variant (E1): weighted draw (EXPERIMENT.weights) among eligible +
 *         enabled variants — card always; walkthrough needs a featured concept
 *         slug not yet framed in this conversation (L9); quickcheck always;
 *         apply needs known user projects or data types; none always.
 *     A failed draw (DB/other error) → no slot for that answer; the chat
 *     continues with the inactive behaviour (callouts only).
 *     walkthrough / quickcheck / apply payloads are generated by Haiku IN
 *     PARALLEL with the answer; if not ready EXPERIMENT.contentWaitMs (1.5s)
 *     after the answer finished (or failed) the slot falls back to "card"
 *     (logged as fallbackReason; analysis stays by the DRAWN variant).
 *     Latency note: only walkthrough / quickcheck / apply draws wait, so their
 *     `done` can arrive up to contentWaitMs later than card / none. The UI
 *     should keep showing the finished answer text (not a spinner) until
 *     `done`.
 *     Stream (active): … answer_delta… → callouts? → slot? → done
 *       card / walkthrough / quickcheck / apply: `callouts` = [the featured
 *         item] (backward compat) AND `slot`. The UI renders the slot and
 *         ignores `callouts` whenever a `slot` event (or data.slot) exists.
 *       none (control): `callouts` as above, then `slot` with variant
 *         "none" — render only a passive "Saved to Learn It Later" line.
 *       Every answer also saves the router's other candidates (≤ 3 items in
 *         all, alsoSavedCallouts); `callouts` lists them after the featured
 *         item and the UI shows them as "Also saved" chips under the slot.
 *     The item shown is the one R13 saves: when a queued item already covers
 *     the featured callout (findReusableLearnLaterItem, resolved at draw
 *     time), the payload is generated from THAT item's title / preview /
 *     appliedContext, and the impression records featuredTitle = the shown
 *     item's title plus reusedItem = true. If the saved item differs from the
 *     one the payload was written for (the queue changed mid-answer), the
 *     slot falls back to "card" (fallbackReason "item_changed").
 *     The featured item is ALWAYS saved to Learn It Later (E3), whatever the
 *     variant, including "none". A stopped answer gets no item and no slot. A
 *     tier unlock would replace the slot (E4, not logged) — in practice no
 *     unlock can coincide with a chat answer (framing answers have no slot;
 *     concept-count unlocks come from the assessor after `done`).
 *     No slot on: framing answers, skip answers (they keep `callouts`),
 *     dig-in answers, walk-through framing answers, apply answers.
 *     Engagement routes below: 404 if the impression isn't the user's (or its
 *     conversation/item is gone); 409 if the slot isn't that variant or the
 *     action was already taken (each is recorded once, first engagement →
 *     SlotImpression.engagement/engagedAt).
 *     Slot-generated user messages (walk-through R16, apply R18) are stored
 *     with Message.data = { origin: "slot", impressionId, action }
 *     (SlotUserMessageData; MessageDTO still exposes data: null for text) and
 *     quote the item title (quoteItemTitle). The E5 guardrail ignores them.
 *     Impressions survive persona resets (snapshot ids + SetNull FKs).
 *     Dev only (NODE_ENV !== "production"): POST /api/chat?slotVariant=<v>
 *     (or header x-slot-variant) forces an eligible variant; flagged forced,
 *     excluded from /results unless /results?forced=1. Needs the experiment
 *     active. The chat UI forwards it from the page URL (open
 *     /?slotVariant=quickcheck; remembered for the tab, ?slotVariant=off
 *     clears it; see src/lib/client/dev-slot-variant.ts).
 * POST /api/slot/[impressionId]/dig-in         → DigInResponse
 *     Any variant but "none". Same as POST /api/learn-later/[id]/dig-in for
 *     the featured item (then send kickoffMessage via POST /api/chat, R9);
 *     logs `dig_in` (first time only). No rate limit (R9 kickoff exemption).
 * R16 POST /api/slot/[impressionId]/walkthrough → NDJSON conversation → framing
 *     Variant "walkthrough". Rate-limited (R6), 409 if the concept was already
 *     framed in this conversation (L9). Generates 1–3 framing questions on the
 *     featured concept (Haiku, same rules as the router: L1–L3), stores a user
 *     message walkthroughMessageText(item.title) + a framing message +
 *     FramingExchange (conceptSlugs [slug], skipCallout = the item), and
 *     auto-skips any pending exchange (like R8d). Terminal event is the usual
 *     `framing`; answer it with POST /api/framing/[exchangeId]/answer (R10 —
 *     counts toward progress like any framing exchange). Logs
 *     `walkthrough_started` at click; released if generation fails (retryable).
 * R17 POST /api/slot/[impressionId]/quickcheck  body QuickCheckAnswerRequest
 *                                              → QuickCheckAnswerResponse
 *     Variant "quickcheck". { selectedIndex: number, dontKnow: false } or
 *     { selectedIndex: null, dontKnow: true }; 400 if the index is out of
 *     range. Deterministic feedback (no Claude call, no rate limit). Evidence
 *     on the featured concept's EXISTING mastery only (P7; +0.05 correct,
 *     −0.05 wrong, −0.02 I don't know); never creates a concept, never counts
 *     toward progress. The evidence entry is tagged source "quickcheck" (the
 *     E5 mastery metric excludes it). Logs `quickcheck_answered`.
 * R18 POST /api/slot/[impressionId]/apply → NDJSON conversation → answer_delta… → done
 *     Variant "apply". Rate-limited (R6). Stores a user message
 *     applyMessageText(item.title) and streams an answer (mode "apply")
 *     applying the concept to the user's projects/data; no callouts, no slot.
 *     Assessor runs afterwards (R12, existing masteries only). Stop/error
 *     handling as R3 (partial text kept); with no text at all the user
 *     message is removed and the action can be retried. Logs `apply_clicked`.
 *
 * GET /results (page, passcode-gated) — the E5 readout, grouped by the DRAWN
 *     variant (intent-to-treat); see src/lib/slot/results.ts.
 *
 * ── Profile ──────────────────────────────────────────────────────────────────
 *
 * GET   /api/profile                   → ProfileDTO (includes lastAssessedAt, R12)
 *   `learnLater` = queued + dug-in items; `dismissedLearnLater` = dismissed
 *   items, most recently dismissed first (≤50), for the queue's "Dismissed"
 *   section — so it survives reloads.
 * PATCH /api/profile                   body ProfilePatch → ProfileDTO
 *   Tier 2 only (403 tier_locked otherwise). Edited style dimensions get
 *   `*Overridden = true`; context edits set `userEdited = true`.
 *   Let Claude infer this again: `{ resetLearningStyle: ["briefVsThorough"] }`
 *   (any of intuitionVsFormal | entryPoint | briefVsThorough) clears the
 *   override so the assessor infers the dimension again. The value stays as
 *   a weak prior with confidence 0.15 ("still figuring this out") — the
 *   pre-edit estimate isn't stored, so it can't be restored (see
 *   src/lib/style-patch.ts). No-op for dimensions that aren't overridden;
 *   setting and resetting the same dimension in one patch → 400.
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
  SlotDTO,
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
  QuickCheckAnswerRequest,
  QuickCheckResultDTO,
  SlotCopy,
  SlotDTO,
  SlotEngagement,
  SlotVariant,
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
  slotDigIn: (impressionId: string) => `/api/slot/${encodeURIComponent(impressionId)}/dig-in`,
  slotWalkthrough: (impressionId: string) => `/api/slot/${encodeURIComponent(impressionId)}/walkthrough`,
  slotQuickcheck: (impressionId: string) => `/api/slot/${encodeURIComponent(impressionId)}/quickcheck`,
  slotApply: (impressionId: string) => `/api/slot/${encodeURIComponent(impressionId)}/apply`,
  results: "/results",
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

/**
 * The end-of-answer slot (E1, R15): emitted after `callouts` (if any) and
 * before `done` on lookup / task / direct answers that have a featured hidden
 * decision — only while EXPERIMENT.active. Already persisted (SlotImpression +
 * the E3 Learn It Later item). When present, render it instead of `callouts`;
 * for variant "none" only a passive saved-item line is rendered.
 */
export interface SlotEvent {
  type: "slot";
  slot: SlotDTO;
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
  | SlotEvent
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

/** POST /api/slot/[impressionId]/quickcheck (R17). */
export interface QuickCheckAnswerResponse {
  /** The slot with quickcheck.result filled in. */
  slot: SlotDTO;
  /** Mastery change on the featured concept (existing masteries only, P7), or null. */
  mastery: { slug: string; score: number; delta: number } | null;
}

/**
 * A model-written item title as it appears inside a slot-generated user
 * message: one line, trailing periods dropped, inner double quotes turned
 * into single quotes, wrapped in double quotes — so later turns read it as a
 * quoted topic, never as a raw user instruction.
 */
export function quoteItemTitle(itemTitle: string): string {
  const t = itemTitle.replace(/\s+/g, " ").trim().replace(/\.+$/, "").replace(/["“”]/g, "'");
  return `"${t}"`;
}

/** User message stored (and shown) when "Walk me through it" is clicked (R16). */
export function walkthroughMessageText(itemTitle: string): string {
  return `Walk me through it: ${quoteItemTitle(itemTitle)}`;
}

/** User message stored (and shown) when "Apply it to my project" is clicked (R18). */
export function applyMessageText(itemTitle: string): string {
  return `Apply this to my project: ${quoteItemTitle(itemTitle)}`;
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
