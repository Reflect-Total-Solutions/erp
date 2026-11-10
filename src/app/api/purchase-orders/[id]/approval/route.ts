import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";
import { canUserAccessRecord } from "@/lib/data-visibility";
import { logAuditEvent } from "@/lib/audit";
import { recalculateJobFinances } from "@/lib/financial-recalculation";
import { poApprovalActionSchema } from "@/lib/validations/purchase-order";
import { validatePoItemsAndBudget } from "@/lib/po-helpers";

// POST /api/purchase-orders/[id]/approval
// Actions: SUBMIT | APPROVE | REJECT | ISSUE | CANCEL | RETURN_TO_DRAFT
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized access." }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = poApprovalActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid approval request.",
        issues: parsed.error.flatten().fieldErrors,
      },
      { status: 422 }
    );
  }

  const { action, reason, notes } = parsed.data;
  const trimmedReason = (reason || "").trim();
  const trimmedNotes = (notes || "").trim();

  // Granular action permission checks
  const permActionMap: Record<string, any> = {
    SUBMIT: "submit",
    APPROVE: "approve",
    REJECT: "reject",
    ISSUE: "issue",
    CANCEL: "cancel",
    RETURN_TO_DRAFT: "edit",
  };
  const requiredPerm = permActionMap[action];
  const hasPerm = await checkSessionPermission(session, "purchaseOrders", requiredPerm);
  if (!hasPerm) {
    return NextResponse.json(
      {
        success: false,
        error: `Forbidden: You do not have "${requiredPerm}" permission on Purchase Orders.`,
      },
      { status: 403 }
    );
  }

  if (action === "REJECT" && !trimmedReason) {
    return NextResponse.json(
      { success: false, error: "A rejection reason is mandatory." },
      { status: 422 }
    );
  }
  if (action === "CANCEL" && !trimmedReason) {
    return NextResponse.json(
      { success: false, error: "A cancellation reason is mandatory." },
      { status: 422 }
    );
  }

  try {
    const db = getPrisma();
    const po = await (db.purchaseOrder as any).findFirst({
      where: { id, deletedAt: null },
      include: {
        job: true,
        items: true,
        supplierInvoices: {
          where: { deletedAt: null, status: { not: "CANCELLED" } },
          select: { id: true, invoiceNumber: true },
        },
      },
    });

    if (!po) {
      return NextResponse.json({ success: false, error: "Purchase Order not found." }, { status: 404 });
    }

    const scopeAction =
      action === "SUBMIT" || action === "RETURN_TO_DRAFT"
        ? "submit"
        : action === "CANCEL"
        ? "cancel"
        : "view";

    const scopeCheck = await canUserAccessRecord(
      session,
      "purchaseOrders",
      po.createdById,
      scopeAction
    );
    if (!scopeCheck.allowed) {
      return NextResponse.json(
        { success: false, error: scopeCheck.reason || "Forbidden: Outside your authorized scope." },
        { status: 403 }
      );
    }

    const prevStatus = po.status;
    let nextStatus = prevStatus;
    let nextApprovalStatus = po.approvalStatus;
    const now = new Date();
    const extraData: any = {};

    // Prevent self-approval if not admin (employees cannot approve own POs; admins/supervisors with approve perms can approve)
    const isAdmin = session.roles?.some((r) => r.toLowerCase() === "admin");
    if ((action === "APPROVE" || action === "REJECT") && po.createdById === session.userId && !isAdmin) {
      return NextResponse.json(
        {
          success: false,
          error: "Segregation of Duties: Non-admin users cannot approve or reject their own Purchase Orders.",
        },
        { status: 403 }
      );
    }

    if (action === "SUBMIT") {
      if (!["DRAFT", "REJECTED"].includes(prevStatus)) {
        return NextResponse.json(
          { success: false, error: `Only DRAFT or REJECTED POs can be submitted (current: ${prevStatus}).` },
          { status: 422 }
        );
      }
      // Re-validate Job cost budget upon submission
      const canOverrideBudget = await checkSessionPermission(
        session,
        "purchaseOrders",
        "overrideJobBudget"
      );
      const budgetCheck = await validatePoItemsAndBudget({
        jobId: po.jobId,
        items: po.items,
        poOverrideReason: po.budgetOverrideReason,
        excludePoId: po.id,
        canOverrideBudget,
        poGrandTotal: Number(po.grandTotal || 0),
        client: db,
      });
      if (!budgetCheck.valid) {
        return NextResponse.json(
          { success: false, code: budgetCheck.code, error: budgetCheck.error },
          { status: budgetCheck.status || 422 }
        );
      }

      nextStatus = "PENDING";
      nextApprovalStatus = "PENDING";
      extraData.submittedById = session.userId;
      extraData.submittedAt = now;
    } else if (action === "APPROVE") {
      if (prevStatus !== "PENDING") {
        return NextResponse.json(
          { success: false, error: `Only PENDING POs can be approved (current: ${prevStatus}).` },
          { status: 422 }
        );
      }
      nextStatus = "APPROVED";
      nextApprovalStatus = "APPROVED";
      extraData.approvedById = session.userId;
      extraData.approvedAt = now;
    } else if (action === "REJECT") {
      if (prevStatus !== "PENDING") {
        return NextResponse.json(
          { success: false, error: `Only PENDING POs can be rejected (current: ${prevStatus}).` },
          { status: 422 }
        );
      }
      nextStatus = "REJECTED";
      nextApprovalStatus = "REJECTED";
      extraData.rejectedById = session.userId;
      extraData.rejectedAt = now;
      extraData.rejectionReason = trimmedReason;
    } else if (action === "ISSUE") {
      if (prevStatus !== "APPROVED") {
        return NextResponse.json(
          { success: false, error: `Only APPROVED POs can be issued (current: ${prevStatus}).` },
          { status: 422 }
        );
      }
      nextStatus = "ISSUED";
      extraData.issuedById = session.userId;
      extraData.issuedAt = now;
    } else if (action === "RETURN_TO_DRAFT") {
      if (!["REJECTED", "PENDING"].includes(prevStatus)) {
        return NextResponse.json(
          { success: false, error: `Cannot return PO in status "${prevStatus}" to Draft.` },
          { status: 422 }
        );
      }
      nextStatus = "DRAFT";
      nextApprovalStatus = "DRAFT";
    } else if (action === "CANCEL") {
      if (["CANCELLED"].includes(prevStatus)) {
        return NextResponse.json(
          { success: false, error: "This Purchase Order is already cancelled." },
          { status: 400 }
        );
      }
      if ((po.supplierInvoices || []).length > 0) {
        return NextResponse.json(
          {
            success: false,
            blocked: true,
            error: `Cannot cancel Purchase Order "${po.poNumber}": Active Supplier Invoice(s) (${po.supplierInvoices
              .map((s: any) => s.invoiceNumber)
              .join(", ")}) are linked to this PO. Cancel the linked Supplier Invoices first.`,
          },
          { status: 422 }
        );
      }
      nextStatus = "CANCELLED";
      extraData.cancelledById = session.userId;
      extraData.cancelledAt = now;
      extraData.cancellationReason = trimmedReason;
    }

    const updatedPo = await db.$transaction(async (tx) => {
      const updated = await (tx.purchaseOrder as any).update({
        where: { id },
        data: {
          status: nextStatus,
          approvalStatus: nextApprovalStatus,
          ...extraData,
          updatedById: session.userId,
        },
      });

      await (tx.purchaseOrderApprovalHistory as any).create({
        data: {
          purchaseOrderId: id,
          userId: session.userId,
          action,
          previousStatus: prevStatus,
          newStatus: nextStatus,
          reason: trimmedReason || null,
          notes: trimmedNotes || null,
        },
      });

      await (tx.purchaseOrderAuditLog as any).create({
        data: {
          purchaseOrderId: id,
          userId: session.userId,
          action,
          reason: trimmedReason || null,
          previousData: { status: prevStatus, approvalStatus: po.approvalStatus },
          newData: { status: nextStatus, approvalStatus: nextApprovalStatus },
        },
      });

      await recalculateJobFinances(po.jobId, tx);

      return updated;
    });

    await logAuditEvent({
      userId: session.userId,
      action: `PO_${action}`,
      resource: "purchaseOrders",
      resourceId: id,
      details: {
        poNumber: po.poNumber,
        previousStatus: prevStatus,
        newStatus: nextStatus,
        reason: trimmedReason || null,
      },
      req,
    });

    return NextResponse.json({
      success: true,
      message: `Purchase Order ${po.poNumber} transitioned from ${prevStatus} to ${nextStatus}.`,
      data: updatedPo,
    });
  } catch (err: any) {
    console.error(`POST /api/purchase-orders/${id}/approval error:`, err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to process PO approval action." },
      { status: 500 }
    );
  }
}

// GET /api/purchase-orders/[id]/approval
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized access." }, { status: 401 });
  }

  const { id } = await params;

  try {
    const db = getPrisma();
    const po = await (db.purchaseOrder as any).findUnique({
      where: { id },
      select: { id: true, createdById: true },
    });
    if (!po) {
      return NextResponse.json({ success: false, error: "Purchase Order not found." }, { status: 404 });
    }

    const scopeCheck = await canUserAccessRecord(session, "purchaseOrders", po.createdById, "view");
    if (!scopeCheck.allowed) {
      return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
    }

    const history = await (db.purchaseOrderApprovalHistory as any).findMany({
      where: { purchaseOrderId: id },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, name: true, email: true, jobTitle: true } } },
    });

    return NextResponse.json({
      success: true,
      data: history.map((h: any) => ({
        id: h.id,
        purchaseOrderId: h.purchaseOrderId,
        action: h.action,
        previousStatus: h.previousStatus,
        newStatus: h.newStatus,
        reason: h.reason,
        notes: h.notes,
        userName: h.user?.name || "System",
        userEmail: h.user?.email || null,
        createdAt: h.createdAt.toISOString(),
      })),
    });
  } catch (err: any) {
    console.error(`GET /api/purchase-orders/${id}/approval error:`, err);
    return NextResponse.json(
      { success: false, error: "Failed to load PO approval history." },
      { status: 500 }
    );
  }
}
