"use client";
import { LearnIcon } from "@/components/icons";
import type { StarterPrompt } from "./starter-prompts";

/** New-chat greeting (D2). The composer is passed in so it sits between greeting and starters. */
export function EmptyState({
  name,
  starters,
  composer,
  onPick,
  disabled,
}: {
  name: string | null;
  starters: StarterPrompt[];
  composer: React.ReactNode;
  onPick: (prompt: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[46rem] flex-1 flex-col justify-center px-4 py-10 sm:py-16">
      <div className="text-center">
        <p className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-learn-200 bg-learn-50 px-3 py-1 text-xs font-medium text-learn-700">
          <LearnIcon className="size-3.5" />
          Learning mode is on
        </p>
        <h1 className="font-serif text-3xl leading-tight font-normal tracking-tight text-ink sm:text-[2.6rem]">
          {name ? `What are we working on, ${name}?` : "What are we working on today?"}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[0.95rem] leading-relaxed text-ink-muted">
          I’ll still answer — and for the ideas worth owning, I’ll ask a few questions first so the answer sticks.
        </p>
      </div>

      <div className="mt-8">{composer}</div>

      <div className="mt-6">
        <h2 className="sr-only">Suggested prompts</h2>
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {starters.map((s) => (
            <li key={s.title}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(s.prompt)}
                className="group flex h-full w-full flex-col items-start gap-1 rounded-2xl border border-line bg-surface/70 px-4 py-3 text-left transition-colors hover:border-line-strong hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-ink">
                  <span
                    aria-hidden="true"
                    className={`size-1.5 rounded-full ${s.kind === "concept" ? "bg-learn-500" : "bg-accent"}`}
                  />
                  {s.title}
                </span>
                <span className="line-clamp-2 text-[0.85rem] leading-snug text-ink-muted">{s.prompt}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-ink-muted">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-learn-500" />
            Concept — usually framed with a few questions
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
            Lookup — answered right away
          </span>
        </p>
      </div>
    </div>
  );
}
