// Passcode gate (X2). Next.js 16 renamed middleware.ts → proxy.ts; proxy
// runs on the Node.js runtime. See src/lib/passcode.ts for the gate modes.
//   off            → everything passes
//   on             → pages redirect to /passcode?next=…; API → 401 ApiError
//   misconfigured  → fail closed: pages rewrite to /passcode (which explains
//                    the misconfiguration); API → 503 ApiError
import { NextResponse, type NextRequest } from "next/server";
import { COOKIES } from "@/config";
import { apiError } from "@/lib/api-contract";
import { isValidPasscodeCookie, passcodeGate } from "@/lib/passcode";

const PUBLIC_PATHS = new Set(["/passcode", "/api/passcode"]);

export async function proxy(request: NextRequest) {
  const gate = passcodeGate();
  if (gate.mode === "off") return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  const isApi = pathname === "/api" || pathname.startsWith("/api/");

  if (gate.mode === "misconfigured") {
    if (pathname === "/passcode") return NextResponse.next();
    if (isApi) return apiError(503, "unavailable", "Server misconfigured: passcode gate is not set up");
    const url = request.nextUrl.clone();
    url.pathname = "/passcode";
    url.search = "";
    return NextResponse.rewrite(url);
  }

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  if (await isValidPasscodeCookie(gate, request.cookies.get(COOKIES.passcode)?.value)) {
    return NextResponse.next();
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
