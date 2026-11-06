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
          duplicateStatus: "BATCH",
          duplicateReason: `Duplicate file detected in current upload batch (identical to "${firstFileName}").`,
          duplicateDetails: {
            originalFileName: firstFileName,
            existingJobId: "",
            existingJobNumber: "Batch Duplicate",
            existingJobTitle: `Same content as ${firstFileName}`,
            existingClientName: "N/A",
            uploadedDate: new Date().toISOString().split("T")[0],
            isTrash: false,
            duplicateReason: "This Excel file is a duplicate of another file in this same upload session.",
          },
          data: null,
        });
        continue;
      }
      seenHashesInBatch.set(fileHash, file.name);

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

      // ── 1. Check for Active Jobs with the same Excel file hash ─────────────────
      const [activeJobByHash, activeDocByHash] = await Promise.all([
        prisma.job.findFirst({
          where: { fileHash, deletedAt: null },
          select: {
            id: true,
            jobCode: true,
            name: true,
            clientName: true,
            createdAt: true,
            date: true,
            documents: { where: { deletedAt: null }, select: { fileName: true } },
          },
        }),
        prisma.jobDocument.findFirst({
          where: {
            fileHash,
            deletedAt: null,
            job: { deletedAt: null },
          },
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

      const matchedActive = activeJobByHash || activeDocByHash?.job;
      if (matchedActive) {
        const originalFileName =
          activeJobByHash?.documents?.[0]?.fileName || activeDocByHash?.fileName || file.name;
        const duplicateReason =
          "This Excel file has already been uploaded. Duplicate Job creation is not allowed.";

        results.push({
          fileName: file.name,
          success: true,
          fileHash,
          isDuplicate: true,
          duplicateStatus: "ACTIVE",
          duplicateReason,
          duplicateDetails: {
            originalFileName,
            existingJobId: matchedActive.id,
            existingJobNumber: matchedActive.jobCode,
            existingJobTitle: matchedActive.name,
            existingClientName: matchedActive.clientName || "N/A",
            uploadedDate: matchedActive.createdAt.toISOString().split("T")[0],
            isTrash: false,
            duplicateReason,
          },
          duplicateJob: matchedActive,
          data: parsedData,
        });
        continue;
      }

      // ── 2. Check for Trashed Jobs with the same Excel file hash ───────────────
      const [trashedJobByHash, trashedDocByHash] = await Promise.all([
        prisma.job.findFirst({
          where: { fileHash, deletedAt: { not: null } },
          select: {
            id: true,
            jobCode: true,
            name: true,
            clientName: true,
            createdAt: true,
            date: true,
            deletedAt: true,
            documents: { select: { fileName: true } },
          },
        }),
        prisma.jobDocument.findFirst({
          where: {
            fileHash,
            OR: [{ deletedAt: { not: null } }, { job: { deletedAt: { not: null } } }],
          },
          include: {
            job: {
              select: {
                id: true,
                jobCode: true,
                name: true,
                clientName: true,
                createdAt: true,
                date: true,
                deletedAt: true,
              },
            },
          },
        }),
      ]);

      const matchedTrash = trashedJobByHash || trashedDocByHash?.job;
      if (matchedTrash) {
        const originalFileName =
          trashedJobByHash?.documents?.[0]?.fileName || trashedDocByHash?.fileName || file.name;
        const duplicateReason =
          "This Excel file belongs to a Job that is currently in Trash. Permanently delete the Job before uploading it again.";

        results.push({
          fileName: file.name,
          success: true,
          fileHash,
          isDuplicate: true,
          duplicateStatus: "TRASH",
          duplicateReason,
          duplicateDetails: {
            originalFileName,
            existingJobId: matchedTrash.id,
            existingJobNumber: matchedTrash.jobCode,
            existingJobTitle: matchedTrash.name,
            existingClientName: matchedTrash.clientName || "N/A",
            uploadedDate: matchedTrash.createdAt.toISOString().split("T")[0],
            isTrash: true,
            duplicateReason,
          },
          duplicateJob: matchedTrash,
          data: parsedData,
        });
        continue;
      }

      // ── 3. Check explicit Job Code collision (only if explicitly in Excel) ────
      if (parsedData.hasExplicitJobCode && parsedData.jobCode) {
        const existingJobByCode = await prisma.job.findUnique({
          where: { jobCode: parsedData.jobCode },
          select: { id: true, jobCode: true, name: true, clientName: true, createdAt: true, deletedAt: true },
        });

        if (existingJobByCode) {
          const isTrash = Boolean(existingJobByCode.deletedAt);
          const duplicateReason = isTrash
            ? `Job Code "${parsedData.jobCode}" belongs to a Job that is currently in Trash. Permanently delete the Job before uploading it again.`
            : `This Excel file has already been uploaded. Duplicate Job creation is not allowed. (Job Code "${parsedData.jobCode}" is already in use by "${existingJobByCode.name}").`;

          results.push({
            fileName: file.name,
            success: true,
            fileHash,
            isDuplicate: true,
            duplicateStatus: isTrash ? "TRASH" : "ACTIVE",
            duplicateReason,
            duplicateDetails: {
              originalFileName: file.name,
              existingJobId: existingJobByCode.id,
              existingJobNumber: existingJobByCode.jobCode,
              existingJobTitle: existingJobByCode.name,
              existingClientName: existingJobByCode.clientName || "N/A",
              uploadedDate: existingJobByCode.createdAt.toISOString().split("T")[0],
              isTrash,
              duplicateReason,
            },
            duplicateJob: existingJobByCode,
            data: parsedData,
          });
          continue;
        }
      } else if (!parsedData.hasExplicitJobCode) {
        // Fallback auto-generated code collision resolution (to prevent false duplicate warnings)
        let candidate = parsedData.jobCode;
        let exists = await prisma.job.findUnique({ where: { jobCode: candidate } });
        let offset = 2;
        const currentYear = new Date().getFullYear();
        while (exists) {
          candidate = `JOB-${currentYear}-${String(currentJobCount + offset).padStart(3, "0")}`;
          exists = await prisma.job.findUnique({ where: { jobCode: candidate } });
          offset++;
        }
        parsedData.jobCode = candidate;
      }

      // ── 4. No duplicate found (permanently deleted or brand new file) ─────────
      results.push({
        fileName: file.name,
        success: true,
        fileHash,
        isDuplicate: false,
        duplicateStatus: null,
        duplicateReason: "",
        duplicateDetails: null,
        duplicateJob: null,
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
