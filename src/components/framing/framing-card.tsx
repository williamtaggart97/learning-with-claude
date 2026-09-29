"use client";
// The framing card (L1–L3, V2): Claude's questions before it answers a
// concept question. Interactive while pending; a compact summary after.
// Drafts live here so a reopened card (error revert, R10) keeps the inputs.
import { useId, useState } from "react";
import { BookmarkIcon, LearnIcon } from "@/components/icons";
import type { FramingMessageDTO, FramingResponse } from "@/lib/types";
import { FramingSummary, type FramingSummaryState } from "./framing-summary";
import { emptyDraft, isDraftReady, QuestionBlock, type QuestionDraft } from "./question-block";

export function FramingCard({
  message,
  abandoned,
  skipSaved,
  disabled,
  error,
  onSubmit,
}: {
  message: FramingMessageDTO;
  /** Skipped with no answer after it: the user sent a new message instead. */
  abandoned: boolean;
  /** Skipped, and the following answer carries the saved skip item. */
  skipSaved: boolean;
  /** Another request is in flight. */
  disabled: boolean;
  error?: string;
  onSubmit: (input: { responses: FramingResponse[]; skip: boolean }) => void;
}) {
  const { questions, status, responses } = message.data;
  const headingId = useId();
  const [drafts, setDrafts] = useState<Record<string, QuestionDraft>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, emptyDraft()])),
  );
  /** Set on submit/skip so the collapsed summary takes focus (not the page body). */
  const [focusSummary, setFocusSummary] = useState(false);

  if (status !== "pending") {
    const state: FramingSummaryState = status === "answered" ? "answered" : abandoned ? "abandoned" : "skipped";
    return (
      <FramingSummary
        questions={questions}
        responses={responses}
        state={state}
        skipSaved={skipSaved}
        focusOnMount={focusSummary}
      />
    );
  }

  const draftOf = (id: string) => drafts[id] ?? emptyDraft();
  const readyCount = questions.filter((q) => isDraftReady(q, draftOf(q.id))).length;
  const allReady = readyCount === questions.length;

  const submit = () => {
    if (!allReady || disabled) return;
    const out: FramingResponse[] = questions.map((q) => {
      const d = draftOf(q.id);
      if (d.dontKnow) return { questionId: q.id, answer: null, dontKnow: true };
      if (q.format === "short_answer") return { questionId: q.id, answer: d.text.trim(), dontKnow: false };
      if (q.format === "multiple_choice") return { questionId: q.id, answer: d.choice, dontKnow: false };
      // Keep the option order stable, not click order.
      return { questionId: q.id, answer: (q.options ?? []).filter((o) => d.choices.includes(o)), dontKnow: false };
    });
    setFocusSummary(true);
    onSubmit({ responses: out, skip: false });
  };

  return (
    <section
      aria-labelledby={headingId}
      className="animate-rise-in overflow-hidden rounded-card border border-learn-200 bg-learn-50 shadow-[0_1px_0_rgba(19,43,40,0.04),0_8px_24px_-12px_rgba(19,43,40,0.18)]"
    >
      <div className="h-1 bg-gradient-to-r from-learn-400 via-learn-500 to-learn-700" aria-hidden="true" />
      <form
        className="px-4 py-5 sm:px-6"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <header>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-learn-100 px-2.5 py-0.5 text-xs font-medium text-learn-700">
            <LearnIcon className="size-3.5" />
            Learning mode
          </p>
          <h2 id={headingId} className="mt-2.5 font-serif text-xl leading-snug font-medium text-learn-900">
            {questions.length === 1 ? "Before I answer — one quick question" : "Before I answer — a few questions to frame this"}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-learn-700">
            {questions.length === 1
              ? "It takes a moment and helps me pitch the explanation right. "
              : "These build toward the answer, step by step. "}
            Answer what you can — “I don’t know” is always a fine answer
            {questions.length === 1 ? "." : ", and it helps me pitch the explanation right."}
          </p>
        </header>

        <div className="mt-5 space-y-6">
          {questions.map((q, i) => (
            <QuestionBlock
              key={q.id}
              index={i}
              question={q}
              draft={draftOf(q.id)}
              disabled={disabled}
              onChange={(next) => setDrafts((cur) => ({ ...cur, [q.id]: next }))}
              onSubmitShortcut={submit}
            />
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-5 rounded-xl border border-danger/30 bg-surface px-3.5 py-2.5 text-sm text-danger">
            {error}
          </p>
        )}

        <footer className="mt-6 flex flex-col-reverse gap-3 border-t border-learn-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col items-start">
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setFocusSummary(true);
                onSubmit({ responses: [], skip: true });
              }}
              className="rounded-lg px-2 py-1 -ml-2 text-sm font-medium text-learn-700 underline-offset-4 transition-colors hover:bg-learn-100 hover:underline focus-visible:outline-2 focus-visible:outline-learn-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Just answer
            </button>
            <span className="inline-flex items-center gap-1 text-xs text-learn-600">
              <BookmarkIcon className="size-3" />
              I’ll save this to Learn It Later
            </span>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-auto">
            <span className="text-xs text-learn-700" aria-live="polite">
              {readyCount} of {questions.length} ready
            </span>
            <button
              type="submit"
              disabled={!allReady || disabled}
              className="rounded-xl bg-learn-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-learn-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-learn-500 disabled:cursor-not-allowed disabled:bg-learn-300 disabled:text-learn-900/70 disabled:shadow-none"
            >
              Share my thinking
            </button>
          </div>
        </footer>
      </form>
    </section>
  );
}
