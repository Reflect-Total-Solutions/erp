import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// GET /api/jobs/approved
// Returns all strictly APPROVED jobs with calculated supplier invoice expenses and remaining budget
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access. Please log in." },
        { status: 401 }
      );
    }

    const db = getPrisma();
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() || "";

    const where: any = {
      deletedAt: null,
      status: {
        in: ["APPROVED", "Approved"],
      },
    };

    if (search) {
      where.OR = [
        { jobCode: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
        { clientName: { contains: search, mode: "insensitive" } },
        { handledBy: { contains: search, mode: "insensitive" } },
      ];
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
      const originalApprovedCost = Number(job.grandTotal || job.totalCost || 0);
      const currentSupplierCost = (job.supplierInvoices || []).reduce(
        (sum: number, inv: any) => sum + Number(inv.totalAmount || 0),
        0
      );
      const remainingBudget = Math.max(0, originalApprovedCost - currentSupplierCost);
      const costUtilization =
        originalApprovedCost > 0
          ? Math.min(100, (currentSupplierCost / originalApprovedCost) * 100)
          : 0;
      const isBudgetExceeded = currentSupplierCost > originalApprovedCost;

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
        originalApprovedCost,
        currentSupplierCost,
        remainingBudget: originalApprovedCost - currentSupplierCost,
        costUtilization: Number(costUtilization.toFixed(2)),
        isBudgetExceeded,
        supplierInvoicesCount: job.supplierInvoices?.length || 0,
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
