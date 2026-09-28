// Request guards shared by the chat-cost routes: rate limits (R6), framing
// response validation (R11), and small helpers. Server-only.
import "server-only";
import { RATE_LIMIT, RATE_LIMIT_KEYS } from "@/config";
import { apiError } from "@/lib/api-contract";
import { clientIp, hitRateLimit } from "@/lib/rate-limit";
import type { FramingQuestion, FramingResponse } from "@/lib/types";

/**
 * R6: session → ip → globalDaily, stopping at the first failure so rejected
 * requests don't burn the shared buckets. Returns a 429 Response or null.
 */
export async function enforceChatRateLimits(demoSessionId: string, headers: Headers): Promise<Response | null> {
  const checks = [
    () => hitRateLimit(RATE_LIMIT_KEYS.session(demoSessionId), RATE_LIMIT.session),
    () => hitRateLimit(RATE_LIMIT_KEYS.ip(clientIp(headers)), RATE_LIMIT.ip),
    () => hitRateLimit(RATE_LIMIT_KEYS.globalDaily(), RATE_LIMIT.globalDaily),
  ];
  for (const check of checks) {
    const r = await check();
    if (!r.ok) {
      return apiError(429, "rate_limited", "You're sending messages too quickly — please wait a bit and try again.", {
        retryAfterSeconds: r.retryAfterSeconds,
      });
    }
  }
  return null;
}

/**
 * R9 dig-in detection (pure). A dig_in conversation with no assistant message
 * yet is answered on the dig-in path (no router). Only the true kickoff —
 * zero messages of any role — is exempt from rate limits; a retry after a
 * failed kickoff (user message stored, no answer) is rate-limited as usual.
 */
export function classifyDigIn(input: { origin: string; messageCount: number; assistantCount: number }): {
  digInAnswer: boolean;
  rateLimitExempt: boolean;
} {
  const digInAnswer = input.origin === "dig_in" && input.assistantCount === 0;
  return { digInAnswer, rateLimitExempt: digInAnswer && input.messageCount === 0 };
}

/** Longest accepted short_answer framing response (chars). */
export const MAX_SHORT_ANSWER_CHARS = 2000;

/**
 * R11: validate responses against the STORED questions. Returns an error
 * message, or null when valid.
 */
export function validateFramingResponses(questions: FramingQuestion[], responses: FramingResponse[]): string | null {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const seen = new Set<string>();
  for (const r of responses) {
    const q = byId.get(r.questionId);
    if (!q) return `Unknown question id "${r.questionId}"`;
    if (seen.has(r.questionId)) return `Duplicate response for "${r.questionId}"`;
    seen.add(r.questionId);
    if (r.dontKnow) continue;
    const options = q.options ?? [];
    switch (q.format) {
      case "short_answer":
        if (typeof r.answer !== "string" || !r.answer.trim()) return `"${q.id}" needs a non-empty answer`;
        if (r.answer.length > MAX_SHORT_ANSWER_CHARS) {
          return `"${q.id}" is too long (max ${MAX_SHORT_ANSWER_CHARS} characters)`;
        }
        break;
      case "multiple_choice":
        if (typeof r.answer !== "string" || !options.includes(r.answer)) return `"${q.id}" must be one of the options`;
        break;
      case "multi_select": {
        const a = r.answer;
        if (!Array.isArray(a) || a.length === 0) return `"${q.id}" needs at least one selected option`;
        if (new Set(a).size !== a.length) return `"${q.id}" has duplicate selections`;
        if (!a.every((x) => options.includes(x))) return `"${q.id}" selections must be options`;
        break;
      }
    }
  }
  if (seen.size !== questions.length) return "Exactly one response per question is required";
  return null;
}

/** New conversation title: first message trimmed to ~60 chars at a word boundary. */
export function titleFromMessage(message: string, max = 60): string {
  const flat = message.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat || "New chat";
  const cut = flat.slice(0, max + 1);
  const lastSpace = cut.lastIndexOf(" ");
  const base = (lastSpace >= max * 0.5 ? cut.slice(0, lastSpace) : flat.slice(0, max)).replace(/[\s,.;:!?-]+$/, "");
  return `${base}…`;
}
