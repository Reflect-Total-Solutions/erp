import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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

  const jobStatus = searchParams.get("jobStatus");
  if (jobStatus && jobStatus !== "all") {
    const s = jobStatus.toUpperCase();
    if (s === "PENDING" || s === "PENDING_APPROVAL") {
      where.status = { in: ["PENDING_APPROVAL", "Pending Approval", "Pending", "In Review"] };
    } else if (s === "APPROVED") {
      where.status = { in: ["APPROVED", "Approved"] };
    } else if (s === "REJECTED") {
      where.status = { in: ["REJECTED", "Rejected"] };
    } else if (s === "DRAFT") {
      where.status = { in: ["DRAFT", "Draft"] };
    } else {
      where.status = jobStatus;
    }
  }

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
          costCategories: {
            orderBy: { sortOrder: "asc" },
            include: {
              items: {
                orderBy: { sortOrder: "asc" },
              },
            },
          },
          costItems: {
            orderBy: { sortOrder: "asc" },
          },
          costSummary: true,
          submittedBy: { select: { id: true, name: true, email: true } },
          approvals: {
            orderBy: { createdAt: "desc" },
            include: { user: { select: { id: true, name: true, email: true } } },
          },
          invoice: true,
          supplierInvoices: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            include: {
              supplier: { select: { id: true, code: true, name: true, phone: true, email: true } },
              createdBy: { select: { id: true, name: true, email: true } },
              attachments: {
                select: {
                  id: true,
                  fileName: true,
                  fileSize: true,
                  fileType: true,
                  fileUrl: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.job.count({ where }),
    ]);

    // Format jobs to match UI interface
    const formattedJobs = jobs.map((j) => {
      const allSupplierInvoices = (j as any).supplierInvoices || [];
      const activeSupplierInvoices = allSupplierInvoices.filter(
        (si: any) => si.status !== "CANCELLED"
      );
      const supplierInvoiceCount = activeSupplierInvoices.length;
      const supplierInvoiceTotal = activeSupplierInvoices.reduce(
        (sum: number, si: any) => sum + Number(si.totalAmount || 0),
        0
      );

      let invoiceStatusSummary = "No Invoices";
      if (activeSupplierInvoices.length > 0) {
        const allPaid = activeSupplierInvoices.every((si: any) => si.status === "PAID");
        const somePaid = activeSupplierInvoices.some((si: any) => si.status === "PAID");
        if (allPaid) {
          invoiceStatusSummary = "Paid";
        } else if (somePaid) {
          invoiceStatusSummary = "Partially Paid";
        } else {
          invoiceStatusSummary = "Approved";
        }
      } else if (allSupplierInvoices.length > 0) {
        invoiceStatusSummary = "Cancelled";
      }

      return {
        id: j.id,
        jobCode: j.jobCode,
        name: j.name,
        date: j.date,
        commencingDate: j.commencingDate || j.date,
        clientName: j.clientName || "",
        handledBy: j.handledBy || "",
        description: j.description || "",
        remarks: j.remarks || "",
        status: j.status,
        supplierIds: j.supplierIds || [],
        totalCost: j.totalCost || 0,
        grandTotal: j.grandTotal || 0,
        createdAt: j.createdAt.toISOString().split("T")[0],
        deletedAt: j.deletedAt ? j.deletedAt.toISOString() : null,
        isDeleted: j.deletedAt !== null,
        supplierInvoiceCount,
        supplierInvoiceTotal,
        invoiceStatusSummary,
        supplierInvoices: allSupplierInvoices.map((inv: any) => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          supplierId: inv.supplierId,
          supplierName: inv.supplier?.name || "Unknown Supplier",
          supplierCode: inv.supplier?.code || "—",
          invoiceDate: inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().split("T")[0] : "",
          totalAmount: Number(inv.totalAmount || 0),
          status: inv.status,
          attachmentsCount: (inv.attachments || []).length,
          attachments: inv.attachments || [],
          createdByName: inv.createdBy?.name || "System Admin",
          createdAt: inv.createdAt ? new Date(inv.createdAt).toISOString().split("T")[0] : "",
          notes: inv.notes || null,
        })),
        submittedBy: j.submittedBy,
      approvals: j.approvals.map((a) => ({
        id: a.id,
        jobId: a.jobId,
        userId: a.userId,
        userName: a.user?.name || null,
        userEmail: a.user?.email || null,
        action: a.action,
        previousStatus: a.previousStatus,
        newStatus: a.newStatus,
        reason: a.reason,
        notes: a.notes,
        createdAt: a.createdAt.toISOString(),
      })),
      invoice: j.invoice
        ? {
            id: j.invoice.id,
            invoiceNumber: j.invoice.invoiceNumber,
            jobId: j.invoice.jobId,
            version: j.invoice.version,
            status: j.invoice.status,
            grandTotal: j.invoice.grandTotal,
            issueDate: j.invoice.issueDate.toISOString(),
          }
        : null,
      costCategories: j.costCategories.map((c) => ({
        id: c.id,
        jobId: c.jobId,
        name: c.name,
        sortOrder: c.sortOrder,
        subtotal: c.subtotal,
        items: c.items.map((i) => ({
          id: i.id,
          jobId: i.jobId,
          categoryId: i.categoryId,
          itemNumber: i.itemNumber,
          description: i.description,
          rcNrc: i.rcNrc,
          quantity: i.quantity,
          rate: i.rate,
          totalCost: i.totalCost,
          sortOrder: i.sortOrder,
          notes: i.notes,
        })),
      })),
      costItems: j.costItems.map((i) => ({
        id: i.id,
        jobId: i.jobId,
        categoryId: i.categoryId,
        itemNumber: i.itemNumber,
        description: i.description,
        rcNrc: i.rcNrc,
        quantity: i.quantity,
        rate: i.rate,
        totalCost: i.totalCost,
        sortOrder: i.sortOrder,
        notes: i.notes,
      })),
      costSummary: j.costSummary ? {
        id: j.costSummary.id,
        jobId: j.costSummary.jobId,
        productionCost: j.costSummary.productionCost,
        runningCost: j.costSummary.runningCost,
        agencyOperationFee: j.costSummary.agencyOperationFee,
        agencyProductionFee: j.costSummary.agencyProductionFee,
        adminCharges: j.costSummary.adminCharges,
        monitoringCost: j.costSummary.monitoringCost,
        artworkCharges: j.costSummary.artworkCharges,
        contingencies: j.costSummary.contingencies,
        subTotal: j.costSummary.subTotal,
        totalBeforeTax: j.costSummary.totalBeforeTax,
        taxType: j.costSummary.taxType || "SSCL",
        taxRate: j.costSummary.taxRate || 2.5,
        taxAmount: j.costSummary.taxAmount,
        grandTotal: j.costSummary.grandTotal,
        rawSummaryData: j.costSummary.rawSummaryData,
      } : null,
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
    };
  });

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

  const {
    name,
    jobCode: providedCode,
    date,
    commencingDate,
    clientName,
    handledBy,
    description,
    remarks,
    status,
    supplierIds,
    totalCost,
    grandTotal,
    documents,
    costCategories,
    costItems,
    costSummary,
  } = parseResult.data;

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
        commencingDate: commencingDate || todayDate,
        clientName: clientName || null,
        handledBy: handledBy || null,
        description: description || null,
        remarks: remarks || null,
        status: status === "DRAFT" ? "DRAFT" : "PENDING_APPROVAL",
        submittedById: session.userId || null,
        supplierIds: supplierIds || [],
        totalCost: totalCost || 0,
        grandTotal: grandTotal || 0,
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
        costSummary: costSummary
          ? {
              create: {
                productionCost: costSummary.productionCost || 0,
                runningCost: costSummary.runningCost || 0,
                agencyOperationFee: costSummary.agencyOperationFee || 0,
                agencyProductionFee: costSummary.agencyProductionFee || 0,
                adminCharges: costSummary.adminCharges || 0,
                monitoringCost: costSummary.monitoringCost || 0,
                artworkCharges: costSummary.artworkCharges || 0,
                contingencies: costSummary.contingencies || 0,
                subTotal: costSummary.subTotal || 0,
                totalBeforeTax: costSummary.totalBeforeTax || 0,
                taxType: costSummary.taxType || "SSCL",
                taxRate: costSummary.taxRate || 2.5,
                taxAmount: costSummary.taxAmount || 0,
                grandTotal: costSummary.grandTotal || 0,
                rawSummaryData: (costSummary.rawSummaryData as Prisma.InputJsonValue) ?? Prisma.DbNull,
              },
            }
          : undefined,
      },
      include: {
        documents: true,
        costCategories: { include: { items: true } },
        costItems: true,
        costSummary: true,
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
