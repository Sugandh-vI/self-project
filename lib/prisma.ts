import { PrismaClient } from "@prisma/client";
import { resolveDatasourceUrl } from "@/lib/prisma-pool";

// PrismaClient is heavy to construct; reuse a single instance across hot reloads
// in development (Next.js otherwise creates a new client per request in dev).
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// The pool is capped in lib/prisma-pool.ts (Supabase pooler allows 15 clients;
// Prisma would default to 21 on an 8-core machine). `datasourceUrl` overrides
// the runtime URL only — migrations still go through the schema's directUrl.
const datasourceUrl = resolveDatasourceUrl();

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient(datasourceUrl ? { datasourceUrl } : undefined);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
