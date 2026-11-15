import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { Decimal, roundFinancial, toDecimal } from "@/lib/financial";
import { logAuditEvent } from "@/lib/audit";
import { validateAttachmentBuffer, MAX_ATTACHMENT_SIZE_BYTES } from "@/lib/file-validation";
import {
  uploadSupplierInvoiceAttachment,
  deleteFromSupabaseStorage,
  cleanupOrphanedStorageFiles,
  SUPPLIER_INVOICES_BUCKET,
} from "@/lib/supabase";
import { recalculateJobFinances } from "@/lib/financial-recalculation";
import { checkSessionPermission } from "@/lib/permissions";
import { canUserAccessRecord } from "@/lib/data-visibility";
import { PO_ELIGIBLE_FOR_INVOICE_STATUSES } from "@/lib/po-financial";
import { syncPurchaseOrderInvoicedTotalsTx } from "@/lib/po-helpers";
import {
  canAccessJobForSupplierInvoice,
  isJobEligibleForSupplierInvoice,
  validateAndNormalizeSupplierInvoiceItems,
  RawSupplierInvoiceItemInput,
} from "@/lib/supplier-invoice-helpers";
import {
  addCalendarDays,
  diffCalendarDays,
  parseDateKeyToUtcMidnight,
  toDateKey,
} from "@/lib/supplier-payment-date";
import {
  enrichInvoiceWithPaymentSummary,
  serializeSupplierPayment,
  syncInvoicePaymentStateTx,
} from "@/lib/supplier-payment-helpers";
import { getOrCreateSupplierPaymentSettings } from "@/lib/supplier-payment-notifications";

class HttpValidationError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// GET /api/supplier-invoices/[id]
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

    const canViewInvoice = await checkSessionPermission(session, "supplierInvoices", "view");
    const canViewPayment = await checkSessionPermission(session, "supplierPayments", "view");
    if (!canViewInvoice && !canViewPayment) {
      return NextResponse.json(
        { success: false, error: "Forbidden: You do not have permission to view this supplier invoice." },
        { status: 403 }
      );
    }

    const { id } = await params;
    const db = getPrisma();
    const paymentSettings = await getOrCreateSupplierPaymentSettings(db);
    const invoice = await (db.supplierInvoice as any).findFirst({
      where: { id, deletedAt: null },
      include: {
        supplier: true,
        job: {
          select: {
            id: true,
            jobCode: true,
            name: true,
            date: true,
            commencingDate: true,
            clientName: true,
            handledBy: true,
            status: true,
            grandTotal: true,
            totalCost: true,
          },
        },
        purchaseOrder: {
          select: {
            id: true,
            poNumber: true,
            status: true,
            grandTotal: true,
          },
        },
        items: {
          orderBy: { rowNumber: "asc" },
          include: {
            attachments: true,
          },
        },
        attachments: true,
        payments: {
          orderBy: { paymentDate: "desc" },
          include: {
            createdBy: { select: { id: true, name: true } },
            updatedBy: { select: { id: true, name: true } },
            reversedBy: { select: { id: true, name: true } },
            auditLogs: {
              orderBy: { createdAt: "desc" },
              include: { user: { select: { id: true, name: true } } },
            },
          },
        },
        paymentAuditLogs: {
          orderBy: { createdAt: "desc" },
          include: {
            user: { select: { id: true, name: true } },
          },
        },
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        updatedBy: {
          select: { id: true, name: true, email: true },
        },
        cancelledBy: {
          select: { id: true, name: true, email: true },
        },
        auditLogs: {
          orderBy: { createdAt: "desc" },
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: "Supplier invoice not found." },
        { status: 404 }
      );
    }

    // Verify record visibility scope (try supplierInvoices first if allowed, otherwise supplierPayments)
    let accessCheck = canViewInvoice
      ? await canUserAccessRecord(session, "supplierInvoices", invoice.createdById, "view")
      : { allowed: false, reason: "" };
    if (!accessCheck.allowed && canViewPayment) {
      accessCheck = await canUserAccessRecord(session, "supplierPayments", invoice.createdById, "view");
    }
    if (!accessCheck.allowed) {
      return NextResponse.json(
        { success: false, error: accessCheck.reason || "Supplier invoice not found." },
        { status: 404 }
      );
    }

    // Calculate job's total supplier expenses to provide remaining budget in response
    const allJobInvoices = await (db.supplierInvoice as any).findMany({
      where: {
        jobId: invoice.jobId,
        deletedAt: null,
        status: { not: "CANCELLED" },
      },
      select: { totalAmount: true },
    });

    const approvedJobValueDec = roundFinancial(invoice.job?.grandTotal || invoice.job?.totalCost || 0, 2);
    const totalJobSupplierCostDec = roundFinancial(
      allJobInvoices.reduce(
        (sum: Decimal, inv: any) => sum.plus(toDecimal(inv.totalAmount)),
        new Decimal(0)
      ),
      2
    );
    const approvedJobValue = approvedJobValueDec.toNumber();
    const totalJobSupplierCost = totalJobSupplierCostDec.toNumber();
    const remainingJobBudget = roundFinancial(approvedJobValueDec.minus(totalJobSupplierCostDec), 2).toNumber();

    return NextResponse.json({
      success: true,
      data: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        supplierId: invoice.supplierId,
        supplier: invoice.supplier,
        jobId: invoice.jobId,
        job: invoice.job,
        purchaseOrderId: invoice.purchaseOrderId || null,
        purchaseOrderNumber: invoice.purchaseOrder?.poNumber || null,
        purchaseOrder: invoice.purchaseOrder || null,
        approvedJobValue,
        totalJobSupplierCost,
        remainingJobBudget,
        invoiceDate: toDateKey(invoice.invoiceDate) || "",
        ...enrichInvoiceWithPaymentSummary(invoice, paymentSettings.timezone),
        totalAmount: Number(invoice.totalAmount || 0),
        status: invoice.status,
        notes: invoice.notes || "",
        payments: (invoice.payments || []).map((p: any) =>
          serializeSupplierPayment(
            {
              ...p,
              supplierInvoice: invoice,
              supplier: invoice.supplier,
              job: invoice.job,
            },
            paymentSettings.timezone
          )
        ),
        paymentAuditLogs: (invoice.paymentAuditLogs || []).map((log: any) => ({
          id: log.id,
          paymentId: log.paymentId || null,
          invoiceId: log.invoiceId || null,
          userId: log.userId || null,
          userName: log.user?.name || "System",
          action: log.action,
          reason: log.reason || null,
          previousData: log.previousData,
          newData: log.newData,
          createdAt: new Date(log.createdAt).toISOString(),
        })),
        budgetOverrideUsed: Boolean(invoice.budgetOverrideUsed),
        budgetOverrideReason: invoice.budgetOverrideReason || null,
        cancellationReason: invoice.cancellationReason || null,
        cancelledAt: invoice.cancelledAt ? new Date(invoice.cancelledAt).toISOString() : null,
        cancelledBy: invoice.cancelledBy,
        createdBy: invoice.createdBy,
        createdById: invoice.createdById,
        createdByName: invoice.createdBy?.name || "System Admin",
        createdByEmail: invoice.createdBy?.email || null,
        updatedById: invoice.updatedById || null,
        updatedByName: invoice.updatedBy?.name || null,
        items: (invoice.items || []).map((item: any) => ({
          id: item.id,
          rowNumber: item.rowNumber,
          purchaseOrderItemId: item.purchaseOrderItemId || null,
          jobCostCategoryId: item.jobCostCategoryId || null,
          jobCostCategoryName: item.jobCostCategoryName || null,
          jobCostItemId: item.jobCostItemId || null,
          description: item.description,
          originalJobAmount: item.originalJobAmount != null ? Number(item.originalJobAmount) : null,
          quantity: item.quantity != null ? Number(item.quantity) : undefined,
          unit: item.unit || null,
          unitRate: item.unitRate != null ? Number(item.unitRate) : null,
          amount: Number(item.amount || 0),
          isAdditionalItem: Boolean(item.isAdditionalItem),
          budgetOverrideReason: item.budgetOverrideReason || null,
          notes: item.notes || "",
          attachments: (item.attachments || []).map((att: any) => ({
            id: att.id,
            invoiceId: att.invoiceId,
            itemId: att.itemId,
            fileName: att.fileName,
            originalFileName: att.originalFileName || att.fileName,
            fileSize: att.fileSize,
            fileType: att.fileType,
            mimeType: att.mimeType || att.fileType,
            storagePath: att.storagePath,
            fileUrl: `/api/supplier-invoices/attachments/${att.id}`,
            createdAt: att.createdAt ? new Date(att.createdAt).toISOString() : "",
          })),
        })),
        attachments: (invoice.attachments || []).map((att: any) => ({
          id: att.id,
          invoiceId: att.invoiceId,
          itemId: att.itemId,
          fileName: att.fileName,
          originalFileName: att.originalFileName || att.fileName,
          fileSize: att.fileSize,
          fileType: att.fileType,
          mimeType: att.mimeType || att.fileType,
          storagePath: att.storagePath,
          fileUrl: `/api/supplier-invoices/attachments/${att.id}`,
          createdAt: att.createdAt ? new Date(att.createdAt).toISOString() : "",
        })),
        auditLogs: (invoice.auditLogs || []).map((log: any) => ({
          id: log.id,
          action: log.action,
          reason: log.reason,
          userName: log.user?.name || "System",
          previousData: log.previousData,
          newData: log.newData,
          createdAt: new Date(log.createdAt).toISOString(),
        })),
        createdAt: invoice.createdAt ? new Date(invoice.createdAt).toISOString() : "",
        updatedAt: invoice.updatedAt ? new Date(invoice.updatedAt).toISOString() : "",
      },
    });
  } catch (err: any) {
    console.error("GET /api/supplier-invoices/[id] error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error fetching invoice details." },
      { status: 500 }
    );
  }
}

// PUT /api/supplier-invoices/[id]
// Comprehensive Invoice Edit with multi-format attachments and automatic financial recalculation
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const uploadedAttachments: Array<{
    itemIndex: number;
    fileName: string;
    originalFileName: string;
    storedFileName: string;
    bucketName: string;
    fileSize: string;
    fileType: string;
    mimeType: string;
    fileUrl: string;
    storagePath: string;
  }> = [];

  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access. Please log in." },
        { status: 401 }
      );
    }

    const isAuthorized = await checkSessionPermission(session, "supplierInvoices", "edit");
    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, error: "Forbidden: You do not have permission to edit supplier invoices." },
        { status: 403 }
      );
    }

    const { id } = await params;
    const db = getPrisma();

    // Fetch existing invoice with items and attachments
    const existingInvoice = await (db.supplierInvoice as any).findFirst({
      where: { id, deletedAt: null },
      include: {
        job: true,
        supplier: true,
        items: {
          include: {
            attachments: true,
          },
        },
        attachments: true,
      },
    });

    if (!existingInvoice) {
      return NextResponse.json(
        { success: false, error: "Supplier invoice not found." },
        { status: 404 }
      );
    }

    // Verify ownership and edit permission
    const editAccess = await canUserAccessRecord(session, "supplierInvoices", existingInvoice.createdById, "edit");
    if (!editAccess.allowed) {
      return NextResponse.json(
        { success: false, error: editAccess.reason || "Forbidden: You cannot edit invoices created by another user." },
        { status: 403 }
      );
    }

    // Safety rule: Cancelled invoices cannot be edited
    if (existingInvoice.status === "CANCELLED") {
      return NextResponse.json(
        {
          success: false,
          error: "Cancelled supplier invoices cannot be edited. Please restore the invoice first or create a new invoice.",
        },
        { status: 400 }
      );
    }

    const contentType = req.headers.get("content-type") || "";
    let supplierId = existingInvoice.supplierId;
    let jobId = existingInvoice.jobId;
    let purchaseOrderId: string | null = existingInvoice.purchaseOrderId || null;
    let invoiceNumber = existingInvoice.invoiceNumber;
    let invoiceDate =
      toDateKey(existingInvoice.invoiceDate) || new Date().toISOString().split("T")[0];
    let paymentDueDateInput =
      toDateKey(existingInvoice.paymentDueDate) || invoiceDate;
    let hasPaymentDueDateInput = false;
    let paymentTerms: string | null = existingInvoice.paymentTerms ?? null;
    let creditPeriodDaysInput: number | null =
      existingInvoice.creditPeriodDays != null ? Number(existingInvoice.creditPeriodDays) : null;
    let notes = existingInvoice.notes || "";
    let reason = "";
    let budgetOverrideReason = existingInvoice.budgetOverrideReason || "";
    let poOverInvoiceOverride = false;
    let parsedItems: (RawSupplierInvoiceItemInput & { keepAttachmentIds?: string[] })[] = [];
    let deletedAttachmentIds: string[] = [];

    interface RowAttachmentUpload {
      itemIndex: number;
      file: File;
    }
    const filesToUpload: RowAttachmentUpload[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      if (
        String(formData.get("status") || "").toUpperCase() === "PAID" ||
        String(formData.get("paymentStatus") || "").toUpperCase() === "PAID"
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Payment Status cannot be manually set to PAID. Please record a real payment instead.",
          },
          { status: 400 }
        );
      }
      supplierId = (formData.get("supplierId") as string) || supplierId;
      jobId = (formData.get("jobId") as string) || jobId;
      if (formData.has("purchaseOrderId")) {
        const rawPoId = (formData.get("purchaseOrderId") as string) || "";
        purchaseOrderId = rawPoId.trim() || null;
      }
      invoiceNumber = (formData.get("invoiceNumber") as string)?.trim() || invoiceNumber;
      invoiceDate = (formData.get("invoiceDate") as string)?.trim() || invoiceDate;
      if (formData.has("paymentDueDate")) {
        hasPaymentDueDateInput = true;
        paymentDueDateInput = (formData.get("paymentDueDate") as string)?.trim() || "";
      }
      if (formData.has("paymentTerms")) {
        const rawTerms = (formData.get("paymentTerms") as string)?.trim();
        paymentTerms = rawTerms ? rawTerms : null;
      }
      if (formData.has("creditPeriodDays")) {
        const rawDays = (formData.get("creditPeriodDays") as string)?.trim();
        if (rawDays === "") {
          creditPeriodDaysInput = null;
        } else {
          const parsedDays = Number(rawDays);
          if (!Number.isInteger(parsedDays) || parsedDays < 0 || parsedDays > 3650) {
            return NextResponse.json(
              { success: false, error: "Credit Period / Payment Within days must be an integer between 0 and 3650." },
              { status: 400 }
            );
          }
          creditPeriodDaysInput = parsedDays;
        }
      }
      notes = (formData.get("notes") as string) ?? notes;
      reason = (formData.get("reason") as string)?.trim() || "";
      if (formData.has("budgetOverrideReason")) {
        budgetOverrideReason = (formData.get("budgetOverrideReason") as string)?.trim() || "";
      }
      poOverInvoiceOverride = formData.get("poOverInvoiceOverride") === "true";

      const rawItems = formData.get("items") as string;
      if (rawItems) {
        try {
          parsedItems = JSON.parse(rawItems);
        } catch {
          return NextResponse.json(
            { success: false, error: "Invalid JSON format for invoice items." },
            { status: 400 }
          );
        }
      }

      const rawDeletedAtts = formData.get("deletedAttachmentIds") as string;
      if (rawDeletedAtts) {
        try {
          deletedAttachmentIds = JSON.parse(rawDeletedAtts);
        } catch {
          // Ignore parse error
        }
      }

      // Collect multiple uploaded files per row item
      for (let i = 0; i < parsedItems.length; i++) {
        const rowFiles: File[] = [];
        formData.getAll(`files_${i}`).forEach((f) => {
          if (f instanceof File && f.size > 0) rowFiles.push(f);
        });
        formData.getAll(`files-${i}`).forEach((f) => {
          if (f instanceof File && f.size > 0 && !rowFiles.includes(f)) rowFiles.push(f);
        });
        formData.getAll(`file_${i}`).forEach((f) => {
          if (f instanceof File && f.size > 0 && !rowFiles.includes(f)) rowFiles.push(f);
        });
        formData.getAll(`file-${i}`).forEach((f) => {
          if (f instanceof File && f.size > 0 && !rowFiles.includes(f)) rowFiles.push(f);
        });

        let subIndex = 0;
        while (formData.has(`file_${i}_${subIndex}`) || formData.has(`files_${i}_${subIndex}`)) {
          const subFile =
            (formData.get(`file_${i}_${subIndex}`) as File) ||
            (formData.get(`files_${i}_${subIndex}`) as File);
          if (subFile instanceof File && subFile.size > 0 && !rowFiles.includes(subFile)) {
            rowFiles.push(subFile);
          }
          subIndex++;
        }

        rowFiles.forEach((file) => {
          filesToUpload.push({ itemIndex: i, file });
        });
      }
    } else {
      // JSON payload
      const body = await req.json();
      if (
        String(body.status || "").toUpperCase() === "PAID" ||
        String(body.paymentStatus || "").toUpperCase() === "PAID"
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Payment Status cannot be manually set to PAID. Please record a real payment instead.",
          },
          { status: 400 }
        );
      }
      supplierId = body.supplierId || supplierId;
      jobId = body.jobId || jobId;
      if (Object.prototype.hasOwnProperty.call(body, "purchaseOrderId")) {
        purchaseOrderId =
          typeof body.purchaseOrderId === "string" && body.purchaseOrderId.trim()
            ? body.purchaseOrderId.trim()
            : null;
      }
      invoiceNumber = body.invoiceNumber?.trim() || invoiceNumber;
      invoiceDate = body.invoiceDate ? String(body.invoiceDate).trim() : invoiceDate;
      if (Object.prototype.hasOwnProperty.call(body, "paymentDueDate")) {
        hasPaymentDueDateInput = true;
        paymentDueDateInput = body.paymentDueDate ? String(body.paymentDueDate).trim() : "";
      }
      if (Object.prototype.hasOwnProperty.call(body, "paymentTerms")) {
        paymentTerms =
          typeof body.paymentTerms === "string" && body.paymentTerms.trim()
            ? body.paymentTerms.trim()
            : null;
      }
      if (Object.prototype.hasOwnProperty.call(body, "creditPeriodDays")) {
        if (body.creditPeriodDays === null || body.creditPeriodDays === "") {
          creditPeriodDaysInput = null;
        } else {
          const parsedDays = Number(body.creditPeriodDays);
          if (!Number.isInteger(parsedDays) || parsedDays < 0 || parsedDays > 3650) {
            return NextResponse.json(
              { success: false, error: "Credit Period / Payment Within days must be an integer between 0 and 3650." },
              { status: 400 }
            );
          }
          creditPeriodDaysInput = parsedDays;
        }
      }
      notes = body.notes ?? notes;
      reason = body.reason?.trim() || "";
      if (Object.prototype.hasOwnProperty.call(body, "budgetOverrideReason")) {
        budgetOverrideReason =
          typeof body.budgetOverrideReason === "string" ? body.budgetOverrideReason.trim() : "";
      }
      poOverInvoiceOverride = Boolean(body.poOverInvoiceOverride);
      parsedItems = Array.isArray(body.items) ? body.items : [];
      deletedAttachmentIds = Array.isArray(body.deletedAttachmentIds) ? body.deletedAttachmentIds : [];
    }

    // Validate Invoice Date & Payment Due Date
    const invoiceDateKey = toDateKey(invoiceDate);
    const parsedInvoiceDateObj = parseDateKeyToUtcMidnight(invoiceDateKey);
    if (!invoiceDateKey || !parsedInvoiceDateObj) {
      return NextResponse.json(
        { success: false, error: "Please provide a valid Invoice Date (YYYY-MM-DD)." },
        { status: 400 }
      );
    }

    let dueDateKey: string | null = null;
    if (hasPaymentDueDateInput && paymentDueDateInput) {
      dueDateKey = toDateKey(paymentDueDateInput);
      if (!dueDateKey || !parseDateKeyToUtcMidnight(dueDateKey)) {
        return NextResponse.json(
          { success: false, error: "Please provide a valid Payment Due Date (YYYY-MM-DD)." },
          { status: 400 }
        );
      }
    } else if (hasPaymentDueDateInput && !paymentDueDateInput && creditPeriodDaysInput !== null) {
      dueDateKey = addCalendarDays(invoiceDateKey, creditPeriodDaysInput);
    } else if (!hasPaymentDueDateInput && creditPeriodDaysInput !== null && existingInvoice.paymentDueDate == null) {
      dueDateKey = addCalendarDays(invoiceDateKey, creditPeriodDaysInput);
    } else {
      dueDateKey = toDateKey(existingInvoice.paymentDueDate) || invoiceDateKey;
    }

    const parsedDueDateObj = parseDateKeyToUtcMidnight(dueDateKey)!;
    const prevDueDateKey =
      toDateKey(existingInvoice.paymentDueDate) || toDateKey(existingInvoice.invoiceDate);
    if (diffCalendarDays(invoiceDateKey, dueDateKey!) < 0) {
      const canOverrideDueDate =
        (await checkSessionPermission(session, "supplierInvoices", "overrideDueDate")) ||
        (await checkSessionPermission(session, "supplierPayments", "overrideDueDate"));
      if (!canOverrideDueDate) {
        return NextResponse.json(
          {
            success: false,
            code: "DUE_DATE_BEFORE_INVOICE_DATE",
            error: `Payment Due Date (${dueDateKey}) cannot be earlier than Invoice Date (${invoiceDateKey}) unless an authorized administrator overrides it.`,
          },
          { status: 422 }
        );
      }
    }

    // Mandatory edit reason verification
    if (!reason) {
      return NextResponse.json(
        {
          success: false,
          error: "A mandatory edit reason is required for financial audit tracking.",
        },
        { status: 400 }
      );
    }

    // Role verification for changing supplier or linked job
    const isSupplierChanged = supplierId !== existingInvoice.supplierId;
    const isJobChanged = jobId !== existingInvoice.jobId;
    const isAdmin =
      !session.roles ||
      session.roles.length === 0 ||
      session.roles.some((r: string) => /admin/i.test(r));

    if ((isSupplierChanged || isJobChanged) && !isAdmin) {
      return NextResponse.json(
        {
          success: false,
          error: "Administrator permission is required to change the linked supplier or job.",
        },
        { status: 403 }
      );
    }

    // 1. Validate Supplier if changed
    let targetSupplier = existingInvoice.supplier;
    if (isSupplierChanged) {
      targetSupplier = await (db.supplier as any).findFirst({
        where: { id: supplierId, deletedAt: null },
      });
      if (!targetSupplier) {
        return NextResponse.json(
          { success: false, error: "Target supplier was not found or has been deactivated." },
          { status: 404 }
        );
      }
    }

    // 2. Validate Job if changed (must be visible & APPROVED)
    let targetJob = existingInvoice.job;
    if (isJobChanged) {
      targetJob = await (db.job as any).findFirst({
        where: { id: jobId, deletedAt: null },
      });
      if (!targetJob) {
        return NextResponse.json(
          { success: false, error: "Target Job was not found in the database." },
          { status: 404 }
        );
      }
      const canAccessTargetJob = await canAccessJobForSupplierInvoice(session, targetJob.submittedById);
      if (!canAccessTargetJob) {
        return NextResponse.json(
          { success: false, error: "Target Job was not found within your authorized access scope." },
          { status: 404 }
        );
      }

      if (!isJobEligibleForSupplierInvoice(targetJob.status, targetJob.deletedAt)) {
        return NextResponse.json(
          {
            success: false,
            error: `Invoices can only be assigned to APPROVED Jobs. Job "${targetJob.jobCode}" is currently ${targetJob.status}.`,
          },
          { status: 422 }
        );
      }
    }

    // 3. Validate Invoice Number uniqueness if changed
    if (invoiceNumber !== existingInvoice.invoiceNumber) {
      const duplicate = await (db.supplierInvoice as any).findFirst({
        where: { invoiceNumber, deletedAt: null },
      });
      if (duplicate) {
        return NextResponse.json(
          {
            success: false,
            error: `Invoice number "${invoiceNumber}" is already in use by another invoice.`,
          },
          { status: 409 }
        );
      }
    }

    // 4. Validate Items (at least 1 row required)
    if (!parsedItems || parsedItems.length === 0) {
      return NextResponse.json(
        { success: false, error: "At least one supplier invoice row item is required." },
        { status: 400 }
      );
    }

    // 4A. Optional Purchase Order Validation on Edit
    let linkedPo: any = null;
    const validPoItemIds = new Set<string>();
    if (purchaseOrderId) {
      linkedPo = await (db.purchaseOrder as any).findFirst({
        where: { id: purchaseOrderId, deletedAt: null },
        include: {
          items: { select: { id: true } },
          supplierInvoices: {
            where: {
              deletedAt: null,
              status: { not: "CANCELLED" },
              id: { not: id },
            },
            select: { id: true, totalAmount: true },
          },
        },
      });
      if (!linkedPo) {
        return NextResponse.json(
          { success: false, error: "Selected Purchase Order not found." },
          { status: 404 }
        );
      }
      if (
        purchaseOrderId !== existingInvoice.purchaseOrderId &&
        !PO_ELIGIBLE_FOR_INVOICE_STATUSES.includes(String(linkedPo.status || "").toUpperCase())
      ) {
        return NextResponse.json(
          {
            success: false,
            error: `Purchase Order "${linkedPo.poNumber}" (${linkedPo.status}) is not eligible for invoicing.`,
          },
          { status: 422 }
        );
      }
      if (linkedPo.jobId !== jobId || linkedPo.supplierId !== supplierId) {
        return NextResponse.json(
          {
            success: false,
            error: `Selected Job/Supplier must match Purchase Order "${linkedPo.poNumber}".`,
          },
          { status: 422 }
        );
      }
      (linkedPo.items || []).forEach((it: any) => validPoItemIds.add(it.id));
    }

    // 4B. Validate and normalize cost-item links, quantities, units, rates, Decimal totals & per-line budgets
    const [canManualEntry, canOverrideBudget] = await Promise.all([
      checkSessionPermission(session, "supplierInvoices", "manualEntry"),
      checkSessionPermission(session, "supplierInvoices", "overrideJobBudget"),
    ]);

    const existingLegacyItemIds = new Set<string>(
      isJobChanged
        ? []
        : (existingInvoice.items || [])
            .filter((it: any) => !it.jobCostItemId)
            .map((it: any) => it.id)
    );

    const itemValidation = await validateAndNormalizeSupplierInvoiceItems({
      jobId,
      items: parsedItems,
      excludeInvoiceId: id,
      existingLegacyItemIds,
      validPoItemIds: linkedPo ? validPoItemIds : undefined,
      canManualEntry,
      canOverrideBudget,
      invoiceOverrideReason: budgetOverrideReason,
      client: db,
    });

    if (!itemValidation.valid) {
      return NextResponse.json(
        {
          success: false,
          code: itemValidation.code,
          error: itemValidation.error || "Invalid supplier invoice line items.",
        },
        { status: itemValidation.status || 400 }
      );
    }

    const totalInvoiceAmount = itemValidation.totalAmount;

    // 4C. PO Ceiling Validation against authoritative Decimal total
    if (linkedPo) {
      const otherInvoiced = (linkedPo.supplierInvoices || []).reduce(
        (sum: Decimal, inv: any) => sum.plus(new Decimal(inv.totalAmount || 0)),
        new Decimal(0)
      );
      const poCeiling = new Decimal(linkedPo.grandTotal || 0);
      const remainingPoBalance = Decimal.max(0, poCeiling.minus(otherInvoiced));

      if (otherInvoiced.plus(totalInvoiceAmount).gt(poCeiling.plus(0.01))) {
        const canOverride = await checkSessionPermission(
          session,
          "purchaseOrders",
          "overrideJobBudget"
        );
        if (!poOverInvoiceOverride || !canOverride) {
          return NextResponse.json(
            {
              success: false,
              code: "PO_OVER_INVOICE_BLOCKED",
              error: `Updated invoice total (Rs. ${totalInvoiceAmount.toFixed(2)}) exceeds remaining uninvoiced balance of PO "${linkedPo.poNumber}" (Rs. ${remainingPoBalance.toFixed(2)} remaining).`,
            },
            { status: 422 }
          );
        }
      }
    }

    // 5. Upload new attachments to Supabase Storage in dedicated "supplier-invoices" bucket
    // Folder hierarchy: supplier-invoices / [JOB-CODE] / [INV-NUMBER] / item-[N] / [STORED_NAME]

    for (let fIdx = 0; fIdx < filesToUpload.length; fIdx++) {
      const { itemIndex, file } = filesToUpload[fIdx];
      if (!file) continue;

      const buffer = Buffer.from(await file.arrayBuffer());
      const validation = validateAttachmentBuffer(buffer, file.name, MAX_ATTACHMENT_SIZE_BYTES);
      if (!validation.isValid) {
        if (uploadedAttachments.length > 0) {
          await cleanupOrphanedStorageFiles(uploadedAttachments.map((a) => a.storagePath));
        }
        return NextResponse.json(
          {
            success: false,
            error: `Row ${itemIndex + 1} Attachment Error: ${validation.error}`,
          },
          { status: 400 }
        );
      }

      const uploadRes = await uploadSupplierInvoiceAttachment({
        buffer,
        originalName: validation.sanitizedName,
        jobCode: targetJob.jobCode,
        invoiceNumber,
        rowNumberOrItemId: itemIndex + 1,
        contentType: validation.mimeType,
        bucket: SUPPLIER_INVOICES_BUCKET,
      });

      if (!uploadRes.success) {
        if (uploadedAttachments.length > 0) {
          await cleanupOrphanedStorageFiles(uploadedAttachments.map((a) => a.storagePath));
        }
        return NextResponse.json(
          {
            success: false,
            error: `Failed to upload "${validation.sanitizedName}" to Supabase Storage: ${uploadRes.error}`,
          },
          { status: 500 }
        );
      }

      uploadedAttachments.push({
        itemIndex,
        fileName: uploadRes.fileName,
        originalFileName: uploadRes.originalFileName,
        storedFileName: uploadRes.storedFileName,
        bucketName: uploadRes.bucketName,
        fileSize: uploadRes.fileSize,
        fileType: validation.mimeType,
        mimeType: validation.mimeType,
        fileUrl: uploadRes.fileUrl,
        storagePath: uploadRes.storagePath,
      });
    }

    // 6. Execute atomic database update and recalculation (with in-transaction re-validation)
    const storagePathsToDeleteAfterCommit: Array<{ storagePath: string; bucketName: string }> = [];

    const result = await db.$transaction(async (tx) => {
      const txValidation = await validateAndNormalizeSupplierInvoiceItems({
        jobId,
        items: parsedItems,
        excludeInvoiceId: id,
        existingLegacyItemIds,
        validPoItemIds: linkedPo ? validPoItemIds : undefined,
        canManualEntry,
        canOverrideBudget,
        invoiceOverrideReason: budgetOverrideReason,
        client: tx,
      });

      if (!txValidation.valid) {
        throw new HttpValidationError(
          txValidation.status || 422,
          txValidation.error || "Supplier invoice item validation failed inside transaction.",
          txValidation.code
        );
      }

      const txTotalAmount = txValidation.totalAmount;
      const effectiveOverrideReason = txValidation.budgetOverrideUsed
        ? budgetOverrideReason ||
          txValidation.items.find((it) => it.budgetOverrideReason)?.budgetOverrideReason ||
          null
        : null;

      // Guard: Cannot reduce invoice total below total active payments already recorded
      const existingPayments = await (tx.supplierPayment as any).findMany({
        where: { supplierInvoiceId: id },
        select: { id: true, amount: true, status: true },
      });
      const activePayments = existingPayments.filter((p: any) => p.status === "SUCCESS");
      const activePaidTotalDec = activePayments.reduce(
        (sum: Decimal, p: any) => sum.plus(new Decimal(p.amount || 0)),
        new Decimal(0)
      );
      if (txTotalAmount.lt(activePaidTotalDec)) {
        throw new HttpValidationError(
          422,
          `Updated invoice total (Rs. ${txTotalAmount.toFixed(2)}) cannot be less than already-paid supplier payments (Rs. ${activePaidTotalDec.toFixed(2)}). Please reverse excess payments first.`,
          "INVOICE_TOTAL_BELOW_PAID_AMOUNT"
        );
      }

      // Collect and delete attachments explicitly requested for deletion
      if (deletedAttachmentIds.length > 0) {
        const attsToDelete = await (tx.supplierInvoiceAttachment as any).findMany({
          where: {
            id: { in: deletedAttachmentIds },
            invoiceId: id,
          },
          select: { id: true, storagePath: true, bucketName: true },
        });

        for (const att of attsToDelete) {
          if (att.storagePath) {
            storagePathsToDeleteAfterCommit.push({
              storagePath: att.storagePath,
              bucketName: att.bucketName || SUPPLIER_INVOICES_BUCKET,
            });
          }
        }

        await (tx.supplierInvoiceAttachment as any).deleteMany({
          where: {
            id: { in: deletedAttachmentIds },
            invoiceId: id,
          },
        });
      }

      // Existing item map & IDs in database
      const existingItemMap = new Map<string, any>();
      (existingInvoice.items || []).forEach((it: any) => existingItemMap.set(it.id, it));
      const existingItemIds = Array.from(existingItemMap.keys());
      const incomingItemIdsWithId = txValidation.items
        .filter((it) => it.id && existingItemMap.has(it.id))
        .map((it) => it.id as string);

      // Items to delete (existed previously but omitted in updated list) BEFORE updating/creating
      // so unique (invoiceId, jobCostItemId) constraints allow re-adding removed cost items cleanly.
      const itemsToDelete = existingItemIds.filter((dbId) => !incomingItemIdsWithId.includes(dbId));
      if (itemsToDelete.length > 0) {
        const itemAttsToDelete = await (tx.supplierInvoiceAttachment as any).findMany({
          where: {
            itemId: { in: itemsToDelete },
            invoiceId: id,
          },
          select: { id: true, storagePath: true, bucketName: true },
        });

        for (const att of itemAttsToDelete) {
          if (att.storagePath) {
            storagePathsToDeleteAfterCommit.push({
              storagePath: att.storagePath,
              bucketName: att.bucketName || SUPPLIER_INVOICES_BUCKET,
            });
          }
        }

        await (tx.supplierInvoiceItem as any).deleteMany({
          where: {
            id: { in: itemsToDelete },
            invoiceId: id,
          },
        });
      }

      // Clear jobCostItemId on kept rows whose cost-item link is changing, preventing swap P2002 collisions
      const keptRowsWithChangedCostLink = txValidation.items
        .filter((it) => {
          if (!it.id) return false;
          const prev = existingItemMap.get(it.id);
          return Boolean(prev && prev.jobCostItemId && prev.jobCostItemId !== it.jobCostItemId);
        })
        .map((it) => it.id as string);

      if (keptRowsWithChangedCostLink.length > 0) {
        await (tx.supplierInvoiceItem as any).updateMany({
          where: { id: { in: keptRowsWithChangedCostLink }, invoiceId: id },
          data: { jobCostItemId: null },
        });
      }

      // Update or create normalized items
      const savedItemRecords: any[] = [];
      for (let i = 0; i < txValidation.items.length; i++) {
        const normItem = txValidation.items[i];
        let savedItem: any;

        const itemData = {
          purchaseOrderItemId: normItem.purchaseOrderItemId,
          jobCostCategoryId: normItem.jobCostCategoryId,
          jobCostCategoryName: normItem.jobCostCategoryName,
          jobCostItemId: normItem.jobCostItemId,
          rowNumber: normItem.rowNumber,
          description: normItem.description,
          originalJobAmount: normItem.originalJobAmount,
          quantity: normItem.quantity,
          unit: normItem.unit,
          unitRate: normItem.unitRate,
          amount: normItem.amount,
          isAdditionalItem: normItem.isAdditionalItem,
          budgetOverrideReason: normItem.budgetOverrideReason,
          notes: normItem.notes,
        };

        if (normItem.id && existingItemMap.has(normItem.id)) {
          savedItem = await (tx.supplierInvoiceItem as any).update({
            where: { id: normItem.id },
            data: itemData,
          });
        } else {
          savedItem = await (tx.supplierInvoiceItem as any).create({
            data: {
              invoiceId: id,
              ...itemData,
            },
          });
        }
        savedItemRecords.push(savedItem);

        // Attach new files for this row
        const rowNewAttachments = uploadedAttachments.filter((a) => a.itemIndex === i);
        for (const att of rowNewAttachments) {
          const createdAtt = await (tx.supplierInvoiceAttachment as any).create({
            data: {
              invoiceId: id,
              itemId: savedItem.id,
              jobId: targetJob.id,
              fileName: att.fileName,
              originalFileName: att.originalFileName,
              storedFileName: att.storedFileName,
              bucketName: att.bucketName,
              storagePath: att.storagePath,
              fileSize: att.fileSize,
              fileType: att.fileType,
              mimeType: att.mimeType,
              fileUrl: att.fileUrl,
              uploadedById: session.userId,
            },
          });

          await (tx.supplierInvoiceAttachment as any).update({
            where: { id: createdAtt.id },
            data: {
              fileUrl: `/api/supplier-invoices/attachments/${createdAtt.id}`,
            },
          });
        }
      }

      // Update Supplier Invoice header
      const updatedInvoice = await (tx.supplierInvoice as any).update({
        where: { id },
        data: {
          invoiceNumber,
          supplierId,
          jobId,
          purchaseOrderId: linkedPo ? linkedPo.id : null,
          invoiceDate: parsedInvoiceDateObj,
          paymentDueDate: parsedDueDateObj,
          paymentTerms,
          creditPeriodDays: creditPeriodDaysInput,
          totalAmount: txTotalAmount.toFixed(2),
          notes,
          budgetOverrideUsed: txValidation.budgetOverrideUsed,
          budgetOverrideReason: effectiveOverrideReason,
          updatedById: session.userId,
          updatedAt: new Date(),
        },
      });

      const syncedState = await syncInvoicePaymentStateTx(id, tx);

      // Audit Log for Edit
      const previousData = {
        invoiceNumber: existingInvoice.invoiceNumber,
        supplierId: existingInvoice.supplierId,
        supplierName: existingInvoice.supplier?.name,
        jobId: existingInvoice.jobId,
        jobCode: existingInvoice.job?.jobCode,
        totalAmount: Number(existingInvoice.totalAmount),
        invoiceDate: toDateKey(existingInvoice.invoiceDate),
        paymentDueDate: prevDueDateKey,
        paymentTerms: existingInvoice.paymentTerms || null,
        creditPeriodDays: existingInvoice.creditPeriodDays ?? null,
        notes: existingInvoice.notes,
        budgetOverrideUsed: Boolean(existingInvoice.budgetOverrideUsed),
        budgetOverrideReason: existingInvoice.budgetOverrideReason || null,
        items: (existingInvoice.items || []).map((it: any) => ({
          id: it.id,
          rowNumber: it.rowNumber,
          jobCostCategoryName: it.jobCostCategoryName || null,
          jobCostItemId: it.jobCostItemId || null,
          description: it.description,
          originalJobAmount: it.originalJobAmount != null ? Number(it.originalJobAmount) : null,
          quantity: it.quantity != null ? Number(it.quantity) : null,
          unit: it.unit || null,
          unitRate: it.unitRate != null ? Number(it.unitRate) : null,
          amount: Number(it.amount),
          isAdditionalItem: Boolean(it.isAdditionalItem),
          budgetOverrideReason: it.budgetOverrideReason || null,
        })),
      };

      const newData = {
        invoiceNumber,
        supplierId,
        supplierName: targetSupplier?.name,
        jobId,
        jobCode: targetJob?.jobCode,
        totalAmount: txTotalAmount.toFixed(2),
        invoiceDate: invoiceDateKey,
        paymentDueDate: dueDateKey,
        paymentTerms,
        creditPeriodDays: creditPeriodDaysInput,
        paymentStatus: syncedState.derived.paymentStatus,
        notes,
        budgetOverrideUsed: txValidation.budgetOverrideUsed,
        budgetOverrideReason: effectiveOverrideReason,
        items: txValidation.items.map((it) => ({
          rowNumber: it.rowNumber,
          jobCostCategoryName: it.jobCostCategoryName,
          jobCostItemId: it.jobCostItemId,
          description: it.description,
          originalJobAmount: it.originalJobAmount,
          quantity: it.quantity,
          unit: it.unit,
          unitRate: it.unitRate,
          amount: it.amount,
          isAdditionalItem: it.isAdditionalItem,
          budgetOverrideReason: it.budgetOverrideReason,
        })),
      };

      await (tx.supplierInvoiceAuditLog as any).create({
        data: {
          invoiceId: id,
          userId: session.userId,
          action: "EDIT",
          reason,
          previousData,
          newData,
        },
      });

      // Requirement: If the invoice already has payments, changing the Due Date must be audited
      if (dueDateKey !== prevDueDateKey && existingPayments.length > 0) {
        await (tx.supplierPaymentAuditLog as any).create({
          data: {
            invoiceId: id,
            userId: session.userId,
            action: "DUE_DATE_CHANGE",
            reason,
            previousData: {
              paymentDueDate: prevDueDateKey,
              paymentTerms: existingInvoice.paymentTerms || null,
              creditPeriodDays: existingInvoice.creditPeriodDays ?? null,
            },
            newData: {
              paymentDueDate: dueDateKey,
              paymentTerms,
              creditPeriodDays: creditPeriodDaysInput,
            },
          },
        });
      }

      // Atomically recalculate target job finances
      const financialSnapshot = await recalculateJobFinances(jobId, tx);

      // Recalculate PO invoiced progress on new & previous PO if linked/changed
      if (linkedPo?.id) {
        await syncPurchaseOrderInvoicedTotalsTx(linkedPo.id, tx);
      }
      if (existingInvoice.purchaseOrderId && existingInvoice.purchaseOrderId !== linkedPo?.id) {
        await syncPurchaseOrderInvoicedTotalsTx(existingInvoice.purchaseOrderId, tx);
      }

      // If job changed, also recalculate the previous job's finances so its costs are updated
      let previousJobSnapshot = null;
      if (isJobChanged) {
        previousJobSnapshot = await recalculateJobFinances(existingInvoice.jobId, tx);
      }

      return { updatedInvoice, financialSnapshot, previousJobSnapshot, txTotalAmount };
    });

    // Clean up deleted attachment files from Supabase Storage only after DB commit succeeded
    for (const delFile of storagePathsToDeleteAfterCommit) {
      await deleteFromSupabaseStorage(delFile.storagePath, delFile.bucketName).catch(() => {});
    }

    await logAuditEvent({
      userId: session.userId,
      action: "EDIT_SUPPLIER_INVOICE",
      resource: "supplier-invoices",
      resourceId: id,
      details: {
        invoiceNumber,
        oldAmount: Number(existingInvoice.totalAmount),
        newAmount: result.txTotalAmount.toNumber(),
        jobCode: targetJob?.jobCode,
        reason,
      },
      req,
    });

    return NextResponse.json({
      success: true,
      message: `Supplier invoice "${invoiceNumber}" updated successfully. Job cost and profit metrics recalculated.`,
      data: result.updatedInvoice,
      financialSnapshot: result.financialSnapshot,
    });
  } catch (err: any) {
    if (uploadedAttachments.length > 0) {
      await cleanupOrphanedStorageFiles(uploadedAttachments.map((a) => a.storagePath));
    }
    if (err instanceof HttpValidationError) {
      return NextResponse.json(
        { success: false, code: err.code, error: err.message },
        { status: err.status }
      );
    }
    if (err?.code === "P2002") {
      const targetStr = Array.isArray(err?.meta?.target)
        ? err.meta.target.join(",")
        : String(err?.meta?.target || "");
      if (targetStr.includes("job_cost_item_id") || targetStr.includes("invoice_id_job_cost_item_id")) {
        return NextResponse.json(
          {
            success: false,
            code: "DUPLICATE_JOB_COST_ITEM",
            error: "Duplicate Job cost line detected in the same Supplier Invoice.",
          },
          { status: 422 }
        );
      }
      return NextResponse.json(
        {
          success: false,
          code: "DUPLICATE_RECORD",
          error: "A Supplier Invoice with this invoice number already exists.",
        },
        { status: 409 }
      );
    }
    console.error("PUT /api/supplier-invoices/[id] error:", err?.message || String(err));
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error editing supplier invoice." },
      { status: 500 }
    );
  }
}

// PATCH /api/supplier-invoices/[id]
// Cancel, restore, or remove attachment with atomic financial recalculation
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
    const action = body.action || "CANCEL";
    const reason = body.reason?.trim();
    const db = getPrisma();

    if (
      String(action).toUpperCase() === "PAID" ||
      String(action).toUpperCase() === "MARK_PAID" ||
      String(body.status || "").toUpperCase() === "PAID" ||
      String(body.paymentStatus || "").toUpperCase() === "PAID"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Payment Status cannot be manually set to PAID. Please record a real Supplier Payment.",
        },
        { status: 400 }
      );
    }

    if (action === "CANCEL") {
      const canCancel = await checkSessionPermission(session, "supplierInvoices", "cancel");
      if (!canCancel) {
        return NextResponse.json(
          { success: false, error: "Forbidden: You do not have permission to cancel supplier invoices." },
          { status: 403 }
        );
      }
    } else {
      const canEdit = await checkSessionPermission(session, "supplierInvoices", "edit");
      if (!canEdit) {
        return NextResponse.json(
          { success: false, error: "Forbidden: You do not have permission to modify supplier invoices." },
          { status: 403 }
        );
      }
    }

    if (!reason && action !== "REMOVE_ATTACHMENT") {
      return NextResponse.json(
        { success: false, error: "A mandatory audit reason is required to cancel or restore a supplier invoice." },
        { status: 400 }
      );
    }

    const invoice = await (db.supplierInvoice as any).findFirst({
      where: { id, deletedAt: null },
      include: {
        job: true,
        supplier: true,
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: "Supplier invoice not found." },
        { status: 404 }
      );
    }

    // Verify ownership and action permission
    const patchAccess = await canUserAccessRecord(
      session,
      "supplierInvoices",
      invoice.createdById,
      action === "CANCEL" ? "cancel" : "edit"
    );
    if (!patchAccess.allowed) {
      return NextResponse.json(
        { success: false, error: patchAccess.reason || "Forbidden: You cannot modify invoices created by another user." },
        { status: 403 }
      );
    }

    // Handle single attachment removal
    if (action === "REMOVE_ATTACHMENT") {
      const attachmentId = body.attachmentId;
      if (!attachmentId) {
        return NextResponse.json(
          { success: false, error: "Attachment ID is required." },
          { status: 400 }
        );
      }

      const attachment = await (db.supplierInvoiceAttachment as any).findFirst({
        where: { id: attachmentId, invoiceId: id },
      });

      if (!attachment) {
        return NextResponse.json(
          { success: false, error: "Attachment not found for this invoice." },
          { status: 404 }
        );
      }

      // Purge physical file from Supabase Storage
      if (attachment.storagePath) {
        await deleteFromSupabaseStorage(
          attachment.storagePath,
          attachment.bucketName || SUPPLIER_INVOICES_BUCKET
        );
      }

      await db.$transaction(async (tx) => {
        await (tx.supplierInvoiceAttachment as any).delete({
          where: { id: attachmentId },
        });

        await (tx.supplierInvoiceAuditLog as any).create({
          data: {
            invoiceId: id,
            userId: session.userId,
            action: "REMOVE_ATTACHMENT",
            reason: reason || `Removed attachment "${attachment.fileName}"`,
            previousData: {
              attachmentId: attachment.id,
              fileName: attachment.fileName,
              fileSize: attachment.fileSize,
              fileType: attachment.fileType,
            },
            newData: null,
          },
        });
      });

      await logAuditEvent({
        userId: session.userId,
        action: "REMOVE_SUPPLIER_INVOICE_ATTACHMENT",
        resource: "supplier-invoices",
        resourceId: id,
        details: {
          invoiceNumber: invoice.invoiceNumber,
          removedFileName: attachment.fileName,
          attachmentId,
          reason,
        },
        req,
      });

      return NextResponse.json({
        success: true,
        message: `Attachment "${attachment.fileName}" has been removed.`,
      });
    }

    // Prevention of duplicate cancellation
    if (invoice.status === "CANCELLED" && action === "CANCEL") {
      return NextResponse.json(
        { success: false, error: "This invoice is already cancelled." },
        { status: 400 }
      );
    }

    // Prevention of restoring active invoice
    if (invoice.status !== "CANCELLED" && action === "RESTORE") {
      return NextResponse.json(
        { success: false, error: "This invoice is already active and cannot be restored." },
        { status: 400 }
      );
    }

    const { updatedInvoice, financialSnapshot } = await db.$transaction(async (tx) => {
      const updated = await (tx.supplierInvoice as any).update({
        where: { id },
        data: {
          status: action === "RESTORE" ? "APPROVED" : "CANCELLED",
          cancellationReason: action === "RESTORE" ? null : reason,
          cancelledAt: action === "RESTORE" ? null : new Date(),
          cancelledById: action === "RESTORE" ? null : session.userId,
          updatedAt: new Date(),
        },
      });

      await syncInvoicePaymentStateTx(id, tx);

      await (tx.supplierInvoiceAuditLog as any).create({
        data: {
          invoiceId: id,
          userId: session.userId,
          action: action === "RESTORE" ? "RESTORE" : "CANCEL",
          reason,
          previousData: { status: invoice.status, totalAmount: Number(invoice.totalAmount) },
          newData: { status: updated.status, cancellationReason: reason },
        },
      });

      // Recalculate Job's actual cost and gross profit atomically
      const snapshot = await recalculateJobFinances(invoice.jobId, tx);
      if (invoice.purchaseOrderId) {
        await syncPurchaseOrderInvoicedTotalsTx(invoice.purchaseOrderId, tx);
      }

      return { updatedInvoice: updated, financialSnapshot: snapshot };
    });

    await logAuditEvent({
      userId: session.userId,
      action: action === "RESTORE" ? "RESTORE_SUPPLIER_INVOICE" : "CANCEL_SUPPLIER_INVOICE",
      resource: "supplier-invoices",
      resourceId: id,
      details: {
        invoiceNumber: invoice.invoiceNumber,
        jobCode: invoice.job?.jobCode,
        totalAmount: Number(invoice.totalAmount),
        reason,
      },
      req,
    });

    return NextResponse.json({
      success: true,
      message:
        action === "RESTORE"
          ? `Supplier invoice "${invoice.invoiceNumber}" restored successfully. Job finances updated.`
          : `Supplier invoice "${invoice.invoiceNumber}" cancelled. Job cost impact has been reversed.`,
      data: updatedInvoice,
      financialSnapshot,
    });
  } catch (err: any) {
    console.error("PATCH /api/supplier-invoices/[id] error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error updating invoice status." },
      { status: 500 }
    );
  }
}

// DELETE /api/supplier-invoices/[id]
// Soft-delete with financial safeguard and automatic recalculation
export async function DELETE(
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

    const isAuthorized = await checkSessionPermission(session, "supplierInvoices", "delete");
    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, error: "Forbidden: You do not have permission to delete supplier invoices." },
        { status: 403 }
      );
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const reason = searchParams.get("reason")?.trim() || "Admin deletion";
    const db = getPrisma();

    const invoice = await (db.supplierInvoice as any).findFirst({
      where: { id, deletedAt: null },
    });

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: "Supplier invoice not found." },
        { status: 404 }
      );
    }

    // Verify ownership and delete permission
    const delAccess = await canUserAccessRecord(
      session,
      "supplierInvoices",
      invoice.createdById,
      "delete"
    );
    if (!delAccess.allowed) {
      return NextResponse.json(
        { success: false, error: delAccess.reason || "Forbidden: You cannot delete invoices created by another user." },
        { status: 403 }
      );
    }

    const financialSnapshot = await db.$transaction(async (tx) => {
      await (tx.supplierInvoice as any).update({
        where: { id },
        data: {
          deletedAt: new Date(),
          status: "CANCELLED",
          paymentStatus: "CANCELLED",
          cancellationReason: reason,
          cancelledAt: new Date(),
          cancelledById: session.userId,
          updatedById: session.userId,
        },
      });

      await (tx.supplierInvoiceAuditLog as any).create({
        data: {
          invoiceId: id,
          userId: session.userId,
          action: "DELETE",
          reason,
          previousData: { status: invoice.status, totalAmount: Number(invoice.totalAmount) },
          newData: { deletedAt: new Date(), status: "CANCELLED" },
        },
      });

      // Recalculate linked Job's costs atomically
      const snap = await recalculateJobFinances(invoice.jobId, tx);
      if (invoice.purchaseOrderId) {
        await syncPurchaseOrderInvoicedTotalsTx(invoice.purchaseOrderId, tx);
      }
      return snap;
    });

    return NextResponse.json({
      success: true,
      message: `Supplier invoice "${invoice.invoiceNumber}" safely removed. Job finances recalculated.`,
      financialSnapshot,
    });
  } catch (err: any) {
    console.error("DELETE /api/supplier-invoices/[id] error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error deleting invoice." },
      { status: 500 }
    );
  }
}
