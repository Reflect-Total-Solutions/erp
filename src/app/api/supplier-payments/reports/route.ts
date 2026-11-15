import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";
import { parseDateKeyToUtcMidnight, roundMoney, toDateKey } from "@/lib/supplier-payment-date";
import {
  buildSupplierInvoiceVisibilityForPayments,
  enrichInvoiceWithPaymentSummary,
  serializeSupplierPayment,
} from "@/lib/supplier-payment-helpers";
import { getOrCreateSupplierPaymentSettings } from "@/lib/supplier-payment-notifications";

// GET /api/supplier-payments/reports
// Executive Payment Reports: KPI totals, Supplier summary, Job breakdown, Aging buckets & export rows
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access. Please log in." },
        { status: 401 }
      );
    }

    const canView = await checkSessionPermission(session, "supplierPayments", "view");
    if (!canView) {
      return NextResponse.json(
        { success: false, error: "Forbidden: You do not have permission to view payment reports." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() || "";
    const supplierId = searchParams.get("supplierId")?.trim() || "";
    const jobId = searchParams.get("jobId")?.trim() || "";
    const paymentStatusFilter = (searchParams.get("paymentStatus") || "ALL").toUpperCase();
    const paymentMethod = searchParams.get("paymentMethod")?.trim() || "";
    const dateFrom = searchParams.get("dateFrom")?.trim() || "";
    const dateTo = searchParams.get("dateTo")?.trim() || "";

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
    const [{ filter: visibilityFilter, scope }, settings] = await Promise.all([
      buildSupplierInvoiceVisibilityForPayments(session),
      getOrCreateSupplierPaymentSettings(db),
    ]);

    const invoiceWhere: any = {
      deletedAt: null,
      status: { not: "CANCELLED" },
    };

    if (visibilityFilter.createdById) {
      invoiceWhere.createdById = visibilityFilter.createdById;
    } else if (visibilityFilter.OR) {
      invoiceWhere.OR = visibilityFilter.OR;
    }

    if (supplierId && supplierId !== "all") {
      invoiceWhere.supplierId = supplierId;
    }
    if (jobId && jobId !== "all") {
      invoiceWhere.jobId = jobId;
    }
    if (dateFrom || dateTo) {
      invoiceWhere.invoiceDate = {};
      if (dateFrom) {
        const dt = parseDateKeyToUtcMidnight(dateFrom);
        if (dt) invoiceWhere.invoiceDate.gte = dt;
      }
      if (dateTo) {
        const dt = parseDateKeyToUtcMidnight(dateTo);
        if (dt) {
          dt.setUTCHours(23, 59, 59, 999);
          invoiceWhere.invoiceDate.lte = dt;
        }
      }
    }

    if (search) {
      const searchConds = [
        { invoiceNumber: { contains: search, mode: "insensitive" } },
        { supplier: { name: { contains: search, mode: "insensitive" } } },
        { supplier: { code: { contains: search, mode: "insensitive" } } },
        { job: { jobCode: { contains: search, mode: "insensitive" } } },
        { job: { name: { contains: search, mode: "insensitive" } } },
      ];
      if (invoiceWhere.OR) {
        invoiceWhere.AND = [{ OR: invoiceWhere.OR }, { OR: searchConds }];
        delete invoiceWhere.OR;
      } else {
        invoiceWhere.OR = searchConds;
      }
    }

    const invoices = await db.supplierInvoice.findMany({
      where: invoiceWhere,
      orderBy: [{ paymentDueDate: "asc" }, { invoiceDate: "desc" }],
      include: {
        supplier: { select: { id: true, code: true, name: true } },
        job: { select: { id: true, jobCode: true, name: true, clientName: true } },
        payments: {
          orderBy: { paymentDate: "desc" },
          include: {
            createdBy: { select: { id: true, name: true } },
            reversedBy: { select: { id: true, name: true } },
          },
        },
      },
    });

    const enrichedInvoices = invoices
      .map((inv) => {
        const paymentSummary = enrichInvoiceWithPaymentSummary(inv, settings.timezone);
        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          supplierId: inv.supplierId,
          supplierCode: inv.supplier?.code || "—",
          supplierName: inv.supplier?.name || "Unknown Supplier",
          jobId: inv.jobId,
          jobCode: inv.job?.jobCode || "—",
          jobName: inv.job?.name || "General Job",
          clientName: inv.job?.clientName || "—",
          invoiceDate: toDateKey(inv.invoiceDate) || "",
          status: inv.status,
          ...paymentSummary,
          payments: inv.payments.map((p) =>
            serializeSupplierPayment(
              { ...p, supplierInvoice: inv, supplier: inv.supplier, job: inv.job },
              settings.timezone
            )
          ),
        };
      })
      .filter((inv) => {
        if (paymentStatusFilter !== "ALL") {
          if (paymentStatusFilter === "PARTIALLY_PAID") return inv.isPartiallyPaid;
          if (paymentStatusFilter === "OVERDUE") return inv.isOverdue;
          return inv.paymentStatus === paymentStatusFilter;
        }
        return true;
      });

    // Aggregate KPIs & Aging
    let totalPayableAmount = 0;
    let totalPaidAmount = 0;
    let totalOutstandingAmount = 0;
    let overdueCount = 0;
    let overdueAmount = 0;
    let dueSoonCount = 0;
    let dueSoonAmount = 0;
    let unpaidCount = 0;
    let partiallyPaidCount = 0;
    let paidCount = 0;

    const agingBuckets = {
      currentAmount: 0,
      currentCount: 0,
      days1To30Amount: 0,
      days1To30Count: 0,
      days31To60Amount: 0,
      days31To60Count: 0,
      days60PlusAmount: 0,
      days60PlusCount: 0,
    };

    const supplierMap = new Map<
      string,
      {
        supplierId: string;
        supplierCode: string;
        supplierName: string;
        invoiceCount: number;
        totalBilled: number;
        totalPaid: number;
        outstandingBalance: number;
        overdueCount: number;
        overdueBalance: number;
      }
    >();

    const jobMap = new Map<
      string,
      {
        jobId: string;
        jobCode: string;
        jobName: string;
        clientName: string;
        invoiceCount: number;
        totalBilled: number;
        totalPaid: number;
        outstandingBalance: number;
        overdueBalance: number;
      }
    >();

    const methodMap = new Map<string, { method: string; count: number; totalAmount: number }>();
    const paymentLedger: any[] = [];
    let reversedCount = 0;

    for (const inv of enrichedInvoices) {
      totalPayableAmount = roundMoney(totalPayableAmount + inv.totalAmount);
      totalPaidAmount = roundMoney(totalPaidAmount + inv.paidAmount);
      totalOutstandingAmount = roundMoney(totalOutstandingAmount + inv.outstandingBalance);

      if (inv.paymentStatus === "PAID") paidCount++;
      else if (inv.paymentStatus === "OVERDUE") {
        overdueCount++;
        overdueAmount = roundMoney(overdueAmount + inv.outstandingBalance);
      } else if (inv.paymentStatus === "PARTIALLY_PAID") partiallyPaidCount++;
      else if (inv.paymentStatus === "UNPAID") unpaidCount++;

      if (
        inv.outstandingBalance > 0 &&
        !inv.isOverdue &&
        inv.countdown &&
        inv.countdown.daysDelta >= 0 &&
        inv.countdown.daysDelta <= 7
      ) {
        dueSoonCount++;
        dueSoonAmount = roundMoney(dueSoonAmount + inv.outstandingBalance);
      }

      if (inv.outstandingBalance > 0) {
        const delta = inv.countdown?.daysDelta ?? 0;
        if (delta >= 0) {
          agingBuckets.currentCount++;
          agingBuckets.currentAmount = roundMoney(
            agingBuckets.currentAmount + inv.outstandingBalance
          );
        } else {
          const overdueDays = Math.abs(delta);
          if (overdueDays <= 30) {
            agingBuckets.days1To30Count++;
            agingBuckets.days1To30Amount = roundMoney(
              agingBuckets.days1To30Amount + inv.outstandingBalance
            );
          } else if (overdueDays <= 60) {
            agingBuckets.days31To60Count++;
            agingBuckets.days31To60Amount = roundMoney(
              agingBuckets.days31To60Amount + inv.outstandingBalance
            );
          } else {
            agingBuckets.days60PlusCount++;
            agingBuckets.days60PlusAmount = roundMoney(
              agingBuckets.days60PlusAmount + inv.outstandingBalance
            );
          }
        }
      }

      // Supplier rollup
      const supAcc = supplierMap.get(inv.supplierId) || {
        supplierId: inv.supplierId,
        supplierCode: inv.supplierCode,
        supplierName: inv.supplierName,
        invoiceCount: 0,
        totalBilled: 0,
        totalPaid: 0,
        outstandingBalance: 0,
        overdueCount: 0,
        overdueBalance: 0,
      };
      supAcc.invoiceCount += 1;
      supAcc.totalBilled = roundMoney(supAcc.totalBilled + inv.totalAmount);
      supAcc.totalPaid = roundMoney(supAcc.totalPaid + inv.paidAmount);
      supAcc.outstandingBalance = roundMoney(
        supAcc.outstandingBalance + inv.outstandingBalance
      );
      if (inv.isOverdue) {
        supAcc.overdueCount += 1;
        supAcc.overdueBalance = roundMoney(supAcc.overdueBalance + inv.outstandingBalance);
      }
      supplierMap.set(inv.supplierId, supAcc);

      // Job rollup
      const jobAcc = jobMap.get(inv.jobId) || {
        jobId: inv.jobId,
        jobCode: inv.jobCode,
        jobName: inv.jobName,
        clientName: inv.clientName,
        invoiceCount: 0,
        totalBilled: 0,
        totalPaid: 0,
        outstandingBalance: 0,
        overdueBalance: 0,
      };
      jobAcc.invoiceCount += 1;
      jobAcc.totalBilled = roundMoney(jobAcc.totalBilled + inv.totalAmount);
      jobAcc.totalPaid = roundMoney(jobAcc.totalPaid + inv.paidAmount);
      jobAcc.outstandingBalance = roundMoney(
        jobAcc.outstandingBalance + inv.outstandingBalance
      );
      if (inv.isOverdue) {
        jobAcc.overdueBalance = roundMoney(jobAcc.overdueBalance + inv.outstandingBalance);
      }
      jobMap.set(inv.jobId, jobAcc);

      // Payments breakdown
      for (const p of inv.payments) {
        if (paymentMethod && paymentMethod !== "all" && p.paymentMethod !== paymentMethod) {
          continue;
        }
        paymentLedger.push(p);
        if (p.status === "REVERSED") {
          reversedCount++;
        } else {
          const curMethod = methodMap.get(p.paymentMethod) || {
            method: p.paymentMethod,
            count: 0,
            totalAmount: 0,
          };
          curMethod.count += 1;
          curMethod.totalAmount = roundMoney(curMethod.totalAmount + p.amount);
          methodMap.set(p.paymentMethod, curMethod);
        }
      }
    }

    paymentLedger.sort((a, b) =>
      String(b.paymentDate).localeCompare(String(a.paymentDate))
    );

    return NextResponse.json({
      success: true,
      summary: {
        totalInvoices: enrichedInvoices.length,
        totalPayableAmount,
        totalPaidAmount,
        totalOutstandingAmount,
        overdueCount,
        overdueAmount,
        dueSoonCount,
        dueSoonAmount,
        unpaidCount,
        partiallyPaidCount,
        paidCount,
        paymentTransactionsCount: paymentLedger.filter((p) => p.status === "SUCCESS").length,
        reversedCount,
      },
      agingBuckets,
      supplierBreakdown: Array.from(supplierMap.values()).sort(
        (a, b) => b.outstandingBalance - a.outstandingBalance
      ),
      jobBreakdown: Array.from(jobMap.values()).sort(
        (a, b) => b.outstandingBalance - a.outstandingBalance
      ),
      paymentMethodBreakdown: Array.from(methodMap.values()).sort(
        (a, b) => b.totalAmount - a.totalAmount
      ),
      invoiceLedger: enrichedInvoices,
      paymentLedger,
      meta: {
        timezone: settings.timezone,
        visibilityScope: scope,
      },
    });
  } catch (err: any) {
    console.error("GET /api/supplier-payments/reports error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to generate payment reports." },
      { status: 500 }
    );
  }
}
