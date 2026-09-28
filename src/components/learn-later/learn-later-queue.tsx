"use client";
// Learn It Later queue (Q1–Q4) in the profile panel — the Tier 0 surface.
// Queued cards first (Dig in / Dismiss), then items already dug into, then a
// collapsed "Dismissed" section with Restore.
//
// Focus: after Dismiss / Dig in / Restore moves a card out of its list, focus
// goes to the next card’s primary action in that list (or the previous one
// at the end), else to the section heading.
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { BookmarkIcon, CheckIcon, ChevronDownIcon, CompassIcon, SparkIcon, UndoIcon } from "@/components/icons";
import { useShell } from "@/components/shell/shell-context";
import { friendlyError } from "@/lib/client/api";
import { useLearnLaterActions } from "@/lib/client/learn-later-actions";
import { useProfile } from "@/lib/client/profile-store";
import type { LearnLaterItemDTO } from "@/lib/types";

interface QueueFocus {
  /** Register a row’s primary action button (Dig in / Restore) by item id. */
  register: (id: string, el: HTMLButtonElement | null) => void;
  /** A row left its list: focus `nextId`’s primary action, or the heading. */
  moved: (nextId: string | null) => void;
}

const QueueFocusContext = createContext<QueueFocus>({ register: () => {}, moved: () => {} });

/** The item to focus when `list[index]` leaves: the next one, else the previous one. */
function neighbour(list: LearnLaterItemDTO[], index: number): string | null {
  return list[index + 1]?.id ?? list[index - 1]?.id ?? null;
}

export function LearnLaterQueue() {
  const { profile } = useProfile();
  const queued = profile.learnLater.filter((i) => i.status === "queued");
  const dugIn = profile.learnLater.filter((i) => i.status === "dug_in");
  const dismissed = profile.dismissedLearnLater;
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const primaries = useRef(new Map<string, HTMLButtonElement>());
  /** Pending focus move after a row left its list (applied after the next commit). */
  const focusTarget = useRef<{ id: string | null } | null>(null);
  const [focusTick, setFocusTick] = useState(0);

  const register = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) primaries.current.set(id, el);
    else primaries.current.delete(id);
  }, []);
  const moved = useCallback((nextId: string | null) => {
    focusTarget.current = { id: nextId };
    setFocusTick((t) => t + 1);
  }, []);

  useEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    focusTarget.current = null;
    const el = target.id ? primaries.current.get(target.id) : null;
    (el && !el.disabled ? el : headingRef.current)?.focus();
  }, [focusTick]);

  return (
    <QueueFocusContext.Provider value={{ register, moved }}>
      <section aria-labelledby={headingId} className="space-y-3">
        <div>
          <h3
            id={headingId}
            ref={headingRef}
            tabIndex={-1}
            className="inline-flex items-center gap-1.5 font-serif text-base font-medium text-learn-900 focus:outline-none focus-visible:outline-2 focus-visible:outline-learn-500"
          >
            <BookmarkIcon className="size-4 text-learn-600" />
            Learn It Later
            {queued.length > 0 && (
              <span className="ml-0.5 rounded-full bg-learn-100 px-1.5 py-px font-sans text-xs font-medium text-learn-800 tabular-nums">
                {queued.length}
              </span>
            )}
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
            Ideas you skipped or Claude flagged mid-task, saved so you can stay on track now and dig in when you have time.
          </p>
        </div>

        {queued.length === 0 ? (
          <div className="rounded-card border border-dashed border-learn-200 bg-learn-50/50 px-4 py-5 text-center">
            <p className="text-sm font-medium text-learn-900">
              {dugIn.length ? "You’re all caught up" : "Nothing saved yet"}
            </p>
            <p className="mx-auto mt-1 max-w-[17rem] text-xs leading-relaxed text-ink-muted">
              {dugIn.length
                ? "New ideas land here when you skip framing questions or when Claude spots a decision worth understanding."
                : "When you choose “just answer” or Claude spots a hidden decision in your work, it lands here to dig into later."}
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {queued.map((item, i) => (
              <li key={item.id}>
                <QueueCard item={item} nextFocusId={neighbour(queued, i)} />
              </li>
            ))}
          </ul>
        )}

        {dugIn.length > 0 && (
          <div className="pt-1">
            <h4 className="px-0.5 text-xs font-medium text-ink-muted">Dug into</h4>
            <ul className="mt-1.5 space-y-1.5">
              {dugIn.map((item) => (
                <li key={item.id}>
                  <DoneRow item={item} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {dismissed.length > 0 && <DismissedSection items={dismissed} />}
      </section>
    </QueueFocusContext.Provider>
  );
}

function OriginBadge({ item }: { item: LearnLaterItemDTO }) {
  const skipped = item.origin === "skipped";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] font-medium ${
        skipped ? "bg-surface-muted text-ink-muted" : "bg-learn-100 text-learn-800"
      }`}
    >
      {skipped ? <BookmarkIcon className="size-3" /> : <SparkIcon className="size-3" />}
      {skipped ? "You skipped this" : "Claude flagged this"}
    </span>
  );
}

/** Dig in / dismiss / restore with busy + error state. */
function useItemActions(item: LearnLaterItemDTO, nextFocusId: string | null = null) {
  const focus = useContext(QueueFocusContext);
  const { digIn, setStatus } = useLearnLaterActions();
  const { refresh } = useProfile();
  const { closeProfilePanel, profileModal } = useShell();
  const [busy, setBusy] = useState<"dig" | "status" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const onDigIn = async () => {
    setBusy("dig");
    setNote(null);
    try {
      await digIn(item);
      if (profileModal) closeProfilePanel();
      else focus.moved(nextFocusId);
    } catch (err) {
      setNote(friendlyError(err));
    } finally {
      setBusy(null);
    }
  };

  const onStatus = async (next: "queued" | "dismissed") => {
    setBusy("status");
    setNote(null);
    try {
      const updated = await setStatus(item, next);
      if (!updated) {
        setNote("This changed elsewhere — refreshed.");
        void refresh();
      } else if (updated.id !== item.id) {
        setNote(`Already in your queue as “${updated.title}”.`);
      } else {
        focus.moved(nextFocusId);
      }
    } catch (err) {
      setNote(friendlyError(err));
    } finally {
      setBusy(null);
    }
  };

  return { busy, note, onDigIn, onStatus };
}

function QueueCard({ item, nextFocusId }: { item: LearnLaterItemDTO; nextFocusId: string | null }) {
  const { busy, note, onDigIn, onStatus } = useItemActions(item, nextFocusId);
  const { register } = useContext(QueueFocusContext);
  return (
    <article
      aria-label={item.title}
      className="animate-fade-in rounded-card border border-learn-200 bg-surface p-3.5 shadow-[0_6px_18px_-14px_rgba(19,43,40,0.35)]"
    >
      <OriginBadge item={item} />
      <h4 className="mt-2 font-serif text-[1.02rem] leading-snug font-medium text-learn-900">{item.title}</h4>
      <p className="mt-1 text-sm leading-relaxed text-ink">{item.preview}</p>
      {item.appliedContext && (
        <p className="mt-2 rounded-lg bg-learn-50 px-2.5 py-1.5 text-xs leading-relaxed text-learn-900">
          <span className="font-medium text-learn-700">Came up in: </span>
          {item.appliedContext}
        </p>
      )}
      {note && (
        <p role="status" className="mt-2 text-xs text-ink-muted">
          {note}
        </p>
      )}
      <div className="mt-3 flex items-center gap-1.5">
        <button
          ref={(el) => register(item.id, el)}
          type="button"
          onClick={onDigIn}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-lg bg-learn-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-learn-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-learn-500 disabled:opacity-60"
        >
          <CompassIcon className="size-4" />
          {busy === "dig" ? "Opening…" : "Dig in"}
        </button>
        <button
          type="button"
          onClick={() => onStatus("dismissed")}
          disabled={busy !== null}
          aria-label={`Dismiss “${item.title}”`}
          className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-learn-500 disabled:opacity-60"
        >
          {busy === "status" ? "Dismissing…" : "Dismiss"}
        </button>
      </div>
    </article>
  );
}

function DoneRow({ item }: { item: LearnLaterItemDTO }) {
  const { busy, note, onDigIn } = useItemActions(item);
  return (
    <div className="rounded-xl border border-learn-100 bg-learn-50/50 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-learn-600 text-white">
          <CheckIcon className="size-3" strokeWidth={2.25} />
          <span className="sr-only">Done: </span>
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-learn-900" title={item.title}>
          {item.title}
        </span>
        <button
          type="button"
          onClick={onDigIn}
          disabled={busy !== null}
          aria-label={`Dig in again: ${item.title}`}
          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-learn-700 transition-colors hover:bg-learn-100 focus-visible:outline-2 focus-visible:outline-learn-500 disabled:opacity-60"
        >
          {busy === "dig" ? "Opening…" : "Dig in again"}
        </button>
      </div>
      {note && (
        <p role="status" className="mt-1 text-xs text-ink-muted">
          {note}
        </p>
      )}
    </div>
  );
}

function DismissedSection({ items }: { items: LearnLaterItemDTO[] }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  return (
    <div className="border-t border-learn-100 pt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={listId}
        className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-xs font-medium text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-learn-500"
      >
        Dismissed ({items.length})
        <ChevronDownIcon className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul id={listId} className="mt-1 space-y-1.5">
          {items.map((item, i) => (
            <li key={item.id}>
              <DismissedRow item={item} nextFocusId={neighbour(items, i)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DismissedRow({ item, nextFocusId }: { item: LearnLaterItemDTO; nextFocusId: string | null }) {
  const { busy, note, onStatus } = useItemActions(item, nextFocusId);
  const { register } = useContext(QueueFocusContext);
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm text-ink-muted line-through decoration-ink-faint/50" title={item.title}>
          {item.title}
        </span>
        <button
          ref={(el) => register(item.id, el)}
          type="button"
          onClick={() => onStatus("queued")}
          disabled={busy !== null}
          aria-label={`Restore “${item.title}” to the queue`}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-learn-700 transition-colors hover:bg-learn-50 focus-visible:outline-2 focus-visible:outline-learn-500 disabled:opacity-60"
        >
          <UndoIcon className="size-3.5" />
          {busy === "status" ? "Restoring…" : "Restore"}
        </button>
      </div>
      {note && (
        <p role="status" className="mt-1 text-xs text-ink-muted">
          {note}
        </p>
      )}
    </div>
  );
}
