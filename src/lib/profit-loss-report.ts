import { prisma } from "@/lib/prisma";
import { Decimal, roundFinancial } from "@/lib/financial";
import { checkSessionPermission } from "@/lib/permissions";
import { buildRecordVisibilityFilter } from "@/lib/data-visibility";
import { computeJobFinancialAnalysis } from "@/lib/job-financial-analysis";

export interface ProfitLossFilterParams {
  search?: string;
  status?: string; // financial status filter
  jobStatus?: string; // job approval/workflow status filter
  jobId?: string;
  clientName?: string;
  dateFrom?: string;
  dateTo?: string;
  createdBy?: string;
}

export interface ProfitLossReportResult {
  rows: Array<{
    jobId: string;
    jobCode: string;
    jobName: string;
    clientName: string;
    status: string;
    jobDate: string;
    approvedJobValue: number;
    originalEstimatedCost: number;
    totalSupplierCost: number;
    additionalExpenses: number;
    otherCosts: number;
    totalActualCost: number;
    costDifference: number;
    costSaving: number;
    costOverrun: number;
    grossProfit: number;
    profitMargin: number | null;
    financialStatus: "High Margin" | "Healthy" | "Low Margin" | "Over Budget" | "N/A";
    supplierInvoicesCount: number;
    additionalExpensesCount: number;
    supplierPaidAmount: number;
    supplierOutstandingBalance: number;
    createdById?: string | null;
    createdByName: string;
    createdAt: string;
    invoiceBreakdown: Array<{
      invoiceNumber: string;
      supplierName: string;
      invoiceDate: string;
      dueDate: string | null;
      totalAmount: number;
      paidAmount: number;
      outstandingBalance: number;
      paymentStatus: string;
    }>;
    additionalExpensesBreakdown: Array<{
      expenseDate: string;
      category: string;
      description: string;
      payee: string;
      paymentReference: string;
      amount: number;
    }>;
  }>;
  summary: {
    totalJobsCount: number;
    totalApprovedValue: number;
    totalOriginalEstimatedCost: number;
    totalSupplierCost: number;
    totalAdditionalExpenses: number;
    totalActualCost: number;
    totalCostDifference: number;
    totalCostSaving: number;
    totalCostOverrun: number;
    totalGrossProfit: number;
    averageProfitMargin: number | null;
    totalSupplierPaid: number;
    totalSupplierOutstanding: number;
    profitableJobsCount: number;
    overBudgetJobsCount: number;
  };
  filtersMeta: {
    clients: string[];
    jobs: Array<{ id: string; jobCode: string; name: string }>;
    statusCounts: {
      all: number;
      highMargin: number;
      healthy: number;
      lowMargin: number;
      overBudget: number;
      na: number;
    };
  };
  permissions: {
    canViewOriginalCosts: boolean;
    canViewActualSupplierCosts: boolean;
    canExport: boolean;
  };
}

export async function generateProfitLossReport(
  session: { userId?: string; roles?: string[]; email?: string },
  filters: ProfitLossFilterParams
): Promise<ProfitLossReportResult> {
  const [
    canViewOriginalCosts,
    canViewActualSupplierCosts,
    canExportPl,
    canDownloadPl,
  ] = await Promise.all([
    checkSessionPermission(session, "jobs", "viewOriginalCosts"),
    checkSessionPermission(session, "jobs", "viewActualSupplierCosts"),
    checkSessionPermission(session, "profitLoss", "export"),
    checkSessionPermission(session, "profitLoss", "download"),
  ]);

  const { filter: visibilityFilter, authorizedIds } =
    await buildRecordVisibilityFilter(session, "profitLoss", "submittedById");

  const baseWhere: any = {
    deletedAt: null,
  };

  if (filters.createdBy && filters.createdBy !== "all") {
    if (!authorizedIds || authorizedIds.includes(filters.createdBy)) {
      baseWhere.submittedById = filters.createdBy;
    } else {
      baseWhere.submittedById = "__FORBIDDEN_SCOPE__";
    }
  } else {
    if (visibilityFilter.submittedById) {
      baseWhere.submittedById = visibilityFilter.submittedById;
    } else if (visibilityFilter.OR) {
      baseWhere.OR = visibilityFilter.OR;
    }
  }

  // Fetch scoped jobs list cleanly for dropdown filter metadata first
  const scopedJobRefs = await (prisma.job as any).findMany({
    where: baseWhere,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      jobCode: true,
      name: true,
      clientName: true,
    },
  });

  const clientsSet = new Set<string>();
  const jobsFilterList: Array<{ id: string; jobCode: string; name: string }> = [];
  for (const r of scopedJobRefs) {
    if (r.clientName && String(r.clientName).trim()) {
      clientsSet.add(String(r.clientName).trim());
    }
    jobsFilterList.push({
      id: r.id,
      jobCode: r.jobCode || "NO-CODE",
      name: r.name,
    });
  }

  const queryWhere: any = { ...baseWhere };

  if (filters.jobId && filters.jobId !== "all") {
    queryWhere.id = filters.jobId;
  }

  if (filters.clientName && filters.clientName !== "all") {
    queryWhere.clientName = {
      contains: filters.clientName,
      mode: "insensitive",
    };
  }

  if (filters.jobStatus && filters.jobStatus !== "all") {
    const s = filters.jobStatus.toUpperCase();
    if (s === "APPROVED") {
      queryWhere.status = { in: ["APPROVED", "Approved", "ACTIVE", "Active", "INVOICE_GENERATED", "Invoiced"] };
    } else if (s === "PENDING" || s === "PENDING_APPROVAL") {
      queryWhere.status = { in: ["PENDING_APPROVAL", "Pending Approval", "Pending", "In Review"] };
    } else if (s === "REJECTED") {
      queryWhere.status = { in: ["REJECTED", "Rejected"] };
    } else if (s === "DRAFT") {
      queryWhere.status = { in: ["DRAFT", "Draft"] };
    } else {
      queryWhere.status = filters.jobStatus;
    }
  }

  if (filters.dateFrom || filters.dateTo) {
    queryWhere.date = {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    };
  }

  if (filters.search && filters.search.trim()) {
    const term = filters.search.trim();
    const searchConditions = [
      { jobCode: { contains: term, mode: "insensitive" } },
      { name: { contains: term, mode: "insensitive" } },
      { clientName: { contains: term, mode: "insensitive" } },
    ];
    if (queryWhere.OR) {
      queryWhere.AND = [{ OR: queryWhere.OR }, { OR: searchConditions }];
      delete queryWhere.OR;
    } else {
      queryWhere.OR = searchConditions;
    }
  }

  const jobs = await (prisma.job as any).findMany({
    where: queryWhere,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      jobCode: true,
      name: true,
      date: true,
      commencingDate: true,
      clientName: true,
      status: true,
      grandTotal: true,
      totalCost: true,
      createdAt: true,
      submittedById: true,
      submittedBy: { select: { id: true, name: true, email: true } },
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
        orderBy: { invoiceDate: "desc" },
        select: {
          id: true,
          invoiceNumber: true,
          invoiceDate: true,
          paymentDueDate: true,
          totalAmount: true,
          paidAmount: true,
          paymentStatus: true,
          status: true,
          deletedAt: true,
          supplier: { select: { id: true, name: true } },
          payments: {
            where: { status: "SUCCESS" },
            select: { id: true, amount: true, status: true },
          },
        },
      },
    },
  });

  // Fetch active Additional Job Expenses for all matched jobs in one indexed query
  const jobIds = jobs.map((j: any) => j.id);
  const expensesByJob = new Map<string, any[]>();
  if (jobIds.length > 0 && (prisma as any).jobAdditionalExpense) {
    const expenseRows = await (prisma as any).jobAdditionalExpense.findMany({
      where: {
        jobId: { in: jobIds },
        status: "ACTIVE",
        linkedSupplierInvoiceId: null,
      },
      orderBy: { expenseDate: "desc" },
      include: {
        supplier: { select: { name: true } },
      },
    });
    for (const exp of expenseRows) {
      const list = expensesByJob.get(exp.jobId) || [];
      list.push(exp);
      expensesByJob.set(exp.jobId, list);
    }
  }

  const allComputed = jobs.map((job: any) => {
    const jobExpenses = expensesByJob.get(job.id) || [];
    const approvedRev =
      job.grandTotal && Number(job.grandTotal) > 0
        ? job.grandTotal
        : job.totalCost || 0;

    const analysis = computeJobFinancialAnalysis({
      approvedJobRevenue: approvedRev,
      fallbackTotalCost: job.totalCost || 0,
      costItems: job.costItems || [],
      supplierInvoices: job.supplierInvoices || [],
      additionalExpenses: jobExpenses,
    });

    const ov = analysis.overview;

    const invoiceBreakdown = canViewActualSupplierCosts
      ? (job.supplierInvoices || []).map((inv: any) => {
          const totalAmt = roundFinancial(inv.totalAmount, 2);
          const paidAmt = (inv.payments || []).reduce(
            (s: Decimal, p: any) => s.plus(roundFinancial(p.amount, 2)),
            new Decimal(0)
          );
          const outAmt = Decimal.max(new Decimal(0), totalAmt.minus(paidAmt));
          return {
            invoiceNumber: inv.invoiceNumber,
            supplierName: inv.supplier?.name || "Supplier",
            invoiceDate: inv.invoiceDate
              ? new Date(inv.invoiceDate).toISOString().split("T")[0]
              : "",
            dueDate: inv.paymentDueDate
              ? new Date(inv.paymentDueDate).toISOString().split("T")[0]
              : null,
            totalAmount: totalAmt.toNumber(),
            paidAmount: roundFinancial(paidAmt, 2).toNumber(),
            outstandingBalance: roundFinancial(outAmt, 2).toNumber(),
            paymentStatus: inv.paymentStatus || "UNPAID",
          };
        })
      : [];

    const additionalExpensesBreakdown = jobExpenses.map((e: any) => ({
      expenseDate: e.expenseDate
        ? new Date(e.expenseDate).toISOString().split("T")[0]
        : "",
      category: e.category,
      description: e.description,
      payee: e.supplier?.name || e.payeeName || "—",
      paymentReference: e.paymentReference || "—",
      amount: roundFinancial(e.amount, 2).toNumber(),
    }));

    return {
      jobId: job.id,
      jobCode: job.jobCode || "NO-CODE",
      jobName: job.name,
      clientName: job.clientName || "Valued Client",
      status: job.status,
      jobDate: job.date || "",
      approvedJobValue: ov.approvedJobValue,
      originalEstimatedCost: canViewOriginalCosts
        ? ov.originalEstimatedJobCost
        : 0,
      totalSupplierCost: canViewActualSupplierCosts ? ov.totalSupplierCost : 0,
      additionalExpenses: ov.additionalExpensesTotal,
      otherCosts: ov.additionalExpensesTotal,
      totalActualCost: ov.totalActualCost,
      costDifference:
        canViewOriginalCosts && canViewActualSupplierCosts
          ? ov.costDifference
          : 0,
      costSaving:
        canViewOriginalCosts && canViewActualSupplierCosts ? ov.costSaving : 0,
      costOverrun:
        canViewOriginalCosts && canViewActualSupplierCosts ? ov.costOverrun : 0,
      grossProfit: ov.grossProfit,
      profitMargin: ov.profitMargin,
      financialStatus: ov.financialStatus,
      supplierInvoicesCount: ov.supplierInvoicesCount,
      additionalExpensesCount: ov.additionalExpensesCount,
      supplierPaidAmount: canViewActualSupplierCosts ? ov.supplierPaidAmount : 0,
      supplierOutstandingBalance: canViewActualSupplierCosts
        ? ov.supplierOutstandingBalance
        : 0,
      createdById: job.submittedById,
      createdByName: job.submittedBy?.name || "System Admin",
      createdAt: job.createdAt
        ? new Date(job.createdAt).toISOString().split("T")[0]
        : "",
      invoiceBreakdown,
      additionalExpensesBreakdown,
    };
  });

  // Compute financial status counts across the matched job filters before financial-status pill filtering
  const statusCounts = {
    all: allComputed.length,
    highMargin: allComputed.filter((r: any) => r.financialStatus === "High Margin").length,
    healthy: allComputed.filter((r: any) => r.financialStatus === "Healthy").length,
    lowMargin: allComputed.filter((r: any) => r.financialStatus === "Low Margin").length,
    overBudget: allComputed.filter((r: any) => r.financialStatus === "Over Budget").length,
    na: allComputed.filter((r: any) => r.financialStatus === "N/A").length,
  };

  // Apply financial status filter if specified (normalizes spaces & "/" so both "n_a" and "n/a" work)
  const statusNorm = (filters.status || "all")
    .toLowerCase()
    .replace(/[\s/]+/g, "_");
  const filteredRows =
    statusNorm === "all"
      ? allComputed
      : allComputed.filter(
          (r: any) =>
            r.financialStatus.toLowerCase().replace(/[\s/]+/g, "_") ===
            statusNorm
        );

  // Compute summary strictly across the returned `filteredRows`
  let totalApproved = new Decimal(0);
  let totalOrigEst = new Decimal(0);
  let totalSupCost = new Decimal(0);
  let totalAddlExp = new Decimal(0);
  let totalActual = new Decimal(0);
  let totalPaid = new Decimal(0);
  let totalOutstanding = new Decimal(0);
  let profitableJobsCount = 0;
  let overBudgetJobsCount = 0;

  for (const r of filteredRows) {
    totalApproved = totalApproved.plus(r.approvedJobValue || 0);
    totalOrigEst = totalOrigEst.plus(r.originalEstimatedCost || 0);
    totalSupCost = totalSupCost.plus(r.totalSupplierCost || 0);
    totalAddlExp = totalAddlExp.plus(r.additionalExpenses || 0);
    totalActual = totalActual.plus(r.totalActualCost || 0);
    totalPaid = totalPaid.plus(r.supplierPaidAmount || 0);
    totalOutstanding = totalOutstanding.plus(r.supplierOutstandingBalance || 0);

    if (r.financialStatus === "Over Budget") {
      overBudgetJobsCount++;
    } else if (r.financialStatus !== "N/A") {
      profitableJobsCount++;
    }
  }

  const totalCostDifference =
    canViewOriginalCosts && canViewActualSupplierCosts
      ? roundFinancial(totalOrigEst.minus(totalSupCost), 2)
      : new Decimal(0);
  const totalCostSaving = totalCostDifference.gt(0)
    ? totalCostDifference
    : new Decimal(0);
  const totalCostOverrun = totalCostDifference.lt(0)
    ? roundFinancial(totalSupCost.minus(totalOrigEst), 2)
    : new Decimal(0);

  const totalGrossProfit = roundFinancial(
    totalApproved.minus(totalActual),
    2
  );
  const averageProfitMargin = totalApproved.gt(0)
    ? Number(
        roundFinancial(
          totalGrossProfit.div(totalApproved).mul(100),
          2
        ).toFixed(2)
      )
    : null;

  return {
    rows: filteredRows,
    summary: {
      totalJobsCount: filteredRows.length,
      totalApprovedValue: roundFinancial(totalApproved, 2).toNumber(),
      totalOriginalEstimatedCost: roundFinancial(totalOrigEst, 2).toNumber(),
      totalSupplierCost: roundFinancial(totalSupCost, 2).toNumber(),
      totalAdditionalExpenses: roundFinancial(totalAddlExp, 2).toNumber(),
      totalActualCost: roundFinancial(totalActual, 2).toNumber(),
      totalCostDifference: totalCostDifference.toNumber(),
      totalCostSaving: totalCostSaving.toNumber(),
      totalCostOverrun: totalCostOverrun.toNumber(),
      totalGrossProfit: totalGrossProfit.toNumber(),
      averageProfitMargin,
      totalSupplierPaid: roundFinancial(totalPaid, 2).toNumber(),
      totalSupplierOutstanding: roundFinancial(totalOutstanding, 2).toNumber(),
      profitableJobsCount,
      overBudgetJobsCount,
    },
    filtersMeta: {
      clients: Array.from(clientsSet).sort((a, b) => a.localeCompare(b)),
      jobs: jobsFilterList,
      statusCounts,
    },
    permissions: {
      canViewOriginalCosts,
      canViewActualSupplierCosts,
      canExport: canExportPl || canDownloadPl,
    },
  };
}
