"use client";
// One chat: transcript + composer. A view only — the session (transcript,
// stream, stop) lives in ChatSessionsProvider, so it survives the new-chat
// URL swap and navigating away and back.
//   `/`       → <NewChatView>       (the current new-chat session)
//   `/c/[id]` → <ConversationView>  (the live session for id, or one from the DTO)
import { useEffect, useLayoutEffect, useRef } from "react";
import { claimKickoff } from "@/lib/client/kickoff-guard";
import type { ConversationDTO } from "@/lib/types";
import type { ChatSession, InlineError } from "./chat-session";
import { useConversationSession, useNewChatSession, useSessionState } from "./chat-sessions-provider";
import { Composer } from "./composer";
import { EmptyState } from "./empty-state";
import { MessageItem } from "./message-item";
import { PendingIndicator } from "./pending-indicator";
import type { StarterPrompt } from "./starter-prompts";

const COLUMN = "mx-auto w-full max-w-[46rem] px-4";

export function NewChatView({ starters, greetingName }: { starters: StarterPrompt[]; greetingName: string | null }) {
  const session = useNewChatSession();
  // Keyed by the session so "New chat" resets scroll/focus state too.
  return <ChatView key={session.uid} session={session} starters={starters} greetingName={greetingName} />;
}

export function ConversationView({
  initial,
  kickoffMessage = null,
}: {
  initial: ConversationDTO;
  /** Dig-in kickoff to auto-send once (R9); derived server-side. */
  kickoffMessage?: string | null;
}) {
  const session = useConversationSession(initial);
  return <ChatView session={session} kickoffMessage={kickoffMessage} />;
}

function ChatView({
  session,
  kickoffMessage = null,
  starters = [],
  greetingName = null,
}: {
  session: ChatSession;
  kickoffMessage?: string | null;
  starters?: StarterPrompt[];
  greetingName?: string | null;
}) {
  const state = useSessionState(session);
  const { messages, phase, conversationId, draft, error } = state;
  const busy = phase !== "idle";

  // Dig-in kickoff: once per conversation (guard survives strict-mode double
  // effects and remounts; released again if the send fails before streaming).
  useEffect(() => {
    if (!kickoffMessage || !conversationId || !session.pristine) return;
    if (!claimKickoff(conversationId)) return;
    void session.send(kickoffMessage, { kickoff: true });
  }, [kickoffMessage, conversationId, session]);

  // ── Scrolling: follow the stream while the reader is at the bottom ──
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const submit = (text: string) => {
    void session.send(text);
    session.setDraft("");
    stickToBottom.current = true;
  };

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, phase]);

  const lastFramingIndex = messages.findLastIndex((m) => m.kind === "framing");
  const waiting =
    phase === "routing" || phase === "answering" || (phase === "streaming" && !messages.at(-1)?.content);

  const retry = () => {
    stickToBottom.current = true;
    session.retry();
  };

  const composer = (
    <Composer
      value={draft}
      onChange={session.setDraft}
      onSubmit={() => submit(draft)}
      onStop={session.stop}
      busy={busy}
      canStop={busy}
      autoFocus={messages.length === 0}
      hint={
        messages.some((m) => m.kind === "framing" && m.data.status === "pending") && !busy ? (
          <span>Sending a new message skips the open framing questions.</span>
        ) : null
      }
    />
  );

  const liveRegion = (
    <div className="sr-only" role="status" aria-live="polite">
      {state.announcement}
    </div>
  );

  if (messages.length === 0 && !busy && !kickoffMessage) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {liveRegion}
        <EmptyState name={greetingName} starters={starters} composer={composer} onPick={submit} disabled={busy} />
        {error && (
          <div className={`${COLUMN} pb-8`}>
            <ErrorNotice error={error} onDismiss={session.dismissError} onRetry={retry} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {liveRegion}
      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <div className={`${COLUMN} space-y-7 pt-6 pb-10 sm:pt-10`}>
          {messages.map((m, i) => {
            const next = messages[i + 1];
            const inFlight = busy && i === lastFramingIndex && !next;
            const abandoned =
              m.kind === "framing" && m.data.status === "skipped" && next?.role !== "assistant" && !inFlight;
            // "Saved to Learn It Later" only when the answer actually carries the skip item (R10).
            const skipSaved =
              m.kind === "framing" &&
              next?.kind === "answer" &&
              next.data.callouts.some((c) => c.origin === "skipped");
            return (
              <MessageItem
                key={m.clientKey}
                message={m}
                abandoned={abandoned}
                skipSaved={skipSaved}
                busy={busy}
                framingError={m.kind === "framing" ? state.framingErrors[m.data.exchangeId] : undefined}
                onAnswerFraming={session.answerFraming}
                onItemUpdated={session.updateCallout}
                onConflict={session.sync}
              />
            );
          })}
          {waiting && (
            <PendingIndicator key={state.pendingSince} kind={state.pendingKind} since={state.pendingSince} />
          )}
          {error && <ErrorNotice error={error} onDismiss={session.dismissError} onRetry={retry} />}
        </div>
      </div>
      <div className="bg-gradient-to-t from-cream via-cream to-cream/0 pt-2 pb-3 sm:pb-4">
        <div className={COLUMN}>
          {composer}
          <p className="mt-2 text-center text-[0.7rem] text-ink-muted">
            Claude can make mistakes. Check important results — especially before they go in your thesis.
          </p>
        </div>
      </div>
    </div>
  );
}

function ErrorNotice({
  error,
  onDismiss,
  onRetry,
}: {
  error: InlineError;
  onDismiss: () => void;
  onRetry: () => void;
}) {
  const gentle = error.kind === "rate_limit";
  return (
    <div
      role="alert"
      className={`flex animate-fade-in items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
        gentle ? "border-spark/40 bg-spark-soft text-ink" : "border-danger/30 bg-surface text-danger"
      }`}
    >
      <p>{error.message}</p>
      <div className="flex shrink-0 items-center gap-1">
        {error.retry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md border border-line-strong bg-surface px-2.5 py-0.5 font-medium text-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-accent"
          >
            Retry
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md px-1.5 text-ink-muted hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
