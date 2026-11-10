import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { Decimal } from "decimal.js";

export interface JobFinancialSnapshot {
  jobId: string;
  approvedJobValue: number;
  totalSupplierCost: number;
  otherCosts: number;
  totalActualCost: number;
  remainingBudget: number;
  grossProfit: number;
  profitMargin: number;
  costUtilization: number;
  isBudgetExceeded: boolean;
  activeSupplierInvoicesCount: number;
  poCommitments?: {
    totalCommittedPoValue: number;
    draftPoValue: number;
    approvedPoCount: number;
    activePoCount: number;
  };
  lastRecalculatedAt: string;
}

/**
 * Atomically recalculates a Job's financial overview from saved, active (non-cancelled) supplier invoices.
 * IMPORTANT Accounting Rule:
 *   - Purchase Orders are PROCUREMENT COMMITMENTS, NOT realized Supplier Invoice expenses.
 *   - `totalSupplierCost`, `totalActualCost`, `grossProfit`, and `profitMargin` MUST remain based strictly
 *     on recorded active `SupplierInvoice` records to avoid double-counting against PO commitments.
 */
export async function recalculateJobFinances(
  jobId: string,
  tx?: Prisma.TransactionClient | any
): Promise<JobFinancialSnapshot> {
  const client = tx || getPrisma();

  // 1. Fetch Job, active non-cancelled supplier invoices, and active purchase orders
  const job = await (client.job as any).findUnique({
    where: { id: jobId },
    select: {
      id: true,
      jobCode: true,
      name: true,
      totalCost: true,
      grandTotal: true,
      costSummary: {
        select: {
          id: true,
          grandTotal: true,
          rawSummaryData: true,
        },
      },
      supplierInvoices: {
        where: {
          deletedAt: null,
          status: { not: "CANCELLED" },
        },
        select: {
          id: true,
          invoiceNumber: true,
          totalAmount: true,
          status: true,
        },
      },
      purchaseOrders: {
        where: {
          deletedAt: null,
          status: { notIn: ["CANCELLED", "REJECTED"] },
        },
        select: {
          id: true,
          status: true,
          approvalStatus: true,
          grandTotal: true,
        },
      },
    },
  });

  if (!job) {
    throw new Error(`Job with ID "${jobId}" not found for financial recalculation.`);
  }

  // 2. Approved Job Ceiling (from quotation grandTotal or totalCost)
  const approvedJobValue = new Decimal(job.grandTotal || job.totalCost || 0);

  // 3. Sum of all active, non-cancelled supplier invoices (Decimal precision)
  let totalSupplierCost = new Decimal(0);
  (job.supplierInvoices || []).forEach((inv: any) => {
    totalSupplierCost = totalSupplierCost.plus(new Decimal(inv.totalAmount || 0));
  });

  // 3B. Separate Purchase Order commitment summary (strictly informational, excluded from actual P&L expenses)
  let totalCommittedPoValue = new Decimal(0);
  let draftPoValue = new Decimal(0);
  let approvedPoCount = 0;
  let activePoCount = 0;

  (job.purchaseOrders || []).forEach((po: any) => {
    const val = new Decimal(po.grandTotal || 0);
    if (po.status === "DRAFT") {
      draftPoValue = draftPoValue.plus(val);
    } else {
      totalCommittedPoValue = totalCommittedPoValue.plus(val);
      activePoCount++;
      if (po.approvalStatus === "APPROVED" || ["APPROVED", "ISSUED"].includes(po.status)) {
        approvedPoCount++;
      }
    }
  });

  // 4. Other Actual Costs (if any)
  const otherCosts = new Decimal(0);

  // 5. Total Actual Cost
  const totalActualCost = totalSupplierCost.plus(otherCosts);

  // 6. Remaining Budget & Gross Profit
  const remainingBudget = approvedJobValue.minus(totalActualCost);
  const grossProfit = approvedJobValue.minus(totalActualCost);

  // 7. Profit Margin & Cost Utilization
  let profitMargin = new Decimal(0);
  let costUtilization = new Decimal(0);

  if (approvedJobValue.gt(0)) {
    profitMargin = grossProfit.dividedBy(approvedJobValue).times(100);
    costUtilization = totalActualCost.dividedBy(approvedJobValue).times(100);
  }

  const isBudgetExceeded = totalActualCost.gt(approvedJobValue);

  const snapshot: JobFinancialSnapshot = {
    jobId: job.id,
    approvedJobValue: approvedJobValue.toNumber(),
    totalSupplierCost: totalSupplierCost.toNumber(),
    otherCosts: otherCosts.toNumber(),
    totalActualCost: totalActualCost.toNumber(),
    remainingBudget: remainingBudget.toNumber(),
    grossProfit: grossProfit.toNumber(),
    profitMargin: Number(profitMargin.toFixed(2)),
    costUtilization: Number(costUtilization.toFixed(2)),
    isBudgetExceeded,
    activeSupplierInvoicesCount: job.supplierInvoices?.length || 0,
    poCommitments: {
      totalCommittedPoValue: totalCommittedPoValue.toDecimalPlaces(2).toNumber(),
      draftPoValue: draftPoValue.toDecimalPlaces(2).toNumber(),
      approvedPoCount,
      activePoCount,
    },
    lastRecalculatedAt: new Date().toISOString(),
  };

  // 8. Persist financial snapshot in JobCostSummary if record exists
  try {
    const existingRaw = (job.costSummary?.rawSummaryData as Record<string, any>) || {};
    const updatedRaw = {
      ...existingRaw,
      financialOverview: snapshot,
    };

    if (job.costSummary?.id) {
      await (client.jobCostSummary as any).update({
        where: { id: job.costSummary.id },
        data: {
          rawSummaryData: updatedRaw,
        },
      });
    } else {
      await (client.jobCostSummary as any).create({
        data: {
          jobId: job.id,
          grandTotal: approvedJobValue.toFixed(2),
          rawSummaryData: updatedRaw,
        },
      });
    }
  } catch (err) {
    console.warn("Could not cache financial overview in JobCostSummary:", err);
  }

  return snapshot;
}
