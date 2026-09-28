import "katex/dist/katex.min.css";
import { AppShell } from "@/components/shell/app-shell";
import { getSessionUser } from "@/lib/session";
import { getCurrentConversations, getCurrentProfile } from "@/lib/ui/data";

/**
 * Chat shell (V1, X8): sidebar + main column + right panel slot. Keyed by
 * the session user so a persona switch / reset (Phase 4, followed by
 * router.refresh()) remounts all client state cleanly.
 */
export default async function ChatLayout({ children }: LayoutProps<"/">) {
  const user = await getSessionUser();
  const [conversations, profile] = await Promise.all([getCurrentConversations(), getCurrentProfile()]);
  return (
    <AppShell key={user.id} conversations={conversations} profile={profile}>
      {children}
    </AppShell>
  );
}
