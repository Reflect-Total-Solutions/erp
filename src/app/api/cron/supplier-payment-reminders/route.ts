import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";
import { runSupplierPaymentDueNotifications } from "@/lib/supplier-payment-notifications";

async function handleReminderSweep(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const configuredSecret = process.env.CRON_SECRET?.trim();
    const isCronAuthorized =
      Boolean(configuredSecret) && authHeader === `Bearer ${configuredSecret}`;

    if (!isCronAuthorized) {
      const session = await getSession();
      if (!session) {
        return NextResponse.json(
          { success: false, error: "Unauthorized cron or session credentials." },
          { status: 401 }
        );
      }

      const canManage =
        (await checkSessionPermission(session, "supplierPayments", "manageNotifications")) ||
        (await checkSessionPermission(session, "supplierPayments", "manageSettings"));
      if (!canManage) {
        return NextResponse.json(
          { success: false, error: "Forbidden: Notification management permission required." },
          { status: 403 }
        );
      }
    }

    const { searchParams } = new URL(req.url);
    const queryDate = searchParams.get("targetDate")?.trim();
    const targetDateOverride =
      queryDate && /^\d{4}-\d{2}-\d{2}$/.test(queryDate) ? queryDate : undefined;

    const summary = await runSupplierPaymentDueNotifications({
      targetDateOverride,
      triggerSource: isCronAuthorized ? "CRON_ENDPOINT" : "MANUAL_ENDPOINT",
    });

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (err: any) {
    console.error("/api/cron/supplier-payment-reminders error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Reminder job failed." },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleReminderSweep(req);
}

export async function POST(req: NextRequest) {
  return handleReminderSweep(req);
}
