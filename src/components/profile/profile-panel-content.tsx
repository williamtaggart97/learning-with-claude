"use client";
// PHASE 4 SLOT — placeholder. Replace with the full profile panel: concepts
// with evidence, learning style, context, tier-2 editing, suggested topics
// and the Learn It Later queue. Data: useProfile() (src/lib/client/profile-store).
import { useProfile } from "@/lib/client/profile-store";

export function ProfilePanelContent() {
  const { profile } = useProfile();
  const queued = profile.learnLater.filter((i) => i.status === "queued").length;
  return (
    <div className="space-y-4 p-4 text-sm text-ink-muted">
      <p>
        <span className="font-medium text-ink">{profile.persona.displayName}</span> · Tier {profile.tier} ·{" "}
        {profile.concepts.length} concepts · {queued} queued to Learn It Later
      </p>
      <p className="rounded-xl border border-dashed border-learn-200 bg-learn-50 p-3 text-learn-700">
        The full profile — what Claude thinks you know, how you learn, and your Learn It Later queue — appears here.
      </p>
    </div>
  );
}
