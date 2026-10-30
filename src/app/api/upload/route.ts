import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadToSupabaseStorage } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access. Please log in." },
        { status: 401 }
      );
    }

    const formData = await req.formData();
    const files = formData.getAll("file") as File[];
    const extraFiles = formData.getAll("files") as File[];
    const allFiles = [...files, ...extraFiles].filter((f) => f && typeof f.arrayBuffer === "function");

    if (allFiles.length === 0) {
      return NextResponse.json(
        { success: false, error: "No files provided in upload request." },
        { status: 400 }
      );
    }

    const folder = (formData.get("folder") as string) || "jobs";
    const jobId = (formData.get("jobId") as string) || undefined;
    const customName = (formData.get("customName") as string) || undefined;
    const fileDate = (formData.get("fileDate") as string) || new Date().toISOString().split("T")[0];

    const results = [];

    for (const file of allFiles) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const uploadRes = await uploadToSupabaseStorage({
        buffer,
        originalName: file.name,
        folder: jobId ? `jobs/${jobId}` : folder,
        contentType: file.type || undefined,
      });

      if (!uploadRes.success) {
        return NextResponse.json(
          {
            success: false,
            error: `Failed to upload "${file.name}" to Supabase: ${uploadRes.error}`,
          },
          { status: 500 }
        );
      }

      // If a jobId was provided and the job exists, also persist the JobDocument record in PostgreSQL
      let documentRecord = null;
      if (jobId) {
        const fileExt = file.name.split(".").pop()?.toLowerCase() || "";
        documentRecord = await prisma.jobDocument.create({
          data: {
            jobId,
            fileName: file.name,
            customName: customName || file.name,
            fileDate,
            fileSize: uploadRes.fileSize,
            fileType: fileExt,
            fileUrl: uploadRes.fileUrl,
            storagePath: uploadRes.storagePath,
            status: "Processed",
          },
        });
      }

      results.push({
        fileName: file.name,
        fileUrl: uploadRes.fileUrl,
        storagePath: uploadRes.storagePath,
        fileSize: uploadRes.fileSize,
        fileType: file.name.split(".").pop()?.toLowerCase() || "",
        documentId: documentRecord?.id,
      });
    }

    return NextResponse.json({
      success: true,
      message: `${results.length} document(s) successfully uploaded to Supabase Storage.`,
      files: results,
    });
  } catch (err: any) {
    console.error("POST /api/upload error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error during document upload." },
      { status: 500 }
    );
  }
}
