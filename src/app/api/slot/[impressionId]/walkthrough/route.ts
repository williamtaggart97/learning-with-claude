// POST /api/slot/[impressionId]/walkthrough → NDJSON conversation → framing (R16).
// See src/lib/slot/handlers.ts.
import { handleSlotWalkthrough } from "@/lib/slot/handlers";

export const maxDuration = 60;

export async function POST(request: Request, ctx: RouteContext<"/api/slot/[impressionId]/walkthrough">) {
  const { impressionId } = await ctx.params;
  return handleSlotWalkthrough(request, impressionId);
}
