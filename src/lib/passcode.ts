// Shared-passcode helpers (X2). Web Crypto only, so this runs in the proxy
// and in route handlers alike. The cookie stores an HMAC of the passcode,
// never the passcode itself; rotating DEMO_PASSCODE or PASSCODE_SECRET
// invalidates existing cookies.
//
// Gate modes (passcodeGate()):
//   off            DISABLE_PASSCODE_GATE=1, or (non-production) DEMO_PASSCODE unset
//   on             DEMO_PASSCODE set (+ PASSCODE_SECRET required in production)
//   misconfigured  production with DEMO_PASSCODE or PASSCODE_SECRET missing →
//                  FAIL CLOSED: pages show a misconfiguration notice, APIs 503.
import "server-only";

export type PasscodeGate =
  | { mode: "off" }
  | { mode: "on"; passcode: string; secret: string }
  | { mode: "misconfigured"; reason: string };

export function passcodeGate(): PasscodeGate {
  if (process.env.DISABLE_PASSCODE_GATE === "1") return { mode: "off" };

  const passcode = process.env.DEMO_PASSCODE || "";
  const secret = process.env.PASSCODE_SECRET || "";

  if (process.env.NODE_ENV === "production") {
    if (!passcode || !secret) {
      const missing = [!passcode && "DEMO_PASSCODE", !secret && "PASSCODE_SECRET"].filter(Boolean);
      return { mode: "misconfigured", reason: `Missing ${missing.join(" and ")}` };
    }
    return { mode: "on", passcode, secret };
  }

  // Development: no passcode → gate off. A missing secret gets a dev-only
  // fallback so trying the gate locally needs just DEMO_PASSCODE.
  if (!passcode) return { mode: "off" };
  return { mode: "on", passcode, secret: secret || `lm-dev-fallback:${passcode}` };
}

async function hmacHex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Cookie value for a passcode attempt under an active gate. */
export function passcodeToken(gate: Extract<PasscodeGate, { mode: "on" }>, passcode: string): Promise<string> {
  return hmacHex(gate.secret, `lm-passcode:${passcode}`);
}

/** Length-independent-ish constant-time string compare. */
export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** True when the cookie matches the active gate's expected token. */
export async function isValidPasscodeCookie(
  gate: Extract<PasscodeGate, { mode: "on" }>,
  value: string | undefined,
): Promise<boolean> {
  if (!value) return false;
  return safeEqual(value, await passcodeToken(gate, gate.passcode));
}
