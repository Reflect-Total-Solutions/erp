import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";
import { logAuditEvent } from "@/lib/audit";
import { departmentSchema } from "@/lib/validations/purchase-order";

// PUT /api/purchase-orders/departments/[id]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized access." }, { status: 401 });
  }

  const canManage = await checkSessionPermission(session, "purchaseOrders", "manageSettings");
  if (!canManage) {
    return NextResponse.json(
      { success: false, error: "Forbidden: You do not have permission to update departments." },
      { status: 403 }
    );
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = departmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  try {
    const db = getPrisma();
    const existing = await (db.department as any).findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Department not found." }, { status: 404 });
    }

    const dup = await (db.department as any).findFirst({
      where: {
        id: { not: id },
        name: { equals: parsed.data.name, mode: "insensitive" },
      },
    });
    if (dup) {
      return NextResponse.json(
        { success: false, error: `Department "${parsed.data.name}" already exists.` },
        { status: 409 }
      );
    }

    const updated = await (db.department as any).update({
      where: { id },
      data: {
        name: parsed.data.name,
        code: parsed.data.code || null,
        ...(parsed.data.isActive !== undefined && { isActive: parsed.data.isActive }),
        ...(parsed.data.sortOrder !== undefined && { sortOrder: parsed.data.sortOrder }),
      },
    });

    await logAuditEvent({
      userId: session.userId,
      action: "UPDATE_DEPARTMENT",
      resource: "purchaseOrders",
      resourceId: id,
      details: { name: updated.name, isActive: updated.isActive },
      req,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    console.error("PUT /api/purchase-orders/departments/[id] error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to update department." },
      { status: 500 }
    );
  }
}

// DELETE /api/purchase-orders/departments/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized access." }, { status: 401 });
  }

  const canManage = await checkSessionPermission(session, "purchaseOrders", "manageSettings");
  if (!canManage) {
    return NextResponse.json(
      { success: false, error: "Forbidden: You do not have permission to delete departments." },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    const db = getPrisma();
    const existing = await (db.department as any).findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Department not found." }, { status: 404 });
    }

    const usageCount = await (db.purchaseOrderDepartmentAllocation as any).count({
      where: { departmentId: id },
    });

    if (usageCount > 0) {
      // Soft deactivate instead of deleting referenced department
      const deactivated = await (db.department as any).update({
        where: { id },
        data: { isActive: false },
      });
      return NextResponse.json({
        success: true,
        deactivated: true,
        message: `Department "${existing.name}" has ${usageCount} historical PO allocation(s), so it was marked inactive instead of deleted.`,
        data: deactivated,
      });
    }

    await (db.department as any).delete({ where: { id } });

    await logAuditEvent({
      userId: session.userId,
      action: "DELETE_DEPARTMENT",
      resource: "purchaseOrders",
      resourceId: id,
      details: { name: existing.name },
      req,
    });

    return NextResponse.json({
      success: true,
      message: `Department "${existing.name}" deleted.`,
    });
  } catch (err: any) {
    console.error("DELETE /api/purchase-orders/departments/[id] error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to delete department." },
      { status: 500 }
    );
  }
}
