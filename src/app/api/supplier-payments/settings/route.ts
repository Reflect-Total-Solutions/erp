import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";
import { logAuditEvent } from "@/lib/audit";
import {
  getOrCreateSupplierPaymentSettings,
  normalizeReminderDays,
  runSupplierPaymentDueNotifications,
} from "@/lib/supplier-payment-notifications";
import { DEFAULT_COMPANY_TIMEZONE } from "@/lib/supplier-payment-date";

// GET /api/supplier-payments/settings
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access. Please log in." },
        { status: 401 }
      );
    }

    const canView =
      (await checkSessionPermission(session, "supplierPayments", "view")) ||
      (await checkSessionPermission(session, "supplierPayments", "manageSettings")) ||
      (await checkSessionPermission(session, "supplierPayments", "manageNotifications"));
    if (!canView) {
      return NextResponse.json(
        { success: false, error: "Forbidden." },
        { status: 403 }
      );
    }

    const settings = await getOrCreateSupplierPaymentSettings(getPrisma());
    return NextResponse.json({ success: true, data: settings });
  } catch (err: any) {
    console.error("GET /api/supplier-payments/settings error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to load payment settings." },
      { status: 500 }
    );
  }
}

// PUT /api/supplier-payments/settings
export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access. Please log in." },
        { status: 401 }
      );
    }

    const canManage = await checkSessionPermission(
      session,
      "supplierPayments",
      "manageSettings"
    );
    if (!canManage) {
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden: Administrator permission is required to modify payment reminder settings.",
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    const timezone =
      typeof body.timezone === "string" && body.timezone.trim()
        ? body.timezone.trim()
        : DEFAULT_COMPANY_TIMEZONE;

    // Validate timezone via Intl
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
    } catch {
      return NextResponse.json(
        { success: false, error: `Invalid IANA timezone "${timezone}". Example: Asia/Colombo` },
        { status: 400 }
      );
    }

    const upcomingReminderDays = normalizeReminderDays(body.upcomingReminderDays);
    const db = getPrisma();
    const settingsModel = (db as any)?.supplierPaymentSettings;
    if (!settingsModel) {
      return NextResponse.json(
        {
          success: false,
          code: "PRISMA_CLIENT_STALE",
          error:
            "Server Prisma Client cache is out of sync with prisma/schema.prisma. Please stop `npm run dev`, run `npx prisma generate`, and restart `npm run dev`.",
        },
        { status: 503 }
      );
    }

    const updated = await settingsModel.upsert({
      where: { id: "default" },
      update: {
        timezone,
        upcomingReminderDays,
        notifyOnDueToday:
          typeof body.notifyOnDueToday === "boolean" ? body.notifyOnDueToday : undefined,
        notifyDailyOverdue:
          typeof body.notifyDailyOverdue === "boolean" ? body.notifyDailyOverdue : undefined,
        notifyOnPartialPayment:
          typeof body.notifyOnPartialPayment === "boolean"
            ? body.notifyOnPartialPayment
            : undefined,
        notifyOnFullPayment:
          typeof body.notifyOnFullPayment === "boolean"
            ? body.notifyOnFullPayment
            : undefined,
        emailRemindersEnabled:
          typeof body.emailRemindersEnabled === "boolean"
            ? body.emailRemindersEnabled
            : undefined,
        updatedById: session.userId,
      },
      create: {
        id: "default",
        timezone,
        upcomingReminderDays,
        notifyOnDueToday: Boolean(body.notifyOnDueToday ?? true),
        notifyDailyOverdue: Boolean(body.notifyDailyOverdue ?? true),
        notifyOnPartialPayment: Boolean(body.notifyOnPartialPayment ?? true),
        notifyOnFullPayment: Boolean(body.notifyOnFullPayment ?? true),
        emailRemindersEnabled: Boolean(body.emailRemindersEnabled ?? false),
        updatedById: session.userId,
      },
    });

    await logAuditEvent({
      userId: session.userId,
      action: "UPDATE_SUPPLIER_PAYMENT_SETTINGS",
      resource: "supplier-payments",
      resourceId: "default",
      details: {
        timezone: updated.timezone,
        upcomingReminderDays,
        emailRemindersEnabled: updated.emailRemindersEnabled,
      },
      req,
    });

    return NextResponse.json({
      success: true,
      message: "Supplier Payment notification settings updated successfully.",
      data: {
        id: updated.id,
        timezone: updated.timezone,
        upcomingReminderDays,
        notifyOnDueToday: updated.notifyOnDueToday,
        notifyDailyOverdue: updated.notifyDailyOverdue,
        notifyOnPartialPayment: updated.notifyOnPartialPayment,
        notifyOnFullPayment: updated.notifyOnFullPayment,
        emailRemindersEnabled: updated.emailRemindersEnabled,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (err: any) {
    console.error("PUT /api/supplier-payments/settings error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to update payment settings." },
      { status: 500 }
    );
  }
}

// POST /api/supplier-payments/settings
// Manual trigger to run due-date reminder & overdue notification sweep immediately
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access. Please log in." },
        { status: 401 }
      );
    }

    const canManage =
      (await checkSessionPermission(session, "supplierPayments", "manageNotifications")) ||
      (await checkSessionPermission(session, "supplierPayments", "manageSettings"));
    if (!canManage) {
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden: You do not have permission to run payment reminder notifications.",
        },
        { status: 403 }
      );
    }

    let targetDateOverride: string | undefined;
    try {
      const body = await req.json();
      if (typeof body?.targetDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.targetDate)) {
        targetDateOverride = body.targetDate;
      }
    } catch {
      // Optional JSON body
    }

    if (!(getPrisma() as any)?.notification || !(getPrisma() as any)?.supplierPaymentSettings) {
      return NextResponse.json(
        {
          success: false,
          code: "PRISMA_CLIENT_STALE",
          error:
            "Server Prisma Client cache is out of sync with prisma/schema.prisma. Please stop `npm run dev`, run `npx prisma generate`, and restart `npm run dev`.",
        },
        { status: 503 }
      );
    }

    const summary = await runSupplierPaymentDueNotifications({
      targetDateOverride,
      triggerSource: "SETTINGS_MANUAL_RUN",
    });

    return NextResponse.json({
      success: true,
      message: `Notification sweep completed (${summary.notificationsCreated} new alerts created across ${summary.scannedInvoices} active invoices).`,
      summary,
    });
  } catch (err: any) {
    console.error("POST /api/supplier-payments/settings error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to execute reminder sweep." },
      { status: 500 }
    );
  }
}
