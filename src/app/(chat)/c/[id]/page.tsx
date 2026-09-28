import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConversationView } from "@/components/chat/chat-view";
import { getSessionUser } from "@/lib/session";
import { getCurrentConversation } from "@/lib/ui/data";
import { getPendingKickoff } from "@/lib/ui/kickoff";

export async function generateMetadata({ params }: PageProps<"/c/[id]">): Promise<Metadata> {
  const { id } = await params;
  const conversation = await getCurrentConversation(id);
  return { title: conversation ? `${conversation.title} · Learning mode` : "Learning mode" };
}

/** `/c/[id]` — an existing conversation (404 when missing or not owned). */
export default async function ConversationPage({ params }: PageProps<"/c/[id]">) {
  const { id } = await params;
  const conversation = await getCurrentConversation(id);
  if (!conversation) notFound();
  const user = await getSessionUser();
  const kickoffMessage = await getPendingKickoff(user.id, conversation);
  return <ConversationView key={conversation.id} initial={conversation} kickoffMessage={kickoffMessage} />;
}
