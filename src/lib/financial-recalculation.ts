import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { Decimal } from "decimal.js";
import { computeJobFinancialAnalysis } from "@/lib/job-financial-analysis";

export interface JobFinancialSnapshot {
  jobId: string;
  approvedJobValue: number;
  originalEstimatedJobCost: number;
  totalSupplierCost: number;
  additionalExpensesTotal: number;
  otherCosts: number;
  totalActualCost: number;
  costDifference: number;
  costSaving: number;
  costOverrun: number;
  remainingBudget: number;
  grossProfit: number;
  profitMargin: number | null;
  costUtilization: number;
  isBudgetExceeded: boolean;
  activeSupplierInvoicesCount: number;
  activeAdditionalExpensesCount: number;
  supplierPaidAmount: number;
  supplierOutstandingBalance: number;
  poCommitments?: {
    totalCommittedPoValue: number;
    draftPoValue: number;
    approvedPoCount: number;
    activePoCount: number;
  };
  lastRecalculatedAt: string;
}

/**
 * Atomically recalculates a Job's financial overview from saved, active (non-cancelled)
 * Supplier Invoices and active Additional Job Expenses.
 *
 * IMPORTANT Accounting Rules:
 *   - Purchase Orders are PROCUREMENT COMMITMENTS, NOT realized expenses.
 *   - `totalSupplierCost` is summed strictly from active non-cancelled `SupplierInvoice` records.
 *   - `additionalExpensesTotal` (`otherCosts`) is summed strictly from active `JobAdditionalExpense` records
 *     that are NOT linked to any Supplier Invoice (`linkedSupplierInvoiceId IS NULL`).
 *   - `totalActualCost = totalSupplierCost + additionalExpensesTotal`.
 *   - `grossProfit = approvedJobValue - totalActualCost` (Cost Saving is NEVER added to Gross Profit).
 *   - `profitMargin` is `null` (rendered `"N/A"`) when `approvedJobValue <= 0`.
 *   - `supplierPaidAmount` & `supplierOutstandingBalance` track payable settlement only.
 */
export async function recalculateJobFinances(
  jobId: string,
  tx?: Prisma.TransactionClient | any
): Promise<JobFinancialSnapshot> {
  const client = tx || getPrisma();

  // Fetch Job, Cost Items, active non-cancelled supplier invoices (with payments),
  // active additional expenses, and active purchase orders.
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
      costItems: {
        select: {
          id: true,
          totalCost: true,
          quantity: true,
          rate: true,
          description: true,
          categoryId: true,
          itemNumber: true,
          rcNrc: true,
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
          paidAmount: true,
          status: true,
          deletedAt: true,
          payments: {
            where: { status: "SUCCESS" },
            select: {
              id: true,
              amount: true,
              status: true,
            },
          },
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

  let additionalExpenses: any[] = [];
  if ((client as any).jobAdditionalExpense) {
    additionalExpenses = await (client as any).jobAdditionalExpense.findMany({
      where: {
        jobId,
        status: "ACTIVE",
        linkedSupplierInvoiceId: null,
      },
      select: {
        id: true,
        amount: true,
        status: true,
        linkedSupplierInvoiceId: true,
      },
    });
  }

  const approvedRevenue =
    job.grandTotal && Number(job.grandTotal) > 0
      ? job.grandTotal
      : job.totalCost || 0;

  const analysis = computeJobFinancialAnalysis({
    approvedJobRevenue: approvedRevenue,
    fallbackTotalCost: job.totalCost || 0,
    costItems: job.costItems || [],
    supplierInvoices: job.supplierInvoices || [],
    additionalExpenses,
  });

  // Separate Purchase Order commitment summary (strictly informational, excluded from actual P&L expenses)
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

  const snapshot: JobFinancialSnapshot = {
    jobId: job.id,
    approvedJobValue: analysis.overview.approvedJobValue,
    originalEstimatedJobCost: analysis.overview.originalEstimatedJobCost,
    totalSupplierCost: analysis.overview.totalSupplierCost,
    additionalExpensesTotal: analysis.overview.additionalExpensesTotal,
    otherCosts: analysis.overview.otherCosts,
    totalActualCost: analysis.overview.totalActualCost,
    costDifference: analysis.overview.costDifference,
    costSaving: analysis.overview.costSaving,
    costOverrun: analysis.overview.costOverrun,
    remainingBudget: analysis.overview.remainingBudget,
    grossProfit: analysis.overview.grossProfit,
    profitMargin: analysis.overview.profitMargin,
    costUtilization: analysis.overview.costUtilization,
    isBudgetExceeded: analysis.overview.isBudgetExceeded,
    activeSupplierInvoicesCount: analysis.overview.supplierInvoicesCount,
    activeAdditionalExpensesCount: analysis.overview.additionalExpensesCount,
    supplierPaidAmount: analysis.overview.supplierPaidAmount,
    supplierOutstandingBalance: analysis.overview.supplierOutstandingBalance,
    poCommitments: {
      totalCommittedPoValue: totalCommittedPoValue.toDecimalPlaces(2).toNumber(),
      draftPoValue: draftPoValue.toDecimalPlaces(2).toNumber(),
      approvedPoCount,
      activePoCount,
    },
    lastRecalculatedAt: new Date().toISOString(),
  };

  // Persist financial snapshot in JobCostSummary
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
          grandTotal: new Decimal(analysis.overview.approvedJobValue || 0).toFixed(2),
          rawSummaryData: updatedRaw,
        },
      });
    }
  } catch (err) {
    console.warn("Could not cache financial overview in JobCostSummary:", err);
  }

  return snapshot;
}
