import {
  Decimal,
  toDecimal,
  roundFinancial,
  calculateTaxFinancial,
} from "@/lib/financial";

export const PO_STATUSES = {
  DRAFT: "DRAFT",
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  ISSUED: "ISSUED",
  PARTIALLY_DELIVERED: "PARTIALLY_DELIVERED",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
} as const;

export const PO_ACTIVE_COMMITMENT_STATUSES = [
  "PENDING",
  "APPROVED",
  "ISSUED",
  "PARTIALLY_DELIVERED",
  "DELIVERED",
];

export const PO_ELIGIBLE_FOR_INVOICE_STATUSES = [
  "APPROVED",
  "ISSUED",
  "PARTIALLY_DELIVERED",
  "DELIVERED",
];

export const PO_ELIGIBLE_JOB_STATUSES = [
  "APPROVED",
  "Approved",
  "ACTIVE",
  "Active",
  "INVOICE_GENERATED",
  "INVOICED",
  "Invoiced",
];

export function isJobEligibleForPo(status?: string | null, deletedAt?: Date | string | null): boolean {
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

export interface PoLineInput {
  quantity: number | string;
  unitCost: number | string;
}

export interface PoComputedItem {
  quantity: Decimal;
  unitCost: Decimal;
  totalAmount: Decimal;
}

export interface PoFinancialComputation {
  items: PoComputedItem[];
  subTotal: Decimal;
  discountAmount: Decimal;
  totalAfterDiscount: Decimal;
  applySscl: boolean;
  ssclRate: Decimal;
  ssclAmount: Decimal;
  totalWithSscl: Decimal;
  applyVat: boolean;
  vatRate: Decimal;
  vatAmount: Decimal;
  grandTotal: Decimal;
}

/**
 * Pure arbitrary-precision Purchase Order financial calculator using Decimal.js.
 * Matches exact two-stage compound tax structure:
 *   Line Amount = round(Qty * Unit Cost, 2)
 *   Sub-Total = sum(Line Amounts)
 *   Total After Discount = max(0, Sub-Total - Discount)
 *   SSCL Amount = applySscl ? round(Total After Discount * ssclRate / 100, 2) : 0
 *   Total With SSCL = Total After Discount + SSCL Amount
 *   VAT Amount = applyVat ? round(Total With SSCL * vatRate / 100, 2) : 0
 *   Grand Total = Total With SSCL + VAT Amount
 */
export function computePurchaseOrderFinancials(input: {
  items: PoLineInput[];
  discountAmount?: number | string | null;
  applySscl?: boolean;
  ssclRate?: number | string | null;
  applyVat?: boolean;
  vatRate?: number | string | null;
}): PoFinancialComputation {
  const computedItems: PoComputedItem[] = (input.items || []).map((item) => {
    const qty = roundFinancial(toDecimal(item.quantity), 4);
    const unitCost = roundFinancial(toDecimal(item.unitCost), 2);
    const totalAmount = roundFinancial(qty.mul(unitCost), 2);
    return {
      quantity: qty,
      unitCost,
      totalAmount,
    };
  });

  let subTotal = new Decimal(0);
  for (const it of computedItems) {
    subTotal = subTotal.plus(it.totalAmount);
  }
  subTotal = roundFinancial(subTotal, 2);

  let discount = roundFinancial(toDecimal(input.discountAmount ?? 0), 2);
  if (discount.lt(0)) discount = new Decimal(0);
  if (discount.gt(subTotal)) discount = subTotal;

  const totalAfterDiscount = roundFinancial(subTotal.minus(discount), 2);

  const applySscl = Boolean(input.applySscl);
  const ssclRate = roundFinancial(toDecimal(input.ssclRate ?? 0), 3);
  const ssclAmount = applySscl && ssclRate.gt(0)
    ? calculateTaxFinancial(totalAfterDiscount, ssclRate, 2)
    : new Decimal(0);

  const totalWithSscl = roundFinancial(totalAfterDiscount.plus(ssclAmount), 2);

  const applyVat = Boolean(input.applyVat);
  const vatRate = roundFinancial(toDecimal(input.vatRate ?? 0), 3);
  const vatAmount = applyVat && vatRate.gt(0)
    ? calculateTaxFinancial(totalWithSscl, vatRate, 2)
    : new Decimal(0);

  const grandTotal = roundFinancial(totalWithSscl.plus(vatAmount), 2);

  return {
    items: computedItems,
    subTotal,
    discountAmount: discount,
    totalAfterDiscount,
    applySscl,
    ssclRate,
    ssclAmount,
    totalWithSscl,
    applyVat,
    vatRate,
    vatAmount,
    grandTotal,
  };
}
