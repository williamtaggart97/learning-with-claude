"use client";
import { usePathname } from "next/navigation";
import { MenuIcon, PanelLeftIcon, PanelRightIcon } from "@/components/icons";
import { ProgressMeterSlot } from "@/components/profile/progress-meter-slot";
import { useConversations } from "@/lib/client/conversations-store";
import { useShell } from "./shell-context";

/** Top bar: nav toggles, current chat title, Phase 4's progress meter slot, profile panel toggle. */
export function Header() {
  const { sidebarCollapsed, toggleSidebar, setMobileNavOpen, profilePanelOpen, toggleProfilePanel } = useShell();
  const { conversations } = useConversations();
  const pathname = usePathname();
  const id = pathname.startsWith("/c/") ? decodeURIComponent(pathname.slice(3)) : null;
  const current = id ? conversations.find((c) => c.id === id) : null;

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 px-3 sm:px-4">
      <button
        type="button"
        onClick={() => setMobileNavOpen(true)}
        className="rounded-lg p-2 text-ink-muted hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent md:hidden"
        aria-label="Open sidebar"
      >
        <MenuIcon className="size-5" />
      </button>
      {sidebarCollapsed && (
        <button
          type="button"
          onClick={toggleSidebar}
          className="hidden rounded-lg p-2 text-ink-muted hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent md:inline-flex"
          aria-label="Expand sidebar"
          aria-expanded={false}
        >
          <PanelLeftIcon className="size-5" />
        </button>
      )}

      <div className="min-w-0 flex-1">
        {current && (
          <p className="truncate text-[0.95rem] text-ink" title={current.title}>
            {current.title}
          </p>
        )}
      </div>

      <ProgressMeterSlot />

      <button
        type="button"
        onClick={toggleProfilePanel}
        aria-expanded={profilePanelOpen}
        aria-controls="profile-panel"
        className={`inline-flex items-center gap-1.5 rounded-lg p-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-learn-500 ${
          profilePanelOpen ? "bg-learn-100 text-learn-800" : "text-ink-muted hover:bg-surface-muted hover:text-ink"
        }`}
        aria-label={profilePanelOpen ? "Close learning profile" : "Open learning profile"}
      >
        <PanelRightIcon className="size-5" />
      </button>
    </header>
  );
}
