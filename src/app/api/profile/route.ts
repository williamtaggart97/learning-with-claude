import { apiError } from "@/lib/api-contract";
import { parseJsonBody, withErrors } from "@/lib/http";
import { getProfile, patchProfile, TierLockedError } from "@/lib/profile";
import { ProfilePatchSchema } from "@/lib/schemas";
import { getSessionUser } from "@/lib/session";

/** GET /api/profile — full ProfileDTO; the UI gates by tier. */
export const GET = withErrors(async () => {
  const user = await getSessionUser();
  return Response.json(await getProfile(user));
});

/** PATCH /api/profile — Tier 2 only (403 tier_locked otherwise). */
export const PATCH = withErrors(async (request: Request) => {
  const body = await parseJsonBody(request, ProfilePatchSchema);
  if (!body.ok) return body.response;
  const user = await getSessionUser();
  try {
    return Response.json(await patchProfile(user, body.data));
  } catch (err) {
    if (err instanceof TierLockedError) return apiError(403, "tier_locked", err.message);
    throw err;
  }
});
