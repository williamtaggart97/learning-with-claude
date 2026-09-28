import type { ConversationsResponse } from "@/lib/api-contract";
import { listConversationSummaries } from "@/lib/dto";
import { withErrors } from "@/lib/http";
import { getSessionUser } from "@/lib/session";

/** GET /api/conversations — sidebar list, newest first. */
export const GET = withErrors(async () => {
  const user = await getSessionUser();
  const body: ConversationsResponse = { conversations: await listConversationSummaries(user.id) };
  return Response.json(body);
});
