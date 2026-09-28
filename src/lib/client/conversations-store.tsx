"use client";
// Sidebar conversation list (X8). Seeded from the server layout; updated
// locally as streams report new/touched conversations (layouts don't
// re-render on client navigation, so the list must be client state).
// A fresh server list (router.refresh / persona switch) replaces it.
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ConversationSummaryDTO } from "@/lib/types";

interface ConversationsContextValue {
  conversations: ConversationSummaryDTO[];
  /** Insert or replace, then re-sort (updatedAt desc). */
  upsert: (summary: ConversationSummaryDTO) => void;
  /** Bump updatedAt to now (a message was added). */
  touch: (id: string) => void;
}

const ConversationsContext = createContext<ConversationsContextValue | null>(null);

const byUpdatedDesc = (a: ConversationSummaryDTO, b: ConversationSummaryDTO) =>
  Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id);

export function ConversationsProvider({
  initial,
  children,
}: {
  initial: ConversationSummaryDTO[];
  children: React.ReactNode;
}) {
  const [list, setList] = useState(initial);
  // Adopt a new server snapshot when the prop identity changes (router.refresh).
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setList((local) => {
      const ids = new Set(initial.map((c) => c.id));
      // Keep locally-created conversations the server snapshot doesn't know yet.
      return [...initial, ...local.filter((c) => !ids.has(c.id))].sort(byUpdatedDesc);
    });
  }

  const upsert = useCallback((summary: ConversationSummaryDTO) => {
    setList((cur) => [summary, ...cur.filter((c) => c.id !== summary.id)].sort(byUpdatedDesc));
  }, []);

  const touch = useCallback((id: string) => {
    const now = new Date().toISOString();
    setList((cur) => cur.map((c) => (c.id === id ? { ...c, updatedAt: now } : c)).sort(byUpdatedDesc));
  }, []);

  const value = useMemo(() => ({ conversations: list, upsert, touch }), [list, upsert, touch]);
  return <ConversationsContext.Provider value={value}>{children}</ConversationsContext.Provider>;
}

export function useConversations(): ConversationsContextValue {
  const ctx = useContext(ConversationsContext);
  if (!ctx) throw new Error("useConversations must be used inside <ConversationsProvider>");
  return ctx;
}
