import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import { generateProcessedQuotationWorkbook } from "@/lib/excel-generator";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Unauthorized access. Please log in." },
      { status: 401 }
    );
  }

  const isAuthorized = await checkSessionPermission(session, "jobs", "view");
  if (!isAuthorized) {
    return NextResponse.json(
      { success: false, error: "Forbidden: You do not have permission to export jobs." },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        costCategories: {
          orderBy: { sortOrder: "asc" },
          include: {
            items: { orderBy: { sortOrder: "asc" } },
          },
        },
        costItems: { orderBy: { sortOrder: "asc" } },
        costSummary: true,
      },
    });

    if (!job) {
      return NextResponse.json(
        { success: false, error: `Job with ID "${id}" was not found.` },
        { status: 404 }
      );
    }

    const formattedJob: any = {
      ...job,
      costCategories: job.costCategories,
      costItems: job.costItems,
      costSummary: job.costSummary,
    };

    const wb = generateProcessedQuotationWorkbook(
      formattedJob,
      job.costCategories as any,
      job.costItems as any,
      job.costSummary as any
    );

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const safeJobCode = (job.jobCode || "JOB").replace(/[^a-zA-Z0-9_-]/g, "_");
    const fileName = `${safeJobCode}_Processed_Cost_Breakdown.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch (err: any) {
    console.error(`GET /api/jobs/${id}/export/excel error:`, err);
    return NextResponse.json(
      { success: false, error: "Failed to generate Excel export." },
      { status: 500 }
    );
  }
}
