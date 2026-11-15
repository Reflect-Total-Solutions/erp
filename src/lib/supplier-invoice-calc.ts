import { JobCostItemInvoiceInfo } from "@/types/admin";
import { Decimal, roundFinancial, toDecimal } from "@/lib/financial";

/**
 * Formats a numeric quantity up to 4 decimal places while trimming redundant trailing zeros.
 * Example: 10 -> "10", 2.5 -> "2.5", 1.2500 -> "1.25"
 */
export function formatQtyInput(value: unknown): string {
  const dec = roundFinancial(value, 4);
  if (dec.lte(0)) return "1";
  return dec.toFixed(4).replace(/\.?0+$/, "");
}

/**
 * Computes initial editable Invoice Quantity, Unit, Rate, and Amount when importing
 * a saved JobCostItem into a Supplier Invoice line item row.
 *
 * Uses Decimal arithmetic:
 * - If full original amount is still uninvoiced and `qty * rate == originalAmount`,
 *   preserves the Job's original quantity, unit, and unit rate.
 * - Otherwise defaults to `1 <unit> × remainingAvailable` so partial balances remain exact to the cent.
 */
export function computeInitialRowValuesFromCostItem(ci: JobCostItemInvoiceInfo): {
  quantity: string;
  unit: string;
  unitRate: string;
  amount: string;
  originalJobAmount: number;
  remainingAvailable: number;
} {
  const originalAmtDec = roundFinancial(ci.originalAmount, 2);
  const remainingDec = Decimal.max(0, roundFinancial(ci.remainingAmount, 2));
  const origQtyDec = roundFinancial(ci.quantity || 1, 4);
  const origRateDec = roundFinancial(ci.rate || 0, 2);
  const exactOrigProduct = roundFinancial(origQtyDec.mul(origRateDec), 2);
  const unitStr = (ci.unit || "").trim() || "Nos";

  if (
    remainingDec.eq(originalAmtDec) &&
    remainingDec.gt(0) &&
    origQtyDec.gt(0) &&
    origRateDec.gt(0) &&
    exactOrigProduct.eq(originalAmtDec)
  ) {
    return {
      quantity: formatQtyInput(origQtyDec),
      unit: unitStr,
      unitRate: origRateDec.toFixed(2),
      amount: originalAmtDec.toFixed(2),
      originalJobAmount: originalAmtDec.toNumber(),
      remainingAvailable: remainingDec.toNumber(),
    };
  }

  const targetAmt = remainingDec.gt(0) ? remainingDec : originalAmtDec;
  return {
    quantity: "1",
    unit: unitStr,
    unitRate: targetAmt.gt(0) ? targetAmt.toFixed(2) : "0.00",
    amount: targetAmt.gt(0) ? targetAmt.toFixed(2) : "0.00",
    originalJobAmount: originalAmtDec.toNumber(),
    remainingAvailable: remainingDec.toNumber(),
  };
}

/**
 * Computes default invoice amount for a JobCostItem in the selection table preview.
 */
export function getCostItemSelectableAmount(ci: JobCostItemInvoiceInfo): Decimal {
  const rem = roundFinancial(ci.remainingAmount, 2);
  if (rem.gt(0)) return rem;
  return new Decimal(0);
}

/**
 * Recalculates synchronized quantity / unitRate / amount strings on field change.
 */
export function recalcRowPricingOnChange(params: {
  field: "quantity" | "unitRate" | "amount";
  value: string;
  currentQuantity: string;
  currentUnitRate: string;
  currentAmount: string;
}): { quantity: string; unitRate: string; amount: string } {
  const { field, value, currentQuantity, currentUnitRate, currentAmount } = params;

  if (field === "quantity") {
    const qtyDec = toDecimal(value);
    const rateDec = toDecimal(currentUnitRate);
    const newAmt =
      qtyDec.gt(0) && rateDec.gt(0)
        ? roundFinancial(qtyDec.mul(rateDec), 2).toFixed(2)
        : currentAmount;
    return { quantity: value, unitRate: currentUnitRate, amount: newAmt };
  }

  if (field === "unitRate") {
    const qtyDec = toDecimal(currentQuantity);
    const rateDec = toDecimal(value);
    const newAmt =
      qtyDec.gt(0) && rateDec.gt(0)
        ? roundFinancial(qtyDec.mul(rateDec), 2).toFixed(2)
        : currentAmount;
    return { quantity: currentQuantity, unitRate: value, amount: newAmt };
  }

  // field === "amount"
  const amtDec = toDecimal(value);
  const qtyDec = toDecimal(currentQuantity);
  if (amtDec.gt(0) && qtyDec.gt(0)) {
    const computedRate = roundFinancial(amtDec.div(qtyDec), 2).toFixed(2);
    return { quantity: currentQuantity, unitRate: computedRate, amount: value };
  }
  return { quantity: currentQuantity, unitRate: currentUnitRate, amount: value };
}

/**
 * Ensures on blur of an edited direct Amount that `round(quantity * unitRate, 2)` equals
 * the user's entered exact Amount so the backend doesn't introduce 1-cent division rounding drift.
 */
export function normalizeRowAmountOnBlur(params: {
  quantity: string;
  unitRate: string;
  amount: string;
}): { quantity: string; unitRate: string; amount: string } {
  const amtDec = roundFinancial(params.amount, 2);
  if (amtDec.lte(0)) {
    return params;
  }
  const formattedAmt = amtDec.toFixed(2);
  const qtyDec = roundFinancial(params.quantity, 4);
  if (qtyDec.lte(0)) {
    return {
      quantity: "1",
      unitRate: formattedAmt,
      amount: formattedAmt,
    };
  }
  const impliedRate = roundFinancial(amtDec.div(qtyDec), 2);
  const productCheck = roundFinancial(qtyDec.mul(impliedRate), 2);
  if (productCheck.eq(amtDec)) {
    return {
      quantity: formatQtyInput(qtyDec),
      unitRate: impliedRate.toFixed(2),
      amount: formattedAmt,
    };
  }
  // E.g. 1000.00 / 3 = 333.33 -> 999.99 != 1000.00: normalize to 1 x 1000.00
  return {
    quantity: "1",
    unitRate: formattedAmt,
    amount: formattedAmt,
  };
}
