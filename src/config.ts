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

/** Claude model IDs (A4). Switch the answerer to Opus for a demo via ANSWERER_MODEL. */
export const MODELS = {
  /** A1: router + framing questions, one structured-output call. */
  router: process.env.ROUTER_MODEL || "claude-haiku-4-5-20251001",
  /** A2: streamed answer. */
  answerer: process.env.ANSWERER_MODEL || "claude-sonnet-5",
  /** A3: background assessor, strict JSON. */
  assessor: process.env.ASSESSOR_MODEL || "claude-haiku-4-5-20251001",
} as const;

/** Soft unlock ladder (P6). Progress counts ANSWERED framing exchanges only (P7). */
export const TIER_THRESHOLDS = {
  /** Tier 1: read-only profile + "here's how I think you learn" reveal. */
  tier1: { framingExchanges: 5 },
  /** Tier 2: editable profile + suggested topics. Either condition unlocks. */
  tier2: { framingExchanges: 15, concepts: 8 },
} as const;

/** Framing question limits (L1). */
export const FRAMING = {
  minQuestions: 1,
  maxQuestions: 3,
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
