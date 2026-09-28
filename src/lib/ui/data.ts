// Per-request memoized loaders for the chat UI's server components, so the
// layout, pages and generateMetadata share one query each. Server-only.
import "server-only";
import { cache } from "react";
import { getConversationDTO, listConversationSummaries } from "@/lib/dto";
import { getProfile } from "@/lib/profile";
import { getSessionUser } from "@/lib/session";

export const getCurrentProfile = cache(async () => getProfile(await getSessionUser()));

export const getCurrentConversations = cache(async () => listConversationSummaries((await getSessionUser()).id));

export const getCurrentConversation = cache(async (id: string) => getConversationDTO((await getSessionUser()).id, id));
