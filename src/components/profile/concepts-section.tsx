"use client";
// Concepts with mastery (P1): a bar on the low/mid/high scale per concept and
// an expandable "Why Claude thinks this" evidence list.
import { useId, useState } from "react";
import { ChevronDownIcon } from "@/components/icons";
import type { ConceptDTO } from "@/lib/types";
import {
  type ConceptSort,
  formatDelta,
  MASTERY_FILL,
  MASTERY_LABEL,
  masteryBand,
  pct,
  relativeTime,
  sortConcepts,
} from "@/lib/ui/profile-format";
import { ProfileSection } from "./section";

const EVIDENCE_PREVIEW = 4;

export function ConceptsSection({ concepts }: { concepts: ConceptDTO[] }) {
  const [sort, setSort] = useState<ConceptSort>("shaky");
  const sorted = sortConcepts(concepts, sort);

  return (
    <ProfileSection
      title={`Concepts${concepts.length ? ` · ${concepts.length}` : ""}`}
      description="What Claude thinks you know, and the moments that convinced it."
      action={concepts.length > 1 ? <SortToggle sort={sort} onChange={setSort} /> : undefined}
    >
      {concepts.length === 0 ? (
        <p className="rounded-xl bg-learn-50 px-3 py-2.5 text-sm text-learn-900">
          No concepts yet — they appear as you work through framing questions.
        </p>
      ) : (
        <>
          <MasteryLegend />
          <ul className="divide-y divide-learn-100 overflow-hidden rounded-xl border border-learn-100 bg-surface">
            {sorted.map((c) => (
              <li key={c.slug}>
                <ConceptRow concept={c} />
              </li>
            ))}
          </ul>
        </>
      )}
    </ProfileSection>
  );
}

function SortToggle({ sort, onChange }: { sort: ConceptSort; onChange: (s: ConceptSort) => void }) {
  const opts: { value: ConceptSort; label: string }[] = [
    { value: "shaky", label: "Shakiest" },
    { value: "recent", label: "Recent" },
  ];
  return (
    <div role="group" aria-label="Sort concepts" className="inline-flex rounded-lg bg-learn-50 p-0.5">
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={sort === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2 py-0.5 text-[0.7rem] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-learn-500 ${
            sort === o.value ? "bg-surface text-learn-900 shadow-sm" : "text-learn-700 hover:text-learn-900"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function MasteryLegend() {
  return (
    <div className="flex items-center gap-3 px-0.5 text-[0.7rem] text-ink-muted" aria-hidden="true">
      {(["low", "mid", "high"] as const).map((b) => (
        <span key={b} className="inline-flex items-center gap-1">
          <span className={`size-2 rounded-full ${MASTERY_FILL[b]}`} />
          {MASTERY_LABEL[b]}
        </span>
      ))}
    </div>
  );
}

function ConceptRow({ concept }: { concept: ConceptDTO }) {
  const [open, setOpen] = useState(false);
  const band = masteryBand(concept.score);
  const panelId = useId();

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="group block w-full px-3.5 py-2.5 text-left transition-colors hover:bg-learn-50/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-learn-500"
      >
        <span className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 text-sm font-medium text-ink">{concept.name}</span>
          <span className="shrink-0 text-[0.72rem] text-ink-muted tabular-nums">
            {MASTERY_LABEL[band]} · {pct(concept.score)}
          </span>
        </span>
        <span className="mt-1.5 flex items-center gap-2">
          <span aria-hidden="true" className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
            <span
              className={`absolute inset-y-0 left-0 rounded-full ${MASTERY_FILL[band]} transition-[width] duration-500`}
              style={{ width: `${Math.max(concept.score * 100, 3)}%` }}
            />
          </span>
          <ChevronDownIcon
            aria-hidden="true"
            className={`size-3.5 shrink-0 text-learn-600 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
        <span className="sr-only">. {open ? "Hide" : "Show"} why Claude thinks this</span>
      </button>
      {open && <EvidenceList id={panelId} concept={concept} />}
    </div>
  );
}

function EvidenceList({ id, concept }: { id: string; concept: ConceptDTO }) {
  const [all, setAll] = useState(false);
  const items = all ? concept.evidence : concept.evidence.slice(0, EVIDENCE_PREVIEW);
  return (
    <div id={id} className="animate-fade-in bg-learn-50/50 px-3.5 pt-1 pb-3">
      <p className="text-[0.7rem] font-semibold tracking-wide text-learn-700 uppercase">Why Claude thinks this</p>
      {concept.evidence.length === 0 ? (
        <p className="mt-1 text-xs text-ink-muted">No specific moments recorded yet.</p>
      ) : (
        <ol className="mt-1.5 space-y-2">
          {items.map((e, i) => {
            const up = e.delta > 0;
            const down = e.delta < 0;
            return (
              <li key={`${e.at}-${i}`} className="flex gap-2">
                <span
                  className={`mt-px inline-flex h-5 min-w-9 shrink-0 items-center justify-center rounded-md px-1 text-[0.68rem] font-semibold tabular-nums ${
                    up ? "bg-learn-100 text-learn-800" : down ? "bg-accent-soft text-accent-ink" : "bg-surface-muted text-ink-muted"
                  }`}
                  title={`Mastery ${up ? "up" : down ? "down" : "unchanged"} ${Math.abs(Math.round(e.delta * 100))} points`}
                >
                  <span className="sr-only">Mastery change </span>
                  {formatDelta(e.delta)}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs leading-relaxed text-ink">{e.note}</span>
                  <time dateTime={e.at} className="text-[0.68rem] text-ink-muted">
                    {relativeTime(e.at)}
                  </time>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {concept.evidence.length > EVIDENCE_PREVIEW && (
        <button
          type="button"
          onClick={() => setAll((a) => !a)}
          className="mt-2 text-xs font-medium text-learn-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-learn-500"
        >
          {all ? "Show fewer" : `Show all ${concept.evidence.length}`}
        </button>
      )}
    </div>
  );
}
