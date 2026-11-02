import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { uploadToSupabaseStorage } from "@/lib/supabase";
import { calculateFileHash } from "@/lib/excel-parser";
import { logAuditEvent } from "@/lib/audit";
import { roundFinancial, toDecimal } from "@/lib/financial";

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

  try {
    const formData = await req.formData();
    const payloadStr = formData.get("payload");

    if (!payloadStr || typeof payloadStr !== "string") {
      return NextResponse.json(
        { success: false, error: "Missing or invalid 'payload' JSON field in form data." },
        { status: 400 }
      );
    }

    let jobConfigs: any[];
    try {
      jobConfigs = JSON.parse(payloadStr);
      if (!Array.isArray(jobConfigs) || jobConfigs.length === 0) {
        throw new Error("Payload must be a non-empty array of job configurations.");
      }
    } catch (parseErr: any) {
      return NextResponse.json(
        { success: false, error: `Invalid payload JSON format: ${parseErr?.message}` },
        { status: 400 }
      );
    }

    // Index all uploaded files by filename
    const fileMap = new Map<string, File>();
    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        fileMap.set(value.name, value);
      }
    }

    const createdJobs = [];
    const failedFiles = [];
    let totalCostOfAllJobs = 0;
    const processedHashesInBatch = new Set<string>();

    for (const config of jobConfigs) {
      const fileName = config.fileName;
      const file = fileMap.get(fileName);

      try {
        let fileUrl = "";
        let storagePath = "";
        let fileSize = config.fileSize || "100 KB";
        let fileHash = config.fileHash || "";
        let fileBuffer: Buffer | null = null;

        // 1. Calculate file hash and size if file buffer is present
        if (file) {
          const arrayBuffer = await file.arrayBuffer();
          fileBuffer = Buffer.from(arrayBuffer);
          fileHash = calculateFileHash(fileBuffer);

          const sizeBytes = fileBuffer.byteLength;
          fileSize =
            sizeBytes > 1024 * 1024
              ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
              : `${Math.round(sizeBytes / 1024) || 1} KB`;
        }

        // 2. Intra-batch duplicate check
        if (fileHash && processedHashesInBatch.has(fileHash)) {
          failedFiles.push({
            fileName,
            isDuplicate: true,
            error: "Duplicate File Detected! This file has identical content to another file in this same upload batch.",
            duplicateDetails: {
              originalFileName: fileName,
              existingJobId: "",
              existingJobNumber: "Batch Duplicate",
              existingJobTitle: config.name || "Duplicate in current batch",
              existingClientName: config.clientName || "N/A",
              uploadedDate: new Date().toISOString().split("T")[0],
              duplicateReason: "Duplicate file within this upload session.",
            },
          });
          continue;
        }

        // 3. Server-side Database Duplicate Detection (BEFORE storage and DB creation)
        if (fileHash) {
          const [existingJobByHash, existingDocByHash] = await Promise.all([
            prisma.job.findFirst({
              where: { fileHash, deletedAt: null },
              select: {
                id: true,
                jobCode: true,
                name: true,
                clientName: true,
                createdAt: true,
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
                  },
                },
              },
            }),
          ]);

          const duplicateRecord = existingJobByHash || existingDocByHash?.job;
          if (duplicateRecord) {
            const originalFileName =
              existingJobByHash?.documents?.[0]?.fileName || existingDocByHash?.fileName || fileName;

            // Log rejected duplicate attempt in JobUploadLog
            try {
              await prisma.jobUploadLog.create({
                data: {
                  userId: session.userId,
                  jobId: duplicateRecord.id,
                  fileName,
                  fileSize,
                  fileHash,
                  status: "DUPLICATE_REJECTED",
                  errorMessage: "Duplicate File Detected! This Excel file has already been uploaded. Duplicate Job creation is not allowed.",
                  extractedDetails: {
                    originalFileName,
                    existingJobNumber: duplicateRecord.jobCode,
                    existingJobTitle: duplicateRecord.name,
                    existingClientName: duplicateRecord.clientName,
                    previouslyUploadedDate: duplicateRecord.createdAt.toISOString().split("T")[0],
                  },
                },
              });
            } catch (logErr) {
              console.warn("Failed to write duplicate upload log:", logErr);
            }

            // Reject: Do NOT upload to Supabase, do NOT create Job
            failedFiles.push({
              fileName,
              isDuplicate: true,
              error: "Duplicate File Detected! This Excel file has already been uploaded. Duplicate Job creation is not allowed.",
              duplicateDetails: {
                originalFileName,
                existingJobId: duplicateRecord.id,
                existingJobNumber: duplicateRecord.jobCode,
                existingJobTitle: duplicateRecord.name,
                existingClientName: duplicateRecord.clientName || "N/A",
                uploadedDate: duplicateRecord.createdAt.toISOString().split("T")[0],
                duplicateReason: "This Excel file has already been uploaded. Duplicate Job creation is not allowed.",
              },
            });
            continue;
          }
        }

        // 4. Upload original Excel file to Supabase Storage ONLY after duplicate check passes
        if (file && fileBuffer) {
          const cleanJobCode = (config.jobCode || "JOB").replace(/[^a-zA-Z0-9_-]/g, "_");
          const uploadRes = await uploadToSupabaseStorage({
            buffer: fileBuffer,
            originalName: file.name,
            folder: `jobs/${cleanJobCode}`,
            contentType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          });

          if (!uploadRes.success) {
            console.warn(`Supabase Storage upload warning for "${file.name}":`, uploadRes.error);
          } else {
            fileUrl = uploadRes.fileUrl;
            storagePath = uploadRes.storagePath;
          }
        }

        // 5. Validate or generate unique jobCode
        let jobCode = config.jobCode?.trim()?.toUpperCase();
        if (!jobCode) {
          const year = new Date().getFullYear();
          const count = await prisma.job.count();
          jobCode = `JOB-${year}-${String(count + 1).padStart(3, "0")}`;
        }

        const existingJob = await prisma.job.findUnique({ where: { jobCode } });
        if (existingJob) {
          const year = new Date().getFullYear();
          const count = await prisma.job.count();
          jobCode = `${jobCode}-${count + 1}`;
        }

        const date = config.date || new Date().toISOString().split("T")[0];
        const commencingDate = config.commencingDate || date;
        const totalCostDecimal = roundFinancial(config.costSummary?.subTotal || config.totalCost || 0, 2);
        const grandTotalDecimal = roundFinancial(config.costSummary?.grandTotal || config.grandTotal || totalCostDecimal, 2);

        // 6. Execute atomic Prisma transaction for this job
        const createdJob = await prisma.$transaction(async (tx) => {
          // Create Job record
          const job = await tx.job.create({
            data: {
              name: config.name || "Untitled Project",
              jobCode,
              date,
              commencingDate,
              clientName: config.clientName || null,
              handledBy: config.handledBy || null,
              description: config.description || null,
              remarks: config.remarks || null,
              status: config.status === "DRAFT" ? "DRAFT" : "PENDING_APPROVAL",
              supplierIds: config.supplierIds || [],
              fileHash: fileHash || null,
              submittedById: session.userId || null,
              totalCost: totalCostDecimal.toString(),
              grandTotal: grandTotalDecimal.toString(),
            },
          });

          // Create JobCostCategories and their items
          const categories = Array.isArray(config.costCategories) ? config.costCategories : [];
          const allItems = Array.isArray(config.allCostItems) ? config.allCostItems : [];

          if (categories.length > 0) {
            for (let catIdx = 0; catIdx < categories.length; catIdx++) {
              const cat = categories[catIdx];
              const catSubtotal = roundFinancial(cat.subtotal || 0, 2);
              const createdCat = await tx.jobCostCategory.create({
                data: {
                  jobId: job.id,
                  name: cat.name || "Production Cost",
                  sortOrder: cat.sortOrder || catIdx + 1,
                  subtotal: catSubtotal.toString(),
                },
              });

              const catItems =
                Array.isArray(cat.items) && cat.items.length > 0
                  ? cat.items
                  : allItems.filter((i: any) => i.categoryName === cat.name);

              if (catItems.length > 0) {
                await tx.jobCostItem.createMany({
                  data: catItems.map((item: any, itemIdx: number) => ({
                    jobId: job.id,
                    categoryId: createdCat.id,
                    itemNumber: item.itemNumber || itemIdx + 1,
                    description: item.description || "Cost Item",
                    rcNrc: item.rcNrc || "NRC",
                    quantity: roundFinancial(item.quantity || 1, 4).toString(),
                    rate: roundFinancial(item.rate || 0, 2).toString(),
                    totalCost: roundFinancial(item.totalCost || 0, 2).toString(),
                    sortOrder: item.sortOrder || itemIdx + 1,
                  })),
                });
              }
            }
          } else if (allItems.length > 0) {
            const defaultCat = await tx.jobCostCategory.create({
              data: {
                jobId: job.id,
                name: "Production Cost",
                sortOrder: 1,
                subtotal: totalCostDecimal.toString(),
              },
            });

            await tx.jobCostItem.createMany({
              data: allItems.map((item: any, itemIdx: number) => ({
                jobId: job.id,
                categoryId: defaultCat.id,
                itemNumber: item.itemNumber || itemIdx + 1,
                description: item.description || "Cost Item",
                rcNrc: item.rcNrc || "NRC",
                quantity: roundFinancial(item.quantity || 1, 4).toString(),
                rate: roundFinancial(item.rate || 0, 2).toString(),
                totalCost: roundFinancial(item.totalCost || 0, 2).toString(),
                sortOrder: item.sortOrder || itemIdx + 1,
              })),
            });
          }

          // Create JobCostSummary
          const summary = config.costSummary || {};
          await tx.jobCostSummary.create({
            data: {
              jobId: job.id,
              productionCost: roundFinancial(summary.productionCost || 0, 2).toString(),
              runningCost: roundFinancial(summary.runningCost || 0, 2).toString(),
              agencyOperationFee: roundFinancial(summary.agencyOperationFee || 0, 2).toString(),
              agencyProductionFee: roundFinancial(summary.agencyProductionFee || 0, 2).toString(),
              adminCharges: roundFinancial(summary.adminCharges || 0, 2).toString(),
              monitoringCost: roundFinancial(summary.monitoringCost || 0, 2).toString(),
              artworkCharges: roundFinancial(summary.artworkCharges || 0, 2).toString(),
              contingencies: roundFinancial(summary.contingencies || 0, 2).toString(),
              subTotal: roundFinancial(summary.subTotal || totalCostDecimal, 2).toString(),
              totalBeforeTax: roundFinancial(summary.totalBeforeTax || totalCostDecimal, 2).toString(),
              taxType: summary.taxType || "SSCL",
              taxRate: roundFinancial(summary.taxRate || 2.5, 3).toString(),
              taxAmount: roundFinancial(summary.taxAmount || 0, 2).toString(),
              grandTotal: grandTotalDecimal.toString(),
              rawSummaryData: summary.rawSummaryData || null,
            },
          });

          // Create JobDocument linking to original file in Supabase
          if (fileName) {
            await tx.jobDocument.create({
              data: {
                jobId: job.id,
                fileName,
                customName: `${config.name || "Quotation"} - Original`,
                fileDate: date,
                fileSize,
                fileType: "xlsx",
                fileUrl: fileUrl || "local://pending-sync",
                storagePath: storagePath || null,
                fileHash: fileHash || null,
                status: "Processed",
              },
            });
          }

          // Create JobUploadLog
          await tx.jobUploadLog.create({
            data: {
              jobId: job.id,
              userId: session.userId,
              fileName: fileName || "manual-entry",
              fileSize,
              fileHash: fileHash || null,
              status: "SUCCESS",
              extractedDetails: {
                categoriesCount: categories.length,
                itemsCount: allItems.length,
                grandTotal: grandTotalDecimal.toNumber(),
              },
            },
          });

          return job;
        });

        if (fileHash) {
          processedHashesInBatch.add(fileHash);
        }

        totalCostOfAllJobs += grandTotalDecimal.toNumber();
        createdJobs.push({
          id: createdJob.id,
          jobCode: createdJob.jobCode,
          name: createdJob.name,
          clientName: createdJob.clientName,
          date: createdJob.date,
          grandTotal: grandTotalDecimal.toNumber(),
          totalCost: totalCostDecimal.toNumber(),
          fileUrl,
          fileName,
        });
      } catch (jobErr: any) {
        console.error(`Error processing job for file "${fileName}":`, jobErr);

        // Handle unique constraint violation (P2002) gracefully for concurrent attempts
        if (jobErr?.code === "P2002") {
          const target = jobErr.meta?.target;
          let isHashCollision = Array.isArray(target) ? target.includes("file_hash") : target === "file_hash";
          
          let existing = null;
          if (config.fileHash) {
            existing = await prisma.job.findFirst({
              where: { fileHash: config.fileHash, deletedAt: null },
              select: { id: true, jobCode: true, name: true, clientName: true, createdAt: true },
            });
          }

          failedFiles.push({
            fileName,
            isDuplicate: true,
            error: "Duplicate File Detected! This Excel file has already been uploaded. Duplicate Job creation is not allowed.",
            duplicateDetails: {
              originalFileName: fileName,
              existingJobId: existing?.id || "",
              existingJobNumber: existing?.jobCode || "Existing Record",
              existingJobTitle: existing?.name || "Existing Job",
              existingClientName: existing?.clientName || "N/A",
              uploadedDate: existing?.createdAt ? existing.createdAt.toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
              duplicateReason: "Unique constraint violation: This file has already been recorded in the database.",
            },
          });
        } else {
          failedFiles.push({
            fileName,
            error: jobErr?.message || "Failed to create job in database.",
          });
        }

        // Record failed log
        try {
          await prisma.jobUploadLog.create({
            data: {
              userId: session.userId,
              fileName: fileName || "unknown",
              fileSize: config.fileSize || "0 KB",
              fileHash: config.fileHash || null,
              status: jobErr?.code === "P2002" ? "DUPLICATE_REJECTED" : "FAILED",
              errorMessage: jobErr?.message || "Transaction failure",
            },
          });
        } catch {
          // ignore
        }
      }
    }

    // Log security audit trail
    await logAuditEvent({
      userId: session.userId,
      action: "BULK_EXCEL_UPLOAD",
      resource: "jobs",
      details: {
        totalFiles: jobConfigs.length,
        successCount: createdJobs.length,
        failedCount: failedFiles.length,
        totalCostOfAllJobs,
        jobIds: createdJobs.map((j) => j.id),
      },
    });

    return NextResponse.json({
      success: true,
      totalFiles: jobConfigs.length,
      successCount: createdJobs.length,
      failedCount: failedFiles.length,
      createdJobs,
      failedFiles,
      totalCostOfAllJobs,
    });
  } catch (err: any) {
    console.error("POST /api/jobs/bulk-upload fatal error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to execute bulk upload." },
      { status: 500 }
    );
  }
}
