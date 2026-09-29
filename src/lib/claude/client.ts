// Anthropic SDK wrapper for the pipeline (A1–A3). Server-only.
// Model IDs always come from MODELS in src/config.ts (A4).
import "server-only";
import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

/** Lazy singleton so importing this module at build time never needs the key. */
export function getAnthropic(): Anthropic {
  if (!client) client = new Anthropic({ maxRetries: 2 });
  return client;
}

export class ClaudeOutputError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ClaudeOutputError";
  }
}

export interface StructuredCallOptions<T> {
  model: string;
  system: string;
  messages: Anthropic.MessageParam[];
  /** JSON Schema sent as output_config.format (structured outputs). */
  jsonSchema: Record<string, unknown>;
  /** Validate + normalize the parsed JSON; throw to reject. */
  parse: (raw: unknown) => T;
  maxTokens: number;
  signal?: AbortSignal;
  /** For logs. */
  label: string;
  /** Extra attempts when the output fails validation (not API errors — the SDK retries those). */
  validationRetries?: number;
}

/**
 * One structured-output call (JSON schema constrained decoding), parsed and
 * validated by `parse`. Retries once when the model's JSON fails validation
 * (e.g. a zod refinement the JSON schema can't express). A max_tokens stop is
 * not retried identically: it gets one retry with 2× max_tokens, then throws.
 */
export async function callStructured<T>(opts: StructuredCallOptions<T>): Promise<T> {
  let validationAttemptsLeft = 1 + (opts.validationRetries ?? 1);
  let maxTokens = opts.maxTokens;
  let grewForTruncation = false;
  let lastError: unknown;
  while (validationAttemptsLeft > 0) {
    const response = await getAnthropic().messages.create(
      {
        model: opts.model,
        max_tokens: maxTokens,
        // Static per-label system prompts: cache them. Below the model's
        // minimum cacheable length (4096 tokens on Haiku 4.5) this is a no-op.
        system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
        messages: opts.messages,
        output_config: { format: { type: "json_schema", schema: opts.jsonSchema } },
      },
      { signal: opts.signal },
    );
    if (response.stop_reason === "refusal") throw new ClaudeOutputError(`${opts.label}: model refused`);
    if (response.stop_reason === "max_tokens") {
      if (grewForTruncation) throw new ClaudeOutputError(`${opts.label}: output truncated (max_tokens=${maxTokens})`);
      console.warn(`[claude] ${opts.label}: truncated at max_tokens=${maxTokens}; retrying once with ${maxTokens * 2}`);
      grewForTruncation = true;
      maxTokens *= 2;
      continue;
    }
    validationAttemptsLeft--;
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    try {
      return opts.parse(JSON.parse(text));
    } catch (err) {
      lastError = err;
      console.warn(`[claude] ${opts.label}: invalid structured output (${validationAttemptsLeft} attempt(s) left)`, err);
    }
  }
  throw new ClaudeOutputError(`${opts.label}: no valid output`, { cause: lastError });
}

export interface StreamTextOptions {
  model: string;
  system: string;
  messages: Anthropic.MessageParam[];
  /** Covers thinking AND the visible answer (thinking tokens count toward max_tokens). */
  maxTokens: number;
  effort?: "low" | "medium" | "high";
  /** Aborts the upstream request (e.g. client disconnect). */
  signal?: AbortSignal;
}

/** Appended (streamed and therefore persisted) when the answer hits max_tokens. */
export const TRUNCATION_NOTE = "\n\n_(Answer truncated.)_";

/**
 * Stream text deltas. Returning early from the consumer (generator return())
 * aborts the upstream Claude request in `finally` (R3).
 *
 * Thinking is set explicitly to adaptive (the Sonnet 5 default; display
 * defaults to "omitted", so no thinking text is streamed — only text_delta
 * events are forwarded). Thinking tokens count toward max_tokens, so callers
 * size maxTokens with headroom. If the answer is cut off anyway, a short note
 * is yielded so the user (and the persisted message) can tell.
 */
export async function* streamText(opts: StreamTextOptions): AsyncGenerator<string, void, undefined> {
  const stream = getAnthropic().messages.stream(
    {
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages: opts.messages,
      thinking: { type: "adaptive" },
      ...(opts.effort ? { output_config: { effort: opts.effort } } : {}),
    },
    { signal: opts.signal },
  );
  let finished = false;
  try {
    let sawText = false;
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta" && event.delta.text) {
        sawText = true;
        yield event.delta.text;
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") throw new ClaudeOutputError("answer: model refused");
    if (final.stop_reason === "max_tokens") {
      console.warn(`[claude] answer truncated at max_tokens=${opts.maxTokens}`);
      // With no visible text at all, let the caller's empty-answer error fire instead.
      if (sawText) yield TRUNCATION_NOTE;
    }
    finished = true;
  } finally {
    if (!finished && !stream.aborted) stream.abort();
  }
}
