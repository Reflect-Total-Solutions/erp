import Decimal from "decimal.js";

// Configure default Decimal settings for financial precision: 28 digits, Half-Up rounding
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

/**
 * Safely converts any input (number, string, Decimal, Prisma Decimal) into a Decimal.js instance.
 * Strips commas, currency symbols (Rs, LKR), and whitespace.
 */
export function toDecimal(value: unknown): Decimal {
  if (value === null || value === undefined || value === "") {
    return new Decimal(0);
  }

  if (value instanceof Decimal) {
    return value;
  }

  if (typeof value === "object" && value !== null && "toString" in value) {
    // Handles Prisma.Decimal or other decimal-like wrappers
    const str = (value as any).toString();
    if (!str || str === "NaN") return new Decimal(0);
    try {
      return new Decimal(str);
    } catch {
      return new Decimal(0);
    }
  }

  if (typeof value === "number") {
    if (isNaN(value) || !isFinite(value)) return new Decimal(0);
    return new Decimal(value.toString());
  }

  if (typeof value === "string") {
    const cleaned = value
      .replace(/,/g, "")
      .replace(/Rs\.?/gi, "")
      .replace(/LKR/gi, "")
      .trim();

    if (!cleaned || isNaN(Number(cleaned))) {
      return new Decimal(0);
    }

    try {
      return new Decimal(cleaned);
    } catch {
      return new Decimal(0);
    }
  }

  return new Decimal(0);
}

/**
 * Rounds a financial amount to exactly N decimal places using standard financial ROUND_HALF_UP.
 * Default is 2 decimal places.
 */
export function roundFinancial(value: unknown, decimalPlaces = 2): Decimal {
  const dec = toDecimal(value);
  return dec.toDecimalPlaces(decimalPlaces, Decimal.ROUND_HALF_UP);
}

/**
 * Standard Sri Lankan & international currency formatter.
 * ALWAYS formats to EXACTLY two decimal places with thousands comma separators.
 *
 * Examples:
 *   formatCurrency(3502274.057) -> "3,502,274.06"
 *   formatCurrency(3502274.06)  -> "3,502,274.06"
 *   formatCurrency(3502274)     -> "3,502,274.00"
 *   formatCurrency(123456.78)   -> "123,456.78"
 *   formatCurrency(9999999.99)  -> "9,999,999.99"
 *   formatCurrency(2478670.08)  -> "2,478,670.08"
 */
export function formatCurrency(
  value: unknown,
  options?: {
    showCurrencyPrefix?: boolean;
    currencySymbol?: string;
    decimalPlaces?: number;
  }
): string {
  const places = options?.decimalPlaces ?? 2;
  const dec = roundFinancial(value, places);

  // Format with integer thousands separators and fixed decimal places
  const fixedStr = dec.toFixed(places);
  const [intPart, decPart] = fixedStr.split(".");
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const result = places > 0 ? `${formattedInt}.${decPart}` : formattedInt;

  if (options?.showCurrencyPrefix) {
    const prefix = options.currencySymbol ?? "Rs. ";
    return `${prefix}${result}`;
  }

  return result;
}

/**
 * Multiplies two numbers (e.g. Quantity × Rate) using Decimal arithmetic
 * and rounds to the specified decimal places (default 2).
 */
export function multiplyFinancial(
  quantity: unknown,
  rate: unknown,
  decimalPlaces = 2
): Decimal {
  const q = toDecimal(quantity);
  const r = toDecimal(rate);
  return q.mul(r).toDecimalPlaces(decimalPlaces, Decimal.ROUND_HALF_UP);
}

/**
 * Sums an array of amounts using arbitrary-precision Decimal arithmetic.
 */
export function sumFinancial(
  values: unknown[],
  decimalPlaces = 2
): Decimal {
  let sum = new Decimal(0);
  for (const v of values) {
    sum = sum.plus(toDecimal(v));
  }
  return sum.toDecimalPlaces(decimalPlaces, Decimal.ROUND_HALF_UP);
}

/**
 * Calculates tax on an amount using Decimal arithmetic: (amount × rate) / 100
 */
export function calculateTaxFinancial(
  amount: unknown,
  taxRatePercent: unknown,
  decimalPlaces = 2
): Decimal {
  const a = toDecimal(amount);
  const r = toDecimal(taxRatePercent);
  return a.mul(r).div(100).toDecimalPlaces(decimalPlaces, Decimal.ROUND_HALF_UP);
}

/**
 * Extracts numeric value from Excel cell while preserving authoritative formatting and precision.
 * Prefers the formatted string (cell.w) if it represents a clean financial currency number,
 * or rounds cell.v accurately using Decimal.
 */
export function extractExcelFinancialValue(
  cellValue: unknown,
  cellFormatted?: string
): Decimal {
  if (cellFormatted && typeof cellFormatted === "string") {
    const cleanFormatted = cellFormatted
      .replace(/,/g, "")
      .replace(/Rs\.?/gi, "")
      .replace(/LKR/gi, "")
      .trim();

    // If formatted cell is a valid numeric string like "3502274.06"
    if (/^-?\d+(\.\d+)?$/.test(cleanFormatted)) {
      return roundFinancial(cleanFormatted, 2);
    }
  }

  return roundFinancial(cellValue, 2);
}
