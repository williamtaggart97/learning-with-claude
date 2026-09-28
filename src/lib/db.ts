// Server-only Prisma singleton (dev hot-reload safe).
// Prisma 7 connects through a driver adapter; DATABASE_URL is the pooled URL
// on Neon (or a plain local Postgres URL in dev). Nothing connects until the
// first query, so importing this at build time is safe.
import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
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
