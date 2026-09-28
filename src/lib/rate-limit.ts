// Fixed-window rate limiting on the RateLimit table (X3). Server-only.
// Keys come from RATE_LIMIT_KEYS and limits from RATE_LIMIT in src/config.ts.
import "server-only";
import { db, Prisma } from "@/lib/db";

export interface RateLimitRule {
  max: number;
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  /** Count in the current window, including this hit. */
  count: number;
  /** Seconds until the current window resets (for ApiError.retryAfterSeconds). */
  retryAfterSeconds: number;
}

/**
 * Record one hit against `key` and report whether it is within `rule`.
 * Windows are aligned to multiples of windowMs since the epoch (so a 24h
 * window starts at UTC midnight). Every call counts, including rejected ones.
 */
export async function hitRateLimit(key: string, rule: RateLimitRule, now = new Date()): Promise<RateLimitResult> {
  const windowStartMs = Math.floor(now.getTime() / rule.windowMs) * rule.windowMs;
  const windowStart = new Date(windowStartMs);
  const retryAfterSeconds = Math.max(1, Math.ceil((windowStartMs + rule.windowMs - now.getTime()) / 1000));

  const upsert = () =>
    db.rateLimit.upsert({
      where: { key_windowStart: { key, windowStart } },
      create: { key, windowStart, count: 1 },
      update: { count: { increment: 1 } },
      select: { count: true },
    });

  let row: { count: number };
  try {
    row = await upsert();
  } catch (err) {
    // Two first hits raced on create; the row exists now, so retry once.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") row = await upsert();
    else throw err;
  }
  return { ok: row.count <= rule.max, count: row.count, retryAfterSeconds };
}

/**
 * Best-effort client IP: first entry of x-forwarded-for, then x-real-ip.
 * On Vercel both are set by the platform. Returns "unknown" when absent
 * (all such clients then share one bucket).
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const real = headers.get("x-real-ip")?.trim();
  return real || "unknown";
}
