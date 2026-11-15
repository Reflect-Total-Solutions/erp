import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// PATCH /api/notifications/[id]
// Marks a single user notification as read/unread.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access. Please log in." },
        { status: 401 }
      );
    }

    const { id } = await params;
    let isRead = true;
    try {
      const body = await req.json();
      if (typeof body?.isRead === "boolean") {
        isRead = body.isRead;
      }
    } catch {
      // default true
    }

    const db = getPrisma();
    const notificationModel = (db as any)?.notification;
    if (!notificationModel) {
      return NextResponse.json(
        {
          success: false,
          code: "PRISMA_CLIENT_STALE",
          error:
            "Server Prisma Client cache is out of sync. Please restart `npm run dev` to update notifications.",
        },
        { status: 503 }
      );
    }

    const existing = await notificationModel.findFirst({
      where: { id, userId: session.userId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Notification not found." },
        { status: 404 }
      );
    }

    const updated = await notificationModel.update({
      where: { id },
      data: {
        isRead,
        readAt: isRead ? new Date() : null,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        isRead: updated.isRead,
        readAt: updated.readAt ? updated.readAt.toISOString() : null,
      },
    });
  } catch (err: any) {
    console.error("PATCH /api/notifications/[id] error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to update notification." },
      { status: 500 }
    );
  }
}
