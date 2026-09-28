"use client";
// Shell UI state: sidebar (collapsible on desktop, drawer on mobile) and the
// right-hand profile panel (collapsed by default). Phase 4 can call
// openProfilePanel() e.g. from the unlock celebration.
import { createContext, useContext } from "react";

export interface ShellContextValue {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  profilePanelOpen: boolean;
  openProfilePanel: () => void;
  closeProfilePanel: () => void;
  toggleProfilePanel: () => void;
  /** The sidebar is open as a modal drawer (below md): everything else is inert. */
  navModal: boolean;
  /** The profile panel is open as a modal drawer (below lg): everything else is inert. */
  profileModal: boolean;
}

export const ShellContext = createContext<ShellContextValue | null>(null);

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside <AppShell>");
  return ctx;
}
