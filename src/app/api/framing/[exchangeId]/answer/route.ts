// POST /api/framing/[exchangeId]/answer → NDJSON ChatStreamEvent (R10, R11).
// See src/lib/pipeline/framing.ts.
import { handleFramingAnswer } from "@/lib/pipeline/framing";

/** Covers the streamed answer plus the background assessor run in after() (R12). */
export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<"/api/framing/[exchangeId]/answer">) {
  const { exchangeId } = await ctx.params;
  return handleFramingAnswer(request, exchangeId);
}
