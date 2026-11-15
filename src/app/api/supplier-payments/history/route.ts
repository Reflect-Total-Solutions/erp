import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";
import { buildRecordVisibilityFilter } from "@/lib/data-visibility";
import { parseDateKeyToUtcMidnight, roundMoney } from "@/lib/supplier-payment-date";
import { serializeSupplierPayment } from "@/lib/supplier-payment-helpers";
import { getOrCreateSupplierPaymentSettings } from "@/lib/supplier-payment-notifications";

// GET /api/supplier-payments/history
// Full chronological Supplier Payment transaction ledger with filters & audit details
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access. Please log in." },
        { status: 401 }
      );
    }

    const canViewHistory =
      (await checkSessionPermission(session, "supplierPayments", "viewHistory")) ||
      (await checkSessionPermission(session, "supplierPayments", "view"));
    if (!canViewHistory) {
      return NextResponse.json(
        { success: false, error: "Forbidden: You do not have permission to view Payment History." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() || "";
    const supplierId = searchParams.get("supplierId")?.trim() || "";
    const statusFilter = (searchParams.get("status") || "ALL").toUpperCase();
    const paymentMethod = searchParams.get("paymentMethod")?.trim() || "";
    const dateFrom = searchParams.get("dateFrom")?.trim() || "";
    const dateTo = searchParams.get("dateTo")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "25", 10)));
    const skip = (page - 1) * limit;

    const db = getPrisma();
    if (!(db as any)?.supplierPayment) {
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
    const [{ filter: visFilter, scope }, settings] = await Promise.all([
      buildRecordVisibilityFilter(session, "supplierPayments", "createdById", true),
      getOrCreateSupplierPaymentSettings(db),
    ]);

    const where: any = {
      supplierInvoice: { deletedAt: null },
    };

    if (visFilter.createdById) {
      where.OR = [
        { createdById: visFilter.createdById },
        { supplierInvoice: { createdById: visFilter.createdById, deletedAt: null } },
      ];
    } else if (visFilter.OR) {
      const allowedIds = visFilter.OR.flatMap((c: any) =>
        c.createdById?.in ? c.createdById.in : []
      );
      if (allowedIds.length > 0) {
        where.OR = [
          { createdById: { in: allowedIds } },
          { createdById: null },
          { supplierInvoice: { createdById: { in: allowedIds }, deletedAt: null } },
        ];
      }
    }

    if (supplierId && supplierId !== "all") {
      where.supplierId = supplierId;
    }
    if (statusFilter !== "ALL") {
      where.status = statusFilter;
    }
    if (paymentMethod && paymentMethod !== "all") {
      where.paymentMethod = paymentMethod;
    }

    if (dateFrom || dateTo) {
      where.paymentDate = {};
      if (dateFrom) {
        const dt = parseDateKeyToUtcMidnight(dateFrom);
        if (dt) where.paymentDate.gte = dt;
      }
      if (dateTo) {
        const dt = parseDateKeyToUtcMidnight(dateTo);
        if (dt) {
          dt.setUTCHours(23, 59, 59, 999);
          where.paymentDate.lte = dt;
        }
      }
    }

    if (search) {
      const searchConds = [
        { paymentNumber: { contains: search, mode: "insensitive" } },
        { referenceNumber: { contains: search, mode: "insensitive" } },
        { bankAccountName: { contains: search, mode: "insensitive" } },
        { supplierInvoice: { invoiceNumber: { contains: search, mode: "insensitive" } } },
        { supplier: { name: { contains: search, mode: "insensitive" } } },
        { supplier: { code: { contains: search, mode: "insensitive" } } },
        { job: { jobCode: { contains: search, mode: "insensitive" } } },
        { job: { name: { contains: search, mode: "insensitive" } } },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchConds }];
        delete where.OR;
      } else {
        where.OR = searchConds;
      }
    }

    const [payments, totalItems, aggregateRows] = await Promise.all([
      db.supplierPayment.findMany({
        where,
        orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
        include: {
          supplierInvoice: {
            select: {
              id: true,
              invoiceNumber: true,
              invoiceDate: true,
              paymentDueDate: true,
              totalAmount: true,
              paidAmount: true,
              paymentStatus: true,
            },
          },
          supplier: { select: { id: true, code: true, name: true } },
          job: { select: { id: true, jobCode: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          updatedBy: { select: { id: true, name: true } },
          reversedBy: { select: { id: true, name: true } },
          auditLogs: {
            orderBy: { createdAt: "desc" },
            include: { user: { select: { id: true, name: true } } },
          },
        },
      }),
      db.supplierPayment.count({ where }),
      db.supplierPayment.findMany({
        where,
        select: { amount: true, status: true },
      }),
    ]);

    let totalSuccessAmount = 0;
    let successCount = 0;
    let totalReversedAmount = 0;
    let reversedCount = 0;
    for (const r of aggregateRows) {
      if (r.status === "REVERSED") {
        reversedCount++;
        totalReversedAmount = roundMoney(totalReversedAmount + roundMoney(r.amount));
      } else {
        successCount++;
        totalSuccessAmount = roundMoney(totalSuccessAmount + roundMoney(r.amount));
      }
    }

    return NextResponse.json({
      success: true,
      data: payments.map((p) => serializeSupplierPayment(p, settings.timezone)),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / limit)),
      },
      summary: {
        totalTransactions: totalItems,
        successCount,
        totalSuccessAmount,
        reversedCount,
        totalReversedAmount,
      },
      meta: {
        timezone: settings.timezone,
        visibilityScope: scope,
      },
    });
  } catch (err: any) {
    console.error("GET /api/supplier-payments/history error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to load payment history." },
      { status: 500 }
    );
  }
}
