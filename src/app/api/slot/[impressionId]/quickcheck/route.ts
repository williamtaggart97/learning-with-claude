// POST /api/slot/[impressionId]/quickcheck → QuickCheckAnswerResponse (R17).
// See src/lib/slot/handlers.ts.
import { handleSlotQuickcheck } from "@/lib/slot/handlers";

export async function POST(request: Request, ctx: RouteContext<"/api/slot/[impressionId]/quickcheck">) {
  const { impressionId } = await ctx.params;
  return handleSlotQuickcheck(request, impressionId);
}
