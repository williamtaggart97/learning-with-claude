// Code-level framing rules applied to the router's result before the chat
// pipeline acts on it (L4, L5, L8, L9). Pure — no DB or model calls — so it
// can be unit-tested offline. The router prompt states the same rules; this is
// the enforcement layer.
import type { LearnLaterCallout, RouterResult } from "@/lib/types";

// ─── Message heuristics ─────────────────────────────────────────────────────

const WEEKDAY = String.raw`(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)`;
const WEEKDAY_FULL = String.raw`(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)`;
const SMALL_COUNT = String.raw`(?:\d+|an?|one|two|three|four|five|a\s+few|a\s+couple(?:\s+of)?)`;
/** Unambiguous deadline times: fine after a bare "by"/"before". */
const HARD_TIME = String.raw`(?:tomorrow|tonight|today|noon|midnight|\d{1,2}(?::\d{2})?\s*(?:am|pm))`;
/** Time words that also appear in data phrasing ("ridership by morning", "admissions by Saturday"). */
const SOFT_TIME = String.raw`(?:(?:the\s+)?(?:${WEEKDAY_FULL}|weekend|morning|afternoon|evening)|(?:the\s+)?end\s+of\s+(?:the\s+)?(?:day|week|month))`;
/** Verbs that turn a soft "by <time>" into a deadline ("need it by Friday", "done by end of day"). */
const NEED_VERB = String.raw`(?:need(?:s|ed)?|due|submit(?:ted|ting)?|finish(?:ed)?|send|sent|done|ready|complete(?:d)?|turn(?:ed)?\s+in|hand(?:ed)?\s+in|have\s+to|has\s+to|must)`;
const EVENT_NOUN = String.raw`(?:meeting|defen[cs]e|presentation|deadline)`;
const DAY_WORD = String.raw`(?:tomorrow|today|tonight)`;

/**
 * Deadline language (L4: a message that mentions a deadline is never framed).
 * A false positive only costs the framing questions, but data phrasing ("by
 * morning", "due to", "until today") must not trip it.
 */
const DEADLINE_RE = new RegExp(
  [
    String.raw`\bdead ?lines?\b`,
    String.raw`\b(?:asap|eod|eow|cob)\b`,
    String.raw`\b(?:short\s+on\s+time|running\s+out\s+of\s+time|pressed\s+for\s+time|in\s+a\s+(?:rush|hurry)|time\s+crunch|crunch\s+time)\b`,
    // due Friday / due Fri / due tomorrow / due this week / due by … / due 10/3
    String.raw`\bdue\s+(?:${WEEKDAY}|tomorrow|tonight|today|this\s+\w+|next\s+\w+|by|before)\b`,
    String.raw`\bdue\s+\d{1,2}[/.-]\d{1,2}\b`,
    String.raw`\bdue\s+in\s+${SMALL_COUNT}\s+(?:hours?|hrs?|days?|weeks?|minutes?|mins?)\b`,
    String.raw`\bdue\s+on\s+(?:${WEEKDAY}\b|the\s+\d|\d)`,
    String.raw`\bdue\s+at\s+\d`,
    // by/before tomorrow, tonight, 5pm …
    String.raw`\b(?:by|before)\s+${HARD_TIME}\b`,
    // by this Friday / by next week
    String.raw`\b(?:by|before)\s+(?:this|next)\s+(?:${WEEKDAY_FULL}|week(?:end)?|month|morning|afternoon|evening)\b`,
    // need it by Friday / done by end of day (verb within a few words)
    String.raw`\b${NEED_VERB}(?:\s+[\w']+){0,3}?\s+(?:by|before)\s+${SOFT_TIME}\b`,
    // defense is in 2 days / need it in 3 hours
    String.raw`\b(?:is|are|['’]s|due|needs?\s+\w+|have\s+to\s+\w+|has\s+to\s+\w+)\s+in\s+${SMALL_COUNT}\s+(?:hours?|hrs?|days?)\b`,
    // committee meeting tomorrow / tomorrow's defense
    String.raw`\b${EVENT_NOUN}s?\b[^.?!\n]{0,30}?\b${DAY_WORD}\b`,
    String.raw`\b${DAY_WORD}['’]s\s+(?:\w+\s+)?${EVENT_NOUN}\b`,
  ].join("|"),
  "i",
);

export function mentionsDeadline(message: string): boolean {
  return DEADLINE_RE.test(message);
}

/**
 * The message asks Claude to produce something (code, prose, a fix, data
 * work). Used only to pick task vs direct/lookup when a concept result can't
 * be framed — the router's own classification comes first.
 */
const DELIVERABLE_RE = new RegExp(
  [
    // Imperative or polite request: "write…", "can you draft…", "help me fix…"
    String.raw`(?:^|[.!?]\s+|\b(?:can|could|would|will)\s+you\s+|\bplease\s+|\bhelp\s+me\s+(?:to\s+)?|\bi\s+need\s+(?:you\s+)?to\s+)(?:write|draft|rewrite|edit|proofread|code|implement|fix|debug|refactor|translate|convert|port|reshape|clean|recode|merge|plot|generate|create|make|build|produce|summari[sz]e)\b`,
    // "I need a function/paragraph/email …"
    String.raw`\bi\s+need\s+(?:a|an|the|some)\s+(?:\w+\s+)?(?:function|script|code|snippet|query|plot|figure|paragraph|sentence|email|abstract|draft|summary|response|reply|table)\b`,
  ].join("|"),
  "i",
);

export function asksForDeliverable(message: string): boolean {
  return DELIVERABLE_RE.test(message.trim());
}

// ─── Framing policy ─────────────────────────────────────────────────────────

/** How an immediate (non-framed) answer is written. See MODE_INSTRUCTIONS. */
export type ImmediateAnswerMode = "lookup" | "task" | "direct";

export type FramingDowngrade = "deadline" | "already_framed";

/** An earlier FramingExchange in this conversation that shares a concept. */
export interface EarlierExchange {
  conceptSlugs: string[];
  status: string;
}

export interface RoutePlan {
  route: RouterResult;
  /** null only when the route is still a framed concept. */
  answerMode: ImmediateAnswerMode | null;
  downgraded: FramingDowngrade | null;
  /** Concept slugs that triggered the downgrade (for logs). */
  matchedSlugs: string[];
  /** The ONE Learn It Later item to persist and stream (L5). Empty for concept. */
  persist: LearnLaterCallout[];
}

/**
 * Decide how the router's result is handled (the chat pipeline's single
 * entry point for policy — exported so the wiring is testable):
 * - Non-concept results pass through: lookup → "lookup" mode, task → "task".
 * - Concept + deadline (L4, checked first) → answered now. If the message
 *   asks for a deliverable it's a task; otherwise "direct" mode: a concise,
 *   complete concept answer (the route stays lookup-shaped). The skipCallout
 *   is the saved item.
 * - Concept sharing a slug with an earlier exchange in this conversation (L9,
 *   framing once per topic) → lookup. If any matching exchange was answered
 *   the user just worked through it, so nothing is re-queued; otherwise the
 *   skipCallout is the saved item.
 */
export function planRoute(
  route: RouterResult,
  ctx: { message: string; earlier: EarlierExchange[] },
): RoutePlan {
  if (route.kind !== "concept") {
    return { route, answerMode: route.kind, downgraded: null, matchedSlugs: [], persist: featuredCallouts(route) };
  }

  if (mentionsDeadline(ctx.message)) {
    const rationale = `${route.rationale} [downgraded: deadline]`;
    const callouts = [route.skipCallout];
    const next: RouterResult = asksForDeliverable(ctx.message)
      ? { kind: "task", conceptSlugs: route.conceptSlugs, rationale, callouts, whyCallout: null }
      : { kind: "lookup", conceptSlugs: route.conceptSlugs, rationale, callouts };
    return {
      route: next,
      answerMode: next.kind === "task" ? "task" : "direct",
      downgraded: "deadline",
      matchedSlugs: route.conceptSlugs,
      persist: featuredCallouts(next),
    };
  }

  const slugs = new Set(route.conceptSlugs);
  const matching = ctx.earlier.filter((e) => e.conceptSlugs.some((s) => slugs.has(s)));
  if (matching.length) {
    const matchedSlugs = [...new Set(matching.flatMap((e) => e.conceptSlugs).filter((s) => slugs.has(s)))];
    const answered = matching.some((e) => e.status === "answered");
    const next: RouterResult = {
      kind: "lookup",
      conceptSlugs: route.conceptSlugs,
      rationale: `${route.rationale} [downgraded: already framed${answered ? ", answered" : ""}]`,
      callouts: answered ? [] : [route.skipCallout],
    };
    return { route: next, answerMode: "lookup", downgraded: "already_framed", matchedSlugs, persist: featuredCallouts(next) };
  }

  return { route, answerMode: null, downgraded: null, matchedSlugs: [], persist: [] };
}

/**
 * L5 (until the E1–E5 slot experiment): an immediate answer saves ONE Learn It
 * Later item — the task's whyCallout if present, else the top-ranked callout.
 * The full ranked list stays on the router result for the later slot phase.
 */
export function featuredCallouts(route: RouterResult): LearnLaterCallout[] {
  if (route.kind === "concept") return [];
  const featured = (route.kind === "task" ? route.whyCallout : null) ?? route.callouts?.[0];
  return featured ? [featured] : [];
}
