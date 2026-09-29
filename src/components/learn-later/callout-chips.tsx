"use client";
// Learn It Later callouts under an answer (L5, Q3). Chips in the learning
// palette; a chip opens an inline card with the preview, how it applied,
// and Dig in / Dismiss.
import { useEffect, useId, useRef, useState } from "react";
import { BookmarkIcon, CheckIcon, CloseIcon, CompassIcon } from "@/components/icons";
import { friendlyError } from "@/lib/client/api";
import { useLearnLaterActions } from "@/lib/client/learn-later-actions";
import type { LearnLaterItemDTO } from "@/lib/types";

export function CalloutChips({
  items,
  heading,
  onItemUpdated,
  onConflict,
}: {
  items: LearnLaterItemDTO[];
  /** Overrides the default heading line. */
  heading?: string;
  onItemUpdated: (item: LearnLaterItemDTO) => void;
  /** 409: the item changed elsewhere — resync from the server. */
  onConflict: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const baseId = useId();
  if (!items.length) return null;
  const open = items.find((i) => i.id === openId) ?? null;
  const skippedOnly = items.every((i) => i.origin === "skipped");

  return (
    <div className="mt-4 animate-fade-in">
      <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-learn-700">
        <BookmarkIcon className="size-3.5" />
        {heading ?? (skippedOnly ? "Saved to Learn It Later" : "Worth understanding later")}
      </p>
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => {
          const expanded = item.id === openId;
          const dismissed = item.status === "dismissed";
          const dugIn = item.status === "dug_in";
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={expanded ? `${baseId}-card` : undefined}
                onClick={() => setOpenId(expanded ? null : item.id)}
                className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-learn-500 ${
                  expanded
                    ? "border-learn-600 bg-learn-700 text-white"
                    : dismissed
                      ? "border-line bg-surface text-ink-muted hover:border-line-strong"
                      : dugIn
                        ? "border-learn-300 bg-learn-100 text-learn-800 hover:border-learn-400"
                        : "border-learn-200 bg-learn-50 text-learn-800 hover:border-learn-400 hover:bg-learn-100"
                }`}
              >
                {dugIn ? (
                  <CompassIcon className="size-3.5 shrink-0" />
                ) : (
                  <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${dismissed ? "bg-line-strong" : expanded ? "bg-white" : "bg-learn-500"}`} />
                )}
                <span className={`truncate ${dismissed && !expanded ? "line-through decoration-ink-faint/60" : ""}`}>
                  <span className="sr-only">Learn it later: </span>
                  {item.title}
                </span>
                {dugIn && <span className="text-xs opacity-80">· dug in</span>}
                {dismissed && <span className="sr-only">(dismissed)</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {open && (
        <CalloutCard
          key={open.id}
          id={`${baseId}-card`}
          item={open}
          onClose={() => setOpenId(null)}
          onItemUpdated={onItemUpdated}
          onConflict={onConflict}
        />
      )}
    </div>
  );
}

function CalloutCard({
  id,
  item,
  onClose,
  onItemUpdated,
  onConflict,
}: {
  id: string;
  item: LearnLaterItemDTO;
  onClose: () => void;
  onItemUpdated: (item: LearnLaterItemDTO) => void;
  onConflict: () => void;
}) {
  const { digIn, setStatus } = useLearnLaterActions();
  const [busy, setBusy] = useState<"dig" | "status" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Bring the card into view when it opens near the bottom of the transcript.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  async function handleDigIn() {
    setBusy("dig");
    setNote(null);
    try {
      await digIn(item);
      // Navigation takes over; keep the spinner state until unmount.
    } catch (err) {
      setNote(friendlyError(err));
      setBusy(null);
    }
  }

  async function handleStatus(next: "queued" | "dismissed") {
    setBusy("status");
    setNote(null);
    try {
      const updated = await setStatus(item, next);
      if (!updated) {
        setNote("This changed elsewhere — refreshed.");
        onConflict();
      } else if (updated.id !== item.id) {
        setNote(`Already in your queue as “${updated.title}”.`);
      } else {
        onItemUpdated(updated);
        if (next === "dismissed") onClose();
      }
    } catch (err) {
      setNote(friendlyError(err));
    } finally {
      setBusy(null);
    }
  }

  const dismissed = item.status === "dismissed";

  return (
    <div
      id={id}
      ref={ref}
      role="region"
      aria-label={`Learn it later: ${item.title}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      className="mt-3 animate-rise-in rounded-card border border-learn-200 bg-surface p-4 shadow-[0_8px_24px_-14px_rgba(19,43,40,0.25)] sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-learn-600 uppercase">
            {item.origin === "skipped" ? "Saved when you skipped framing" : "Learn it later"}
          </p>
          <h3 className="mt-1 font-serif text-lg leading-snug font-medium text-learn-900">{item.title}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mt-1 -mr-1 rounded-lg p-1.5 text-ink-muted hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-learn-500"
        >
          <CloseIcon className="size-4" />
        </button>
      </div>

      <p className="mt-2 text-[0.95rem] leading-relaxed text-ink">{item.preview}</p>
      {item.appliedContext && (
        <div className="mt-3 rounded-xl bg-learn-50 px-3.5 py-2.5">
          <p className="text-xs font-medium text-learn-700">How it applied here</p>
          <p className="mt-0.5 text-sm leading-relaxed text-learn-900">{item.appliedContext}</p>
        </div>
      )}

      {note && (
        <p role="status" className="mt-3 text-sm text-ink-muted">
          {note}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!dismissed && (
          <button
            type="button"
            onClick={handleDigIn}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-xl bg-learn-700 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-learn-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-learn-500 disabled:opacity-60"
          >
            <CompassIcon className="size-4" />
            {busy === "dig" ? "Opening…" : item.status === "dug_in" ? "Dig in again" : "Dig in"}
          </button>
        )}
        {item.status === "queued" && (
          <button
            type="button"
            onClick={() => handleStatus("dismissed")}
            disabled={busy !== null}
            className="rounded-xl px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-learn-500 disabled:opacity-60"
          >
            Dismiss
          </button>
        )}
        {dismissed && (
          <button
            type="button"
            onClick={() => handleStatus("queued")}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-xl border border-learn-200 px-3 py-2 text-sm font-medium text-learn-700 transition-colors hover:bg-learn-50 focus-visible:outline-2 focus-visible:outline-learn-500 disabled:opacity-60"
          >
            <CheckIcon className="size-4" />
            Restore to queue
          </button>
        )}
        {item.status === "dug_in" && <span className="text-xs text-learn-700">You’ve dug into this before.</span>}
      </div>
    </div>
  );
}
