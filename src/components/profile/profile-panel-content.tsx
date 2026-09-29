"use client";
// Profile panel content, gated by tier (P6):
//   Tier 0 — Learn It Later queue + a locked preview of the profile
//   Tier 1 — tabs: Profile (read-only) · Learn It Later
//   Tier 2 — tabs: Profile (editable + suggested topics) · Learn It Later
// Reads the live profile store, so it refreshes after answers / polling.
import { useId, useRef, useState } from "react";
import { DigInSuggestions, LearnLaterQueue } from "@/components/learn-later/learn-later-queue";
import { useProfile, useTierUnlocked } from "@/lib/client/profile-store";
import type { ProfileDTO } from "@/lib/types";
import { ConceptsSection } from "./concepts-section";
import { ContextSection } from "./context-section";
import { EditingTeaser, LockedProfilePreview } from "./locked-preview";
import { TierBadge } from "./section";
import { StyleSection } from "./style-section";
import { SuggestedTopics } from "./suggested-topics";
import { FRAMING_ROUND_GLOSS, framingRounds, TIER1_ROUNDS } from "@/lib/ui/profile-format";

type Tab = "profile" | "queue";

export function ProfilePanelContent() {
  const { profile } = useProfile();
  const [tab, setTab] = useState<Tab>("profile");
  // A fresh unlock should land on the newly revealed profile.
  useTierUnlocked(() => setTab("profile"));

  if (profile.tier === 0) {
    return (
      <div className="space-y-6 p-4">
        <TierIntro profile={profile} />
        <LearnLaterQueue />
        <LockedProfilePreview progress={profile.progress} />
      </div>
    );
  }

  const queued = profile.learnLater.filter((i) => i.status === "queued").length;
  return (
    <div>
      <Tabs
        tab={tab}
        onChange={setTab}
        tabs={[
          { id: "profile", label: "Profile" },
          { id: "queue", label: "Learn It Later", count: queued },
        ]}
        renderPanel={(t) =>
          t === "profile" ? (
            <div className="space-y-7 p-4">
              <TierIntro profile={profile} />
              <DigInSuggestions />
              {profile.tier >= 2 && <SuggestedTopics topics={profile.suggestedTopics} />}
              <StyleSection style={profile.learningStyle} editable={profile.tier >= 2} />
              <ConceptsSection concepts={profile.concepts} />
              <ContextSection context={profile.userContext} editable={profile.tier >= 2} />
              {profile.tier === 1 && <EditingTeaser progress={profile.progress} />}
            </div>
          ) : (
            <div className="p-4">
              <LearnLaterQueue />
            </div>
          )
        }
      />
    </div>
  );
}

function TierIntro({ profile }: { profile: ProfileDTO }) {
  const copy =
    profile.tier === 0
      ? `Claude is getting to know how you learn. Your profile unlocks after ${framingRounds(TIER1_ROUNDS)} — ${FRAMING_ROUND_GLOSS}.`
      : profile.tier === 1
        ? "Here’s how Claude thinks you learn. It updates as you keep chatting."
        : "Your profile is editable — correct anything and Claude adapts right away.";
  return (
    <div className="flex items-center gap-2.5">
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-learn-100 font-serif text-sm font-medium text-learn-800">
        {profile.persona.displayName.slice(0, 1)}
      </span>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
          {profile.persona.displayName}
          <TierBadge tier={profile.tier} />
        </p>
        <p className="text-xs leading-relaxed text-ink-muted">{copy}</p>
      </div>
    </div>
  );
}

/** WAI-ARIA tabs with roving focus (arrow keys, Home/End). */
function Tabs({
  tab,
  onChange,
  tabs,
  renderPanel,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
  tabs: { id: Tab; label: string; count?: number }[];
  renderPanel: (t: Tab) => React.ReactNode;
}) {
  const base = useId();
  const refs = useRef(new Map<Tab, HTMLButtonElement>());
  const focusTab = (t: Tab) => {
    onChange(t);
    refs.current.get(t)?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === tab);
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    focusTab(tabs[next].id);
  };

  return (
    <>
      <div
        role="tablist"
        aria-label="Profile sections"
        onKeyDown={onKeyDown}
        className="sticky top-0 z-10 flex gap-1 border-b border-learn-100 bg-surface/95 px-4 pt-2 backdrop-blur"
      >
        {tabs.map((t) => {
          const selected = t.id === tab;
          return (
            <button
              key={t.id}
              ref={(el) => {
                if (el) refs.current.set(t.id, el);
                else refs.current.delete(t.id);
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={selected}
              // Only the selected panel is rendered, so only it is referenced.
              aria-controls={selected ? `${base}-panel-${t.id}` : undefined}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t.id)}
              className={`relative -mb-px inline-flex items-center gap-1.5 border-b-2 px-2.5 pt-1.5 pb-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-learn-500 ${
                selected ? "border-learn-600 text-learn-900" : "border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              {t.label}
              {!!t.count && (
                <span
                  className={`rounded-full px-1.5 py-px text-[0.68rem] tabular-nums ${
                    selected ? "bg-learn-100 text-learn-800" : "bg-surface-muted text-ink-muted"
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`${base}-panel-${tab}`} aria-labelledby={`${base}-tab-${tab}`} tabIndex={0} className="focus-visible:outline-none">
        {renderPanel(tab)}
      </div>
    </>
  );
}
