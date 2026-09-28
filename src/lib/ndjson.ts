// NDJSON streaming helpers. One JSON object per line, "\n"-terminated.
//   Client: readNdjson(response)  → async iterator of parsed events
//   Server: ndjsonResponse(gen)   → Response streaming an async iterable
// Safe to import from client components (no server-only deps).

/**
 * Parse an NDJSON response body. Throws NdjsonHttpError if the response is
 * not ok. Cancels the underlying body when the caller stops iterating early
 * (break/return/throw) or when `signal` aborts, so the server sees the
 * disconnect.
 */
export async function* readNdjson<T>(response: Response, signal?: AbortSignal): AsyncGenerator<T> {
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* not JSON */
    }
    throw new NdjsonHttpError(response.status, message);
  }
  if (!response.body) return;

  const reader = response.body.getReader();
  const onAbort = () => void reader.cancel().catch(() => {});
  signal?.addEventListener("abort", onAbort, { once: true });
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  try {
    while (!signal?.aborted) {
      const { value, done } = await reader.read();
      if (done) {
        finished = !signal?.aborted;
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) yield JSON.parse(line) as T;
      }
    }
    if (finished) {
      buffer += decoder.decode();
      if (buffer.trim()) yield JSON.parse(buffer) as T;
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    // No-op if the stream already ended; otherwise tells the server to stop.
    if (!finished) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export class NdjsonHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "NdjsonHttpError";
  }
}

/**
 * Throw this from a stream generator when the message is safe to show the
 * user; it is sent verbatim as the terminal `error` event. Any other thrown
 * error is logged server-side and replaced with a generic message.
 */
export class PublicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicError";
  }
}

export const GENERIC_STREAM_ERROR = "Something went wrong";

/**
 * Server: stream an async iterable of events as an NDJSON Response.
 * Pull-based: the iterable is advanced only when the client is ready for
 * more, and a client disconnect calls `iterator.return()` so the generator's
 * `finally` blocks run (abort upstream Claude calls there).
 */
export function ndjsonResponse<T>(events: AsyncIterable<T>, init?: ResponseInit): Response {
  const encoder = new TextEncoder();
  const iterator = events[Symbol.asyncIterator]();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const enqueue = (value: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
        } catch {
          closed = true; // controller already closed/errored
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      try {
        const { value, done } = await iterator.next();
        if (done) return close();
        enqueue(value);
      } catch (err) {
        if (err instanceof PublicError) {
          enqueue({ type: "error", message: err.message });
        } else {
          console.error("[ndjson] stream failed:", err);
          enqueue({ type: "error", message: GENERIC_STREAM_ERROR });
        }
        close();
      }
    },
    async cancel() {
      closed = true;
      try {
        await iterator.return?.();
      } catch (err) {
        console.error("[ndjson] iterator.return failed:", err);
      }
    },
  });

  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/x-ndjson; charset=utf-8");
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-cache, no-transform");
  return new Response(stream, { ...init, headers });
}
