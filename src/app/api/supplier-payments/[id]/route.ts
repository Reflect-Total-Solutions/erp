import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { Decimal, formatCurrency } from "@/lib/financial";
import { logAuditEvent } from "@/lib/audit";
import { checkSessionPermission } from "@/lib/permissions";
import { canUserAccessRecord } from "@/lib/data-visibility";
import {
  diffCalendarDays,
  parseDateKeyToUtcMidnight,
  roundMoney,
  toDateKey,
} from "@/lib/supplier-payment-date";
import {
  VALID_PAYMENT_METHODS,
  serializeSupplierPayment,
  syncInvoicePaymentStateTx,
} from "@/lib/supplier-payment-helpers";
import { getOrCreateSupplierPaymentSettings } from "@/lib/supplier-payment-notifications";

class HttpPaymentActionError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// GET /api/supplier-payments/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access. Please log in." },
        { status: 401 }
      );
    }

    const canView = await checkSessionPermission(session, "supplierPayments", "view");
    if (!canView) {
      return NextResponse.json(
        { success: false, error: "Forbidden: You do not have permission to view payments." },
        { status: 403 }
      );
    }

    const { id } = await params;
    const db = getPrisma();
    if (!(db as any)?.supplierPayment) {
      return NextResponse.json(
        {
          success: false,
          code: "PRISMA_CLIENT_STALE",
          error:
            "Server Prisma Client cache is out of sync with prisma/schema.prisma. Please stop `npm run dev`, run `npx prisma generate`, and restart `npm run dev`.",
        },
        { status: 503 }
      );
    }
    const settings = await getOrCreateSupplierPaymentSettings(db);

    const payment = await db.supplierPayment.findUnique({
      where: { id },
      include: {
        supplierInvoice: true,
        supplier: true,
        job: true,
        createdBy: { select: { id: true, name: true } },
        updatedBy: { select: { id: true, name: true } },
        reversedBy: { select: { id: true, name: true } },
        auditLogs: {
          orderBy: { createdAt: "desc" },
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });

    if (!payment) {
      return NextResponse.json(
        { success: false, error: "Supplier payment not found." },
        { status: 404 }
      );
    }

    const ownerId = payment.createdById ?? payment.supplierInvoice?.createdById;
    const accessCheck = await canUserAccessRecord(session, "supplierPayments", ownerId, "view");
    if (!accessCheck.allowed) {
      return NextResponse.json(
        { success: false, error: accessCheck.reason || "Supplier payment not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: serializeSupplierPayment(payment, settings.timezone),
    });
  } catch (err: any) {
    console.error("GET /api/supplier-payments/[id] error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to load payment details." },
      { status: 500 }
    );
  }
}

// PATCH /api/supplier-payments/[id]
// Controlled EDIT or audited REVERSE of an existing Supplier Payment
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access. Please log in." },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await req.json();
    const action = String(body.action || "").toUpperCase();
    const reason = String(body.reason || "").trim();

    if (!["REVERSE", "EDIT"].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Unsupported action. Expected "REVERSE" or "EDIT".' },
        { status: 400 }
      );
    }

    if (reason.length < 3) {
      return NextResponse.json(
        {
          success: false,
          error: "A mandatory audit reason (at least 3 characters) is required.",
        },
        { status: 400 }
      );
    }

    const requiredActionPerm = action === "REVERSE" ? "reverse" : "edit";
    const hasPerm = await checkSessionPermission(
      session,
      "supplierPayments",
      requiredActionPerm
    );
    if (!hasPerm) {
      return NextResponse.json(
        {
          success: false,
          error: `Forbidden: You do not have permission to ${action.toLowerCase()} Supplier Payments.`,
        },
        { status: 403 }
      );
    }

    const db = getPrisma();
    if (!(db as any)?.supplierPayment || !(db as any)?.supplierPaymentAuditLog) {
      return NextResponse.json(
        {
          success: false,
          code: "PRISMA_CLIENT_STALE",
          error:
            "Server Prisma Client cache is out of sync with prisma/schema.prisma. Please stop `npm run dev`, run `npx prisma generate`, and restart `npm run dev`.",
        },
        { status: 503 }
      );
    }
    const settings = await getOrCreateSupplierPaymentSettings(db);

    const existing = await db.supplierPayment.findUnique({
      where: { id },
      include: {
        supplierInvoice: true,
        supplier: true,
        job: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Supplier payment not found." },
        { status: 404 }
      );
    }

    const ownerId = existing.createdById ?? existing.supplierInvoice?.createdById;
    const recordAccess = await canUserAccessRecord(
      session,
      "supplierPayments",
      ownerId,
      requiredActionPerm
    );
    if (!recordAccess.allowed) {
      return NextResponse.json(
        {
          success: false,
          error:
            recordAccess.reason ||
            "Forbidden: You cannot modify payments outside your authorized scope.",
        },
        { status: 403 }
      );
    }

    if (existing.status === "REVERSED") {
      return NextResponse.json(
        {
          success: false,
          code: "PAYMENT_ALREADY_REVERSED",
          error: `Payment ${existing.paymentNumber} has already been reversed and cannot be modified.`,
        },
        { status: 400 }
      );
    }

    if (action === "REVERSE") {
      const outcome = await db.$transaction(
        async (tx) => {
          const current = await tx.supplierPayment.findUnique({
            where: { id },
            include: { supplierInvoice: true },
          });
          if (!current) throw new HttpPaymentActionError(404, "Payment not found.");
          if (current.status === "REVERSED") {
            throw new HttpPaymentActionError(
              400,
              `Payment ${current.paymentNumber} is already reversed.`,
              "PAYMENT_ALREADY_REVERSED"
            );
          }

          const reversed = await tx.supplierPayment.update({
            where: { id },
            data: {
              status: "REVERSED",
              reversedAt: new Date(),
              reversedById: session.userId,
              reversalReason: reason,
              updatedById: session.userId,
            },
            include: {
              supplierInvoice: true,
              supplier: true,
              job: true,
              createdBy: { select: { id: true, name: true } },
              reversedBy: { select: { id: true, name: true } },
            },
          });

          const synced = await syncInvoicePaymentStateTx(
            current.supplierInvoiceId,
            tx,
            settings.timezone
          );

          await tx.supplierPaymentAuditLog.create({
            data: {
              paymentId: id,
              invoiceId: current.supplierInvoiceId,
              userId: session.userId,
              action: "REVERSE",
              reason,
              previousData: {
                paymentStatus: "SUCCESS",
                amount: roundMoney(current.amount),
                invoiceStatus: current.supplierInvoice.status,
                invoicePaymentStatus: current.supplierInvoice.paymentStatus,
                invoicePaidAmount: roundMoney(current.supplierInvoice.paidAmount),
              },
              newData: {
                paymentStatus: "REVERSED",
                reversalReason: reason,
                invoiceStatus: synced.updated.status,
                invoicePaymentStatus: synced.derived.paymentStatus,
                invoicePaidAmount: synced.derived.paidAmount,
                outstandingBalance: synced.derived.outstandingBalance,
              },
            },
          });

          return { reversed, derived: synced.derived, invoiceNumber: current.supplierInvoice.invoiceNumber };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );

      await logAuditEvent({
        userId: session.userId,
        action: "REVERSE_SUPPLIER_PAYMENT",
        resource: "supplier-payments",
        resourceId: id,
        details: {
          paymentNumber: existing.paymentNumber,
          invoiceNumber: outcome.invoiceNumber,
          amount: roundMoney(existing.amount),
          reason,
          newInvoicePaymentStatus: outcome.derived.paymentStatus,
          newOutstandingBalance: outcome.derived.outstandingBalance,
        },
        req,
      });

      return NextResponse.json({
        success: true,
        message: `Payment ${existing.paymentNumber} reversed safely. Invoice balance restored to ${formatCurrency(outcome.derived.outstandingBalance)}.`,
        data: serializeSupplierPayment(outcome.reversed, settings.timezone),
        invoicePaymentSummary: outcome.derived,
      });
    }

    // action === "EDIT"
    const nextDateKey = body.paymentDate
      ? toDateKey(body.paymentDate)
      : toDateKey(existing.paymentDate);
    const parsedPaymentDate = parseDateKeyToUtcMidnight(nextDateKey);
    if (!nextDateKey || !parsedPaymentDate) {
      return NextResponse.json(
        { success: false, error: "Please provide a valid Payment Date (YYYY-MM-DD)." },
        { status: 400 }
      );
    }

    const nextMethod = body.paymentMethod
      ? String(body.paymentMethod).trim()
      : existing.paymentMethod;
    if (!VALID_PAYMENT_METHODS.includes(nextMethod as any)) {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported Payment Method "${nextMethod}".`,
        },
        { status: 400 }
      );
    }

    const nextAmountInput =
      body.amount !== undefined && body.amount !== null && body.amount !== ""
        ? body.amount
        : existing.amount;
    let nextAmountDec: Decimal;
    try {
      nextAmountDec = new Decimal(String(nextAmountInput));
    } catch {
      return NextResponse.json(
        { success: false, error: "Payment amount must be a valid number." },
        { status: 400 }
      );
    }
    if (!nextAmountDec.isFinite() || nextAmountDec.lte(0)) {
      return NextResponse.json(
        { success: false, error: "Payment amount must be greater than 0." },
        { status: 400 }
      );
    }

    const nextRef = Object.prototype.hasOwnProperty.call(body, "referenceNumber")
      ? String(body.referenceNumber || "").trim() || null
      : existing.referenceNumber;
    const nextBank = Object.prototype.hasOwnProperty.call(body, "bankAccountName")
      ? String(body.bankAccountName || "").trim() || null
      : existing.bankAccountName;
    const nextNotes = Object.prototype.hasOwnProperty.call(body, "notes")
      ? String(body.notes || "").trim() || null
      : existing.notes;

    const editOutcome = await db.$transaction(
      async (tx) => {
        const current = await tx.supplierPayment.findUnique({
          where: { id },
          include: {
            supplierInvoice: {
              include: {
                payments: {
                  where: { status: "SUCCESS", id: { not: id } },
                  select: { id: true, amount: true },
                },
              },
            },
          },
        });
        if (!current) throw new HttpPaymentActionError(404, "Payment not found.");
        if (current.status === "REVERSED") {
          throw new HttpPaymentActionError(400, "Cannot edit a reversed payment.");
        }
        if (current.supplierInvoice.status === "CANCELLED") {
          throw new HttpPaymentActionError(
            422,
            "Cannot edit payments belonging to a cancelled invoice."
          );
        }

        const invDateKey = toDateKey(current.supplierInvoice.invoiceDate);
        if (invDateKey && diffCalendarDays(invDateKey, nextDateKey) < 0) {
          const canOverride = await checkSessionPermission(
            session,
            "supplierPayments",
            "overrideDueDate"
          );
          if (!canOverride) {
            throw new HttpPaymentActionError(
              422,
              `Payment Date (${nextDateKey}) cannot be earlier than Invoice Date (${invDateKey}).`
            );
          }
        }

        const otherPaidDec = current.supplierInvoice.payments.reduce(
          (sum, p) => sum.plus(new Decimal(p.amount || 0)),
          new Decimal(0)
        );
        const invoiceTotalDec = new Decimal(current.supplierInvoice.totalAmount || 0);
        const maxAllowedDec = invoiceTotalDec.minus(otherPaidDec);
        const roundedNewAmt = new Decimal(nextAmountDec.toFixed(2));

        if (roundedNewAmt.gt(maxAllowedDec.plus(0.001))) {
          throw new HttpPaymentActionError(
            422,
            `Updated payment amount (${formatCurrency(roundedNewAmt.toNumber())}) exceeds allowable invoice balance (${formatCurrency(maxAllowedDec.toNumber())}).`,
            "OVERPAYMENT_BLOCKED"
          );
        }

        const updatedPayment = await tx.supplierPayment.update({
          where: { id },
          data: {
            paymentDate: parsedPaymentDate,
            amount: roundedNewAmt.toFixed(2),
            paymentMethod: nextMethod,
            referenceNumber: nextRef,
            bankAccountName: nextBank,
            notes: nextNotes,
            correctionReason: reason,
            updatedById: session.userId,
          },
          include: {
            supplierInvoice: true,
            supplier: true,
            job: true,
            createdBy: { select: { id: true, name: true } },
            updatedBy: { select: { id: true, name: true } },
          },
        });

        const synced = await syncInvoicePaymentStateTx(
          current.supplierInvoiceId,
          tx,
          settings.timezone
        );

        await tx.supplierPaymentAuditLog.create({
          data: {
            paymentId: id,
            invoiceId: current.supplierInvoiceId,
            userId: session.userId,
            action: "EDIT",
            reason,
            previousData: {
              paymentDate: toDateKey(current.paymentDate),
              amount: roundMoney(current.amount),
              paymentMethod: current.paymentMethod,
              referenceNumber: current.referenceNumber,
              bankAccountName: current.bankAccountName,
              notes: current.notes,
            },
            newData: {
              paymentDate: nextDateKey,
              amount: roundedNewAmt.toNumber(),
              paymentMethod: nextMethod,
              referenceNumber: nextRef,
              bankAccountName: nextBank,
              notes: nextNotes,
              invoicePaymentStatus: synced.derived.paymentStatus,
              outstandingBalance: synced.derived.outstandingBalance,
            },
          },
        });

        return { updatedPayment, derived: synced.derived };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    await logAuditEvent({
      userId: session.userId,
      action: "EDIT_SUPPLIER_PAYMENT",
      resource: "supplier-payments",
      resourceId: id,
      details: {
        paymentNumber: existing.paymentNumber,
        oldAmount: roundMoney(existing.amount),
        newAmount: roundMoney(editOutcome.updatedPayment.amount),
        reason,
      },
      req,
    });

    return NextResponse.json({
      success: true,
      message: `Payment ${existing.paymentNumber} updated and audited successfully.`,
      data: serializeSupplierPayment(editOutcome.updatedPayment, settings.timezone),
      invoicePaymentSummary: editOutcome.derived,
    });
  } catch (err: any) {
    if (err instanceof HttpPaymentActionError) {
      return NextResponse.json(
        { success: false, code: err.code, error: err.message },
        { status: err.status }
      );
    }
    console.error("PATCH /api/supplier-payments/[id] error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to update Supplier Payment." },
      { status: 500 }
    );
  }
}
