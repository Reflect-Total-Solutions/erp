import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";
import { buildRecordVisibilityFilter } from "@/lib/data-visibility";
import { Decimal, roundFinancial } from "@/lib/financial";
import { PO_ACTIVE_COMMITMENT_STATUSES } from "@/lib/po-financial";
import { serializePurchaseOrder } from "@/lib/po-helpers";

// GET /api/purchase-orders/reports
// Aggregated reports: PO Summary list, Department Allocation breakdown, Job Budget vs PO Commitment vs Actual Invoiced
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized access." }, { status: 401 });
  }

  const canView = await checkSessionPermission(session, "purchaseOrders", "view");
  if (!canView) {
    return NextResponse.json(
      { success: false, error: "Forbidden: You do not have permission to view PO reports." },
      { status: 403 }
    );
  }

  try {
    const db = getPrisma();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status")?.trim();
    const jobId = searchParams.get("jobId")?.trim();
    const supplierId = searchParams.get("supplierId")?.trim();
    const dateFrom = searchParams.get("dateFrom")?.trim();
    const dateTo = searchParams.get("dateTo")?.trim();
    const search = searchParams.get("search")?.trim() || "";

    const { filter: visibilityFilter, scope } = await buildRecordVisibilityFilter(
      session,
      "purchaseOrders",
      "createdById",
      false
    );
    const canViewFinancials = await checkSessionPermission(
      session,
      "purchaseOrders",
      "viewFinancials"
    );

    const where: any = {
      deletedAt: null,
      ...(visibilityFilter.createdById ? { createdById: visibilityFilter.createdById } : {}),
      ...(visibilityFilter.OR ? { OR: visibilityFilter.OR } : {}),
    };

    if (status && status !== "all") where.status = status.toUpperCase();
    if (jobId && jobId !== "all") where.jobId = jobId;
    if (supplierId && supplierId !== "all") where.supplierId = supplierId;
    if (dateFrom || dateTo) {
      where.poDate = {};
      if (dateFrom) where.poDate.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.poDate.lte = end;
      }
    }
    if (search) {
      const searchConds = [
        { poNumber: { contains: search, mode: "insensitive" } },
        { job: { jobCode: { contains: search, mode: "insensitive" } } },
        { job: { name: { contains: search, mode: "insensitive" } } },
        { supplier: { name: { contains: search, mode: "insensitive" } } },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchConds }];
        delete where.OR;
      } else {
        where.OR = searchConds;
      }
    }

    const orders = await (db.purchaseOrder as any).findMany({
      where,
      orderBy: [{ poDate: "desc" }, { createdAt: "desc" }],
      include: {
        job: {
          select: {
            id: true,
            jobCode: true,
            name: true,
            clientName: true,
            date: true,
            status: true,
            totalCost: true,
            grandTotal: true,
            supplierInvoices: {
              where: { deletedAt: null, status: { not: "CANCELLED" } },
              select: { id: true, totalAmount: true },
            },
          },
        },
        supplier: {
          select: { id: true, code: true, name: true, email: true, phone: true },
        },
        items: { orderBy: { rowNumber: "asc" } },
        departmentAllocations: {
          include: { department: { select: { id: true, name: true, code: true } } },
        },
        createdBy: { select: { id: true, name: true, email: true } },
        supplierInvoices: {
          where: { deletedAt: null, status: { not: "CANCELLED" } },
          select: { id: true, invoiceNumber: true, totalAmount: true, status: true },
        },
      },
    });

    const maskExecutive = !canViewFinancials;

    const deptSummaryMap = new Map<
      string,
      {
        departmentId: string;
        departmentName: string;
        departmentCode: string | null;
        poCount: Set<string>;
        allocatedQuantity: Decimal;
        allocatedAmount: Decimal;
      }
    >();

    const jobComparisonMap = new Map<
      string,
      {
        jobId: string;
        jobCode: string;
        jobName: string;
        clientName: string;
        approvedJobValue: Decimal;
        poCount: number;
        draftPoValue: Decimal;
        committedPoValue: Decimal;
        actualInvoicedValue: Decimal;
      }
    >();

    for (const po of orders) {
      const st = String(po.status || "").toUpperCase();
      const maskRow = !canViewFinancials && po.createdById !== session.userId;

      if (!["CANCELLED", "REJECTED"].includes(st)) {
        // Department aggregation
        for (const alloc of po.departmentAllocations || []) {
          const deptId = alloc.departmentId;
          const prev = deptSummaryMap.get(deptId) || {
            departmentId: deptId,
            departmentName: alloc.department?.name || "Department",
            departmentCode: alloc.department?.code || null,
            poCount: new Set<string>(),
            allocatedQuantity: new Decimal(0),
            allocatedAmount: new Decimal(0),
          };
          prev.poCount.add(po.id);
          prev.allocatedQuantity = prev.allocatedQuantity.plus(new Decimal(alloc.allocatedQuantity || 0));
          if (!maskRow) {
            prev.allocatedAmount = prev.allocatedAmount.plus(new Decimal(alloc.allocatedAmount || 0));
          }
          deptSummaryMap.set(deptId, prev);
        }

        // Job Budget vs Commitment vs Invoiced
        if (po.job) {
          let jobRow = jobComparisonMap.get(po.jobId);
          if (!jobRow) {
            const actualInvoiced = (po.job.supplierInvoices || []).reduce(
              (s: Decimal, inv: any) => s.plus(new Decimal(inv.totalAmount || 0)),
              new Decimal(0)
            );
            jobRow = {
              jobId: po.job.id,
              jobCode: po.job.jobCode,
              jobName: po.job.name,
              clientName: po.job.clientName || "—",
              approvedJobValue: new Decimal(po.job.grandTotal || po.job.totalCost || 0),
              poCount: 0,
              draftPoValue: new Decimal(0),
              committedPoValue: new Decimal(0),
              actualInvoicedValue: actualInvoiced,
            };
            jobComparisonMap.set(po.jobId, jobRow);
          }
          jobRow.poCount++;
          const val = new Decimal(po.grandTotal || 0);
          if (st === "DRAFT") {
            jobRow.draftPoValue = jobRow.draftPoValue.plus(val);
          } else if (PO_ACTIVE_COMMITMENT_STATUSES.includes(st)) {
            jobRow.committedPoValue = jobRow.committedPoValue.plus(val);
          }
        }
      }
    }

    const serializedOrders = orders.map((po: any) => {
      const mask = !canViewFinancials && po.createdById !== session.userId;
      return serializePurchaseOrder(po, mask);
    });

    const departmentBreakdown = Array.from(deptSummaryMap.values())
      .map((d) => ({
        departmentId: d.departmentId,
        departmentName: d.departmentName,
        departmentCode: d.departmentCode,
        poCount: d.poCount.size,
        allocatedQuantity: roundFinancial(d.allocatedQuantity, 2).toNumber(),
        allocatedAmount: maskExecutive ? 0 : roundFinancial(d.allocatedAmount, 2).toNumber(),
      }))
      .sort((a, b) => b.allocatedAmount - a.allocatedAmount);

    const jobBudgetComparison = Array.from(jobComparisonMap.values())
      .map((j) => {
        const remainingUncommitted = j.approvedJobValue.minus(j.committedPoValue);
        const utilization = j.approvedJobValue.gt(0)
          ? j.committedPoValue.dividedBy(j.approvedJobValue).mul(100)
          : new Decimal(0);
        return {
          jobId: j.jobId,
          jobCode: j.jobCode,
          jobName: j.jobName,
          clientName: j.clientName,
          poCount: j.poCount,
          approvedJobValue: maskExecutive ? 0 : roundFinancial(j.approvedJobValue, 2).toNumber(),
          draftPoValue: maskExecutive ? 0 : roundFinancial(j.draftPoValue, 2).toNumber(),
          committedPoValue: maskExecutive ? 0 : roundFinancial(j.committedPoValue, 2).toNumber(),
          actualInvoicedValue: maskExecutive ? 0 : roundFinancial(j.actualInvoicedValue, 2).toNumber(),
          remainingUncommitted: maskExecutive ? 0 : roundFinancial(remainingUncommitted, 2).toNumber(),
          commitmentUtilizationPercent: maskExecutive ? 0 : Number(utilization.toFixed(1)),
        };
      })
      .sort((a, b) => b.committedPoValue - a.committedPoValue);

    return NextResponse.json({
      success: true,
      data: {
        orders: serializedOrders,
        departmentBreakdown,
        jobBudgetComparison,
      },
      meta: {
        visibilityScope: scope,
        canViewFinancials,
      },
    });
  } catch (err: any) {
    console.error("GET /api/purchase-orders/reports error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to generate PO reports." },
      { status: 500 }
    );
  }
}
