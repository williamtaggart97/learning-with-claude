"use client";
// The end-of-answer slot (L5, E1; api-contract R15–R18): at most one calm,
// compact box at the end of a lookup/task answer, in the learning palette.
//   card (A)        "Saved to Learn It Later" + Dig in now
//   walkthrough (B) "Walk me through it" → framing card below (the session streams it)
//   quickcheck (C)  one question + "I don't know" → inline feedback
//   apply (D)       "Apply it to my project" → streamed answer below
//   none (E)        control: renders nothing (the item is still queued, E3)
// Engaged states come from the SlotDTO (history or local updates), so a
// reloaded conversation shows "Dug in", "Started below", the answered quick
// check or "Applied below".
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowDownIcon,
  BookmarkIcon,
  CheckIcon,
  CompassIcon,
  ListCheckIcon,
  QuestionIcon,
} from "@/components/icons";
import { API_ROUTES, type QuickCheckAnswerResponse } from "@/lib/api-contract";
import { ApiRequestError, apiJson, friendlyError } from "@/lib/client/api";
import { useLearnLaterActions } from "@/lib/client/learn-later-actions";
import { liveLearnLaterItem } from "@/lib/learn-later-list";
import { useProfile } from "@/lib/client/profile-store";
import type { LearnLaterItemDTO, SlotDTO } from "@/lib/types";

type Variant<V extends SlotDTO["variant"]> = Extract<SlotDTO, { variant: V }>;

export interface SlotHandlers {
  /** Session busy (a stream is running): streaming actions wait. */
  busy: boolean;
  onSlotUpdated: (slot: SlotDTO) => void;
  onItemUpdated: (item: LearnLaterItemDTO) => void;
  /** 409 / stale state: resync the conversation from the server. */
  onConflict: () => void;
  onWalkthrough: (slot: Variant<"walkthrough">) => void;
  onApply: (slot: Variant<"apply">) => void;
}

export function EndOfAnswerSlot({ slot, ...h }: { slot: SlotDTO } & SlotHandlers) {
  switch (slot.variant) {
    case "card":
      return <CardSlot slot={slot} {...h} />;
    case "walkthrough":
      return <WalkthroughSlot slot={slot} {...h} />;
    case "quickcheck":
      return <QuickCheckSlot slot={slot} {...h} />;
    case "apply":
      return <ApplySlot slot={slot} {...h} />;
    case "none":
      return null;
  }
}

// ─── Shared pieces ──────────────────────────────────────────────────────────

const primaryButton =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-learn-700 px-4 text-sm font-medium text-white transition-colors hover:bg-learn-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-learn-500 aria-disabled:cursor-not-allowed aria-disabled:bg-learn-300 aria-disabled:text-learn-900/70";

const quietLink =
  "inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-learn-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-learn-500 aria-disabled:cursor-wait aria-disabled:opacity-70";

const iconClass = "size-5 text-learn-600";

/**
 * The one box every visible variant shares (V2 learning palette): same
 * border, background, padding and type scale across arms, so the experiment
 * compares what the box offers, not how loud it looks. Variants differ only
 * in the icon, the eyebrow line and the content.
 */
function Shell({
  label,
  eyebrow,
  icon,
  action,
  children,
}: {
  /** Accessible name of the box. */
  label: string;
  /** Small line above the content: what kind of box this is and which item it is about. */
  eyebrow: React.ReactNode;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={label}
      data-slot="end-of-answer"
      className="mt-5 flex animate-rise-in flex-col gap-3 rounded-2xl border border-learn-200 bg-learn-50 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-[1.125rem]"
    >
      <div className="flex min-w-0 flex-1 gap-3">
        <span aria-hidden="true" className="mt-0.5 shrink-0">
          {icon}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs leading-snug font-medium text-learn-700">{eyebrow}</p>
          {children}
        </div>
      </div>
      {action && <div className="shrink-0 pl-8 sm:pl-0">{action}</div>}
    </section>
  );
}

function Headline({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <p id={id} className="text-[0.95rem] leading-snug font-semibold text-ink">
      {children}
    </p>
  );
}

function Subline({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-ink-muted">{children}</p>;
}

/** Eyebrow for boxes whose copy is generated: names the item the box is about. */
function ItemAnchor({ lead, title }: { lead: string; title: string }) {
  return (
    <>
      {lead}: <span className="font-semibold">{title}</span>
    </>
  );
}

/** Replaces the button once the action was taken. Focusable so focus isn't lost when the button disappears. */
function Done({
  children,
  focusOnMount,
}: {
  children: React.ReactNode;
  focusOnMount: boolean;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (focusOnMount) ref.current?.focus();
  }, [focusOnMount]);
  return (
    <p
      ref={ref}
      tabIndex={-1}
      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-learn-700 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-learn-500"
    >
      {children}
    </p>
  );
}

/** Error / status note. Always mounted so screen readers announce it when it appears. */
function Note({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" className="empty:hidden">
      {children ? <p className="text-xs text-ink-muted">{children}</p> : null}
    </div>
  );
}

// ─── A: Learn It Later card ─────────────────────────────────────────────────

function CardSlot({ slot, onSlotUpdated, onItemUpdated, onConflict }: { slot: Variant<"card"> } & SlotHandlers) {
  const { digIn, setStatus } = useLearnLaterActions();
  const { profile } = useProfile();
  const [busy, setBusy] = useState<"dig" | "restore" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // The queue panel may have dismissed / restored the item since this answer loaded.
  const item = liveLearnLaterItem(profile, slot.item);
  const removed = item.status === "dismissed";
  const dugIn = slot.digInConversationId !== null || slot.engagement === "dig_in";

  const onDigIn = async () => {
    if (busy) return;
    setBusy("dig");
    setNote(null);
    try {
      await digIn(item, {
        endpoint: API_ROUTES.slotDigIn(slot.impressionId),
        onStarted: (res, dugInItem) => {
          // Shown when the user comes back to this answer.
          onSlotUpdated({
            ...slot,
            item: dugInItem,
            engagement: slot.engagement ?? "dig_in",
            engagedAt: slot.engagedAt ?? new Date().toISOString(),
            digInConversationId: res.conversationId,
          });
          onItemUpdated(dugInItem);
        },
      });
      // Navigation takes over.
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409) onConflict();
      setNote(
        err instanceof ApiRequestError && err.status === 404
          ? "This item isn’t available any more — it may have been reset."
          : friendlyError(err),
      );
      setBusy(null);
    }
  };

  const onRestore = async () => {
    if (busy) return;
    setBusy("restore");
    setNote(null);
    try {
      const updated = await setStatus(item, "queued");
      if (!updated) {
        setNote("This changed elsewhere — refreshed.");
        onConflict();
      } else if (updated.id !== item.id) {
        setNote(`Already in your queue as “${updated.title}”.`);
      } else {
        onItemUpdated(updated);
      }
    } catch (err) {
      setNote(friendlyError(err));
    } finally {
      setBusy(null);
    }
  };

  let action: React.ReactNode;
  if (removed) {
    action = (
      <button type="button" onClick={onRestore} aria-disabled={busy !== null || undefined} className={quietLink}>
        {busy === "restore" ? "Restoring…" : "Restore"}
      </button>
    );
  } else if (dugIn && slot.digInConversationId) {
    action = (
      <Link href={`/c/${encodeURIComponent(slot.digInConversationId)}`} className={quietLink}>
        <CheckIcon className="size-4" strokeWidth={2.25} />
        Dug in <span aria-hidden="true">·</span> open chat
      </Link>
    );
  } else {
    action = (
      <button type="button" onClick={onDigIn} aria-disabled={busy !== null || undefined} className={primaryButton}>
        <CompassIcon className="size-4" />
        {busy === "dig" ? "Opening…" : dugIn ? "Dig in again" : "Dig in now"}
      </button>
    );
  }

  return (
    <Shell
      label={removed ? "Removed from Learn It Later" : "Saved to Learn It Later"}
      eyebrow={removed ? "Removed from Learn It Later" : "Saved to Learn It Later"}
      icon={<BookmarkIcon className={iconClass} fill={removed ? "none" : "currentColor"} />}
      action={action}
    >
      <Headline>{item.title}</Headline>
      {!removed && (
        <>
          <Subline>{item.preview}</Subline>
          {item.appliedContext && (
            <p className="text-xs leading-relaxed text-ink-muted">
              <span className="font-medium text-learn-700">How it applied here: </span>
              {item.appliedContext}
            </p>
          )}
        </>
      )}
      <Note>{note}</Note>
    </Shell>
  );
}

// ─── B: Walk me through it ──────────────────────────────────────────────────

function WalkthroughSlot({ slot, busy, onWalkthrough }: { slot: Variant<"walkthrough"> } & SlotHandlers) {
  const started = slot.exchangeId !== null || slot.engagement === "walkthrough_started";
  const [clicked, setClicked] = useState(false);
  return (
    <Shell
      label={`Walk through: ${slot.item.title}`}
      eyebrow={<ItemAnchor lead="Walk through" title={slot.item.title} />}
      icon={<CompassIcon className={iconClass} strokeWidth={2} />}
      action={
        started ? (
          <Done focusOnMount={clicked}>
            <ArrowDownIcon className="size-4" />
            Started below
          </Done>
        ) : (
          <button
            type="button"
            aria-disabled={busy || undefined}
            title={busy ? "Wait for Claude to finish" : undefined}
            onClick={() => {
              if (busy) return;
              setClicked(true);
              onWalkthrough(slot);
            }}
            className={primaryButton}
          >
            {slot.copy.buttonLabel}
          </button>
        )
      }
    >
      <Headline>{slot.copy.headline}</Headline>
      <Subline>{slot.copy.subline}</Subline>
    </Shell>
  );
}

// ─── C: Quick check ─────────────────────────────────────────────────────────

function QuickCheckSlot({ slot, onSlotUpdated, onConflict }: { slot: Variant<"quickcheck"> } & SlotHandlers) {
  const { updateProfile, refresh } = useProfile();
  const { prompt, options, result } = slot.quickcheck;
  const [pending, setPending] = useState<number | "dontKnow" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const promptId = useId();
  const answered = result !== null;
  const locked = answered || pending !== null;
  // The eyebrow already says "Quick check"; drop a model-written prefix.
  const shownPrompt = prompt.trim().replace(/^quick check\s*[:.\-–—]?\s*/i, "") || prompt;

  const submit = async (choice: number | "dontKnow") => {
    if (locked) return;
    setPending(choice);
    setNote(null);
    try {
      const res = await apiJson<QuickCheckAnswerResponse>(API_ROUTES.slotQuickcheck(slot.impressionId), {
        method: "POST",
        json: choice === "dontKnow" ? { selectedIndex: null, dontKnow: true } : { selectedIndex: choice, dontKnow: false },
      });
      onSlotUpdated(res.slot);
      const m = res.mastery;
      if (m) {
        updateProfile((p) => ({
          ...p,
          concepts: p.concepts.map((c) => (c.slug === m.slug ? { ...c, score: m.score } : c)),
        }));
        void refresh(); // picks up the new evidence line too
      }
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409) {
        setNote("This was already answered — showing the latest.");
        onConflict();
      } else if (err instanceof ApiRequestError && err.status === 404) {
        setNote("This quick check isn’t available any more — the conversation may have been reset.");
      } else {
        setNote(friendlyError(err));
      }
    } finally {
      setPending(null);
    }
  };

  const optionClass = (i: number | "dontKnow") => {
    const base =
      "inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-learn-500";
    const dk = i === "dontKnow";
    if (!answered) {
      const waiting = pending === i ? " bg-learn-100" : "";
      return `${base}${waiting} ${
        dk
          ? "border-dashed border-learn-400 bg-transparent text-learn-800 hover:bg-learn-100"
          : "border-learn-200 bg-surface text-ink hover:border-learn-400 hover:bg-learn-100"
      } ${pending !== null && pending !== i ? "opacity-60" : ""} ${pending !== null ? "cursor-wait" : "cursor-pointer"}`;
    }
    const isCorrect = i === result.correctIndex;
    const isPick = dk ? result.dontKnow : result.selectedIndex === i;
    if (isCorrect) return `${base} border-learn-600 bg-learn-600 font-medium text-white`;
    if (isPick && dk) return `${base} border-dashed border-ink-muted bg-surface-muted font-medium text-ink`;
    if (isPick) return `${base} border-mastery-low bg-accent-soft/70 font-medium text-ink`;
    return `${base} ${dk ? "border-dashed" : ""} border-learn-100 bg-transparent text-ink-muted`;
  };

  // The server's feedback already opens with "Right." / "Not quite: …" /
  // "The answer is …"; "I don't know" gets a neutral lead-in (L2: a legitimate choice).
  const lead = result?.dontKnow ? "No problem." : null;

  return (
    <Shell label="Quick check" eyebrow="Quick check" icon={<QuestionIcon className={iconClass} strokeWidth={2} />}>
      <Headline id={promptId}>{shownPrompt}</Headline>
      <div role="group" aria-labelledby={promptId} className="flex flex-wrap gap-2 pt-1.5">
        {options.map((opt, i) => {
          const isCorrect = answered && i === result.correctIndex;
          const isPick = answered && !result.dontKnow && result.selectedIndex === i;
          return (
            <button
              key={i}
              type="button"
              aria-disabled={locked || undefined}
              aria-pressed={answered ? isPick : undefined}
              onClick={() => void submit(i)}
              className={optionClass(i)}
            >
              {isCorrect && <CheckIcon className="size-4 shrink-0" strokeWidth={2.25} />}
              <span>{opt}</span>
              {isCorrect && <span className="sr-only">(correct answer)</span>}
              {isPick && !isCorrect && <span className="text-xs font-normal text-ink-muted">· your pick</span>}
            </button>
          );
        })}
        <button
          type="button"
          aria-disabled={locked || undefined}
          aria-pressed={answered ? result.dontKnow : undefined}
          onClick={() => void submit("dontKnow")}
          className={optionClass("dontKnow")}
        >
          I don’t know
        </button>
      </div>
      {/* Always mounted so the feedback is announced when it appears. */}
      <div role="status" aria-live="polite" className="empty:hidden">
        {result && (
          <p
            className={`animate-fade-in pt-1.5 text-sm leading-relaxed ${
              result.correct ? "text-learn-800" : result.dontKnow ? "text-ink-muted" : "text-ink"
            }`}
          >
            {lead && <span className="font-semibold">{lead} </span>}
            {result.feedback}
          </p>
        )}
      </div>
      <Note>{note}</Note>
    </Shell>
  );
}

// ─── D: Apply it to my project ──────────────────────────────────────────────

function ApplySlot({ slot, busy, onApply }: { slot: Variant<"apply"> } & SlotHandlers) {
  const applied = slot.applyMessageId !== null || slot.engagement === "apply_clicked";
  const [clicked, setClicked] = useState(false);
  return (
    <Shell
      label={`Apply: ${slot.item.title}`}
      eyebrow={<ItemAnchor lead="Apply" title={slot.item.title} />}
      icon={<ListCheckIcon className={iconClass} strokeWidth={2} />}
      action={
        applied ? (
          <Done focusOnMount={clicked}>
            <ArrowDownIcon className="size-4" />
            Applied below
          </Done>
        ) : (
          <button
            type="button"
            aria-disabled={busy || undefined}
            title={busy ? "Wait for Claude to finish" : undefined}
            onClick={() => {
              if (busy) return;
              setClicked(true);
              onApply(slot);
            }}
            className={primaryButton}
          >
            {slot.copy.buttonLabel}
          </button>
        )
      }
    >
      <Headline>{slot.copy.headline}</Headline>
      <Subline>{slot.copy.subline}</Subline>
    </Shell>
  );
}
