/**
 * Standalone scheduler script for Supplier Payment Due & Overdue Notifications.
 * Usage:
 *   node scripts/run-payment-reminders.mjs
 *   node scripts/run-payment-reminders.mjs --date 2026-11-15
 *
 * Schedule daily via Windows Task Scheduler, cron, or PM2.
 * Respects SupplierPaymentSettings.timezone (Asia/Colombo) & deduplicates notifications cleanly.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function toDateKey(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().split("T")[0];
  const m = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function getTodayDateKeyInTimezone(timezone = "Asia/Colombo") {
  try {
    const formatted = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "Asia/Colombo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    if (/^\d{4}-\d{2}-\d{2}$/.test(formatted)) return formatted;
  } catch {
    // ignore
  }
  return new Date().toISOString().split("T")[0];
}

function diffCalendarDays(fromKey, toKey) {
  const f = new Date(`${fromKey}T00:00:00.000Z`);
  const t = new Date(`${toKey}T00:00:00.000Z`);
  return Math.round((t.getTime() - f.getTime()) / 86400000);
}

async function main() {
  const argIdx = process.argv.indexOf("--date");
  const dateOverride =
    argIdx !== -1 && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[argIdx + 1] || "")
      ? process.argv[argIdx + 1]
      : null;

  let settings = await prisma.supplierPaymentSettings.findUnique({ where: { id: "default" } });
  if (!settings) {
    settings = await prisma.supplierPaymentSettings.create({
      data: {
        id: "default",
        timezone: "Asia/Colombo",
        upcomingReminderDays: [7, 3, 1],
      },
    });
  }

  const timezone = settings.timezone || "Asia/Colombo";
  const todayKey = dateOverride || getTodayDateKeyInTimezone(timezone);
  const upcomingDays = Array.isArray(settings.upcomingReminderDays)
    ? settings.upcomingReminderDays.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
    : [7, 3, 1];

  const activeInvoices = await prisma.supplierInvoice.findMany({
    where: {
      deletedAt: null,
      status: { not: "CANCELLED" },
      paymentDueDate: { not: null },
    },
    include: {
      supplier: { select: { id: true, name: true } },
      job: { select: { id: true, jobCode: true } },
      payments: { where: { status: "SUCCESS" }, select: { amount: true } },
    },
  });

  const adminUsers = await prisma.user.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      roles: {
        some: {
          role: { name: { in: ["admin", "supervisor", "Admin", "Supervisor"] } },
        },
      },
    },
    select: { id: true, email: true, name: true },
  });

  let createdCount = 0;

  for (const inv of activeInvoices) {
    const total = Number(inv.totalAmount || 0);
    const paid = inv.payments.reduce((acc, p) => acc + Number(p.amount || 0), 0);
    const outstanding = Math.max(0, Math.round((total - paid) * 100) / 100);
    if (outstanding <= 0) continue;

    const dueKey = toDateKey(inv.paymentDueDate) || toDateKey(inv.invoiceDate);
    if (!dueKey) continue;

    const daysDelta = diffCalendarDays(todayKey, dueKey);
    const derivedStatus = daysDelta < 0 ? "OVERDUE" : paid > 0 ? "PARTIALLY_PAID" : "UNPAID";
    if (inv.paymentStatus !== derivedStatus) {
      await prisma.supplierInvoice.update({
        where: { id: inv.id },
        data: { paymentStatus: derivedStatus, paidAmount: paid },
      });
    }

    let type = null;
    let keyPrefix = "";
    if (daysDelta > 0 && upcomingDays.includes(daysDelta)) {
      type = "UPCOMING_DUE_REMINDER";
      keyPrefix = `sp:upcoming:${inv.id}:${dueKey}:${daysDelta}`;
    } else if (daysDelta === 0 && settings.notifyOnDueToday) {
      type = "DUE_TODAY";
      keyPrefix = `sp:due-today:${inv.id}:${todayKey}`;
    } else if (daysDelta < 0 && settings.notifyDailyOverdue) {
      type = "OVERDUE";
      keyPrefix = `sp:overdue:${inv.id}:${todayKey}`;
    }

    if (!type) continue;

    const recipients = [...adminUsers];
    if (inv.createdById && !recipients.some((u) => u.id === inv.createdById)) {
      const creator = await prisma.user.findUnique({
        where: { id: inv.createdById },
        select: { id: true, email: true, name: true, isActive: true, deletedAt: true },
      });
      if (creator && creator.isActive && !creator.deletedAt) {
        recipients.push(creator);
      }
    }

    const formattedBalance = `Rs. ${outstanding.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
    const countdownLabel =
      daysDelta < 0
        ? `${Math.abs(daysDelta)} day(s) overdue`
        : daysDelta === 0
        ? "Due today"
        : `${daysDelta} day(s) left`;

    const title =
      type === "OVERDUE"
        ? `Overdue Invoice: ${inv.invoiceNumber} (${countdownLabel})`
        : type === "DUE_TODAY"
        ? `Payment Due Today: ${inv.invoiceNumber}`
        : `Payment Due in ${daysDelta} Day(s): ${inv.invoiceNumber}`;

    const message = `Supplier Invoice ${inv.invoiceNumber} (${inv.supplier?.name || "Supplier"}) — Due ${dueKey} (${countdownLabel}). Outstanding: ${formattedBalance}.`;

    const res = await prisma.notification.createMany({
      data: recipients.map((u) => ({
        userId: u.id,
        category: "SUPPLIER_PAYMENT",
        type,
        title,
        message,
        linkUrl: `/admin/supplier-payments/list?viewInvoiceId=${encodeURIComponent(inv.id)}`,
        supplierInvoiceId: inv.id,
        supplierId: inv.supplierId,
        scheduledDateKey: todayKey,
        dedupKey: `${keyPrefix}:${u.id}`,
        metadata: {
          invoiceNumber: inv.invoiceNumber,
          dueDate: dueKey,
          outstandingBalance: outstanding,
          daysDelta,
        },
      })),
      skipDuplicates: true,
    });
    createdCount += res.count;
  }

  console.log(
    JSON.stringify({
      ok: true,
      timezone,
      dateKey: todayKey,
      scannedInvoices: activeInvoices.length,
      notificationsCreated: createdCount,
    })
  );
}

main()
  .catch((err) => {
    console.error("Payment reminder job failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
