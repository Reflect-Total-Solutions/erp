import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";
import { logAuditEvent } from "@/lib/audit";
import { poSettingsSchema } from "@/lib/validations/purchase-order";
import { previewNextPoNumber } from "@/lib/po-number";

// GET /api/purchase-orders/settings
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized access." }, { status: 401 });
  }

  const canView =
    (await checkSessionPermission(session, "purchaseOrders", "view")) ||
    (await checkSessionPermission(session, "purchaseOrders", "create")) ||
    (await checkSessionPermission(session, "purchaseOrders", "manageSettings"));

  if (!canView) {
    return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
  }

  try {
    const db = getPrisma();
    const [{ nextPoNumber, settings }, departments] = await Promise.all([
      previewNextPoNumber(db),
      (db.department as any).findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        settings: {
          id: settings.id,
          companyName: settings.companyName,
          companyAddress: settings.companyAddress,
          companyRegNo: settings.companyRegNo,
          companyEmail: settings.companyEmail,
          companyPhone: settings.companyPhone,
          defaultDeliverToName: settings.defaultDeliverToName,
          defaultDeliverToAddress: settings.defaultDeliverToAddress,
          defaultDeliverToEmail: settings.defaultDeliverToEmail,
          poNumberPrefix: settings.poNumberPrefix,
          financialYearCode: settings.financialYearCode,
          poNumberPadding: settings.poNumberPadding,
          defaultSsclRate: Number(settings.defaultSsclRate),
          defaultVatRate: Number(settings.defaultVatRate),
          defaultApplySscl: Boolean(settings.defaultApplySscl),
          defaultApplyVat: Boolean(settings.defaultApplyVat),
          defaultCurrency: settings.defaultCurrency,
          defaultComments: settings.defaultComments,
          defaultTerms: settings.defaultTerms,
          nextPoNumberPreview: nextPoNumber,
        },
        departments,
      },
    });
  } catch (err: any) {
    console.error("GET /api/purchase-orders/settings error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to fetch PO settings." },
      { status: 500 }
    );
  }
}

// PUT /api/purchase-orders/settings
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized access." }, { status: 401 });
  }

  const canManage = await checkSessionPermission(session, "purchaseOrders", "manageSettings");
  if (!canManage) {
    return NextResponse.json(
      { success: false, error: "Forbidden: You do not have permission to manage PO settings." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = poSettingsSchema.safeParse(body);
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
    const data = parsed.data;
    const updated = await (db.purchaseOrderSettings as any).upsert({
      where: { id: "default" },
      update: {
        ...data,
        updatedById: session.userId,
      },
      create: {
        id: "default",
        ...data,
        updatedById: session.userId,
      },
    });

    const { nextPoNumber } = await previewNextPoNumber(db);

    await logAuditEvent({
      userId: session.userId,
      action: "UPDATE_PO_SETTINGS",
      resource: "purchaseOrders",
      resourceId: updated.id,
      details: {
        poNumberPrefix: updated.poNumberPrefix,
        financialYearCode: updated.financialYearCode,
        defaultSsclRate: Number(updated.defaultSsclRate),
        defaultVatRate: Number(updated.defaultVatRate),
      },
      req,
    });

    return NextResponse.json({
      success: true,
      message: "Purchase Order settings saved successfully.",
      data: {
        ...updated,
        defaultSsclRate: Number(updated.defaultSsclRate),
        defaultVatRate: Number(updated.defaultVatRate),
        nextPoNumberPreview: nextPoNumber,
      },
    });
  } catch (err: any) {
    console.error("PUT /api/purchase-orders/settings error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to update PO settings." },
      { status: 500 }
    );
  }
}
