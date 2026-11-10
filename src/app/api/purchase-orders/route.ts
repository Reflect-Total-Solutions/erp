import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";
import { buildRecordVisibilityFilter } from "@/lib/data-visibility";
import { logAuditEvent } from "@/lib/audit";
import { validateAttachmentBuffer, MAX_ATTACHMENT_SIZE_BYTES } from "@/lib/file-validation";
import {
  PURCHASE_ORDERS_BUCKET,
  uploadPurchaseOrderAttachment,
  cleanupOrphanedStorageFiles,
} from "@/lib/supabase";
import { recalculateJobFinances } from "@/lib/financial-recalculation";
import { poCreateSchema } from "@/lib/validations/purchase-order";
import { computePurchaseOrderFinancials, isJobEligibleForPo } from "@/lib/po-financial";
import { generateNextPoNumberTx } from "@/lib/po-number";
import { serializePurchaseOrder, validatePoItemsAndBudget } from "@/lib/po-helpers";
import { generatePoReportCsv } from "@/lib/po-excel-generator";

// GET /api/purchase-orders
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized access." }, { status: 401 });
  }

  const canView = await checkSessionPermission(session, "purchaseOrders", "view");
  if (!canView) {
    return NextResponse.json(
      { success: false, error: "Forbidden: You do not have permission to view Purchase Orders." },
      { status: 403 }
    );
  }

  try {
    const db = getPrisma();
    const { searchParams } = new URL(req.url);
    const trash = searchParams.get("trash") === "true" || searchParams.get("deleted") === "true";
    const status = searchParams.get("status")?.trim();
    const approvalStatus = searchParams.get("approvalStatus")?.trim();
    const jobId = searchParams.get("jobId")?.trim();
    const supplierId = searchParams.get("supplierId")?.trim();
    const createdBy = searchParams.get("createdBy")?.trim();
    const dateFrom = searchParams.get("dateFrom")?.trim();
    const dateTo = searchParams.get("dateTo")?.trim();
    const search = searchParams.get("search")?.trim() || "";
    const exportType = searchParams.get("export")?.trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "25", 10)));
    const skip = (page - 1) * limit;

    if (exportType === "csv") {
      const canExport = await checkSessionPermission(session, "purchaseOrders", "export");
      if (!canExport) {
        return NextResponse.json(
          { success: false, error: "Forbidden: You do not have permission to export PO reports." },
          { status: 403 }
        );
      }
    }

    const { filter: visibilityFilter, scope, authorizedIds } = await buildRecordVisibilityFilter(
      session,
      "purchaseOrders",
      "createdById",
      false
    );

    const canViewFinancials = await checkSessionPermission(
      session,
      "purchaseOrders",
      "viewFinancials"
    );

    const where: any = {
      deletedAt: trash ? { not: null } : null,
    };

    if (status && status !== "all") {
      where.status = status.toUpperCase();
    }
    if (approvalStatus && approvalStatus !== "all") {
      where.approvalStatus = approvalStatus.toUpperCase();
    }
    if (jobId && jobId !== "all") {
      where.jobId = jobId;
    }
    if (supplierId && supplierId !== "all") {
      where.supplierId = supplierId;
    }
    if (dateFrom || dateTo) {
      where.poDate = {};
      if (dateFrom) where.poDate.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.poDate.lte = end;
      }
    }

    // Ownership scoping + optional createdBy filter
    if (createdBy && createdBy !== "all") {
      if (!authorizedIds || authorizedIds.includes(createdBy)) {
        where.createdById = createdBy;
      } else {
        where.createdById = "__FORBIDDEN_SCOPE__";
      }
    } else if (visibilityFilter.createdById) {
      where.createdById = visibilityFilter.createdById;
    } else if (visibilityFilter.OR) {
      where.OR = visibilityFilter.OR;
    }

    if (search) {
      const searchConds = [
        { poNumber: { contains: search, mode: "insensitive" } },
        { quotationRef: { contains: search, mode: "insensitive" } },
        { job: { jobCode: { contains: search, mode: "insensitive" } } },
        { job: { name: { contains: search, mode: "insensitive" } } },
        { supplier: { name: { contains: search, mode: "insensitive" } } },
        { supplier: { code: { contains: search, mode: "insensitive" } } },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchConds }];
        delete where.OR;
      } else {
        where.OR = searchConds;
      }
    }

    const baseVisibilityCountWhere: any = {
      ...(visibilityFilter.createdById ? { createdById: visibilityFilter.createdById } : {}),
      ...(visibilityFilter.OR ? { OR: visibilityFilter.OR } : {}),
    };

    const [orders, totalItems, activeCount, trashCount] = await Promise.all([
      (db.purchaseOrder as any).findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...(exportType === "csv" ? {} : { skip, take: limit }),
        include: {
          job: {
            select: {
              id: true,
              jobCode: true,
              name: true,
              clientName: true,
              date: true,
              status: true,
              grandTotal: true,
              totalCost: true,
            },
          },
          supplier: {
            select: {
              id: true,
              code: true,
              name: true,
              contactPerson: true,
              phone: true,
              email: true,
              address: true,
            },
          },
          items: {
            orderBy: { rowNumber: "asc" },
          },
          createdBy: { select: { id: true, name: true, email: true } },
          approvedBy: { select: { id: true, name: true, email: true } },
          rejectedBy: { select: { id: true, name: true, email: true } },
          issuedBy: { select: { id: true, name: true, email: true } },
          cancelledBy: { select: { id: true, name: true, email: true } },
          supplierInvoices: {
            where: { deletedAt: null, status: { not: "CANCELLED" } },
            select: { id: true, invoiceNumber: true, totalAmount: true, status: true },
          },
        },
      }),
      (db.purchaseOrder as any).count({ where }),
      (db.purchaseOrder as any).count({ where: { ...baseVisibilityCountWhere, deletedAt: null } }),
      (db.purchaseOrder as any).count({ where: { ...baseVisibilityCountWhere, deletedAt: { not: null } } }),
    ]);

    const serialized = orders.map((po: any) => {
      // Users can always view financials of POs they created OR when viewFinancials is granted
      const mask = !canViewFinancials && po.createdById !== session.userId;
      return serializePurchaseOrder(po, mask);
    });

    if (exportType === "csv") {
      const csv = generatePoReportCsv(serialized, canViewFinancials);
      await logAuditEvent({
        userId: session.userId,
        action: "EXPORT_PURCHASE_ORDERS_CSV",
        resource: "purchaseOrders",
        details: { count: serialized.length, filters: { status, jobId, supplierId, search } },
        req,
      });

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="purchase-orders-report-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: serialized,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / limit)),
      },
      counts: {
        active: activeCount,
        trash: trashCount,
      },
      meta: {
        visibilityScope: scope,
        canViewFinancials,
      },
    });
  } catch (err: any) {
    console.error("GET /api/purchase-orders error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to load Purchase Orders." },
      { status: 500 }
    );
  }
}

// POST /api/purchase-orders
export async function POST(req: NextRequest) {
  const uploadedPaths: string[] = [];

  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized access." }, { status: 401 });
    }

    const canCreate = await checkSessionPermission(session, "purchaseOrders", "create");
    if (!canCreate) {
      return NextResponse.json(
        { success: false, error: "Forbidden: You do not have permission to create Purchase Orders." },
        { status: 403 }
      );
    }

    const contentType = req.headers.get("content-type") || "";
    let rawPayload: any = null;
    const filesToUpload: Array<{ file: File; category: string }> = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const payloadStr = formData.get("payload") as string;
      if (!payloadStr) {
        return NextResponse.json(
          { success: false, error: "Missing PO payload field in form submission." },
          { status: 400 }
        );
      }
      try {
        rawPayload = JSON.parse(payloadStr);
      } catch {
        return NextResponse.json(
          { success: false, error: "Invalid JSON inside PO payload." },
          { status: 400 }
        );
      }

      const categories = formData.getAll("fileCategories").map((c) => String(c || "PO_DOCUMENT"));
      const uploadedFiles = formData.getAll("files");
      uploadedFiles.forEach((f, idx) => {
        if (f instanceof File && f.size > 0) {
          filesToUpload.push({
            file: f,
            category: categories[idx] || "PO_DOCUMENT",
          });
        }
      });
    } else {
      try {
        rawPayload = await req.json();
      } catch {
        return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
      }
    }

    const parsed = poCreateSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Purchase Order validation failed.",
          issues: parsed.error.flatten().fieldErrors,
        },
        { status: 422 }
      );
    }

    const input = parsed.data;
    const db = getPrisma();

    // Check submit permission if direct Submit requested
    if (input.submitAction === "SUBMIT") {
      const canSubmit = await checkSessionPermission(session, "purchaseOrders", "submit");
      if (!canSubmit) {
        return NextResponse.json(
          { success: false, error: "Forbidden: You do not have permission to submit POs for approval." },
          { status: 403 }
        );
      }
    }

    // 1. Validate Job eligibility (ACTIVE + APPROVED)
    const job = await (db.job as any).findUnique({
      where: { id: input.jobId },
      select: {
        id: true,
        jobCode: true,
        name: true,
        status: true,
        deletedAt: true,
      },
    });

    if (!job || !isJobEligibleForPo(job.status, job.deletedAt)) {
      return NextResponse.json(
        {
          success: false,
          error: job
            ? `Job "${job.jobCode}" (${job.status}) is not eligible for Purchase Orders. Only active APPROVED Jobs can have POs.`
            : "Selected Job not found.",
        },
        { status: 422 }
      );
    }

    // 2. Validate Supplier
    const supplier = await (db.supplier as any).findFirst({
      where: { id: input.supplierId, deletedAt: null },
    });
    if (!supplier) {
      return NextResponse.json(
        { success: false, error: "Selected Supplier not found or has been archived." },
        { status: 404 }
      );
    }

    // 3. Department allocation permissions & validation
    if (input.hasDepartmentAllocation) {
      const canAlloc = await checkSessionPermission(
        session,
        "purchaseOrders",
        "manageDepartmentAllocation"
      );
      if (!canAlloc) {
        return NextResponse.json(
          { success: false, error: "Forbidden: You do not have permission to manage department allocations." },
          { status: 403 }
        );
      }

      const deptIds = new Set<string>();
      input.items.forEach((it) => {
        (it.departmentAllocations || []).forEach((da) => deptIds.add(da.departmentId));
      });
      if (deptIds.size > 0) {
        const validDepts = await (db.department as any).findMany({
          where: { id: { in: Array.from(deptIds) } },
          select: { id: true },
        });
        const validSet = new Set(validDepts.map((d: any) => d.id));
        for (const reqId of deptIds) {
          if (!validSet.has(reqId)) {
            return NextResponse.json(
              { success: false, error: `Selected Department "${reqId}" was not found.` },
              { status: 422 }
            );
          }
        }
      }
    }

    // 4. Authoritative Server Financial Recalculation (Decimal.js)
    const financials = computePurchaseOrderFinancials({
      items: input.items.map((it) => ({ quantity: it.quantity, unitCost: it.unitCost })),
      discountAmount: input.discountAmount,
      applySscl: input.applySscl,
      ssclRate: input.ssclRate,
      applyVat: input.applyVat,
      vatRate: input.vatRate,
    });

    // 5. Budget Guard Validation
    const canOverrideBudget = await checkSessionPermission(
      session,
      "purchaseOrders",
      "overrideJobBudget"
    );

    const budgetCheck = await validatePoItemsAndBudget({
      jobId: job.id,
      items: input.items,
      poOverrideReason: input.budgetOverrideReason,
      canOverrideBudget,
      poGrandTotal: financials.grandTotal.toNumber(),
      client: db,
    });

    if (!budgetCheck.valid) {
      return NextResponse.json(
        {
          success: false,
          code: budgetCheck.code,
          error: budgetCheck.error,
        },
        { status: budgetCheck.status || 422 }
      );
    }

    // 6. Custom PO Number duplicate check if explicitly provided
    const requestedPoNo = input.poNumber?.trim() || "";
    if (requestedPoNo) {
      const existingPo = await (db.purchaseOrder as any).findUnique({
        where: { poNumber: requestedPoNo },
        select: { id: true },
      });
      if (existingPo) {
        return NextResponse.json(
          { success: false, error: `PO Number "${requestedPoNo}" already exists.` },
          { status: 409 }
        );
      }
    }

    // 7. Validate attachment buffers upfront before storage uploads
    const validatedFiles: Array<{
      buffer: Buffer;
      sanitizedName: string;
      mimeType: string;
      category: string;
    }> = [];

    for (const fObj of filesToUpload) {
      const buffer = Buffer.from(await fObj.file.arrayBuffer());
      const v = validateAttachmentBuffer(buffer, fObj.file.name, MAX_ATTACHMENT_SIZE_BYTES);
      if (!v.isValid) {
        return NextResponse.json(
          { success: false, error: `Attachment Error (${fObj.file.name}): ${v.error}` },
          { status: 400 }
        );
      }
      validatedFiles.push({
        buffer,
        sanitizedName: v.sanitizedName,
        mimeType: v.mimeType,
        category: fObj.category,
      });
    }

    // 8. Transactional DB Creation + Storage Uploads
    // Note: generate sequential PO number inside transaction so storage folder matches final PO Number,
    // or upload after reserving number inside transaction? Wait: uploading inside transaction can hold locks if slow,
    // so let's commit DB PO + items first inside $transaction, then upload files and attach metadata cleanly—or
    // upload files using requestedPoNo || tempTag? Even cleaner: create PO inside $transaction first (fast, deterministic),
    // then upload attachments & create attachment rows; if upload fails, rollback attachment OR delete PO if required.
    // Better yet: upload attachments BEFORE $transaction into a unique job folder using a provisional slug or preview number,
    // then bind permanently in $transaction! Let's check: uploadSupplierInvoiceAttachment runs before $transaction.
    // Let's upload attachments upfront using `requestedPoNo || "PO-UPLOAD"` folder or reserve folder cleanly!
    const attachmentMetaList: any[] = [];
    for (const vf of validatedFiles) {
      const up = await uploadPurchaseOrderAttachment({
        buffer: vf.buffer,
        originalName: vf.sanitizedName,
        jobCode: job.jobCode,
        poNumber: requestedPoNo || "ATTACHMENTS",
        category: vf.category,
        contentType: vf.mimeType,
        bucket: PURCHASE_ORDERS_BUCKET,
      });
      if (!up.success) {
        if (uploadedPaths.length > 0) {
          await cleanupOrphanedStorageFiles(uploadedPaths, PURCHASE_ORDERS_BUCKET);
        }
        return NextResponse.json(
          { success: false, error: `Failed to upload "${vf.sanitizedName}": ${up.error}` },
          { status: 500 }
        );
      }
      uploadedPaths.push(up.storagePath);
      attachmentMetaList.push({ ...up, category: vf.category });
    }

    const isSubmit = input.submitAction === "SUBMIT";
    const now = new Date();

    const createdPo = await db.$transaction(async (tx) => {
      const finalPoNumber = requestedPoNo || (await generateNextPoNumberTx(tx));

      const po = await (tx.purchaseOrder as any).create({
        data: {
          poNumber: finalPoNumber,
          jobId: job.id,
          supplierId: supplier.id,
          poDate: new Date(input.poDate),
          quotationRef: input.quotationRef || null,
          expectedDeliveryDate: input.expectedDeliveryDate
            ? new Date(input.expectedDeliveryDate)
            : null,
          deliverToName: input.deliverToName,
          deliverToAddress: input.deliverToAddress,
          deliverToEmail: input.deliverToEmail || null,
          supplierNameSnapshot: supplier.name,
          supplierAddressSnapshot: supplier.address,
          supplierEmailSnapshot: supplier.email,
          supplierPhoneSnapshot: supplier.phone,
          supplierContactSnapshot: supplier.contactPerson,
          comments: input.comments || null,
          terms: input.terms || null,
          status: isSubmit ? "PENDING" : "DRAFT",
          approvalStatus: isSubmit ? "PENDING" : "DRAFT",
          subTotal: financials.subTotal.toFixed(2),
          discountAmount: financials.discountAmount.toFixed(2),
          totalAfterDiscount: financials.totalAfterDiscount.toFixed(2),
          applySscl: financials.applySscl,
          ssclRate: financials.ssclRate.toFixed(3),
          ssclAmount: financials.ssclAmount.toFixed(2),
          totalWithSscl: financials.totalWithSscl.toFixed(2),
          applyVat: financials.applyVat,
          vatRate: financials.vatRate.toFixed(3),
          vatAmount: financials.vatAmount.toFixed(2),
          grandTotal: financials.grandTotal.toFixed(2),
          currency: input.currency || "LKR",
          hasDepartmentAllocation: input.hasDepartmentAllocation,
          departmentAllocationMode: input.departmentAllocationMode || "AMOUNT",
          budgetOverrideApproved: budgetCheck.budgetOverrideUsed,
          budgetOverrideReason: budgetCheck.budgetOverrideUsed
            ? input.budgetOverrideReason || "Authorized budget override"
            : null,
          submittedById: isSubmit ? session.userId : null,
          submittedAt: isSubmit ? now : null,
          createdById: session.userId,
          updatedById: session.userId,
        },
      });

      // Create line items & department allocations
      for (let i = 0; i < input.items.length; i++) {
        const item = input.items[i];
        const comp = financials.items[i];

        const createdItem = await (tx.purchaseOrderItem as any).create({
          data: {
            purchaseOrderId: po.id,
            rowNumber: i + 1,
            jobCostCategoryId: item.jobCostCategoryId || null,
            jobCostCategoryName: item.jobCostCategoryName || null,
            jobCostItemId: item.isAdditionalItem ? null : item.jobCostItemId || null,
            particular: item.particular,
            brand: item.brand || null,
            specifications: item.specifications || null,
            quantity: comp.quantity.toFixed(4),
            measure: item.measure,
            unitCost: comp.unitCost.toFixed(2),
            totalAmount: comp.totalAmount.toFixed(2),
            invoicedQuantity: "0.0000",
            invoicedAmount: "0.00",
            isAdditionalItem: Boolean(item.isAdditionalItem || !item.jobCostItemId),
            budgetOverrideReason: item.budgetOverrideReason || null,
            notes: item.notes || null,
          },
        });

        if (
          input.hasDepartmentAllocation &&
          Array.isArray(item.departmentAllocations) &&
          item.departmentAllocations.length > 0
        ) {
          for (const alloc of item.departmentAllocations) {
            if (Number(alloc.allocatedAmount || 0) <= 0 && Number(alloc.allocatedQuantity || 0) <= 0) {
              continue;
            }
            const pct =
              input.departmentAllocationMode === "QUANTITY" && comp.quantity.gt(0)
                ? (Number(alloc.allocatedQuantity || 0) / comp.quantity.toNumber()) * 100
                : comp.totalAmount.gt(0)
                ? (Number(alloc.allocatedAmount || 0) / comp.totalAmount.toNumber()) * 100
                : 0;

            await (tx.purchaseOrderDepartmentAllocation as any).create({
              data: {
                purchaseOrderId: po.id,
                purchaseOrderItemId: createdItem.id,
                departmentId: alloc.departmentId,
                allocatedQuantity: Number(alloc.allocatedQuantity || 0).toFixed(4),
                allocatedAmount: Number(alloc.allocatedAmount || 0).toFixed(2),
                percentage: Math.min(100, Math.max(0, pct)).toFixed(4),
                notes: alloc.notes || null,
              },
            });
          }
        }
      }

      // Attachments
      for (const att of attachmentMetaList) {
        const createdAtt = await (tx.purchaseOrderAttachment as any).create({
          data: {
            purchaseOrderId: po.id,
            category: att.category,
            fileName: att.fileName,
            originalFileName: att.originalFileName,
            storedFileName: att.storedFileName,
            bucketName: att.bucketName,
            storagePath: att.storagePath,
            fileSize: att.fileSize,
            fileType: att.mimeType,
            mimeType: att.mimeType,
            fileUrl: att.fileUrl,
            uploadedById: session.userId,
          },
        });
        await (tx.purchaseOrderAttachment as any).update({
          where: { id: createdAtt.id },
          data: { fileUrl: `/api/purchase-orders/attachments/${createdAtt.id}` },
        });
      }

      // Approval History
      await (tx.purchaseOrderApprovalHistory as any).create({
        data: {
          purchaseOrderId: po.id,
          userId: session.userId,
          action: "CREATE",
          previousStatus: "NONE",
          newStatus: "DRAFT",
          notes: `Created PO ${finalPoNumber} for Job ${job.jobCode}`,
        },
      });

      if (isSubmit) {
        await (tx.purchaseOrderApprovalHistory as any).create({
          data: {
            purchaseOrderId: po.id,
            userId: session.userId,
            action: "SUBMIT",
            previousStatus: "DRAFT",
            newStatus: "PENDING",
            notes: "Submitted immediately upon creation",
          },
        });
      }

      // PO Audit Log
      await (tx.purchaseOrderAuditLog as any).create({
        data: {
          purchaseOrderId: po.id,
          userId: session.userId,
          action: isSubmit ? "CREATE_AND_SUBMIT" : "CREATE",
          reason: budgetCheck.budgetOverrideUsed ? input.budgetOverrideReason || "Budget override" : null,
          newData: {
            poNumber: finalPoNumber,
            jobId: job.id,
            jobCode: job.jobCode,
            supplierId: supplier.id,
            supplierName: supplier.name,
            status: po.status,
            grandTotal: financials.grandTotal.toFixed(2),
            itemCount: input.items.length,
          },
        },
      });

      await recalculateJobFinances(job.id, tx);

      return po;
    });

    await logAuditEvent({
      userId: session.userId,
      action: isSubmit ? "CREATE_AND_SUBMIT_PO" : "CREATE_PO",
      resource: "purchaseOrders",
      resourceId: createdPo.id,
      details: {
        poNumber: createdPo.poNumber,
        jobCode: job.jobCode,
        supplierName: supplier.name,
        grandTotal: financials.grandTotal.toFixed(2),
        status: createdPo.status,
      },
      req,
    });

    return NextResponse.json(
      {
        success: true,
        message: isSubmit
          ? `Purchase Order ${createdPo.poNumber} created and submitted for approval.`
          : `Purchase Order ${createdPo.poNumber} saved as Draft.`,
        data: {
          id: createdPo.id,
          poNumber: createdPo.poNumber,
          status: createdPo.status,
          grandTotal: financials.grandTotal.toNumber(),
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    if (uploadedPaths.length > 0) {
      await cleanupOrphanedStorageFiles(uploadedPaths, PURCHASE_ORDERS_BUCKET);
    }
    console.error("POST /api/purchase-orders error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to create Purchase Order." },
      { status: 500 }
    );
  }
}
