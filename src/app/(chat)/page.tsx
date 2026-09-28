import { NewChatView } from "@/components/chat/chat-view";
import { starterPromptsFor } from "@/components/chat/starter-prompts";
import { getCurrentProfile } from "@/lib/ui/data";

/** `/` — a new chat: greeting, composer and starter prompts (D2). */
export default async function NewChatPage() {
  const profile = await getCurrentProfile();
  return <NewChatView starters={starterPromptsFor(profile.userContext)} greetingName={profile.persona.displayName} />;
}
