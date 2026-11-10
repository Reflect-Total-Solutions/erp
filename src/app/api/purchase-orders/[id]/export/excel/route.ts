import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";
import { canUserAccessRecord } from "@/lib/data-visibility";
import { logAuditEvent } from "@/lib/audit";
import { getOrCreatePoSettings } from "@/lib/po-number";
import { serializePurchaseOrder } from "@/lib/po-helpers";
import { generatePurchaseOrderExcelBuffer } from "@/lib/po-excel-generator";

// GET /api/purchase-orders/[id]/export/excel
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized access." }, { status: 401 });
  }

  const canDownloadExcel = await checkSessionPermission(session, "purchaseOrders", "downloadExcel");
  if (!canDownloadExcel) {
    return NextResponse.json(
      { success: false, error: "Forbidden: You do not have permission to download PO Excel files." },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    const db = getPrisma();
    const [po, settings] = await Promise.all([
      (db.purchaseOrder as any).findUnique({
        where: { id },
        include: {
          job: {
            select: {
              id: true,
              jobCode: true,
              name: true,
              date: true,
              clientName: true,
              status: true,
              totalCost: true,
              grandTotal: true,
            },
          },
          supplier: {
            select: {
              id: true,
              code: true,
              name: true,
              contactPerson: true,
              phone: true,
              email: true,
              address: true,
            },
          },
          items: {
            orderBy: { rowNumber: "asc" },
            include: {
              departmentAllocations: {
                include: { department: { select: { id: true, name: true, code: true } } },
              },
            },
          },
          departmentAllocations: {
            include: { department: { select: { id: true, name: true, code: true } } },
          },
          createdBy: { select: { id: true, name: true, email: true } },
          approvedBy: { select: { id: true, name: true, email: true } },
        },
      }),
      getOrCreatePoSettings(db),
    ]);

    if (!po || po.deletedAt) {
      return NextResponse.json({ success: false, error: "Purchase Order not found." }, { status: 404 });
    }

    const accessCheck = await canUserAccessRecord(
      session,
      "purchaseOrders",
      po.createdById,
      "downloadExcel"
    );
    if (!accessCheck.allowed) {
      return NextResponse.json(
        { success: false, error: accessCheck.reason || "Forbidden." },
        { status: 403 }
      );
    }

    const canViewFinancials = await checkSessionPermission(
      session,
      "purchaseOrders",
      "viewFinancials"
    );
    const maskFinancials = !canViewFinancials && po.createdById !== session.userId;

    const serialized = serializePurchaseOrder(po, maskFinancials);
    const excelBuffer = generatePurchaseOrderExcelBuffer(serialized, {
      companyName: settings.companyName,
      companyAddress: settings.companyAddress,
      companyRegNo: settings.companyRegNo,
      companyEmail: settings.companyEmail,
      companyPhone: settings.companyPhone,
    });

    await (db.purchaseOrderAuditLog as any).create({
      data: {
        purchaseOrderId: id,
        userId: session.userId,
        action: "EXPORT_EXCEL",
        reason: "Downloaded formatted two-sheet PO Excel document",
      },
    });

    await logAuditEvent({
      userId: session.userId,
      action: "EXPORT_PO_EXCEL",
      resource: "purchaseOrders",
      resourceId: id,
      details: { poNumber: po.poNumber },
      req,
    });

    const safeFileName = `${po.poNumber.replace(/[^a-zA-Z0-9_-]/g, "_")}_${(
      serialized.supplierName || "Supplier"
    )
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 32)}.xlsx`;

    return new NextResponse(new Uint8Array(excelBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeFileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error(`GET /api/purchase-orders/${id}/export/excel error:`, err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to generate Purchase Order Excel file." },
      { status: 500 }
    );
  }
}
