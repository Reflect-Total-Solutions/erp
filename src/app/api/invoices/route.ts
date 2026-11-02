import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { roundFinancial } from "@/lib/financial";
import { logAuditEvent } from "@/lib/audit";
import { checkSessionPermission } from "@/lib/permissions";

// GET /api/invoices
// Query params: ?status=all|GENERATED|ISSUED|PAID&search=...&jobId=...
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Unauthorized access. Please log in." },
      { status: 401 }
    );
  }

  const isAuthorized = await checkSessionPermission(session, "invoices", "view");
  if (!isAuthorized) {
    return NextResponse.json(
      { success: false, error: "Forbidden: You do not have permission to view invoices." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const search = searchParams.get("search")?.trim() || "";
  const jobId = searchParams.get("jobId");

  const where: any = {
    deletedAt: null,
  };

  if (status && status !== "all") {
    where.status = status.toUpperCase();
  }

  if (jobId) {
    where.jobId = jobId;
  }

  if (search) {
    where.OR = [
      { invoiceNumber: { contains: search, mode: "insensitive" } },
      { clientName: { contains: search, mode: "insensitive" } },
      { job: { jobCode: { contains: search, mode: "insensitive" } } },
      { job: { name: { contains: search, mode: "insensitive" } } },
    ];
  }

  try {
    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        job: {
          select: {
            id: true,
            jobCode: true,
            name: true,
            date: true,
            commencingDate: true,
            clientName: true,
            handledBy: true,
            status: true,
            totalCost: true,
            grandTotal: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        revisions: {
          orderBy: { version: "desc" },
          select: {
            id: true,
            version: true,
            reason: true,
            previousInvoiceNumber: true,
            createdAt: true,
            regeneratedBy: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      jobId: inv.jobId,
      version: inv.version,
      clientName: inv.clientName,
      clientAddress: inv.clientAddress || "",
      clientEmail: inv.clientEmail || "",
      issueDate: inv.issueDate.toISOString().split("T")[0],
      dueDate: inv.dueDate ? inv.dueDate.toISOString().split("T")[0] : null,
      subTotal: inv.subTotal,
      taxType: inv.taxType || "SSCL",
      taxRate: inv.taxRate || 2.5,
      taxAmount: inv.taxAmount,
      grandTotal: inv.grandTotal,
      status: inv.status,
      itemsSnapshot: inv.itemsSnapshot,
      costSummarySnapshot: inv.costSummarySnapshot,
      notes: inv.notes || "",
      terms: inv.terms || "",
      createdById: inv.createdById,
      createdByName: inv.createdBy?.name || "System Admin",
      job: inv.job,
      revisions: inv.revisions.map((rev) => ({
        id: rev.id,
        version: rev.version,
        reason: rev.reason,
        previousInvoiceNumber: rev.previousInvoiceNumber,
        regeneratedByName: rev.regeneratedBy?.name || "Admin",
        createdAt: rev.createdAt.toISOString(),
      })),
      createdAt: inv.createdAt.toISOString(),
      updatedAt: inv.updatedAt.toISOString(),
    }));

    return NextResponse.json({
      success: true,
      data: formatted,
    });
  } catch (err: any) {
    console.error("GET /api/invoices error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to retrieve invoices from database." },
      { status: 500 }
    );
  }
}

// POST /api/invoices
// Generate invoice from approved Job
// Body: { jobId: string, notes?: string, terms?: string, dueDate?: string }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Unauthorized access. Please log in." },
      { status: 401 }
    );
  }

  const isAuthorized = await checkSessionPermission(session, "invoices", "create");
  if (!isAuthorized) {
    return NextResponse.json(
      { success: false, error: "Forbidden: You do not have permission to generate invoices." },
      { status: 403 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  const { jobId, notes, terms, dueDate } = body;
  if (!jobId || typeof jobId !== "string") {
    return NextResponse.json(
      { success: false, error: "Approved Job ID is required to generate an invoice." },
      { status: 422 }
    );
  }

  try {
    // 1. Fetch complete job with dynamic costs & summary
    const job = await prisma.job.findUnique({
      where: { id: jobId, deletedAt: null },
      include: {
        costCategories: {
          orderBy: { sortOrder: "asc" },
          include: {
            items: { orderBy: { sortOrder: "asc" } },
          },
        },
        costItems: { orderBy: { sortOrder: "asc" } },
        costSummary: true,
        invoice: true,
      },
    });

    if (!job) {
      return NextResponse.json(
        { success: false, error: `Job with ID "${jobId}" was not found.` },
        { status: 404 }
      );
    }

    // 2. Workflow Validation: Only APPROVED jobs can generate invoices!
    const jobStatusNorm = job.status.toUpperCase();
    const isApproved =
      jobStatusNorm === "APPROVED" ||
      jobStatusNorm === "INVOICE_GENERATED" ||
      jobStatusNorm === "INVOICE GENERATED";

    if (!isApproved) {
      return NextResponse.json(
        {
          success: false,
          error: `Workflow violation: Only APPROVED jobs can generate invoices. This job status is currently "${job.status}". Please approve the job first.`,
        },
        { status: 400 }
      );
    }

    // 3. Prevent Duplicate Invoice Generation (Section 4)
    if (job.invoice) {
      return NextResponse.json(
        {
          success: false,
          isDuplicate: true,
          error: `Duplicate Invoice Blocked: An invoice has already been generated for Job "${job.jobCode}" (${job.name}).`,
          existingInvoice: {
            id: job.invoice.id,
            invoiceNumber: job.invoice.invoiceNumber,
            status: job.invoice.status,
            grandTotal: job.invoice.grandTotal,
            issueDate: job.invoice.issueDate.toISOString(),
          },
        },
        { status: 409 }
      );
    }

    // 4. Generate next Invoice Number (e.g. INV-YYYY-001)
    const currentYear = new Date().getFullYear();
    const invoiceCount = await prisma.invoice.count();
    let seq = invoiceCount + 1;
    let candidateInvoiceNum = `INV-${currentYear}-${String(seq).padStart(4, "0")}`;

    let existingInvWithNum = await prisma.invoice.findUnique({
      where: { invoiceNumber: candidateInvoiceNum },
    });
    while (existingInvWithNum) {
      seq++;
      candidateInvoiceNum = `INV-${currentYear}-${String(seq).padStart(4, "0")}`;
      existingInvWithNum = await prisma.invoice.findUnique({
        where: { invoiceNumber: candidateInvoiceNum },
      });
    }

    // 5. Freeze line items & cost summary snapshots
    const itemsSnapshot = {
      categories: job.costCategories.map((c) => ({
        id: c.id,
        name: c.name,
        sortOrder: c.sortOrder,
        subtotal: c.subtotal,
        items: c.items.map((i) => ({
          id: i.id,
          itemNumber: i.itemNumber,
          description: i.description,
          rcNrc: i.rcNrc,
          quantity: i.quantity,
          rate: i.rate,
          totalCost: i.totalCost,
        })),
      })),
      allCostItems: job.costItems.map((i) => ({
        id: i.id,
        itemNumber: i.itemNumber,
        description: i.description,
        rcNrc: i.rcNrc,
        quantity: i.quantity,
        rate: i.rate,
        totalCost: i.totalCost,
      })),
    };

    const summary = job.costSummary || {
      productionCost: job.totalCost || 0,
      runningCost: 0,
      agencyOperationFee: 0,
      agencyProductionFee: 0,
      adminCharges: 0,
      monitoringCost: 0,
      artworkCharges: 0,
      contingencies: 0,
      subTotal: job.totalCost || 0,
      totalBeforeTax: job.totalCost || 0,
      taxType: "SSCL",
      taxRate: 2.5,
      taxAmount: roundFinancial(Number(job.totalCost || 0) * 0.025, 2),
      grandTotal: job.grandTotal || job.totalCost || 0,
    };

    const subTotalDecimal = roundFinancial(summary.subTotal || job.totalCost || 0, 2);
    const taxAmountDecimal = roundFinancial(summary.taxAmount || 0, 2);
    const grandTotalDecimal = roundFinancial(summary.grandTotal || job.grandTotal || subTotalDecimal, 2);

    // 6. Execute atomic Prisma transaction
    const newInvoice = await prisma.$transaction(async (tx) => {
      // Check again inside transaction to prevent race conditions
      const doubleCheck = await tx.invoice.findUnique({ where: { jobId } });
      if (doubleCheck) {
        throw new Error("DUPLICATE_INVOICE_RACE_DETECTED");
      }

      const created = await tx.invoice.create({
        data: {
          invoiceNumber: candidateInvoiceNum,
          jobId,
          version: 1,
          clientName: job.clientName || "Valued Client",
          clientAddress: null,
          clientEmail: null,
          issueDate: new Date(),
          dueDate: dueDate ? new Date(dueDate) : null,
          subTotal: subTotalDecimal.toString(),
          taxType: summary.taxType || "SSCL",
          taxRate: summary.taxRate?.toString() || "2.5",
          taxAmount: taxAmountDecimal.toString(),
          grandTotal: grandTotalDecimal.toString(),
          status: "GENERATED",
          itemsSnapshot,
          costSummarySnapshot: {
            productionCost: summary.productionCost,
            runningCost: summary.runningCost,
            agencyOperationFee: summary.agencyOperationFee,
            agencyProductionFee: summary.agencyProductionFee,
            adminCharges: summary.adminCharges,
            monitoringCost: summary.monitoringCost,
            artworkCharges: summary.artworkCharges,
            contingencies: summary.contingencies,
            subTotal: summary.subTotal,
            totalBeforeTax: summary.totalBeforeTax,
            taxType: summary.taxType,
            taxRate: summary.taxRate,
            taxAmount: summary.taxAmount,
            grandTotal: summary.grandTotal,
          },
          notes: notes?.trim() || null,
          terms: terms?.trim() || "Payment due within 30 days of invoice date.",
          createdById: session.userId,
        },
      });

      // Keep job status as APPROVED with invoice linked
      await tx.job.update({
        where: { id: jobId },
        data: { status: "APPROVED" },
      });

      return created;
    });

    // 7. Log audit event
    await logAuditEvent({
      userId: session.userId,
      action: "INVOICE_GENERATED",
      resource: "invoices",
      resourceId: newInvoice.id,
      details: {
        invoiceNumber: newInvoice.invoiceNumber,
        jobId,
        jobCode: job.jobCode,
        clientName: newInvoice.clientName,
        grandTotal: newInvoice.grandTotal,
        version: 1,
      },
    });

    return NextResponse.json({
      success: true,
      data: newInvoice,
      message: `Invoice ${newInvoice.invoiceNumber} generated successfully for Job ${job.jobCode}.`,
    });
  } catch (err: any) {
    if (err?.message === "DUPLICATE_INVOICE_RACE_DETECTED" || err?.code === "P2002") {
      return NextResponse.json(
        {
          success: false,
          isDuplicate: true,
          error: "An invoice has already been created for this job by a concurrent request.",
        },
        { status: 409 }
      );
    }
    console.error("POST /api/invoices error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to generate invoice." },
      { status: 500 }
    );
  }
}
