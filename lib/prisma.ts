import { PrismaClient } from "@prisma/client";

// PrismaClient is heavy to construct; reuse a single instance across hot reloads
// in development (Next.js otherwise creates a new client per request in dev).
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
