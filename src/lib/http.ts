// Small route-handler helpers (R2). Server-only.
import "server-only";
import type { z } from "zod";
import { apiError } from "@/lib/api-contract";

/** Wrap a route handler so unexpected errors become a logged 500 ApiError. */
export function withErrors<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      console.error(err);
      return apiError(500, "internal", "Something went wrong");
    }
  };
}

/** Parse + zod-validate a JSON body. Returns the data, or a 400 Response. */
export async function parseJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: Response }> {
  const body = await request.json().catch(() => undefined);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.length ? issue.path.map(String).join(".") : "";
    const msg = issue ? (path ? `${path}: ${issue.message}` : issue.message) : "Invalid request body";
    return { ok: false, response: apiError(400, "bad_request", msg) };
  }
  return { ok: true, data: parsed.data };
}
