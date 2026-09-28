// Browser-side API helpers (R2). Client-safe: no server-only imports.
import type { ApiError, ApiErrorCode } from "@/lib/api-contract";

/** A non-2xx JSON response (R2), or a network failure (status 0). */
export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode | "network",
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/** Parse an error Response into an ApiRequestError (never throws itself). */
export async function toApiRequestError(response: Response): Promise<ApiRequestError> {
  let body: Partial<ApiError> | null = null;
  try {
    body = (await response.json()) as Partial<ApiError>;
  } catch {
    /* not JSON */
  }
  const headerRetry = Number.parseInt(response.headers.get("Retry-After") ?? "", 10);
  const retryAfterSeconds = body?.retryAfterSeconds ?? (Number.isFinite(headerRetry) ? headerRetry : undefined);
  return new ApiRequestError(
    response.status,
    body?.code ?? "internal",
    body?.error ?? `Request failed (${response.status})`,
    retryAfterSeconds,
  );
}

/** JSON request; throws ApiRequestError on non-2xx or network failure. */
export async function apiJson<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...rest.headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiRequestError(0, "network", "Couldn't reach the server");
  }
  if (!response.ok) throw await toApiRequestError(response);
  return (await response.json()) as T;
}

/** POST a JSON body and return the raw Response (for NDJSON streams). */
export async function postForStream(url: string, body: unknown, signal: AbortSignal): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiRequestError(0, "network", "Couldn't reach the server");
  }
  if (!response.ok) throw await toApiRequestError(response);
  return response;
}

export function isAbortError(err: unknown): boolean {
  return (err instanceof DOMException || err instanceof Error) && err.name === "AbortError";
}

/** Friendly, display-ready copy for an error (inline notices). */
export function friendlyError(err: unknown): string {
  if (err instanceof ApiRequestError) {
    switch (err.code) {
      case "rate_limited": {
        const minutes = Math.max(1, Math.ceil((err.retryAfterSeconds ?? 60) / 60));
        return `You've hit the demo's rate limit — try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
      }
      case "network":
        return "Couldn't reach the server. Check your connection and try again.";
      case "not_found":
        return "That conversation couldn't be found — it may have been reset.";
      case "unauthorized":
        return "Your passcode session expired. Reload the page to enter it again.";
      case "conflict":
        return "This was already handled — showing the latest.";
      case "bad_request":
        return err.message || "That request wasn't quite right. Please try again.";
      default:
        return "Something went wrong on our side. Please try again.";
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong. Please try again.";
}
