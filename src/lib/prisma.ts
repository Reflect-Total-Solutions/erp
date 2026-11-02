/**
 * Prisma client singleton — safe for Next.js hot-reload in development.
 * Automatically invalidates stale cached instances when models are added to schema.
 */
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Returns the active PrismaClient singleton, re-creating it if newly generated models
 * (such as supplierInvoice) are missing from the memory cache.
 */
export function getPrisma(): PrismaClient {
  if (
    !globalForPrisma.prisma ||
    !(globalForPrisma.prisma as any).supplierInvoice
  ) {
    if (globalForPrisma.prisma) {
      try {
        globalForPrisma.prisma.$disconnect();
      } catch {
        // ignore disconnect errors
      }
    }
    globalForPrisma.prisma = new PrismaClient({
      log: ["error"],
    });
  }
  return globalForPrisma.prisma;
}

// Invalidate in-memory cache if missing newer models
if (globalForPrisma.prisma && !(globalForPrisma.prisma as any).supplierInvoice) {
  try {
    globalForPrisma.prisma.$disconnect();
  } catch {
    // ignore
  }
  globalForPrisma.prisma = undefined;
}

export const prisma: PrismaClient = getPrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
