import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";
import { canUserAccessRecord } from "@/lib/data-visibility";
import { logAuditEvent } from "@/lib/audit";
import { recalculateJobFinances } from "@/lib/financial-recalculation";
import { cleanupOrphanedStorageFiles, PURCHASE_ORDERS_BUCKET } from "@/lib/supabase";
import { poCreateSchema } from "@/lib/validations/purchase-order";
import { computePurchaseOrderFinancials, isJobEligibleForPo } from "@/lib/po-financial";
import { serializePurchaseOrder, validatePoItemsAndBudget } from "@/lib/po-helpers";

const PO_DETAIL_INCLUDE = {
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
      totalCost: true,
      grandTotal: true,
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
    orderBy: { rowNumber: "asc" as const },
    include: {
      departmentAllocations: {
        include: { department: { select: { id: true, name: true, code: true } } },
      },
    },
  },
  departmentAllocations: {
    include: { department: { select: { id: true, name: true, code: true } } },
  },
  deliveries: {
    orderBy: { deliveryDate: "desc" as const },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      items: {
        include: {
          purchaseOrderItem: {
            select: { id: true, particular: true, measure: true, quantity: true },
          },
        },
      },
      attachments: true,
    },
  },
  attachments: {
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" as const },
  },
  approvalHistory: {
    orderBy: { createdAt: "desc" as const },
    include: { user: { select: { id: true, name: true, email: true } } },
  },
  auditLogs: {
    orderBy: { createdAt: "desc" as const },
    include: { user: { select: { id: true, name: true, email: true } } },
  },
  supplierInvoices: {
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" as const },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
  },
  createdBy: { select: { id: true, name: true, email: true } },
  updatedBy: { select: { id: true, name: true, email: true } },
  submittedBy: { select: { id: true, name: true, email: true } },
  approvedBy: { select: { id: true, name: true, email: true } },
  rejectedBy: { select: { id: true, name: true, email: true } },
  issuedBy: { select: { id: true, name: true, email: true } },
  cancelledBy: { select: { id: true, name: true, email: true } },
};

// GET /api/purchase-orders/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;

  try {
    const db = getPrisma();
    const po = await (db.purchaseOrder as any).findUnique({
      where: { id },
      include: PO_DETAIL_INCLUDE,
    });

    if (!po) {
      return NextResponse.json({ success: false, error: "Purchase Order not found." }, { status: 404 });
    }

    const accessCheck = await canUserAccessRecord(session, "purchaseOrders", po.createdById, "view");
    if (!accessCheck.allowed) {
      return NextResponse.json(
        { success: false, error: accessCheck.reason || "Purchase Order not found." },
        { status: 404 }
      );
    }

    const canViewFinancials = await checkSessionPermission(
      session,
      "purchaseOrders",
      "viewFinancials"
    );
    const mask = !canViewFinancials && po.createdById !== session.userId;

    return NextResponse.json({
      success: true,
      data: serializePurchaseOrder(po, mask),
    });
  } catch (err: any) {
    console.error(`GET /api/purchase-orders/${id} error:`, err);
    return NextResponse.json(
      { success: false, error: "Failed to load Purchase Order details." },
      { status: 500 }
    );
  }
}

// PUT /api/purchase-orders/[id]
// Edit PO (Allowed only in DRAFT or REJECTED status, unless explicitly returned to draft by admin)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized access." }, { status: 401 });
  }

  const canEdit = await checkSessionPermission(session, "purchaseOrders", "edit");
  if (!canEdit) {
    return NextResponse.json(
      { success: false, error: "Forbidden: You do not have permission to edit Purchase Orders." },
      { status: 403 }
    );
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = poCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Validation failed.",
        issues: parsed.error.flatten().fieldErrors,
      },
      { status: 422 }
    );
  }

  const input = parsed.data;

  try {
    const db = getPrisma();
    const existing = await (db.purchaseOrder as any).findUnique({
      where: { id },
      include: { items: true },
    });

    if (!existing || existing.deletedAt) {
      return NextResponse.json({ success: false, error: "Purchase Order not found." }, { status: 404 });
    }

    const editAccess = await canUserAccessRecord(
      session,
      "purchaseOrders",
      existing.createdById,
      "edit"
    );
    if (!editAccess.allowed) {
      return NextResponse.json(
        { success: false, error: editAccess.reason || "Forbidden." },
        { status: 403 }
      );
    }

    if (!["DRAFT", "REJECTED"].includes(existing.status)) {
      return NextResponse.json(
        {
          success: false,
          error: `Purchase Order "${existing.poNumber}" has status "${existing.status}" and cannot be edited directly. Return to Draft or create a revision.`,
        },
        { status: 422 }
      );
    }

    if (input.submitAction === "SUBMIT") {
      const canSubmit = await checkSessionPermission(session, "purchaseOrders", "submit");
      if (!canSubmit) {
        return NextResponse.json(
          { success: false, error: "Forbidden: You do not have permission to submit Purchase Orders." },
          { status: 403 }
        );
      }
    }

    const job = await (db.job as any).findUnique({
      where: { id: input.jobId },
      select: { id: true, jobCode: true, name: true, status: true, deletedAt: true },
    });
    if (!job || !isJobEligibleForPo(job.status, job.deletedAt)) {
      return NextResponse.json(
        { success: false, error: "Selected Job is not active or approved for Purchase Orders." },
        { status: 422 }
      );
    }

    const supplier = await (db.supplier as any).findFirst({
      where: { id: input.supplierId, deletedAt: null },
    });
    if (!supplier) {
      return NextResponse.json(
        { success: false, error: "Selected Supplier not found or archived." },
        { status: 404 }
      );
    }

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
    }

    const financials = computePurchaseOrderFinancials({
      items: input.items.map((it) => ({ quantity: it.quantity, unitCost: it.unitCost })),
      discountAmount: input.discountAmount,
      applySscl: input.applySscl,
      ssclRate: input.ssclRate,
      applyVat: input.applyVat,
      vatRate: input.vatRate,
    });

    const canOverrideBudget = await checkSessionPermission(
      session,
      "purchaseOrders",
      "overrideJobBudget"
    );

    const budgetCheck = await validatePoItemsAndBudget({
      jobId: job.id,
      items: input.items,
      poOverrideReason: input.budgetOverrideReason,
      excludePoId: existing.id,
      canOverrideBudget,
      poGrandTotal: financials.grandTotal.toNumber(),
      client: db,
    });

    if (!budgetCheck.valid) {
      return NextResponse.json(
        { success: false, code: budgetCheck.code, error: budgetCheck.error },
        { status: budgetCheck.status || 422 }
      );
    }

    const isSubmit = input.submitAction === "SUBMIT";
    const now = new Date();
    const prevStatus = existing.status;

    const updated = await db.$transaction(async (tx) => {
      await (tx.purchaseOrderDepartmentAllocation as any).deleteMany({
        where: { purchaseOrderId: id },
      });
      await (tx.purchaseOrderItem as any).deleteMany({
        where: { purchaseOrderId: id },
      });

      const po = await (tx.purchaseOrder as any).update({
        where: { id },
        data: {
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
          ...(isSubmit ? { submittedById: session.userId, submittedAt: now } : {}),
          updatedById: session.userId,
        },
      });

      for (let i = 0; i < input.items.length; i++) {
        const item = input.items[i];
        const comp = financials.items[i];

        const createdItem = await (tx.purchaseOrderItem as any).create({
          data: {
            purchaseOrderId: id,
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
            deliveredQuantity: "0.0000",
            remainingQuantity: comp.quantity.toFixed(4),
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
                purchaseOrderId: id,
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

      if (isSubmit) {
        await (tx.purchaseOrderApprovalHistory as any).create({
          data: {
            purchaseOrderId: id,
            userId: session.userId,
            action: "SUBMIT",
            previousStatus: prevStatus,
            newStatus: "PENDING",
            notes: "PO updated and submitted for approval",
          },
        });
      }

      await (tx.purchaseOrderAuditLog as any).create({
        data: {
          purchaseOrderId: id,
          userId: session.userId,
          action: isSubmit ? "EDIT_AND_SUBMIT" : "EDIT",
          previousData: {
            status: existing.status,
            grandTotal: Number(existing.grandTotal || 0),
          },
          newData: {
            status: po.status,
            grandTotal: financials.grandTotal.toFixed(2),
            itemCount: input.items.length,
          },
        },
      });

      await recalculateJobFinances(job.id, tx);
      if (existing.jobId !== job.id) {
        await recalculateJobFinances(existing.jobId, tx);
      }

      return po;
    });

    await logAuditEvent({
      userId: session.userId,
      action: "UPDATE_PO",
      resource: "purchaseOrders",
      resourceId: id,
      details: {
        poNumber: updated.poNumber,
        status: updated.status,
        grandTotal: financials.grandTotal.toFixed(2),
      },
      req,
    });

    return NextResponse.json({
      success: true,
      message: isSubmit
        ? `Purchase Order ${updated.poNumber} updated and submitted for approval.`
        : `Purchase Order ${updated.poNumber} updated successfully.`,
      data: updated,
    });
  } catch (err: any) {
    console.error(`PUT /api/purchase-orders/${id} error:`, err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to update Purchase Order." },
      { status: 500 }
    );
  }
}

// DELETE /api/purchase-orders/[id]
// Soft deletes (moves to Trash) by default; ?permanent=true permanently deletes only eligible DRAFT/REJECTED POs
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized access." }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const permanent = searchParams.get("permanent") === "true";

  const requiredAction = permanent ? "permanentDelete" : "delete";
  const hasPerm = await checkSessionPermission(session, "purchaseOrders", requiredAction);
  if (!hasPerm) {
    return NextResponse.json(
      {
        success: false,
        error: permanent
          ? "Forbidden: You do not have permission to permanently delete Purchase Orders."
          : "Forbidden: You do not have permission to delete Purchase Orders.",
      },
      { status: 403 }
    );
  }

  try {
    const db = getPrisma();
    const existing = await (db.purchaseOrder as any).findUnique({
      where: { id },
      include: {
        attachments: { select: { id: true, storagePath: true, bucketName: true } },
        supplierInvoices: {
          where: { deletedAt: null },
          select: { id: true, invoiceNumber: true, status: true },
        },
        deliveries: { select: { id: true } },
      },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: "Purchase Order not found." }, { status: 404 });
    }

    const delCheck = await canUserAccessRecord(
      session,
      "purchaseOrders",
      existing.createdById,
      requiredAction
    );
    if (!delCheck.allowed) {
      return NextResponse.json(
        { success: false, error: delCheck.reason || "Forbidden." },
        { status: 403 }
      );
    }

    // Protect financial/operational POs from deletion
    const lockedStatuses = ["APPROVED", "ISSUED", "PARTIALLY_DELIVERED", "DELIVERED"];

    if (permanent) {
      if (
        lockedStatuses.includes(existing.status) ||
        (existing.supplierInvoices || []).length > 0 ||
        (existing.deliveries || []).length > 0
      ) {
        return NextResponse.json(
          {
            success: false,
            blocked: true,
            error: `Cannot Permanently Delete Purchase Order "${existing.poNumber}": Approved, Issued, Delivered, or Invoice-linked POs cannot be permanently purged for financial audit compliance.`,
          },
          { status: 422 }
        );
      }

      const storagePaths = (existing.attachments || [])
        .map((a: any) => a.storagePath)
        .filter((p: any): p is string => Boolean(p));

      await db.$transaction(async (tx) => {
        await (tx.purchaseOrderAttachment as any).deleteMany({ where: { purchaseOrderId: id } });
        await (tx.purchaseOrderDepartmentAllocation as any).deleteMany({ where: { purchaseOrderId: id } });
        await (tx.purchaseOrderDelivery as any).deleteMany({ where: { purchaseOrderId: id } });
        await (tx.purchaseOrderApprovalHistory as any).deleteMany({ where: { purchaseOrderId: id } });
        await (tx.purchaseOrderAuditLog as any).deleteMany({ where: { purchaseOrderId: id } });
        await (tx.purchaseOrderItem as any).deleteMany({ where: { purchaseOrderId: id } });
        await (tx.purchaseOrder as any).delete({ where: { id } });
        await recalculateJobFinances(existing.jobId, tx);
      });

      if (storagePaths.length > 0) {
        cleanupOrphanedStorageFiles(storagePaths, PURCHASE_ORDERS_BUCKET).catch(() => {});
      }

      await logAuditEvent({
        userId: session.userId,
        action: "PERMANENT_DELETE_PO",
        resource: "purchaseOrders",
        resourceId: id,
        details: { poNumber: existing.poNumber },
        req,
      });

      return NextResponse.json({
        success: true,
        message: `Purchase Order "${existing.poNumber}" permanently deleted.`,
      });
    }

    // Soft Delete (Move to Trash): Block if already Issued/Delivered/Linked to active invoices
    if (
      ["ISSUED", "PARTIALLY_DELIVERED", "DELIVERED"].includes(existing.status) ||
      (existing.supplierInvoices || []).some((inv: any) => inv.status !== "CANCELLED")
    ) {
      return NextResponse.json(
        {
          success: false,
          blocked: true,
          error: `Cannot move "${existing.poNumber}" to Trash because it is Issued/Delivered or has linked active Supplier Invoices. Cancel the PO first if required.`,
        },
        { status: 422 }
      );
    }

    await db.$transaction(async (tx) => {
      await (tx.purchaseOrder as any).update({
        where: { id },
        data: { deletedAt: new Date(), updatedById: session.userId },
      });
      await (tx.purchaseOrderAuditLog as any).create({
        data: {
          purchaseOrderId: id,
          userId: session.userId,
          action: "SOFT_DELETE",
          reason: "Moved to Trash",
        },
      });
      await recalculateJobFinances(existing.jobId, tx);
    });

    await logAuditEvent({
      userId: session.userId,
      action: "SOFT_DELETE_PO",
      resource: "purchaseOrders",
      resourceId: id,
      details: { poNumber: existing.poNumber },
      req,
    });

    return NextResponse.json({
      success: true,
      message: `Purchase Order "${existing.poNumber}" moved to Trash.`,
    });
  } catch (err: any) {
    console.error(`DELETE /api/purchase-orders/${id} error:`, err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to delete Purchase Order." },
      { status: 500 }
    );
  }
}
