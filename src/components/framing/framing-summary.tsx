"use client";
import { useEffect, useRef } from "react";
import { CheckIcon, LearnIcon } from "@/components/icons";
import { InlineMarkdown } from "@/components/markdown/inline-markdown";
import type { FramingQuestion, FramingResponse } from "@/lib/types";

export type FramingSummaryState = "answered" | "skipped" | "abandoned";

function responseText(r: FramingResponse | undefined): string | null {
  if (!r || r.dontKnow || r.answer === null) return null;
  return Array.isArray(r.answer) ? r.answer.join(" · ") : r.answer;
}

/** Read-only, collapsed framing card: after submit, and for history (L1–L3). */
export function FramingSummary({
  questions,
  responses,
  state,
  skipSaved = false,
  focusOnMount = false,
}: {
  questions: FramingQuestion[];
  responses: FramingResponse[] | null;
  state: FramingSummaryState;
  /** Skipped and the skip item really was queued (seen in the answer's callouts). */
  skipSaved?: boolean;
  /** Just submitted/skipped: take focus so keyboard users aren't dropped on <body>. */
  focusOnMount?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (focusOnMount) ref.current?.focus({ preventScroll: true });
  }, [focusOnMount]);

  const byId = new Map((responses ?? []).map((r) => [r.questionId, r]));
  const dontKnowCount = (responses ?? []).filter((r) => r.dontKnow).length;

  const status =
    state === "answered"
      ? `Framed with ${questions.length} question${questions.length === 1 ? "" : "s"}${
          dontKnowCount ? ` · ${dontKnowCount} “I don’t know”` : ""
        }`
      : state === "skipped"
        ? skipSaved
          ? "Skipped — saved to Learn It Later"
          : "Skipped"
        : "Moved on";

  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-label="Framing questions"
      className="animate-fade-in rounded-card border border-learn-200 bg-learn-50/70 px-4 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-learn-400 sm:px-5"
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1.5 font-medium text-learn-700">
          <LearnIcon className="size-4" />
          Framing
        </span>
        <span aria-hidden="true" className="text-learn-300">
          ·
        </span>
        <span className="inline-flex items-center gap-1 text-learn-700">
          {state === "answered" && <CheckIcon className="size-3.5" strokeWidth={2.25} />}
          {status}
        </span>
      </header>

      <ol className="mt-2.5 space-y-2.5">
        {questions.map((q, i) => {
          const r = byId.get(q.id);
          const text = responseText(r);
          return (
            <li key={q.id} className="text-sm leading-snug">
              <p className="text-ink-muted">
                <span className="mr-1.5 font-medium text-learn-600">{i + 1}.</span>
                <InlineMarkdown text={q.prompt} />
              </p>
              {state === "answered" && (
                <p className="mt-1 pl-5">
                  {text !== null ? (
                    <span className="text-ink">
                      <InlineMarkdown text={text} />
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-learn-200 bg-surface px-2 py-0.5 text-xs text-learn-700">
                      I don’t know
                    </span>
                  )}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
