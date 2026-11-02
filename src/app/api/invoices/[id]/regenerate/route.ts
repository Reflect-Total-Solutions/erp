import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { roundFinancial } from "@/lib/financial";
import { logAuditEvent } from "@/lib/audit";

// POST /api/invoices/[id]/regenerate
// Restrict Re-Generation to Admin Only (Section 5)
// Body: { reason: string, notes?: string, terms?: string, dueDate?: string }
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

  // 1. Strict Role Authorization: ADMIN ONLY
  const isAdmin = session.roles.some((r) => r.toLowerCase() === "admin");
  if (!isAdmin) {
    return NextResponse.json(
      {
        success: false,
        error: "Access Denied: Only users with the ADMIN role can regenerate or correct invoices.",
      },
      { status: 403 }
    );
  }

  const { id } = await params;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return NextResponse.json(
      {
        success: false,
        error: "A detailed regeneration reason is mandatory for admin audit compliance.",
      },
      { status: 422 }
    );
  }

  const { notes, terms, dueDate } = body;

  try {
    // 2. Fetch existing invoice with Job data
    const existingInvoice = await prisma.invoice.findUnique({
      where: { id, deletedAt: null },
      include: {
        job: {
          include: {
            costCategories: {
              orderBy: { sortOrder: "asc" },
              include: { items: { orderBy: { sortOrder: "asc" } } },
            },
            costItems: { orderBy: { sortOrder: "asc" } },
            costSummary: true,
          },
        },
      },
    });

    if (!existingInvoice) {
      return NextResponse.json(
        { success: false, error: `Invoice with ID "${id}" was not found.` },
        { status: 404 }
      );
    }

    const job = existingInvoice.job;
    if (!job) {
      return NextResponse.json(
        { success: false, error: "Associated job not found for this invoice." },
        { status: 404 }
      );
    }

    // 3. Freeze current invoice as immutable snapshot
    const previousSnapshot = {
      invoiceNumber: existingInvoice.invoiceNumber,
      version: existingInvoice.version,
      clientName: existingInvoice.clientName,
      clientAddress: existingInvoice.clientAddress,
      clientEmail: existingInvoice.clientEmail,
      issueDate: existingInvoice.issueDate.toISOString(),
      dueDate: existingInvoice.dueDate ? existingInvoice.dueDate.toISOString() : null,
      subTotal: existingInvoice.subTotal,
      taxType: existingInvoice.taxType,
      taxRate: existingInvoice.taxRate,
      taxAmount: existingInvoice.taxAmount,
      grandTotal: existingInvoice.grandTotal,
      status: existingInvoice.status,
      itemsSnapshot: existingInvoice.itemsSnapshot,
      costSummarySnapshot: existingInvoice.costSummarySnapshot,
      notes: existingInvoice.notes,
      terms: existingInvoice.terms,
      createdById: existingInvoice.createdById,
      updatedAt: existingInvoice.updatedAt.toISOString(),
    };

    // 4. Calculate fresh amounts and snapshots from the Job
    const freshItemsSnapshot = {
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
    const nextVersion = existingInvoice.version + 1;

    // 5. Execute atomic transaction: Save revision record & update invoice
    const regenerated = await prisma.$transaction(async (tx) => {
      // Create InvoiceRevision record preserving previous version
      await tx.invoiceRevision.create({
        data: {
          invoiceId: id,
          version: existingInvoice.version,
          previousInvoiceNumber: existingInvoice.invoiceNumber,
          regeneratedById: session.userId,
          reason,
          snapshot: previousSnapshot,
        },
      });

      // Update Invoice to next version with fresh snapshot
      const updated = await tx.invoice.update({
        where: { id },
        data: {
          version: nextVersion,
          clientName: job.clientName || existingInvoice.clientName,
          subTotal: subTotalDecimal.toString(),
          taxType: summary.taxType || "SSCL",
          taxRate: summary.taxRate?.toString() || "2.5",
          taxAmount: taxAmountDecimal.toString(),
          grandTotal: grandTotalDecimal.toString(),
          itemsSnapshot: freshItemsSnapshot,
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
          ...(notes !== undefined && { notes: notes.trim() || null }),
          ...(terms !== undefined && { terms: terms.trim() || null }),
          ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
          status: "GENERATED",
        },
        include: {
          revisions: {
            orderBy: { version: "desc" },
            include: { regeneratedBy: { select: { id: true, name: true, email: true } } },
          },
        },
      });

      return updated;
    });

    // 6. Record in Audit Log
    await logAuditEvent({
      userId: session.userId,
      action: "INVOICE_REGENERATED",
      resource: "invoices",
      resourceId: id,
      details: {
        invoiceNumber: existingInvoice.invoiceNumber,
        jobId: job.id,
        jobCode: job.jobCode,
        previousVersion: existingInvoice.version,
        newVersion: nextVersion,
        regenerationReason: reason,
        previousGrandTotal: existingInvoice.grandTotal,
        newGrandTotal: grandTotalDecimal.toNumber(),
      },
    });

    return NextResponse.json({
      success: true,
      data: regenerated,
      message: `Invoice ${existingInvoice.invoiceNumber} successfully regenerated to Version ${nextVersion}. Previous version archived to revision history.`,
    });
  } catch (err: any) {
    console.error(`POST /api/invoices/${id}/regenerate error:`, err);
    return NextResponse.json(
      { success: false, error: "Failed to regenerate invoice." },
      { status: 500 }
    );
  }
}
