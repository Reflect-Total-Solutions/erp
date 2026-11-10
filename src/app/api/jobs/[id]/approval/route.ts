import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { checkSessionPermission } from "@/lib/permissions";
import { canUserAccessRecord } from "@/lib/data-visibility";

// POST /api/jobs/[id]/approval
// Body: { action: "APPROVE" | "REJECT" | "MOVE_TO_PENDING" | "RESET", reason?: string, notes?: string }
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

  const { id } = await params;
  const isAdmin = session.roles.some((r) => r.toLowerCase() === "admin");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  let action = String(body.action || "").toUpperCase().trim();
  if (action === "RESET") action = "MOVE_TO_PENDING";

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";

  if (!["APPROVE", "REJECT", "MOVE_TO_PENDING"].includes(action)) {
    return NextResponse.json(
      { success: false, error: "Invalid approval action. Must be APPROVE, REJECT, or MOVE_TO_PENDING." },
      { status: 400 }
    );
  }

  // Enforce granular database-driven permission per action
  if (action === "APPROVE") {
    const canApprove = await checkSessionPermission(session, "approvals", "approve");
    if (!canApprove) {
      return NextResponse.json(
        { success: false, error: "Forbidden: You do not have permission to approve jobs." },
        { status: 403 }
      );
    }
  } else if (action === "REJECT") {
    const canReject = await checkSessionPermission(session, "approvals", "reject");
    if (!canReject) {
      return NextResponse.json(
        { success: false, error: "Forbidden: You do not have permission to reject jobs." },
        { status: 403 }
      );
    }
  } else if (action === "MOVE_TO_PENDING") {
    const canMove = await checkSessionPermission(session, "approvals", "moveToPending");
    if (!canMove) {
      return NextResponse.json(
        { success: false, error: "Forbidden: You do not have permission to move jobs back to Pending Approval." },
        { status: 403 }
      );
    }
  }

  // 2. Enforce mandatory reasons
  if (action === "REJECT" && !reason) {
    return NextResponse.json(
      { success: false, error: "Rejection reason is mandatory." },
      { status: 422 }
    );
  }

  if (action === "MOVE_TO_PENDING" && !reason) {
    return NextResponse.json(
      { success: false, error: "A mandatory reason is required to move a Job back to Pending Approval." },
      { status: 422 }
    );
  }

  try {
    const job = await prisma.job.findUnique({
      where: { id, deletedAt: null },
      include: {
        invoice: true,
        submittedBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!job) {
      return NextResponse.json(
        { success: false, error: `Job with ID "${id}" was not found.` },
        { status: 404 }
      );
    }

    // Verify approver scope
    const scopeCheck = await canUserAccessRecord(session, "approvals", job.submittedById, "view");
    if (!scopeCheck.allowed) {
      return NextResponse.json(
        { success: false, error: "Forbidden: This job is outside your authorized approval scope." },
        { status: 403 }
      );
    }

    const currentStatus = job.status.toUpperCase();
    const isCurrentlyApproved = currentStatus === "APPROVED" || currentStatus === "ACTIVE";
    const isCurrentlyPending = currentStatus === "PENDING_APPROVAL" || currentStatus === "PENDING" || currentStatus === "IN REVIEW";
    const isCurrentlyRejected = currentStatus === "REJECTED";

    // Validate transitions
    if (action === "APPROVE") {
      if (isCurrentlyApproved) {
        return NextResponse.json(
          { success: false, error: "This job is already approved." },
          { status: 400 }
        );
      }
    }

    if (action === "REJECT") {
      if (isCurrentlyRejected) {
        return NextResponse.json(
          { success: false, error: "This job is already rejected." },
          { status: 400 }
        );
      }
      // If job has an issued invoice, non-admins cannot reject it
      if (job.invoice && !isAdmin) {
        return NextResponse.json(
          { success: false, error: "Cannot reject: An active invoice is already generated. Only administrators can perform this controlled correction." },
          { status: 403 }
        );
      }
    }

    if (action === "MOVE_TO_PENDING") {
      if (isCurrentlyPending) {
        return NextResponse.json(
          { success: false, error: "This job is already in Pending Approval status." },
          { status: 400 }
        );
      }

      // Strict Approval Lock: Prevent Approved Jobs with active Supplier Invoices or Purchase Orders from returning to Pending
      if (isCurrentlyApproved) {
        const [activeSupplierInvoices, activePurchaseOrders] = await Promise.all([
          prisma.supplierInvoice.findMany({
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
          }),
          prisma.purchaseOrder.findMany({
            where: {
              jobId: id,
              deletedAt: null,
              status: { notIn: ["CANCELLED", "REJECTED"] },
            },
            select: {
              id: true,
              poNumber: true,
              status: true,
              grandTotal: true,
            },
          }),
        ]);

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
              jobNumber: job.jobCode || "NO-CODE",
              jobTitle: job.name,
              supplierInvoiceCount,
              totalSupplierInvoiceAmount,
              statusChange: "BLOCKED",
            },
            { status: 422 }
          );
        }

        if (activePurchaseOrders.length > 0) {
          return NextResponse.json(
            {
              success: false,
              blocked: true,
              error: `Cannot Move Job to Pending: ${activePurchaseOrders.length} active Purchase Order(s) (${activePurchaseOrders
                .map((p) => p.poNumber)
                .slice(0, 3)
                .join(", ")}) are linked to this Job.`,
              title: "Cannot Move Job to Pending",
              message: `Active Purchase Orders exist for this Job. Cancel or remove those Purchase Orders before reverting approval.`,
              jobNumber: job.jobCode || "NO-CODE",
              jobTitle: job.name,
              activePoCount: activePurchaseOrders.length,
              statusChange: "BLOCKED",
            },
            { status: 422 }
          );
        }
      }
    }

    const previousStatus = job.status;
    let newStatus = "APPROVED";

    if (action === "APPROVE") {
      newStatus = "APPROVED";
    } else if (action === "REJECT") {
      newStatus = "REJECTED";
    } else if (action === "MOVE_TO_PENDING") {
      newStatus = "PENDING_APPROVAL";
    }

    // Atomic transaction: update status, record approval history, preserve existing invoice & concurrency check
    const result = await prisma.$transaction(async (tx) => {
      if (action === "MOVE_TO_PENDING" && isCurrentlyApproved) {
        const [activeInvoiceCount, activePoCount] = await Promise.all([
          tx.supplierInvoice.count({
            where: {
              jobId: id,
              deletedAt: null,
              status: { not: "CANCELLED" },
            },
          }),
          tx.purchaseOrder.count({
            where: {
              jobId: id,
              deletedAt: null,
              status: { notIn: ["CANCELLED", "REJECTED"] },
            },
          }),
        ]);
        if (activeInvoiceCount > 0) {
          throw new Error(
            "Cannot Move Job to Pending: Supplier invoices have already been recorded for this Job. The Job cannot be moved back to Pending Approval."
          );
        }
        if (activePoCount > 0) {
          throw new Error(
            "Cannot Move Job to Pending: Active Purchase Orders exist for this Job."
          );
        }
      }

      const updatedJob = await tx.job.update({
        where: { id },
        data: {
          status: newStatus,
        },
      });

      const approvalRecord = await tx.jobApproval.create({
        data: {
          jobId: id,
          userId: session.userId,
          action,
          previousStatus,
          newStatus,
          reason: reason || null,
          notes: notes || (job.invoice ? `Existing invoice ${job.invoice.invoiceNumber} preserved.` : null),
        },
      });

      return { updatedJob, approvalRecord };
    });

    // Record audit log
    await logAuditEvent({
      userId: session.userId,
      action:
        action === "APPROVE"
          ? "JOB_APPROVED"
          : action === "REJECT"
          ? "JOB_REJECTED"
          : "JOB_MOVED_TO_PENDING",
      resource: "jobs",
      resourceId: id,
      details: {
        jobCode: job.jobCode,
        jobName: job.name,
        clientName: job.clientName,
        action,
        previousStatus,
        newStatus,
        reason: reason || null,
        notes: notes || null,
        grandTotal: job.grandTotal,
        hasExistingInvoice: Boolean(job.invoice),
        existingInvoiceNumber: job.invoice?.invoiceNumber || null,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        job: result.updatedJob,
        approval: result.approvalRecord,
      },
      message:
        action === "APPROVE"
          ? `Job "${job.name}" approved successfully and is now eligible for Invoice Management.`
          : action === "REJECT"
          ? `Job "${job.name}" has been rejected.`
          : `Job "${job.name}" moved back to Pending Approval successfully.`,
    });
  } catch (err: any) {
    console.error(`POST /api/jobs/${id}/approval error:`, err);
    return NextResponse.json(
      { success: false, error: "Failed to process job approval action." },
      { status: 500 }
    );
  }
}

// GET /api/jobs/[id]/approval
// Returns approval history trail
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Unauthorized access." },
      { status: 401 }
    );
  }

  const { id } = await params;
  const isAdmin = session.roles.some((r) => r.toLowerCase() === "admin");

  try {
    const history = await prisma.jobApproval.findMany({
      where: { jobId: id },
      include: {
        user: {
          select: { id: true, name: true, email: true, jobTitle: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      data: history.map((h) => ({
        id: h.id,
        jobId: h.jobId,
        action: h.action,
        previousStatus: h.previousStatus,
        newStatus: h.newStatus,
        reason: h.reason,
        notes: h.notes,
        createdAt: h.createdAt.toISOString(),
        approver: h.user
          ? {
              id: h.user.id,
              name: h.user.name,
              email: h.user.email,
              jobTitle: h.user.jobTitle,
            }
          : null,
      })),
    });
  } catch (err: any) {
    console.error(`GET /api/jobs/${id}/approval error:`, err);
    return NextResponse.json(
      { success: false, error: "Failed to load approval history." },
      { status: 500 }
    );
  }
}
