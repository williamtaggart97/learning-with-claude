// Dig-in kickoff for the conversation page (R9, Q4). Server-only.
//
// Handoff strategy: instead of passing the kickoff message through the URL or
// sessionStorage, the /c/[id] page derives it server-side for a dig-in
// conversation that has no messages yet, using the same builder the dig-in
// route uses (buildDigInKickoff). The client auto-sends it once. This is
// refresh-safe (after the send the conversation has messages → no kickoff)
// and works when the link is opened in a new tab.
import "server-only";
import { db } from "@/lib/db";
import { buildDigInKickoff } from "@/lib/dig-in";
import type { ConversationDTO } from "@/lib/types";

export async function getPendingKickoff(userId: string, conversation: ConversationDTO): Promise<string | null> {
  if (conversation.origin !== "dig_in" || conversation.messages.length > 0 || !conversation.learnLaterItemId) {
    return null;
  }
  const item = await db.learnLaterItem.findFirst({
    where: { id: conversation.learnLaterItemId, userId },
    select: { title: true, sourceConversation: { select: { title: true } } },
  });
  if (!item) return null;
  return buildDigInKickoff(item.title, item.sourceConversation?.title ?? null);
}
