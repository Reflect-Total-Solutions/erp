import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";
import { canUserAccessRecord } from "@/lib/data-visibility";
import { logAuditEvent } from "@/lib/audit";
import { recalculateJobFinances } from "@/lib/financial-recalculation";

// POST /api/purchase-orders/[id]/restore
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized access." }, { status: 401 });
  }

  const canRestore = await checkSessionPermission(session, "purchaseOrders", "restore");
  if (!canRestore) {
    return NextResponse.json(
      { success: false, error: "Forbidden: You do not have permission to restore Purchase Orders." },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    const db = getPrisma();
    const existing = await (db.purchaseOrder as any).findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Purchase Order not found." }, { status: 404 });
    }

    const accessCheck = await canUserAccessRecord(
      session,
      "purchaseOrders",
      existing.createdById,
      "restore"
    );
    if (!accessCheck.allowed) {
      return NextResponse.json(
        { success: false, error: accessCheck.reason || "Forbidden." },
        { status: 403 }
      );
    }

    if (!existing.deletedAt) {
      return NextResponse.json(
        { success: false, error: "Purchase Order is not in Trash." },
        { status: 400 }
      );
    }

    await db.$transaction(async (tx) => {
      await (tx.purchaseOrder as any).update({
        where: { id },
        data: { deletedAt: null, updatedById: session.userId },
      });
      await (tx.purchaseOrderAuditLog as any).create({
        data: {
          purchaseOrderId: id,
          userId: session.userId,
          action: "RESTORE",
          reason: "Restored from Trash",
        },
      });
      await recalculateJobFinances(existing.jobId, tx);
    });

    await logAuditEvent({
      userId: session.userId,
      action: "RESTORE_PO",
      resource: "purchaseOrders",
      resourceId: id,
      details: { poNumber: existing.poNumber },
      req,
    });

    return NextResponse.json({
      success: true,
      message: `Purchase Order "${existing.poNumber}" restored successfully.`,
    });
  } catch (err: any) {
    console.error(`POST /api/purchase-orders/${id}/restore error:`, err);
    return NextResponse.json(
      { success: false, error: "Failed to restore Purchase Order." },
      { status: 500 }
    );
  }
}
