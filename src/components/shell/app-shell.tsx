"use client";
// App shell (V1, X8). Claude-like layout:
//   ┌ Sidebar ─┬ Header (title · ProgressMeterSlot · profile toggle) ┬──────────────┐
//   │ New chat │                                                      │ ProfilePanel │
//   │ Recents  │  children (centered chat column)                     │ (slot, off   │
//   │ ──────── │                                                      │  by default) │
//   │ Persona  │                                                      │              │
//   └ Switcher ┴──────────────────────────────────────────────────────┴──────────────┘
// Chat sessions (ChatSessionsProvider) live here so streams survive page navigations.
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatSessionsProvider } from "@/components/chat/chat-sessions-provider";
import { ProfilePanel } from "@/components/profile/profile-panel";
import { ConversationsProvider } from "@/lib/client/conversations-store";
import { ProfileProvider } from "@/lib/client/profile-store";
import { useMediaQuery } from "@/lib/client/use-media-query";
import type { ConversationSummaryDTO, ProfileDTO } from "@/lib/types";
import { Header } from "./header";
import { ShellContext, type ShellContextValue } from "./shell-context";
import { Sidebar } from "./sidebar";

export function AppShell({
  conversations,
  profile,
  children,
}: {
  conversations: ConversationSummaryDTO[];
  profile: ProfileDTO;
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [profilePanelOpen, setProfilePanelOpen] = useState(false);
  const pathname = usePathname();
  const mdUp = useMediaQuery("(min-width: 768px)", true);
  const lgUp = useMediaQuery("(min-width: 1024px)", true);
  const navModal = mobileNavOpen && !mdUp;
  const profileModal = profilePanelOpen && !lgUp;
  const backgroundInert = navModal || profileModal;

  // Close the mobile drawer on navigation.
  const [navPath, setNavPath] = useState(pathname);
  if (navPath !== pathname) {
    setNavPath(pathname);
    setMobileNavOpen(false);
  }

  // Escape closes overlays.
  useEffect(() => {
    if (!mobileNavOpen && !profilePanelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMobileNavOpen(false);
      if (!window.matchMedia("(min-width: 1024px)").matches) setProfilePanelOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNavOpen, profilePanelOpen]);

  const toggleSidebar = useCallback(() => setSidebarCollapsed((c) => !c), []);
  const openProfilePanel = useCallback(() => setProfilePanelOpen(true), []);
  const closeProfilePanel = useCallback(() => setProfilePanelOpen(false), []);
  const toggleProfilePanel = useCallback(() => setProfilePanelOpen((o) => !o), []);

  const shell = useMemo<ShellContextValue>(
    () => ({
      sidebarCollapsed,
      toggleSidebar,
      mobileNavOpen,
      setMobileNavOpen,
      profilePanelOpen,
      openProfilePanel,
      closeProfilePanel,
      toggleProfilePanel,
      navModal,
      profileModal,
    }),
    [
      sidebarCollapsed,
      toggleSidebar,
      mobileNavOpen,
      profilePanelOpen,
      openProfilePanel,
      closeProfilePanel,
      toggleProfilePanel,
      navModal,
      profileModal,
    ],
  );

  return (
    <ProfileProvider initialProfile={profile}>
      <ConversationsProvider initial={conversations}>
        <ChatSessionsProvider>
        <ShellContext.Provider value={shell}>
          <a
            href="#main"
            className="sr-only z-50 rounded-lg bg-surface px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
          >
            Skip to chat
          </a>
          <div className="flex h-dvh w-full overflow-clip">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="shrink-0" inert={backgroundInert}>
                <Header />
              </div>
              <div className="flex min-h-0 flex-1 overflow-clip">
                <main id="main" className="flex min-w-0 flex-1 flex-col" inert={backgroundInert}>
                  {children}
                </main>
                <ProfilePanel />
              </div>
            </div>
          </div>
        </ShellContext.Provider>
        </ChatSessionsProvider>
      </ConversationsProvider>
    </ProfileProvider>
  );
}
