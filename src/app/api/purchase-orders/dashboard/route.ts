import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";
import { buildRecordVisibilityFilter } from "@/lib/data-visibility";
import { Decimal, roundFinancial } from "@/lib/financial";
import { PO_ACTIVE_COMMITMENT_STATUSES } from "@/lib/po-financial";
import { serializePurchaseOrder } from "@/lib/po-helpers";

// GET /api/purchase-orders/dashboard
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized access." }, { status: 401 });
  }

  const canView = await checkSessionPermission(session, "purchaseOrders", "view");
  if (!canView) {
    return NextResponse.json(
      { success: false, error: "Forbidden: You do not have permission to view Purchase Orders." },
      { status: 403 }
    );
  }

  try {
    const db = getPrisma();
    const { filter: visibilityFilter, scope } = await buildRecordVisibilityFilter(
      session,
      "purchaseOrders",
      "createdById",
      false
    );
    const canViewFinancials = await checkSessionPermission(
      session,
      "purchaseOrders",
      "viewFinancials"
    );

    const where: any = {
      deletedAt: null,
      ...(visibilityFilter.createdById ? { createdById: visibilityFilter.createdById } : {}),
      ...(visibilityFilter.OR ? { OR: visibilityFilter.OR } : {}),
    };

    const allOrders = await (db.purchaseOrder as any).findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        job: {
          select: {
            id: true,
            jobCode: true,
            name: true,
            clientName: true,
            date: true,
            status: true,
            grandTotal: true,
            totalCost: true,
          },
        },
        supplier: {
          select: {
            id: true,
            code: true,
            name: true,
            contactPerson: true,
            phone: true,
            email: true,
          },
        },
        items: {
          orderBy: { rowNumber: "asc" },
        },
        createdBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
        supplierInvoices: {
          where: { deletedAt: null, status: { not: "CANCELLED" } },
          select: { id: true, invoiceNumber: true, totalAmount: true, status: true },
        },
      },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let draftCount = 0;
    let pendingCount = 0;
    let approvedCount = 0;
    let issuedCount = 0;
    let partiallyDeliveredCount = 0;
    let deliveredCount = 0;
    let rejectedCount = 0;
    let cancelledCount = 0;
    let overdueDeliveriesCount = 0;

    let totalCommittedValue = new Decimal(0);
    let totalDraftValue = new Decimal(0);
    let totalApprovedAndBeyondValue = new Decimal(0);
    let totalInvoicedAgainstPos = new Decimal(0);

    const statusBuckets: Record<string, { status: string; count: number; value: Decimal }> = {};
    const supplierMap = new Map<
      string,
      { supplierId: string; supplierName: string; supplierCode: string; poCount: number; totalValue: Decimal }
    >();
    const jobMap = new Map<
      string,
      {
        jobId: string;
        jobCode: string;
        jobName: string;
        approvedJobValue: number;
        poCount: number;
        committedValue: Decimal;
        invoicedValue: Decimal;
      }
    >();

    // Last 6 months buckets
    const monthBuckets: Array<{
      key: string;
      label: string;
      count: number;
      committedValue: Decimal;
      invoicedValue: Decimal;
    }> = [];
    for (let m = 5; m >= 0; m--) {
      const d = new Date(today.getFullYear(), today.getMonth() - m, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      monthBuckets.push({
        key,
        label,
        count: 0,
        committedValue: new Decimal(0),
        invoicedValue: new Decimal(0),
      });
    }
    const monthLookup = new Map(monthBuckets.map((b) => [b.key, b]));

    const upcomingAndOverdueDeliveries: any[] = [];

    for (const po of allOrders) {
      const st = String(po.status || "DRAFT").toUpperCase();
      const val = new Decimal(po.grandTotal || 0);
      const invVal = (po.supplierInvoices || []).reduce(
        (s: Decimal, inv: any) => s.plus(new Decimal(inv.totalAmount || 0)),
        new Decimal(0)
      );

      if (st === "DRAFT") {
        draftCount++;
        totalDraftValue = totalDraftValue.plus(val);
      } else if (st === "PENDING") pendingCount++;
      else if (st === "APPROVED") approvedCount++;
      else if (st === "ISSUED") issuedCount++;
      else if (st === "PARTIALLY_DELIVERED") partiallyDeliveredCount++;
      else if (st === "DELIVERED") deliveredCount++;
      else if (st === "REJECTED") rejectedCount++;
      else if (st === "CANCELLED") cancelledCount++;

      if (PO_ACTIVE_COMMITMENT_STATUSES.includes(st)) {
        totalCommittedValue = totalCommittedValue.plus(val);
        totalInvoicedAgainstPos = totalInvoicedAgainstPos.plus(invVal);
      }
      if (["APPROVED", "ISSUED", "PARTIALLY_DELIVERED", "DELIVERED"].includes(st)) {
        totalApprovedAndBeyondValue = totalApprovedAndBeyondValue.plus(val);
      }

      if (!statusBuckets[st]) {
        statusBuckets[st] = { status: st, count: 0, value: new Decimal(0) };
      }
      statusBuckets[st].count++;
      statusBuckets[st].value = statusBuckets[st].value.plus(val);

      // Delivery alert check
      if (["APPROVED", "ISSUED", "PARTIALLY_DELIVERED"].includes(st)) {
        const expDate = po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate) : null;
        const isOverdue = Boolean(expDate && expDate < today);
        if (isOverdue) overdueDeliveriesCount++;
        upcomingAndOverdueDeliveries.push({
          id: po.id,
          poNumber: po.poNumber,
          jobCode: po.job?.jobCode || "",
          jobName: po.job?.name || "",
          supplierName: po.supplierNameSnapshot || po.supplier?.name || "",
          status: po.status,
          deliveryStatus: po.deliveryStatus,
          expectedDeliveryDate: expDate ? expDate.toISOString().split("T")[0] : null,
          isOverdue,
          grandTotal: canViewFinancials || po.createdById === session.userId ? Number(val.toFixed(2)) : 0,
        });
      }

      // Active aggregation for charts (exclude CANCELLED / REJECTED)
      if (!["CANCELLED", "REJECTED"].includes(st)) {
        if (po.supplierId) {
          const prev = supplierMap.get(po.supplierId) || {
            supplierId: po.supplierId,
            supplierName: po.supplierNameSnapshot || po.supplier?.name || "Unknown",
            supplierCode: po.supplier?.code || "",
            poCount: 0,
            totalValue: new Decimal(0),
          };
          prev.poCount++;
          if (st !== "DRAFT") prev.totalValue = prev.totalValue.plus(val);
          supplierMap.set(po.supplierId, prev);
        }

        if (po.jobId) {
          const prevJob = jobMap.get(po.jobId) || {
            jobId: po.jobId,
            jobCode: po.job?.jobCode || "",
            jobName: po.job?.name || "",
            approvedJobValue: Number(po.job?.grandTotal || po.job?.totalCost || 0),
            poCount: 0,
            committedValue: new Decimal(0),
            invoicedValue: new Decimal(0),
          };
          prevJob.poCount++;
          if (st !== "DRAFT") {
            prevJob.committedValue = prevJob.committedValue.plus(val);
            prevJob.invoicedValue = prevJob.invoicedValue.plus(invVal);
          }
          jobMap.set(po.jobId, prevJob);
        }

        const poDate = po.poDate ? new Date(po.poDate) : new Date(po.createdAt);
        const mKey = `${poDate.getFullYear()}-${String(poDate.getMonth() + 1).padStart(2, "0")}`;
        const mBucket = monthLookup.get(mKey);
        if (mBucket && st !== "DRAFT") {
          mBucket.count++;
          mBucket.committedValue = mBucket.committedValue.plus(val);
          mBucket.invoicedValue = mBucket.invoicedValue.plus(invVal);
        }
      }
    }

    upcomingAndOverdueDeliveries.sort((a, b) => {
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
      if (!a.expectedDeliveryDate) return 1;
      if (!b.expectedDeliveryDate) return -1;
      return a.expectedDeliveryDate.localeCompare(b.expectedDeliveryDate);
    });

    const maskExecutiveNumbers = !canViewFinancials;

    const topSuppliers = Array.from(supplierMap.values())
      .sort((a, b) => b.totalValue.minus(a.totalValue).toNumber())
      .slice(0, 6)
      .map((s) => ({
        supplierId: s.supplierId,
        supplierName: s.supplierName,
        supplierCode: s.supplierCode,
        poCount: s.poCount,
        totalValue: maskExecutiveNumbers ? 0 : roundFinancial(s.totalValue, 2).toNumber(),
      }));

    const topJobs = Array.from(jobMap.values())
      .sort((a, b) => b.committedValue.minus(a.committedValue).toNumber())
      .slice(0, 6)
      .map((j) => ({
        jobId: j.jobId,
        jobCode: j.jobCode,
        jobName: j.jobName,
        approvedJobValue: maskExecutiveNumbers ? 0 : roundFinancial(j.approvedJobValue, 2).toNumber(),
        poCount: j.poCount,
        committedValue: maskExecutiveNumbers ? 0 : roundFinancial(j.committedValue, 2).toNumber(),
        invoicedValue: maskExecutiveNumbers ? 0 : roundFinancial(j.invoicedValue, 2).toNumber(),
      }));

    const recentPos = allOrders.slice(0, 8).map((po: any) => {
      const mask = !canViewFinancials && po.createdById !== session.userId;
      return serializePurchaseOrder(po, mask);
    });

    return NextResponse.json({
      success: true,
      data: {
        metrics: {
          totalPos: allOrders.length,
          draftCount,
          pendingCount,
          approvedCount,
          issuedCount,
          partiallyDeliveredCount,
          deliveredCount,
          rejectedCount,
          cancelledCount,
          activePipelineCount: approvedCount + issuedCount + partiallyDeliveredCount,
          overdueDeliveriesCount,
          totalCommittedValue: maskExecutiveNumbers
            ? null
            : roundFinancial(totalCommittedValue, 2).toNumber(),
          totalDraftValue: maskExecutiveNumbers ? null : roundFinancial(totalDraftValue, 2).toNumber(),
          totalApprovedAndBeyondValue: maskExecutiveNumbers
            ? null
            : roundFinancial(totalApprovedAndBeyondValue, 2).toNumber(),
          totalInvoicedAgainstPos: maskExecutiveNumbers
            ? null
            : roundFinancial(totalInvoicedAgainstPos, 2).toNumber(),
          remainingToInvoiceValue: maskExecutiveNumbers
            ? null
            : Math.max(
                0,
                roundFinancial(totalApprovedAndBeyondValue.minus(totalInvoicedAgainstPos), 2).toNumber()
              ),
        },
        charts: {
          statusDistribution: Object.values(statusBuckets).map((b) => ({
            status: b.status,
            count: b.count,
            value: maskExecutiveNumbers ? 0 : roundFinancial(b.value, 2).toNumber(),
          })),
          monthlySpend: monthBuckets.map((m) => ({
            month: m.key,
            label: m.label,
            count: m.count,
            committedValue: maskExecutiveNumbers ? 0 : roundFinancial(m.committedValue, 2).toNumber(),
            invoicedValue: maskExecutiveNumbers ? 0 : roundFinancial(m.invoicedValue, 2).toNumber(),
          })),
          topSuppliers,
          topJobs,
        },
        upcomingAndOverdueDeliveries: upcomingAndOverdueDeliveries.slice(0, 8),
        recentPos,
      },
      meta: {
        visibilityScope: scope,
        canViewFinancials,
      },
    });
  } catch (err: any) {
    console.error("GET /api/purchase-orders/dashboard error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to load PO dashboard metrics." },
      { status: 500 }
    );
  }
}
