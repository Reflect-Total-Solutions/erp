import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";
import { logAuditEvent } from "@/lib/audit";
import { departmentSchema } from "@/lib/validations/purchase-order";

// GET /api/purchase-orders/departments
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized access." }, { status: 401 });
  }

  const canView =
    (await checkSessionPermission(session, "purchaseOrders", "view")) ||
    (await checkSessionPermission(session, "purchaseOrders", "create")) ||
    (await checkSessionPermission(session, "purchaseOrders", "manageDepartmentAllocation"));

  if (!canView) {
    return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const includeInactive = searchParams.get("all") === "true";

    const db = getPrisma();
    const departments = await (db.department as any).findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({
      success: true,
      data: departments,
    });
  } catch (err: any) {
    console.error("GET /api/purchase-orders/departments error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to load departments." },
      { status: 500 }
    );
  }
}

// POST /api/purchase-orders/departments
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized access." }, { status: 401 });
  }

  const canManage = await checkSessionPermission(session, "purchaseOrders", "manageSettings");
  if (!canManage) {
    return NextResponse.json(
      { success: false, error: "Forbidden: You do not have permission to manage departments." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = departmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Validation failed.",
        issues: parsed.error.flatten().fieldErrors,
      },
      { status: 422 }
    );
  }

  try {
    const db = getPrisma();
    const { name, code, isActive, sortOrder } = parsed.data;

    const duplicate = await (db.department as any).findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    if (duplicate) {
      return NextResponse.json(
        { success: false, error: `Department "${name}" already exists.` },
        { status: 409 }
      );
    }

    const count = await (db.department as any).count();
    const created = await (db.department as any).create({
      data: {
        name,
        code: code || null,
        isActive: isActive ?? true,
        sortOrder: sortOrder ?? count + 1,
      },
    });

    await logAuditEvent({
      userId: session.userId,
      action: "CREATE_DEPARTMENT",
      resource: "purchaseOrders",
      resourceId: created.id,
      details: { name: created.name, code: created.code },
      req,
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (err: any) {
    console.error("POST /api/purchase-orders/departments error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to create department." },
      { status: 500 }
    );
  }
}
