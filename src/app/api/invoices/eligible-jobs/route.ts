import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";

// GET /api/invoices/eligible-jobs
// Returns all APPROVED jobs that qualify for invoice generation,
// with indicator if an invoice is already created.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Unauthorized access." },
      { status: 401 }
    );
  }

  const isAuthorized = await checkSessionPermission(session, "invoices", "view");
  if (!isAuthorized) {
    return NextResponse.json(
      { success: false, error: "Forbidden: You do not have permission to view invoice jobs." },
      { status: 403 }
    );
  }

  try {
    // Only jobs with status APPROVED (or legacy Approved / Invoice Generated)
    const jobs = await prisma.job.findMany({
      where: {
        deletedAt: null,
        OR: [
          { status: "APPROVED" },
          { status: "Approved" },
          { status: "Invoice Generated" },
          { status: "INVOICE_GENERATED" },
        ],
      },
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            version: true,
            status: true,
            grandTotal: true,
            issueDate: true,
          },
        },
        costSummary: true,
        costCategories: {
          select: {
            id: true,
            name: true,
            subtotal: true,
            items: {
              select: { id: true, description: true, quantity: true, rate: true, totalCost: true },
            },
          },
        },
        documents: {
          where: { deletedAt: null },
          select: { id: true, fileName: true, fileUrl: true, fileSize: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = jobs.map((j) => ({
      id: j.id,
      jobCode: j.jobCode,
      name: j.name,
      clientName: j.clientName || "Valued Client",
      date: j.date,
      commencingDate: j.commencingDate || j.date,
      handledBy: j.handledBy || "Admin",
      description: j.description || "",
      status: j.status,
      totalCost: j.totalCost || 0,
      grandTotal: j.grandTotal || 0,
      costSummary: j.costSummary,
      costCategoriesCount: j.costCategories.length,
      hasInvoice: Boolean(j.invoice),
      invoice: j.invoice
        ? {
            id: j.invoice.id,
            invoiceNumber: j.invoice.invoiceNumber,
            version: j.invoice.version,
            status: j.invoice.status,
            grandTotal: j.invoice.grandTotal,
            issueDate: j.invoice.issueDate.toISOString(),
          }
        : null,
      documents: j.documents,
    }));

    return NextResponse.json({
      success: true,
      data: formatted,
      counts: {
        totalApproved: formatted.length,
        readyToGenerate: formatted.filter((j) => !j.hasInvoice).length,
        alreadyGenerated: formatted.filter((j) => j.hasInvoice).length,
      },
    });
  } catch (err: any) {
    console.error("GET /api/invoices/eligible-jobs error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to retrieve eligible jobs for invoice generation." },
      { status: 500 }
    );
  }
}
