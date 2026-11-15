import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { Decimal, formatCurrency } from "@/lib/financial";
import { logAuditEvent } from "@/lib/audit";
import { checkSessionPermission } from "@/lib/permissions";
import { canUserAccessRecord } from "@/lib/data-visibility";
import { validateAttachmentBuffer, MAX_ATTACHMENT_SIZE_BYTES } from "@/lib/file-validation";
import {
  SUPPLIER_PAYMENTS_BUCKET,
  cleanupOrphanedStorageFiles,
  uploadSupplierPaymentReceipt,
} from "@/lib/supabase";
import {
  diffCalendarDays,
  parseDateKeyToUtcMidnight,
  roundMoney,
  toDateKey,
} from "@/lib/supplier-payment-date";
import {
  VALID_PAYMENT_METHODS,
  buildSupplierInvoiceVisibilityForPayments,
  enrichInvoiceWithPaymentSummary,
  generateNextPaymentNumberTx,
  serializeSupplierPayment,
  syncInvoicePaymentStateTx,
} from "@/lib/supplier-payment-helpers";
import {
  emitPaymentRecordedNotification,
  getOrCreateSupplierPaymentSettings,
} from "@/lib/supplier-payment-notifications";

class HttpPaymentError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// GET /api/supplier-payments
// Loads eligible active (non-cancelled) Supplier Invoices with real-time derived payment state,
// countdown badges, filtering, search, and KPI summary totals.
export async function GET(req: NextRequest) {
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
        {
          success: false,
          error: "Forbidden: You do not have permission to view Supplier Payments.",
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() || "";
    const supplierId = searchParams.get("supplierId")?.trim() || "";
    const invoiceNumber = searchParams.get("invoiceNumber")?.trim() || "";
    const jobNumber = searchParams.get("jobNumber")?.trim() || "";
    const invoiceDateFrom = searchParams.get("invoiceDateFrom")?.trim() || "";
    const invoiceDateTo = searchParams.get("invoiceDateTo")?.trim() || "";
    const dueDateFrom = searchParams.get("dueDateFrom")?.trim() || "";
    const dueDateTo = searchParams.get("dueDateTo")?.trim() || "";
    const paymentStatusFilter = (searchParams.get("paymentStatus") || "ALL").toUpperCase();
    const outstandingOnly = searchParams.get("outstandingOnly") === "true";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "25", 10)));

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
    const [{ filter: visibilityFilter, scope }, settings] = await Promise.all([
      buildSupplierInvoiceVisibilityForPayments(session),
      getOrCreateSupplierPaymentSettings(db),
    ]);

    const where: any = {
      deletedAt: null,
      status: { not: "CANCELLED" },
    };

    if (visibilityFilter.createdById) {
      where.createdById = visibilityFilter.createdById;
    } else if (visibilityFilter.OR) {
      where.OR = visibilityFilter.OR;
    }

    if (supplierId && supplierId !== "all") {
      where.supplierId = supplierId;
    }

    if (invoiceNumber) {
      where.invoiceNumber = { contains: invoiceNumber, mode: "insensitive" };
    }

    if (jobNumber) {
      where.job = {
        OR: [
          { jobCode: { contains: jobNumber, mode: "insensitive" } },
          { name: { contains: jobNumber, mode: "insensitive" } },
        ],
      };
    }

    if (invoiceDateFrom || invoiceDateTo) {
      where.invoiceDate = {};
      if (invoiceDateFrom) {
        const dt = parseDateKeyToUtcMidnight(invoiceDateFrom);
        if (dt) where.invoiceDate.gte = dt;
      }
      if (invoiceDateTo) {
        const dt = parseDateKeyToUtcMidnight(invoiceDateTo);
        if (dt) {
          dt.setUTCHours(23, 59, 59, 999);
          where.invoiceDate.lte = dt;
        }
      }
    }

    if (dueDateFrom || dueDateTo) {
      where.paymentDueDate = {};
      if (dueDateFrom) {
        const dt = parseDateKeyToUtcMidnight(dueDateFrom);
        if (dt) where.paymentDueDate.gte = dt;
      }
      if (dueDateTo) {
        const dt = parseDateKeyToUtcMidnight(dueDateTo);
        if (dt) {
          dt.setUTCHours(23, 59, 59, 999);
          where.paymentDueDate.lte = dt;
        }
      }
    }

    if (search) {
      const searchConds = [
        { invoiceNumber: { contains: search, mode: "insensitive" } },
        { supplier: { name: { contains: search, mode: "insensitive" } } },
        { supplier: { code: { contains: search, mode: "insensitive" } } },
        { job: { jobCode: { contains: search, mode: "insensitive" } } },
        { job: { name: { contains: search, mode: "insensitive" } } },
        { paymentTerms: { contains: search, mode: "insensitive" } },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchConds }];
        delete where.OR;
      } else {
        where.OR = searchConds;
      }
    }

    const invoices = await db.supplierInvoice.findMany({
      where,
      orderBy: [{ paymentDueDate: "asc" }, { invoiceDate: "desc" }],
      include: {
        supplier: {
          select: { id: true, code: true, name: true, phone: true, email: true },
        },
        job: {
          select: { id: true, jobCode: true, name: true, clientName: true, status: true },
        },
        payments: {
          orderBy: { paymentDate: "desc" },
          include: {
            createdBy: { select: { id: true, name: true } },
            reversedBy: { select: { id: true, name: true } },
          },
        },
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    const enriched = invoices.map((inv) => {
      const paymentSummary = enrichInvoiceWithPaymentSummary(inv, settings.timezone);
      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        supplierId: inv.supplierId,
        supplierName: inv.supplier?.name || "Unknown Supplier",
        supplierCode: inv.supplier?.code || "—",
        jobId: inv.jobId,
        jobCode: inv.job?.jobCode || "—",
        jobName: inv.job?.name || "General Job",
        clientName: inv.job?.clientName || "—",
        invoiceDate: toDateKey(inv.invoiceDate) || "",
        status: inv.status,
        notes: inv.notes || "",
        createdById: inv.createdById || null,
        createdByName: inv.createdBy?.name || "System",
        ...paymentSummary,
        payments: inv.payments.map((p) =>
          serializeSupplierPayment(
            { ...p, supplierInvoice: inv, supplier: inv.supplier, job: inv.job },
            settings.timezone
          )
        ),
      };
    });

    // Calculate KPIs across matching non-cancelled scope before derived-status slicing
    let totalPayableAmount = 0;
    let totalPaidAmount = 0;
    let totalOutstandingAmount = 0;
    let overdueCount = 0;
    let overdueAmount = 0;
    let unpaidCount = 0;
    let partiallyPaidCount = 0;
    let paidCount = 0;
    let dueSoonCount = 0;

    for (const item of enriched) {
      totalPayableAmount = roundMoney(totalPayableAmount + item.totalAmount);
      totalPaidAmount = roundMoney(totalPaidAmount + item.paidAmount);
      totalOutstandingAmount = roundMoney(totalOutstandingAmount + item.outstandingBalance);

      if (item.paymentStatus === "PAID") paidCount++;
      else if (item.paymentStatus === "OVERDUE") {
        overdueCount++;
        overdueAmount = roundMoney(overdueAmount + item.outstandingBalance);
      } else if (item.paymentStatus === "PARTIALLY_PAID") partiallyPaidCount++;
      else if (item.paymentStatus === "UNPAID") unpaidCount++;

      if (
        item.outstandingBalance > 0 &&
        !item.isOverdue &&
        item.countdown &&
        item.countdown.daysDelta >= 0 &&
        item.countdown.daysDelta <= 7
      ) {
        dueSoonCount++;
      }
    }

    const filtered = enriched.filter((item) => {
      if (outstandingOnly && item.outstandingBalance <= 0) {
        return false;
      }
      if (paymentStatusFilter !== "ALL") {
        if (paymentStatusFilter === "PARTIALLY_PAID") {
          return item.isPartiallyPaid;
        }
        if (paymentStatusFilter === "OVERDUE") {
          return item.isOverdue;
        }
        return item.paymentStatus === paymentStatusFilter;
      }
      return true;
    });

    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const paged = filtered.slice((page - 1) * limit, page * limit);

    return NextResponse.json({
      success: true,
      data: paged,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
      },
      summary: {
        totalInvoices: enriched.length,
        totalPayableAmount,
        totalPaidAmount,
        totalOutstandingAmount,
        overdueCount,
        overdueAmount,
        unpaidCount,
        partiallyPaidCount,
        paidCount,
        dueSoonCount,
      },
      meta: {
        timezone: settings.timezone,
        visibilityScope: scope,
      },
    });
  } catch (err: any) {
    console.error("GET /api/supplier-payments error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || "Failed to load Supplier Payments.",
      },
      { status: 500 }
    );
  }
}

// POST /api/supplier-payments
// Atomically records a partial or full payment against an active Supplier Invoice
// with Serializable isolation, idempotency protection, receipt storage, and notifications.
export async function POST(req: NextRequest) {
  let uploadedReceipt: { storagePath: string; bucketName: string } | null = null;

  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access. Please log in." },
        { status: 401 }
      );
    }

    const canCreate = await checkSessionPermission(session, "supplierPayments", "create");
    if (!canCreate) {
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden: You do not have permission to record Supplier Payments.",
        },
        { status: 403 }
      );
    }

    const contentType = req.headers.get("content-type") || "";
    let supplierInvoiceId = "";
    let paymentDateInput = "";
    let amountInput = "";
    let paymentMethod = "Bank Transfer";
    let referenceNumber: string | null = null;
    let bankAccountName: string | null = null;
    let notes: string | null = null;
    let idempotencyKey: string | null = null;
    let receiptFile: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      supplierInvoiceId = ((formData.get("supplierInvoiceId") as string) || "").trim();
      paymentDateInput = ((formData.get("paymentDate") as string) || "").trim();
      amountInput = String(formData.get("amount") || "").trim();
      paymentMethod = ((formData.get("paymentMethod") as string) || "Bank Transfer").trim();
      referenceNumber = ((formData.get("referenceNumber") as string) || "").trim() || null;
      bankAccountName = ((formData.get("bankAccountName") as string) || "").trim() || null;
      notes = ((formData.get("notes") as string) || "").trim() || null;
      idempotencyKey = ((formData.get("idempotencyKey") as string) || "").trim() || null;

      const f = formData.get("attachment") || formData.get("receipt") || formData.get("file");
      if (f instanceof File && f.size > 0) {
        receiptFile = f;
      }
    } else {
      const body = await req.json();
      supplierInvoiceId = String(body.supplierInvoiceId || "").trim();
      paymentDateInput = String(body.paymentDate || "").trim();
      amountInput = String(body.amount ?? "").trim();
      paymentMethod = String(body.paymentMethod || "Bank Transfer").trim();
      referenceNumber = body.referenceNumber ? String(body.referenceNumber).trim() : null;
      bankAccountName = body.bankAccountName ? String(body.bankAccountName).trim() : null;
      notes = body.notes ? String(body.notes).trim() : null;
      idempotencyKey = body.idempotencyKey ? String(body.idempotencyKey).trim() : null;
    }

    if (!supplierInvoiceId) {
      return NextResponse.json(
        { success: false, error: "Please select a Supplier Invoice." },
        { status: 400 }
      );
    }

    const paymentDateKey = toDateKey(paymentDateInput);
    const parsedPaymentDate = parseDateKeyToUtcMidnight(paymentDateKey);
    if (!paymentDateKey || !parsedPaymentDate) {
      return NextResponse.json(
        { success: false, error: "Please provide a valid Payment Date (YYYY-MM-DD)." },
        { status: 400 }
      );
    }

    let amountDec: Decimal;
    try {
      amountDec = new Decimal(amountInput);
    } catch {
      return NextResponse.json(
        { success: false, error: "Payment Amount must be a valid positive number." },
        { status: 400 }
      );
    }

    if (!amountDec.isFinite() || amountDec.lte(0)) {
      return NextResponse.json(
        { success: false, error: "Payment Amount must be greater than 0." },
        { status: 400 }
      );
    }

    if (!VALID_PAYMENT_METHODS.includes(paymentMethod as any)) {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported Payment Method "${paymentMethod}". Allowed methods: ${VALID_PAYMENT_METHODS.join(", ")}.`,
        },
        { status: 400 }
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

    // Idempotency fast-path: return existing record safely on accidental retry/double click
    if (idempotencyKey) {
      const existingByKey = await db.supplierPayment.findUnique({
        where: { idempotencyKey },
        include: {
          supplierInvoice: true,
          supplier: true,
          job: true,
          createdBy: { select: { id: true, name: true } },
        },
      });
      if (existingByKey) {
        return NextResponse.json({
          success: true,
          duplicate: true,
          message: `Payment "${existingByKey.paymentNumber}" was already recorded.`,
          data: serializeSupplierPayment(existingByKey),
        });
      }
    }

    // Preliminary invoice lookup before receipt upload so storage uses real codes and fails fast if ineligible
    const preInvoice = await db.supplierInvoice.findFirst({
      where: { id: supplierInvoiceId, deletedAt: null },
      include: {
        supplier: { select: { id: true, code: true, name: true } },
        job: { select: { id: true, jobCode: true, name: true } },
      },
    });

    if (!preInvoice) {
      return NextResponse.json(
        { success: false, error: "Supplier Invoice not found." },
        { status: 404 }
      );
    }

    if (preInvoice.status === "CANCELLED") {
      return NextResponse.json(
        {
          success: false,
          code: "CANCELLED_INVOICE_PAYMENT_BLOCKED",
          error: "Payments cannot be recorded against a Cancelled Supplier Invoice.",
        },
        { status: 422 }
      );
    }

    const accessCheck = await canUserAccessRecord(
      session,
      "supplierPayments",
      preInvoice.createdById,
      "create"
    );
    if (!accessCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error:
            accessCheck.reason ||
            "Forbidden: You cannot record payments for this Supplier Invoice.",
        },
        { status: 403 }
      );
    }

    const settings = await getOrCreateSupplierPaymentSettings(db);

    // Validate & upload optional receipt attachment
    let receiptMeta: {
      attachmentName: string;
      attachmentOriginalName: string;
      attachmentBucket: string;
      attachmentStoragePath: string;
      attachmentSize: string;
      attachmentMimeType: string;
    } | null = null;

    if (receiptFile) {
      const buffer = Buffer.from(await receiptFile.arrayBuffer());
      const validation = validateAttachmentBuffer(
        buffer,
        receiptFile.name,
        MAX_ATTACHMENT_SIZE_BYTES
      );
      if (!validation.isValid) {
        return NextResponse.json(
          { success: false, error: `Receipt Attachment Error: ${validation.error}` },
          { status: 400 }
        );
      }

      const uploadRes = await uploadSupplierPaymentReceipt({
        buffer,
        originalName: validation.sanitizedName,
        supplierCode: preInvoice.supplier?.code || "SUP",
        invoiceNumber: preInvoice.invoiceNumber,
        paymentNumber: `PRE-${Date.now()}`,
        contentType: validation.mimeType,
        bucket: SUPPLIER_PAYMENTS_BUCKET,
      });

      if (!uploadRes.success) {
        return NextResponse.json(
          {
            success: false,
            error: `Failed to upload receipt to storage: ${uploadRes.error}`,
          },
          { status: 500 }
        );
      }

      uploadedReceipt = {
        storagePath: uploadRes.storagePath,
        bucketName: uploadRes.bucketName,
      };
      receiptMeta = {
        attachmentName: uploadRes.fileName,
        attachmentOriginalName: uploadRes.originalFileName,
        attachmentBucket: uploadRes.bucketName,
        attachmentStoragePath: uploadRes.storagePath,
        attachmentSize: uploadRes.fileSize,
        attachmentMimeType: validation.mimeType,
      };
    }

    // Atomic Serializable Transaction with serialization-conflict retry (prevents concurrent overpayments)
    let txOutcome: any = null;
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        txOutcome = await db.$transaction(
          async (tx) => {
            if (idempotencyKey) {
              const dup = await tx.supplierPayment.findUnique({
                where: { idempotencyKey },
                include: {
                  supplierInvoice: true,
                  supplier: true,
                  job: true,
                  createdBy: { select: { id: true, name: true } },
                },
              });
              if (dup) {
                return { duplicatePayment: dup };
              }
            }

            const txInvoice = await tx.supplierInvoice.findFirst({
              where: { id: supplierInvoiceId, deletedAt: null },
              include: {
                supplier: { select: { id: true, code: true, name: true } },
                job: { select: { id: true, jobCode: true, name: true } },
                payments: {
                  where: { status: "SUCCESS" },
                  select: { id: true, amount: true, status: true, paymentDate: true },
                },
              },
            });

            if (!txInvoice) {
              throw new HttpPaymentError(404, "Supplier Invoice not found.");
            }
            if (txInvoice.status === "CANCELLED") {
              throw new HttpPaymentError(
                422,
                "Cancelled Supplier Invoices cannot receive payments.",
                "CANCELLED_INVOICE_PAYMENT_BLOCKED"
              );
            }

            // Warn/Guard against payment earlier than invoice date unless overrideDueDate perm
            const invDateKey = toDateKey(txInvoice.invoiceDate);
            if (invDateKey && diffCalendarDays(invDateKey, paymentDateKey) < 0) {
              const canOverride = await checkSessionPermission(
                session,
                "supplierPayments",
                "overrideDueDate"
              );
              if (!canOverride) {
                throw new HttpPaymentError(
                  422,
                  `Payment Date (${paymentDateKey}) cannot be earlier than Invoice Date (${invDateKey}).`,
                  "PAYMENT_BEFORE_INVOICE_DATE"
                );
              }
            }

            const totalDec = new Decimal(txInvoice.totalAmount || 0);
            const alreadyPaidDec = txInvoice.payments.reduce(
              (acc, p) => acc.plus(new Decimal(p.amount || 0)),
              new Decimal(0)
            );
            const remainingDec = totalDec.minus(alreadyPaidDec);

            if (remainingDec.lte(0)) {
              throw new HttpPaymentError(
                422,
                `Invoice "${txInvoice.invoiceNumber}" is already fully paid. Outstanding balance is ${formatCurrency(0)}.`,
                "ALREADY_PAID"
              );
            }

            const roundedAmount = new Decimal(amountDec.toFixed(2));
            if (roundedAmount.gt(remainingDec.plus(0.001))) {
              throw new HttpPaymentError(
                422,
                `Payment amount (${formatCurrency(roundedAmount.toNumber())}) exceeds remaining outstanding balance (${formatCurrency(remainingDec.toNumber())}).`,
                "OVERPAYMENT_BLOCKED"
              );
            }

            const paymentNumber = await generateNextPaymentNumberTx(tx, parsedPaymentDate);

            const createdPayment = await tx.supplierPayment.create({
              data: {
                paymentNumber,
                supplierInvoiceId: txInvoice.id,
                supplierId: txInvoice.supplierId,
                jobId: txInvoice.jobId,
                paymentDate: parsedPaymentDate,
                amount: roundedAmount.toFixed(2),
                paymentMethod,
                referenceNumber,
                bankAccountName,
                notes,
                idempotencyKey,
                status: "SUCCESS",
                createdById: session.userId,
                ...(receiptMeta || {}),
              },
              include: {
                supplierInvoice: true,
                supplier: { select: { id: true, code: true, name: true } },
                job: { select: { id: true, jobCode: true, name: true } },
                createdBy: { select: { id: true, name: true } },
              },
            });

            const synced = await syncInvoicePaymentStateTx(
              txInvoice.id,
              tx,
              settings.timezone
            );

            await tx.supplierPaymentAuditLog.create({
              data: {
                paymentId: createdPayment.id,
                invoiceId: txInvoice.id,
                userId: session.userId,
                action: "CREATE",
                reason:
                  notes ||
                  `Recorded ${paymentMethod} payment of ${formatCurrency(roundedAmount.toNumber())}`,
                previousData: {
                  paidAmount: alreadyPaidDec.toNumber(),
                  outstandingBalance: remainingDec.toNumber(),
                  paymentStatus: txInvoice.paymentStatus,
                },
                newData: {
                  paymentNumber,
                  amount: roundedAmount.toNumber(),
                  paymentDate: paymentDateKey,
                  paymentMethod,
                  referenceNumber,
                  bankAccountName,
                  paidAmount: synced.derived.paidAmount,
                  outstandingBalance: synced.derived.outstandingBalance,
                  paymentStatus: synced.derived.paymentStatus,
                },
              },
            });

            return {
              duplicatePayment: null,
              payment: createdPayment,
              invoice: txInvoice,
              derived: synced.derived,
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
        break;
      } catch (txErr: any) {
        const isSerializationError =
          txErr?.code === "P2034" ||
          String(txErr?.message || "").includes("40001") ||
          String(txErr?.message || "").toLowerCase().includes("could not serialize access");
        if (isSerializationError && attempt < maxAttempts) {
          continue;
        }
        throw txErr;
      }
    }

    if (txOutcome?.duplicatePayment) {
      if (uploadedReceipt) {
        await cleanupOrphanedStorageFiles(
          [uploadedReceipt.storagePath],
          uploadedReceipt.bucketName
        );
      }
      return NextResponse.json({
        success: true,
        duplicate: true,
        message: `Payment "${txOutcome.duplicatePayment.paymentNumber}" was already recorded.`,
        data: serializeSupplierPayment(txOutcome.duplicatePayment, settings.timezone),
      });
    }

    const { payment, invoice: txInvoice, derived } = txOutcome;

    // Emit immediate Partial/Full payment in-app notification
    await emitPaymentRecordedNotification({
      client: db,
      settings,
      invoice: {
        id: txInvoice.id,
        invoiceNumber: txInvoice.invoiceNumber,
        supplierId: txInvoice.supplierId,
        supplierName: txInvoice.supplier?.name || "Supplier",
        jobCode: txInvoice.job?.jobCode,
        createdById: txInvoice.createdById,
      },
      payment: {
        id: payment.id,
        paymentNumber: payment.paymentNumber,
        amount: roundMoney(payment.amount),
        paymentDate: paymentDateKey,
      },
      derivedSummary: derived,
      actorName: session.name,
    }).catch((err) => console.warn("emitPaymentRecordedNotification warning:", err));

    await logAuditEvent({
      userId: session.userId,
      action: "RECORD_SUPPLIER_PAYMENT",
      resource: "supplier-payments",
      resourceId: payment.id,
      details: {
        paymentNumber: payment.paymentNumber,
        invoiceNumber: txInvoice.invoiceNumber,
        supplierName: txInvoice.supplier?.name,
        amount: roundMoney(payment.amount),
        paymentMethod,
        outstandingBalance: derived.outstandingBalance,
        paymentStatus: derived.paymentStatus,
      },
      req,
    });

    return NextResponse.json(
      {
        success: true,
        message:
          derived.paymentStatus === "PAID"
            ? `Payment ${payment.paymentNumber} recorded. Invoice ${txInvoice.invoiceNumber} is now Paid.`
            : `Partial payment ${payment.paymentNumber} recorded. Remaining balance: ${formatCurrency(derived.outstandingBalance)}.`,
        data: serializeSupplierPayment(payment, settings.timezone),
        invoicePaymentSummary: derived,
      },
      { status: 201 }
    );
  } catch (err: any) {
    if (uploadedReceipt) {
      await cleanupOrphanedStorageFiles(
        [uploadedReceipt.storagePath],
        uploadedReceipt.bucketName
      ).catch(() => {});
    }
    if (err instanceof HttpPaymentError) {
      return NextResponse.json(
        { success: false, code: err.code, error: err.message },
        { status: err.status }
      );
    }
    if (err?.code === "P2002") {
      return NextResponse.json(
        {
          success: false,
          code: "DUPLICATE_PAYMENT_SUBMISSION",
          error: "This payment submission was already processed.",
        },
        { status: 409 }
      );
    }
    console.error("POST /api/supplier-payments error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || "Internal server error recording Supplier Payment.",
      },
      { status: 500 }
    );
  }
}
