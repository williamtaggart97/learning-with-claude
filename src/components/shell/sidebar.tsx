"use client";
// Claude-style sidebar (X8): New chat, recents (newest first), footer slot
// for Phase 4's persona switcher. Inline + collapsible on md+, a drawer below.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { useStartNewChat } from "@/components/chat/chat-sessions-provider";
import { PersonaSwitcher } from "@/components/persona/persona-switcher";
import { CompassIcon, LearnIcon, PanelLeftIcon, PlusIcon, CloseIcon } from "@/components/icons";
import { useConversations } from "@/lib/client/conversations-store";
import { useDrawerFocus } from "@/lib/client/use-drawer-focus";
import { useMediaQuery } from "@/lib/client/use-media-query";
import { useShell } from "./shell-context";

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, mobileNavOpen, setMobileNavOpen, navModal, profileModal } = useShell();
  const startNewChat = useStartNewChat();
  const navRef = useRef<HTMLElement>(null);
  useDrawerFocus(mobileNavOpen, navModal, navRef);
  const desktop = useMediaQuery("(min-width: 768px)", true);
  // Off-screen sidebars must not take focus.
  const hidden = desktop ? sidebarCollapsed : !mobileNavOpen;
  // "New chat" always opens a clean chat, even when already on `/`.
  const onNewChat = () => {
    startNewChat();
    setMobileNavOpen(false);
  };

  return (
    <>
      {/* Mobile scrim */}
      <div
        aria-hidden="true"
        onClick={() => setMobileNavOpen(false)}
        className={`fixed inset-0 z-30 bg-ink/25 transition-opacity md:hidden ${
          mobileNavOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <nav
        ref={navRef}
        aria-label="Chats"
        className={`fixed inset-y-0 left-0 z-40 flex w-[17.5rem] shrink-0 flex-col border-r border-line bg-surface-muted transition-[transform,width,margin] duration-200 ease-out md:static md:z-auto md:translate-x-0 ${
          mobileNavOpen ? "translate-x-0 shadow-xl" : "-translate-x-full"
        } ${sidebarCollapsed ? "md:-ml-[17.5rem]" : "md:ml-0"}`}
        inert={hidden || profileModal}
      >
        <div className="flex h-14 items-center justify-between gap-2 px-3">
          <Link
            href="/"
            onClick={onNewChat}
            className="flex items-center gap-2 rounded-lg px-1.5 py-1 font-serif text-[1.2rem] font-medium tracking-tight text-ink focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-accent-strong text-white">
              <LearnIcon className="size-4" />
            </span>
            Learning mode
          </Link>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="rounded-lg p-2 text-ink-muted hover:bg-line/60 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent md:hidden"
            aria-label="Close sidebar"
          >
            <CloseIcon className="size-5" />
          </button>
          <button
            type="button"
            onClick={toggleSidebar}
            className="hidden rounded-lg p-2 text-ink-muted hover:bg-line/60 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent md:inline-flex"
            aria-label="Collapse sidebar"
            aria-expanded={!sidebarCollapsed}
          >
            <PanelLeftIcon className="size-5" />
          </button>
        </div>

        <div className="px-3 pb-2">
          <Link
            href="/"
            onClick={onNewChat}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[0.95rem] font-medium text-accent-ink transition-colors hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span className="inline-flex size-6 items-center justify-center rounded-full bg-accent-strong text-white">
              <PlusIcon className="size-4" strokeWidth={2.25} />
            </span>
            New chat
          </Link>
        </div>

        <ConversationList />

        <div className="border-t border-line p-3">
          <PersonaSwitcher />
        </div>
      </nav>
    </>
  );
}

function ConversationList() {
  const { conversations } = useConversations();
  const pathname = usePathname();

  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto px-3 pb-3">
      <h2 className="px-2.5 pt-3 pb-1.5 text-xs font-medium text-ink-muted">Recents</h2>
      {conversations.length === 0 ? (
        <p className="px-2.5 py-2 text-sm text-ink-muted">Your chats will show up here.</p>
      ) : (
        <ul className="space-y-0.5">
          {conversations.map((c) => {
            const active = pathname === `/c/${c.id}`;
            const digIn = c.origin === "dig_in";
            return (
              <li key={c.id}>
                <Link
                  href={`/c/${c.id}`}
                  aria-current={active ? "page" : undefined}
                  title={c.title}
                  className={`group flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                    active ? "bg-line/80 text-ink" : "text-ink hover:bg-line/50"
                  }`}
                >
                  {digIn && (
                    <span className="inline-flex shrink-0 text-learn-600" title="Dig-in from Learn It Later">
                      <CompassIcon className="size-3.5" />
                      <span className="sr-only">Dig-in: </span>
                    </span>
                  )}
                  <span className="truncate">{c.title}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
