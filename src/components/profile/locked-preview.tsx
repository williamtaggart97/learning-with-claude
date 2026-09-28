// Locked teasers for the unlock ladder (P6). No fake data: only the shape of
// what unlocks, plus real progress.
import { LockIcon, PencilIcon } from "@/components/icons";
import type { TierProgress } from "@/lib/types";
import { FRAMING_ROUNDS, framingRounds, TIER1_ROUNDS, TIER2_CONCEPTS, TIER2_ROUNDS } from "@/lib/ui/profile-format";

const DIMENSIONS = ["How ideas land", "Where to start", "How much detail"];

/** Tier 0: the profile is locked until TIER1_ROUNDS framing rounds. */
export function LockedProfilePreview({ progress }: { progress: TierProgress }) {
  const target = progress.target ?? TIER1_ROUNDS;
  const remaining = Math.max(0, target - progress.current);
  return (
    <section
      aria-label="Learning profile (locked)"
      className="relative overflow-hidden rounded-card border border-learn-200 bg-gradient-to-b from-learn-50 to-surface p-4"
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-learn-200 bg-surface text-learn-700">
          <LockIcon className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="font-serif text-base font-medium text-learn-900">How you learn</h3>
          <p className="mt-0.5 text-sm leading-relaxed text-ink">
            Answer {framingRounds(target)} and I’ll show you how I think you learn. A round is one set of up to three
            framing questions I ask before answering, counted when you answer it.
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div
          role="progressbar"
          aria-label="Framing rounds answered"
          aria-valuemin={0}
          aria-valuemax={target}
          aria-valuenow={progress.current}
          className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-learn-100"
        >
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-learn-500 transition-[width] duration-700"
            style={{ width: `${Math.max(progress.fraction * 100, 4)}%` }}
          />
        </div>
        <span className="text-xs font-medium text-learn-700 tabular-nums">
          {progress.current}/{target}
        </span>
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        {remaining === 1 ? "One more framing round to go." : `${remaining} more ${FRAMING_ROUNDS} to go.`} Skipped rounds
        don’t count.
      </p>

      <ul aria-hidden="true" className="mt-4 space-y-2.5 opacity-70">
        {DIMENSIONS.map((d) => (
          <li key={d} className="rounded-xl border border-dashed border-learn-200 bg-surface/70 px-3 py-2.5">
            <p className="text-xs font-semibold text-learn-700">{d}</p>
            <div className="lm-hatch mt-2 h-2 rounded-full" />
          </li>
        ))}
        <li className="rounded-xl border border-dashed border-learn-200 bg-surface/70 px-3 py-2.5">
          <p className="text-xs font-semibold text-learn-700">Concepts and the evidence behind them</p>
          <div className="mt-2 space-y-1.5">
            <div className="lm-hatch h-1.5 w-4/5 rounded-full" />
            <div className="lm-hatch h-1.5 w-3/5 rounded-full" />
          </div>
        </li>
      </ul>
    </section>
  );
}

/** Tier 1: editing + suggested topics unlock at Tier 2. */
export function EditingTeaser({ progress }: { progress: TierProgress }) {
  const unit = progress.metric === "concepts" ? "concepts" : FRAMING_ROUNDS;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed border-learn-200 bg-learn-50/50 px-3.5 py-3">
      <PencilIcon className="mt-0.5 size-4 shrink-0 text-learn-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-learn-900">Editing and suggested topics are next</p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
          Unlocks at {framingRounds(TIER2_ROUNDS)} or {TIER2_CONCEPTS} concepts. Closest: {progress.current}/{progress.target} {unit}.
        </p>
        <div aria-hidden="true" className="relative mt-2 h-1 overflow-hidden rounded-full bg-learn-100">
          <span className="absolute inset-y-0 left-0 rounded-full bg-learn-500" style={{ width: `${progress.fraction * 100}%` }} />
        </div>
      </div>
    </div>
  );
}
