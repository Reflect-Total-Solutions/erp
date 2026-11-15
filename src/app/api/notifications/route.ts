import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  getOrCreateSupplierPaymentSettings,
  runSupplierPaymentDueNotifications,
} from "@/lib/supplier-payment-notifications";
import { getTodayDateKeyInTimezone } from "@/lib/supplier-payment-date";

// Light in-memory cooldown per calendar date so automatic header bell polling runs
// the due-date reminder sweep safely at most once every 5 minutes without DB spam.
let lastAutoSweepKey = "";
let lastAutoSweepTime = 0;

// GET /api/notifications
// Fetches current authenticated user's ERP notifications + unread count.
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access. Please log in." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category")?.trim() || "";
    const unreadOnly = searchParams.get("unreadOnly") === "true";
    const autoCheck = searchParams.get("autoCheck") === "true";
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "30", 10)));

    const db = getPrisma();
    const notificationModel = (db as any)?.notification;
    if (!notificationModel) {
      return NextResponse.json({
        success: true,
        data: [],
        unreadCount: 0,
        totalCount: 0,
        warning:
          "Server Prisma Client cache needs restart (`npm run dev`) to load Notification model.",
      });
    }

    if (autoCheck) {
      try {
        const settings = await getOrCreateSupplierPaymentSettings(db);
        const todayKey = getTodayDateKeyInTimezone(settings.timezone);
        const now = Date.now();
        if (lastAutoSweepKey !== todayKey || now - lastAutoSweepTime > 5 * 60 * 1000) {
          lastAutoSweepKey = todayKey;
          lastAutoSweepTime = now;
          if ((db as any)?.supplierPaymentSettings) {
            await runSupplierPaymentDueNotifications({
              triggerSource: "HEADER_POLL",
              sendEmailsOverride: false, // Automatic bell polls never trigger unplanned emails outside cron/manual run
            });
          }
        }
      } catch (sweepErr) {
        console.warn("Auto payment notification sweep warning:", sweepErr);
      }
    }

    const where: any = { userId: session.userId };
    if (category) {
      where.category = category;
    }
    if (unreadOnly) {
      where.isRead = false;
    }

    const [notifications, unreadCount, totalCount] = await Promise.all([
      notificationModel.findMany({
        where,
        orderBy: [{ isRead: "asc" }, { createdAt: "desc" }],
        take: limit,
      }),
      notificationModel.count({
        where: { userId: session.userId, isRead: false },
      }),
      notificationModel.count({
        where: { userId: session.userId },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: notifications.map((n: any) => ({
        id: n.id,
        userId: n.userId,
        category: n.category,
        type: n.type,
        title: n.title,
        message: n.message,
        linkUrl: n.linkUrl,
        supplierInvoiceId: n.supplierInvoiceId,
        supplierId: n.supplierId,
        supplierPaymentId: n.supplierPaymentId,
        scheduledDateKey: n.scheduledDateKey,
        metadata: n.metadata,
        isRead: n.isRead,
        readAt: n.readAt ? n.readAt.toISOString() : null,
        createdAt: n.createdAt.toISOString(),
      })),
      unreadCount,
      totalCount,
    });
  } catch (err: any) {
    console.error("GET /api/notifications error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to fetch notifications." },
      { status: 500 }
    );
  }
}

// PATCH /api/notifications
// Marks all notifications (or specified IDs) as read for current user.
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access. Please log in." },
        { status: 401 }
      );
    }

    let ids: string[] | undefined;
    try {
      const body = await req.json();
      if (Array.isArray(body?.ids) && body.ids.length > 0) {
        ids = body.ids.map(String);
      }
    } catch {
      // Optional body -> mark all unread
    }

    const db = getPrisma();
    const notificationModel = (db as any)?.notification;
    if (!notificationModel) {
      return NextResponse.json({
        success: true,
        updated: 0,
      });
    }
    const res = await notificationModel.updateMany({
      where: {
        userId: session.userId,
        isRead: false,
        ...(ids ? { id: { in: ids } } : {}),
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      updatedCount: res.count,
      message: `${res.count} notification(s) marked as read.`,
    });
  } catch (err: any) {
    console.error("PATCH /api/notifications error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to update notifications." },
      { status: 500 }
    );
  }
}
