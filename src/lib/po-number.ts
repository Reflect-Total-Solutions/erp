import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

export async function getOrCreatePoSettings(client?: Prisma.TransactionClient | any) {
  const db = client || getPrisma();
  let settings = await (db.purchaseOrderSettings as any).findUnique({
    where: { id: "default" },
  });

  if (!settings) {
    settings = await (db.purchaseOrderSettings as any).upsert({
      where: { id: "default" },
      update: {},
      create: {
        id: "default",
      },
    });
  }

  return settings;
}

/**
 * Formats a sequential PO number from prefix, financial year, sequence integer, and padding.
 * Example: ("RTS/PO", "26/27", 5, 2) -> "RTS/PO-26/27-05"
 */
export function formatPoNumber(
  prefix: string,
  financialYearCode: string,
  seq: number,
  padding = 2
): string {
  const cleanPrefix = (prefix || "RTS/PO").trim();
  const cleanFy = (financialYearCode || "26/27").trim();
  const numStr = String(seq).padStart(Math.max(1, padding), "0");
  return cleanFy ? `${cleanPrefix}-${cleanFy}-${numStr}` : `${cleanPrefix}-${numStr}`;
}

/**
 * Non-mutating preview of the next sequential PO number for display in the Create PO form.
 */
export async function previewNextPoNumber(client?: Prisma.TransactionClient | any): Promise<{
  nextPoNumber: string;
  settings: any;
}> {
  const db = client || getPrisma();
  const settings = await getOrCreatePoSettings(db);
  const seriesKey = settings.financialYearCode
    ? `${settings.poNumberPrefix}-${settings.financialYearCode}`
    : settings.poNumberPrefix;

  const seqRow = await (db.purchaseOrderNumberSequence as any).findUnique({
    where: { seriesKey },
  });

  let nextSeq = (seqRow?.lastSequence || 0) + 1;
  let candidate = formatPoNumber(
    settings.poNumberPrefix,
    settings.financialYearCode,
    nextSeq,
    settings.poNumberPadding || 2
  );

  // Guard in case manually created PO numbers already occupy that string
  let guard = 0;
  while (guard < 25) {
    const exists = await (db.purchaseOrder as any).findFirst({
      where: { poNumber: candidate },
      select: { id: true },
    });
    if (!exists) break;
    nextSeq++;
    candidate = formatPoNumber(
      settings.poNumberPrefix,
      settings.financialYearCode,
      nextSeq,
      settings.poNumberPadding || 2
    );
    guard++;
  }

  return { nextPoNumber: candidate, settings };
}

/**
 * Atomically generates and reserves the next sequential PO number inside an active Prisma $transaction.
 * Concurrency-safe: uses PostgreSQL atomic upsert + increment on purchase_order_number_sequences.
 */
export async function generateNextPoNumberTx(
  tx: Prisma.TransactionClient | any
): Promise<string> {
  const settings = await getOrCreatePoSettings(tx);
  const seriesKey = settings.financialYearCode
    ? `${settings.poNumberPrefix}-${settings.financialYearCode}`
    : settings.poNumberPrefix;

  let seqRow = await (tx.purchaseOrderNumberSequence as any).upsert({
    where: { seriesKey },
    update: {
      lastSequence: { increment: 1 },
    },
    create: {
      seriesKey,
      lastSequence: 1,
    },
  });

  let seqNum = seqRow.lastSequence;
  let candidate = formatPoNumber(
    settings.poNumberPrefix,
    settings.financialYearCode,
    seqNum,
    settings.poNumberPadding || 2
  );

  // Verify no manual collision; advance atomic sequence if taken
  let guard = 0;
  while (guard < 50) {
    const collision = await (tx.purchaseOrder as any).findUnique({
      where: { poNumber: candidate },
      select: { id: true },
    });
    if (!collision) {
      return candidate;
    }
    seqRow = await (tx.purchaseOrderNumberSequence as any).update({
      where: { seriesKey },
      data: { lastSequence: { increment: 1 } },
    });
    seqNum = seqRow.lastSequence;
    candidate = formatPoNumber(
      settings.poNumberPrefix,
      settings.financialYearCode,
      seqNum,
      settings.poNumberPadding || 2
    );
    guard++;
  }

  throw new Error("Could not allocate a unique Purchase Order number. Please try again.");
}
