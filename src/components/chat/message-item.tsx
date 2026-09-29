"use client";
import { FramingCard } from "@/components/framing/framing-card";
import { CalloutChips } from "@/components/learn-later/callout-chips";
import { Markdown } from "@/components/markdown/markdown";
import { EndOfAnswerSlot, type SlotHandlers } from "@/components/slot/end-of-answer-slot";
import type { FramingResponse, LearnLaterItemDTO } from "@/lib/types";
import type { ChatMessage } from "./chat-session";

export function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-surface-muted px-4 py-2.5 text-[0.97rem] leading-relaxed whitespace-pre-wrap text-ink">
        <span className="sr-only">You said: </span>
        {content}
      </div>
    </div>
  );
}

export function MessageItem({
  message,
  abandoned,
  skipSaved,
  busy,
  framingError,
  onAnswerFraming,
  onItemUpdated,
  onConflict,
  onSlotUpdated,
  onWalkthrough,
  onApply,
}: {
  message: ChatMessage;
  abandoned: boolean;
  /** A skipped framing whose answer carries the saved skip item. */
  skipSaved: boolean;
  busy: boolean;
  framingError?: string;
  onAnswerFraming: (exchangeId: string, input: { responses: FramingResponse[]; skip: boolean }) => void;
  onItemUpdated: (item: LearnLaterItemDTO) => void;
  onConflict: () => void;
} & Pick<SlotHandlers, "onSlotUpdated" | "onWalkthrough" | "onApply">) {
  if (message.role === "user") return <UserMessage content={message.content} />;

  if (message.kind === "framing") {
    return (
      <FramingCard
        message={message}
        abandoned={abandoned}
        skipSaved={skipSaved}
        disabled={busy}
        error={framingError}
        onSubmit={(input) => onAnswerFraming(message.data.exchangeId, input)}
      />
    );
  }

  const callouts = message.kind === "answer" ? message.data.callouts : [];
  // R15: an answer with a slot shows the slot INSTEAD of callout chips (the
  // "none" control shows a passive "Saved" line). Answers without one keep the
  // chips. Items saved besides the slot's featured one are listed under it.
  const slot = message.kind === "answer" ? (message.data.slot ?? null) : null;
  const alsoSaved = slot ? callouts.filter((c) => c.id !== slot.item.id) : [];
  return (
    <article className="min-w-0" aria-busy={message.streaming || undefined}>
      <h2 className="sr-only">Claude said:</h2>
      {message.content ? (
        <Markdown text={message.content} streaming={message.streaming} />
      ) : message.streaming ? null : (
        <p className="text-sm text-ink-muted italic">(No content)</p>
      )}
      {message.notice && (
        <p className="mt-3 inline-flex rounded-lg bg-surface-muted px-3 py-1.5 text-xs text-ink-muted">{message.notice}</p>
      )}
      {slot ? (
        <>
          <EndOfAnswerSlot
            slot={slot}
            busy={busy}
            onSlotUpdated={onSlotUpdated}
            onItemUpdated={onItemUpdated}
            onConflict={onConflict}
            onWalkthrough={onWalkthrough}
            onApply={onApply}
          />
          {!message.streaming && alsoSaved.length > 0 && (
            <CalloutChips
              heading="Also saved to Learn It Later"
              items={alsoSaved}
              onItemUpdated={onItemUpdated}
              onConflict={onConflict}
            />
          )}
        </>
      ) : (
        !message.streaming &&
        callouts.length > 0 && <CalloutChips items={callouts} onItemUpdated={onItemUpdated} onConflict={onConflict} />
      )}
    </article>
  );
}
