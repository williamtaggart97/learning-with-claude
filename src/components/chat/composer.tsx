"use client";
import { useEffect, useRef } from "react";
import { ArrowUpIcon, StopIcon } from "@/components/icons";
import { useMediaQuery } from "@/lib/client/use-media-query";

/** Autosizing message box. Enter sends, Shift+Enter adds a newline (like Claude). */
export function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  busy,
  canStop,
  placeholder,
  autoFocus = false,
  hint,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  /** A request is in flight: input disabled. */
  busy: boolean;
  /** Show the Stop button (a stream can be aborted). */
  canStop: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  hint?: React.ReactNode;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // The full placeholder wraps/clips on phones.
  const wide = useMediaQuery("(min-width: 640px)", true);
  const wasBusy = useRef(busy);

  // Hand focus back when a response finishes.
  useEffect(() => {
    if (wasBusy.current && !busy) ref.current?.focus();
    wasBusy.current = busy;
  }, [busy]);

  const canSend = !busy && value.trim().length > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSubmit();
      }}
      className="rounded-[1.25rem] border border-line bg-surface shadow-[0_1px_2px_rgba(43,38,33,0.04),0_6px_20px_-10px_rgba(43,38,33,0.18)] transition-colors focus-within:border-line-strong"
    >
      <label htmlFor="composer" className="sr-only">
        Message Claude
      </label>
      <textarea
        id="composer"
        ref={ref}
        value={value}
        autoFocus={autoFocus}
        disabled={busy}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (canSend) onSubmit();
          }
        }}
        rows={1}
        placeholder={
          busy
            ? "Claude is responding…"
            : (placeholder ?? (wide ? "Ask about anything you’re learning or working on…" : "Ask anything…"))
        }
        className="field-sizing-content block max-h-64 min-h-[3.25rem] w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-base leading-relaxed text-ink placeholder:text-ink-faint focus:outline-none disabled:cursor-not-allowed"
      />
      <div className="flex items-center justify-between gap-3 px-3 pb-3">
        <div className="min-w-0 text-xs text-ink-muted">{hint}</div>
        {canStop ? (
          <button
            type="button"
            onClick={onStop}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line-strong bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <StopIcon className="size-4" />
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send message"
            className="inline-flex size-9 items-center justify-center rounded-xl bg-accent-strong text-white transition-colors hover:bg-accent-strong-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-accent-soft disabled:text-accent-ink/60"
          >
            <ArrowUpIcon className="size-[1.1rem]" />
          </button>
        )}
      </div>
    </form>
  );
}
