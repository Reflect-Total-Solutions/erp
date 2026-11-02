import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { Decimal } from "decimal.js";

// GET /api/reports/profit-loss
// Generates job financial summary, supplier expenses, and recorded gross profit calculations
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access. Please log in." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() || "";
    const statusFilter = searchParams.get("status") || "all";

    const where: any = {
      deletedAt: null,
    };

    if (search) {
      where.OR = [
        { jobCode: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
        { clientName: { contains: search, mode: "insensitive" } },
      ];
    }

    const jobs = await (prisma.job as any).findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        jobCode: true,
        name: true,
        date: true,
        commencingDate: true,
        clientName: true,
        status: true,
        grandTotal: true,
        totalCost: true,
        createdAt: true,
        supplierInvoices: {
          where: {
            deletedAt: null,
            status: { not: "CANCELLED" },
          },
          select: {
            id: true,
            invoiceNumber: true,
            totalAmount: true,
            status: true,
          },
        },
      },
    });

    let overallApprovedValue = new Decimal(0);
    let overallSupplierCost = new Decimal(0);
    let profitableJobsCount = 0;
    let overBudgetJobsCount = 0;

    const formattedJobs = jobs.map((job: any) => {
      const approvedJobValue = new Decimal(job.grandTotal || job.totalCost || 0);

      let totalSupplierCost = new Decimal(0);
      (job.supplierInvoices || []).forEach((inv: any) => {
        totalSupplierCost = totalSupplierCost.plus(new Decimal(inv.totalAmount || 0));
      });

      const otherCosts = new Decimal(0);
      const totalActualCost = totalSupplierCost.plus(otherCosts);
      const grossProfit = approvedJobValue.minus(totalActualCost);

      let profitMargin = 0;
      if (approvedJobValue.gt(0)) {
        profitMargin = grossProfit.dividedBy(approvedJobValue).times(100).toNumber();
      }

      overallApprovedValue = overallApprovedValue.plus(approvedJobValue);
      overallSupplierCost = overallSupplierCost.plus(totalSupplierCost);

      let financialStatus: "High Margin" | "Healthy" | "Low Margin" | "Over Budget" = "Healthy";
      if (totalActualCost.gt(approvedJobValue)) {
        financialStatus = "Over Budget";
        overBudgetJobsCount++;
      } else {
        profitableJobsCount++;
        if (profitMargin >= 50) financialStatus = "High Margin";
        else if (profitMargin >= 20) financialStatus = "Healthy";
        else financialStatus = "Low Margin";
      }

      return {
        jobId: job.id,
        jobCode: job.jobCode || "NO-CODE",
        jobName: job.name,
        clientName: job.clientName || "Valued Client",
        status: job.status,
        jobDate: job.date || "",
        approvedJobValue: approvedJobValue.toNumber(),
        totalSupplierCost: totalSupplierCost.toNumber(),
        otherCosts: otherCosts.toNumber(),
        totalActualCost: totalActualCost.toNumber(),
        grossProfit: grossProfit.toNumber(),
        profitMargin: Number(profitMargin.toFixed(2)),
        financialStatus,
        supplierInvoicesCount: job.supplierInvoices?.length || 0,
        createdAt: job.createdAt ? new Date(job.createdAt).toISOString().split("T")[0] : "",
      };
    });

    // Filter by financial status if requested
    const filteredJobs =
      statusFilter === "all"
        ? formattedJobs
        : formattedJobs.filter((j: any) => j.financialStatus.toLowerCase().replace(" ", "_") === statusFilter.toLowerCase());

    const overallGrossProfit = overallApprovedValue.minus(overallSupplierCost);
    const overallAverageMargin = overallApprovedValue.gt(0)
      ? overallGrossProfit.dividedBy(overallApprovedValue).times(100).toNumber()
      : 0;

    return NextResponse.json({
      success: true,
      data: filteredJobs,
      summary: {
        totalJobsCount: jobs.length,
        totalApprovedValue: overallApprovedValue.toNumber(),
        totalSupplierCost: overallSupplierCost.toNumber(),
        totalGrossProfit: overallGrossProfit.toNumber(),
        averageProfitMargin: Number(overallAverageMargin.toFixed(2)),
        profitableJobsCount,
        overBudgetJobsCount,
      },
    });
  } catch (err: any) {
    console.error("GET /api/reports/profit-loss error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error generating profit & loss report." },
      { status: 500 }
    );
  }
}
