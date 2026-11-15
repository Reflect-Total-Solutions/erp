/**
 * Prisma client singleton — safe for Next.js hot-reload and Turbopack bundling.
 * NOTE: Keep ZERO Node-only built-in imports (`node:module`, `node:fs`, etc.)
 * because shared modules (e.g. permissions helpers) may be evaluated in client bundles.
 */
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaRefreshAttempted?: boolean;
  prismaStaleWarningLogged?: boolean;
};

function hasModelField(anyClient: any, modelName: string, fieldName: string): boolean {
  const fields = anyClient?._runtimeDataModel?.models?.[modelName]?.fields;
  return (
    Array.isArray(fields) &&
    fields.some((f: any) => f?.name === fieldName || f?.dbName === fieldName)
  );
}

export function isStalePrismaClient(client: PrismaClient | undefined): boolean {
  if (!client) return true;
  const anyClient = client as any;
  if (
    !anyClient.supplierInvoice ||
    !anyClient.purchaseOrder ||
    !anyClient.purchaseOrderSettings ||
    !anyClient.supplierPayment ||
    !anyClient.supplierPaymentAuditLog ||
    !anyClient.supplierPaymentSettings ||
    !anyClient.notification ||
    !anyClient.jobAdditionalExpense ||
    !anyClient.jobAdditionalExpenseAuditLog
  ) {
    return true;
  }
  if (anyClient.purchaseOrderDelivery || anyClient.purchaseOrderDeliveryItem) {
    return true;
  }
  if (
    hasModelField(anyClient, "PurchaseOrder", "deliveryStatus") ||
    hasModelField(anyClient, "PurchaseOrder", "delivery_status")
  ) {
    return true;
  }
  if (
    !hasModelField(anyClient, "SupplierInvoice", "budgetOverrideUsed") ||
    !hasModelField(anyClient, "SupplierInvoice", "paymentDueDate") ||
    !hasModelField(anyClient, "SupplierInvoice", "paymentStatus") ||
    !hasModelField(anyClient, "SupplierInvoice", "paidAmount")
  ) {
    return true;
  }
  if (
    !hasModelField(anyClient, "SupplierInvoiceItem", "jobCostItemId") ||
    !hasModelField(anyClient, "SupplierInvoiceItem", "jobCostCategoryName") ||
    !hasModelField(anyClient, "SupplierInvoiceItem", "originalJobAmount") ||
    !hasModelField(anyClient, "SupplierInvoiceItem", "unit") ||
    !hasModelField(anyClient, "SupplierInvoiceItem", "unitRate") ||
    !hasModelField(anyClient, "SupplierInvoiceItem", "isAdditionalItem")
  ) {
    return true;
  }
  return false;
}

/**
 * Returns the active PrismaClient singleton.
 * Never disconnects an active engine in a loop; attempts single replacement if globalThis
 * holds a stale client from an earlier schema, and falls back gracefully with one warning
 * if the running Node process still has an older `@prisma/client` module cached.
 */
export function getPrisma(): PrismaClient {
  if (typeof window !== "undefined") {
    return undefined as unknown as PrismaClient;
  }

  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      log: ["error"],
    });
    return globalForPrisma.prisma;
  }

  if (isStalePrismaClient(globalForPrisma.prisma)) {
    if (!globalForPrisma.prismaRefreshAttempted) {
      globalForPrisma.prismaRefreshAttempted = true;
      const candidate = new PrismaClient({
        log: ["error"],
      });
      // Replace global singleton only if the newly instantiated client actually has the new delegates
      if (!isStalePrismaClient(candidate)) {
        globalForPrisma.prisma = candidate;
      } else {
        // Dispose temporary candidate silently if the Node require cache is pre-regenerate
        void candidate.$disconnect().catch(() => {});
        if (!globalForPrisma.prismaStaleWarningLogged) {
          globalForPrisma.prismaStaleWarningLogged = true;
          console.warn(
            "[Prisma] Cached @prisma/client is out of sync with prisma/schema.prisma. Please restart `npm run dev` to load the regenerated Prisma Client."
          );
        }
      }
    } else if (!globalForPrisma.prismaStaleWarningLogged) {
      globalForPrisma.prismaStaleWarningLogged = true;
      console.warn(
        "[Prisma] Cached @prisma/client is out of sync with prisma/schema.prisma. Please restart `npm run dev` to load the regenerated Prisma Client."
      );
    }
  }

  return globalForPrisma.prisma;
}

/**
 * Proxy wrapper so `import { prisma } from "@/lib/prisma"` always resolves dynamically
 * against the active singleton without disconnecting engines or breaking browser bundles.
 */
const serverPrismaProxy =
  typeof window === "undefined"
    ? new Proxy({} as PrismaClient, {
        get(_target, prop, _receiver) {
          const client = getPrisma() as any;
          if (!client) return undefined;
          const value = Reflect.get(client, prop, client);
          return typeof value === "function" ? value.bind(client) : value;
        },
        set(_target, prop, value) {
          const client = getPrisma() as any;
          if (!client) return false;
          return Reflect.set(client, prop, value);
        },
        has(_target, prop) {
          const client = getPrisma() as any;
          return client ? prop in client : false;
        },
        ownKeys() {
          const client = getPrisma() as any;
          return client ? Reflect.ownKeys(client) : [];
        },
      })
    : (undefined as unknown as PrismaClient);

export const prisma: PrismaClient = serverPrismaProxy;
