// Chat session store + streaming client (R3, R8–R12). Framework-free: a
// small external store (subscribe/getState, read with useSyncExternalStore)
// that lives in ChatSessionsProvider, so a session — its transcript, abort
// controller and stream consumption — survives page navigations. Views
// (ChatView) attach to it; they never own the stream.
//
// Owns the transcript for one conversation (or a brand-new chat), POSTs to
// /api/chat and /api/framing/[id]/answer, and consumes their NDJSON streams
// with readNdjson. Handles stop (AbortController), inline errors with Retry,
// framing card reverts, sidebar updates and the profile hooks (beginTurn /
// applyProgress / afterAnswer). Also runs the streaming end-of-answer slot
// actions (walk-through R16, apply R18) and keeps slot state (R15) in sync.
import {
  API_ROUTES,
  applyMessageText,
  walkthroughMessageText,
  type ChatStreamEvent,
  type ProgressEvent,
} from "@/lib/api-contract";
import { readNdjson } from "@/lib/ndjson";
import type {
  ConversationDTO,
  ConversationSummaryDTO,
  FramingMessageDTO,
  FramingResponse,
  LearnLaterItemDTO,
  MessageDTO,
  SlotDTO,
} from "@/lib/types";
import { ApiRequestError, apiJson, friendlyError, isAbortError, postForStream } from "@/lib/client/api";
import { chatUrl } from "@/lib/client/dev-slot-variant";
import { releaseKickoff } from "@/lib/client/kickoff-guard";
import type { ProfileDTO } from "@/lib/types";
import type { TurnSnapshot } from "@/lib/client/profile-store";
import type { PendingKind } from "./pending-indicator";

export type ChatMessage = MessageDTO & {
  /**
   * Stable React key for the lifetime of the bubble. `id` is the server id
   * once known (swapped in by the `conversation` / `done` events); the key
   * never changes, so id swaps don't remount (no re-render/animation flash).
   */
  clientKey: string;
  /** Answer text is still arriving. */
  streaming?: boolean;
  /** Small note under an answer, e.g. "Claude hit an error". */
  notice?: string;
};

export type ChatPhase =
  /** Nothing in flight. */
  | "idle"
  /** POST /api/chat sent; the router is deciding (6–8s observed). */
  | "routing"
  /** Framing answer submitted; waiting for the first delta. */
  | "answering"
  /** Answer text is arriving. */
  | "streaming";

export interface InlineError {
  message: string;
  /** Rate-limited: show as a gentle notice, not a failure. */
  kind: "error" | "rate_limit";
  /** Offer a Retry button that re-sends this user message. */
  retry?: { text: string; kickoff: boolean };
}

export interface ChatSessionState {
  conversationId: string | null;
  messages: ChatMessage[];
  phase: ChatPhase;
  /** Which pending copy to show while waiting (see PendingIndicator). */
  pendingKind: PendingKind;
  /** Date.now() when the current wait started (keeps the copy's progress across remounts). */
  pendingSince: number;
  error: InlineError | null;
  /** Per-exchange error notes for framing cards (kept across syncs). */
  framingErrors: Record<string, string>;
  announcement: string;
  /** Composer text (kept with the session so it survives navigation). */
  draft: string;
}

/** What a session needs from the app (profile + sidebar stores, registry). */
export interface ChatSessionHost {
  beginTurn: () => TurnSnapshot;
  applyProgress: (event: ProgressEvent) => void;
  afterAnswer: (turn: TurnSnapshot) => void;
  refreshProfile: () => Promise<ProfileDTO>;
  upsertConversation: (summary: ConversationSummaryDTO) => void;
  touchConversation: (id: string) => void;
  /** A new chat learned its conversation id (first `conversation` event). */
  promoted: (session: ChatSession, conversationId: string) => void;
}

type StreamOutcome = "done" | "framing" | "error" | "aborted" | "dropped";
interface StreamResult {
  outcome: StreamOutcome;
  sawDelta: boolean;
  errorMessage?: string;
  /** clientKey of the answer bubble, or null if none was created. */
  answerKey: string | null;
  /** From the terminal event: the framing exchange (framing) or the answer message (done). */
  exchangeId?: string;
  messageId?: string;
}

type StreamingSlot = Extract<SlotDTO, { variant: "walkthrough" | "apply" }>;

const STOPPED_SUFFIX = "\n\n_(Stopped.)_";
const STOPPED_BEFORE = "_(Stopped before Claude answered.)_";
/** Give the server a moment to persist after a disconnect before syncing (R3). */
const SYNC_AFTER_STOP_MS = 900;
/** Delta coalescing window. setTimeout (not rAF) so background tabs keep up. */
const FLUSH_MS = 40;

/** "Claude is busy" → "Claude is busy." (no doubled punctuation). */
const sentence = (msg: string) => (/[.!?]$/.test(msg.trim()) ? msg.trim() : `${msg.trim()}.`);

let localSeq = 0;
export const localKey = (prefix: string) => `local-${prefix}-${++localSeq}`;
const isLocalId = (id: string) => id.startsWith("local-");

const fromDTO = (m: MessageDTO): ChatMessage => ({ ...m, clientKey: m.id });

/**
 * Adopt a server transcript while keeping existing React keys: match by
 * server id, else (for local-only bubbles like a stopped partial answer) by
 * position when role + kind agree.
 */
function mergeServerMessages(current: ChatMessage[], fresh: MessageDTO[]): ChatMessage[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  const used = new Set<string>();
  return fresh.map((m, i) => {
    const same = byId.get(m.id);
    if (same && !used.has(same.clientKey)) {
      used.add(same.clientKey);
      return { ...m, clientKey: same.clientKey };
    }
    const atIndex = current[i];
    if (atIndex && isLocalId(atIndex.id) && atIndex.role === m.role && atIndex.kind === m.kind && !used.has(atIndex.clientKey)) {
      used.add(atIndex.clientKey);
      return { ...m, clientKey: atIndex.clientKey };
    }
    return fromDTO(m);
  });
}

export class ChatSession {
  /** Stable identity (React key for the view showing it). */
  readonly uid = localKey("session");
  /** Views currently showing this session (see ChatSessionsProvider). */
  viewers = 0;
  private state: ChatSessionState;
  private listeners = new Set<() => void>();
  private abort: AbortController | null = null;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private disposed = false;
  private lastDto: ConversationDTO | null;

  constructor(
    initial: ConversationDTO | null,
    private readonly host: () => ChatSessionHost,
  ) {
    this.lastDto = initial;
    this.state = {
      conversationId: initial?.id ?? null,
      messages: (initial?.messages ?? []).map(fromDTO),
      phase: "idle",
      pendingKind: "route",
      pendingSince: 0,
      error: null,
      framingErrors: {},
      announcement: "",
      draft: "",
    };
  }

  // ── Store plumbing ───────────────────────────────────────────────────────

  getState = (): ChatSessionState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  private set(patch: Partial<ChatSessionState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  private setMessages(fn: (cur: ChatMessage[]) => ChatMessage[]) {
    this.set({ messages: fn(this.state.messages) });
  }

  private later(fn: () => void, delay: number) {
    if (this.disposed) return;
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (!this.disposed) fn();
    }, delay);
    this.timers.add(t);
  }

  get busy(): boolean {
    return this.state.phase !== "idle";
  }

  /** Nothing sent yet and nothing in flight. */
  get pristine(): boolean {
    return this.state.messages.length === 0 && this.state.phase === "idle";
  }

  /** Register a view; returns the detach function. */
  attach = (): (() => void) => {
    this.viewers++;
    return () => {
      this.viewers--;
    };
  };

  /** Stop timers and any in-flight stream (persona switch, eviction, abandoned new chat). */
  dispose() {
    this.disposed = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.abort?.abort();
    this.abort = null;
    this.listeners.clear();
  }

  // ── Server sync ──────────────────────────────────────────────────────────

  /**
   * Adopt a server-rendered snapshot of this conversation, but only when the
   * session is idle and the snapshot isn't behind what we already have (it
   * contains every server-confirmed message and at least as many messages).
   * A mid-stream snapshot therefore never clobbers a live/finished stream.
   */
  hydrate(dto: ConversationDTO) {
    if (dto === this.lastDto || this.busy || dto.id !== this.state.conversationId) return;
    this.lastDto = dto;
    const ids = new Set(dto.messages.map((m) => m.id));
    const cur = this.state.messages;
    const behind = dto.messages.length < cur.length || cur.some((m) => !isLocalId(m.id) && !ids.has(m.id));
    if (behind) return;
    this.set({ messages: mergeServerMessages(cur, dto.messages) });
  }

  sync = async () => {
    const id = this.state.conversationId;
    if (!id || this.disposed) return;
    try {
      const fresh = await apiJson<ConversationDTO>(API_ROUTES.conversation(id));
      if (this.disposed || this.busy) return;
      this.set({ messages: mergeServerMessages(this.state.messages, fresh.messages) });
    } catch (err) {
      console.warn("Conversation sync failed", err);
    }
  };

  private syncSoon(delay = SYNC_AFTER_STOP_MS) {
    this.later(() => void this.sync(), delay);
  }

  // ── Stream consumption ───────────────────────────────────────────────────

  /**
   * Reads one NDJSON stream into the transcript. The streaming answer bubble
   * is created on the first delta. Deltas are coalesced (FLUSH_MS) so
   * markdown re-renders stay cheap. `userKey` is the optimistic user bubble
   * of THIS send (only it receives the stored id from `conversation`).
   */
  private async consume(
    response: Response,
    signal: AbortSignal,
    turn: TurnSnapshot,
    userKey: string | null,
  ): Promise<StreamResult> {
    const host = this.host();
    let answerKey: string | null = null;
    let sawDelta = false;
    /** A Learn It Later item arrived with this answer (callouts / slot, E3). */
    let sawItem = false;
    let buffered = "";
    let frame: ReturnType<typeof setTimeout> | null = null;
    // Terminal event seen. We keep reading until the server closes the
    // stream (it does right after the terminal event) instead of cancelling
    // it, so a finished answer is never mistaken for a client stop (R3).
    let terminal: StreamResult | null = null;

    const flush = () => {
      if (frame !== null) {
        clearTimeout(frame);
        frame = null;
      }
      if (!buffered) return;
      const text = buffered;
      buffered = "";
      const key = answerKey;
      this.setMessages((cur) =>
        cur.map((m) => (m.clientKey === key && m.kind === "answer" ? { ...m, content: m.content + text } : m)),
      );
    };

    const ensureAnswer = () => {
      if (answerKey) return;
      answerKey = localKey("answer");
      const bubble: ChatMessage = {
        id: answerKey,
        clientKey: answerKey,
        role: "assistant",
        kind: "answer",
        content: "",
        createdAt: new Date().toISOString(),
        data: { callouts: [] },
        streaming: true,
      };
      this.set({
        messages: [...this.state.messages, bubble],
        phase: "streaming",
        announcement: "Claude is responding…",
      });
    };

    try {
      for await (const event of readNdjson<ChatStreamEvent>(response, signal)) {
        if (terminal) continue;
        switch (event.type) {
          case "conversation": {
            const isNew = this.state.conversationId !== event.conversationId;
            this.set({
              conversationId: event.conversationId,
              messages: this.state.messages.map((m) =>
                m.clientKey === userKey ? { ...m, id: event.userMessageId } : m,
              ),
            });
            if (event.title) {
              const now = new Date().toISOString();
              host.upsertConversation({
                id: event.conversationId,
                title: event.title,
                origin: "chat",
                learnLaterItemId: null,
                createdAt: now,
                updatedAt: now,
              });
            } else {
              host.touchConversation(event.conversationId);
            }
            if (isNew) host.promoted(this, event.conversationId);
            break;
          }
          case "framing": {
            const framing: ChatMessage = {
              id: event.messageId,
              clientKey: event.messageId,
              role: "assistant",
              kind: "framing",
              content: "",
              createdAt: new Date().toISOString(),
              data: { exchangeId: event.exchangeId, questions: event.questions, responses: null, status: "pending" },
            };
            this.set({
              messages: [...this.state.messages, framing],
              announcement: "Claude asked a few framing questions before answering.",
            });
            terminal = { outcome: "framing", sawDelta, answerKey, exchangeId: event.exchangeId, messageId: event.messageId };
            break;
          }
          case "progress":
            host.applyProgress(event);
            break;
          case "answer_delta": {
            ensureAnswer();
            sawDelta = true;
            buffered += event.text;
            if (frame === null) frame = setTimeout(flush, FLUSH_MS);
            break;
          }
          case "callouts": {
            flush();
            ensureAnswer();
            sawItem ||= event.items.length > 0;
            const key = answerKey;
            this.setMessages((cur) =>
              cur.map((m) =>
                m.clientKey === key && m.kind === "answer" ? { ...m, data: { ...m.data, callouts: event.items } } : m,
              ),
            );
            break;
          }
          case "slot": {
            // R15: the end-of-answer box replaces the callout chips. It can
            // land up to EXPERIMENT.contentWaitMs after the last delta; the
            // finished text simply stays in place meanwhile.
            flush();
            ensureAnswer();
            sawItem = true;
            const key = answerKey;
            this.setMessages((cur) =>
              cur.map((m) =>
                m.clientKey === key && m.kind === "answer" ? { ...m, data: { ...m.data, slot: event.slot } } : m,
              ),
            );
            break;
          }
          case "done": {
            flush();
            const key = answerKey;
            if (key) {
              this.setMessages((cur) =>
                cur.map((m) => (m.clientKey === key ? { ...m, id: event.messageId, streaming: false } : m)),
              );
            } else {
              // No deltas and no callouts: the answer exists server-side only.
              this.syncSoon(300);
            }
            host.afterAnswer(turn);
            // The featured item is already queued (E3): show it in the queue
            // now rather than after the first assessor poll.
            if (sawItem) void host.refreshProfile();
            terminal = { outcome: "done", sawDelta, answerKey, messageId: event.messageId };
            break;
          }
          case "error": {
            flush();
            terminal = { outcome: "error", sawDelta, errorMessage: event.message, answerKey };
            break;
          }
        }
      }
    } catch (err) {
      flush();
      if (terminal) return terminal;
      if (isAbortError(err) || signal.aborted) return { outcome: "aborted", sawDelta, answerKey };
      return { outcome: "dropped", sawDelta, errorMessage: friendlyError(err), answerKey };
    }
    flush();
    if (terminal) return terminal;
    return { outcome: signal.aborted ? "aborted" : "dropped", sawDelta, answerKey };
  }

  /** Common tail after a stream ends (anything but done/framing). */
  private settleInterrupted(
    result: StreamResult,
    opts: { framingExchangeId?: string; retryText?: string; kickoff?: boolean },
  ) {
    const { outcome, sawDelta, answerKey } = result;
    if (outcome === "aborted") {
      if (sawDelta && answerKey) {
        this.setMessages((cur) =>
          cur.map((m) =>
            m.clientKey === answerKey ? { ...m, content: m.content + STOPPED_SUFFIX, streaming: false } : m,
          ),
        );
      } else {
        // Drop an empty bubble created by an early `callouts` event.
        if (answerKey) this.setMessages((cur) => cur.filter((m) => m.clientKey !== answerKey));
        if (opts.framingExchangeId) {
          const key = localKey("answer");
          const stopped: ChatMessage = {
            id: key,
            clientKey: key,
            role: "assistant",
            kind: "answer",
            content: STOPPED_BEFORE,
            createdAt: new Date().toISOString(),
            data: { callouts: [] },
          };
          this.setMessages((cur) => [...cur, stopped]);
        }
      }
      this.set({ announcement: "Stopped." });
      this.syncSoon();
      void this.host().refreshProfile();
      return;
    }

    // error / dropped
    const message = result.errorMessage ?? "Something went wrong";
    if (sawDelta && answerKey) {
      this.setMessages((cur) =>
        cur.map((m) =>
          m.clientKey === answerKey
            ? { ...m, streaming: false, notice: "Claude hit an error, so this answer is incomplete." }
            : m,
        ),
      );
      this.set({ error: { kind: "error", message: `${sentence(message)} The partial answer was kept.` } });
    } else if (opts.framingExchangeId) {
      // R10: nothing streamed → the exchange was reopened. Make the card interactive again.
      const exId = opts.framingExchangeId;
      this.set({
        messages: this.state.messages
          .filter((m) => m.clientKey !== answerKey)
          .map((m) =>
            m.kind === "framing" && m.data.exchangeId === exId
              ? { ...m, data: { ...m.data, status: "pending", responses: null } }
              : m,
          ),
        framingErrors: { ...this.state.framingErrors, [exId]: `${sentence(message)} Your answers are still here — try again.` },
      });
    } else {
      // Nothing streamed for a chat message: the server kept the user message
      // (R8e) — offer Retry and hand the text back if the composer is empty.
      if (answerKey) this.setMessages((cur) => cur.filter((m) => m.clientKey !== answerKey));
      const text = opts.retryText;
      this.set({
        error: {
          kind: "error",
          message: `${sentence(message)} Please try again.`,
          retry: text ? { text, kickoff: !!opts.kickoff } : undefined,
        },
        draft: text && !opts.kickoff && !this.state.draft ? text : this.state.draft,
      });
    }
    this.set({ announcement: "Something went wrong." });
    this.syncSoon(400);
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  setDraft = (draft: string) => this.set({ draft });

  dismissError = () => this.set({ error: null });

  /**
   * Send a user message. Resolves to false if busy. On a pre-stream error the
   * optimistic message is removed, the text goes back to an empty composer
   * and the error notice offers Retry.
   */
  send = async (text: string, opts?: { kickoff?: boolean }): Promise<boolean> => {
    const message = text.trim();
    if (!message || this.busy || this.disposed) return false;
    const host = this.host();
    const kickoff = !!opts?.kickoff;
    const turn = host.beginTurn();
    const controller = new AbortController();
    this.abort = controller;

    const userKey = localKey("user");
    const userMsg: ChatMessage = {
      id: userKey,
      clientKey: userKey,
      role: "user",
      kind: "text",
      content: message,
      createdAt: new Date().toISOString(),
      data: null,
    };
    this.set({
      error: null,
      messages: [...this.state.messages, userMsg],
      pendingKind: kickoff ? "kickoff" : "route",
      pendingSince: Date.now(),
      phase: "routing",
      announcement: "Claude is thinking…",
    });

    try {
      const response = await postForStream(
        chatUrl(),
        { conversationId: this.state.conversationId ?? undefined, message },
        controller.signal,
      );
      const result = await this.consume(response, controller.signal, turn, userKey);
      if (result.outcome === "done") this.set({ announcement: "Response complete." });
      else if (result.outcome !== "framing") this.settleInterrupted(result, { retryText: message, kickoff });
    } catch (err) {
      if (isAbortError(err)) {
        // Stopped before the response arrived: server keeps only the user message (R3).
        this.set({ announcement: "Stopped." });
        this.syncSoon();
      } else {
        if (kickoff && this.state.conversationId) releaseKickoff(this.state.conversationId);
        const rateLimited = err instanceof ApiRequestError && err.code === "rate_limited";
        this.set({
          messages: this.state.messages.filter((m) => m.clientKey !== userKey),
          draft: !kickoff && !this.state.draft ? message : this.state.draft,
          error: {
            kind: rateLimited ? "rate_limit" : "error",
            message: friendlyError(err),
            retry: rateLimited ? undefined : { text: message, kickoff },
          },
          announcement: friendlyError(err),
        });
      }
    } finally {
      if (this.abort === controller) this.abort = null;
      this.set({ phase: "idle" });
    }
    return true;
  };

  /** Re-send the message behind the current error notice. */
  retry = () => {
    const r = this.state.error?.retry;
    if (!r || this.busy) return;
    if (this.state.draft.trim() === r.text) this.set({ draft: "" });
    void this.send(r.text, { kickoff: r.kickoff });
  };

  /** Submit a framing card (L1–L3) or "Just answer" (skip). */
  answerFraming = async (exchangeId: string, input: { responses: FramingResponse[]; skip: boolean }) => {
    if (this.busy || this.disposed) return;
    const host = this.host();
    const turn = host.beginTurn();
    const controller = new AbortController();
    this.abort = controller;

    const setStatus = (status: FramingMessageDTO["data"]["status"], responses: FramingResponse[] | null) =>
      this.setMessages((cur) =>
        cur.map((m) =>
          m.kind === "framing" && m.data.exchangeId === exchangeId ? { ...m, data: { ...m.data, status, responses } } : m,
        ),
      );

    const framingErrors = { ...this.state.framingErrors };
    delete framingErrors[exchangeId];
    this.set({
      error: null,
      framingErrors,
      pendingKind: input.skip ? "skip" : "framed",
      pendingSince: Date.now(),
      phase: "answering",
      announcement: input.skip ? "Answering directly…" : "Claude is building on your answers…",
    });
    setStatus(input.skip ? "skipped" : "answered", input.skip ? null : input.responses);

    const setFramingError = (msg: string) =>
      this.set({ framingErrors: { ...this.state.framingErrors, [exchangeId]: msg } });

    try {
      const response = await postForStream(
        API_ROUTES.framingAnswer(exchangeId),
        input.skip ? { responses: [], skip: true } : { responses: input.responses },
        controller.signal,
      );
      if (this.state.conversationId) host.touchConversation(this.state.conversationId);
      const result = await this.consume(response, controller.signal, turn, null);
      if (result.outcome !== "done") this.settleInterrupted(result, { framingExchangeId: exchangeId });
      else this.set({ announcement: "Response complete." });
    } catch (err) {
      if (isAbortError(err)) {
        // The server may or may not have accepted it; the sync decides.
        this.set({ announcement: "Stopped." });
        this.syncSoon();
      } else if (err instanceof ApiRequestError && err.status === 409) {
        // Already answered elsewhere (another tab / double submit): take the server's view.
        setFramingError("This was already answered — showing the latest.");
        this.set({ phase: "idle" });
        await this.sync();
      } else {
        setStatus("pending", null);
        setFramingError(friendlyError(err));
        this.set({ announcement: friendlyError(err) });
      }
    } finally {
      if (this.abort === controller) this.abort = null;
      this.set({ phase: "idle" });
    }
  };

  /** Stop the in-flight stream (R3). The server keeps the partial answer. */
  stop = () => {
    this.abort?.abort();
  };

  /** Replace a Learn It Later item everywhere it appears (chips and slots; after dismiss/dig in). */
  updateCallout = (item: LearnLaterItemDTO) => {
    this.setMessages((cur) =>
      cur.map((m) => {
        if (m.kind !== "answer") return m;
        const slot = m.data.slot;
        const inCallouts = m.data.callouts.some((c) => c.id === item.id);
        const inSlot = slot?.item.id === item.id;
        if (!inCallouts && !inSlot) return m;
        return {
          ...m,
          data: {
            ...m.data,
            callouts: inCallouts ? m.data.callouts.map((c) => (c.id === item.id ? item : c)) : m.data.callouts,
            slot: inSlot && slot ? { ...slot, item } : slot,
          },
        };
      }),
    );
  };

  // ── End-of-answer slot (R15–R18) ─────────────────────────────────────────

  /** Adopt a SlotDTO (e.g. the quick-check response, or a local engagement update). */
  updateSlot = (slot: SlotDTO) => this.patchSlot(slot.impressionId, () => slot);

  private patchSlot(impressionId: string, fn: (slot: SlotDTO) => SlotDTO) {
    this.setMessages((cur) =>
      cur.map((m) =>
        m.kind === "answer" && m.data.slot?.impressionId === impressionId
          ? { ...m, data: { ...m.data, slot: fn(m.data.slot) } }
          : m,
      ),
    );
  }

  /** "Walk me through it" (B, R16): user bubble → framing card (answered via answerFraming). */
  slotWalkthrough = (slot: Extract<SlotDTO, { variant: "walkthrough" }>) => this.runSlotStream(slot);

  /** "Apply it to my project" (D, R18): user bubble → streamed answer. */
  slotApply = (slot: Extract<SlotDTO, { variant: "apply" }>) => this.runSlotStream(slot);

  /**
   * Walk-through and apply: an optimistic user bubble with the exact text the
   * server stores (walkthroughMessageText / applyMessageText), the slot marked
   * engaged at once (its button becomes "Started below" / "Applied below"),
   * then the stream is consumed like a chat send. When nothing was stored
   * (failure/stop before any text) the server releases the action, so the
   * bubble goes and the slot reverts — the user can click again.
   */
  private async runSlotStream(slot: StreamingSlot) {
    if (this.busy || this.disposed) return;
    const host = this.host();
    const walk = slot.variant === "walkthrough";
    const turn = host.beginTurn();
    const controller = new AbortController();
    this.abort = controller;

    const userKey = localKey("user");
    const userMsg: ChatMessage = {
      id: userKey,
      clientKey: userKey,
      role: "user",
      kind: "text",
      content: walk ? walkthroughMessageText(slot.item.title) : applyMessageText(slot.item.title),
      createdAt: new Date().toISOString(),
      data: null,
    };
    const revert = () => {
      this.set({ messages: this.state.messages.filter((m) => m.clientKey !== userKey) });
      this.patchSlot(slot.impressionId, () => slot);
    };
    this.set({
      error: null,
      messages: [...this.state.messages, userMsg],
      pendingKind: walk ? "walkthrough" : "apply",
      pendingSince: Date.now(),
      phase: "routing",
      announcement: walk ? "Claude is writing a few questions to walk you through it…" : "Claude is applying this to your project…",
    });
    this.patchSlot(slot.impressionId, (s) => ({
      ...s,
      engagement: s.engagement ?? (walk ? "walkthrough_started" : "apply_clicked"),
      engagedAt: s.engagedAt ?? new Date().toISOString(),
    }));

    try {
      const url = walk ? API_ROUTES.slotWalkthrough(slot.impressionId) : API_ROUTES.slotApply(slot.impressionId);
      const response = await postForStream(url, {}, controller.signal);
      const result = await this.consume(response, controller.signal, turn, userKey);
      if (result.outcome === "framing") {
        const exchangeId = result.exchangeId ?? null;
        this.patchSlot(slot.impressionId, (s) => (s.variant === "walkthrough" ? { ...s, exchangeId } : s));
      } else if (result.outcome === "done") {
        const applyMessageId = result.messageId ?? null;
        this.patchSlot(slot.impressionId, (s) => (s.variant === "apply" ? { ...s, applyMessageId } : s));
        this.set({ announcement: "Response complete." });
      } else if (result.sawDelta) {
        // Apply answer cut short: the partial text is kept (R3, R18).
        this.settleInterrupted(result, {});
      } else {
        // Nothing stored: the server dropped the user message and released the action.
        if (result.answerKey) this.setMessages((cur) => cur.filter((m) => m.clientKey !== result.answerKey));
        revert();
        if (result.outcome === "aborted") {
          this.set({ announcement: "Stopped." });
        } else {
          const message = `${sentence(result.errorMessage ?? "Something went wrong")} Try again in a moment.`;
          this.set({ error: { kind: "error", message }, announcement: message });
        }
        this.syncSoon(400);
      }
    } catch (err) {
      revert();
      if (isAbortError(err)) {
        this.set({ announcement: "Stopped." });
        this.syncSoon();
      } else if (err instanceof ApiRequestError && err.status === 409) {
        // Already used (another tab / double click): take the server's view.
        this.set({ phase: "idle", announcement: "This was already started — showing the latest." });
        await this.sync();
      } else {
        const rateLimited = err instanceof ApiRequestError && err.code === "rate_limited";
        const message =
          err instanceof ApiRequestError && err.status === 404
            ? "This suggestion isn’t available any more — the conversation may have been reset."
            : friendlyError(err);
        this.set({ error: { kind: rateLimited ? "rate_limit" : "error", message }, announcement: message });
      }
    } finally {
      if (this.abort === controller) this.abort = null;
      this.set({ phase: "idle" });
    }
  }
}
