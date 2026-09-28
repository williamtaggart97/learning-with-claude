// POST /api/slot/[impressionId]/dig-in → DigInResponse (R15). See src/lib/slot/handlers.ts.
import { handleSlotDigIn } from "@/lib/slot/handlers";

export async function POST(_request: Request, ctx: RouteContext<"/api/slot/[impressionId]/dig-in">) {
  const { impressionId } = await ctx.params;
  return handleSlotDigIn(impressionId);
}
