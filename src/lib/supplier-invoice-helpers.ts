import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  Decimal,
  toDecimal,
  roundFinancial,
  formatCurrency,
} from "@/lib/financial";
import { JobCostItemInvoiceInfo } from "@/types/admin";
import {
  getModuleVisibilityScope,
  getAuthorizedUserIdsForScope,
} from "@/lib/data-visibility";

export async function canAccessJobForSupplierInvoice(
  session: { userId?: string; roles?: string[]; email?: string } | null | undefined,
  jobSubmittedById: string | null | undefined
): Promise<boolean> {
  if (!session?.userId) return false;

  const isAdmin = session.roles?.some((r) => r.toLowerCase() === "admin");
  if (isAdmin && session.email === (process.env.ADMIN_EMAIL || "admin@reflecterp.com")) {
    return true;
  }

  const scope = await getModuleVisibilityScope(session, "jobs");
  if (scope === "all") return true;
  if (jobSubmittedById && jobSubmittedById === session.userId) return true;

  if (scope === "team") {
    if (jobSubmittedById == null) return true;
    const authorizedIds = await getAuthorizedUserIdsForScope(session.userId, "team");
    return Boolean(authorizedIds && authorizedIds.includes(jobSubmittedById));
  }

  return false;
}

export const SUPPLIER_INVOICE_ELIGIBLE_JOB_STATUSES = [
  "APPROVED",
  "Approved",
  "ACTIVE",
  "Active",
  "INVOICE_GENERATED",
  "INVOICED",
  "Invoiced",
];

export function isJobEligibleForSupplierInvoice(
  status?: string | null,
  deletedAt?: Date | string | null
): boolean {
  if (deletedAt) return false;
  if (!status) return false;
  const upper = status.trim().toUpperCase();
  return (
    upper === "APPROVED" ||
    upper === "ACTIVE" ||
    upper === "INVOICE_GENERATED" ||
    upper === "INVOICED"
  );
}

export interface JobCostCategoryInvoiceGroup {
  id: string;
  name: string;
  sortOrder: number;
  subtotal: number;
  items: JobCostItemInvoiceInfo[];
}

export interface JobCostItemsInvoiceResult {
  job: {
    id: string;
    jobCode: string;
    name: string;
    date: string;
    commencingDate: string | null;
    clientName: string | null;
    handledBy: string | null;
    status: string;
    approvedJobValue: number;
  };
  categories: JobCostCategoryInvoiceGroup[];
  itemsById: Map<string, JobCostItemInvoiceInfo>;
  hasCostItems: boolean;
  totalCostItemsCount: number;
  totals: {
    originalBudgetTotal: number;
    totalCostItemsInvoiced: number;
    totalCostItemsRemaining: number;
    jobActiveSupplierCost: number;
    jobRemainingBudget: number;
  };
}

/**
 * Loads a Job's original saved Excel cost categories & individual cost items along with
 * active non-cancelled Supplier Invoice totals per `JobCostItem` using arbitrary-precision
 * Decimal arithmetic. Never mixes PO commitments into invoice balances.
 */
export async function getJobCostItemsWithInvoiceStatus(
  jobId: string,
  excludeInvoiceId?: string | null,
  client?: Prisma.TransactionClient | any
): Promise<JobCostItemsInvoiceResult | null> {
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
      supplierInvoices: {
        where: {
          deletedAt: null,
          status: { not: "CANCELLED" },
          ...(excludeInvoiceId ? { id: { not: excludeInvoiceId } } : {}),
        },
        select: {
          id: true,
          invoiceNumber: true,
          totalAmount: true,
        },
      },
    },
  });

  if (!job || job.deletedAt) return null;

  // Query active non-cancelled SupplierInvoiceItem records linked to this Job's cost items
  const existingInvItems = await (db.supplierInvoiceItem as any).findMany({
    where: {
      jobCostItemId: { not: null },
      invoice: {
        jobId,
        deletedAt: null,
        status: { not: "CANCELLED" },
        ...(excludeInvoiceId ? { id: { not: excludeInvoiceId } } : {}),
      },
    },
    select: {
      jobCostItemId: true,
      amount: true,
      quantity: true,
      invoice: {
        select: {
          invoiceNumber: true,
        },
      },
    },
  });

  const invoicedAmtMap = new Map<string, Decimal>();
  const invoicedQtyMap = new Map<string, Decimal>();
  const invoiceNumbersMap = new Map<string, Set<string>>();

  for (const row of existingInvItems) {
    const costId = row.jobCostItemId;
    if (!costId) continue;

    invoicedAmtMap.set(
      costId,
      (invoicedAmtMap.get(costId) || new Decimal(0)).plus(toDecimal(row.amount))
    );
    if (row.quantity != null) {
      invoicedQtyMap.set(
        costId,
        (invoicedQtyMap.get(costId) || new Decimal(0)).plus(toDecimal(row.quantity))
      );
    }
    if (row.invoice?.invoiceNumber) {
      if (!invoiceNumbersMap.has(costId)) {
        invoiceNumbersMap.set(costId, new Set<string>());
      }
      invoiceNumbersMap.get(costId)!.add(row.invoice.invoiceNumber);
    }
  }

  const itemsById = new Map<string, JobCostItemInvoiceInfo>();
  const categoryNameMap = new Map<string, string>();
  (job.costCategories || []).forEach((c: any) => categoryNameMap.set(c.id, c.name));

  let originalBudgetTotal = new Decimal(0);
  let totalCostItemsInvoiced = new Decimal(0);

  const buildItemInfo = (rawItem: any, catName: string): JobCostItemInvoiceInfo => {
    const origAmtDec = roundFinancial(rawItem.totalCost, 2);
    const invoicedAmtDec = roundFinancial(invoicedAmtMap.get(rawItem.id) || 0, 2);
    const invoicedQtyDec = roundFinancial(invoicedQtyMap.get(rawItem.id) || 0, 4);
    const remainingDec = roundFinancial(origAmtDec.minus(invoicedAmtDec), 2);
    const invNums = Array.from(invoiceNumbersMap.get(rawItem.id) || []);

    originalBudgetTotal = originalBudgetTotal.plus(origAmtDec);
    totalCostItemsInvoiced = totalCostItemsInvoiced.plus(invoicedAmtDec);

    let invoicedStatus: JobCostItemInvoiceInfo["invoicedStatus"] = "UNINVOICED";
    if (invoicedAmtDec.gt(0)) {
      if (invoicedAmtDec.gt(origAmtDec.plus(0.01))) {
        invoicedStatus = "OVER_INVOICED";
      } else if (remainingDec.lte(0.01)) {
        invoicedStatus = "FULLY_INVOICED";
      } else {
        invoicedStatus = "PARTIAL";
      }
    }

    const info: JobCostItemInvoiceInfo = {
      id: rawItem.id,
      jobId: job.id,
      categoryId: rawItem.categoryId || null,
      categoryName: catName,
      itemNumber: rawItem.itemNumber ?? null,
      description: rawItem.description,
      rcNrc: rawItem.rcNrc ?? null,
      quantity: roundFinancial(rawItem.quantity || 1, 4).toNumber(),
      unit: rawItem.unit || "Nos",
      rate: roundFinancial(rawItem.rate || 0, 2).toNumber(),
      originalAmount: origAmtDec.toNumber(),
      invoicedAmount: invoicedAmtDec.toNumber(),
      invoicedQuantity: invoicedQtyDec.toNumber(),
      remainingAmount: remainingDec.toNumber(),
      activeInvoiceCount: invNums.length,
      invoiceNumbers: invNums,
      invoicedStatus,
    };

    itemsById.set(info.id, info);
    return info;
  };

  const categories: JobCostCategoryInvoiceGroup[] = (job.costCategories || []).map((cat: any) => ({
    id: cat.id,
    name: cat.name,
    sortOrder: cat.sortOrder,
    subtotal: roundFinancial(cat.subtotal, 2).toNumber(),
    items: (cat.items || []).map((it: any) => buildItemInfo(it, cat.name)),
  }));

  // Include uncategorized cost items if present
  const uncategorized = (job.costItems || []).filter(
    (it: any) => !it.categoryId || !categoryNameMap.has(it.categoryId)
  );
  if (uncategorized.length > 0) {
    let uncatSubtotal = new Decimal(0);
    uncategorized.forEach((it: any) => {
      uncatSubtotal = uncatSubtotal.plus(toDecimal(it.totalCost));
    });
    categories.push({
      id: "uncategorized",
      name: "General Cost Items",
      sortOrder: 9999,
      subtotal: roundFinancial(uncatSubtotal, 2).toNumber(),
      items: uncategorized.map((it: any) => buildItemInfo(it, "General Cost Items")),
    });
  }

  let jobActiveSupplierCostDec = new Decimal(0);
  (job.supplierInvoices || []).forEach((inv: any) => {
    jobActiveSupplierCostDec = jobActiveSupplierCostDec.plus(toDecimal(inv.totalAmount));
  });

  const approvedJobValueDec = roundFinancial(job.grandTotal || job.totalCost || 0, 2);
  const totalCostItemsRemainingDec = roundFinancial(
    originalBudgetTotal.minus(totalCostItemsInvoiced),
    2
  );
  const jobRemainingBudgetDec = roundFinancial(
    approvedJobValueDec.minus(jobActiveSupplierCostDec),
    2
  );

  return {
    job: {
      id: job.id,
      jobCode: job.jobCode,
      name: job.name,
      date: job.date,
      commencingDate: job.commencingDate || job.date || null,
      clientName: job.clientName || null,
      handledBy: job.handledBy || null,
      status: job.status,
      approvedJobValue: approvedJobValueDec.toNumber(),
    },
    categories,
    itemsById,
    hasCostItems: itemsById.size > 0,
    totalCostItemsCount: itemsById.size,
    totals: {
      originalBudgetTotal: roundFinancial(originalBudgetTotal, 2).toNumber(),
      totalCostItemsInvoiced: roundFinancial(totalCostItemsInvoiced, 2).toNumber(),
      totalCostItemsRemaining: totalCostItemsRemainingDec.toNumber(),
      jobActiveSupplierCost: roundFinancial(jobActiveSupplierCostDec, 2).toNumber(),
      jobRemainingBudget: jobRemainingBudgetDec.toNumber(),
    },
  };
}

export interface RawSupplierInvoiceItemInput {
  id?: string;
  rowNumber?: number;
  purchaseOrderItemId?: string | null;
  jobCostCategoryId?: string | null;
  jobCostCategoryName?: string | null;
  jobCostItemId?: string | null;
  description?: string;
  originalJobAmount?: number | string | null;
  quantity?: number | string | null;
  unit?: string | null;
  unitRate?: number | string | null;
  amount?: number | string | null;
  isAdditionalItem?: boolean;
  budgetOverrideReason?: string | null;
  notes?: string | null;
}

export interface NormalizedSupplierInvoiceItem {
  id?: string;
  rowNumber: number;
  purchaseOrderItemId: string | null;
  jobCostCategoryId: string | null;
  jobCostCategoryName: string | null;
  jobCostItemId: string | null;
  description: string;
  originalJobAmount: string | null;
  quantity: string | null;
  unit: string | null;
  unitRate: string | null;
  amount: string;
  amountDecimal: Decimal;
  isAdditionalItem: boolean;
  budgetOverrideReason: string | null;
  notes: string;
}

export interface ValidateSupplierInvoiceItemsResult {
  valid: boolean;
  status?: number;
  code?: string;
  error?: string;
  items: NormalizedSupplierInvoiceItem[];
  totalAmount: Decimal;
  budgetOverrideUsed: boolean;
  budgetData?: JobCostItemsInvoiceResult;
}

/**
 * Validates and normalizes Supplier Invoice rows on the backend with strict security & Decimal math:
 * 1. Verifies every non-null `jobCostItemId` belongs to the selected `jobId`.
 * 2. Prevents duplicate `jobCostItemId` within the same Supplier Invoice.
 * 3. Enforces `manualEntry` permission for unlinked/manual descriptions.
 * 4. Computes `amount = round(quantity * unitRate, 2)` when both quantity and unitRate are provided.
 * 5. Checks remaining uninvoiced balance per Job Cost Item; requires `overrideJobBudget` + reason on overruns.
 */
export async function validateAndNormalizeSupplierInvoiceItems(params: {
  jobId: string;
  items: RawSupplierInvoiceItemInput[];
  excludeInvoiceId?: string | null;
  existingLegacyItemIds?: Set<string>;
  validPoItemIds?: Set<string>;
  canManualEntry: boolean;
  canOverrideBudget: boolean;
  invoiceOverrideReason?: string | null;
  client?: Prisma.TransactionClient | any;
}): Promise<ValidateSupplierInvoiceItemsResult> {
  const {
    jobId,
    items,
    excludeInvoiceId,
    existingLegacyItemIds,
    validPoItemIds,
    canManualEntry,
    canOverrideBudget,
    invoiceOverrideReason,
    client,
  } = params;

  const emptyResult = (status: number, error: string, code?: string): ValidateSupplierInvoiceItemsResult => ({
    valid: false,
    status,
    code,
    error,
    items: [],
    totalAmount: new Decimal(0),
    budgetOverrideUsed: false,
  });

  if (!items || items.length === 0) {
    return emptyResult(400, "At least one supplier invoice row item is required.", "EMPTY_ITEMS");
  }

  const budgetData = await getJobCostItemsWithInvoiceStatus(jobId, excludeInvoiceId, client);
  if (!budgetData) {
    return emptyResult(404, "Selected Job was not found in the database.", "JOB_NOT_FOUND");
  }

  const normalized: NormalizedSupplierInvoiceItem[] = [];
  const seenCostItemIds = new Set<string>();
  const trimmedInvoiceReason = (invoiceOverrideReason || "").trim();
  let totalAmount = new Decimal(0);
  let budgetOverrideUsed = false;

  for (let i = 0; i < items.length; i++) {
    const raw = items[i];
    const rowNum = i + 1;
    const rawCostItemId =
      typeof raw.jobCostItemId === "string" && raw.jobCostItemId.trim()
        ? raw.jobCostItemId.trim()
        : null;
    const rawPoItemId =
      typeof raw.purchaseOrderItemId === "string" &&
      raw.purchaseOrderItemId.trim() &&
      (!validPoItemIds || validPoItemIds.has(raw.purchaseOrderItemId.trim()))
        ? raw.purchaseOrderItemId.trim()
        : null;

    let costInfo: JobCostItemInvoiceInfo | undefined = undefined;
    if (rawCostItemId) {
      if (seenCostItemIds.has(rawCostItemId)) {
        return emptyResult(
          422,
          `Row ${rowNum}: Duplicate Job cost item detected. The same Job cost line cannot be added twice in the same Supplier Invoice.`,
          "DUPLICATE_JOB_COST_ITEM"
        );
      }
      seenCostItemIds.add(rawCostItemId);

      costInfo = budgetData.itemsById.get(rawCostItemId);
      if (!costInfo) {
        return emptyResult(
          422,
          `Row ${rowNum}: Selected Job cost item does not belong to Job "${budgetData.job.jobCode}".`,
          "INVALID_JOB_COST_ITEM"
        );
      }
    } else {
      // Unlinked / manual entry row
      const isPreservedLegacyRow = Boolean(
        raw.id && existingLegacyItemIds && existingLegacyItemIds.has(raw.id)
      );
      const isPoLinkedRow = Boolean(rawPoItemId);

      if (!isPreservedLegacyRow && !isPoLinkedRow && !canManualEntry) {
        return emptyResult(
          403,
          `Row ${rowNum}: You do not have permission to create manual/custom invoice entries outside saved Job cost lines.`,
          "MANUAL_ENTRY_FORBIDDEN"
        );
      }
    }

    const description =
      typeof raw.description === "string" && raw.description.trim()
        ? raw.description.trim()
        : costInfo?.description || "";

    if (!description) {
      return emptyResult(400, `Row ${rowNum}: Description is required.`, "DESCRIPTION_REQUIRED");
    }

    // Parse & validate quantities, rates, and amounts strictly via Decimal
    const hasQtyInput =
      raw.quantity !== undefined &&
      raw.quantity !== null &&
      String(raw.quantity).trim() !== "";
    const hasRateInput =
      raw.unitRate !== undefined &&
      raw.unitRate !== null &&
      String(raw.unitRate).trim() !== "";

    let qtyDec: Decimal | null = null;
    let rateDec: Decimal | null = null;
    let amountDec: Decimal;

    if (hasQtyInput && hasRateInput) {
      qtyDec = roundFinancial(toDecimal(raw.quantity), 4);
      rateDec = roundFinancial(toDecimal(raw.unitRate), 2);
      if (qtyDec.lte(0)) {
        return emptyResult(
          400,
          `Row ${rowNum} ("${description}"): Invoice quantity must be greater than 0.`,
          "INVALID_QUANTITY"
        );
      }
      if (rateDec.lte(0)) {
        return emptyResult(
          400,
          `Row ${rowNum} ("${description}"): Invoice rate must be greater than 0.00.`,
          "INVALID_RATE"
        );
      }
      amountDec = roundFinancial(qtyDec.mul(rateDec), 2);
    } else {
      amountDec = roundFinancial(toDecimal(raw.amount), 2);
      if (amountDec.lte(0)) {
        return emptyResult(
          400,
          `Row ${rowNum} ("${description}"): Invoice amount must be greater than 0.00.`,
          "INVALID_AMOUNT"
        );
      }
      if (hasQtyInput) {
        const parsedQty = roundFinancial(toDecimal(raw.quantity), 4);
        if (parsedQty.gt(0)) {
          qtyDec = parsedQty;
          rateDec = hasRateInput
            ? roundFinancial(toDecimal(raw.unitRate), 2)
            : roundFinancial(amountDec.div(parsedQty), 2);
        }
      } else if (hasRateInput) {
        const parsedRate = roundFinancial(toDecimal(raw.unitRate), 2);
        if (parsedRate.gt(0)) {
          rateDec = parsedRate;
        }
      }
    }

    if (amountDec.lte(0)) {
      return emptyResult(
        400,
        `Row ${rowNum} ("${description}"): Calculated invoice amount must be greater than 0.00.`,
        "INVALID_AMOUNT"
      );
    }

    // Budget remaining check when linked to a JobCostItem
    const rowOverrideReason = (raw.budgetOverrideReason || "").trim();
    let thisRowOverBudget = false;
    if (costInfo) {
      const remainingAvailable = Decimal.max(0, roundFinancial(costInfo.remainingAmount, 2));
      if (amountDec.gt(remainingAvailable.plus(0.01))) {
        if (!canOverrideBudget) {
          return emptyResult(
            422,
            `Row ${rowNum} ("${costInfo.description}"): Invoice amount (Rs. ${formatCurrency(amountDec)}) exceeds remaining uninvoiced Job cost line balance of Rs. ${formatCurrency(remainingAvailable)} (Original: Rs. ${formatCurrency(costInfo.originalAmount)}, Previously Invoiced: Rs. ${formatCurrency(costInfo.invoicedAmount)}). Requires "Override Job Cost Line Budget" permission.`,
            "BUDGET_EXCEEDED"
          );
        }

        if (!rowOverrideReason && !trimmedInvoiceReason) {
          return emptyResult(
            422,
            `Row ${rowNum} ("${costInfo.description}"): Invoice amount (Rs. ${formatCurrency(amountDec)}) exceeds remaining uninvoiced balance (Rs. ${formatCurrency(remainingAvailable)}). Please enter a mandatory budget override reason.`,
            "OVERRIDE_REASON_REQUIRED"
          );
        }

        thisRowOverBudget = true;
        budgetOverrideUsed = true;
      }
    }

    totalAmount = totalAmount.plus(amountDec);

    const unitStr =
      typeof raw.unit === "string" && raw.unit.trim()
        ? raw.unit.trim()
        : costInfo?.unit || (qtyDec ? "Nos" : null);

    normalized.push({
      id: raw.id,
      rowNumber: rowNum,
      purchaseOrderItemId: rawPoItemId,
      jobCostCategoryId: costInfo ? costInfo.categoryId || null : null,
      jobCostCategoryName: costInfo
        ? costInfo.categoryName
        : typeof raw.jobCostCategoryName === "string" && raw.jobCostCategoryName.trim()
        ? raw.jobCostCategoryName.trim()
        : null,
      jobCostItemId: costInfo ? costInfo.id : null,
      description,
      originalJobAmount: costInfo ? roundFinancial(costInfo.originalAmount, 2).toFixed(2) : null,
      quantity: qtyDec ? qtyDec.toFixed(4) : null,
      unit: unitStr,
      unitRate: rateDec ? rateDec.toFixed(2) : null,
      amount: amountDec.toFixed(2),
      amountDecimal: amountDec,
      isAdditionalItem: Boolean(!costInfo && budgetData.hasCostItems),
      budgetOverrideReason: rowOverrideReason || (thisRowOverBudget ? trimmedInvoiceReason : null),
      notes: typeof raw.notes === "string" ? raw.notes : "",
    });
  }

  return {
    valid: true,
    items: normalized,
    totalAmount: roundFinancial(totalAmount, 2),
    budgetOverrideUsed,
    budgetData,
  };
}
