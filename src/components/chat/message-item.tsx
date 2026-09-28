"use client";
import { FramingCard } from "@/components/framing/framing-card";
import { CalloutChips } from "@/components/learn-later/callout-chips";
import { Markdown } from "@/components/markdown/markdown";
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
}) {
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
      {!message.streaming && callouts.length > 0 && (
        <CalloutChips items={callouts} onItemUpdated={onItemUpdated} onConflict={onConflict} />
      )}
    </article>
  );
}
