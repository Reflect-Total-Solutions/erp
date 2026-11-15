/**
 * Pure timezone-safe calendar date & Supplier Payment derivation helpers.
 * Zero Node.js built-ins so both Server Routes and Client Components can import safely.
 */

export const DEFAULT_COMPANY_TIMEZONE = "Asia/Colombo";

export const SUPPLIER_PAYMENT_METHODS = [
  "Bank Transfer",
  "Cash",
  "Cheque",
  "Online Transfer",
  "Other",
] as const;

export type SupplierPaymentMethodType = (typeof SUPPLIER_PAYMENT_METHODS)[number];

export type DerivedPaymentStatus =
  | "UNPAID"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERDUE"
  | "CANCELLED";

export interface PaymentCountdownInfo {
  label: string;
  daysDelta: number;
  isOverdue: boolean;
  isDueToday: boolean;
  severity: "neutral" | "upcoming" | "warning" | "overdue" | "paid" | "cancelled";
}

export function roundMoney(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const num = typeof value === "number" ? value : Number(String(value));
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Normalizes a Date or date-string to canonical YYYY-MM-DD calendar date key.
 */
export function toDateKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    const directMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (directMatch) {
      const check = parseDateKeyToUtcMidnight(directMatch[1]);
      if (check) return directMatch[1];
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().split("T")[0];
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().split("T")[0];
  }
  return null;
}

/**
 * Parses a strict YYYY-MM-DD date string into a UTC-midnight Date object.
 * Rejects invalid calendar dates like 2026-02-31.
 */
export function parseDateKeyToUtcMidnight(dateKey: string | null | undefined): Date | null {
  if (!dateKey || typeof dateKey !== "string") return null;
  const match = dateKey.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return dt;
}

/**
 * Returns today's calendar YYYY-MM-DD date string in the specified IANA timezone.
 */
export function getTodayDateKeyInTimezone(
  timezone: string = DEFAULT_COMPANY_TIMEZONE,
  now: Date = new Date()
): string {
  const safeTz = timezone?.trim() || DEFAULT_COMPANY_TIMEZONE;
  try {
    const formatted = new Intl.DateTimeFormat("en-CA", {
      timeZone: safeTz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    if (/^\d{4}-\d{2}-\d{2}$/.test(formatted)) {
      return formatted;
    }
  } catch {
    // Fallback if invalid timezone string supplied
    try {
      const fallback = new Intl.DateTimeFormat("en-CA", {
        timeZone: DEFAULT_COMPANY_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);
      if (/^\d{4}-\d{2}-\d{2}$/.test(fallback)) {
        return fallback;
      }
    } catch {
      // Ignore and use UTC ISO
    }
  }
  return now.toISOString().split("T")[0];
}

/**
 * Pure calendar day arithmetic (zero DST/local-offset drift).
 */
export function addCalendarDays(dateKey: string, days: number): string | null {
  const base = parseDateKeyToUtcMidnight(dateKey);
  if (!base || !Number.isFinite(days)) return null;
  const wholeDays = Math.trunc(days);
  const shifted = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + wholeDays, 0, 0, 0, 0)
  );
  return shifted.toISOString().split("T")[0];
}

/**
 * Returns signed calendar day difference: (toKey - fromKey) in whole days.
 * Positive => toKey is in the future; 0 => same day; Negative => toKey is earlier than fromKey.
 */
export function diffCalendarDays(fromKey: string, toKey: string): number {
  const fromDate = parseDateKeyToUtcMidnight(fromKey);
  const toDate = parseDateKeyToUtcMidnight(toKey);
  if (!fromDate || !toDate) return 0;
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
}

export function buildPaymentCountdown({
  invoiceStatus,
  outstandingBalance,
  dueDateKey,
  todayKey,
}: {
  invoiceStatus: string;
  outstandingBalance: number;
  dueDateKey: string | null;
  todayKey: string;
}): PaymentCountdownInfo {
  if (invoiceStatus === "CANCELLED") {
    return {
      label: "Cancelled",
      daysDelta: 0,
      isOverdue: false,
      isDueToday: false,
      severity: "cancelled",
    };
  }
  if (outstandingBalance <= 0) {
    return {
      label: "Paid",
      daysDelta: 0,
      isOverdue: false,
      isDueToday: false,
      severity: "paid",
    };
  }
  if (!dueDateKey) {
    return {
      label: "No Due Date",
      daysDelta: 0,
      isOverdue: false,
      isDueToday: false,
      severity: "neutral",
    };
  }

  const delta = diffCalendarDays(todayKey, dueDateKey);
  if (delta < 0) {
    const overdueDays = Math.abs(delta);
    return {
      label: `${overdueDays} ${overdueDays === 1 ? "day" : "days"} overdue`,
      daysDelta: delta,
      isOverdue: true,
      isDueToday: false,
      severity: "overdue",
    };
  }
  if (delta === 0) {
    return {
      label: "Due today",
      daysDelta: 0,
      isOverdue: false,
      isDueToday: true,
      severity: "warning",
    };
  }
  if (delta <= 7) {
    return {
      label: `${delta} ${delta === 1 ? "day" : "days"} left`,
      daysDelta: delta,
      isOverdue: false,
      isDueToday: false,
      severity: "upcoming",
    };
  }
  return {
    label: `${delta} days left`,
    daysDelta: delta,
    isOverdue: false,
    isDueToday: false,
    severity: "neutral",
  };
}

export interface DerivedPaymentSummaryResult {
  totalAmount: number;
  paidAmount: number;
  outstandingBalance: number;
  paymentStatus: DerivedPaymentStatus;
  isPartiallyPaid: boolean;
  isOverdue: boolean;
  dueDateKey: string | null;
  lastPaymentDate: string | null;
  countdown: PaymentCountdownInfo;
}

/**
 * Derives authoritative invoice payment status, paid/outstanding totals, and countdown
 * from active ("SUCCESS") payment records + invoice due date.
 */
export function computeDerivedPaymentSummary({
  totalAmount,
  paidAmount,
  dueDate,
  invoiceDate,
  invoiceStatus,
  payments,
  timezone = DEFAULT_COMPANY_TIMEZONE,
  asOfDateKey,
  lastPaymentDate,
}: {
  totalAmount: unknown;
  paidAmount?: unknown;
  dueDate?: Date | string | null;
  invoiceDate?: Date | string | null;
  invoiceStatus?: string | null;
  payments?: Array<{ amount: unknown; status: string; paymentDate?: Date | string | null }>;
  timezone?: string;
  asOfDateKey?: string;
  lastPaymentDate?: Date | string | null;
}): DerivedPaymentSummaryResult {
  const statusStr = String(invoiceStatus || "APPROVED").toUpperCase();
  const total = roundMoney(totalAmount);

  let resolvedPaid = roundMoney(paidAmount);
  let resolvedLastPaymentDate = toDateKey(lastPaymentDate);

  if (Array.isArray(payments)) {
    const activePayments = payments.filter((p) => String(p.status).toUpperCase() === "SUCCESS");
    resolvedPaid = roundMoney(
      activePayments.reduce((acc, p) => acc + roundMoney(p.amount), 0)
    );
    let latestKey: string | null = null;
    for (const p of activePayments) {
      const k = toDateKey(p.paymentDate);
      if (k && (!latestKey || k > latestKey)) {
        latestKey = k;
      }
    }
    resolvedLastPaymentDate = latestKey;
  }

  const outstandingBalance = Math.max(0, roundMoney(total - resolvedPaid));
  const dueDateKey = toDateKey(dueDate) || toDateKey(invoiceDate);
  const todayKey = asOfDateKey || getTodayDateKeyInTimezone(timezone);

  const isPartiallyPaid = resolvedPaid > 0 && outstandingBalance > 0;
  const countdown = buildPaymentCountdown({
    invoiceStatus: statusStr,
    outstandingBalance: total > 0 ? outstandingBalance : statusStr === "PAID" ? 0 : total,
    dueDateKey,
    todayKey,
  });

  let paymentStatus: DerivedPaymentStatus = "UNPAID";
  if (statusStr === "CANCELLED") {
    paymentStatus = "CANCELLED";
  } else if (total > 0 && outstandingBalance <= 0) {
    paymentStatus = "PAID";
  } else if (total === 0 && resolvedPaid > 0) {
    paymentStatus = "PAID";
  } else if (countdown.isOverdue) {
    paymentStatus = "OVERDUE";
  } else if (resolvedPaid > 0) {
    paymentStatus = "PARTIALLY_PAID";
  } else {
    paymentStatus = "UNPAID";
  }

  return {
    totalAmount: total,
    paidAmount: resolvedPaid,
    outstandingBalance,
    paymentStatus,
    isPartiallyPaid,
    isOverdue: paymentStatus === "OVERDUE",
    dueDateKey,
    lastPaymentDate: resolvedLastPaymentDate,
    countdown,
  };
}

/**
 * Formats YYYY-MM-DD / ISO date for clean display without timezone shift.
 */
export function formatCalendarDate(value: Date | string | null | undefined): string {
  const key = toDateKey(value);
  return key || "—";
}
