import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { parseExcelQuotation, calculateFileHash } from "@/lib/excel-parser";

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
      { success: false, error: "Forbidden: You do not have permission to upload quotation jobs." },
      { status: 403 }
    );
  }

  try {
    const formData = await req.formData();
    const files: File[] = [];

    // Support both multiple "files" or "file" form keys
    for (const [key, value] of formData.entries()) {
      if (value instanceof File && (key === "files" || key === "file" || key.startsWith("file_"))) {
        files.push(value);
      }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { success: false, error: "No files uploaded. Please attach at least one .xlsx or .xls quotation file." },
        { status: 400 }
      );
    }

    const currentJobCount = await prisma.job.count();
    const results = [];
    const seenHashesInBatch = new Map<string, string>(); // hash -> fileName

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const lowerName = file.name.toLowerCase();

      // Format validation
      if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".xls")) {
        results.push({
          fileName: file.name,
          success: false,
          error: "Invalid file format. Only .xlsx and .xls Excel files are supported.",
        });
        continue;
      }

      // Max size limit: 25 MB
      if (file.size > 25 * 1024 * 1024) {
        results.push({
          fileName: file.name,
          success: false,
          error: "File exceeds 25 MB size limit.",
        });
        continue;
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const fileHash = calculateFileHash(buffer);

      // Check within current batch first
      if (seenHashesInBatch.has(fileHash)) {
        const firstFileName = seenHashesInBatch.get(fileHash)!;
        results.push({
          fileName: file.name,
          success: true,
          fileHash,
          isDuplicate: true,
          duplicateReason: `Duplicate file detected in current upload batch (identical to "${firstFileName}").`,
          duplicateDetails: {
            originalFileName: firstFileName,
            existingJobId: "",
            existingJobNumber: "Batch Duplicate",
            existingJobTitle: `Same content as ${firstFileName}`,
            existingClientName: "N/A",
            uploadedDate: new Date().toISOString().split("T")[0],
            duplicateReason: "This Excel file is a duplicate of another file in this same upload session.",
          },
          data: null,
        });
        continue;
      }
      seenHashesInBatch.set(fileHash, file.name);

      // Check for duplicate file hash in existing database records
      const [existingJobByHash, existingDocByHash] = await Promise.all([
        prisma.job.findFirst({
          where: { fileHash, deletedAt: null },
          select: {
            id: true,
            jobCode: true,
            name: true,
            clientName: true,
            createdAt: true,
            date: true,
            documents: { select: { fileName: true } },
          },
        }),
        prisma.jobDocument.findFirst({
          where: { fileHash, deletedAt: null },
          include: {
            job: {
              select: {
                id: true,
                jobCode: true,
                name: true,
                clientName: true,
                createdAt: true,
                date: true,
              },
            },
          },
        }),
      ]);

      let parsedData;
      try {
        parsedData = parseExcelQuotation(buffer, file.name, currentJobCount + i);
      } catch (parseErr: any) {
        results.push({
          fileName: file.name,
          fileHash,
          success: false,
          error: parseErr?.message || "Failed to parse Excel spreadsheet content.",
        });
        continue;
      }

      // Check for duplicate jobCode in database if not already a hash duplicate
      let existingJobByCode = null;
      if (!existingJobByHash && !existingDocByHash) {
        existingJobByCode = await prisma.job.findUnique({
          where: { jobCode: parsedData.jobCode },
          select: { id: true, jobCode: true, name: true, clientName: true, createdAt: true },
        });
      }

      const isDuplicate = Boolean(existingJobByHash || existingDocByHash || existingJobByCode);
      let duplicateReason = "";
      let duplicateDetails = null;

      if (existingJobByHash) {
        duplicateReason = "This Excel file has already been uploaded. Duplicate Job creation is not allowed.";
        duplicateDetails = {
          originalFileName: existingJobByHash.documents?.[0]?.fileName || file.name,
          existingJobId: existingJobByHash.id,
          existingJobNumber: existingJobByHash.jobCode,
          existingJobTitle: existingJobByHash.name,
          existingClientName: existingJobByHash.clientName || "N/A",
          uploadedDate: existingJobByHash.createdAt.toISOString().split("T")[0],
          duplicateReason,
        };
      } else if (existingDocByHash && existingDocByHash.job) {
        duplicateReason = "This Excel file has already been uploaded. Duplicate Job creation is not allowed.";
        duplicateDetails = {
          originalFileName: existingDocByHash.fileName,
          existingJobId: existingDocByHash.job.id,
          existingJobNumber: existingDocByHash.job.jobCode,
          existingJobTitle: existingDocByHash.job.name,
          existingClientName: existingDocByHash.job.clientName || "N/A",
          uploadedDate: existingDocByHash.job.createdAt.toISOString().split("T")[0],
          duplicateReason,
        };
      } else if (existingJobByCode) {
        duplicateReason = `Job Code "${parsedData.jobCode}" is already in use by "${existingJobByCode.name}".`;
        duplicateDetails = {
          originalFileName: file.name,
          existingJobId: existingJobByCode.id,
          existingJobNumber: existingJobByCode.jobCode,
          existingJobTitle: existingJobByCode.name,
          existingClientName: existingJobByCode.clientName || "N/A",
          uploadedDate: existingJobByCode.createdAt.toISOString().split("T")[0],
          duplicateReason,
        };
      }

      results.push({
        fileName: file.name,
        success: true,
        fileHash,
        isDuplicate,
        duplicateReason,
        duplicateDetails,
        duplicateJob: existingJobByHash || existingDocByHash?.job || existingJobByCode,
        data: parsedData,
      });
    }

    return NextResponse.json({
      success: true,
      totalUploaded: files.length,
      parsedCount: results.filter((r) => r.success).length,
      failedCount: results.filter((r) => !r.success).length,
      results,
    });
  } catch (err: any) {
    console.error("POST /api/jobs/parse-excel error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error while processing Excel files." },
      { status: 500 }
    );
  }
}
