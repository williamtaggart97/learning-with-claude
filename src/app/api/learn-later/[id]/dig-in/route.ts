import type { NextRequest } from "next/server";
import { apiError } from "@/lib/api-contract";
import { startDigIn } from "@/lib/dig-in";
import { withErrors } from "@/lib/http";
import { getSessionUser } from "@/lib/session";

/** POST /api/learn-later/[id]/dig-in → DigInResponse (404 if not owned). */
export const POST = withErrors(async (_req: NextRequest, ctx: RouteContext<"/api/learn-later/[id]/dig-in">) => {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  const result = await startDigIn(user.id, id);
  if (!result) return apiError(404, "not_found", "Learn It Later item not found");
  return Response.json(result);
});
