"use client";
// PHASE 4 SLOT — placeholder for the persona switcher + "Reset this persona"
// (X4–X6) in the sidebar footer. After POST /api/persona or
// /api/persona/reset, call router.refresh(): the (chat) layout re-renders
// with the new session user and <AppShell key={user.id}> remounts all
// client state.
import { useProfile } from "@/lib/client/profile-store";

export function PersonaSwitcher() {
  const { profile } = useProfile();
  const { persona } = profile;
  return (
    <div data-slot="persona-switcher" className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
      <span
        aria-hidden="true"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft font-serif text-sm font-medium text-accent-ink"
      >
        {persona.displayName.slice(0, 1)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-ink">{persona.displayName}</span>
        <span className="block truncate text-xs text-ink-muted">{persona.tagline}</span>
      </span>
    </div>
  );
}
