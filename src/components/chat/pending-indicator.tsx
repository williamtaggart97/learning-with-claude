"use client";
// The wait before Claude's first words (router ~6–8s, R8). Copy advances on a
// timer so the latency reads as deliberate thinking, not a stall.
import { useEffect, useState } from "react";
import { LearnIcon } from "@/components/icons";

export type PendingKind = "route" | "framed" | "skip" | "kickoff" | "walkthrough" | "apply";

const STEPS: Record<PendingKind, { at: number; text: string }[]> = {
  route: [
    { at: 0, text: "Thinking about how to approach this…" },
    { at: 2800, text: "Deciding whether a few framing questions would help…" },
    { at: 6500, text: "Pulling together what I know about how you learn…" },
    { at: 11000, text: "Almost there…" },
  ],
  framed: [
    { at: 0, text: "Reading your answers…" },
    { at: 2500, text: "Building the explanation from what you said…" },
  ],
  skip: [
    { at: 0, text: "Answering directly…" },
    { at: 3000, text: "Saving the concept to Learn It Later…" },
  ],
  walkthrough: [
    { at: 0, text: "Picking the steps worth walking through…" },
    { at: 3000, text: "Writing a couple of questions…" },
  ],
  apply: [
    { at: 0, text: "Looking at what I know about your project…" },
    { at: 3000, text: "Working out where this shows up in your work…" },
  ],
  kickoff: [
    { at: 0, text: "Connecting this back to where it came up…" },
    { at: 3000, text: "Finding places it shows up in your own work…" },
  ],
};

/** Index of the step shown `elapsed` ms into the wait. */
const stepAt = (steps: { at: number }[], elapsed: number) => steps.findLastIndex((s) => s.at <= elapsed);

/**
 * `since` = Date.now() when the wait began, so a view that re-attaches to
 * an in-flight session (URL swap, navigating back) resumes the copy instead
 * of restarting it.
 */
export function PendingIndicator({ kind, since }: { kind: PendingKind; since: number }) {
  const steps = STEPS[kind];
  const [step, setStep] = useState(() => Math.max(0, stepAt(steps, Date.now() - since)));

  useEffect(() => {
    const elapsed = Date.now() - since;
    const timers = steps
      .map((s, i) => ({ i, wait: s.at - elapsed }))
      .filter(({ i, wait }) => i > 0 && wait > 0)
      .map(({ i, wait }) => setTimeout(() => setStep(i), wait));
    return () => timers.forEach(clearTimeout);
  }, [steps, since]);

  return (
    <div className="flex animate-fade-in items-center gap-3 py-2" aria-hidden="true">
      <span className="relative inline-flex size-8 items-center justify-center rounded-full bg-learn-50 text-learn-700 ring-1 ring-learn-200">
        <span className="absolute inset-0 animate-ping rounded-full bg-learn-200/60 [animation-duration:2.2s]" />
        <LearnIcon className="relative size-4" />
      </span>
      <span key={step} className="lm-shimmer animate-fade-in text-[0.95rem]">
        {steps[Math.min(step, steps.length - 1)].text}
      </span>
      <span className="lm-dots inline-flex gap-1 text-learn-400">
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}
