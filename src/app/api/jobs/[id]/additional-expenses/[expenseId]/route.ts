import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";
import { canUserAccessRecord } from "@/lib/data-visibility";
import { roundFinancial } from "@/lib/financial";
import { parseDateKeyToUtcMidnight, toDateKey } from "@/lib/supplier-payment-date";
import { recalculateJobFinances } from "@/lib/financial-recalculation";
import { logAuditEvent } from "@/lib/audit";
import {
  JOB_ADDITIONAL_EXPENSES_BUCKET,
  cleanupOrphanedStorageFiles,
  uploadJobAdditionalExpenseReceipt,
} from "@/lib/supabase";

const ALLOWED_EXTS = new Set([
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
]);
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function getFileExt(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx).toLowerCase() : "";
}

// PATCH /api/jobs/[id]/additional-expenses/[expenseId]
// Supports action = "EDIT" | "CANCEL"
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; expenseId: string }> }
) {
  let uploadedStoragePath: string | null = null;
  let uploadedBucket = JOB_ADDITIONAL_EXPENSES_BUCKET;

  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access. Please log in." },
        { status: 401 }
      );
    }

    const { id, expenseId } = await params;
    const db = getPrisma();

    if (!(db as any).jobAdditionalExpense) {
      return NextResponse.json(
        {
          success: false,
          error: "Prisma Client requires dev server restart (`npm run dev`) to update Additional Expenses.",
        },
        { status: 503 }
      );
    }

    const existing = await (db as any).jobAdditionalExpense.findUnique({
      where: { id: expenseId },
      include: {
        job: { select: { id: true, jobCode: true, submittedById: true, deletedAt: true } },
        supplier: { select: { id: true, name: true, code: true } },
      },
    });

    if (!existing || existing.jobId !== id || existing.job?.deletedAt) {
      return NextResponse.json(
        { success: false, error: "Additional Expense record not found." },
        { status: 404 }
      );
    }

    const vis = await canUserAccessRecord(
      session,
      "jobs",
      existing.job.submittedById,
      "view"
    );
    if (!vis.allowed) {
      return NextResponse.json(
        { success: false, error: vis.reason || "Forbidden: You cannot access this job." },
        { status: 403 }
      );
    }

    // Parse payload (JSON or multipart)
    let action = "EDIT";
    let cancellationReason = "";
    let editReason: string | null = null;
    let expenseDateStr = "";
    let category = "";
    let description = "";
    let amountRaw: unknown = undefined;
    let supplierId: string | null | undefined = undefined;
    let payeeName: string | null | undefined = undefined;
    let paymentReference: string | null | undefined = undefined;
    let notes: string | null | undefined = undefined;
    let removeAttachment = false;
    let confirmNotDuplicateInvoice = false;
    let receiptFile: File | null = null;

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      action = String(formData.get("action") || "EDIT").toUpperCase();
      cancellationReason = String(
        formData.get("cancellationReason") || formData.get("reason") || ""
      ).trim();
      editReason = String(formData.get("reason") || "").trim() || null;
      expenseDateStr = String(formData.get("expenseDate") || "");
      category = String(formData.get("category") || "").trim();
      description = String(formData.get("description") || "").trim();
      amountRaw = formData.get("amount");
      if (formData.has("supplierId")) {
        const sVal = String(formData.get("supplierId") || "").trim();
        supplierId = sVal || null;
      }
      if (formData.has("payeeName")) {
        payeeName = String(formData.get("payeeName") || "").trim() || null;
      }
      if (formData.has("paymentReference")) {
        paymentReference =
          String(formData.get("paymentReference") || "").trim() || null;
      }
      if (formData.has("notes")) {
        notes = String(formData.get("notes") || "").trim() || null;
      }
      removeAttachment = formData.get("removeAttachment") === "true";
      confirmNotDuplicateInvoice = formData.get("confirmNotDuplicateInvoice") === "true";
      const maybeFile = formData.get("receipt");
      if (maybeFile && maybeFile instanceof File && maybeFile.size > 0) {
        receiptFile = maybeFile;
      }
    } else {
      const body = await req.json();
      action = String(body?.action || "EDIT").toUpperCase();
      cancellationReason = String(
        body?.cancellationReason || body?.reason || ""
      ).trim();
      editReason = body?.reason ? String(body.reason).trim() : null;
      expenseDateStr = body?.expenseDate ? String(body.expenseDate) : "";
      category = body?.category ? String(body.category).trim() : "";
      description = body?.description ? String(body.description).trim() : "";
      amountRaw = body?.amount;
      if (body && "supplierId" in body) {
        supplierId = body.supplierId ? String(body.supplierId).trim() : null;
      }
      if (body && "payeeName" in body) {
        payeeName = body.payeeName ? String(body.payeeName).trim() : null;
      }
      if (body && "paymentReference" in body) {
        paymentReference = body.paymentReference
          ? String(body.paymentReference).trim()
          : null;
      }
      if (body && "notes" in body) {
        notes = body.notes ? String(body.notes).trim() : null;
      }
      removeAttachment = Boolean(body?.removeAttachment);
      confirmNotDuplicateInvoice = Boolean(body?.confirmNotDuplicateInvoice);
    }

    const previousSnapshot = {
      expenseDate: toDateKey(existing.expenseDate),
      category: existing.category,
      description: existing.description,
      amount: Number(existing.amount),
      supplierId: existing.supplierId,
      payeeName: existing.payeeName,
      paymentReference: existing.paymentReference,
      notes: existing.notes,
      status: existing.status,
      attachmentName: existing.attachmentName,
    };

    // ── CANCEL FLOW ──────────────────────────────────────────────────────────
    if (action === "CANCEL") {
      const canCancel = await checkSessionPermission(
        session,
        "jobs",
        "cancelAdditionalExpense"
      );
      if (!canCancel) {
        return NextResponse.json(
          {
            success: false,
            error: "Forbidden: You do not have permission to cancel Additional Expenses.",
          },
          { status: 403 }
        );
      }

      if (existing.status === "CANCELLED") {
        return NextResponse.json(
          { success: false, error: "This additional expense is already cancelled." },
          { status: 400 }
        );
      }

      if (!cancellationReason || cancellationReason.length < 3) {
        return NextResponse.json(
          {
            success: false,
            error: "Cancellation reason is mandatory (minimum 3 characters).",
          },
          { status: 422 }
        );
      }

      const cancelled = await db.$transaction(async (tx) => {
        const updated = await (tx as any).jobAdditionalExpense.update({
          where: { id: expenseId },
          data: {
            status: "CANCELLED",
            cancellationReason,
            cancelledAt: new Date(),
            cancelledById: session.userId,
            updatedById: session.userId,
          },
        });

        await (tx as any).jobAdditionalExpenseAuditLog.create({
          data: {
            expenseId,
            jobId: id,
            userId: session.userId,
            action: "CANCEL",
            reason: cancellationReason,
            previousData: previousSnapshot,
            newData: {
              ...previousSnapshot,
              status: "CANCELLED",
              cancellationReason,
            },
          },
        });

        await recalculateJobFinances(id, tx);
        return updated;
      });

      await logAuditEvent({
        userId: session.userId,
        action: "CANCEL_JOB_ADDITIONAL_EXPENSE",
        resource: "jobs",
        resourceId: id,
        details: {
          expenseId,
          cancellationReason,
          amount: Number(existing.amount),
        },
      });

      return NextResponse.json({
        success: true,
        message: "Additional Expense cancelled and excluded from Job P&L totals.",
        data: cancelled,
      });
    }

    // ── EDIT FLOW ────────────────────────────────────────────────────────────
    const canEdit = await checkSessionPermission(
      session,
      "jobs",
      "editAdditionalExpense"
    );
    if (!canEdit) {
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden: You do not have permission to edit Additional Expenses.",
        },
        { status: 403 }
      );
    }

    if (existing.status === "CANCELLED") {
      return NextResponse.json(
        {
          success: false,
          error: "Cancelled additional expenses cannot be edited (audit history is immutable).",
        },
        { status: 422 }
      );
    }

    const nextDateKey = expenseDateStr
      ? toDateKey(expenseDateStr)
      : toDateKey(existing.expenseDate);
    const nextDateObj = parseDateKeyToUtcMidnight(nextDateKey);
    if (!nextDateObj) {
      return NextResponse.json(
        { success: false, error: "Valid Expense Date is required." },
        { status: 422 }
      );
    }

    const nextCategory = category || existing.category;
    const nextDescription = description || existing.description;
    const nextAmountDec =
      amountRaw !== undefined && amountRaw !== null && amountRaw !== ""
        ? roundFinancial(amountRaw, 2)
        : roundFinancial(existing.amount, 2);

    if (nextAmountDec.lte(0)) {
      return NextResponse.json(
        { success: false, error: "Expense Amount must be greater than 0.00." },
        { status: 422 }
      );
    }

    const nextSupplierId =
      supplierId !== undefined ? supplierId : existing.supplierId;
    const nextPayeeName =
      payeeName !== undefined ? payeeName : existing.payeeName;
    const nextPaymentRef =
      paymentReference !== undefined ? paymentReference : existing.paymentReference;
    const nextNotes = notes !== undefined ? notes : existing.notes;

    if (nextSupplierId) {
      const supExists = await db.supplier.findFirst({
        where: { id: nextSupplierId, deletedAt: null },
        select: { id: true },
      });
      if (!supExists) {
        return NextResponse.json(
          { success: false, error: "Selected Supplier was not found." },
          { status: 404 }
        );
      }
    }

    // Double-counting check on edited values
    const activeJobInvoices = await db.supplierInvoice.findMany({
      where: {
        jobId: id,
        deletedAt: null,
        status: { not: "CANCELLED" },
      },
      select: {
        id: true,
        invoiceNumber: true,
        supplierId: true,
        totalAmount: true,
        supplier: { select: { name: true } },
      },
    });

    if (nextPaymentRef) {
      const normalizedRef = nextPaymentRef.toLowerCase();
      const refMatch = activeJobInvoices.find(
        (inv) => inv.invoiceNumber.toLowerCase() === normalizedRef
      );
      if (refMatch) {
        return NextResponse.json(
          {
            success: false,
            doubleCountBlocked: true,
            error: `Reference "${nextPaymentRef}" matches active Supplier Invoice ${refMatch.invoiceNumber} on this Job. Update blocked to prevent double counting.`,
          },
          { status: 409 }
        );
      }
    }

    if (nextSupplierId && !confirmNotDuplicateInvoice) {
      const possibleDuplicate = activeJobInvoices.find(
        (inv) =>
          inv.supplierId === nextSupplierId &&
          roundFinancial(inv.totalAmount, 2).eq(nextAmountDec)
      );
      if (possibleDuplicate) {
        return NextResponse.json(
          {
            success: false,
            requiresConfirmation: true,
            matchingInvoiceNumber: possibleDuplicate.invoiceNumber,
            error: `An active Supplier Invoice (${possibleDuplicate.invoiceNumber}) already exists for ${possibleDuplicate.supplier?.name || "this supplier"} on this Job with exact amount ${nextAmountDec.toFixed(
              2
            )}. Confirm if this is a separate additional expense.`,
          },
          { status: 409 }
        );
      }
    }

    let attachmentPatch: Record<string, string | null> = {};
    if (receiptFile) {
      if (receiptFile.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { success: false, error: "Receipt attachment exceeds the 10MB file size limit." },
          { status: 422 }
        );
      }
      const ext = getFileExt(receiptFile.name);
      if (!ALLOWED_EXTS.has(ext)) {
        return NextResponse.json(
          { success: false, error: `Unsupported receipt file type "${ext}".` },
          { status: 422 }
        );
      }
      const buffer = Buffer.from(await receiptFile.arrayBuffer());
      const uploadRes = await uploadJobAdditionalExpenseReceipt({
        buffer,
        originalName: receiptFile.name,
        jobCode: existing.job?.jobCode || id,
        contentType: receiptFile.type || "application/octet-stream",
      });
      if (!uploadRes.success) {
        return NextResponse.json(
          { success: false, error: uploadRes.error || "Failed to upload receipt file." },
          { status: 500 }
        );
      }
      uploadedStoragePath = uploadRes.storagePath;
      uploadedBucket = uploadRes.bucketName;
      attachmentPatch = {
        attachmentName: uploadRes.fileName,
        attachmentOriginalName: uploadRes.originalFileName,
        attachmentBucket: uploadRes.bucketName,
        attachmentStoragePath: uploadRes.storagePath,
        attachmentSize: uploadRes.fileSize,
        attachmentMimeType: uploadRes.mimeType,
      };
    } else if (removeAttachment) {
      attachmentPatch = {
        attachmentName: null,
        attachmentOriginalName: null,
        attachmentStoragePath: null,
        attachmentSize: null,
        attachmentMimeType: null,
      };
    }

    const updated = await db.$transaction(async (tx) => {
      const exp = await (tx as any).jobAdditionalExpense.update({
        where: { id: expenseId },
        data: {
          expenseDate: nextDateObj,
          category: nextCategory,
          description: nextDescription,
          amount: nextAmountDec.toFixed(2),
          supplierId: nextSupplierId,
          payeeName: nextPayeeName,
          paymentReference: nextPaymentRef,
          notes: nextNotes,
          updatedById: session.userId,
          ...attachmentPatch,
        },
        include: {
          supplier: { select: { id: true, code: true, name: true } },
        },
      });

      await (tx as any).jobAdditionalExpenseAuditLog.create({
        data: {
          expenseId,
          jobId: id,
          userId: session.userId,
          action: "EDIT",
          reason: editReason,
          previousData: previousSnapshot,
          newData: {
            expenseDate: nextDateKey,
            category: nextCategory,
            description: nextDescription,
            amount: nextAmountDec.toNumber(),
            supplierId: nextSupplierId,
            payeeName: nextPayeeName,
            paymentReference: nextPaymentRef,
            notes: nextNotes,
            attachmentName: exp.attachmentName || null,
          },
        },
      });

      await recalculateJobFinances(id, tx);
      return exp;
    });

    await logAuditEvent({
      userId: session.userId,
      action: "EDIT_JOB_ADDITIONAL_EXPENSE",
      resource: "jobs",
      resourceId: id,
      details: {
        expenseId,
        previousAmount: Number(existing.amount),
        newAmount: nextAmountDec.toNumber(),
        reason: editReason,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Additional Expense updated and Job P&L recalculated.",
      data: updated,
    });
  } catch (err: any) {
    if (uploadedStoragePath) {
      await cleanupOrphanedStorageFiles([uploadedStoragePath], uploadedBucket);
    }
    console.error("PATCH /api/jobs/[id]/additional-expenses/[expenseId] error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to update additional expense." },
      { status: 500 }
    );
  }
}
