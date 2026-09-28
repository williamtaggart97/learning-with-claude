"use client";
// PHASE 4 SLOT — placeholder for the unlock-ladder progress meter (P6/P7)
// in the header. Data: useProfile().profile.progress; unlock signals:
// useTierUnlocked() (src/lib/client/profile-store).
import { useProfile } from "@/lib/client/profile-store";

export function ProgressMeterSlot() {
  const { profile } = useProfile();
  const { progress } = profile;
  return (
    <div
      data-slot="progress-meter"
      className="hidden items-center gap-1.5 rounded-full border border-learn-200 bg-learn-50 px-2.5 py-1 text-xs text-learn-700 sm:inline-flex"
    >
      Tier {progress.tier}
      {progress.target !== null && (
        <span className="text-learn-600">
          · {progress.current}/{progress.target}
        </span>
      )}
    </div>
  );
}
