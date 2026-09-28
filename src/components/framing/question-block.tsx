"use client";
import { useId } from "react";
import { CheckIcon } from "@/components/icons";
import { InlineMarkdown } from "@/components/markdown/inline-markdown";
import type { FramingQuestion } from "@/lib/types";

export interface QuestionDraft {
  text: string;
  choice: string | null;
  choices: string[];
  dontKnow: boolean;
}

export const emptyDraft = (): QuestionDraft => ({ text: "", choice: null, choices: [], dontKnow: false });

export function isDraftReady(q: FramingQuestion, d: QuestionDraft): boolean {
  if (d.dontKnow) return true;
  if (q.format === "short_answer") return d.text.trim().length > 0;
  if (q.format === "multiple_choice") return d.choice !== null;
  return d.choices.length > 0;
}

const FORMAT_HINT: Record<FramingQuestion["format"], string> = {
  short_answer: "In your own words",
  multiple_choice: "Pick one",
  multi_select: "Select all that apply",
};

/** One framing question (L2, L3) with its always-available "I don't know". */
export function QuestionBlock({
  index,
  question,
  draft,
  disabled,
  onChange,
  onSubmitShortcut,
}: {
  index: number;
  question: FramingQuestion;
  draft: QuestionDraft;
  disabled: boolean;
  onChange: (next: QuestionDraft) => void;
  onSubmitShortcut: () => void;
}) {
  const baseId = useId();
  const promptId = `${baseId}-prompt`;
  const hintId = `${baseId}-hint`;
  const inputDisabled = disabled || draft.dontKnow;
  const options = question.options ?? [];

  const toggleDontKnow = () =>
    // Keep what was typed/picked: toggling back restores it; submit ignores it while dontKnow.
    onChange({ ...draft, dontKnow: !draft.dontKnow });

  return (
    <fieldset className="min-w-0" aria-describedby={hintId}>
      <legend className="flex w-full items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-learn-700 text-xs font-semibold text-white"
        >
          {index + 1}
        </span>
        <span id={promptId} className="font-serif text-[1.05rem] leading-snug font-medium text-learn-900">
          <span className="sr-only">Question {index + 1}: </span>
          <InlineMarkdown text={question.prompt} />
        </span>
      </legend>

      <div className="mt-3 pl-9">
        <p id={hintId} className="mb-2 text-xs font-medium tracking-wide text-learn-600 uppercase">
          {FORMAT_HINT[question.format]}
        </p>

        <div className={`transition-opacity duration-200 ${draft.dontKnow ? "opacity-45" : ""}`}>
          {question.format === "short_answer" && (
            <textarea
              aria-labelledby={promptId}
              value={draft.text}
              disabled={inputDisabled}
              onChange={(e) => onChange({ ...draft, text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  onSubmitShortcut();
                }
              }}
              rows={2}
              placeholder={draft.dontKnow ? "Marked as “I don’t know”" : "A sentence or two is plenty…"}
              className="field-sizing-content block max-h-60 min-h-[4.25rem] w-full resize-none rounded-xl border border-learn-200 bg-surface px-3.5 py-2.5 text-[0.95rem] leading-relaxed text-ink placeholder:text-ink-faint focus:border-learn-500 focus:ring-2 focus:ring-learn-200 focus:outline-none disabled:cursor-not-allowed disabled:bg-learn-50"
            />
          )}

          {question.format !== "short_answer" && (
            <div className="grid gap-2">
              {options.map((opt, i) => {
                const multi = question.format === "multi_select";
                const checked = multi ? draft.choices.includes(opt) : draft.choice === opt;
                return (
                  <label
                    key={i}
                    className={`group flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-2.5 text-[0.95rem] leading-snug transition-colors has-[:disabled]:cursor-not-allowed has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-learn-400 ${
                      checked
                        ? "border-learn-500 bg-learn-100/70 text-learn-900"
                        : "border-learn-200 bg-surface text-ink hover:border-learn-300 hover:bg-learn-50"
                    }`}
                  >
                    <input
                      type={multi ? "checkbox" : "radio"}
                      name={`${baseId}-opt`}
                      value={opt}
                      checked={checked}
                      disabled={inputDisabled}
                      onChange={() => {
                        if (multi) {
                          const choices = checked ? draft.choices.filter((c) => c !== opt) : [...draft.choices, opt];
                          onChange({ ...draft, choices });
                        } else {
                          onChange({ ...draft, choice: opt });
                        }
                      }}
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 inline-flex size-[1.1rem] shrink-0 items-center justify-center border transition-colors ${
                        multi ? "rounded-[0.3rem]" : "rounded-full"
                      } ${checked ? "border-learn-700 bg-learn-700 text-white" : "border-learn-300 bg-surface"}`}
                    >
                      {checked && (multi ? <CheckIcon className="size-3" strokeWidth={2.5} /> : <span className="size-1.5 rounded-full bg-white" />)}
                    </span>
                    <span>
                      <InlineMarkdown text={opt} />
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <button
          type="button"
          aria-pressed={draft.dontKnow}
          aria-describedby={promptId}
          disabled={disabled}
          onClick={toggleDontKnow}
          className={`mt-2.5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-learn-500 disabled:cursor-not-allowed ${
            draft.dontKnow
              ? "border-learn-600 bg-learn-700 text-white"
              : "border-learn-300 bg-surface text-learn-700 hover:border-learn-400 hover:bg-learn-50"
          }`}
        >
          {draft.dontKnow ? <CheckIcon className="size-3.5" strokeWidth={2.25} /> : <span aria-hidden="true">?</span>}
          I don’t know
        </button>
        {draft.dontKnow && (
          <span className="ml-2 animate-fade-in text-xs text-learn-700">Good to know — I’ll start from the basics here.</span>
        )}
      </div>
    </fieldset>
  );
}
