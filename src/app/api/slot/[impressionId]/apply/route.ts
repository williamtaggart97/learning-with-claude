// POST /api/slot/[impressionId]/apply → NDJSON conversation → answer_delta… → done (R18).
// See src/lib/slot/handlers.ts.
import { handleSlotApply } from "@/lib/slot/handlers";

/** Covers the streamed answer plus the background assessor run in after() (R12). */
export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<"/api/slot/[impressionId]/apply">) {
  const { impressionId } = await ctx.params;
  return handleSlotApply(request, impressionId);
}
