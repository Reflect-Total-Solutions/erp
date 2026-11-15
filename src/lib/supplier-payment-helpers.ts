/**
 * Server-side helpers for Supplier Payments, balance synchronization,
 * sequential payment numbering, visibility filtering, and DTO serialization.
 *
 * CRITICAL ACCOUNTING INVARIANT:
 * Supplier Payments track cash settlement against Supplier Invoices only.
 * They MUST NOT mutate Job costs, Purchase Order commitments, or Profit & Loss.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { buildRecordVisibilityFilter } from "@/lib/data-visibility";
import {
  DEFAULT_COMPANY_TIMEZONE,
  computeDerivedPaymentSummary,
  roundMoney,
  toDateKey,
} from "@/lib/supplier-payment-date";

export const VALID_PAYMENT_METHODS = [
  "Bank Transfer",
  "Cash",
  "Cheque",
  "Online Transfer",
  "Other",
] as const;

export const ALLOWED_PAYMENT_TRANSITIONS = new Set(["SUCCESS", "REVERSED"]);

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Generates sequential unique Payment Number: PAY-YYYY-NNNN
 */
export async function generateNextPaymentNumberTx(
  tx: DbClient,
  referenceDate: Date = new Date()
): Promise<string> {
  const year = referenceDate.getUTCFullYear() || new Date().getUTCFullYear();
  const prefix = `PAY-${year}-`;

  const existing = await tx.supplierPayment.findMany({
    where: {
      paymentNumber: { startsWith: prefix },
    },
    select: { paymentNumber: true },
  });

  let maxSeq = 0;
  for (const row of existing) {
    const suffix = row.paymentNumber.slice(prefix.length);
    const num = parseInt(suffix, 10);
    if (Number.isFinite(num) && num > maxSeq) {
      maxSeq = num;
    }
  }

  let candidateSeq = maxSeq + 1;
  while (true) {
    const candidate = `${prefix}${String(candidateSeq).padStart(4, "0")}`;
    const conflict = await tx.supplierPayment.findUnique({
      where: { paymentNumber: candidate },
      select: { id: true },
    });
    if (!conflict) {
      return candidate;
    }
    candidateSeq++;
  }
}

/**
 * Recomputes paidAmount, paymentStatus, lastPaymentDate, and invoice status ("APPROVED" <-> "PAID")
 * inside a database transaction without ever altering Job costs or P&L.
 */
export async function syncInvoicePaymentStateTx(
  invoiceId: string,
  tx: DbClient = getPrisma(),
  timezone: string = DEFAULT_COMPANY_TIMEZONE
) {
  const invoice = await tx.supplierInvoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      invoiceNumber: true,
      invoiceDate: true,
      paymentDueDate: true,
      totalAmount: true,
      status: true,
      payments: {
        where: { status: "SUCCESS" },
        select: {
          id: true,
          amount: true,
          status: true,
          paymentDate: true,
        },
      },
    },
  });

  if (!invoice) {
    throw new Error(`SupplierInvoice ${invoiceId} not found during payment sync.`);
  }

  const derived = computeDerivedPaymentSummary({
    totalAmount: invoice.totalAmount,
    dueDate: invoice.paymentDueDate,
    invoiceDate: invoice.invoiceDate,
    invoiceStatus: invoice.status,
    payments: invoice.payments,
    timezone,
  });

  let nextInvoiceStatus = invoice.status;
  if (invoice.status !== "CANCELLED") {
    if (derived.paymentStatus === "PAID") {
      nextInvoiceStatus = "PAID";
    } else if (invoice.status === "PAID") {
      // If a reversal or increase restored outstanding balance > 0, return from PAID to APPROVED
      nextInvoiceStatus = "APPROVED";
    }
  }

  const lastPaymentDateObj = derived.lastPaymentDate
    ? new Date(`${derived.lastPaymentDate}T00:00:00.000Z`)
    : null;

  const updated = await tx.supplierInvoice.update({
    where: { id: invoiceId },
    data: {
      paidAmount: derived.paidAmount,
      paymentStatus: derived.paymentStatus,
      lastPaymentDate: lastPaymentDateObj,
      status: nextInvoiceStatus,
    },
  });

  return { updated, derived };
}

/**
 * Builds Prisma visibility filter for Supplier Invoices when queried from Supplier Payments.
 */
export async function buildSupplierInvoiceVisibilityForPayments(
  session: { userId?: string; roles?: string[]; email?: string } | null | undefined
) {
  return buildRecordVisibilityFilter(session, "supplierPayments", "createdById", true);
}

/**
 * Serializes a SupplierPayment Prisma row into clean API response DTO.
 */
export function serializeSupplierPayment(payment: any, timezone: string = DEFAULT_COMPANY_TIMEZONE) {
  const invTotal = payment.supplierInvoice
    ? roundMoney(payment.supplierInvoice.totalAmount)
    : undefined;
  const invPaid =
    payment.supplierInvoice && payment.supplierInvoice.paidAmount != null
      ? roundMoney(payment.supplierInvoice.paidAmount)
      : undefined;

  return {
    id: payment.id,
    paymentNumber: payment.paymentNumber,
    supplierInvoiceId: payment.supplierInvoiceId,
    invoiceNumber: payment.supplierInvoice?.invoiceNumber || undefined,
    invoiceDate: toDateKey(payment.supplierInvoice?.invoiceDate) || undefined,
    paymentDueDate:
      toDateKey(payment.supplierInvoice?.paymentDueDate) ||
      toDateKey(payment.supplierInvoice?.invoiceDate) ||
      null,
    invoiceTotalAmount: invTotal,
    invoicePaidAmount: invPaid,
    invoicePaymentStatus: payment.supplierInvoice?.paymentStatus || undefined,
    supplierId: payment.supplierId,
    supplierName: payment.supplier?.name || undefined,
    supplierCode: payment.supplier?.code || undefined,
    jobId: payment.jobId,
    jobCode: payment.job?.jobCode || undefined,
    jobName: payment.job?.name || undefined,
    paymentDate: toDateKey(payment.paymentDate) || "",
    amount: roundMoney(payment.amount),
    paymentMethod: payment.paymentMethod,
    referenceNumber: payment.referenceNumber ?? null,
    bankAccountName: payment.bankAccountName ?? null,
    notes: payment.notes ?? null,
    attachmentName: payment.attachmentName ?? null,
    attachmentOriginalName: payment.attachmentOriginalName ?? null,
    attachmentBucket: payment.attachmentBucket ?? "supplier-payments",
    attachmentStoragePath: payment.attachmentStoragePath ?? null,
    attachmentSize: payment.attachmentSize ?? null,
    attachmentMimeType: payment.attachmentMimeType ?? null,
    idempotencyKey: payment.idempotencyKey ?? null,
    status: payment.status,
    createdById: payment.createdById ?? null,
    createdByName: payment.createdBy?.name ?? null,
    updatedById: payment.updatedById ?? null,
    updatedByName: payment.updatedBy?.name ?? null,
    reversedAt: payment.reversedAt ? new Date(payment.reversedAt).toISOString() : null,
    reversedById: payment.reversedById ?? null,
    reversedByName: payment.reversedBy?.name ?? null,
    reversalReason: payment.reversalReason ?? null,
    correctionReason: payment.correctionReason ?? null,
    auditLogs: Array.isArray(payment.auditLogs)
      ? payment.auditLogs.map((log: any) => ({
          id: log.id,
          paymentId: log.paymentId ?? null,
          invoiceId: log.invoiceId ?? null,
          userId: log.userId ?? null,
          userName: log.user?.name || "System",
          action: log.action,
          reason: log.reason ?? null,
          previousData: log.previousData ?? null,
          newData: log.newData ?? null,
          createdAt: new Date(log.createdAt).toISOString(),
        }))
      : undefined,
    createdAt: new Date(payment.createdAt).toISOString(),
    updatedAt: new Date(payment.updatedAt).toISOString(),
    timezone,
  };
}

/**
 * Enriches a serialized SupplierInvoice object with derived due-date countdown,
 * paidAmount, outstandingBalance, paymentStatus, and payment history summary.
 */
export function enrichInvoiceWithPaymentSummary(
  inv: any,
  timezone: string = DEFAULT_COMPANY_TIMEZONE
) {
  const activePayments = Array.isArray(inv.payments)
    ? inv.payments
    : undefined;

  const derived = computeDerivedPaymentSummary({
    totalAmount: inv.totalAmount,
    paidAmount: inv.paidAmount,
    dueDate: inv.paymentDueDate,
    invoiceDate: inv.invoiceDate,
    invoiceStatus: inv.status,
    payments: activePayments,
    lastPaymentDate: inv.lastPaymentDate,
    timezone,
  });

  return {
    totalAmount: derived.totalAmount,
    paymentDueDate: toDateKey(inv.paymentDueDate) || toDateKey(inv.invoiceDate) || null,
    paymentTerms: inv.paymentTerms ?? null,
    creditPeriodDays: inv.creditPeriodDays ?? null,
    paymentStatus: derived.paymentStatus,
    paidAmount: derived.paidAmount,
    outstandingBalance: derived.outstandingBalance,
    lastPaymentDate: derived.lastPaymentDate,
    isPartiallyPaid: derived.isPartiallyPaid,
    isOverdue: derived.isOverdue,
    countdown: derived.countdown,
    paymentCount: Array.isArray(inv.payments)
      ? inv.payments.filter((p: any) => p.status === "SUCCESS").length
      : typeof inv._count?.payments === "number"
      ? inv._count.payments
      : 0,
  };
}
