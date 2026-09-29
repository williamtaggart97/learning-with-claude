// Code-level framing rules applied to the router's result before the chat
// pipeline acts on it (L4, L5, L8, L9). Pure — no DB or model calls — so it
// can be unit-tested offline. The router prompt states the same rules; this is
// the enforcement layer.
import { FRAMING } from "@/config";
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
/** Events that are almost always a deadline when paired with a day word, even "today". */
const EVENT_NOUN = String.raw`(?:meeting|defen[cs]e|presentation|deadline|interview)`;
/**
 * Events that also appear in data or concept phrasing ("sales after the launch
 * today", "the exam results came back today"): a deadline only with an
 * upcoming time (tomorrow / tonight / in N hours) or a copula ("my exam is on
 * Friday").
 */
const SOON_EVENT_NOUN = String.raw`(?:exams?|pitch(?:es)?|demos?|launch(?:es)?|quiz(?:zes)?|midterms?|finals)`;
/** Copula-only events ("my final is tomorrow", but not "the final model tomorrow"). */
const COPULA_EVENT_NOUN = String.raw`(?:${SOON_EVENT_NOUN}|${EVENT_NOUN}s?|final)`;
const DAY_WORD = String.raw`(?:tomorrow|today|tonight)`;
/** Unambiguously upcoming: tomorrow, tonight, in N hours. */
const SOON = String.raw`(?:tomorrow|tonight|in\s+${SMALL_COUNT}\s+(?:hours?|hrs?))`;
/** When a named thing is scheduled: a day word, a weekday, or in N hours/days. */
const WHEN = String.raw`(?:${DAY_WORD}|in\s+${SMALL_COUNT}\s+(?:hours?|hrs?|days?)|(?:on\s+|this\s+|next\s+)?${WEEKDAY_FULL})`;
/** A definite subject ("we", "the landing page", "our campaign") — not "an ad". */
const SUBJECT = String.raw`(?:we|they|it|(?:my|our|the|this|your)(?:\s+[\w-]+){1,3}?)`;
const GO_OUT = String.raw`(?:go(?:es|ing)?\s+(?:out|live)|launch(?:es|ing)?)`;

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
    // client pitch tomorrow / quiz tomorrow / demo in 2 hours (never with "today")
    String.raw`\b${SOON_EVENT_NOUN}\b[^.?!\n]{0,30}?\b${SOON}\b`,
    String.raw`\b(?:tomorrow|tonight)['’]s\s+(?:\w+\s+)?(?:${SOON_EVENT_NOUN}|final)\b`,
    // my exam is on Friday / the pitch is on Thursday / my final is tomorrow
    String.raw`\b(?:my|our|the)\s+(?:[\w-]+\s+)?${COPULA_EVENT_NOUN}\s+(?:is|are|['’]s)\s+${WHEN}\b`,
    // the campaign goes out tomorrow / the landing page is going live on Friday / we go live tomorrow
    String.raw`\b${SUBJECT}(?:\s+(?:is|are)|['’](?:s|re))?\s+${GO_OUT}\s+${WHEN}\b`,
    // campaign launches tomorrow / goes out in 2 hours (no subject needed when it's that soon)
    String.raw`\b${GO_OUT}\s+${SOON}\b`,
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
    String.raw`(?:^|[.!?]\s+|\b(?:can|could|would|will)\s+you\s+|\bplease\s+|\bhelp\s+me\s+(?:to\s+)?|\bi\s+need\s+(?:you\s+)?to\s+)(?:write|draft|rewrite|edit|proofread|polish|shorten|outline|code|implement|fix|debug|refactor|translate|convert|port|reshape|clean|recode|merge|plot|generate|create|make|build|produce|summari[sz]e)\b`,
    // "I need a function/paragraph/email/subject line …"
    String.raw`\bi\s+need\s+(?:a|an|the|some)\s+(?:\w+\s+)?(?:function|script|code|snippet|query|plot|figure|chart|paragraph|sentence|email|abstract|draft|summary|response|reply|table|subject\s+lines?|headlines?|post|caption|slide|deck|memo|report|(?:creative|campaign)\s+brief|outline)\b`,
    // "I need a formula that/to …" (not "the formula for X", which is a lookup)
    String.raw`\bi\s+need\s+(?:a|an)\s+(?:\w+\s+)?formula\s+(?:that|to|which)\b`,
  ].join("|"),
  "i",
);

export function asksForDeliverable(message: string): boolean {
  return DELIVERABLE_RE.test(message.trim());
}

/**
 * The message reports a problem with the user's OWN work: an error, warning,
 * failure, or a result that looks wrong. A task's whyCallout ("why this
 * happened", L8) only makes sense then; a plain request to write code or prose
 * (e.g. an email to an advisor) never gets one, even if the router attached
 * a card to it. Broad on purpose: a false positive keeps a router-chosen card,
 * a false negative drops a real learning moment.
 */
const PROBLEM_RE = new RegExp(
  [
    // errors, warnings, failures
    String.raw`\b(?:errors?|exceptions?|traceback|stack\s*trace|warnings?|fails?|failed|failing|failure|crash(?:es|ed|ing)?|bugs?|buggy|broke|broken|breaks)\b`,
    String.raw`\b(?:does\s*not|doesn['’]?t|do\s+not|don['’]?t|did\s+not|didn['’]?t|is\s+not|isn['’]?t|are\s+not|aren['’]?t|won['’]?t|can['’]?t|cannot|never)\s+(?:work|run|converge|fit|compile|match|load|finish|add\s+up|line\s+up|tie\s+out|reconcile|send|deliver|track|show\s+up)\b`,
    String.raw`\b(?:not|\w+n['’]t)\s+(?:working|converging|running|matching|fitting|adding\s+up|lining\s+up|sending|delivering|tracking|showing\s+up)\b`,
    // numbers that disagree across tools/reports ("GA4 and Meta show different numbers")
    String.raw`\b(?:discrepanc(?:y|ies)|mismatch(?:es|ed)?)\b`,
    // something looks wrong
    String.raw`\b(?:wrong|weird|strange|odd|unexpected(?:ly)?|surprising(?:ly)?|suspicious(?:ly)?|incorrect|impossible|nonsensical|garbage)\b`,
    String.raw`\btoo\s+(?:good|high|low|big|small|large|perfect)\b`,
    String.raw`\b(?:huge|enormous|massive|tiny|infinite|exploding|exploded)\s+(?:standard\s+errors?|ses?|coefficients?|estimates?|variance|values?|loss|gradients?|odds\s+ratios?)\b`,
    // NaN / Inf showing up in output ("NaN in my output", "getting NaNs")
    String.raw`\b(?:nans?|inf)\b`,
    // Failure modes, only in failure/verb forms. Bare topic nouns (leakage,
    // separation, multicollinearity, convergence, null values) are NOT here:
    // "write a convergence check" or "handle null values" is a plain request.
    String.raw`\b(?:singular(?:ity)?|diverg(?:ent|ence|ences|es|ing)|overfit(?:s|ted|ting)?|flipped|flips|reversed|drops?\s+(?:to|when|on)|tank(?:s|ed)?|falls?\s+apart)\b`,
    // a metric that moved sharply ("my open rate dropped", "CPC spiked", "lower than expected");
    // not "we dropped the outliers" (a choice they made, not a symptom)
    String.raw`(?<!\b(?:i|we|they|you)\s+)\b(?:dropped|dipped|plummet(?:s|ed|ing)?|plunged|cratered|spiked|nosedived)\b`,
    String.raw`\b(?:lower|higher|worse)\s+than\s+(?:expected|usual|normal|last\s+(?:week|month|year|time))\b`,
    String.raw`\b(?:going|landing|ending\s+up|went|landed)\s+(?:to|in)\s+spam\b`,
    String.raw`\bperfect(?:ly)?\s+separat(?:ion|ed)\b`,
    // "why is my …", "what's wrong", "keeps giving …", "I'm getting …"
    String.raw`\bwhy\s+(?:is|are|does|do|did|would|has|have)\s+(?:my|the|this|these|it)\b`,
    String.raw`\bwhat['’]?s\s+wrong\b`,
    String.raw`\b(?:keeps?|kept)\s+(?:getting|giving|returning|throwing|failing)\b`,
    String.raw`\b(?:i['’]?m|i\s+am|we['’]?re|we\s+are|i\s+keep|still)\s+getting\b`,
  ].join("|"),
  "i",
);

/**
 * A request to WRITE something (prose, a summary, a translation): it leads
 * with a writing verb, optionally after "can you" / "please" / "help me", or
 * asks for a piece of prose ("I need an email …"). It never counts as a
 * problem report, even when what's to be written describes one ("Draft an
 * email explaining why our open rate dropped"). Fix/debug requests are not
 * writing requests.
 */
const WRITING_VERB = String.raw`(?:write|draft|re-?write|edit|proofread|polish|shorten|outline|summari[sz]e|translate)`;
const PROSE_NOUN = String.raw`(?:e-?mail|message|reply|response|paragraph|sentence|summary|abstract|post|caption|memo|report|letter|note|update|announcement|copy|blurb|bio|outline|draft|section)`;
const WRITING_REQUEST_RE = new RegExp(
  [
    String.raw`^(?:(?:hi|hey|ok(?:ay)?|so)[,!]?\s+)?(?:(?:(?:can|could|would|will)\s+you|please|help\s+me(?:\s+to)?|i\s+(?:need|want)\s+(?:you\s+)?to),?\s+)*${WRITING_VERB}\b`,
    String.raw`\bhelp\s+me\s+(?:to\s+)?${WRITING_VERB}\b`,
    String.raw`^i\s+need\s+(?:a|an)\s+(?:[\w-]+\s+){0,2}?${PROSE_NOUN}\b`,
  ].join("|"),
  "i",
);

export function isWritingRequest(message: string): boolean {
  return WRITING_REQUEST_RE.test(message.trim());
}

export function reportsProblem(message: string): boolean {
  if (isWritingRequest(message)) return false;
  return PROBLEM_RE.test(message);
}

// ─── Explicit learning requests ─────────────────────────────────────────────

/**
 * The learner asks to learn or be walked through something ("I want to
 * learn", "help me understand", "teach me", "ask me questions", "framing").
 * Deliberately narrow: weaker signals ("I don't know how") are left to the
 * router prompt, because "I don't know how to fix this error" is a task.
 */
const LEARN_REQUEST_RE = new RegExp(
  [
    String.raw`\bi(?:['’]d|\s+would)?\s+(?:really\s+|actually\s+|just\s+)?(?:want|wanna|like|need|hope)\s+to\s+(?:actually\s+|really\s+)?(?:learn|understand)\b`,
    String.raw`\bi(?:['’]m|\s+am)\s+(?:trying|here)\s+to\s+(?:learn|understand)\b`,
    String.raw`\b(?:help\s+me|let['’]?s|let\s+me)\s+(?:to\s+)?(?:actually\s+)?(?:learn|understand)\b`,
    String.raw`\bteach\s+me\b`,
    String.raw`\bwalk\s+me\s+through\b`,
    String.raw`\bask\s+me\s+(?:some\s+|a\s+few\s+|the\s+)?(?:framing\s+|guiding\s+)?questions?\b`,
    String.raw`\b(?:i\s+(?:want|need)|give\s+me|use|with)\s+(?:the\s+)?framing\b`,
    String.raw`\bframing\s+questions?\b`,
  ].join("|"),
  "i",
);

/** "just answer", "no questions": the learner declines framing, so no explicit request. */
const LEARN_OPT_OUT_RE = new RegExp(
  [
    String.raw`\b(?:don['’]?t|do\s+not)\s+(?:actually\s+)?(?:want|need)\s+to\s+(?:learn|understand)\b`,
    String.raw`\bjust\s+(?:give|answer|tell|do|write|fix)\b`,
    String.raw`\b(?:no|skip|without|stop\s+with)\s+(?:the\s+)?(?:framing|questions)\b`,
  ].join("|"),
  "i",
);

/** Words that carry no topic once the request phrase is removed. */
const FILLER = new Set(
  "a an the this that it its to of about how what why more some something anything things stuff please really actually just so ok okay hi hey and or but literally all everything".split(" "),
);

export type ExplicitFraming = "empty" | "followup" | "topic";

/**
 * Did the learner explicitly ask to learn? The message text decides the tier:
 * - `topic`: it names a topic or situation once the request phrase is removed
 *   → 2–3 framing questions.
 * - `followup`: it names none ("I want to learn") but the conversation has
 *   earlier turns → 1 question built from that conversation.
 * - `empty`: no topic and no earlier turns → nothing to frame; the app asks
 *   the learner to describe what they want to learn (no model call).
 */
export function explicitFraming(message: string, priorTurns: readonly unknown[] = []): ExplicitFraming | null {
  if (!LEARN_REQUEST_RE.test(message) || LEARN_OPT_OUT_RE.test(message)) return null;
  const rest = message
    .toLowerCase()
    .replace(LEARN_REQUEST_RE, " ")
    .split(/[^a-z0-9']+/)
    .filter((w) => w && !FILLER.has(w));
  if (rest.length > 0) return "topic";
  return priorTurns.length > 0 ? "followup" : "empty";
}

// ─── Framing policy ─────────────────────────────────────────────────────────

/** How an immediate (non-framed) answer is written. See MODE_INSTRUCTIONS. */
export type ImmediateAnswerMode = "lookup" | "task" | "direct";

export type FramingDowngrade = "deadline" | "already_framed" | "cooldown";

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
  /**
   * The router's top item (why card, else rank 1) — the deterministic
   * featured item. Kept for logs/tests; the chat pipeline features an item
   * via the E2 draw over `candidates` instead. Empty for concept.
   */
  persist: LearnLaterCallout[];
  /** Hidden-decision candidates for the end-of-answer slot (E2). Empty for concept. */
  candidates: SlotCandidates;
  /** True when a task's whyCallout was dropped because the message reports no problem. */
  droppedWhy: boolean;
}

/** Input to the E2 featured-item draw (src/lib/slot/policy.ts). */
export interface SlotCandidates {
  /** A task's "why this happened" card: always featured when present (L8). */
  why: LearnLaterCallout | null;
  /** Ranked hidden-decision candidates, most consequential first (≤ 3). */
  ranked: LearnLaterCallout[];
}

const NO_CANDIDATES: SlotCandidates = { why: null, ranked: [] };

/** Slot candidates for an immediate-answer route. */
export function slotCandidates(route: RouterResult): SlotCandidates {
  if (route.kind === "concept") return NO_CANDIDATES;
  return { why: route.kind === "task" ? route.whyCallout : null, ranked: route.callouts ?? [] };
}

/** The shared one-question framing timer: open if never framed, or the cooldown has passed. */
export function framingTimerOpen(messagesSinceFraming: number | null | undefined): boolean {
  return messagesSinceFraming == null || messagesSinceFraming >= FRAMING.closeCallEveryMessages;
}

/**
 * Decide how the router's result is handled (the chat pipeline's single
 * entry point for policy — exported so the wiring is testable):
 * - Non-concept results pass through: lookup → "lookup" mode, task → "task".
 * - Concept + an explicit request to learn → framed as asked, never downgraded.
 * - Concept + deadline (L4) → answered now. If the message
 *   asks for a deliverable it's a task; otherwise "direct" mode: a concise,
 *   complete concept answer (the route stays lookup-shaped). The skipCallout
 *   is the saved item.
 * - Close call within FRAMING.closeCallEveryMessages user messages of the
 *   conversation's last framing → lookup (cooldown), skipCallout saved.
 * - Concept sharing a slug with an earlier exchange in this conversation (L9,
 *   framing once per topic; a one-question close call is exempt) → lookup. If any matching exchange was answered
 *   the user just worked through it, so nothing is re-queued; otherwise the
 *   skipCallout is the saved item.
 */
export function planRoute(
  route: RouterResult,
  ctx: {
    message: string;
    earlier: EarlierExchange[];
    /**
     * User messages since this conversation's last framing, counting the
     * current one; null/undefined when it has never been framed.
     */
    messagesSinceFraming?: number | null;
    /**
     * The learner explicitly asked to learn (see explicitFraming). Their
     * request outranks the deadline, cooldown and once-per-topic downgrades.
     */
    explicitFraming?: boolean;
  },
): RoutePlan {
  if (route.kind !== "concept") {
    let next = route;
    let droppedWhy = false;
    // The single task/lookup framing question is enforced in code: only while
    // the shared framing timer is open (FRAMING.closeCallEveryMessages) and never on a deadline (L4).
    if (next.framingQuestions && (!framingTimerOpen(ctx.messagesSinceFraming) || mentionsDeadline(ctx.message))) {
      const rest = { ...next };
      delete rest.framingQuestions;
      next = { ...rest, rationale: `${next.rationale} [framing question dropped]` };
    }
    // whyCallout guard: only for messages that report a problem with their own work.
    if (next.kind === "task" && next.whyCallout && !reportsProblem(ctx.message)) {
      next = { ...next, whyCallout: null, rationale: `${next.rationale} [whyCallout dropped: no problem reported]` };
      droppedWhy = true;
    }
    return {
      route: next,
      answerMode: next.kind,
      downgraded: null,
      matchedSlugs: [],
      persist: featuredCallouts(next),
      candidates: slotCandidates(next),
      droppedWhy,
    };
  }

  // An explicit request to learn is honored as asked: no downgrade applies.
  if (ctx.explicitFraming) {
    return { route, answerMode: null, downgraded: null, matchedSlugs: [], persist: [], candidates: NO_CANDIDATES, droppedWhy: false };
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
      candidates: slotCandidates(next),
      droppedWhy: false,
    };
  }

  // Cooldown: a close call frames a follow-up only every few messages, so a
  // continued conversation is poked, not quizzed. The skipCallout is still
  // saved, so the concept isn't lost.
  const since = ctx.messagesSinceFraming;
  if (route.closeCall && since != null && since < FRAMING.closeCallEveryMessages) {
    const next: RouterResult = {
      kind: "lookup",
      conceptSlugs: route.conceptSlugs,
      rationale: `${route.rationale} [downgraded: close-call cooldown, ${since}/${FRAMING.closeCallEveryMessages}]`,
      callouts: [route.skipCallout],
    };
    return {
      route: next,
      answerMode: "lookup",
      downgraded: "cooldown",
      matchedSlugs: route.conceptSlugs,
      persist: featuredCallouts(next),
      candidates: slotCandidates(next),
      droppedWhy: false,
    };
  }

  const slugs = new Set(route.conceptSlugs);
  const matching = ctx.earlier.filter((e) => e.conceptSlugs.some((s) => slugs.has(s)));
  // A close call (one question) may re-frame a concept already framed here:
  // a continued, still open-ended conversation keeps poking the learner's
  // thinking. Full multi-question framings stay once per topic.
  if (matching.length && !route.closeCall) {
    const matchedSlugs = [...new Set(matching.flatMap((e) => e.conceptSlugs).filter((s) => slugs.has(s)))];
    const answered = matching.some((e) => e.status === "answered");
    const next: RouterResult = {
      kind: "lookup",
      conceptSlugs: route.conceptSlugs,
      rationale: `${route.rationale} [downgraded: already framed${answered ? ", answered" : ""}]`,
      callouts: answered ? [] : [route.skipCallout],
    };
    return {
      route: next,
      answerMode: "lookup",
      downgraded: "already_framed",
      matchedSlugs,
      persist: featuredCallouts(next),
      candidates: slotCandidates(next),
      droppedWhy: false,
    };
  }

  return { route, answerMode: null, downgraded: null, matchedSlugs: [], persist: [], candidates: NO_CANDIDATES, droppedWhy: false };
}

/** At most this many Learn It Later items are saved (and shown) per lookup/task answer. */
export const MAX_SAVED_PER_ANSWER = 3;

/**
 * The router's other candidates, saved next to the featured item so a lookup
 * or task always leaves a few concepts to dig into in the profile panel, not
 * just the one the end-of-answer slot features. Why card first, then the
 * ranked hidden decisions; the featured one is excluded.
 */
export function alsoSavedCallouts(c: SlotCandidates, featured: LearnLaterCallout): LearnLaterCallout[] {
  return [...(c.why ? [c.why] : []), ...c.ranked].filter((x) => x !== featured).slice(0, MAX_SAVED_PER_ANSWER - 1);
}

/**
 * The router's own top pick: the task's whyCallout if present, else the
 * top-ranked callout. The chat pipeline instead features an item via the E2
 * draw (src/lib/slot/policy.ts), which picks this item most of the time.
 */
export function featuredCallouts(route: RouterResult): LearnLaterCallout[] {
  if (route.kind === "concept") return [];
  const featured = (route.kind === "task" ? route.whyCallout : null) ?? route.callouts?.[0];
  return featured ? [featured] : [];
}
