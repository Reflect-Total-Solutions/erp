import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { roundFinancial } from "@/lib/financial";
import { getSession } from "@/lib/auth";
import { jobUpdateSchema } from "@/lib/validations/job";
import { logAuditEvent } from "@/lib/audit";
import { checkSessionPermission } from "@/lib/permissions";
import { cleanupOrphanedStorageFiles } from "@/lib/supabase";

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
        invoice: {
          include: {
            revisions: {
              orderBy: { createdAt: "desc" },
              include: { regeneratedBy: { select: { id: true, name: true, email: true } } },
            },
          },
        },
        supplierInvoices: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          include: {
            supplier: { select: { id: true, code: true, name: true, phone: true, email: true } },
            items: {
              orderBy: { rowNumber: "asc" },
              include: { attachments: true },
            },
            attachments: true,
            createdBy: { select: { id: true, name: true, email: true } },
          },
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
      commencingDate: job.commencingDate || job.date,
      clientName: job.clientName || "",
      handledBy: job.handledBy || "",
      description: job.description || "",
      remarks: job.remarks || "",
      status: job.status,
      supplierIds: job.supplierIds,
      totalCost: job.totalCost || 0,
      grandTotal: job.grandTotal || 0,
      createdAt: job.createdAt.toISOString().split("T")[0],
      deletedAt: job.deletedAt ? job.deletedAt.toISOString() : null,
      isDeleted: job.deletedAt !== null,
      submittedBy: job.submittedBy,
      approvals: job.approvals.map((a) => ({
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
      invoice: job.invoice
        ? {
            id: job.invoice.id,
            invoiceNumber: job.invoice.invoiceNumber,
            jobId: job.invoice.jobId,
            version: job.invoice.version,
            clientName: job.invoice.clientName,
            clientAddress: job.invoice.clientAddress,
            clientEmail: job.invoice.clientEmail,
            issueDate: job.invoice.issueDate.toISOString(),
            dueDate: job.invoice.dueDate ? job.invoice.dueDate.toISOString() : null,
            subTotal: job.invoice.subTotal,
            taxType: job.invoice.taxType,
            taxRate: job.invoice.taxRate,
            taxAmount: job.invoice.taxAmount,
            grandTotal: job.invoice.grandTotal,
            status: job.invoice.status,
            itemsSnapshot: job.invoice.itemsSnapshot,
            costSummarySnapshot: job.invoice.costSummarySnapshot,
            notes: job.invoice.notes,
            terms: job.invoice.terms,
            revisions: job.invoice.revisions.map((rev) => ({
              id: rev.id,
              version: rev.version,
              previousInvoiceNumber: rev.previousInvoiceNumber,
              reason: rev.reason,
              regeneratedByName: rev.regeneratedBy?.name || null,
              createdAt: rev.createdAt.toISOString(),
              snapshot: rev.snapshot,
            })),
            createdAt: job.invoice.createdAt.toISOString(),
            updatedAt: job.invoice.updatedAt.toISOString(),
          }
        : null,
      suppliers,
      costCategories: job.costCategories.map((c) => ({
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
      costItems: job.costItems.map((i) => ({
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
      costSummary: job.costSummary ? {
        id: job.costSummary.id,
        jobId: job.costSummary.jobId,
        productionCost: job.costSummary.productionCost,
        runningCost: job.costSummary.runningCost,
        agencyOperationFee: job.costSummary.agencyOperationFee,
        agencyProductionFee: job.costSummary.agencyProductionFee,
        adminCharges: job.costSummary.adminCharges,
        monitoringCost: job.costSummary.monitoringCost,
        artworkCharges: job.costSummary.artworkCharges,
        contingencies: job.costSummary.contingencies,
        subTotal: job.costSummary.subTotal,
        totalBeforeTax: job.costSummary.totalBeforeTax,
        taxType: job.costSummary.taxType || "SSCL",
        taxRate: job.costSummary.taxRate || 2.5,
        taxAmount: job.costSummary.taxAmount,
        grandTotal: job.costSummary.grandTotal,
        rawSummaryData: job.costSummary.rawSummaryData,
      } : null,
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
      supplierInvoices: (job.supplierInvoices || []).map((inv: any) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        supplierId: inv.supplierId,
        supplierName: inv.supplier?.name || "Unknown Supplier",
        supplierCode: inv.supplier?.code || "—",
        invoiceDate: inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().split("T")[0] : "",
        totalAmount: Number(inv.totalAmount || 0),
        status: inv.status,
        notes: inv.notes || "",
        createdByName: inv.createdBy?.name || "System Admin",
        items: (inv.items || []).map((it: any) => ({
          id: it.id,
          rowNumber: it.rowNumber,
          description: it.description,
          amount: Number(it.amount || 0),
          notes: it.notes || "",
          attachments: it.attachments || [],
        })),
        attachments: inv.attachments || [],
        createdAt: inv.createdAt ? new Date(inv.createdAt).toISOString().split("T")[0] : "",
      })),
      supplierInvoiceCount: (job.supplierInvoices || []).filter((i: any) => i.status !== "CANCELLED").length,
      supplierInvoiceTotal: (job.supplierInvoices || []).filter((i: any) => i.status !== "CANCELLED").reduce((sum: number, i: any) => sum + Number(i.totalAmount || 0), 0),
      invoiceStatusSummary: (() => {
        const active = (job.supplierInvoices || []).filter((i: any) => i.status !== "CANCELLED");
        if (active.length === 0) return (job.supplierInvoices || []).length > 0 ? "Cancelled" : "No Invoices";
        if (active.every((i: any) => i.status === "PAID")) return "Paid";
        if (active.some((i: any) => i.status === "PAID")) return "Partially Paid";
        return "Approved";
      })(),
      financialOverview: (() => {
        const approvedJobValue = Number(job.grandTotal || job.totalCost || 0);
        const activeInvoices = (job.supplierInvoices || []).filter((i: any) => i.status !== "CANCELLED");
        const totalSupplierCost = activeInvoices.reduce((sum: number, i: any) => sum + Number(i.totalAmount || 0), 0);
        const remainingBudget = approvedJobValue - totalSupplierCost;
        const grossProfit = approvedJobValue - totalSupplierCost;
        const profitMargin = approvedJobValue > 0 ? Number(((grossProfit / approvedJobValue) * 100).toFixed(2)) : 0;
        const costUtilization = approvedJobValue > 0 ? Number(((totalSupplierCost / approvedJobValue) * 100).toFixed(2)) : 0;
        return {
          approvedJobValue,
          totalSupplierCost,
          otherCosts: 0,
          totalActualCost: totalSupplierCost,
          remainingBudget,
          grossProfit,
          profitMargin,
          costUtilization,
          isBudgetExceeded: totalSupplierCost > approvedJobValue,
          supplierInvoicesCount: activeInvoices.length,
        };
      })(),
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

    const {
      name,
      jobCode,
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
      costCategories,
      costItems,
      costSummary,
    } = parseResult.data;

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

    // Strict status transition security checks (Section 6 & 8)
    const isAdmin = session.roles.some((r) => r.toLowerCase() === "admin");
    if (status && status !== existing.status) {
      const isCurrentlyApproved =
        existing.status.toLowerCase().includes("approved") ||
        existing.status.toLowerCase().includes("invoic") ||
        existing.status.toLowerCase() === "active";
      const isTargetPending =
        status.toLowerCase().includes("pending") ||
        status.toLowerCase().includes("draft") ||
        status.toLowerCase().includes("review");

      // Strict Approval Lock: Prevent Approved Jobs with active Supplier Invoices from returning to Pending
      if (isCurrentlyApproved && isTargetPending) {
        const activeSupplierInvoices = await prisma.supplierInvoice.findMany({
          where: {
            jobId: id,
            deletedAt: null,
            status: { not: "CANCELLED" },
          },
          select: {
            id: true,
            invoiceNumber: true,
            totalAmount: true,
          },
        });

        if (activeSupplierInvoices.length > 0) {
          const supplierInvoiceCount = activeSupplierInvoices.length;
          const totalSupplierInvoiceAmount = activeSupplierInvoices.reduce(
            (sum, inv) => sum + Number(inv.totalAmount || 0),
            0
          );

          return NextResponse.json(
            {
              success: false,
              blocked: true,
              error: "Cannot Move Job to Pending: Supplier invoices have already been recorded for this Job. The Job cannot be moved back to Pending Approval.",
              title: "Cannot Move Job to Pending",
              message: "Supplier invoices have already been recorded for this Job. The Job cannot be moved back to Pending Approval.",
              jobNumber: existing.jobCode || "NO-CODE",
              jobTitle: existing.name,
              supplierInvoiceCount,
              totalSupplierInvoiceAmount,
              statusChange: "BLOCKED",
            },
            { status: 422 }
          );
        }
      }

      if (isCurrentlyApproved && !isAdmin) {
        return NextResponse.json(
          {
            success: false,
            error: "Status locked: Only system administrators can modify or reset the status of an Approved or Invoiced Job.",
          },
          { status: 403 }
        );
      }
    }

    const updatedJob = await prisma.$transaction(async (tx) => {
      // Concurrency check inside transaction
      if (status && status !== existing.status) {
        const isCurrentlyApproved =
          existing.status.toLowerCase().includes("approved") ||
          existing.status.toLowerCase().includes("invoic") ||
          existing.status.toLowerCase() === "active";
        const isTargetPending =
          status.toLowerCase().includes("pending") ||
          status.toLowerCase().includes("draft") ||
          status.toLowerCase().includes("review");

        if (isCurrentlyApproved && isTargetPending) {
          const activeCount = await tx.supplierInvoice.count({
            where: {
              jobId: id,
              deletedAt: null,
              status: { not: "CANCELLED" },
            },
          });
          if (activeCount > 0) {
            throw new Error(
              "Cannot Move Job to Pending: Supplier invoices have already been recorded for this Job. The Job cannot be moved back to Pending Approval."
            );
          }
        }
      }

      // 1. Update Job record
      const job = await tx.job.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(jobCode !== undefined && { jobCode }),
          ...(date !== undefined && { date }),
          ...(commencingDate !== undefined && { commencingDate }),
          ...(clientName !== undefined && { clientName }),
          ...(handledBy !== undefined && { handledBy }),
          ...(description !== undefined && { description: description || null }),
          ...(remarks !== undefined && { remarks: remarks || null }),
          ...(status !== undefined && { status }),
          ...(supplierIds !== undefined && { supplierIds }),
          ...(totalCost !== undefined && { totalCost: roundFinancial(totalCost, 2).toString() }),
          ...(grandTotal !== undefined && { grandTotal: roundFinancial(grandTotal, 2).toString() }),
        },
      });

      // 2. If categories provided, replace and recreate
      if (costCategories !== undefined) {
        await tx.jobCostItem.deleteMany({ where: { jobId: id } });
        await tx.jobCostCategory.deleteMany({ where: { jobId: id } });

        for (let catIdx = 0; catIdx < costCategories.length; catIdx++) {
          const cat = costCategories[catIdx];
          const createdCat = await tx.jobCostCategory.create({
            data: {
              jobId: id,
              name: cat.name,
              sortOrder: cat.sortOrder || catIdx + 1,
              subtotal: roundFinancial(cat.subtotal || 0, 2).toString(),
            },
          });

          const items = cat.items || [];
          if (items.length > 0) {
            await tx.jobCostItem.createMany({
              data: items.map((i, iIdx) => ({
                jobId: id,
                categoryId: createdCat.id,
                itemNumber: i.itemNumber || iIdx + 1,
                description: i.description,
                rcNrc: i.rcNrc || "NRC",
                quantity: roundFinancial(i.quantity || 1, 4).toString(),
                rate: roundFinancial(i.rate || 0, 2).toString(),
                totalCost: roundFinancial(i.totalCost || 0, 2).toString(),
                sortOrder: i.sortOrder || iIdx + 1,
                notes: i.notes || null,
              })),
            });
          }
        }
      }

      // 3. If costSummary provided, upsert
      if (costSummary !== undefined && costSummary !== null) {
        const csData = {
          productionCost: roundFinancial(costSummary.productionCost || 0, 2).toString(),
          runningCost: roundFinancial(costSummary.runningCost || 0, 2).toString(),
          agencyOperationFee: roundFinancial(costSummary.agencyOperationFee || 0, 2).toString(),
          agencyProductionFee: roundFinancial(costSummary.agencyProductionFee || 0, 2).toString(),
          adminCharges: roundFinancial(costSummary.adminCharges || 0, 2).toString(),
          monitoringCost: roundFinancial(costSummary.monitoringCost || 0, 2).toString(),
          artworkCharges: roundFinancial(costSummary.artworkCharges || 0, 2).toString(),
          contingencies: roundFinancial(costSummary.contingencies || 0, 2).toString(),
          subTotal: roundFinancial(costSummary.subTotal || 0, 2).toString(),
          totalBeforeTax: roundFinancial(costSummary.totalBeforeTax || 0, 2).toString(),
          taxType: costSummary.taxType || "SSCL",
          taxRate: roundFinancial(costSummary.taxRate || 2.5, 3).toString(),
          taxAmount: roundFinancial(costSummary.taxAmount || 0, 2).toString(),
          grandTotal: roundFinancial(costSummary.grandTotal || 0, 2).toString(),
          rawSummaryData: (costSummary.rawSummaryData as Prisma.InputJsonValue) ?? Prisma.DbNull,
        };

        await tx.jobCostSummary.upsert({
          where: { jobId: id },
          create: {
            jobId: id,
            ...csData,
          },
          update: csData,
        });
      }

      return job;
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

    // Re-fetch fully populated job
    const fullJob = await prisma.job.findUnique({
      where: { id },
      include: {
        documents: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
        costCategories: {
          orderBy: { sortOrder: "asc" },
          include: { items: { orderBy: { sortOrder: "asc" } } },
        },
        costItems: { orderBy: { sortOrder: "asc" } },
        costSummary: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Job "${updatedJob.name}" updated successfully.`,
      data: fullJob,
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
      // Find storage paths for documents and attachments linked to this job before deletion
      const [jobDocs, supplierAttachments] = await Promise.all([
        prisma.jobDocument.findMany({
          where: { jobId: id },
          select: { storagePath: true },
        }),
        prisma.supplierInvoiceAttachment.findMany({
          where: {
            OR: [
              { jobId: id },
              { invoice: { jobId: id } },
            ],
          },
          select: { storagePath: true },
        }),
      ]);

      const storagePathsToClean: string[] = [
        ...jobDocs.map((d) => d.storagePath).filter((p): p is string => Boolean(p)),
        ...supplierAttachments.map((a) => a.storagePath).filter((p): p is string => Boolean(p)),
      ];

      // Atomic cascade deletion in proper dependency order
      await prisma.$transaction(async (tx) => {
        // 1. Delete customer invoices & revisions
        const customerInvoices = await tx.invoice.findMany({
          where: { jobId: id },
          select: { id: true },
        });
        const invoiceIds = customerInvoices.map((inv) => inv.id);
        if (invoiceIds.length > 0) {
          await tx.invoiceRevision.deleteMany({
            where: { invoiceId: { in: invoiceIds } },
          });
          await tx.invoice.deleteMany({
            where: { id: { in: invoiceIds } },
          });
        }

        // 2. Delete supplier invoices, items, attachments, and audit logs
        const supplierInvoices = await tx.supplierInvoice.findMany({
          where: { jobId: id },
          select: { id: true },
        });
        const supplierInvoiceIds = supplierInvoices.map((s) => s.id);

        await tx.supplierInvoiceAttachment.deleteMany({
          where: {
            OR: [
              { jobId: id },
              ...(supplierInvoiceIds.length > 0 ? [{ invoiceId: { in: supplierInvoiceIds } }] : []),
            ],
          },
        });

        if (supplierInvoiceIds.length > 0) {
          await tx.supplierInvoiceAuditLog.deleteMany({
            where: { invoiceId: { in: supplierInvoiceIds } },
          });
          await tx.supplierInvoiceItem.deleteMany({
            where: { invoiceId: { in: supplierInvoiceIds } },
          });
          await tx.supplierInvoice.deleteMany({
            where: { id: { in: supplierInvoiceIds } },
          });
        }

        // 3. Delete job documents & upload logs
        await tx.jobDocument.deleteMany({ where: { jobId: id } });
        await tx.jobUploadLog.deleteMany({ where: { jobId: id } });

        // 4. Delete job approvals
        await tx.jobApproval.deleteMany({ where: { jobId: id } });

        // 5. Delete cost items, cost categories, and cost summary
        await tx.jobCostItem.deleteMany({ where: { jobId: id } });
        await tx.jobCostCategory.deleteMany({ where: { jobId: id } });
        await tx.jobCostSummary.deleteMany({ where: { jobId: id } });

        // 6. Finally delete the job itself
        await tx.job.delete({ where: { id } });
      });

      // Asynchronously clean up files from Supabase Storage without blocking the response
      if (storagePathsToClean.length > 0) {
        cleanupOrphanedStorageFiles(storagePathsToClean).catch((cleanupErr) => {
          console.warn("Storage cleanup error after job deletion:", cleanupErr);
        });
      }

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
      { success: false, error: err?.message || "Failed to delete job." },
      { status: 500 }
    );
  }
}
