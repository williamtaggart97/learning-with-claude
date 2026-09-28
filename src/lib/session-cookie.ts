// Session-cookie primitives shared by src/proxy.ts and src/lib/session.ts.
// No DB / next/headers imports, so the proxy can use it cheaply.
import { TEMPLATE_DEMO_SESSION_ID } from "@/config";

/** Options for lm_session and lm_persona. Long-lived, httpOnly, lax. */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};

/** Session ids are crypto.randomUUID() values; accept nothing else. */
const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a syntactically valid session id that is not the template sentinel (R1). */
export function isValidSessionId(value: string | undefined | null): value is string {
  return !!value && value !== TEMPLATE_DEMO_SESSION_ID && SESSION_ID_RE.test(value);
}

export function newSessionId(): string {
  return crypto.randomUUID();
}
