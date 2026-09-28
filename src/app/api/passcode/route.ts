import { cookies } from "next/headers";
import { COOKIES, RATE_LIMIT, RATE_LIMIT_KEYS } from "@/config";
import { apiError, type PasscodeResponse } from "@/lib/api-contract";
import { passcodeGate, passcodeToken, safeEqual } from "@/lib/passcode";
import { clientIp, hitRateLimit } from "@/lib/rate-limit";
import { PasscodeRequestSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  const gate = passcodeGate();
  if (gate.mode === "off") return Response.json({ ok: true } satisfies PasscodeResponse);
  if (gate.mode === "misconfigured") {
    return apiError(503, "unavailable", "Server misconfigured: passcode gate is not set up");
  }

  // Throttle guesses per IP (every attempt counts).
  const limit = await hitRateLimit(RATE_LIMIT_KEYS.passcode(clientIp(request.headers)), RATE_LIMIT.passcode);
  if (!limit.ok) {
    return apiError(429, "rate_limited", "Too many attempts — try again later", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const parsed = PasscodeRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "bad_request", "Passcode is required");

  const [token, expected] = await Promise.all([
    passcodeToken(gate, parsed.data.passcode),
    passcodeToken(gate, gate.passcode),
  ]);
  if (!safeEqual(token, expected)) return apiError(401, "unauthorized", "That passcode didn't work");

  (await cookies()).set(COOKIES.passcode, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return Response.json({ ok: true } satisfies PasscodeResponse);
}
