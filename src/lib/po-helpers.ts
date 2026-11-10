import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { Decimal, toDecimal, roundFinancial } from "@/lib/financial";
import { PO_ACTIVE_COMMITMENT_STATUSES } from "@/lib/po-financial";
import { JobCostItemBudgetInfo, PurchaseOrder } from "@/types/admin";

export interface JobBudgetCalculationResult {
  job: {
    id: string;
    jobCode: string;
    name: string;
    date: string;
    clientName: string | null;
    status: string;
    approvedJobValue: number;
  };
  categories: Array<{
    id: string;
    name: string;
    sortOrder: number;
    subtotal: number;
    items: JobCostItemBudgetInfo[];
  }>;
  itemsById: Map<string, JobCostItemBudgetInfo>;
  totals: {
    originalBudgetTotal: number;
    committedPoTotal: number;
    draftPoTotal: number;
    remainingBudgetTotal: number;
  };
}

/**
 * Loads a Job's real cost categories and items from DB along with live PO commitments
 * across all active POs (`PENDING`, `APPROVED`, `ISSUED`, `PARTIALLY_DELIVERED`, `DELIVERED`)
 * and draft POs (`DRAFT`), optionally excluding `excludePoId` (used during PO Edit / Submit).
 */
export async function getJobCostItemsWithPoBudget(
  jobId: string,
  excludePoId?: string | null,
  client?: Prisma.TransactionClient | any
): Promise<JobBudgetCalculationResult | null> {
  const db = client || getPrisma();

  const job = await (db.job as any).findUnique({
    where: { id: jobId },
    include: {
      costCategories: {
        orderBy: { sortOrder: "asc" },
        include: {
          items: {
            orderBy: { sortOrder: "asc" },
          },
        },
      },
      costItems: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!job) return null;

  // Query all PO items linked to this job's cost items (or uncategorized items on this job)
  const existingPoItems = await (db.purchaseOrderItem as any).findMany({
    where: {
      purchaseOrder: {
        jobId,
        deletedAt: null,
        status: { notIn: ["CANCELLED", "REJECTED"] },
        ...(excludePoId ? { id: { not: excludePoId } } : {}),
      },
      jobCostItemId: { not: null },
    },
    select: {
      jobCostItemId: true,
      totalAmount: true,
      purchaseOrder: {
        select: { status: true },
      },
    },
  });

  const committedMap = new Map<string, Decimal>();
  const draftMap = new Map<string, Decimal>();

  for (const row of existingPoItems) {
    if (!row.jobCostItemId) continue;
    const amt = toDecimal(row.totalAmount);
    const poStatus = String(row.purchaseOrder?.status || "").toUpperCase();
    if (poStatus === "DRAFT") {
      draftMap.set(row.jobCostItemId, (draftMap.get(row.jobCostItemId) || new Decimal(0)).plus(amt));
    } else if (PO_ACTIVE_COMMITMENT_STATUSES.includes(poStatus)) {
      committedMap.set(
        row.jobCostItemId,
        (committedMap.get(row.jobCostItemId) || new Decimal(0)).plus(amt)
      );
    }
  }

  const itemsById = new Map<string, JobCostItemBudgetInfo>();
  const categoryNameMap = new Map<string, string>();
  (job.costCategories || []).forEach((c: any) => categoryNameMap.set(c.id, c.name));

  let originalBudgetTotal = new Decimal(0);
  let committedPoTotal = new Decimal(0);
  let draftPoTotal = new Decimal(0);

  const buildItemInfo = (rawItem: any, catName: string): JobCostItemBudgetInfo => {
    const orig = roundFinancial(rawItem.totalCost, 2);
    const committed = roundFinancial(committedMap.get(rawItem.id) || 0, 2);
    const draft = roundFinancial(draftMap.get(rawItem.id) || 0, 2);
    const remaining = roundFinancial(orig.minus(committed), 2);

    originalBudgetTotal = originalBudgetTotal.plus(orig);
    committedPoTotal = committedPoTotal.plus(committed);
    draftPoTotal = draftPoTotal.plus(draft);

    const info: JobCostItemBudgetInfo = {
      id: rawItem.id,
      jobId: job.id,
      categoryId: rawItem.categoryId || null,
      categoryName: catName,
      itemNumber: rawItem.itemNumber ?? null,
      description: rawItem.description,
      rcNrc: rawItem.rcNrc ?? null,
      quantity: roundFinancial(rawItem.quantity || 1, 4).toNumber(),
      rate: roundFinancial(rawItem.rate || 0, 2).toNumber(),
      originalAmount: orig.toNumber(),
      committedPoAmount: committed.toNumber(),
      draftPoAmount: draft.toNumber(),
      remainingBudget: remaining.toNumber(),
      isFullyAllocated: remaining.lte(0),
    };
    itemsById.set(info.id, info);
    return info;
  };

  const categories = (job.costCategories || []).map((cat: any) => ({
    id: cat.id,
    name: cat.name,
    sortOrder: cat.sortOrder,
    subtotal: roundFinancial(cat.subtotal, 2).toNumber(),
    items: (cat.items || []).map((it: any) => buildItemInfo(it, cat.name)),
  }));

  // Include any uncategorized cost items that weren't inside costCategories
  const uncategorized = (job.costItems || []).filter(
    (it: any) => !it.categoryId || !categoryNameMap.has(it.categoryId)
  );
  if (uncategorized.length > 0) {
    categories.push({
      id: "uncategorized",
      name: "General Cost Items",
      sortOrder: 9999,
      subtotal: uncategorized.reduce((s: number, it: any) => s + Number(it.totalCost || 0), 0),
      items: uncategorized.map((it: any) => buildItemInfo(it, "General Cost Items")),
    });
  }

  const remainingBudgetTotal = roundFinancial(originalBudgetTotal.minus(committedPoTotal), 2);

  return {
    job: {
      id: job.id,
      jobCode: job.jobCode,
      name: job.name,
      date: job.date,
      clientName: job.clientName,
      status: job.status,
      approvedJobValue: roundFinancial(job.grandTotal || job.totalCost || 0, 2).toNumber(),
    },
    categories,
    itemsById,
    totals: {
      originalBudgetTotal: roundFinancial(originalBudgetTotal, 2).toNumber(),
      committedPoTotal: roundFinancial(committedPoTotal, 2).toNumber(),
      draftPoTotal: roundFinancial(draftPoTotal, 2).toNumber(),
      remainingBudgetTotal: remainingBudgetTotal.toNumber(),
    },
  };
}

/**
 * Formats a full Prisma PurchaseOrder record (with includes) to the typed API JSON shape.
 */
export function serializePurchaseOrder(po: any, maskFinancials = false): PurchaseOrder {
  const items = (po.items || []).map((it: any) => {
    const qty = Number(it.quantity || 0);
    const deliv = Number(it.deliveredQuantity || 0);
    return {
      id: it.id,
      purchaseOrderId: it.purchaseOrderId,
      rowNumber: it.rowNumber,
      jobCostCategoryId: it.jobCostCategoryId || null,
      jobCostCategoryName: it.jobCostCategoryName || null,
      jobCostItemId: it.jobCostItemId || null,
      particular: it.particular,
      brand: it.brand || null,
      specifications: it.specifications || null,
      quantity: qty,
      measure: it.measure || "Nos",
      unitCost: maskFinancials ? 0 : Number(it.unitCost || 0),
      totalAmount: maskFinancials ? 0 : Number(it.totalAmount || 0),
      deliveredQuantity: deliv,
      remainingQuantity: Number(it.remainingQuantity ?? Math.max(0, qty - deliv)),
      invoicedQuantity: Number(it.invoicedQuantity || 0),
      invoicedAmount: maskFinancials ? 0 : Number(it.invoicedAmount || 0),
      isAdditionalItem: Boolean(it.isAdditionalItem),
      budgetOverrideReason: it.budgetOverrideReason || null,
      notes: it.notes || null,
      departmentAllocations: (it.departmentAllocations || []).map((da: any) => ({
        id: da.id,
        purchaseOrderId: da.purchaseOrderId,
        purchaseOrderItemId: da.purchaseOrderItemId || null,
        departmentId: da.departmentId,
        departmentName: da.department?.name || "",
        departmentCode: da.department?.code || null,
        allocatedQuantity: Number(da.allocatedQuantity || 0),
        allocatedAmount: maskFinancials ? 0 : Number(da.allocatedAmount || 0),
        percentage: Number(da.percentage || 0),
        notes: da.notes || null,
      })),
    };
  });

  const totalOrderedQuantity = items.reduce((s: number, it: any) => s + Number(it.quantity || 0), 0);
  const totalDeliveredQuantity = items.reduce(
    (s: number, it: any) => s + Math.min(Number(it.quantity || 0), Number(it.deliveredQuantity || 0)),
    0
  );
  const deliveryProgressPercent =
    totalOrderedQuantity > 0
      ? Number(((totalDeliveredQuantity / totalOrderedQuantity) * 100).toFixed(1))
      : 0;

  const activeInvoices = (po.supplierInvoices || []).filter(
    (inv: any) => !inv.deletedAt && inv.status !== "CANCELLED"
  );
  const invoicedTotal = activeInvoices.reduce(
    (sum: number, inv: any) => sum + Number(inv.totalAmount || 0),
    0
  );
  const grandTotal = Number(po.grandTotal || 0);
  const remainingUninvoiced = Math.max(0, Number(new Decimal(grandTotal).minus(invoicedTotal).toFixed(2)));

  return {
    id: po.id,
    poNumber: po.poNumber,
    jobId: po.jobId,
    jobCode: po.job?.jobCode || "",
    jobName: po.job?.name || "",
    clientName: po.job?.clientName || "",
    jobDate: po.job?.date || "",
    jobApprovedValue: maskFinancials
      ? 0
      : Number(po.job?.grandTotal || po.job?.totalCost || 0),
    job: po.job || undefined,
    supplierId: po.supplierId,
    supplierCode: po.supplier?.code || "",
    supplierName: po.supplierNameSnapshot || po.supplier?.name || "",
    supplierEmail: po.supplierEmailSnapshot || po.supplier?.email || "",
    supplierPhone: po.supplierPhoneSnapshot || po.supplier?.phone || "",
    supplierAddress: po.supplierAddressSnapshot || po.supplier?.address || "",
    supplierContactPerson:
      po.supplierContactSnapshot || po.supplier?.contactPerson || "",
    supplier: po.supplier || undefined,
    poDate: po.poDate ? new Date(po.poDate).toISOString().split("T")[0] : "",
    quotationRef: po.quotationRef || null,
    expectedDeliveryDate: po.expectedDeliveryDate
      ? new Date(po.expectedDeliveryDate).toISOString().split("T")[0]
      : null,
    deliverToName: po.deliverToName,
    deliverToAddress: po.deliverToAddress,
    deliverToEmail: po.deliverToEmail || null,
    comments: po.comments || null,
    terms: po.terms || null,
    status: po.status,
    approvalStatus: po.approvalStatus,
    deliveryStatus: po.deliveryStatus,
    subTotal: maskFinancials ? 0 : Number(po.subTotal || 0),
    discountAmount: maskFinancials ? 0 : Number(po.discountAmount || 0),
    totalAfterDiscount: maskFinancials ? 0 : Number(po.totalAfterDiscount || 0),
    applySscl: Boolean(po.applySscl),
    ssclRate: Number(po.ssclRate || 0),
    ssclAmount: maskFinancials ? 0 : Number(po.ssclAmount || 0),
    totalWithSscl: maskFinancials ? 0 : Number(po.totalWithSscl || 0),
    applyVat: Boolean(po.applyVat),
    vatRate: Number(po.vatRate || 0),
    vatAmount: maskFinancials ? 0 : Number(po.vatAmount || 0),
    grandTotal: maskFinancials ? 0 : grandTotal,
    currency: po.currency || "LKR",
    hasDepartmentAllocation: Boolean(po.hasDepartmentAllocation),
    departmentAllocationMode: po.departmentAllocationMode || "AMOUNT",
    budgetOverrideApproved: Boolean(po.budgetOverrideApproved),
    budgetOverrideReason: po.budgetOverrideReason || null,
    submittedById: po.submittedById || null,
    submittedByName: po.submittedBy?.name || null,
    submittedAt: po.submittedAt ? new Date(po.submittedAt).toISOString() : null,
    approvedById: po.approvedById || null,
    approvedByName: po.approvedBy?.name || null,
    approvedAt: po.approvedAt ? new Date(po.approvedAt).toISOString() : null,
    rejectedById: po.rejectedById || null,
    rejectedByName: po.rejectedBy?.name || null,
    rejectedAt: po.rejectedAt ? new Date(po.rejectedAt).toISOString() : null,
    rejectionReason: po.rejectionReason || null,
    issuedById: po.issuedById || null,
    issuedByName: po.issuedBy?.name || null,
    issuedAt: po.issuedAt ? new Date(po.issuedAt).toISOString() : null,
    cancelledById: po.cancelledById || null,
    cancelledByName: po.cancelledBy?.name || null,
    cancelledAt: po.cancelledAt ? new Date(po.cancelledAt).toISOString() : null,
    cancellationReason: po.cancellationReason || null,
    createdById: po.createdById || null,
    createdByName: po.createdBy?.name || "System Admin",
    createdByEmail: po.createdBy?.email || null,
    updatedById: po.updatedById || null,
    updatedByName: po.updatedBy?.name || null,
    deletedAt: po.deletedAt ? new Date(po.deletedAt).toISOString() : null,
    isDeleted: po.deletedAt !== null && po.deletedAt !== undefined,
    items,
    departmentAllocations: (po.departmentAllocations || []).map((da: any) => ({
      id: da.id,
      purchaseOrderId: da.purchaseOrderId,
      purchaseOrderItemId: da.purchaseOrderItemId || null,
      departmentId: da.departmentId,
      departmentName: da.department?.name || "",
      departmentCode: da.department?.code || null,
      allocatedQuantity: Number(da.allocatedQuantity || 0),
      allocatedAmount: maskFinancials ? 0 : Number(da.allocatedAmount || 0),
      percentage: Number(da.percentage || 0),
      notes: da.notes || null,
    })),
    deliveries: (po.deliveries || []).map((del: any) => ({
      id: del.id,
      purchaseOrderId: del.purchaseOrderId,
      deliveryReference: del.deliveryReference,
      deliveryDate: del.deliveryDate ? new Date(del.deliveryDate).toISOString().split("T")[0] : "",
      receivedBy: del.receivedBy,
      notes: del.notes || null,
      isOverride: Boolean(del.isOverride),
      overrideReason: del.overrideReason || null,
      createdById: del.createdById || null,
      createdByName: del.createdBy?.name || null,
      items: (del.items || []).map((di: any) => ({
        id: di.id,
        deliveryId: di.deliveryId,
        purchaseOrderItemId: di.purchaseOrderItemId,
        particular: di.purchaseOrderItem?.particular || "",
        measure: di.purchaseOrderItem?.measure || "Nos",
        orderedQuantity: Number(di.purchaseOrderItem?.quantity || 0),
        deliveredQuantity: Number(di.deliveredQuantity || 0),
        notes: di.notes || null,
      })),
      attachments: (del.attachments || []).map((att: any) => ({
        id: att.id,
        purchaseOrderId: att.purchaseOrderId,
        deliveryId: att.deliveryId || null,
        category: att.category,
        fileName: att.fileName,
        originalFileName: att.originalFileName || att.fileName,
        storedFileName: att.storedFileName,
        bucketName: att.bucketName,
        storagePath: att.storagePath,
        fileSize: att.fileSize,
        fileType: att.fileType,
        mimeType: att.mimeType || att.fileType,
        fileUrl: `/api/purchase-orders/attachments/${att.id}`,
        createdAt: att.createdAt ? new Date(att.createdAt).toISOString() : "",
      })),
      createdAt: del.createdAt ? new Date(del.createdAt).toISOString() : "",
    })),
    attachments: (po.attachments || [])
      .filter((att: any) => !att.deletedAt)
      .map((att: any) => ({
        id: att.id,
        purchaseOrderId: att.purchaseOrderId,
        deliveryId: att.deliveryId || null,
        category: att.category,
        fileName: att.fileName,
        originalFileName: att.originalFileName || att.fileName,
        storedFileName: att.storedFileName,
        bucketName: att.bucketName,
        storagePath: att.storagePath,
        fileSize: att.fileSize,
        fileType: att.fileType,
        mimeType: att.mimeType || att.fileType,
        fileUrl: `/api/purchase-orders/attachments/${att.id}`,
        createdAt: att.createdAt ? new Date(att.createdAt).toISOString() : "",
      })),
    approvalHistory: (po.approvalHistory || []).map((h: any) => ({
      id: h.id,
      purchaseOrderId: h.purchaseOrderId,
      userId: h.userId || null,
      userName: h.user?.name || "System",
      userEmail: h.user?.email || null,
      action: h.action,
      previousStatus: h.previousStatus,
      newStatus: h.newStatus,
      reason: h.reason || null,
      notes: h.notes || null,
      createdAt: h.createdAt ? new Date(h.createdAt).toISOString() : "",
    })),
    auditLogs: (po.auditLogs || []).map((log: any) => ({
      id: log.id,
      purchaseOrderId: log.purchaseOrderId,
      userId: log.userId || null,
      userName: log.user?.name || "System",
      action: log.action,
      reason: log.reason || null,
      previousData: log.previousData,
      newData: log.newData,
      createdAt: log.createdAt ? new Date(log.createdAt).toISOString() : "",
    })),
    supplierInvoices: (po.supplierInvoices || []).map((inv: any) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      supplierId: inv.supplierId,
      jobId: inv.jobId,
      purchaseOrderId: inv.purchaseOrderId || null,
      invoiceDate: inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().split("T")[0] : "",
      totalAmount: maskFinancials ? 0 : Number(inv.totalAmount || 0),
      status: inv.status,
      notes: inv.notes || null,
      createdByName: inv.createdBy?.name || "System Admin",
      createdAt: inv.createdAt ? new Date(inv.createdAt).toISOString().split("T")[0] : "",
      updatedAt: inv.updatedAt ? new Date(inv.updatedAt).toISOString().split("T")[0] : "",
    })),
    invoicedTotal: maskFinancials ? 0 : roundFinancial(invoicedTotal, 2).toNumber(),
    remainingUninvoiced: maskFinancials ? 0 : remainingUninvoiced,
    totalOrderedQuantity,
    totalDeliveredQuantity,
    deliveryProgressPercent,
    itemCount: items.length,
    createdAt: po.createdAt ? new Date(po.createdAt).toISOString() : "",
    updatedAt: po.updatedAt ? new Date(po.updatedAt).toISOString() : "",
  };
}

export interface PoBudgetValidationResult {
  valid: boolean;
  status?: number;
  code?: string;
  error?: string;
  budgetOverrideUsed: boolean;
}

/**
 * Validates PO line items against real Job Cost Items & remaining PO commitments.
 * Blocks exceeding budget or adding unbudgeted items unless user has explicit
 * `overrideJobBudget` permission AND provides a non-empty justification reason.
 */
export async function validatePoItemsAndBudget(params: {
  jobId: string;
  items: Array<{
    jobCostItemId?: string | null;
    particular: string;
    quantity: number | string;
    unitCost: number | string;
    isAdditionalItem?: boolean;
    budgetOverrideReason?: string | null;
  }>;
  poOverrideReason?: string | null;
  excludePoId?: string | null;
  canOverrideBudget: boolean;
  poGrandTotal: number;
  client?: Prisma.TransactionClient | any;
}): Promise<PoBudgetValidationResult> {
  const {
    jobId,
    items,
    poOverrideReason,
    excludePoId,
    canOverrideBudget,
    poGrandTotal,
    client,
  } = params;

  const budgetData = await getJobCostItemsWithPoBudget(jobId, excludePoId, client);
  if (!budgetData) {
    return { valid: false, status: 404, error: "Selected Job not found.", budgetOverrideUsed: false };
  }

  let budgetOverrideUsed = false;
  const trimmedPoReason = (poOverrideReason || "").trim();

  // Case A: Job has detailed cost items (normal Excel quotation flow)
  if (budgetData.itemsById.size > 0) {
    const requestedByCostItem = new Map<string, Decimal>();

    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx];
      const lineAmount = roundFinancial(toDecimal(it.quantity).mul(toDecimal(it.unitCost)), 2);
      const itemReason = (it.budgetOverrideReason || "").trim();

      if (it.isAdditionalItem || !it.jobCostItemId) {
        if (!canOverrideBudget) {
          return {
            valid: false,
            status: 403,
            code: "ADDITIONAL_ITEM_FORBIDDEN",
            error: `Row ${idx + 1} ("${it.particular}"): Unbudgeted additional PO items require explicit "Override Job Cost Budget" permission.`,
            budgetOverrideUsed: false,
          };
        }
        if (!itemReason && !trimmedPoReason) {
          return {
            valid: false,
            status: 422,
            code: "OVERRIDE_REASON_REQUIRED",
            error: `Row ${idx + 1} ("${it.particular}"): Justification reason is required for unbudgeted additional items.`,
            budgetOverrideUsed: false,
          };
        }
        budgetOverrideUsed = true;
        continue;
      }

      const costItemInfo = budgetData.itemsById.get(it.jobCostItemId);
      if (!costItemInfo) {
        return {
          valid: false,
          status: 422,
          code: "INVALID_JOB_COST_ITEM",
          error: `Row ${idx + 1}: Linked Job Cost Item does not belong to the selected Job.`,
          budgetOverrideUsed: false,
        };
      }

      requestedByCostItem.set(
        it.jobCostItemId,
        (requestedByCostItem.get(it.jobCostItemId) || new Decimal(0)).plus(lineAmount)
      );
    }

    // Compare grouped amounts per Job Cost Item against remaining PO budget
    for (const [costItemId, requestedAmt] of requestedByCostItem.entries()) {
      const info = budgetData.itemsById.get(costItemId)!;
      const remaining = roundFinancial(info.remainingBudget, 2);
      if (requestedAmt.gt(remaining.plus(0.01))) {
        const matchingItemReason = items
          .filter((it) => it.jobCostItemId === costItemId)
          .map((it) => (it.budgetOverrideReason || "").trim())
          .find(Boolean);

        if (!canOverrideBudget) {
          return {
            valid: false,
            status: 422,
            code: "BUDGET_EXCEEDED",
            error: `Budget limit exceeded for "${info.description}": Requested Rs. ${requestedAmt.toFixed(2)}, but remaining Job Cost Item budget is Rs. ${remaining.toFixed(2)} (Original: Rs. ${info.originalAmount.toFixed(2)}, Committed in active POs: Rs. ${info.committedPoAmount.toFixed(2)}).`,
            budgetOverrideUsed: false,
          };
        }

        if (!matchingItemReason && !trimmedPoReason) {
          return {
            valid: false,
            status: 422,
            code: "OVERRIDE_REASON_REQUIRED",
            error: `Cost item "${info.description}" exceeds remaining budget by Rs. ${requestedAmt.minus(remaining).toFixed(2)}. Please provide a mandatory budget override reason.`,
            budgetOverrideUsed: false,
          };
        }

        budgetOverrideUsed = true;
      }
    }
  } else {
    // Case B: Manually created Job without breakdown items — check against Job Approved Value
    const db = client || getPrisma();
    const activeJobPos = await (db.purchaseOrder as any).findMany({
      where: {
        jobId,
        deletedAt: null,
        status: { in: PO_ACTIVE_COMMITMENT_STATUSES },
        ...(excludePoId ? { id: { not: excludePoId } } : {}),
      },
      select: { grandTotal: true },
    });
    const committedTotal = activeJobPos.reduce(
      (sum: Decimal, row: any) => sum.plus(toDecimal(row.grandTotal)),
      new Decimal(0)
    );
    const remainingJobCeiling = roundFinancial(
      toDecimal(budgetData.job.approvedJobValue).minus(committedTotal),
      2
    );

    if (toDecimal(poGrandTotal).gt(remainingJobCeiling.plus(0.01))) {
      if (!canOverrideBudget) {
        return {
          valid: false,
          status: 422,
          code: "JOB_CEILING_EXCEEDED",
          error: `PO Grand Total (Rs. ${toDecimal(poGrandTotal).toFixed(2)}) exceeds remaining Approved Job Value (Rs. ${remainingJobCeiling.toFixed(2)}).`,
          budgetOverrideUsed: false,
        };
      }
      if (!trimmedPoReason) {
        return {
          valid: false,
          status: 422,
          code: "OVERRIDE_REASON_REQUIRED",
          error: "A mandatory budget override reason is required when exceeding Job Value.",
          budgetOverrideUsed: false,
        };
      }
      budgetOverrideUsed = true;
    }
  }

  return {
    valid: true,
    budgetOverrideUsed,
  };
}

/**
 * Recalculates `invoicedQuantity` and `invoicedAmount` on every `PurchaseOrderItem`
 * of `purchaseOrderId` from all active (non-deleted, non-CANCELLED) `SupplierInvoiceItem` rows.
 */
export async function syncPurchaseOrderInvoicedTotalsTx(
  purchaseOrderId: string | null | undefined,
  tx: Prisma.TransactionClient | any
): Promise<void> {
  if (!purchaseOrderId) return;

  const poItems = await (tx.purchaseOrderItem as any).findMany({
    where: { purchaseOrderId },
    select: { id: true },
  });
  if (!poItems || poItems.length === 0) return;

  const linkedInvItems = await (tx.supplierInvoiceItem as any).findMany({
    where: {
      purchaseOrderItemId: { in: poItems.map((i: any) => i.id) },
      invoice: {
        deletedAt: null,
        status: { not: "CANCELLED" },
      },
    },
    select: {
      purchaseOrderItemId: true,
      quantity: true,
      amount: true,
    },
  });

  const qtyMap = new Map<string, Decimal>();
  const amtMap = new Map<string, Decimal>();

  for (const row of linkedInvItems) {
    if (!row.purchaseOrderItemId) continue;
    qtyMap.set(
      row.purchaseOrderItemId,
      (qtyMap.get(row.purchaseOrderItemId) || new Decimal(0)).plus(toDecimal(row.quantity || 0))
    );
    amtMap.set(
      row.purchaseOrderItemId,
      (amtMap.get(row.purchaseOrderItemId) || new Decimal(0)).plus(toDecimal(row.amount || 0))
    );
  }

  for (const poItem of poItems) {
    const qty = roundFinancial(qtyMap.get(poItem.id) || 0, 4);
    const amt = roundFinancial(amtMap.get(poItem.id) || 0, 2);
    await (tx.purchaseOrderItem as any).update({
      where: { id: poItem.id },
      data: {
        invoicedQuantity: qty.toFixed(4),
        invoicedAmount: amt.toFixed(2),
      },
    });
  }
}
