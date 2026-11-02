import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { Decimal } from "decimal.js";
import {
  uploadSupplierInvoiceAttachment,
  cleanupOrphanedStorageFiles,
  SUPPLIER_INVOICES_BUCKET,
} from "@/lib/supabase";
import { logAuditEvent } from "@/lib/audit";
import { validateAttachmentBuffer, MAX_ATTACHMENT_SIZE_BYTES } from "@/lib/file-validation";
import { recalculateJobFinances } from "@/lib/financial-recalculation";

// GET /api/supplier-invoices
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access. Please log in." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() || "";
    const supplierId = searchParams.get("supplierId");
    const jobId = searchParams.get("jobId");
    const status = searchParams.get("status");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "10", 10));
    const skip = (page - 1) * limit;

    const where: any = {
      deletedAt: null,
    };

    if (supplierId && supplierId !== "all") {
      where.supplierId = supplierId;
    }

    if (jobId && jobId !== "all") {
      where.jobId = jobId;
    }

    if (status && status !== "all") {
      where.status = status.toUpperCase();
    }

    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: "insensitive" } },
        { supplier: { name: { contains: search, mode: "insensitive" } } },
        { supplier: { code: { contains: search, mode: "insensitive" } } },
        { job: { jobCode: { contains: search, mode: "insensitive" } } },
        { job: { name: { contains: search, mode: "insensitive" } } },
        { job: { clientName: { contains: search, mode: "insensitive" } } },
      ];
    }

    const db = getPrisma();
    const [invoices, totalCount, allActiveInvoices, approvedJobs] = await Promise.all([
      (db.supplierInvoice as any).findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          supplier: {
            select: {
              id: true,
              code: true,
              name: true,
              phone: true,
              email: true,
            },
          },
          job: {
            select: {
              id: true,
              jobCode: true,
              name: true,
              clientName: true,
              status: true,
              grandTotal: true,
              totalCost: true,
            },
          },
          items: {
            orderBy: { rowNumber: "asc" },
            include: {
              attachments: true,
            },
          },
          attachments: true,
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          cancelledBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      (db.supplierInvoice as any).count({ where }),
      (db.supplierInvoice as any).findMany({
        where: {
          deletedAt: null,
          status: { not: "CANCELLED" },
        },
        select: {
          totalAmount: true,
          status: true,
        },
      }),
      (db.job as any).findMany({
        where: {
          deletedAt: null,
          status: { in: ["APPROVED", "Approved", "ACTIVE", "Active", "INVOICED", "Invoiced"] },
        },
        select: {
          grandTotal: true,
          totalCost: true,
        },
      }),
    ]);

    // Calculate system-wide financial metrics
    let totalSupplierInvoicesAmount = new Decimal(0);
    let pendingPaymentsCount = 0;

    allActiveInvoices.forEach((inv: any) => {
      totalSupplierInvoicesAmount = totalSupplierInvoicesAmount.plus(new Decimal(inv.totalAmount || 0));
      if (inv.status !== "PAID") {
        pendingPaymentsCount++;
      }
    });

    let totalApprovedJobValue = new Decimal(0);
    approvedJobs.forEach((job: any) => {
      totalApprovedJobValue = totalApprovedJobValue.plus(new Decimal(job.grandTotal || job.totalCost || 0));
    });

    const totalEstimatedProfit = totalApprovedJobValue.minus(totalSupplierInvoicesAmount);

    const formattedInvoices = invoices.map((inv: any) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      supplierId: inv.supplierId,
      supplierName: inv.supplier?.name || "Unknown Supplier",
      supplierCode: inv.supplier?.code || "—",
      jobId: inv.jobId,
      jobCode: inv.job?.jobCode || "NO-CODE",
      jobName: inv.job?.name || "General Job",
      clientName: inv.job?.clientName || "Valued Client",
      invoiceDate: inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().split("T")[0] : "",
      totalAmount: Number(inv.totalAmount || 0),
      status: inv.status,
      notes: inv.notes || "",
      cancellationReason: inv.cancellationReason || null,
      cancelledAt: inv.cancelledAt ? new Date(inv.cancelledAt).toISOString() : null,
      cancelledByName: inv.cancelledBy?.name || null,
      createdById: inv.createdById,
      createdByName: inv.createdBy?.name || "System Admin",
      items: (inv.items || []).map((item: any) => ({
        id: item.id,
        rowNumber: item.rowNumber,
        description: item.description,
        amount: Number(item.amount || 0),
        notes: item.notes || "",
        attachments: item.attachments || [],
      })),
      attachments: inv.attachments || [],
      createdAt: inv.createdAt ? new Date(inv.createdAt).toISOString().split("T")[0] : "",
      updatedAt: inv.updatedAt ? new Date(inv.updatedAt).toISOString() : "",
    }));

    return NextResponse.json({
      success: true,
      data: formattedInvoices,
      pagination: {
        page,
        limit,
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
      metrics: {
        totalSupplierInvoices: allActiveInvoices.length,
        totalSupplierInvoiceAmount: totalSupplierInvoicesAmount.toNumber(),
        totalJobCost: totalApprovedJobValue.toNumber(),
        totalProfit: totalEstimatedProfit.toNumber(),
        pendingInvoicePayments: pendingPaymentsCount,
      },
    });
  } catch (err: any) {
    console.error("GET /api/supplier-invoices error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error fetching supplier invoices." },
      { status: 500 }
    );
  }
}

// POST /api/supplier-invoices
// Creates a new supplier invoice with dynamic row items, PDF file uploads, and database transaction
export async function POST(req: NextRequest) {
  const uploadedAttachments: Array<{
    itemIndex: number;
    fileName: string;
    originalFileName: string;
    storedFileName: string;
    bucketName: string;
    fileSize: string;
    fileType: string;
    mimeType: string;
    fileUrl: string;
    storagePath: string;
  }> = [];

  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access. Please log in." },
        { status: 401 }
      );
    }

    const contentType = req.headers.get("content-type") || "";
    let supplierId = "";
    let jobId = "";
    let invoiceNumber = "";
    let invoiceDate = new Date().toISOString().split("T")[0];
    let notes = "";
    let parsedItems: Array<{ description: string; amount: number; fileIndex?: number; notes?: string }> = [];
    interface RowAttachmentUpload {
      itemIndex: number;
      file: File;
    }
    const filesToUpload: RowAttachmentUpload[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      supplierId = (formData.get("supplierId") as string) || "";
      jobId = (formData.get("jobId") as string) || "";
      invoiceNumber = (formData.get("invoiceNumber") as string)?.trim() || "";
      invoiceDate = (formData.get("invoiceDate") as string) || invoiceDate;
      notes = (formData.get("notes") as string) || "";

      const rawItems = formData.get("items") as string;
      if (rawItems) {
        try {
          parsedItems = JSON.parse(rawItems);
        } catch {
          return NextResponse.json(
            { success: false, error: "Invalid JSON format for invoice items." },
            { status: 400 }
          );
        }
      }

      // Collect multiple uploaded files per row item
      for (let i = 0; i < parsedItems.length; i++) {
        const rowFiles: File[] = [];

        // Check array form fields: files_${i}, files-${i}, file_${i}, file-${i}
        formData.getAll(`files_${i}`).forEach((f) => {
          if (f instanceof File && f.size > 0) rowFiles.push(f);
        });
        formData.getAll(`files-${i}`).forEach((f) => {
          if (f instanceof File && f.size > 0 && !rowFiles.includes(f)) rowFiles.push(f);
        });
        formData.getAll(`file_${i}`).forEach((f) => {
          if (f instanceof File && f.size > 0 && !rowFiles.includes(f)) rowFiles.push(f);
        });
        formData.getAll(`file-${i}`).forEach((f) => {
          if (f instanceof File && f.size > 0 && !rowFiles.includes(f)) rowFiles.push(f);
        });

        // Also check if indexed: file_${i}_0, files_${i}_0, etc.
        let subIndex = 0;
        while (formData.has(`file_${i}_${subIndex}`) || formData.has(`files_${i}_${subIndex}`)) {
          const subFile = (formData.get(`file_${i}_${subIndex}`) as File) || (formData.get(`files_${i}_${subIndex}`) as File);
          if (subFile instanceof File && subFile.size > 0 && !rowFiles.includes(subFile)) {
            rowFiles.push(subFile);
          }
          subIndex++;
        }

        rowFiles.forEach((file) => {
          filesToUpload.push({ itemIndex: i, file });
        });
      }
    } else {
      // JSON payload
      const body = await req.json();
      supplierId = body.supplierId || "";
      jobId = body.jobId || "";
      invoiceNumber = body.invoiceNumber?.trim() || "";
      invoiceDate = body.invoiceDate || invoiceDate;
      notes = body.notes || "";
      parsedItems = Array.isArray(body.items) ? body.items : [];
    }

    // 1. Validate Supplier
    const db = getPrisma();
    if (!supplierId) {
      return NextResponse.json(
        { success: false, error: "Please select a valid supplier." },
        { status: 400 }
      );
    }
    const supplier = await (db.supplier as any).findFirst({
      where: { id: supplierId, deletedAt: null },
    });
    if (!supplier) {
      return NextResponse.json(
        { success: false, error: "Selected supplier was not found or has been deactivated." },
        { status: 404 }
      );
    }

    // 2. Validate Approved Job (STRICT: only APPROVED jobs permitted)
    if (!jobId) {
      return NextResponse.json(
        { success: false, error: "Please select an approved Job." },
        { status: 400 }
      );
    }
    const job = await (db.job as any).findFirst({
      where: { id: jobId, deletedAt: null },
    });
    if (!job) {
      return NextResponse.json(
        { success: false, error: "Selected Job was not found in the database." },
        { status: 404 }
      );
    }

    const jobStatusUpper = (job.status || "").toUpperCase();
    const isApprovedJob =
      jobStatusUpper === "APPROVED" ||
      jobStatusUpper === "ACTIVE" ||
      jobStatusUpper === "INVOICED";

    if (!isApprovedJob) {
      return NextResponse.json(
        {
          success: false,
          error: `Invoices can only be created for APPROVED Jobs. Job "${job.jobCode}" is currently ${job.status}.`,
        },
        { status: 400 }
      );
    }

    // 3. Validate Invoice Items (at least 1 row required)
    if (!parsedItems || parsedItems.length === 0) {
      return NextResponse.json(
        { success: false, error: "At least one supplier invoice row item is required." },
        { status: 400 }
      );
    }

    // 4. Validate descriptions and amounts, calculate total
    let totalInvoiceAmount = new Decimal(0);
    for (let i = 0; i < parsedItems.length; i++) {
      const item = parsedItems[i];
      if (!item.description || !item.description.trim()) {
        return NextResponse.json(
          { success: false, error: `Row ${i + 1}: Description is required.` },
          { status: 400 }
        );
      }
      const amt = new Decimal(item.amount || 0);
      if (amt.isNaN() || amt.lte(0)) {
        return NextResponse.json(
          { success: false, error: `Row ${i + 1}: Invoice amount must be greater than 0.00.` },
          { status: 400 }
        );
      }
      totalInvoiceAmount = totalInvoiceAmount.plus(amt);
    }

    // 5. Generate unique invoice number if not provided
    if (!invoiceNumber) {
      const year = new Date().getFullYear();
      const count = await (db.supplierInvoice as any).count();
      invoiceNumber = `SINV-${year}-${String(count + 1).padStart(4, "0")}`;
    } else {
      // Check for duplicate invoiceNumber
      const existing = await (db.supplierInvoice as any).findFirst({
        where: { invoiceNumber, deletedAt: null },
      });
      if (existing) {
        return NextResponse.json(
          {
            success: false,
            error: `Invoice number "${invoiceNumber}" already exists in the database. Please use a unique invoice number.`,
          },
          { status: 409 }
        );
      }
    }

    // 6. Upload attachments to Supabase Storage in dedicated "supplier-invoices" bucket
    // Folder hierarchy: supplier-invoices / [JOB-CODE] / [INV-NUMBER] / item-[N] / [STORED_NAME]

    for (let fIdx = 0; fIdx < filesToUpload.length; fIdx++) {
      const { itemIndex, file } = filesToUpload[fIdx];
      if (!file) continue;

      const buffer = Buffer.from(await file.arrayBuffer());

      // Comprehensive validation: format, magic bytes signature, size, sanitization
      const validation = validateAttachmentBuffer(buffer, file.name, MAX_ATTACHMENT_SIZE_BYTES);
      if (!validation.isValid) {
        if (uploadedAttachments.length > 0) {
          await cleanupOrphanedStorageFiles(uploadedAttachments.map((a) => a.storagePath));
        }
        return NextResponse.json(
          {
            success: false,
            error: `Row ${itemIndex + 1} Attachment Error: ${validation.error}`,
          },
          { status: 400 }
        );
      }

      const uploadRes = await uploadSupplierInvoiceAttachment({
        buffer,
        originalName: validation.sanitizedName,
        jobCode: job.jobCode,
        invoiceNumber,
        rowNumberOrItemId: itemIndex + 1,
        contentType: validation.mimeType,
        bucket: SUPPLIER_INVOICES_BUCKET,
      });

      if (!uploadRes.success) {
        if (uploadedAttachments.length > 0) {
          await cleanupOrphanedStorageFiles(uploadedAttachments.map((a) => a.storagePath));
        }
        return NextResponse.json(
          {
            success: false,
            error: `Failed to upload "${validation.sanitizedName}" to Supabase Storage: ${uploadRes.error}`,
          },
          { status: 500 }
        );
      }

      uploadedAttachments.push({
        itemIndex,
        fileName: uploadRes.fileName,
        originalFileName: uploadRes.originalFileName,
        storedFileName: uploadRes.storedFileName,
        bucketName: uploadRes.bucketName,
        fileSize: uploadRes.fileSize,
        fileType: validation.mimeType,
        mimeType: validation.mimeType,
        fileUrl: uploadRes.fileUrl,
        storagePath: uploadRes.storagePath,
      });
    }

    // 7. Commit Database Transaction
    const newInvoice = await db.$transaction(async (tx) => {
      const createdInvoice = await (tx.supplierInvoice as any).create({
        data: {
          invoiceNumber,
          supplierId,
          jobId,
          invoiceDate: new Date(invoiceDate),
          totalAmount: totalInvoiceAmount.toFixed(2),
          status: "APPROVED",
          notes,
          createdById: session.userId,
        },
      });

      // Create each row item and link all attachments for that row
      for (let i = 0; i < parsedItems.length; i++) {
        const item = parsedItems[i];
        const createdItem = await (tx.supplierInvoiceItem as any).create({
          data: {
            invoiceId: createdInvoice.id,
            rowNumber: i + 1,
            description: item.description.trim(),
            amount: new Decimal(item.amount).toFixed(2),
            notes: item.notes || "",
          },
        });

        // Find all attachments for this row item and persist full metadata in PostgreSQL
        const rowAttachments = uploadedAttachments.filter((a) => a.itemIndex === i);
        for (const att of rowAttachments) {
          const createdAtt = await (tx.supplierInvoiceAttachment as any).create({
            data: {
              invoiceId: createdInvoice.id,
              itemId: createdItem.id,
              jobId: job.id,
              fileName: att.fileName,
              originalFileName: att.originalFileName,
              storedFileName: att.storedFileName,
              bucketName: att.bucketName,
              storagePath: att.storagePath,
              fileSize: att.fileSize,
              fileType: att.fileType,
              mimeType: att.mimeType,
              fileUrl: `/api/supplier-invoices/attachments/download?path=${encodeURIComponent(att.storagePath)}`,
              uploadedById: session.userId,
            },
          });

          // Set permanent secure API access URL pointing to attachment ID
          await (tx.supplierInvoiceAttachment as any).update({
            where: { id: createdAtt.id },
            data: {
              fileUrl: `/api/supplier-invoices/attachments/${createdAtt.id}`,
            },
          });
        }
      }

      // Record Supplier Invoice Audit Log
      await (tx.supplierInvoiceAuditLog as any).create({
        data: {
          invoiceId: createdInvoice.id,
          userId: session.userId,
          action: "CREATE",
          reason: `Created supplier invoice ${invoiceNumber} for Job ${job.jobCode} (${job.name}) with ${uploadedAttachments.length} attachments stored in Supabase`,
          newData: {
            invoiceNumber,
            supplierId,
            supplierName: supplier.name,
            jobId,
            jobCode: job.jobCode,
            totalAmount: totalInvoiceAmount.toFixed(2),
            itemCount: parsedItems.length,
            attachmentsCount: uploadedAttachments.length,
          },
        },
      });

      // Recalculate Job's actual costs and budget atomically within the transaction
      const financialSnapshot = await recalculateJobFinances(job.id, tx);

      return { createdInvoice, financialSnapshot };
    });

    // Log general security audit log
    await logAuditEvent({
      userId: session.userId,
      action: "CREATE_SUPPLIER_INVOICE",
      resource: "supplier-invoices",
      resourceId: newInvoice.createdInvoice.id,
      details: {
        invoiceNumber,
        supplierName: supplier.name,
        jobCode: job.jobCode,
        totalAmount: totalInvoiceAmount.toFixed(2),
        attachmentsCount: uploadedAttachments.length,
      },
      req,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Supplier Invoice Created Successfully",
        data: {
          id: newInvoice.createdInvoice.id,
          invoiceNumber: newInvoice.createdInvoice.invoiceNumber,
          supplierName: supplier.name,
          jobCode: job.jobCode,
          jobName: job.name,
          totalAmount: totalInvoiceAmount.toNumber(),
          itemCount: parsedItems.length,
          attachmentsCount: uploadedAttachments.length,
          financialOverview: newInvoice.financialSnapshot,
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    // If database transaction failed after file upload, clean up orphaned Storage files
    if (uploadedAttachments.length > 0) {
      await cleanupOrphanedStorageFiles(uploadedAttachments.map((a) => a.storagePath));
    }
    console.error("POST /api/supplier-invoices error:", err?.message || String(err));
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error saving supplier invoice." },
      { status: 500 }
    );
  }
}
