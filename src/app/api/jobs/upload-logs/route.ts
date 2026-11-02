import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
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
      { success: false, error: "Forbidden: You do not have permission to view upload logs." },
      { status: 403 }
    );
  }

  try {
    const logs = await prisma.jobUploadLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        job: { select: { id: true, jobCode: true, name: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: logs,
    });
  } catch (err: any) {
    console.error("GET /api/jobs/upload-logs error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to retrieve upload logs." },
      { status: 500 }
    );
  }
}
