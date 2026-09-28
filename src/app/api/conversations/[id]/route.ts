import type { NextRequest } from "next/server";
import { apiError } from "@/lib/api-contract";
import { getConversationDTO } from "@/lib/dto";
import { withErrors } from "@/lib/http";
import { getSessionUser } from "@/lib/session";

/** GET /api/conversations/[id] — ConversationDTO (404 if not owned). */
export const GET = withErrors(async (_req: NextRequest, ctx: RouteContext<"/api/conversations/[id]">) => {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  const dto = await getConversationDTO(user.id, id);
  if (!dto) return apiError(404, "not_found", "Conversation not found");
  return Response.json(dto);
});
