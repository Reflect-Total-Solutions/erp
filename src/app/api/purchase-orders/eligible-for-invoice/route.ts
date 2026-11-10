import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";
import { Decimal, roundFinancial } from "@/lib/financial";
import { PO_ELIGIBLE_FOR_INVOICE_STATUSES } from "@/lib/po-financial";

// GET /api/purchase-orders/eligible-for-invoice?jobId=&supplierId=&includePoId=
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized access." }, { status: 401 });
  }

  const [canCreateInv, canEditInv] = await Promise.all([
    checkSessionPermission(session, "supplierInvoices", "create"),
    checkSessionPermission(session, "supplierInvoices", "edit"),
  ]);

  if (!canCreateInv && !canEditInv) {
    return NextResponse.json(
      { success: false, error: "Forbidden: You do not have permission to link POs to supplier invoices." },
      { status: 403 }
    );
  }

  try {
    const db = getPrisma();
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId")?.trim();
    const supplierId = searchParams.get("supplierId")?.trim();
    const includePoId = searchParams.get("includePoId")?.trim();
    const excludeInvoiceId = searchParams.get("excludeInvoiceId")?.trim();

    const statusCond = includePoId
      ? {
          OR: [
            { status: { in: PO_ELIGIBLE_FOR_INVOICE_STATUSES } },
            { id: includePoId },
          ],
        }
      : { status: { in: PO_ELIGIBLE_FOR_INVOICE_STATUSES } };

    const where: any = {
      deletedAt: null,
      ...statusCond,
      ...(jobId && jobId !== "all" ? { jobId } : {}),
      ...(supplierId && supplierId !== "all" ? { supplierId } : {}),
    };

    const pos = await (db.purchaseOrder as any).findMany({
      where,
      orderBy: [{ poDate: "desc" }, { createdAt: "desc" }],
      include: {
        job: {
          select: { id: true, jobCode: true, name: true, clientName: true, status: true },
        },
        supplier: {
          select: { id: true, code: true, name: true, email: true, phone: true },
        },
        items: {
          orderBy: { rowNumber: "asc" },
          include: {
            supplierInvoiceItems: {
              where: {
                invoice: {
                  deletedAt: null,
                  status: { not: "CANCELLED" },
                  ...(excludeInvoiceId ? { id: { not: excludeInvoiceId } } : {}),
                },
              },
              select: { amount: true, quantity: true },
            },
          },
        },
        supplierInvoices: {
          where: {
            deletedAt: null,
            status: { not: "CANCELLED" },
            ...(excludeInvoiceId ? { id: { not: excludeInvoiceId } } : {}),
          },
          select: { id: true, invoiceNumber: true, totalAmount: true },
        },
      },
    });

    const data = pos.map((po: any) => {
      const grandTotal = new Decimal(po.grandTotal || 0);
      const invoicedTotal = (po.supplierInvoices || []).reduce(
        (s: Decimal, inv: any) => s.plus(new Decimal(inv.totalAmount || 0)),
        new Decimal(0)
      );
      const remainingUninvoiced = Decimal.max(0, grandTotal.minus(invoicedTotal));

      return {
        id: po.id,
        poNumber: po.poNumber,
        poDate: po.poDate ? new Date(po.poDate).toISOString().split("T")[0] : "",
        status: po.status,
        jobId: po.jobId,
        jobCode: po.job?.jobCode || "",
        jobName: po.job?.name || "",
        supplierId: po.supplierId,
        supplierCode: po.supplier?.code || "",
        supplierName: po.supplierNameSnapshot || po.supplier?.name || "",
        subTotal: roundFinancial(po.subTotal, 2).toNumber(),
        ssclAmount: roundFinancial(po.ssclAmount, 2).toNumber(),
        vatAmount: roundFinancial(po.vatAmount, 2).toNumber(),
        grandTotal: roundFinancial(grandTotal, 2).toNumber(),
        invoicedTotal: roundFinancial(invoicedTotal, 2).toNumber(),
        remainingUninvoiced: roundFinancial(remainingUninvoiced, 2).toNumber(),
        items: (po.items || []).map((it: any) => {
          const itemTotal = new Decimal(it.totalAmount || 0);
          const itemQty = new Decimal(it.quantity || 0);
          const linkedAmt = (it.supplierInvoiceItems || []).reduce(
            (s: Decimal, si: any) => s.plus(new Decimal(si.amount || 0)),
            new Decimal(0)
          );
          const linkedQty = (it.supplierInvoiceItems || []).reduce(
            (s: Decimal, si: any) => s.plus(new Decimal(si.quantity || 0)),
            new Decimal(0)
          );
          return {
            id: it.id,
            rowNumber: it.rowNumber,
            particular: it.particular,
            measure: it.measure,
            quantity: roundFinancial(itemQty, 4).toNumber(),
            unitCost: roundFinancial(it.unitCost, 2).toNumber(),
            totalAmount: roundFinancial(itemTotal, 2).toNumber(),
            invoicedQuantity: roundFinancial(linkedQty, 4).toNumber(),
            invoicedAmount: roundFinancial(linkedAmt, 2).toNumber(),
            remainingQuantity: Math.max(0, roundFinancial(itemQty.minus(linkedQty), 4).toNumber()),
            remainingAmount: Math.max(0, roundFinancial(itemTotal.minus(linkedAmt), 2).toNumber()),
          };
        }),
      };
    });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (err: any) {
    console.error("GET /api/purchase-orders/eligible-for-invoice error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to load eligible Purchase Orders." },
      { status: 500 }
    );
  }
}
