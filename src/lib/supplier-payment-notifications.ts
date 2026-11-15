/**
 * Server-side Notification & Reminder Sweep Service for Supplier Payments.
 * Produces idempotent deduplicated ERP notifications and optionally sends email reminders
 * ONLY when SupplierPaymentSettings.emailRemindersEnabled === true.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/financial";
import { sendSupplierPaymentReminderEmail } from "@/lib/email";
import {
  DEFAULT_COMPANY_TIMEZONE,
  DerivedPaymentSummaryResult,
  buildPaymentCountdown,
  computeDerivedPaymentSummary,
  diffCalendarDays,
  getTodayDateKeyInTimezone,
  roundMoney,
} from "@/lib/supplier-payment-date";

type DbClient = PrismaClient | Prisma.TransactionClient;

export interface NormalizedPaymentSettings {
  id: string;
  timezone: string;
  upcomingReminderDays: number[];
  notifyOnDueToday: boolean;
  notifyDailyOverdue: boolean;
  notifyOnPartialPayment: boolean;
  notifyOnFullPayment: boolean;
  emailRemindersEnabled: boolean;
  updatedAt?: string;
}

export function normalizeReminderDays(raw: unknown): number[] {
  let arr: unknown[] = [];
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) arr = parsed;
    } catch {
      arr = raw.split(",").map((s) => s.trim());
    }
  }
  const nums = Array.from(
    new Set(
      arr
        .map((n) => parseInt(String(n), 10))
        .filter((n) => Number.isFinite(n) && n > 0 && n <= 365)
    )
  ).sort((a, b) => b - a);

  return nums.length > 0 ? nums : [7, 3, 1];
}

export async function getOrCreateSupplierPaymentSettings(
  client: DbClient = getPrisma()
): Promise<NormalizedPaymentSettings> {
  const settingsModel = (client as any)?.supplierPaymentSettings;
  if (!settingsModel) {
    console.warn(
      "[SupplierPaymentNotifications] Prisma client delegate `supplierPaymentSettings` is unavailable (dev server restart needed). Returning safe defaults."
    );
    return {
      id: "default",
      timezone: DEFAULT_COMPANY_TIMEZONE,
      upcomingReminderDays: [7, 3, 1],
      notifyOnDueToday: true,
      notifyDailyOverdue: true,
      notifyOnPartialPayment: true,
      notifyOnFullPayment: true,
      emailRemindersEnabled: false,
    };
  }

  let row = await settingsModel.findUnique({
    where: { id: "default" },
  });

  if (!row) {
    row = await settingsModel.upsert({
      where: { id: "default" },
      update: {},
      create: {
        id: "default",
        timezone: DEFAULT_COMPANY_TIMEZONE,
        upcomingReminderDays: [7, 3, 1],
        notifyOnDueToday: true,
        notifyDailyOverdue: true,
        notifyOnPartialPayment: true,
        notifyOnFullPayment: true,
        emailRemindersEnabled: false,
      },
    });
  }

  return {
    id: row.id,
    timezone: row.timezone || DEFAULT_COMPANY_TIMEZONE,
    upcomingReminderDays: normalizeReminderDays(row.upcomingReminderDays),
    notifyOnDueToday: Boolean(row.notifyOnDueToday),
    notifyDailyOverdue: Boolean(row.notifyDailyOverdue),
    notifyOnPartialPayment: Boolean(row.notifyOnPartialPayment),
    notifyOnFullPayment: Boolean(row.notifyOnFullPayment),
    emailRemindersEnabled: Boolean(row.emailRemindersEnabled),
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : undefined,
  };
}

interface RecipientUser {
  id: string;
  email: string;
  name: string;
}

/**
 * Resolves active users who should receive Supplier Payment alerts:
 * - Active admins & supervisors
 * - The invoice creator (if active)
 */
async function getNotificationRecipients(
  client: DbClient,
  invoiceCreatedById?: string | null
): Promise<RecipientUser[]> {
  const users = await client.user.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      OR: [
        {
          roles: {
            some: {
              role: { name: { in: ["admin", "supervisor", "Admin", "Supervisor"] } },
            },
          },
        },
        ...(invoiceCreatedById ? [{ id: invoiceCreatedById }] : []),
      ],
    },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  const seen = new Set<string>();
  const unique: RecipientUser[] = [];
  for (const u of users) {
    if (!seen.has(u.id)) {
      seen.add(u.id);
      unique.push(u);
    }
  }
  return unique;
}

/**
 * Emits an immediate in-app notification after a Supplier Payment is recorded
 * (either PARTIAL_PAYMENT_RECORDED or FULL_PAYMENT_COMPLETED).
 */
export async function emitPaymentRecordedNotification({
  client = getPrisma(),
  settings,
  invoice,
  payment,
  derivedSummary,
  actorName,
}: {
  client?: DbClient;
  settings: NormalizedPaymentSettings;
  invoice: {
    id: string;
    invoiceNumber: string;
    supplierId: string;
    supplierName: string;
    jobCode?: string;
    createdById?: string | null;
  };
  payment: {
    id: string;
    paymentNumber: string;
    amount: number;
    paymentDate: string;
  };
  derivedSummary: DerivedPaymentSummaryResult;
  actorName?: string | null;
}) {
  const isFullPayment = derivedSummary.paymentStatus === "PAID";
  if (isFullPayment && !settings.notifyOnFullPayment) return;
  if (!isFullPayment && !settings.notifyOnPartialPayment) return;

  const recipients = await getNotificationRecipients(client, invoice.createdById);
  if (recipients.length === 0) return;

  const type = isFullPayment ? "FULL_PAYMENT_COMPLETED" : "PARTIAL_PAYMENT_RECORDED";
  const formattedAmt = formatCurrency(roundMoney(payment.amount));
  const formattedBalance = formatCurrency(derivedSummary.outstandingBalance);

  const title = isFullPayment
    ? `Invoice Fully Paid: ${invoice.invoiceNumber}`
    : `Partial Payment Recorded: ${invoice.invoiceNumber}`;

  const message = isFullPayment
    ? `${payment.paymentNumber} (${formattedAmt}) settled ${invoice.supplierName}'s invoice ${invoice.invoiceNumber} completely${actorName ? ` (by ${actorName})` : ""}.`
    : `${payment.paymentNumber} (${formattedAmt}) recorded for ${invoice.supplierName} (${invoice.invoiceNumber}). Outstanding balance: ${formattedBalance}.`;

  const linkUrl = `/admin/supplier-payments/list?viewInvoiceId=${encodeURIComponent(invoice.id)}`;

  const payload = recipients.map((user) => ({
    userId: user.id,
    category: "SUPPLIER_PAYMENT",
    type,
    title,
    message,
    linkUrl,
    supplierInvoiceId: invoice.id,
    supplierId: invoice.supplierId,
    supplierPaymentId: payment.id,
    scheduledDateKey: payment.paymentDate,
    dedupKey: `sp:${isFullPayment ? "full" : "partial"}:${payment.id}:${user.id}`,
    metadata: {
      paymentNumber: payment.paymentNumber,
      invoiceNumber: invoice.invoiceNumber,
      supplierName: invoice.supplierName,
      jobCode: invoice.jobCode || null,
      amountPaid: roundMoney(payment.amount),
      outstandingBalance: derivedSummary.outstandingBalance,
      paymentStatus: derivedSummary.paymentStatus,
    },
  }));

  const notificationModel = (client as any)?.notification;
  if (!notificationModel) {
    console.warn(
      "[SupplierPaymentNotifications] Prisma client delegate `notification` is unavailable (dev server restart needed). Skipping in-app notification insert."
    );
    return;
  }

  await notificationModel.createMany({
    data: payload,
    skipDuplicates: true,
  });
}

export interface ReminderSweepSummary {
  timezone: string;
  dateKey: string;
  scannedInvoices: number;
  upcomingMatched: number;
  dueTodayMatched: number;
  overdueMatched: number;
  notificationsCreated: number;
  emailsSent: number;
  emailErrors: number;
}

/**
 * Evaluates all active unpaid/partially-paid Supplier Invoices against `todayKey`
 * in Company Timezone (Asia/Colombo) and creates deduplicated upcoming/due-today/overdue notifications.
 * Cancelled and fully Paid invoices are strictly excluded.
 */
export async function runSupplierPaymentDueNotifications({
  targetDateOverride,
  sendEmailsOverride,
}: {
  targetDateOverride?: string;
  triggerSource?: string;
  sendEmailsOverride?: boolean;
} = {}): Promise<ReminderSweepSummary> {
  const prisma = getPrisma();
  const settings = await getOrCreateSupplierPaymentSettings(prisma);
  const todayKey =
    targetDateOverride || getTodayDateKeyInTimezone(settings.timezone);
  const shouldSendEmails =
    typeof sendEmailsOverride === "boolean"
      ? sendEmailsOverride
      : settings.emailRemindersEnabled;

  if (!(prisma as any)?.notification) {
    console.warn(
      "[SupplierPaymentNotifications] Prisma client delegate `notification` is unavailable (dev server restart needed). Skipping reminder sweep."
    );
    return {
      timezone: settings.timezone,
      dateKey: todayKey,
      scannedInvoices: 0,
      upcomingMatched: 0,
      dueTodayMatched: 0,
      overdueMatched: 0,
      notificationsCreated: 0,
      emailsSent: 0,
      emailErrors: 0,
    };
  }

  const activeInvoices = await prisma.supplierInvoice.findMany({
    where: {
      deletedAt: null,
      status: { not: "CANCELLED" },
      paymentDueDate: { not: null },
    },
    include: {
      supplier: { select: { id: true, name: true, code: true } },
      job: { select: { id: true, jobCode: true, name: true } },
      payments: {
        where: { status: "SUCCESS" },
        select: { id: true, amount: true, status: true, paymentDate: true },
      },
    },
  });

  const adminUsers = await getNotificationRecipients(prisma, null);
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3100";

  let upcomingMatched = 0;
  let dueTodayMatched = 0;
  let overdueMatched = 0;
  let notificationsCreated = 0;
  let emailsSent = 0;
  let emailErrors = 0;

  for (const inv of activeInvoices) {
    const derived = computeDerivedPaymentSummary({
      totalAmount: inv.totalAmount,
      dueDate: inv.paymentDueDate,
      invoiceDate: inv.invoiceDate,
      invoiceStatus: inv.status,
      payments: inv.payments,
      timezone: settings.timezone,
      asOfDateKey: todayKey,
    });

    // Keep persisted paymentStatus column synced with overdue rollovers
    if (inv.paymentStatus !== derived.paymentStatus) {
      await prisma.supplierInvoice.update({
        where: { id: inv.id },
        data: {
          paymentStatus: derived.paymentStatus,
          paidAmount: derived.paidAmount,
        },
      });
    }

    // Paid or zero-balance invoices MUST NEVER trigger due/overdue reminders
    if (derived.outstandingBalance <= 0 || derived.paymentStatus === "PAID") {
      continue;
    }

    if (!derived.dueDateKey) continue;

    const daysDelta = diffCalendarDays(todayKey, derived.dueDateKey);
    const countdown = buildPaymentCountdown({
      invoiceStatus: inv.status,
      outstandingBalance: derived.outstandingBalance,
      dueDateKey: derived.dueDateKey,
      todayKey,
    });

    let reminderType: "UPCOMING_DUE_REMINDER" | "DUE_TODAY" | "OVERDUE" | null = null;
    let keyPrefix = "";

    if (daysDelta > 0 && settings.upcomingReminderDays.includes(daysDelta)) {
      reminderType = "UPCOMING_DUE_REMINDER";
      keyPrefix = `sp:upcoming:${inv.id}:${derived.dueDateKey}:${daysDelta}`;
      upcomingMatched++;
    } else if (daysDelta === 0 && settings.notifyOnDueToday) {
      reminderType = "DUE_TODAY";
      keyPrefix = `sp:due-today:${inv.id}:${todayKey}`;
      dueTodayMatched++;
    } else if (daysDelta < 0 && settings.notifyDailyOverdue) {
      reminderType = "OVERDUE";
      keyPrefix = `sp:overdue:${inv.id}:${todayKey}`;
      overdueMatched++;
    }

    if (!reminderType) continue;

    // Combine admins/supervisors + creator
    const recipientsMap = new Map<string, RecipientUser>();
    adminUsers.forEach((u) => recipientsMap.set(u.id, u));
    if (inv.createdById && !recipientsMap.has(inv.createdById)) {
      const creator = await prisma.user.findUnique({
        where: { id: inv.createdById },
        select: { id: true, email: true, name: true, isActive: true, deletedAt: true },
      });
      if (creator && creator.isActive && !creator.deletedAt) {
        recipientsMap.set(creator.id, {
          id: creator.id,
          email: creator.email,
          name: creator.name,
        });
      }
    }

    const recipients = Array.from(recipientsMap.values());
    if (recipients.length === 0) continue;

    const candidateDedupKeys = recipients.map((u) => `${keyPrefix}:${u.id}`);
    const existingRows = await prisma.notification.findMany({
      where: { dedupKey: { in: candidateDedupKeys } },
      select: { dedupKey: true },
    });
    const existingSet = new Set(existingRows.map((r) => r.dedupKey).filter(Boolean));

    const newRecipients = recipients.filter((u) => !existingSet.has(`${keyPrefix}:${u.id}`));
    if (newRecipients.length === 0) {
      continue;
    }

    const balanceFormatted = formatCurrency(derived.outstandingBalance);
    const linkPath = `/admin/supplier-payments/list?viewInvoiceId=${encodeURIComponent(inv.id)}`;
    const supplierName = inv.supplier?.name || "Supplier";
    const jobCode = inv.job?.jobCode || "";

    const title =
      reminderType === "OVERDUE"
        ? `Overdue Invoice: ${inv.invoiceNumber} (${countdown.label})`
        : reminderType === "DUE_TODAY"
        ? `Payment Due Today: ${inv.invoiceNumber}`
        : `Payment Due in ${daysDelta} ${daysDelta === 1 ? "Day" : "Days"}: ${inv.invoiceNumber}`;

    const message =
      reminderType === "OVERDUE"
        ? `Supplier Invoice ${inv.invoiceNumber} (${supplierName}) was due on ${derived.dueDateKey} (${countdown.label}). Outstanding balance: ${balanceFormatted}.`
        : reminderType === "DUE_TODAY"
        ? `Supplier Invoice ${inv.invoiceNumber} (${supplierName}) is due today (${derived.dueDateKey}). Outstanding balance: ${balanceFormatted}.`
        : `Supplier Invoice ${inv.invoiceNumber} (${supplierName}) is due on ${derived.dueDateKey} (${countdown.label}). Outstanding balance: ${balanceFormatted}.`;

    const toCreate = newRecipients.map((u) => ({
      userId: u.id,
      category: "SUPPLIER_PAYMENT",
      type: reminderType!,
      title,
      message,
      linkUrl: linkPath,
      supplierInvoiceId: inv.id,
      supplierId: inv.supplierId,
      scheduledDateKey: todayKey,
      dedupKey: `${keyPrefix}:${u.id}`,
      metadata: {
        invoiceNumber: inv.invoiceNumber,
        supplierName,
        jobCode,
        dueDate: derived.dueDateKey,
        outstandingBalance: derived.outstandingBalance,
        countdownLabel: countdown.label,
        daysDelta,
      },
    }));

    const inserted = await prisma.notification.createMany({
      data: toCreate,
      skipDuplicates: true,
    });
    notificationsCreated += inserted.count;

    if (shouldSendEmails && inserted.count > 0) {
      for (const recipient of newRecipients) {
        if (!recipient.email) continue;
        const emailResult = await sendSupplierPaymentReminderEmail({
          toEmail: recipient.email,
          recipientName: recipient.name,
          reminderType,
          invoiceNumber: inv.invoiceNumber,
          supplierName,
          jobCode,
          dueDate: derived.dueDateKey,
          outstandingBalanceFormatted: balanceFormatted,
          countdownLabel: countdown.label,
          invoiceLinkUrl: `${appBaseUrl}${linkPath}`,
        });
        if (emailResult.success) emailsSent++;
        else emailErrors++;
      }
    }
  }

  return {
    timezone: settings.timezone,
    dateKey: todayKey,
    scannedInvoices: activeInvoices.length,
    upcomingMatched,
    dueTodayMatched,
    overdueMatched,
    notificationsCreated,
    emailsSent,
    emailErrors,
  };
}
