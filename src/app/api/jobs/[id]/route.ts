import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jobUpdateSchema } from "@/lib/validations/job";
import { logAuditEvent } from "@/lib/audit";
import { checkSessionPermission } from "@/lib/permissions";

// GET /api/jobs/[id]
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
      { success: false, error: "Forbidden: You do not have permission to view this job." },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        documents: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!job) {
      return NextResponse.json(
        { success: false, error: `Job with ID "${id}" was not found.` },
        { status: 404 }
      );
    }

    // Fetch assigned suppliers
    const suppliers = await prisma.supplier.findMany({
      where: {
        id: { in: job.supplierIds },
        deletedAt: null,
      },
    });

    const formattedJob = {
      id: job.id,
      jobCode: job.jobCode,
      name: job.name,
      date: job.date,
      description: job.description || "",
      remarks: job.remarks || "",
      status: job.status,
      supplierIds: job.supplierIds,
      createdAt: job.createdAt.toISOString().split("T")[0],
      deletedAt: job.deletedAt ? job.deletedAt.toISOString() : null,
      isDeleted: job.deletedAt !== null,
      suppliers,
      documents: job.documents.map((d) => ({
        id: d.id,
        jobId: d.jobId,
        fileName: d.fileName,
        customName: d.customName || d.fileName,
        fileDate: d.fileDate || d.createdAt.toISOString().split("T")[0],
        fileSize: d.fileSize,
        fileType: d.fileType || "",
        fileUrl: d.fileUrl,
        storagePath: d.storagePath,
        status: d.status,
        uploadDateTime: d.createdAt.toISOString(),
      })),
    };

    return NextResponse.json({
      success: true,
      data: formattedJob,
    });
  } catch (err: any) {
    console.error(`GET /api/jobs/${id} error:`, err);
    return NextResponse.json(
      { success: false, error: "Failed to retrieve job details." },
      { status: 500 }
    );
  }
}

// PUT /api/jobs/[id]
export async function PUT(
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
      { success: false, error: "Forbidden: You do not have permission to edit jobs." },
      { status: 403 }
    );
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  const parseResult = jobUpdateSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Validation failed",
        issues: parseResult.error.flatten().fieldErrors,
      },
      { status: 422 }
    );
  }

  try {
    const existing = await prisma.job.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: `Job with ID "${id}" was not found.` },
        { status: 404 }
      );
    }

    const { name, jobCode, date, description, remarks, status, supplierIds } = parseResult.data;

    // Check unique jobCode if changed
    if (jobCode && jobCode !== existing.jobCode) {
      const codeTaken = await prisma.job.findUnique({ where: { jobCode } });
      if (codeTaken) {
        return NextResponse.json(
          { success: false, error: `Job code "${jobCode}" is already in use by another job.` },
          { status: 409 }
        );
      }
    }

    const updatedJob = await prisma.job.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(jobCode !== undefined && { jobCode }),
        ...(date !== undefined && { date }),
        ...(description !== undefined && { description: description || null }),
        ...(remarks !== undefined && { remarks: remarks || null }),
        ...(status !== undefined && { status }),
        ...(supplierIds !== undefined && { supplierIds }),
      },
      include: {
        documents: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    await logAuditEvent({
      userId: session.userId,
      action: "UPDATE_JOB",
      resource: "jobs",
      resourceId: updatedJob.id,
      details: {
        name: updatedJob.name,
        jobCode: updatedJob.jobCode,
        status: updatedJob.status,
      },
    });

    const formattedJob = {
      id: updatedJob.id,
      jobCode: updatedJob.jobCode,
      name: updatedJob.name,
      date: updatedJob.date,
      description: updatedJob.description || "",
      remarks: updatedJob.remarks || "",
      status: updatedJob.status,
      supplierIds: updatedJob.supplierIds,
      createdAt: updatedJob.createdAt.toISOString().split("T")[0],
      deletedAt: updatedJob.deletedAt ? updatedJob.deletedAt.toISOString() : null,
      isDeleted: updatedJob.deletedAt !== null,
      documents: updatedJob.documents.map((d) => ({
        id: d.id,
        jobId: d.jobId,
        fileName: d.fileName,
        customName: d.customName || d.fileName,
        fileDate: d.fileDate || d.createdAt.toISOString().split("T")[0],
        fileSize: d.fileSize,
        fileType: d.fileType || "",
        fileUrl: d.fileUrl,
        storagePath: d.storagePath,
        status: d.status,
        uploadDateTime: d.createdAt.toISOString(),
      })),
    };

    return NextResponse.json({
      success: true,
      message: `Job "${updatedJob.name}" updated successfully.`,
      data: formattedJob,
    });
  } catch (err: any) {
    console.error(`PUT /api/jobs/${id} error:`, err);
    return NextResponse.json(
      { success: false, error: "Failed to update job record." },
      { status: 500 }
    );
  }
}

// DELETE /api/jobs/[id]
// Supports ?permanent=true for hard delete, otherwise soft delete
export async function DELETE(
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

  const isAuthorized = await checkSessionPermission(session, "jobs", "delete");
  if (!isAuthorized) {
    return NextResponse.json(
      { success: false, error: "Forbidden: You do not have permission to delete jobs." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const permanent = searchParams.get("permanent") === "true";

  try {
    const existing = await prisma.job.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: `Job with ID "${id}" was not found.` },
        { status: 404 }
      );
    }

    if (permanent) {
      // Hard delete from DB
      await prisma.job.delete({ where: { id } });

      await logAuditEvent({
        userId: session.userId,
        action: "PERMANENT_DELETE_JOB",
        resource: "jobs",
        resourceId: id,
        details: { name: existing.name, jobCode: existing.jobCode },
      });

      return NextResponse.json({
        success: true,
        message: `Job "${existing.name}" permanently deleted.`,
      });
    } else {
      // Soft delete
      const deletedJob = await prisma.job.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      await logAuditEvent({
        userId: session.userId,
        action: "SOFT_DELETE_JOB",
        resource: "jobs",
        resourceId: id,
        details: { name: existing.name, jobCode: existing.jobCode },
      });

      return NextResponse.json({
        success: true,
        message: `Job "${deletedJob.name}" moved to trash.`,
      });
    }
  } catch (err: any) {
    console.error(`DELETE /api/jobs/${id} error:`, err);
    return NextResponse.json(
      { success: false, error: "Failed to delete job." },
      { status: 500 }
    );
  }
}
