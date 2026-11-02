import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { checkSessionPermission } from "@/lib/permissions";

// GET /api/invoices/[id]
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

  const isAuthorized = await checkSessionPermission(session, "invoices", "view");
  if (!isAuthorized) {
    return NextResponse.json(
      { success: false, error: "Forbidden: You do not have permission to view invoices." },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id, deletedAt: null },
      include: {
        job: {
          include: {
            documents: { where: { deletedAt: null } },
            costCategories: {
              include: { items: true },
            },
            costSummary: true,
          },
        },
        createdBy: {
          select: { id: true, name: true, email: true, jobTitle: true },
        },
        revisions: {
          orderBy: { version: "desc" },
          include: {
            regeneratedBy: {
              select: { id: true, name: true, email: true, jobTitle: true },
            },
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: `Invoice with ID "${id}" was not found.` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        jobId: invoice.jobId,
        version: invoice.version,
        clientName: invoice.clientName,
        clientAddress: invoice.clientAddress || "",
        clientEmail: invoice.clientEmail || "",
        issueDate: invoice.issueDate.toISOString().split("T")[0],
        dueDate: invoice.dueDate ? invoice.dueDate.toISOString().split("T")[0] : null,
        subTotal: invoice.subTotal,
        taxType: invoice.taxType || "SSCL",
        taxRate: invoice.taxRate || 2.5,
        taxAmount: invoice.taxAmount,
        grandTotal: invoice.grandTotal,
        status: invoice.status,
        itemsSnapshot: invoice.itemsSnapshot,
        costSummarySnapshot: invoice.costSummarySnapshot,
        notes: invoice.notes || "",
        terms: invoice.terms || "",
        createdBy: invoice.createdBy,
        job: invoice.job,
        revisions: invoice.revisions.map((rev) => ({
          id: rev.id,
          version: rev.version,
          previousInvoiceNumber: rev.previousInvoiceNumber,
          reason: rev.reason,
          snapshot: rev.snapshot,
          regeneratedBy: rev.regeneratedBy,
          createdAt: rev.createdAt.toISOString(),
        })),
        createdAt: invoice.createdAt.toISOString(),
        updatedAt: invoice.updatedAt.toISOString(),
      },
    });
  } catch (err: any) {
    console.error(`GET /api/invoices/${id} error:`, err);
    return NextResponse.json(
      { success: false, error: "Failed to retrieve invoice." },
      { status: 500 }
    );
  }
}

// PATCH /api/invoices/[id]
// Update status (e.g. ISSUED, PAID, CANCELLED) or metadata
export async function PATCH(
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

  const isAuthorized = await checkSessionPermission(session, "invoices", "edit");
  if (!isAuthorized) {
    return NextResponse.json(
      { success: false, error: "Forbidden: You do not have permission to modify invoices." },
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

  const { status, notes, terms, dueDate, clientAddress, clientEmail } = body;

  try {
    const existing = await prisma.invoice.findUnique({ where: { id, deletedAt: null } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: `Invoice with ID "${id}" was not found.` },
        { status: 404 }
      );
    }

    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        ...(status && { status: status.toUpperCase() }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(terms !== undefined && { terms: terms?.trim() || null }),
        ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
        ...(clientAddress !== undefined && { clientAddress: clientAddress?.trim() || null }),
        ...(clientEmail !== undefined && { clientEmail: clientEmail?.trim() || null }),
      },
    });

    if (status && status !== existing.status) {
      await logAuditEvent({
        userId: session.userId,
        action: "INVOICE_STATUS_CHANGED",
        resource: "invoices",
        resourceId: id,
        details: {
          invoiceNumber: existing.invoiceNumber,
          previousStatus: existing.status,
          newStatus: status.toUpperCase(),
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: updated,
      message: `Invoice ${existing.invoiceNumber} updated successfully.`,
    });
  } catch (err: any) {
    console.error(`PATCH /api/invoices/${id} error:`, err);
    return NextResponse.json(
      { success: false, error: "Failed to update invoice." },
      { status: 500 }
    );
  }
}
