import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";
import { buildRecordVisibilityFilter } from "@/lib/data-visibility";
import { PO_ELIGIBLE_FOR_INVOICE_STATUSES, PO_STATUSES } from "@/lib/po-financial";

// GET /api/dashboard/stats
// Returns real-time database aggregations for the Executive Dashboard
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access. Please log in." },
        { status: 401 }
      );
    }

    const isAuthorized = await checkSessionPermission(session, "dashboard", "view");
    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, error: "Forbidden: You do not have permission to view the dashboard." },
        { status: 403 }
      );
    }

    const canViewFinancials = await checkSessionPermission(session, "dashboard", "viewFinancials");
    const [canViewPos, canViewPoFinancials] = await Promise.all([
      checkSessionPermission(session, "purchaseOrders", "view"),
      checkSessionPermission(session, "purchaseOrders", "viewFinancials"),
    ]);

    // 1. Resolve record visibility filters for jobs and supplier invoices
    const jobVis = await buildRecordVisibilityFilter(session, "jobs", "submittedById");
    const invVis = await buildRecordVisibilityFilter(session, "supplierInvoices", "createdById");

    const baseJobWhere: any = {
      deletedAt: null,
      ...(jobVis.filter.submittedById
        ? { submittedById: jobVis.filter.submittedById }
        : jobVis.filter.OR
        ? { OR: jobVis.filter.OR }
        : {}),
    };

    const baseInvWhere: any = {
      deletedAt: null,
      status: { not: "CANCELLED" },
      ...(invVis.filter.createdById
        ? { createdById: invVis.filter.createdById }
        : invVis.filter.OR
        ? { OR: invVis.filter.OR }
        : {}),
    };

    const [
      totalJobs,
      pendingJobs,
      approvedJobs,
      rejectedJobs,
      totalSuppliers,
      activeSupplierInvoicesCount,
      supplierInvoicesAgg,
      distinctJobsWithInvoices,
      approvedJobsQuotation,
    ] = await Promise.all([
      // 1. Total Jobs (non-deleted, scoped)
      prisma.job.count({
        where: baseJobWhere,
      }),

      // 2. Pending Jobs (PENDING_APPROVAL, PENDING, DRAFT, IN REVIEW)
      prisma.job.count({
        where: {
          ...baseJobWhere,
          status: { in: ["PENDING_APPROVAL", "Pending Approval", "Pending", "DRAFT", "Draft", "IN REVIEW", "In Review"] },
        },
      }),

      // 3. Approved Jobs (APPROVED, Approved, ACTIVE, Active, INVOICED, Invoiced)
      prisma.job.count({
        where: {
          ...baseJobWhere,
          status: { in: ["APPROVED", "Approved", "ACTIVE", "Active", "INVOICED", "Invoiced"] },
        },
      }),

      // 4. Rejected Jobs (REJECTED, Rejected)
      prisma.job.count({
        where: {
          ...baseJobWhere,
          status: { in: ["REJECTED", "Rejected"] },
        },
      }),

      // 5. Total Suppliers (non-deleted)
      prisma.supplier.count({
        where: { deletedAt: null },
      }),

      // 6. Total Supplier Invoices (active, not cancelled, scoped)
      prisma.supplierInvoice.count({
        where: baseInvWhere,
      }),

      // 7. Total Supplier Invoice Amount (active sum, scoped)
      prisma.supplierInvoice.aggregate({
        where: baseInvWhere,
        _sum: {
          totalAmount: true,
        },
      }),

      // 8. Distinct Jobs With Active Supplier Invoices (scoped)
      prisma.supplierInvoice.groupBy({
        by: ["jobId"],
        where: {
          ...baseInvWhere,
          job: { deletedAt: null },
        },
      }),

      // 9. Approved Jobs Quotation Value (scoped)
      prisma.job.aggregate({
        where: {
          ...baseJobWhere,
          status: { in: ["APPROVED", "Approved", "ACTIVE", "Active", "INVOICED", "Invoiced"] },
        },
        _sum: {
          grandTotal: true,
          totalCost: true,
        },
      }),
    ]);

    const jobsWithSupplierInvoices = distinctJobsWithInvoices.length;
    const jobsWithoutSupplierInvoices = Math.max(0, totalJobs - jobsWithSupplierInvoices);

    // If user lacks financial viewing permission, zero out sensitive dollar figures
    const totalSupplierInvoiceAmount = canViewFinancials
      ? Number(supplierInvoicesAgg._sum.totalAmount || 0)
      : 0;
    const totalActualJobCosts = totalSupplierInvoiceAmount;

    const totalApprovedJobValue = canViewFinancials
      ? Number(approvedJobsQuotation._sum.grandTotal || approvedJobsQuotation._sum.totalCost || 0)
      : 0;

    const totalRecordedGrossProfit = canViewFinancials
      ? totalApprovedJobValue - totalActualJobCosts
      : 0;

    // Optional: Employee-wise statistics for Supervisors and Admins
    let employeeStats: Array<{
      userId: string;
      name: string;
      email: string;
      jobCount: number;
      invoiceCount: number;
      totalInvoiceAmount: number;
    }> = [];

    if (jobVis.scope === "team" || jobVis.scope === "all") {
      try {
        const [jobGroups, invoiceGroups, activeUsers] = await Promise.all([
          prisma.job.groupBy({
            by: ["submittedById"],
            where: { deletedAt: null },
            _count: { id: true },
          }),
          prisma.supplierInvoice.groupBy({
            by: ["createdById"],
            where: { deletedAt: null, status: { not: "CANCELLED" } },
            _count: { id: true },
            _sum: { totalAmount: true },
          }),
          prisma.user.findMany({
            where: { deletedAt: null },
            select: { id: true, name: true, email: true },
          }),
        ]);

        const userMap = new Map<string, { name: string; email: string }>();
        activeUsers.forEach((u) => userMap.set(u.id, { name: u.name, email: u.email }));

        const authorizedSet = jobVis.authorizedIds ? new Set(jobVis.authorizedIds) : null;

        activeUsers.forEach((u) => {
          if (authorizedSet && !authorizedSet.has(u.id)) return;

          const jg = jobGroups.find((g) => g.submittedById === u.id);
          const ig = invoiceGroups.find((g) => g.createdById === u.id);

          employeeStats.push({
            userId: u.id,
            name: u.name,
            email: u.email,
            jobCount: jg?._count?.id || 0,
            invoiceCount: ig?._count?.id || 0,
            totalInvoiceAmount: canViewFinancials ? Number(ig?._sum?.totalAmount || 0) : 0,
          });
        });
      } catch (empErr) {
        console.warn("Could not generate employee-wise dashboard stats:", empErr);
      }
    }

    let poStats:
      | {
          totalPurchaseOrders: number;
          pendingPoApprovals: number;
          committedPoValue: number;
          openPoDeliveries: number;
        }
      | undefined;

    if (canViewPos) {
      try {
        const poVis = await buildRecordVisibilityFilter(session, "purchaseOrders", "createdById");
        const basePoWhere: any = {
          deletedAt: null,
          ...(poVis.filter.createdById
            ? { createdById: poVis.filter.createdById }
            : poVis.filter.OR
            ? { OR: poVis.filter.OR }
            : {}),
        };

        const [totalPurchaseOrders, pendingPoApprovals, committedPoAgg, openPoDeliveries] =
          await Promise.all([
            prisma.purchaseOrder.count({ where: basePoWhere }),
            prisma.purchaseOrder.count({
              where: { ...basePoWhere, status: PO_STATUSES.PENDING },
            }),
            prisma.purchaseOrder.aggregate({
              where: {
                ...basePoWhere,
                status: {
                  in: PO_ELIGIBLE_FOR_INVOICE_STATUSES,
                },
              },
              _sum: { grandTotal: true },
            }),
            prisma.purchaseOrder.count({
              where: {
                ...basePoWhere,
                status: {
                  in: [
                    PO_STATUSES.APPROVED,
                    PO_STATUSES.ISSUED,
                    PO_STATUSES.PARTIALLY_DELIVERED,
                  ],
                },
              },
            }),
          ]);

        poStats = {
          totalPurchaseOrders,
          pendingPoApprovals,
          committedPoValue:
            canViewFinancials && canViewPoFinancials
              ? Number(committedPoAgg._sum.grandTotal || 0)
              : 0,
          openPoDeliveries,
        };
      } catch (poErr) {
        console.warn("Could not generate PO dashboard stats:", poErr);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        totalJobs,
        pendingJobs,
        approvedJobs,
        rejectedJobs,
        totalSuppliers,
        totalSupplierInvoices: activeSupplierInvoicesCount,
        totalSupplierInvoiceAmount,
        jobsWithSupplierInvoices,
        jobsWithoutSupplierInvoices,
        totalActualJobCosts,
        totalApprovedJobValue,
        totalRecordedGrossProfit,
        pendingApprovalsCount: pendingJobs,
        canViewFinancials,
        visibilityScope: jobVis.scope,
        poStats,
        employeeStats,
      },
    });
  } catch (err: any) {
    console.error("GET /api/dashboard/stats error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to retrieve dashboard statistics." },
      { status: 500 }
    );
  }
}
