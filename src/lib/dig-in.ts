// "Dig in" on a Learn It Later item (Q3/Q4). Server-only.
// Creates the dig-in Conversation and marks the item dug_in; the UI then
// sends `kickoffMessage` to POST /api/chat, which detects the dig-in
// server-side and answers without the router or rate limit (R9).
import "server-only";
import { db } from "@/lib/db";
import type { DigInResponse } from "@/lib/api-contract";

/** Natural, user-voiced first message for a dig-in chat. */
export function buildDigInKickoff(title: string, sourceConversationTitle: string | null): string {
  const where = sourceConversationTitle ? ` in our "${sourceConversationTitle}" chat` : "";
  // Quoted so question-form titles read naturally; a title ending in ? or !
  // closes the sentence itself:  Let's dig into "Why |SMD| < 0.1?" Start with…
  const t = title.trim().replace(/\.+$/, "");
  const lead = /[?!]$/.test(t) ? `Let's dig into "${t}"` : `Let's dig into "${t}".`;
  return `${lead} Start with how it applied when it came up${where}, then show me where else I'd use it in my own work.`;
}

/** Returns null when the item doesn't exist or isn't owned by `userId` (→ 404). */
export async function startDigIn(userId: string, itemId: string): Promise<DigInResponse | null> {
  const item = await db.learnLaterItem.findFirst({
    where: { id: itemId, userId },
    select: { id: true, title: true, status: true, sourceConversation: { select: { title: true } } },
  });
  if (!item) return null;
  const kickoffMessage = buildDigInKickoff(item.title, item.sourceConversation?.title ?? null);

  // Idempotent: a double-click / retry before the kickoff was sent reuses the
  // untouched dig-in conversation instead of creating a second one.
  const unused = await db.conversation.findFirst({
    where: { userId, learnLaterItemId: item.id, origin: "dig_in", messages: { none: {} } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (unused) {
    if (item.status !== "dug_in") {
      await db.learnLaterItem.update({ where: { id: item.id }, data: { status: "dug_in" } });
    }
    return { conversationId: unused.id, kickoffMessage };
  }

  const [conversation] = await db.$transaction([
    db.conversation.create({
      data: { userId, title: item.title, origin: "dig_in", learnLaterItemId: item.id },
      select: { id: true },
    }),
    db.learnLaterItem.update({ where: { id: item.id }, data: { status: "dug_in" } }),
  ]);
  return { conversationId: conversation.id, kickoffMessage };
}
