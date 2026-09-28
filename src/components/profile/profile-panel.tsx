"use client";
// Right-hand panel region (collapsed by default). The frame — open/close,
// inline on lg+, overlay drawer below — is done; Phase 4 fills
// <ProfilePanelContent /> with the full learner profile and the Learn It
// Later queue.
import { useRef } from "react";
import { CloseIcon, LearnIcon } from "@/components/icons";
import { useShell } from "@/components/shell/shell-context";
import { useDrawerFocus } from "@/lib/client/use-drawer-focus";
import { ProfilePanelContent } from "./profile-panel-content";

export function ProfilePanel() {
  const { profilePanelOpen, closeProfilePanel, navModal, profileModal } = useShell();
  const ref = useRef<HTMLElement>(null);
  // Below lg the panel is a modal drawer: focus moves in, and back to the toggle on close.
  useDrawerFocus(profilePanelOpen, profileModal, ref);

  return (
    <>
      <div
        aria-hidden="true"
        onClick={closeProfilePanel}
        className={`fixed inset-0 z-30 bg-ink/25 transition-opacity lg:hidden ${
          profilePanelOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        ref={ref}
        id="profile-panel"
        aria-label="Learning profile"
        inert={!profilePanelOpen || navModal}
        className={`fixed inset-y-0 right-0 z-40 flex w-[min(24rem,100vw)] shrink-0 flex-col border-l border-learn-200 bg-surface transition-[transform,margin] duration-200 ease-out lg:static lg:z-auto lg:w-[22rem] ${
          profilePanelOpen ? "translate-x-0 shadow-xl lg:mr-0 lg:shadow-none" : "translate-x-full lg:-mr-[22rem]"
        }`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-learn-100 px-4">
          <h2 className="inline-flex items-center gap-2 font-serif text-lg font-medium text-learn-900">
            <LearnIcon className="size-4 text-learn-600" />
            Your learning profile
          </h2>
          <button
            type="button"
            onClick={closeProfilePanel}
            className="rounded-lg p-2 text-ink-muted hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-learn-500"
            aria-label="Close learning profile"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>
        <div className="relative min-h-0 flex-1 overflow-y-auto">
          <ProfilePanelContent />
        </div>
      </aside>
    </>
  );
}
