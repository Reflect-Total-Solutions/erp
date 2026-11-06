import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { uploadToSupabaseStorage, deleteFromSupabaseStorage } from "@/lib/supabase";
import { checkSessionPermission } from "@/lib/permissions";
import { canUserAccessRecord } from "@/lib/data-visibility";

// GET /api/jobs/[id]/documents
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

  const { id } = await params;

  try {
    const job = await prisma.job.findUnique({
      where: { id },
      select: { id: true, submittedById: true },
    });

    if (!job) {
      return NextResponse.json(
        { success: false, error: "Job not found." },
        { status: 404 }
      );
    }

    const accessCheck = await canUserAccessRecord(session, "jobs", job.submittedById, "view");
    if (!accessCheck.allowed) {
      return NextResponse.json(
        { success: false, error: accessCheck.reason || "Forbidden: You cannot access documents for this job." },
        { status: 403 }
      );
    }

    const documents = await prisma.jobDocument.findMany({
      where: {
        jobId: id,
        deletedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      data: documents.map((d) => ({
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
    });
  } catch (err: any) {
    console.error(`GET /api/jobs/${id}/documents error:`, err);
    return NextResponse.json(
      { success: false, error: "Failed to retrieve job documents." },
      { status: 500 }
    );
  }
}

// POST /api/jobs/[id]/documents
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
      { success: false, error: "Forbidden: You do not have permission to attach documents to jobs." },
      { status: 403 }
    );
  }

  const { id: jobId } = await params;

  try {
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      return NextResponse.json(
        { success: false, error: `Job with ID "${jobId}" not found.` },
        { status: 404 }
      );
    }

    const editCheck = await canUserAccessRecord(session, "jobs", job.submittedById, "edit");
    if (!editCheck.allowed) {
      return NextResponse.json(
        { success: false, error: editCheck.reason || "Forbidden: You cannot upload documents for this job." },
        { status: 403 }
      );
    }

    const contentType = req.headers.get("content-type") || "";

    // Multipart upload
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const files = formData.getAll("file") as File[];
      const extraFiles = formData.getAll("files") as File[];
      const allFiles = [...files, ...extraFiles].filter((f) => f && typeof f.arrayBuffer === "function");

      if (allFiles.length === 0) {
        return NextResponse.json(
          { success: false, error: "No files provided in upload." },
          { status: 400 }
        );
      }

      const customName = (formData.get("customName") as string) || undefined;
      const fileDate = (formData.get("fileDate") as string) || new Date().toISOString().split("T")[0];

      const createdDocs = [];

      for (const file of allFiles) {
        const buffer = Buffer.from(await file.arrayBuffer());
        const uploadRes = await uploadToSupabaseStorage({
          buffer,
          originalName: file.name,
          folder: `jobs/${jobId}`,
          contentType: file.type || undefined,
        });

        if (!uploadRes.success) {
          return NextResponse.json(
            { success: false, error: `Upload error: ${uploadRes.error}` },
            { status: 500 }
          );
        }

        const docRecord = await prisma.jobDocument.create({
          data: {
            jobId,
            fileName: file.name,
            customName: customName || file.name,
            fileDate,
            fileSize: uploadRes.fileSize,
            fileType: file.name.split(".").pop()?.toLowerCase() || "",
            fileUrl: uploadRes.fileUrl,
            storagePath: uploadRes.storagePath,
            status: "Processed",
            uploadedById: session.userId,
          },
        });

        createdDocs.push({
          id: docRecord.id,
          jobId: docRecord.jobId,
          fileName: docRecord.fileName,
          customName: docRecord.customName,
          fileDate: docRecord.fileDate,
          fileSize: docRecord.fileSize,
          fileType: docRecord.fileType,
          fileUrl: docRecord.fileUrl,
          storagePath: docRecord.storagePath,
          status: docRecord.status,
          uploadDateTime: docRecord.createdAt.toISOString(),
        });
      }

      return NextResponse.json({
        success: true,
        message: `${createdDocs.length} document(s) uploaded to Supabase Storage and attached to Job.`,
        data: createdDocs,
      });
    }

    // JSON upload with pre-uploaded Supabase URLs
    const body = await req.json();
    const { fileName, customName, fileDate, fileSize, fileType, fileUrl, storagePath } = body;

    if (!fileName || !fileUrl) {
      return NextResponse.json(
        { success: false, error: "fileName and fileUrl are required." },
        { status: 400 }
      );
    }

    const docRecord = await prisma.jobDocument.create({
      data: {
        jobId,
        fileName,
        customName: customName || fileName,
        fileDate: fileDate || new Date().toISOString().split("T")[0],
        fileSize: fileSize || "100 KB",
        fileType: fileType || fileName.split(".").pop()?.toLowerCase() || "",
        fileUrl,
        storagePath: storagePath || null,
        status: "Processed",
      },
    });

    return NextResponse.json({
      success: true,
      message: `Document "${docRecord.fileName}" linked to Job.`,
      data: {
        id: docRecord.id,
        jobId: docRecord.jobId,
        fileName: docRecord.fileName,
        customName: docRecord.customName,
        fileDate: docRecord.fileDate,
        fileSize: docRecord.fileSize,
        fileType: docRecord.fileType,
        fileUrl: docRecord.fileUrl,
        storagePath: docRecord.storagePath,
        status: docRecord.status,
        uploadDateTime: docRecord.createdAt.toISOString(),
      },
    });
  } catch (err: any) {
    console.error(`POST /api/jobs/${jobId}/documents error:`, err);
    return NextResponse.json(
      { success: false, error: "Failed to attach document." },
      { status: 500 }
    );
  }
}

// DELETE /api/jobs/[id]/documents
// Query param: ?documentId=...
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

  const isAuthorized = await checkSessionPermission(session, "jobs", "edit");
  if (!isAuthorized) {
    return NextResponse.json(
      { success: false, error: "Forbidden: You do not have permission to remove documents." },
      { status: 403 }
    );
  }

  const { id: jobId } = await params;
  const { searchParams } = new URL(req.url);
  const documentId = searchParams.get("documentId");

  if (!documentId) {
    return NextResponse.json(
      { success: false, error: "Missing documentId parameter." },
      { status: 400 }
    );
  }

  try {
    const doc = await prisma.jobDocument.findFirst({
      where: { id: documentId, jobId },
    });

    if (!doc) {
      return NextResponse.json(
        { success: false, error: "Document not found on this job." },
        { status: 404 }
      );
    }

    // Delete record from DB
    await prisma.jobDocument.delete({ where: { id: documentId } });

    // Remove from Supabase Storage if storagePath exists
    if (doc.storagePath) {
      await deleteFromSupabaseStorage(doc.storagePath);
    }

    return NextResponse.json({
      success: true,
      message: `Document "${doc.fileName}" removed.`,
    });
  } catch (err: any) {
    console.error(`DELETE /api/jobs/${jobId}/documents error:`, err);
    return NextResponse.json(
      { success: false, error: "Failed to delete document." },
      { status: 500 }
    );
  }
}
