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
  lastRecalculatedAt: string;
}

/**
 * Atomically recalculates a Job's financial overview from saved, active (non-cancelled) supplier invoices.
 * Enforces Decimal arithmetic with 2 decimal places precision.
 * Can be executed inside an existing Prisma transaction or standalone.
 */
export async function recalculateJobFinances(
  jobId: string,
  tx?: Prisma.TransactionClient | any
): Promise<JobFinancialSnapshot> {
  const client = tx || getPrisma();

  // 1. Fetch Job and all active, non-cancelled supplier invoices
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
