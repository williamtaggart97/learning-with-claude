"use client";
// Chat sessions live here, above the pages (mounted in AppShell), so a
// stream keeps running — and stays visible — across page navigations:
//
//   <ChatSessionsProvider>                       AppShell (persists across pages)
//     useNewChatSession()                         `/`       → the current new-chat session
//     useConversationSession(dto)                 `/c/[id]` → the live session for id, or one
//                                                             hydrated from the server DTO
//     useStartNewChat()                           "New chat" links → fresh, clean new chat
//     useStartChatWith()                          start a new chat that sends a prompt (suggested topics)
//     useAnyChatBusy()                            true while any session is routing/streaming
//
// A new chat starts under no id. On its first `conversation` event it is
// promoted (registered under the conversation id) and, if a view is showing
// it on `/`, the URL becomes /c/[id] via router.replace. The /c/[id] page then
// mounts a ChatView that attaches to the same live session, so the stream is
// never dropped. Navigating away and back re-attaches the same way.
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { useConversations } from "@/lib/client/conversations-store";
import { useProfile } from "@/lib/client/profile-store";
import type { ConversationDTO } from "@/lib/types";
import { ChatSession, type ChatSessionHost, type ChatSessionState } from "./chat-session";

/** Idle, unviewed sessions beyond this many are dropped (they re-hydrate from the server). */
const MAX_KEPT_SESSIONS = 24;

type HostDeps = Omit<ChatSessionHost, "promoted">;

class ChatSessionRegistry {
  private byConversation = new Map<string, ChatSession>();
  private newChat: ChatSession | null = null;
  private newChatVersion = 0;
  private newChatListeners = new Set<() => void>();
  /** Every session this registry created (busy tracking). */
  private live = new Set<ChatSession>();
  private anyBusy = false;
  private busyListeners = new Set<() => void>();
  /** A new chat started from outside the `/` view: follow it to /c/[id] once promoted. */
  private follow: ChatSession | null = null;
  private readonly host: () => ChatSessionHost;

  constructor(
    private deps: HostDeps,
    private navigateToConversation: (id: string) => void,
  ) {
    const promoted = (session: ChatSession, id: string) => this.promote(session, id);
    this.host = () => ({ ...this.deps, promoted });
  }

  /** Keep the app callbacks current (called from a layout effect). */
  update(deps: HostDeps, navigateToConversation: (id: string) => void) {
    this.deps = deps;
    this.navigateToConversation = navigateToConversation;
  }

  /** The live session for a conversation, or a new one seeded from the DTO. */
  forConversation(dto: ConversationDTO): ChatSession {
    // The user opened some other conversation: stop following a startWith chat.
    if (this.follow && this.follow.getState().conversationId !== dto.id) this.follow = null;
    const existing = this.byConversation.get(dto.id);
    if (existing) {
      // Most recently used last (eviction order).
      this.byConversation.delete(dto.id);
      this.byConversation.set(dto.id, existing);
      return existing;
    }
    const session = this.track(new ChatSession(dto, this.host));
    this.byConversation.set(dto.id, session);
    this.evict();
    return session;
  }

  /**
   * The session for the `/` page: the current new chat while it's untouched
   * or still waiting for its `conversation` event; otherwise a fresh one (a
   * stopped/failed pre-conversation send is not carried into a new visit).
   */
  acquireNewChat(): ChatSession {
    const cur = this.newChat;
    if (cur && cur.getState().conversationId === null && (cur.pristine || cur.busy)) return cur;
    if (cur && cur.getState().conversationId === null) this.drop(cur);
    this.newChat = this.track(new ChatSession(null, this.host));
    return this.newChat;
  }

  /**
   * Start a fresh new chat and send `text` as its first message. The caller
   * navigates to `/`; the `/` view attaches to this (busy) session, and on
   * promotion the URL follows to /c/[id] even if the view mounted late.
   * Ignored (returns false) while a previous startWith chat is still waiting
   * for its conversation, so a double-click never creates two chats.
   */
  startWith(text: string): boolean {
    const f = this.follow;
    if (f && f.busy && f.getState().conversationId === null) return false;
    this.startNewChat();
    const session = this.acquireNewChat();
    this.follow = session;
    void session.send(text);
    return true;
  }

  /**
   * The route changed. startWith navigates to `/`; landing anywhere else
   * means the user went somewhere on purpose, so don’t yank them to the
   * followed chat when it is promoted.
   */
  routeChanged(pathname: string) {
    if (this.follow && pathname !== "/") this.follow = null;
  }

  private track(session: ChatSession): ChatSession {
    this.live.add(session);
    session.subscribe(this.recomputeBusy);
    return session;
  }

  private drop(session: ChatSession) {
    session.dispose();
    this.live.delete(session);
    queueMicrotask(this.recomputeBusy);
  }

  private recomputeBusy = () => {
    let busy = false;
    for (const s of this.live) if (s.busy) busy = true;
    if (busy === this.anyBusy) return;
    this.anyBusy = busy;
    for (const l of this.busyListeners) l();
  };

  subscribeBusy = (listener: () => void) => {
    this.busyListeners.add(listener);
    return () => void this.busyListeners.delete(listener);
  };

  getAnyBusy = () => this.anyBusy;

  /** "New chat" clicked: the `/` view switches to a clean session. */
  startNewChat() {
    this.follow = null;
    const cur = this.newChat;
    if (cur && cur.pristine) return;
    // An in-flight new chat keeps streaming detached (it will be promoted and
    // appear in the sidebar); an idle, stopped one is simply dropped.
    if (cur && !cur.busy && cur.getState().conversationId === null) this.drop(cur);
    this.newChat = null;
    this.newChatVersion++;
    for (const l of this.newChatListeners) l();
  }

  subscribeNewChat = (listener: () => void) => {
    this.newChatListeners.add(listener);
    return () => void this.newChatListeners.delete(listener);
  };

  getNewChatVersion = () => this.newChatVersion;

  private promote(session: ChatSession, id: string) {
    this.byConversation.set(id, session);
    // The next visit to `/` gets a fresh chat. Don't bump the version: the
    // `/` view keeps showing this session until the URL swap completes.
    if (this.newChat === session) this.newChat = null;
    // A followed chat (startWith) goes to /c/[id] even if the navigation to
    // `/` hasn't landed yet — the user explicitly asked to open it.
    if (this.follow === session) {
      this.follow = null;
      this.navigateToConversation(id);
    } else if (session.viewers > 0 && window.location.pathname === "/") {
      this.navigateToConversation(id);
    }
  }

  private evict() {
    if (this.byConversation.size <= MAX_KEPT_SESSIONS) return;
    for (const [id, s] of this.byConversation) {
      if (this.byConversation.size <= MAX_KEPT_SESSIONS) break;
      if (s.viewers === 0 && !s.busy) {
        this.drop(s);
        this.byConversation.delete(id);
      }
    }
  }

  private disposeTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Provider unmounted (persona switch/reset remounts AppShell). Deferred so
   * React strict mode's simulated unmount/remount doesn't kill live sessions.
   */
  scheduleDispose() {
    this.disposeTimer = setTimeout(() => this.dispose(), 0);
  }

  cancelDispose() {
    if (this.disposeTimer !== null) clearTimeout(this.disposeTimer);
    this.disposeTimer = null;
  }

  private dispose() {
    for (const s of this.live) s.dispose();
    this.live.clear();
    this.byConversation.clear();
    this.newChat = null;
    this.follow = null;
  }
}

const ChatSessionsContext = createContext<ChatSessionRegistry | null>(null);

export function ChatSessionsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { beginTurn, applyProgress, afterAnswer, refresh } = useProfile();
  const { upsert, touch } = useConversations();

  const current: HostDeps = {
    beginTurn,
    applyProgress,
    afterAnswer,
    refreshProfile: refresh,
    upsertConversation: upsert,
    touchConversation: touch,
  };
  const navigate = (id: string) => router.replace(`/c/${encodeURIComponent(id)}`, { scroll: false });
  const [registry] = useState(() => new ChatSessionRegistry(current, navigate));
  // Layout effect: runs before any child's passive effect (e.g. the dig-in kickoff).
  useLayoutEffect(() => registry.update(current, navigate));
  const pathname = usePathname();
  useLayoutEffect(() => registry.routeChanged(pathname), [registry, pathname]);
  useEffect(() => {
    registry.cancelDispose();
    return () => registry.scheduleDispose();
  }, [registry]);

  return <ChatSessionsContext.Provider value={registry}>{children}</ChatSessionsContext.Provider>;
}

function useRegistry(): ChatSessionRegistry {
  const ctx = useContext(ChatSessionsContext);
  if (!ctx) throw new Error("Chat session hooks must be used inside <ChatSessionsProvider>");
  return ctx;
}

/** Subscribe to a session's state. */
export function useSessionState(session: ChatSession): ChatSessionState {
  return useSyncExternalStore(session.subscribe, session.getState, session.getState);
}

/** Mark the session as viewed while mounted (the URL swap only happens for a viewed new chat). */
function useAttach(session: ChatSession) {
  useEffect(() => session.attach(), [session]);
}

/** `/c/[id]`: attach to the live session, hydrating from the server DTO when that is newer. */
export function useConversationSession(dto: ConversationDTO): ChatSession {
  const registry = useRegistry();
  const [session] = useState(() => registry.forConversation(dto));
  useAttach(session);
  useEffect(() => session.hydrate(dto), [session, dto]);
  return session;
}

/** `/`: the current new-chat session (switches when "New chat" is clicked). */
export function useNewChatSession(): ChatSession {
  const registry = useRegistry();
  const version = useSyncExternalStore(registry.subscribeNewChat, registry.getNewChatVersion, registry.getNewChatVersion);
  const [pinned, setPinned] = useState(() => ({ version, session: registry.acquireNewChat() }));
  let session = pinned.session;
  if (pinned.version !== version) {
    session = registry.acquireNewChat();
    setPinned({ version, session });
  }
  useAttach(session);
  return session;
}

/** For "New chat" links: call on click so `/` shows a clean chat even when already there. */
export function useStartNewChat(): () => void {
  const registry = useRegistry();
  return () => registry.startNewChat();
}

/**
 * Start a new chat whose first message is `text` (e.g. a suggested topic)
 * and show it: navigates to `/`, which attaches to the in-flight session.
 */
export function useStartChatWith(): (text: string) => void {
  const registry = useRegistry();
  const router = useRouter();
  return (text: string) => {
    if (!registry.startWith(text)) return;
    if (window.location.pathname !== "/") router.push("/");
  };
}

/** True while any chat session is routing or streaming (e.g. to hold a celebration until the answer lands). */
export function useAnyChatBusy(): boolean {
  const registry = useRegistry();
  return useSyncExternalStore(registry.subscribeBusy, registry.getAnyBusy, () => false);
}
