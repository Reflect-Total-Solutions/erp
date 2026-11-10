import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { Decimal } from "decimal.js";
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

    const isAuthorized = await checkSessionPermission(session, "supplierInvoices", "view");
    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, error: "Forbidden: You do not have permission to view this supplier invoice." },
        { status: 403 }
      );
    }

    const { id } = await params;
    const db = getPrisma();
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

    // Verify record visibility scope
    const accessCheck = await canUserAccessRecord(session, "supplierInvoices", invoice.createdById, "view");
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

    const approvedJobValue = Number(invoice.job?.grandTotal || invoice.job?.totalCost || 0);
    const totalJobSupplierCost = allJobInvoices.reduce(
      (sum: number, inv: any) => sum + Number(inv.totalAmount || 0),
      0
    );
    const remainingJobBudget = approvedJobValue - totalJobSupplierCost;

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
        invoiceDate: invoice.invoiceDate ? new Date(invoice.invoiceDate).toISOString().split("T")[0] : "",
        totalAmount: Number(invoice.totalAmount || 0),
        status: invoice.status,
        notes: invoice.notes || "",
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
          description: item.description,
          quantity: item.quantity != null ? Number(item.quantity) : undefined,
          amount: Number(item.amount || 0),
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
    let invoiceDate = existingInvoice.invoiceDate
      ? new Date(existingInvoice.invoiceDate).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];
    let notes = existingInvoice.notes || "";
    let reason = "";
    let poOverInvoiceOverride = false;
    let parsedItems: Array<{
      id?: string;
      purchaseOrderItemId?: string | null;
      description: string;
      quantity?: number | null;
      amount: number | string;
      notes?: string;
      keepAttachmentIds?: string[];
    }> = [];
    let deletedAttachmentIds: string[] = [];

    interface RowAttachmentUpload {
      itemIndex: number;
      file: File;
    }
    const filesToUpload: RowAttachmentUpload[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      supplierId = (formData.get("supplierId") as string) || supplierId;
      jobId = (formData.get("jobId") as string) || jobId;
      if (formData.has("purchaseOrderId")) {
        const rawPoId = (formData.get("purchaseOrderId") as string) || "";
        purchaseOrderId = rawPoId.trim() || null;
      }
      invoiceNumber = (formData.get("invoiceNumber") as string)?.trim() || invoiceNumber;
      invoiceDate = (formData.get("invoiceDate") as string) || invoiceDate;
      notes = (formData.get("notes") as string) ?? notes;
      reason = (formData.get("reason") as string)?.trim() || "";
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

        rowFiles.forEach((file) => {
          filesToUpload.push({ itemIndex: i, file });
        });
      }
    } else {
      // JSON payload
      const body = await req.json();
      supplierId = body.supplierId || supplierId;
      jobId = body.jobId || jobId;
      if (Object.prototype.hasOwnProperty.call(body, "purchaseOrderId")) {
        purchaseOrderId =
          typeof body.purchaseOrderId === "string" && body.purchaseOrderId.trim()
            ? body.purchaseOrderId.trim()
            : null;
      }
      invoiceNumber = body.invoiceNumber?.trim() || invoiceNumber;
      invoiceDate = body.invoiceDate || invoiceDate;
      notes = body.notes ?? notes;
      reason = body.reason?.trim() || "";
      poOverInvoiceOverride = Boolean(body.poOverInvoiceOverride);
      parsedItems = Array.isArray(body.items) ? body.items : [];
      deletedAttachmentIds = Array.isArray(body.deletedAttachmentIds) ? body.deletedAttachmentIds : [];
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

    // 2. Validate Job if changed (must be APPROVED)
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
      const jobStatusUpper = (targetJob.status || "").toUpperCase();
      const isApprovedJob =
        jobStatusUpper === "APPROVED" ||
        jobStatusUpper === "ACTIVE" ||
        jobStatusUpper === "INVOICED";

      if (!isApprovedJob) {
        return NextResponse.json(
          {
            success: false,
            error: `Invoices can only be assigned to APPROVED Jobs. Job "${targetJob.jobCode}" is currently ${targetJob.status}.`,
          },
          { status: 400 }
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

    // 4. Validate Items (at least 1 row required, valid amounts)
    if (!parsedItems || parsedItems.length === 0) {
      return NextResponse.json(
        { success: false, error: "At least one supplier invoice row item is required." },
        { status: 400 }
      );
    }

    let totalInvoiceAmount = new Decimal(0);
    for (let i = 0; i < parsedItems.length; i++) {
      const item = parsedItems[i];
      if (!item.description || !item.description.trim()) {
        return NextResponse.json(
          { success: false, error: `Row ${i + 1}: Description is required.` },
          { status: 400 }
        );
      }
      const amt = new Decimal(item.amount || 0);
      if (amt.isNaN() || amt.lte(0)) {
        return NextResponse.json(
          { success: false, error: `Row ${i + 1}: Invoice amount must be greater than 0.00.` },
          { status: 400 }
        );
      }
      totalInvoiceAmount = totalInvoiceAmount.plus(amt);
    }

    // 4B. Optional Purchase Order Validation on Edit
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

    // 6. Execute atomic database update and recalculation
    const result = await db.$transaction(async (tx) => {
      // Delete attachments explicitly requested for deletion
      if (deletedAttachmentIds.length > 0) {
        // Fetch storage paths first to delete from Supabase Storage
        const attsToDelete = await (tx.supplierInvoiceAttachment as any).findMany({
          where: {
            id: { in: deletedAttachmentIds },
            invoiceId: id,
          },
          select: { id: true, storagePath: true, bucketName: true },
        });

        for (const att of attsToDelete) {
          if (att.storagePath) {
            await deleteFromSupabaseStorage(
              att.storagePath,
              att.bucketName || SUPPLIER_INVOICES_BUCKET
            );
          }
        }

        await (tx.supplierInvoiceAttachment as any).deleteMany({
          where: {
            id: { in: deletedAttachmentIds },
            invoiceId: id,
          },
        });
      }

      // Existing item IDs in database
      const existingItemIds = existingInvoice.items.map((it: any) => it.id);
      const incomingItemIdsWithId = parsedItems.filter((it) => it.id).map((it) => it.id as string);

      // Items to delete (existed previously but omitted in updated list)
      const itemsToDelete = existingItemIds.filter((dbId: string) => !incomingItemIdsWithId.includes(dbId));
      if (itemsToDelete.length > 0) {
        // Fetch attachments belonging to deleted items to purge from storage
        const itemAttsToDelete = await (tx.supplierInvoiceAttachment as any).findMany({
          where: {
            itemId: { in: itemsToDelete },
            invoiceId: id,
          },
          select: { id: true, storagePath: true, bucketName: true },
        });

        for (const att of itemAttsToDelete) {
          if (att.storagePath) {
            await deleteFromSupabaseStorage(
              att.storagePath,
              att.bucketName || SUPPLIER_INVOICES_BUCKET
            );
          }
        }

        await (tx.supplierInvoiceItem as any).deleteMany({
          where: {
            id: { in: itemsToDelete },
            invoiceId: id,
          },
        });
      }

      // Update or create items
      const savedItemRecords: any[] = [];
      for (let i = 0; i < parsedItems.length; i++) {
        const item = parsedItems[i];
        let savedItem: any;

        if (item.id && existingItemIds.includes(item.id)) {
          // Update existing item
          const validPoItemId =
            linkedPo && item.purchaseOrderItemId && validPoItemIds.has(item.purchaseOrderItemId)
              ? item.purchaseOrderItemId
              : null;
          savedItem = await (tx.supplierInvoiceItem as any).update({
            where: { id: item.id },
            data: {
              rowNumber: i + 1,
              purchaseOrderItemId: validPoItemId,
              description: item.description.trim(),
              quantity:
                item.quantity !== undefined && item.quantity !== null && Number(item.quantity) >= 0
                  ? new Decimal(item.quantity).toFixed(4)
                  : null,
              amount: new Decimal(item.amount).toFixed(2),
              notes: item.notes || "",
            },
          });
        } else {
          // Create new item
          const validPoItemId =
            linkedPo && item.purchaseOrderItemId && validPoItemIds.has(item.purchaseOrderItemId)
              ? item.purchaseOrderItemId
              : null;
          savedItem = await (tx.supplierInvoiceItem as any).create({
            data: {
              invoiceId: id,
              purchaseOrderItemId: validPoItemId,
              rowNumber: i + 1,
              description: item.description.trim(),
              quantity:
                item.quantity !== undefined && item.quantity !== null && Number(item.quantity) >= 0
                  ? new Decimal(item.quantity).toFixed(4)
                  : null,
              amount: new Decimal(item.amount).toFixed(2),
              notes: item.notes || "",
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
          invoiceDate: new Date(invoiceDate),
          totalAmount: totalInvoiceAmount.toFixed(2),
          notes,
          updatedById: session.userId,
          updatedAt: new Date(),
        },
      });

      // Audit Log for Edit
      const previousData = {
        invoiceNumber: existingInvoice.invoiceNumber,
        supplierId: existingInvoice.supplierId,
        supplierName: existingInvoice.supplier?.name,
        jobId: existingInvoice.jobId,
        jobCode: existingInvoice.job?.jobCode,
        totalAmount: Number(existingInvoice.totalAmount),
        invoiceDate: existingInvoice.invoiceDate,
        notes: existingInvoice.notes,
        items: (existingInvoice.items || []).map((it: any) => ({
          id: it.id,
          rowNumber: it.rowNumber,
          description: it.description,
          amount: Number(it.amount),
        })),
      };

      const newData = {
        invoiceNumber,
        supplierId,
        supplierName: targetSupplier?.name,
        jobId,
        jobCode: targetJob?.jobCode,
        totalAmount: totalInvoiceAmount.toFixed(2),
        invoiceDate,
        notes,
        items: parsedItems.map((it, idx) => ({
          rowNumber: idx + 1,
          description: it.description,
          amount: Number(it.amount),
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

      return { updatedInvoice, financialSnapshot, previousJobSnapshot };
    });

    await logAuditEvent({
      userId: session.userId,
      action: "EDIT_SUPPLIER_INVOICE",
      resource: "supplier-invoices",
      resourceId: id,
      details: {
        invoiceNumber,
        oldAmount: Number(existingInvoice.totalAmount),
        newAmount: totalInvoiceAmount.toNumber(),
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
