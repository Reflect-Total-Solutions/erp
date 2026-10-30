import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { checkSessionPermission } from "@/lib/permissions";

// POST /api/jobs/[id]/restore
export async function POST(
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

  const isAuthorized = await checkSessionPermission(session, "jobs", "edit");
  if (!isAuthorized) {
    return NextResponse.json(
      { success: false, error: "Forbidden: You do not have permission to restore jobs." },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    const existing = await prisma.job.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: `Job with ID "${id}" was not found.` },
        { status: 404 }
      );
    }

    const restoredJob = await prisma.job.update({
      where: { id },
      data: { deletedAt: null },
    });

    await logAuditEvent({
      userId: session.userId,
      action: "RESTORE_JOB",
      resource: "jobs",
      resourceId: id,
      details: { name: restoredJob.name, jobCode: restoredJob.jobCode },
    });

    return NextResponse.json({
      success: true,
      message: `Job "${restoredJob.name}" restored successfully.`,
      data: restoredJob,
    });
  } catch (err: any) {
    console.error(`POST /api/jobs/${id}/restore error:`, err);
    return NextResponse.json(
      { success: false, error: "Failed to restore job." },
      { status: 500 }
    );
  }
}
