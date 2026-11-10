/**
 * Prisma client singleton — safe for Next.js hot-reload in development.
 * Automatically invalidates stale cached instances when models are added to schema.
 */
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function isStalePrismaClient(client: PrismaClient | undefined): boolean {
  if (!client) return true;
  const anyClient = client as any;
  if (!anyClient.supplierInvoice || !anyClient.purchaseOrder || !anyClient.purchaseOrderSettings) {
    return true;
  }
  if (anyClient.purchaseOrderDelivery || anyClient.purchaseOrderDeliveryItem) {
    return true;
  }
  const poFields = anyClient._runtimeDataModel?.models?.PurchaseOrder?.fields;
  if (
    Array.isArray(poFields) &&
    poFields.some((f: any) => f?.name === "deliveryStatus" || f?.dbName === "delivery_status")
  ) {
    return true;
  }
  return false;
}

/**
 * Returns the active PrismaClient singleton, re-creating it if newly generated models
 * or schema changes (such as supplierInvoice / purchaseOrder) are stale in memory.
 */
export function getPrisma(): PrismaClient {
  if (isStalePrismaClient(globalForPrisma.prisma)) {
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
  return globalForPrisma.prisma!;
}

// Invalidate in-memory cache if schema changed
if (isStalePrismaClient(globalForPrisma.prisma)) {
  try {
    globalForPrisma.prisma?.$disconnect();
  } catch {
    // ignore
  }
  globalForPrisma.prisma = undefined;
}

export const prisma: PrismaClient = getPrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
