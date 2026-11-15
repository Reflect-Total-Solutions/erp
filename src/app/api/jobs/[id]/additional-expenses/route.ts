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
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

function getFileExt(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx).toLowerCase() : "";
}

// GET /api/jobs/[id]/additional-expenses
export async function GET(
  _req: NextRequest,
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

    const [
      canViewJobs,
      canViewSummary,
      canCreate,
      canEdit,
      canCancel,
    ] = await Promise.all([
      checkSessionPermission(session, "jobs", "view"),
      checkSessionPermission(session, "jobs", "viewFinancialSummary"),
      checkSessionPermission(session, "jobs", "createAdditionalExpense"),
      checkSessionPermission(session, "jobs", "editAdditionalExpense"),
      checkSessionPermission(session, "jobs", "cancelAdditionalExpense"),
    ]);

    if (!canViewJobs || (!canViewSummary && !canCreate && !canEdit && !canCancel)) {
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden: You do not have permission to view Additional Job Expenses.",
        },
        { status: 403 }
      );
    }

    const { id } = await params;
    const db = getPrisma();

    const job = await db.job.findUnique({
      where: { id },
      select: { id: true, submittedById: true, deletedAt: true },
    });

    if (!job || job.deletedAt) {
      return NextResponse.json(
        { success: false, error: "Job not found." },
        { status: 404 }
      );
    }

    const vis = await canUserAccessRecord(session, "jobs", job.submittedById, "view");
    if (!vis.allowed) {
      return NextResponse.json(
        { success: false, error: vis.reason || "Job not found." },
        { status: 404 }
      );
    }

    const expenseModel = (db as any).jobAdditionalExpense;
    if (!expenseModel) {
      return NextResponse.json(
        {
          success: false,
          error: "Additional Expenses model unavailable in memory. Restart `npm run dev` to refresh Prisma Client.",
        },
        { status: 503 }
      );
    }

    const rows = await expenseModel.findMany({
      where: { jobId: id },
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      include: {
        supplier: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
        cancelledBy: { select: { id: true, name: true, email: true } },
        auditLogs: {
          orderBy: { createdAt: "desc" },
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });

    const formatted = rows.map((exp: any) => ({
      id: exp.id,
      jobId: exp.jobId,
      expenseDate: toDateKey(exp.expenseDate) || "",
      category: exp.category,
      description: exp.description,
      amount: Number(exp.amount || 0),
      supplierId: exp.supplierId || null,
      supplierName: exp.supplier?.name || null,
      supplierCode: exp.supplier?.code || null,
      payeeName: exp.payeeName || null,
      paymentReference: exp.paymentReference || null,
      linkedSupplierInvoiceId: exp.linkedSupplierInvoiceId || null,
      attachmentName: exp.attachmentName || null,
      attachmentOriginalName: exp.attachmentOriginalName || null,
      attachmentBucket: exp.attachmentBucket || null,
      attachmentStoragePath: exp.attachmentStoragePath || null,
      attachmentSize: exp.attachmentSize || null,
      attachmentMimeType: exp.attachmentMimeType || null,
      notes: exp.notes || null,
      status: exp.status,
      cancellationReason: exp.cancellationReason || null,
      cancelledAt: exp.cancelledAt ? new Date(exp.cancelledAt).toISOString() : null,
      cancelledById: exp.cancelledById || null,
      cancelledByName: exp.cancelledBy?.name || null,
      createdById: exp.createdById || null,
      createdByName: exp.createdBy?.name || null,
      updatedById: exp.updatedById || null,
      updatedByName: exp.updatedBy?.name || null,
      auditLogs: (exp.auditLogs || []).map((log: any) => ({
        id: log.id,
        expenseId: log.expenseId,
        jobId: log.jobId,
        userId: log.userId || null,
        userName: log.user?.name || "System",
        action: log.action,
        reason: log.reason || null,
        previousData: log.previousData,
        newData: log.newData,
        createdAt: log.createdAt ? new Date(log.createdAt).toISOString() : "",
      })),
      createdAt: exp.createdAt ? new Date(exp.createdAt).toISOString() : "",
      updatedAt: exp.updatedAt ? new Date(exp.updatedAt).toISOString() : "",
    }));

    return NextResponse.json({
      success: true,
      data: formatted,
    });
  } catch (err: any) {
    console.error("GET /api/jobs/[id]/additional-expenses error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to retrieve additional expenses." },
      { status: 500 }
    );
  }
}

// POST /api/jobs/[id]/additional-expenses
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const canCreate = await checkSessionPermission(session, "jobs", "createAdditionalExpense");
    if (!canCreate) {
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden: You do not have permission to create Additional Expenses.",
        },
        { status: 403 }
      );
    }

    const { id } = await params;
    const db = getPrisma();

    if (!(db as any).jobAdditionalExpense) {
      return NextResponse.json(
        {
          success: false,
          error: "Prisma Client requires dev server restart (`npm run dev`) to create Additional Expenses.",
        },
        { status: 503 }
      );
    }

    const job = await db.job.findUnique({
      where: { id },
      select: {
        id: true,
        jobCode: true,
        name: true,
        status: true,
        deletedAt: true,
        submittedById: true,
      },
    });

    if (!job || job.deletedAt) {
      return NextResponse.json(
        { success: false, error: "Job not found." },
        { status: 404 }
      );
    }

    const vis = await canUserAccessRecord(session, "jobs", job.submittedById, "view");
    if (!vis.allowed) {
      return NextResponse.json(
        { success: false, error: vis.reason || "Forbidden: You cannot access this job." },
        { status: 403 }
      );
    }

    // Parse multipart/form-data OR application/json
    let expenseDateStr = "";
    let category = "";
    let description = "";
    let amountRaw: unknown = 0;
    let supplierId: string | null = null;
    let payeeName: string | null = null;
    let paymentReference: string | null = null;
    let linkedSupplierInvoiceId: string | null = null;
    let notes: string | null = null;
    let confirmNotDuplicateInvoice = false;
    let receiptFile: File | null = null;

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      expenseDateStr = String(formData.get("expenseDate") || "");
      category = String(formData.get("category") || "").trim();
      description = String(formData.get("description") || "").trim();
      amountRaw = formData.get("amount");
      const supVal = String(formData.get("supplierId") || "").trim();
      supplierId = supVal || null;
      payeeName = String(formData.get("payeeName") || "").trim() || null;
      paymentReference = String(formData.get("paymentReference") || "").trim() || null;
      const linkedVal = String(formData.get("linkedSupplierInvoiceId") || "").trim();
      linkedSupplierInvoiceId = linkedVal || null;
      notes = String(formData.get("notes") || "").trim() || null;
      confirmNotDuplicateInvoice = formData.get("confirmNotDuplicateInvoice") === "true";

      const maybeFile = formData.get("receipt");
      if (maybeFile && maybeFile instanceof File && maybeFile.size > 0) {
        receiptFile = maybeFile;
      }
    } else {
      const body = await req.json();
      expenseDateStr = String(body?.expenseDate || "");
      category = String(body?.category || "").trim();
      description = String(body?.description || "").trim();
      amountRaw = body?.amount;
      supplierId = body?.supplierId ? String(body.supplierId).trim() : null;
      payeeName = body?.payeeName ? String(body.payeeName).trim() : null;
      paymentReference = body?.paymentReference ? String(body.paymentReference).trim() : null;
      linkedSupplierInvoiceId = body?.linkedSupplierInvoiceId
        ? String(body.linkedSupplierInvoiceId).trim()
        : null;
      notes = body?.notes ? String(body.notes).trim() : null;
      confirmNotDuplicateInvoice = Boolean(body?.confirmNotDuplicateInvoice);
    }

    // Double-counting strict block: an expense linked to a Supplier Invoice MUST NOT be created here
    if (linkedSupplierInvoiceId) {
      return NextResponse.json(
        {
          success: false,
          doubleCountBlocked: true,
          error:
            "Double-Counting Blocked: Expenses already recorded under a Supplier Invoice cannot be entered again as an Additional Job Expense.",
        },
        { status: 409 }
      );
    }

    const parsedDateKey = toDateKey(expenseDateStr);
    const expenseDateObj = parseDateKeyToUtcMidnight(parsedDateKey);
    if (!expenseDateObj) {
      return NextResponse.json(
        { success: false, error: "Valid Expense Date (YYYY-MM-DD) is required." },
        { status: 422 }
      );
    }

    if (!category || category.length < 2) {
      return NextResponse.json(
        { success: false, error: "Expense Category is required." },
        { status: 422 }
      );
    }

    if (!description || description.length < 2) {
      return NextResponse.json(
        { success: false, error: "Expense Description is required." },
        { status: 422 }
      );
    }

    const amountDec = roundFinancial(amountRaw, 2);
    if (amountDec.lte(0)) {
      return NextResponse.json(
        { success: false, error: "Expense Amount must be greater than 0.00." },
        { status: 422 }
      );
    }

    if (supplierId) {
      const supExists = await db.supplier.findFirst({
        where: { id: supplierId, deletedAt: null },
        select: { id: true, name: true },
      });
      if (!supExists) {
        return NextResponse.json(
          { success: false, error: "Selected Supplier was not found." },
          { status: 404 }
        );
      }
    }

    // Check active Supplier Invoices on this Job for duplicate/double-counting risks
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

    if (paymentReference) {
      const normalizedRef = paymentReference.toLowerCase();
      const refMatch = activeJobInvoices.find(
        (inv) => inv.invoiceNumber.toLowerCase() === normalizedRef
      );
      if (refMatch) {
        return NextResponse.json(
          {
            success: false,
            doubleCountBlocked: true,
            error: `Reference "${paymentReference}" matches active Supplier Invoice ${refMatch.invoiceNumber} on this Job. Duplicate entry blocked to prevent double counting.`,
          },
          { status: 409 }
        );
      }
    }

    if (supplierId && !confirmNotDuplicateInvoice) {
      const possibleDuplicate = activeJobInvoices.find(
        (inv) =>
          inv.supplierId === supplierId &&
          roundFinancial(inv.totalAmount, 2).eq(amountDec)
      );
      if (possibleDuplicate) {
        return NextResponse.json(
          {
            success: false,
            requiresConfirmation: true,
            matchingInvoiceNumber: possibleDuplicate.invoiceNumber,
            error: `An active Supplier Invoice (${possibleDuplicate.invoiceNumber}) already exists for ${possibleDuplicate.supplier?.name || "this supplier"} on this Job with exact amount ${amountDec.toFixed(
              2
            )}. Confirm if this is a completely separate additional expense.`,
          },
          { status: 409 }
        );
      }
    }

    // Handle receipt upload if provided
    let attachmentData: Record<string, string | null> = {};
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
          {
            success: false,
            error: `Unsupported receipt file type "${ext}". Allowed: PDF, JPG, PNG, WEBP, Word, Excel.`,
          },
          { status: 422 }
        );
      }

      const buffer = Buffer.from(await receiptFile.arrayBuffer());
      const uploadRes = await uploadJobAdditionalExpenseReceipt({
        buffer,
        originalName: receiptFile.name,
        jobCode: job.jobCode || job.id,
        contentType: receiptFile.type || "application/octet-stream",
      });

      if (!uploadRes.success) {
        return NextResponse.json(
          {
            success: false,
            error: uploadRes.error || "Failed to upload receipt file to storage.",
          },
          { status: 500 }
        );
      }

      uploadedStoragePath = uploadRes.storagePath;
      uploadedBucket = uploadRes.bucketName;
      attachmentData = {
        attachmentName: uploadRes.fileName,
        attachmentOriginalName: uploadRes.originalFileName,
        attachmentBucket: uploadRes.bucketName,
        attachmentStoragePath: uploadRes.storagePath,
        attachmentSize: uploadRes.fileSize,
        attachmentMimeType: uploadRes.mimeType,
      };
    }

    const created = await db.$transaction(async (tx) => {
      const exp = await (tx as any).jobAdditionalExpense.create({
        data: {
          jobId: id,
          expenseDate: expenseDateObj,
          category,
          description,
          amount: amountDec.toFixed(2),
          supplierId,
          payeeName,
          paymentReference,
          linkedSupplierInvoiceId: null,
          notes,
          status: "ACTIVE",
          createdById: session.userId,
          updatedById: session.userId,
          ...attachmentData,
        },
        include: {
          supplier: { select: { id: true, code: true, name: true } },
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });

      await (tx as any).jobAdditionalExpenseAuditLog.create({
        data: {
          expenseId: exp.id,
          jobId: id,
          userId: session.userId,
          action: "CREATE",
          previousData: null,
          newData: {
            expenseDate: parsedDateKey,
            category,
            description,
            amount: amountDec.toNumber(),
            supplierId,
            payeeName,
            paymentReference,
            notes,
            attachmentName: attachmentData.attachmentName || null,
          },
        },
      });

      await recalculateJobFinances(id, tx);
      return exp;
    });

    await logAuditEvent({
      userId: session.userId,
      action: "CREATE_JOB_ADDITIONAL_EXPENSE",
      resource: "jobs",
      resourceId: id,
      details: {
        expenseId: created.id,
        category,
        description,
        amount: amountDec.toNumber(),
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Additional Job Expense recorded and Job P&L recalculated.",
        data: {
          id: created.id,
          jobId: created.jobId,
          expenseDate: parsedDateKey,
          category: created.category,
          description: created.description,
          amount: Number(created.amount),
          supplierId: created.supplierId,
          supplierName: created.supplier?.name || null,
          supplierCode: created.supplier?.code || null,
          payeeName: created.payeeName,
          paymentReference: created.paymentReference,
          attachmentName: created.attachmentName || null,
          attachmentStoragePath: created.attachmentStoragePath || null,
          attachmentSize: created.attachmentSize || null,
          notes: created.notes || null,
          status: created.status,
          createdByName: created.createdBy?.name || null,
          createdAt: created.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    if (uploadedStoragePath) {
      await cleanupOrphanedStorageFiles([uploadedStoragePath], uploadedBucket);
    }
    console.error("POST /api/jobs/[id]/additional-expenses error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to record additional expense." },
      { status: 500 }
    );
  }
}
