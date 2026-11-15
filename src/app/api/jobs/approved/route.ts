import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";
import { buildRecordVisibilityFilter } from "@/lib/data-visibility";
import { Decimal, roundFinancial, toDecimal } from "@/lib/financial";
import { SUPPLIER_INVOICE_ELIGIBLE_JOB_STATUSES } from "@/lib/supplier-invoice-helpers";

// GET /api/jobs/approved
// Returns visible APPROVED Jobs with calculated supplier invoice expenses and remaining budget
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access. Please log in." },
        { status: 401 }
      );
    }

    const canAccess =
      (await checkSessionPermission(session, "supplierInvoices", "create")) ||
      (await checkSessionPermission(session, "supplierInvoices", "view")) ||
      (await checkSessionPermission(session, "supplierInvoices", "edit")) ||
      (await checkSessionPermission(session, "jobs", "view"));

    if (!canAccess) {
      return NextResponse.json(
        { success: false, error: "Forbidden: You do not have permission to view approved jobs." },
        { status: 403 }
      );
    }

    const db = getPrisma();
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() || "";

    const { filter: visibilityFilter } = await buildRecordVisibilityFilter(
      session,
      "jobs",
      "submittedById"
    );

    const where: any = {
      deletedAt: null,
      status: {
        in: SUPPLIER_INVOICE_ELIGIBLE_JOB_STATUSES,
      },
    };

    if (visibilityFilter.submittedById) {
      where.submittedById = visibilityFilter.submittedById;
    } else if (visibilityFilter.OR) {
      where.OR = visibilityFilter.OR;
    }

    if (search) {
      const searchConditions = [
        { jobCode: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
        { clientName: { contains: search, mode: "insensitive" } },
        { handledBy: { contains: search, mode: "insensitive" } },
      ];

      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchConditions }];
        delete where.OR;
      } else {
        where.OR = searchConditions;
      }
    }

    const jobs = await (db.job as any).findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        jobCode: true,
        name: true,
        date: true,
        commencingDate: true,
        clientName: true,
        handledBy: true,
        description: true,
        remarks: true,
        status: true,
        totalCost: true,
        grandTotal: true,
        createdAt: true,
        _count: {
          select: { costItems: true },
        },
        supplierInvoices: {
          where: {
            deletedAt: null,
            status: { not: "CANCELLED" },
          },
          select: {
            id: true,
            totalAmount: true,
          },
        },
      },
    });

    const formattedJobs = jobs.map((job: any) => {
      const approvedDec = roundFinancial(job.grandTotal || job.totalCost || 0, 2);
      const supplierCostDec = roundFinancial(
        (job.supplierInvoices || []).reduce(
          (sum: Decimal, inv: any) => sum.plus(toDecimal(inv.totalAmount)),
          new Decimal(0)
        ),
        2
      );
      const remainingDec = roundFinancial(approvedDec.minus(supplierCostDec), 2);
      const utilizationDec = approvedDec.gt(0)
        ? Decimal.min(100, supplierCostDec.div(approvedDec).mul(100)).toDecimalPlaces(2)
        : new Decimal(0);

      return {
        id: job.id,
        jobCode: job.jobCode,
        name: job.name,
        date: job.date,
        commencingDate: job.commencingDate || job.date,
        clientName: job.clientName || "Valued Client",
        handledBy: job.handledBy || "Admin",
        description: job.description || "",
        remarks: job.remarks || "",
        status: job.status,
        originalApprovedCost: approvedDec.toNumber(),
        currentSupplierCost: supplierCostDec.toNumber(),
        remainingBudget: remainingDec.toNumber(),
        costUtilization: utilizationDec.toNumber(),
        isBudgetExceeded: supplierCostDec.gt(approvedDec),
        supplierInvoicesCount: job.supplierInvoices?.length || 0,
        costItemsCount: job._count?.costItems || 0,
      };
    });

    return NextResponse.json({
      success: true,
      data: formattedJobs,
    });
  } catch (err: any) {
    console.error("GET /api/jobs/approved error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error fetching approved jobs." },
      { status: 500 }
    );
  }
}
