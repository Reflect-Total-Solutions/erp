import { Decimal, roundFinancial, toDecimal } from "@/lib/financial";
import type {
  JobCostComparisonRow,
  JobUnlinkedInvoiceItemRow,
} from "@/types/admin";

export const ADDITIONAL_EXPENSE_CATEGORIES = [
  "Transport",
  "Delivery",
  "Labour",
  "Fuel",
  "Accommodation",
  "Equipment",
  "Permits",
  "Miscellaneous",
  "Other",
] as const;

export interface JobFinancialOverviewResult {
  approvedJobValue: number;
  originalEstimatedJobCost: number;
  totalSupplierCost: number;
  additionalExpensesTotal: number;
  otherCosts: number;
  totalActualCost: number;
  costDifference: number;
  costSaving: number;
  costOverrun: number;
  remainingBudget: number;
  grossProfit: number;
  profitMargin: number | null;
  costUtilization: number;
  isBudgetExceeded: boolean;
  supplierInvoicesCount: number;
  additionalExpensesCount: number;
  supplierPaidAmount: number;
  supplierOutstandingBalance: number;
  financialStatus: "High Margin" | "Healthy" | "Low Margin" | "Over Budget" | "N/A";
}

export interface JobCostComparisonResult {
  rows: JobCostComparisonRow[];
  unlinkedItems: JobUnlinkedInvoiceItemRow[];
  totals: {
    originalJobCost: number;
    actualInvoiceCost: number;
    costDifference: number;
    costSaving: number;
    costOverrun: number;
    invoicedAmount: number;
    paidAllocatedAmount: number;
    outstandingInvoiceAmount: number;
    unlinkedActualCost: number;
  };
}

export interface JobFinancialAnalysisResult {
  overview: JobFinancialOverviewResult;
  comparison: JobCostComparisonResult;
}

function allocateProportionalOutstanding(
  items: Array<{ id: string; amount: Decimal }>,
  invoiceTotal: Decimal,
  invoiceOutstanding: Decimal
): Map<string, { paid: Decimal; outstanding: Decimal }> {
  const result = new Map<string, { paid: Decimal; outstanding: Decimal }>();
  if (items.length === 0) return result;

  if (invoiceOutstanding.lte(0) || invoiceTotal.lte(0)) {
    for (const item of items) {
      result.set(item.id, {
        paid: roundFinancial(item.amount, 2),
        outstanding: new Decimal(0),
      });
    }
    return result;
  }

  // Sum of item amounts may equal invoiceTotal (standard case) or differ slightly if legacy
  const ratioDenominator = items.reduce(
    (acc, i) => acc.plus(i.amount),
    new Decimal(0)
  );
  const denom = ratioDenominator.gt(0) ? ratioDenominator : invoiceTotal;
  const clampedInvoiceOutstanding = Decimal.min(invoiceOutstanding, denom);

  let allocatedSum = new Decimal(0);
  const rawAllocations = items.map((item, idx) => {
    let itemOutstanding: Decimal;
    if (idx === items.length - 1) {
      // Last item absorbs sub-cent rounding residual while remaining bounded in [0, item.amount]
      const residual = roundFinancial(
        clampedInvoiceOutstanding.minus(allocatedSum),
        2
      );
      itemOutstanding = Decimal.max(
        new Decimal(0),
        Decimal.min(roundFinancial(item.amount, 2), residual)
      );
    } else {
      itemOutstanding = roundFinancial(
        item.amount.mul(clampedInvoiceOutstanding).div(denom),
        2
      );
      itemOutstanding = Decimal.max(
        new Decimal(0),
        Decimal.min(roundFinancial(item.amount, 2), itemOutstanding)
      );
      allocatedSum = allocatedSum.plus(itemOutstanding);
    }

    const itemPaid = Decimal.max(
      new Decimal(0),
      roundFinancial(item.amount, 2).minus(itemOutstanding)
    );
    return {
      id: item.id,
      paid: roundFinancial(itemPaid, 2),
      outstanding: roundFinancial(itemOutstanding, 2),
    };
  });

  for (const row of rawAllocations) {
    result.set(row.id, { paid: row.paid, outstanding: row.outstanding });
  }
  return result;
}

/**
 * Authoritative deterministic financial analyzer for a Job.
 *
 * STRICT ACCOUNTING INVARIANTS (Sections 1, 4, 5, 6, 9):
 * 1. Original Job Cost (`JobCostItem.totalCost` / `Job.totalCost`) is never overwritten.
 * 2. Actual Supplier Invoice Cost = SUM(SupplierInvoice.totalAmount) for non-deleted, non-CANCELLED invoices.
 * 3. Additional Job Expenses = SUM(JobAdditionalExpense.amount) where status === "ACTIVE" AND !linkedSupplierInvoiceId.
 * 4. Total Actual Expenses = Actual Supplier Invoice Cost + Additional Job Expenses.
 * 5. Cost Difference = Original Estimated Job Cost - Actual Supplier Invoice Cost
 *    Cost Saving  = MAX(Cost Difference, 0)
 *    Cost Overrun = MAX(-Cost Difference, 0)
 * 6. Gross Profit = Approved Job Revenue - Total Actual Expenses (Cost Saving is NEVER added to Gross Profit).
 * 7. Profit Margin = (Gross Profit / Approved Job Revenue) * 100; null if Approved Job Revenue <= 0 ("N/A").
 * 8. Purchase Orders are NEVER counted as Actual Expenses.
 * 9. Supplier Payments settle Accounts Payable only; they NEVER reduce Actual Invoice Cost or increase Gross Profit.
 */
export function computeJobFinancialAnalysis({
  approvedJobRevenue,
  fallbackTotalCost = 0,
  costItems = [],
  supplierInvoices = [],
  additionalExpenses = [],
}: {
  approvedJobRevenue: unknown;
  fallbackTotalCost?: unknown;
  costItems?: any[];
  supplierInvoices?: any[];
  additionalExpenses?: any[];
}): JobFinancialAnalysisResult {
  const revDec = roundFinancial(approvedJobRevenue, 2);

  // 1. Original Estimated Job Cost (sum of Excel/saved cost items, or job.totalCost fallback)
  let origCostDec = new Decimal(0);
  if (Array.isArray(costItems) && costItems.length > 0) {
    for (const item of costItems) {
      origCostDec = origCostDec.plus(toDecimal(item?.totalCost));
    }
    origCostDec = roundFinancial(origCostDec, 2);
  } else {
    origCostDec = roundFinancial(fallbackTotalCost, 2);
  }

  // 2. Active non-cancelled, non-deleted Supplier Invoices & Payments
  const activeInvoices = (supplierInvoices || []).filter(
    (inv) => inv && !inv.deletedAt && inv.status !== "CANCELLED"
  );

  let actualInvoiceCostDec = new Decimal(0);
  let supplierPaidDec = new Decimal(0);
  let supplierOutstandingDec = new Decimal(0);

  // Track invoice item allocations by JobCostItem.id and unlinked items
  const byJobCostItemId = new Map<
    string,
    {
      actualCost: Decimal;
      paidAllocated: Decimal;
      outstandingAllocated: Decimal;
      linkedInvoices: JobCostComparisonRow["linkedInvoices"];
      invoiceIds: Set<string>;
    }
  >();

  const unlinkedItems: JobUnlinkedInvoiceItemRow[] = [];

  for (const inv of activeInvoices) {
    const invTotal = roundFinancial(inv.totalAmount, 2);
    actualInvoiceCostDec = actualInvoiceCostDec.plus(invTotal);

    // Derive exact paid amount from SUCCESS payments if included, otherwise fallback to cached inv.paidAmount
    let invPaid = new Decimal(0);
    if (Array.isArray(inv.payments)) {
      for (const p of inv.payments) {
        if (p && p.status === "SUCCESS") {
          invPaid = invPaid.plus(toDecimal(p.amount));
        }
      }
      invPaid = roundFinancial(invPaid, 2);
    } else {
      invPaid = roundFinancial(inv.paidAmount, 2);
    }

    const invOutstanding = Decimal.max(
      new Decimal(0),
      roundFinancial(invTotal.minus(invPaid), 2)
    );

    supplierPaidDec = supplierPaidDec.plus(invPaid);
    supplierOutstandingDec = supplierOutstandingDec.plus(invOutstanding);

    const invItems = Array.isArray(inv.items) ? inv.items : [];
    const normalizedInvItems: Array<{ id: string; raw: any; amount: Decimal }> = invItems.map((it: any) => ({
      id: String(it.id),
      raw: it,
      amount: roundFinancial(it.amount, 2),
    }));

    const allocMap = allocateProportionalOutstanding(
      normalizedInvItems.map((x) => ({ id: x.id, amount: x.amount })),
      invTotal,
      invOutstanding
    );

    const supplierName = inv.supplier?.name || inv.supplierName || "Supplier";
    const invoiceDateIso = inv.invoiceDate
      ? new Date(inv.invoiceDate).toISOString()
      : "";

    for (const itemEntry of normalizedInvItems) {
      const it = itemEntry.raw;
      const alloc = allocMap.get(itemEntry.id) || {
        paid: new Decimal(0),
        outstanding: itemEntry.amount,
      };

      if (it.jobCostItemId) {
        const key = String(it.jobCostItemId);
        let bucket = byJobCostItemId.get(key);
        if (!bucket) {
          bucket = {
            actualCost: new Decimal(0),
            paidAllocated: new Decimal(0),
            outstandingAllocated: new Decimal(0),
            linkedInvoices: [],
            invoiceIds: new Set<string>(),
          };
          byJobCostItemId.set(key, bucket);
        }

        bucket.actualCost = bucket.actualCost.plus(itemEntry.amount);
        bucket.paidAllocated = bucket.paidAllocated.plus(alloc.paid);
        bucket.outstandingAllocated = bucket.outstandingAllocated.plus(alloc.outstanding);
        bucket.invoiceIds.add(String(inv.id));
        bucket.linkedInvoices.push({
          invoiceId: String(inv.id),
          invoiceNumber: String(inv.invoiceNumber || ""),
          supplierId: String(inv.supplierId || ""),
          supplierName,
          invoiceDate: invoiceDateIso,
          itemAmount: itemEntry.amount.toNumber(),
          paidAllocatedAmount: alloc.paid.toNumber(),
          outstandingAllocatedAmount: alloc.outstanding.toNumber(),
        });
      } else {
        unlinkedItems.push({
          invoiceItemId: itemEntry.id,
          invoiceId: String(inv.id),
          invoiceNumber: String(inv.invoiceNumber || ""),
          supplierId: String(inv.supplierId || ""),
          supplierName,
          invoiceDate: invoiceDateIso,
          description: String(it.description || "Manual / Unlinked Entry"),
          amount: itemEntry.amount.toNumber(),
          paidAllocatedAmount: alloc.paid.toNumber(),
          outstandingAllocatedAmount: alloc.outstanding.toNumber(),
          isAdditionalItem: Boolean(it.isAdditionalItem),
        });
      }
    }
  }

  actualInvoiceCostDec = roundFinancial(actualInvoiceCostDec, 2);
  supplierPaidDec = roundFinancial(supplierPaidDec, 2);
  supplierOutstandingDec = roundFinancial(supplierOutstandingDec, 2);

  // 3. Active non-cancelled, non-invoice-linked Additional Job Expenses
  const activeAdditionalExpenses = (additionalExpenses || []).filter(
    (exp) =>
      exp &&
      exp.status === "ACTIVE" &&
      !exp.linkedSupplierInvoiceId
  );

  let addlExpDec = new Decimal(0);
  for (const exp of activeAdditionalExpenses) {
    addlExpDec = addlExpDec.plus(toDecimal(exp.amount));
  }
  addlExpDec = roundFinancial(addlExpDec, 2);

  // 4. Core P&L Aggregates
  const totalActualCostDec = roundFinancial(
    actualInvoiceCostDec.plus(addlExpDec),
    2
  );
  const costDifferenceDec = roundFinancial(
    origCostDec.minus(actualInvoiceCostDec),
    2
  );
  const costSavingDec = costDifferenceDec.gt(0)
    ? costDifferenceDec
    : new Decimal(0);
  const costOverrunDec = costDifferenceDec.lt(0)
    ? roundFinancial(actualInvoiceCostDec.minus(origCostDec), 2)
    : new Decimal(0);

  const remainingBudgetDec = roundFinancial(
    revDec.minus(totalActualCostDec),
    2
  );
  // Gross Profit = Approved Job Revenue - Total Actual Expenses (Cost Saving NOT added)
  const grossProfitDec = roundFinancial(
    revDec.minus(totalActualCostDec),
    2
  );

  const profitMargin: number | null = revDec.gt(0)
    ? Number(
        roundFinancial(grossProfitDec.div(revDec).mul(100), 2).toFixed(2)
      )
    : null;

  const costUtilization = revDec.gt(0)
    ? Number(
        roundFinancial(totalActualCostDec.div(revDec).mul(100), 2).toFixed(2)
      )
    : 0;

  let financialStatus: JobFinancialOverviewResult["financialStatus"] = "N/A";
  if (revDec.gt(0) && profitMargin !== null) {
    if (grossProfitDec.lt(0)) {
      financialStatus = "Over Budget";
    } else if (profitMargin >= 40) {
      financialStatus = "High Margin";
    } else if (profitMargin >= 20) {
      financialStatus = "Healthy";
    } else {
      financialStatus = "Low Margin";
    }
  }

  // 5. Build JobCostItem comparison rows
  let rowTotalOrig = new Decimal(0);
  let rowTotalActual = new Decimal(0);
  let rowTotalPaid = new Decimal(0);
  let rowTotalOutstanding = new Decimal(0);

  const rows: JobCostComparisonRow[] = (costItems || []).map((item: any) => {
    const orig = roundFinancial(item?.totalCost, 2);
    const agg = byJobCostItemId.get(String(item.id));
    const actual = agg ? roundFinancial(agg.actualCost, 2) : new Decimal(0);
    const diff = roundFinancial(orig.minus(actual), 2);
    const saving = diff.gt(0) ? diff : new Decimal(0);
    const overrun = diff.lt(0) ? roundFinancial(actual.minus(orig), 2) : new Decimal(0);
    const paidAlloc = agg ? roundFinancial(agg.paidAllocated, 2) : new Decimal(0);
    const outAlloc = agg ? roundFinancial(agg.outstandingAllocated, 2) : new Decimal(0);

    let varianceStatus: JobCostComparisonRow["varianceStatus"] = "UNINVOICED";
    if (agg && agg.invoiceIds.size > 0) {
      if (diff.gt(0)) varianceStatus = "SAVING";
      else if (diff.lt(0)) varianceStatus = "OVERRUN";
      else varianceStatus = "ON_BUDGET";
    }

    rowTotalOrig = rowTotalOrig.plus(orig);
    rowTotalActual = rowTotalActual.plus(actual);
    rowTotalPaid = rowTotalPaid.plus(paidAlloc);
    rowTotalOutstanding = rowTotalOutstanding.plus(outAlloc);

    return {
      jobCostItemId: String(item.id),
      categoryId: item.categoryId ?? null,
      categoryName: item.category?.name || item.categoryName || "General",
      itemNumber: item.itemNumber ?? null,
      description: String(item.description || ""),
      rcNrc: item.rcNrc ?? null,
      originalQuantity: toDecimal(item.quantity).toNumber(),
      originalRate: roundFinancial(item.rate, 2).toNumber(),
      originalJobCost: orig.toNumber(),
      actualInvoiceCost: actual.toNumber(),
      costDifference: diff.toNumber(),
      costSaving: saving.toNumber(),
      costOverrun: overrun.toNumber(),
      varianceStatus,
      invoicedAmount: actual.toNumber(),
      paidAllocatedAmount: paidAlloc.toNumber(),
      outstandingInvoiceAmount: outAlloc.toNumber(),
      invoiceCount: agg ? agg.invoiceIds.size : 0,
      linkedInvoices: agg ? agg.linkedInvoices : [],
    };
  });

  // Account for unlinked invoice items in reconciliation totals
  let unlinkedActualDec = new Decimal(0);
  let unlinkedPaidDec = new Decimal(0);
  let unlinkedOutstandingDec = new Decimal(0);
  for (const ui of unlinkedItems) {
    unlinkedActualDec = unlinkedActualDec.plus(toDecimal(ui.amount));
    unlinkedPaidDec = unlinkedPaidDec.plus(toDecimal(ui.paidAllocatedAmount));
    unlinkedOutstandingDec = unlinkedOutstandingDec.plus(
      toDecimal(ui.outstandingAllocatedAmount)
    );
  }

  // Total compared cost across ALL cost items + unlinked invoice items equals total active supplier invoice cost
  const totalComparedActual = roundFinancial(
    rowTotalActual.plus(unlinkedActualDec),
    2
  );
  // If an invoice had totalAmount differing from sum(items), fall back to actualInvoiceCostDec cleanly
  const finalTotalsActual =
    activeInvoices.length > 0 ? actualInvoiceCostDec : totalComparedActual;
  const finalTotalsOrig =
    rows.length > 0 ? roundFinancial(rowTotalOrig, 2) : origCostDec;
  const finalTotalsDiff = roundFinancial(
    finalTotalsOrig.minus(finalTotalsActual),
    2
  );

  return {
    overview: {
      approvedJobValue: revDec.toNumber(),
      originalEstimatedJobCost: origCostDec.toNumber(),
      totalSupplierCost: actualInvoiceCostDec.toNumber(),
      additionalExpensesTotal: addlExpDec.toNumber(),
      otherCosts: addlExpDec.toNumber(),
      totalActualCost: totalActualCostDec.toNumber(),
      costDifference: costDifferenceDec.toNumber(),
      costSaving: costSavingDec.toNumber(),
      costOverrun: costOverrunDec.toNumber(),
      remainingBudget: remainingBudgetDec.toNumber(),
      grossProfit: grossProfitDec.toNumber(),
      profitMargin,
      costUtilization,
      isBudgetExceeded: totalActualCostDec.gt(revDec) && revDec.gt(0)
        ? true
        : revDec.eq(0) && totalActualCostDec.gt(0),
      supplierInvoicesCount: activeInvoices.length,
      additionalExpensesCount: activeAdditionalExpenses.length,
      supplierPaidAmount: supplierPaidDec.toNumber(),
      supplierOutstandingBalance: supplierOutstandingDec.toNumber(),
      financialStatus,
    },
    comparison: {
      rows,
      unlinkedItems,
      totals: {
        originalJobCost: finalTotalsOrig.toNumber(),
        actualInvoiceCost: finalTotalsActual.toNumber(),
        costDifference: finalTotalsDiff.toNumber(),
        costSaving: finalTotalsDiff.gt(0) ? finalTotalsDiff.toNumber() : 0,
        costOverrun: finalTotalsDiff.lt(0)
          ? roundFinancial(finalTotalsActual.minus(finalTotalsOrig), 2).toNumber()
          : 0,
        invoicedAmount: finalTotalsActual.toNumber(),
        paidAllocatedAmount: supplierPaidDec.toNumber(),
        outstandingInvoiceAmount: supplierOutstandingDec.toNumber(),
        unlinkedActualCost: roundFinancial(unlinkedActualDec, 2).toNumber(),
      },
    },
  };
}
