// POST /api/chat → NDJSON ChatStreamEvent (R8, R9). See src/lib/pipeline/chat.ts.
import { handleChat } from "@/lib/pipeline/chat";

/** Covers the streamed answer plus the background assessor run in after() (R12). */
export const maxDuration = 300;

export async function POST(request: Request) {
  return handleChat(request);
}
