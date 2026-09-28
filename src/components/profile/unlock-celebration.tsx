"use client";
// Unlock celebration (X7, P6). Fires once per unlock (the profile store
// dedupes signals). A Tier 1 unlock usually arrives via the framing-answer
// stream's `progress` event, before the answer has streamed — so the reveal
// waits until no chat is streaming, refetches the profile, and only then
// opens — so the first frame already shows the real counts and style.
import { useEffect, useId, useState } from "react";
import { useAnyChatBusy, useStartChatWith } from "@/components/chat/chat-sessions-provider";
import { ArrowRightIcon, LearnIcon, PencilIcon, SparkIcon } from "@/components/icons";
import { useShell } from "@/components/shell/shell-context";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { useProfile, useTierUnlocked } from "@/lib/client/profile-store";
import type { ProfileDTO, Tier } from "@/lib/types";
import {
  CONFIDENCE_LABEL,
  framingRounds,
  MASTERY_LABEL,
  masteryBand,
  summarizeStyle,
  topConcepts,
} from "@/lib/ui/profile-format";

/** Pause after the answer finishes so the reveal doesn't collide with the last words. */
const SHOW_DELAY_MS = 700;

export function UnlockCelebration() {
  const { profile, refresh } = useProfile();
  const busy = useAnyChatBusy();
  const [pending, setPending] = useState<Tier | null>(null);
  const [shown, setShown] = useState<Tier | null>(null);

  useTierUnlocked((u) => {
    setPending((p) => (p === null || u.tier > p ? u.tier : p));
  });

  useEffect(() => {
    if (pending === null || busy) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      await refresh();
      if (cancelled) return;
      setShown(pending);
      setPending(null);
    }, SHOW_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [pending, busy, refresh]);

  return (
    <ModalDialog
      open={shown !== null}
      onClose={() => setShown(null)}
      labelledBy="lm-unlock-title"
      describedBy="lm-unlock-desc"
    >
      {shown !== null && <CelebrationBody tier={shown} profile={profile} onClose={() => setShown(null)} />}
    </ModalDialog>
  );
}

function CelebrationBody({ tier, profile, onClose }: { tier: Tier; profile: ProfileDTO; onClose: () => void }) {
  const { openProfilePanel } = useShell();
  const openProfile = () => {
    onClose();
    openProfilePanel();
    // Below lg the panel is a modal drawer that takes focus itself. On lg+ it
    // opens inline, so move focus there (after the dialog has handed focus
    // back to the composer) rather than leaving it in the chat.
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setTimeout(() => {
        const panel = document.getElementById("profile-panel");
        const target =
          panel?.querySelector<HTMLElement>("[role=tab][aria-selected=true]") ?? panel?.querySelector<HTMLElement>("h2");
        if (target && target.tagName === "H2") target.tabIndex = -1;
        target?.focus();
      }, 0);
    }
  };

  return (
    <div className="relative w-[min(30rem,calc(100vw-2rem))] animate-rise-in overflow-y-auto rounded-[1.25rem] border border-learn-200 bg-surface shadow-[0_24px_64px_-24px_rgba(19,43,40,0.45)] max-h-[calc(100dvh-2rem)]">
      <div className="relative overflow-hidden bg-gradient-to-b from-spark-soft via-learn-50 to-surface px-6 pt-7 pb-5 text-center sm:px-8">
        <Badge tier={tier} />
        <p className="mt-4 text-xs font-semibold tracking-[0.12em] text-learn-700 uppercase">
          {tier === 1 ? "Profile unlocked" : "Tier 2 unlocked"}
        </p>
        <h2 id="lm-unlock-title" className="mt-1.5 font-serif text-[1.6rem] leading-tight font-medium text-learn-900">
          {tier === 1 ? "Here’s how I think you learn" : "Your profile is now editable"}
        </h2>
        <p id="lm-unlock-desc" className="mx-auto mt-2 max-w-[24rem] text-sm leading-relaxed text-ink-muted">
          {tier === 1
            ? `After ${framingRounds(profile.answeredFramingCount)} (each set of my framing questions you answered), here’s my read so far. It sharpens as we keep working, and it shapes how I answer you.`
            : "Correct how I think you learn and what I know about your work. I’ll use your edits in every answer — and I’ve picked a few topics to try next."}
        </p>
      </div>

      <div className="px-6 pb-6 sm:px-8">
        {tier === 1 ? <TierOneReveal profile={profile} /> : <TierTwoReveal profile={profile} onPicked={onClose} />}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-learn-500"
          >
            Back to chat
          </button>
          <button
            type="button"
            data-autofocus
            onClick={openProfile}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-learn-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-learn-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-learn-500"
          >
            {tier === 1 ? <LearnIcon className="size-4" /> : <PencilIcon className="size-4" />}
            {tier === 1 ? "See my profile" : "Edit my profile"}
          </button>
        </div>
      </div>
    </div>
  );
}

const SPARKS = [
  { left: "18%", top: "58%", dx: "-18px", dy: "-46px", delay: "120ms" },
  { left: "30%", top: "30%", dx: "-10px", dy: "-38px", delay: "320ms" },
  { left: "70%", top: "28%", dx: "12px", dy: "-40px", delay: "200ms" },
  { left: "82%", top: "56%", dx: "20px", dy: "-44px", delay: "420ms" },
  { left: "50%", top: "14%", dx: "0px", dy: "-34px", delay: "560ms" },
];

function Badge({ tier }: { tier: Tier }) {
  return (
    <div className="relative mx-auto size-16" aria-hidden="true">
      {SPARKS.map((s, i) => (
        <SparkIcon
          key={i}
          className="lm-spark"
          style={
            {
              left: s.left,
              top: s.top,
              "--dx": s.dx,
              "--dy": s.dy,
              animationDelay: s.delay,
            } as React.CSSProperties
          }
        />
      ))}
      <span className="lm-pop absolute inset-0 inline-flex items-center justify-center rounded-full bg-surface shadow-[0_0_0_4px_var(--color-spark-soft),0_0_0_5px_var(--color-spark)]">
        {tier === 1 ? (
          <LearnIcon className="size-7 text-learn-700" />
        ) : (
          <PencilIcon className="size-7 text-learn-700" />
        )}
      </span>
    </div>
  );
}

function TierOneReveal({ profile }: { profile: ProfileDTO }) {
  const style = profile.learningStyle;
  const top = topConcepts(profile, 3);
  const anySolid = top.some((c) => masteryBand(c.score) !== "low");
  return (
    <div className="space-y-5">
      {style ? (
        <ul className="space-y-2.5">
          {summarizeStyle(style).map((line, i) => (
            <li
              key={line.key}
              className="animate-rise-in rounded-xl border border-learn-100 bg-learn-50/60 px-3.5 py-3"
              style={{ animationDelay: `${200 + i * 120}ms` }}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-learn-700">{line.label}</p>
                <span
                  className={`shrink-0 text-[0.7rem] ${line.level === "low" ? "text-ink-muted italic" : "text-learn-700"}`}
                >
                  {CONFIDENCE_LABEL[line.level]}
                </span>
              </div>
              <p className={`mt-0.5 text-sm leading-relaxed ${line.level === "low" ? "text-ink-muted" : "text-ink"}`}>{line.text}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-learn-50 px-3.5 py-3 text-sm text-learn-900">
          I’m still forming a picture of your style — a few more framing rounds and it’ll show up in your profile.
        </p>
      )}

      {top.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-learn-700">
            {anySolid ? "What you’re strongest on so far" : "Concepts we’re building on"}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {top.map((c) => (
              <li
                key={c.slug}
                className="rounded-full border border-learn-200 bg-surface px-2.5 py-1 text-xs text-learn-900"
              >
                {c.name}
                {/* All shaky: frame it as where we start, not a verdict. */}
                <span className="text-ink-muted">
                  {" "}
                  · {anySolid ? MASTERY_LABEL[masteryBand(c.score)].toLowerCase() : "early days"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TierTwoReveal({ profile, onPicked }: { profile: ProfileDTO; onPicked: () => void }) {
  const startChatWith = useStartChatWith();
  const { closeProfilePanel } = useShell();
  const headingId = useId();
  const topics = profile.suggestedTopics.slice(0, 3);
  if (!topics.length) {
    return (
      <p className="rounded-xl bg-learn-50 px-3.5 py-3 text-sm text-learn-900">
        Suggested next topics will appear in your profile as soon as I’ve updated it.
      </p>
    );
  }
  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="text-xs font-semibold text-learn-700">
        Suggested next topics
      </h3>
      <ul className="mt-2 space-y-2">
        {topics.map((t) => (
          <li key={t.title}>
            <button
              type="button"
              onClick={() => {
                onPicked();
                closeProfilePanel();
                startChatWith(t.prompt);
              }}
              className="group flex w-full items-start gap-3 rounded-xl border border-learn-100 bg-learn-50/60 px-3.5 py-2.5 text-left transition-colors hover:border-learn-300 hover:bg-learn-50 focus-visible:outline-2 focus-visible:outline-learn-500"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-learn-900">{t.title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{t.reason}</span>
              </span>
              <ArrowRightIcon className="mt-0.5 size-4 shrink-0 text-learn-600 transition-transform group-hover:translate-x-0.5" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
