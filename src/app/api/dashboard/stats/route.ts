import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";

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
      // 1. Total Jobs (non-deleted)
      prisma.job.count({
        where: { deletedAt: null },
      }),

      // 2. Pending Jobs (PENDING_APPROVAL, PENDING, DRAFT, IN REVIEW)
      prisma.job.count({
        where: {
          deletedAt: null,
          status: { in: ["PENDING_APPROVAL", "Pending Approval", "Pending", "DRAFT", "Draft", "IN REVIEW", "In Review"] },
        },
      }),

      // 3. Approved Jobs (APPROVED, Approved, ACTIVE, Active, INVOICED, Invoiced)
      prisma.job.count({
        where: {
          deletedAt: null,
          status: { in: ["APPROVED", "Approved", "ACTIVE", "Active", "INVOICED", "Invoiced"] },
        },
      }),

      // 4. Rejected Jobs (REJECTED, Rejected)
      prisma.job.count({
        where: {
          deletedAt: null,
          status: { in: ["REJECTED", "Rejected"] },
        },
      }),

      // 5. Total Suppliers (non-deleted)
      prisma.supplier.count({
        where: { deletedAt: null },
      }),

      // 6. Total Supplier Invoices (active, not cancelled)
      prisma.supplierInvoice.count({
        where: {
          deletedAt: null,
          status: { not: "CANCELLED" },
        },
      }),

      // 7. Total Supplier Invoice Amount (active sum)
      prisma.supplierInvoice.aggregate({
        where: {
          deletedAt: null,
          status: { not: "CANCELLED" },
        },
        _sum: {
          totalAmount: true,
        },
      }),

      // 8. Distinct Jobs With Active Supplier Invoices
      prisma.supplierInvoice.groupBy({
        by: ["jobId"],
        where: {
          deletedAt: null,
          status: { not: "CANCELLED" },
          job: { deletedAt: null },
        },
      }),

      // 9. Approved Jobs Quotation Value (for Gross Profit calculation)
      prisma.job.aggregate({
        where: {
          deletedAt: null,
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

    const totalSupplierInvoiceAmount = Number(supplierInvoicesAgg._sum.totalAmount || 0);
    const totalActualJobCosts = totalSupplierInvoiceAmount;

    const totalApprovedJobValue = Number(
      approvedJobsQuotation._sum.grandTotal || approvedJobsQuotation._sum.totalCost || 0
    );

    // Total Recorded Gross Profit = Total Approved Job Value - Total Actual Job Costs (Supplier Invoices)
    const totalRecordedGrossProfit = totalApprovedJobValue - totalActualJobCosts;

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
