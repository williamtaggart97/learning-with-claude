// Prisma CLI configuration (Prisma 7).
// Loads .env.local then .env (Next.js convention) so `prisma migrate` sees the
// same variables as `next dev`. The CLI prefers DIRECT_URL (Neon's unpooled
// connection, required for migrations) and falls back to DATABASE_URL.
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

loadEnv({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // `||` so empty strings (e.g. DIRECT_URL="" in .env) fall through. A
    // placeholder keeps `prisma generate` / `validate` working without a DB.
    url:
      process.env.DIRECT_URL ||
      process.env.DATABASE_URL ||
      "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
});
