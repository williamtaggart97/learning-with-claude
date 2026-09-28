// Server-only Prisma singleton (dev hot-reload safe).
// Prisma 7 connects through a driver adapter; DATABASE_URL is the pooled URL
// on Neon (or a plain local Postgres URL in dev). Nothing connects until the
// first query, so importing this at build time is safe.
import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * pg-connection-string 2.x treats sslmode=prefer|require as aliases for
 * verify-full (full certificate + hostname verification) but logs a
 * "SECURITY WARNING" at startup because pg 9 will switch them to libpq
 * semantics (encrypt WITHOUT verifying the certificate). Pin the current,
 * secure behaviour explicitly: rewrite those two modes to verify-full, which
 * also silences the warning. Certificate verification stays ON; verify-ca,
 * disable and no-verify are left untouched. Prefer setting
 * sslmode=verify-full in the env var itself (see .env.example).
 */
export function withExplicitSslMode(connectionString: string | undefined): string | undefined {
  if (!connectionString) return connectionString;
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return connectionString; // not a URL (e.g. key=value DSN): leave as-is
  }
  const mode = url.searchParams.get("sslmode");
  if (mode !== "require" && mode !== "prefer") return connectionString;
  url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}

function createClient() {
  const adapter = new PrismaPg({ connectionString: withExplicitSslMode(process.env.DATABASE_URL) });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createClient>;
};

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

// Re-export generated types/enums so callers have one import site.
export * from "@/generated/prisma/client";
