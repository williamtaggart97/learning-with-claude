"use client";
// Unlock-ladder progress meter in the header (P6, P7). Counts framing rounds
// (Tier 0), then whichever Tier 2 path is closer (Tier 1), then a
// compact "Profile unlocked" state. Clicking opens the profile panel.
import { LearnIcon, LockIcon, SparkIcon } from "@/components/icons";
import { useShell } from "@/components/shell/shell-context";
import { useState } from "react";
import { useProfile, useTierUnlocked } from "@/lib/client/profile-store";
import { meterCopy } from "@/lib/ui/profile-format";

export function ProgressMeterSlot() {
  const { profile } = useProfile();
  const { openProfilePanel, profilePanelOpen } = useShell();
  const { progress } = profile;
  const copy = meterCopy(progress);
  const top = progress.tier === 2;
  // Glow once when a tier unlocks in this session (not on page load).
  const [glowTier, setGlowTier] = useState<number | null>(null);
  useTierUnlocked((u) => setGlowTier(u.tier));
  const glow = glowTier !== null && glowTier === progress.tier;

  return (
    <button
      type="button"
      data-slot="progress-meter"
      onClick={openProfilePanel}
      aria-label={copy.long}
      aria-controls="profile-panel"
      aria-expanded={profilePanelOpen}
      title={copy.long}
      className={`group inline-flex h-8 shrink-0 animate-rise-in items-center gap-2 rounded-full border px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-learn-500 ${
        top
          ? "border-spark/50 bg-spark-soft text-ink hover:border-spark"
          : "border-learn-200 bg-learn-50 text-learn-800 hover:border-learn-300 hover:bg-learn-100"
      } ${glow ? "lm-unlock-glow" : ""}`}
      onAnimationEnd={(e) => {
        if (e.animationName === "lm-glow") setGlowTier(null);
      }}
    >
      {top ? (
        <SparkIcon className="size-3.5 text-spark-ink" />
      ) : progress.tier === 1 ? (
        <LearnIcon className="size-3.5 text-learn-600" />
      ) : (
        <LockIcon className="size-3.5 text-learn-600" />
      )}

      {top ? (
        <span className="hidden sm:inline">{copy.short}</span>
      ) : (
        <>
          <span className="hidden lg:inline">
            {progress.tier === 0 ? "Claude is getting to know how you learn" : copy.short}
          </span>
          <span className="hidden sm:inline lg:hidden">{progress.tier === 0 ? copy.short : "Next unlock"}</span>
          <span aria-hidden="true" className="relative h-1.5 w-10 overflow-hidden rounded-full bg-learn-100 sm:w-14">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-learn-500 transition-[width] duration-700 ease-out"
              style={{ width: `${Math.max(progress.fraction * 100, 6)}%` }}
            />
          </span>
          <span className="tabular-nums text-learn-700">{copy.count}</span>
        </>
      )}
    </button>
  );
}
