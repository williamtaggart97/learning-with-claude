// Passcode gate (X2) + session cookie (X5). Next.js 16 renamed middleware.ts
// → proxy.ts; proxy runs on the Node.js runtime. See src/lib/passcode.ts for
// the gate modes.
//   off            → everything passes
//   on             → pages redirect to /passcode?next=…; API → 401 ApiError
//   misconfigured  → fail closed: pages rewrite to /passcode (which explains
//                    the misconfiguration); API → 503 ApiError
//
// Session cookie: if `lm_session` is missing/invalid, mint one and set it on
// BOTH the request (so server components / route handlers see it on this very
// pass via cookies()) and the response (so the browser keeps it). Only
// requests that are let through (next / rewrite) carry it; 401/503/redirect
// responses don't need a session.
import { NextResponse, type NextRequest } from "next/server";
import { COOKIES } from "@/config";
import { apiError } from "@/lib/api-contract";
import { isValidPasscodeCookie, passcodeGate } from "@/lib/passcode";
import { isValidSessionId, newSessionId, SESSION_COOKIE_OPTIONS } from "@/lib/session-cookie";

const PUBLIC_PATHS = new Set(["/passcode", "/api/passcode"]);

export async function proxy(request: NextRequest) {
  // Mint the session cookie up front (mutates request cookies/headers).
  let mintedSessionId: string | null = null;
  if (!isValidSessionId(request.cookies.get(COOKIES.session)?.value)) {
    mintedSessionId = newSessionId();
    request.cookies.set(COOKIES.session, mintedSessionId);
  }
  const withSession = (response: NextResponse) => {
    if (mintedSessionId) response.cookies.set(COOKIES.session, mintedSessionId, SESSION_COOKIE_OPTIONS);
    return response;
  };
  const next = () => withSession(NextResponse.next({ request: { headers: request.headers } }));
  const rewrite = (url: URL) => withSession(NextResponse.rewrite(url, { request: { headers: request.headers } }));

  const gate = passcodeGate();
  if (gate.mode === "off") return next();

  const { pathname, search } = request.nextUrl;
  const isApi = pathname === "/api" || pathname.startsWith("/api/");

  if (gate.mode === "misconfigured") {
    if (pathname === "/passcode") return next();
    if (isApi) return apiError(503, "unavailable", "Server misconfigured: passcode gate is not set up");
    const url = request.nextUrl.clone();
    url.pathname = "/passcode";
    url.search = "";
    return rewrite(url);
  }

  if (PUBLIC_PATHS.has(pathname)) return next();

  if (await isValidPasscodeCookie(gate, request.cookies.get(COOKIES.passcode)?.value)) {
    return next();
  }

  if (isApi) return apiError(401, "unauthorized", "Passcode required");

  const url = request.nextUrl.clone();
  url.pathname = "/passcode";
  url.search = "";
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Every API route, whatever its path looks like (e.g. /api/foo.bar).
    "/api/:path*",
    // Everything else except Next build assets and known static file types.
    "/((?!api/|_next/static/|_next/image|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|txt|xml|woff|woff2|css|js|map)$).*)",
  ],
};
