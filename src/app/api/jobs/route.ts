import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jobCreateSchema } from "@/lib/validations/job";
import { logAuditEvent } from "@/lib/audit";
import { checkSessionPermission } from "@/lib/permissions";

// GET /api/jobs
// Query params: ?status=active|trash|all&search=term&page=1&limit=50
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
      { success: false, error: "Forbidden: You do not have permission to view jobs." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status") ?? "active"; // "active" | "trash" | "all"
  const search = searchParams.get("search")?.trim() ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "100", 10)));
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};

  if (statusParam === "active") {
    where.deletedAt = null;
  } else if (statusParam === "trash") {
    where.deletedAt = { not: null };
  }
  // if "all", do not restrict deletedAt

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { jobCode: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { remarks: { contains: search, mode: "insensitive" } },
    ];
  }

  try {
    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: {
          documents: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.job.count({ where }),
    ]);

    // Format jobs to match UI interface
    const formattedJobs = jobs.map((j) => ({
      id: j.id,
      jobCode: j.jobCode,
      name: j.name,
      date: j.date,
      description: j.description || "",
      remarks: j.remarks || "",
      status: j.status,
      supplierIds: j.supplierIds || [],
      createdAt: j.createdAt.toISOString().split("T")[0],
      deletedAt: j.deletedAt ? j.deletedAt.toISOString() : null,
      isDeleted: j.deletedAt !== null,
      documents: j.documents.map((doc) => ({
        id: doc.id,
        jobId: doc.jobId,
        fileName: doc.fileName,
        customName: doc.customName || doc.fileName,
        fileDate: doc.fileDate || doc.createdAt.toISOString().split("T")[0],
        fileSize: doc.fileSize,
        fileType: doc.fileType || "",
        fileUrl: doc.fileUrl,
        storagePath: doc.storagePath,
        status: doc.status,
        uploadDateTime: doc.createdAt.toISOString(),
      })),
    }));

    return NextResponse.json({
      success: true,
      data: formattedJobs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error("GET /api/jobs error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to retrieve jobs from database." },
      { status: 500 }
    );
  }
}

// POST /api/jobs
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Unauthorized access. Please log in." },
      { status: 401 }
    );
  }

  const isAuthorized = await checkSessionPermission(session, "jobs", "create");
  if (!isAuthorized) {
    return NextResponse.json(
      { success: false, error: "Forbidden: You do not have permission to create jobs." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  const parseResult = jobCreateSchema.safeParse(body);
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

  const { name, jobCode: providedCode, date, description, remarks, status, supplierIds, documents } =
    parseResult.data;

  try {
    // Generate unique jobCode if not provided
    let jobCode = providedCode;
    if (!jobCode) {
      const year = new Date().getFullYear();
      const count = await prisma.job.count();
      let candidate = `JOB-${year}-${String(count + 1).padStart(3, "0")}`;
      let exists = await prisma.job.findUnique({ where: { jobCode: candidate } });
      let offset = 2;
      while (exists) {
        candidate = `JOB-${year}-${String(count + offset).padStart(3, "0")}`;
        exists = await prisma.job.findUnique({ where: { jobCode: candidate } });
        offset++;
      }
      jobCode = candidate;
    } else {
      const existing = await prisma.job.findUnique({ where: { jobCode } });
      if (existing) {
        return NextResponse.json(
          { success: false, error: `Job code "${jobCode}" already exists. Please choose a unique code.` },
          { status: 409 }
        );
      }
    }

    const todayDate = date || new Date().toISOString().split("T")[0];

    // Create the job record along with any initial documents
    const newJob = await prisma.job.create({
      data: {
        name,
        jobCode,
        date: todayDate,
        description: description || null,
        remarks: remarks || null,
        status: status || "Active",
        supplierIds: supplierIds || [],
        documents: documents && documents.length > 0
          ? {
              create: documents.map((d) => ({
                fileName: d.fileName,
                customName: d.customName || d.fileName,
                fileDate: d.fileDate || todayDate,
                fileSize: d.fileSize || "100 KB",
                fileType: d.fileType || d.fileName.split(".").pop()?.toLowerCase() || "",
                fileUrl: d.fileUrl,
                storagePath: d.storagePath,
                status: d.status || "Processed",
              })),
            }
          : undefined,
      },
      include: {
        documents: true,
      },
    });

    // Audit log
    await logAuditEvent({
      userId: session.userId,
      action: "CREATE_JOB",
      resource: "jobs",
      resourceId: newJob.id,
      details: {
        jobCode: newJob.jobCode,
        name: newJob.name,
        documentsCount: newJob.documents.length,
      },
    });

    const formattedJob = {
      id: newJob.id,
      jobCode: newJob.jobCode,
      name: newJob.name,
      date: newJob.date,
      description: newJob.description || "",
      remarks: newJob.remarks || "",
      status: newJob.status,
      supplierIds: newJob.supplierIds,
      createdAt: newJob.createdAt.toISOString().split("T")[0],
      deletedAt: null,
      isDeleted: false,
      documents: newJob.documents.map((d) => ({
        id: d.id,
        jobId: d.jobId,
        fileName: d.fileName,
        customName: d.customName,
        fileDate: d.fileDate,
        fileSize: d.fileSize,
        fileType: d.fileType,
        fileUrl: d.fileUrl,
        storagePath: d.storagePath,
        status: d.status,
        uploadDateTime: d.createdAt.toISOString(),
      })),
    };

    return NextResponse.json(
      {
        success: true,
        message: `Job "${newJob.name}" (${newJob.jobCode}) successfully created.`,
        data: formattedJob,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("POST /api/jobs error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to create job in database." },
      { status: 500 }
    );
  }
}
