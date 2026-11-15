import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";
import { generateProfitLossReport } from "@/lib/profit-loss-report";

// GET /api/reports/profit-loss
// Generates comprehensive Job financial analysis, cost saving/overrun, additional expenses, and net profit
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access. Please log in." },
        { status: 401 }
      );
    }

    const isAuthorized = await checkSessionPermission(session, "profitLoss", "view");
    if (!isAuthorized) {
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden: You do not have permission to view Profit & Loss reports.",
        },
        { status: 403 }
      );
    }

    const canViewFinancials = await checkSessionPermission(
      session,
      "profitLoss",
      "viewFinancials"
    );
    if (!canViewFinancials) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Forbidden: You do not have permission to view job financial metrics and profit margins.",
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const report = await generateProfitLossReport(session, {
      search: searchParams.get("search") || undefined,
      status: searchParams.get("status") || "all",
      jobStatus: searchParams.get("jobStatus") || "all",
      jobId: searchParams.get("jobId") || "all",
      clientName: searchParams.get("clientName") || "all",
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
      createdBy: searchParams.get("createdBy") || undefined,
    });

    return NextResponse.json({
      success: true,
      data: report.rows,
      summary: report.summary,
      filtersMeta: report.filtersMeta,
      permissions: report.permissions,
    });
  } catch (err: any) {
    console.error("GET /api/reports/profit-loss error:", err);
    return NextResponse.json(
      {
        success: false,
        error:
          err?.message || "Internal server error generating profit & loss report.",
      },
      { status: 500 }
    );
  }
}
