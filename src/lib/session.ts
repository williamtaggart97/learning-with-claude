// Session resolver (R1, X5). Server-only; usable from route handlers AND
// server components.
//
//  - `lm_session` (COOKIES.session) is normally set by src/proxy.ts before
//    anything renders. If it is somehow missing (e.g. proxy skipped), a route
//    handler mints one and persists it; a server component can't set cookies,
//    so it throws instead — we never clone a persona for a session id the
//    browser won't keep (that would orphan a clone per render).
//  - `lm_persona` (COOKIES.persona) selects the persona; invalid/missing →
//    DEFAULT_PERSONA.
//  - The session clone of that persona is created lazily from the template.
import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { COOKIES, DEFAULT_PERSONA, TEMPLATE_DEMO_SESSION_ID } from "@/config";
import { db, type User } from "@/lib/db";
import { isValidSessionId, newSessionId, SESSION_COOKIE_OPTIONS } from "@/lib/session-cookie";
import { ensurePersonaClone } from "@/lib/persona";
import type { PersonaKey } from "@/lib/types";
import { PERSONA_KEYS } from "@/lib/types";

function isPersonaKey(value: unknown): value is PersonaKey {
  return typeof value === "string" && (PERSONA_KEYS as readonly string[]).includes(value);
}

/**
 * Reads the session cookie. If absent/invalid, mints one and persists it —
 * which only works in route handlers / server actions. Where cookies can't be
 * set (server components) it throws rather than hand back an id that won't
 * survive the response; the proxy mints the cookie on the next request.
 * Memoized per server-component render via React cache() (a no-op in route
 * handlers).
 */
export const getSessionId = cache(async function getSessionId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIES.session)?.value;
  if (isValidSessionId(existing)) return existing;

  const minted = newSessionId();
  try {
    jar.set(COOKIES.session, minted, SESSION_COOKIE_OPTIONS);
  } catch {
    throw new Error(
      "Missing session cookie and it can't be set here (server component). " +
        "src/proxy.ts should have minted it — check the proxy matcher covers this path.",
    );
  }
  return minted;
});

/** Currently selected persona key (cookie), falling back to DEFAULT_PERSONA. */
export async function getPersonaKey(): Promise<PersonaKey> {
  const value = (await cookies()).get(COOKIES.persona)?.value;
  return isPersonaKey(value) ? value : DEFAULT_PERSONA;
}

/** Sets the persona cookie (route handlers / server actions only). Same options as the session cookie. */
export async function setPersonaCookie(personaKey: PersonaKey): Promise<void> {
  (await cookies()).set(COOKIES.persona, personaKey, SESSION_COOKIE_OPTIONS);
}

const LAST_SEEN_THROTTLE_MS = 60_000;

/**
 * The session-clone User for (session cookie, persona cookie). Clones the
 * persona template on first use. Never returns a template row (R1).
 * Memoized per server-component render (layout + page share one lookup).
 */
export const getSessionUser = cache(async function getSessionUser(): Promise<User> {
  const [sessionId, personaKey] = await Promise.all([getSessionId(), getPersonaKey()]);
  return getUserFor(sessionId, personaKey);
});

/** Resolve (and lazily clone) the user for an explicit session + persona. */
export async function getUserFor(sessionId: string, personaKey: PersonaKey): Promise<User> {
  if (!isValidSessionId(sessionId)) throw new Error("Invalid session id");
  const user = await ensurePersonaClone(personaKey, sessionId);
  if (user.isTemplate || user.demoSessionId === TEMPLATE_DEMO_SESSION_ID) {
    throw new Error("Resolved a template user"); // defensive; unreachable
  }

  const now = Date.now();
  if (now - user.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    const lastSeenAt = new Date(now);
    // Fire-and-forget: not awaited, and a failed write never fails the request.
    void db.user
      .update({ where: { id: user.id }, data: { lastSeenAt } })
      .catch((err) => console.error("lastSeenAt update failed", err));
    user.lastSeenAt = lastSeenAt;
  }
  return user;
}
