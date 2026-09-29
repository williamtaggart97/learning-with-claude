// Central app configuration (D2, A4, P6, P7, X3).
// Server code may read env overrides; client components should only import
// the constants that don't depend on env (thresholds, limits, cookie names
// are fine — env reads just fall back to defaults in the browser).

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

/** Claude model IDs (A4). Switch the answerer to Opus for a demo via ANSWERER_MODEL. */
export const MODELS = {
  /** A1: router + framing questions, one structured-output call. */
  router: process.env.ROUTER_MODEL || "claude-haiku-4-5-20251001",
  /** A2: streamed answer. */
  answerer: process.env.ANSWERER_MODEL || "claude-sonnet-5",
  /** A3: background assessor, strict JSON. */
  assessor: process.env.ASSESSOR_MODEL || "claude-haiku-4-5-20251001",
  /** E1: end-of-answer slot content (quick check, copy) and walk-through framing. */
  slot: process.env.SLOT_MODEL || "claude-haiku-4-5-20251001",
} as const;

/** Soft unlock ladder (P6). Progress counts ANSWERED framing exchanges only (P7). */
export const TIER_THRESHOLDS = {
  /** Tier 1: read-only profile + "here's how I think you learn" reveal. */
  tier1: { framingExchanges: 5 },
  /** Tier 2: editable profile + suggested topics. Either condition unlocks. */
  tier2: { framingExchanges: 15, concepts: 8 },
} as const;

/**
 * Framing question limits (L1).
 * - timerMessages: a task/lookup may get its single framing question only when
 *   the last framing exchange in the conversation (of any kind) is at least
 *   this many user messages back. The framed message is message 1 of the
 *   timer, so with 3 the next two messages are never framed and the 4th is
 *   eligible again.
 */
export const FRAMING = {
  minQuestions: 1,
  maxQuestions: 3,
  timerMessages: 3,
} as const;

/**
 * Rate limits (X3), fixed windows stored in the RateLimit table. All values
 * are env-overridable. Chat-cost routes (POST /api/chat, POST
 * /api/framing/[id]/answer) must pass ALL THREE of session, ip and
 * globalDaily before starting a stream (see api-contract.ts). The dig-in
 * kickoff message is exempt.
 */
export const RATE_LIMIT = {
  /** Per browser session (key RATE_LIMIT_KEYS.session). */
  session: {
    max: envInt("RATE_LIMIT_MAX", 60),
    windowMs: envInt("RATE_LIMIT_WINDOW_MINUTES", 60) * 60_000,
  },
  /** Per client IP, across sessions (key RATE_LIMIT_KEYS.ip) — stops cookie-clearing abuse. */
  ip: {
    max: envInt("RATE_LIMIT_IP_MAX", 120),
    windowMs: envInt("RATE_LIMIT_IP_WINDOW_MINUTES", 60) * 60_000,
  },
  /** Whole app, per UTC day (key RATE_LIMIT_KEYS.globalDaily) — caps total API spend. */
  globalDaily: {
    max: envInt("RATE_LIMIT_GLOBAL_DAILY_MAX", 2000),
    windowMs: 24 * 60 * 60_000,
  },
  /** POST /api/passcode attempts per IP (key RATE_LIMIT_KEYS.passcode). */
  passcode: {
    max: envInt("PASSCODE_MAX_ATTEMPTS", 10),
    windowMs: envInt("PASSCODE_WINDOW_MINUTES", 15) * 60_000,
  },
} as const;

/** RateLimit.key builders. Keep prefixes distinct so buckets never collide. */
export const RATE_LIMIT_KEYS = {
  session: (demoSessionId: string) => `sess:${demoSessionId}`,
  ip: (ip: string) => `ip:${ip}`,
  /** `global:<yyyy-mm-dd>` (UTC). */
  globalDaily: (now: Date = new Date()) => `global:${now.toISOString().slice(0, 10)}`,
  passcode: (ip: string) => `pass:${ip}`,
} as const;

/** Cookie names. */
export const COOKIES = {
  /** Browser demo session id (X5). Value is User.demoSessionId. */
  session: "lm_session",
  /** Currently selected persona key for this session (X4). */
  persona: "lm_persona",
  /** HMAC of the shared passcode (X2). */
  passcode: "lm_passcode",
} as const;

/**
 * User.demoSessionId of persona TEMPLATE rows. Real session ids are random
 * UUIDs; the session resolver must never accept this value from a cookie.
 */
export const TEMPLATE_DEMO_SESSION_ID = "template";

/** Persona the app starts on when a session has none selected. */
export const DEFAULT_PERSONA = "maya" as const;

/**
 * End-of-answer slot experiment (E1–E5). See src/lib/slot/policy.ts.
 * - active: master switch (env EXPERIMENT_ACTIVE; default on — set
 *   EXPERIMENT_ACTIVE=0 to turn it off). While false nothing is drawn or
 *   logged and no `slot` event is sent: the featured item is saved and
 *   emitted via `callouts` exactly as before (the UI shows callout chips).
 * - topPickProbability: E2 — chance the router's rank-1 hidden decision is the
 *   featured one; otherwise one of the lower-ranked candidates, uniformly.
 * - weights: E1 — relative draw weights among the ELIGIBLE variants (equal to
 *   start). A variant with weight 0 is never drawn.
 * - enabled: per-variant kill switch (a disabled variant is never eligible).
 * - sessionWindowMinutes: E5 — an engagement (or a follow-up message) within
 *   this long after the impression counts as "in the same session". Also the
 *   right-censoring cut-off for the guardrail.
 * - contentWaitMs: how long, after the answer finished streaming, to wait for
 *   the variant payload (quick check / copy) before falling back to the card.
 *   Only walkthrough / quickcheck / apply draws wait, so their `done` can land
 *   up to this much later than card / none (see R15).
 */
export const EXPERIMENT = {
  active: envBool("EXPERIMENT_ACTIVE", true),
  topPickProbability: 0.6,
  weights: { card: 1, walkthrough: 1, quickcheck: 1, apply: 1, none: 1 },
  enabled: { card: true, walkthrough: true, quickcheck: true, apply: true, none: true },
  sessionWindowMinutes: 30,
  contentWaitMs: 1500,
} as const;
