"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Briefcase,
  AlertCircle,
  Building2,
  Calendar,
  ArrowRight,
  ShieldAlert,
  Loader2,
  FileSpreadsheet,
  Printer,
  RotateCcw,
  RefreshCw,
  CreditCard,
  Lock,
} from "lucide-react";
import { useAdminData } from "@/context/admin-data-context";
import { formatCurrency } from "@/lib/financial";
import { Pagination } from "@/components/admin/ui/pagination";
import { SearchField } from "@/components/admin/ui/search-field";
import { FilterSelect } from "@/components/admin/ui/filter-controls";
import { StatusBadge } from "@/components/admin/ui/badge";
import { DashboardSkeleton } from "@/components/ui/loading/dashboard-skeleton";
import { TableSkeleton } from "@/components/ui/loading/table-skeleton";
import { JobProfitLossSummary } from "@/types/admin";

interface ProfitLossSummaryState {
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
}

interface ProfitLossFiltersMeta {
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
}

interface ReportPermissions {
  canViewOriginalCosts: boolean;
  canViewActualSupplierCosts: boolean;
  canExport: boolean;
}

const DEFAULT_SUMMARY: ProfitLossSummaryState = {
  totalJobsCount: 0,
  totalApprovedValue: 0,
  totalOriginalEstimatedCost: 0,
  totalSupplierCost: 0,
  totalAdditionalExpenses: 0,
  totalActualCost: 0,
  totalCostDifference: 0,
  totalCostSaving: 0,
  totalCostOverrun: 0,
  totalGrossProfit: 0,
  averageProfitMargin: null,
  totalSupplierPaid: 0,
  totalSupplierOutstanding: 0,
  profitableJobsCount: 0,
  overBudgetJobsCount: 0,
};

const DEFAULT_FILTERS_META: ProfitLossFiltersMeta = {
  clients: [],
  jobs: [],
  statusCounts: {
    all: 0,
    highMargin: 0,
    healthy: 0,
    lowMargin: 0,
    overBudget: 0,
    na: 0,
  },
};

export function ProfitLossView() {
  const { can, showToast, currentRole } = useAdminData();

  const [loading, setLoading] = useState(true);
  const [forbiddenError, setForbiddenError] = useState<string | null>(null);
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  const [jobs, setJobs] = useState<JobProfitLossSummary[]>([]);
  const [summary, setSummary] = useState<ProfitLossSummaryState>(DEFAULT_SUMMARY);
  const [filtersMeta, setFiltersMeta] =
    useState<ProfitLossFiltersMeta>(DEFAULT_FILTERS_META);
  const [reportPermissions, setReportPermissions] = useState<ReportPermissions>({
    canViewOriginalCosts: true,
    canViewActualSupplierCosts: true,
    canExport: true,
  });

  // Active Filter Controls
  const [jobIdFilter, setJobIdFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [jobStatusFilter, setJobStatusFilter] = useState("all");
  const [financialStatusFilter, setFinancialStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const hasViewAccess =
    can("profitLoss", "view") && can("profitLoss", "viewFinancials");

  // Debounce search input cleanly
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setCurrentPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (jobIdFilter && jobIdFilter !== "all") params.set("jobId", jobIdFilter);
    if (clientFilter && clientFilter !== "all")
      params.set("clientName", clientFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (jobStatusFilter && jobStatusFilter !== "all")
      params.set("jobStatus", jobStatusFilter);
    if (financialStatusFilter && financialStatusFilter !== "all")
      params.set("status", financialStatusFilter);
    if (debouncedSearch) params.set("search", debouncedSearch);
    return params.toString();
  }, [
    jobIdFilter,
    clientFilter,
    dateFrom,
    dateTo,
    jobStatusFilter,
    financialStatusFilter,
    debouncedSearch,
  ]);

  const fetchProfitLossData = useCallback(
    async (signal?: AbortSignal) => {
      if (!hasViewAccess) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setForbiddenError(null);
      try {
        const url = queryString
          ? `/api/reports/profit-loss?${queryString}`
          : "/api/reports/profit-loss";
        const res = await fetch(url, { signal });
        const json = await res.json();

        if (res.status === 403) {
          setForbiddenError(
            json?.error ||
              "You do not have permission to view Profit & Loss financial metrics."
          );
          setJobs([]);
          return;
        }

        if (!res.ok || !json?.success) {
          showToast(
            "Report Load Failed",
            json?.error || "Unable to load Profit & Loss analysis.",
            "error"
          );
          return;
        }

        setJobs(json.data || []);
        if (json.summary) setSummary(json.summary);
        if (json.filtersMeta) setFiltersMeta(json.filtersMeta);
        if (json.permissions) setReportPermissions(json.permissions);
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          console.error("fetchProfitLossData error:", err);
          showToast(
            "Error",
            "Failed to retrieve Profit & Loss report data.",
            "error"
          );
        }
      } finally {
        setLoading(false);
      }
    },
    [hasViewAccess, queryString, showToast]
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetchProfitLossData(controller.signal);
    }, 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [fetchProfitLossData, refreshTick]);

  // Pagination slice
  const totalPages = Math.max(1, Math.ceil(jobs.length / pageSize));
  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return jobs.slice(start, start + pageSize);
  }, [jobs, currentPage, pageSize]);

  const hasActiveFilters = Boolean(
    jobIdFilter !== "all" ||
      clientFilter !== "all" ||
      dateFrom ||
      dateTo ||
      jobStatusFilter !== "all" ||
      financialStatusFilter !== "all" ||
      searchTerm.trim()
  );

  const handleResetFilters = () => {
    setJobIdFilter("all");
    setClientFilter("all");
    setDateFrom("");
    setDateTo("");
    setJobStatusFilter("all");
    setFinancialStatusFilter("all");
    setSearchTerm("");
    setDebouncedSearch("");
    setCurrentPage(1);
  };

  const allowExportAction =
    (can("profitLoss", "export") || can("profitLoss", "download")) &&
    reportPermissions.canExport;

  const handleExportExcel = async () => {
    if (!allowExportAction || isExportingExcel || jobs.length === 0) return;
    setIsExportingExcel(true);
    try {
      const url = queryString
        ? `/api/reports/profit-loss/export?${queryString}`
        : "/api/reports/profit-loss/export";
      const res = await fetch(url);
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        showToast(
          "Export Failed",
          errJson?.error || "Unable to generate Profit & Loss Excel report.",
          "error"
        );
        return;
      }

      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      const dateStamp = new Date().toISOString().split("T")[0];
      link.download = `Profit_Loss_Analysis_${dateStamp}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);

      showToast(
        "Excel Exported",
        "4-sheet Profit & Loss Analysis workbook downloaded.",
        "success"
      );
    } catch (err: any) {
      showToast(
        "Export Error",
        err?.message || "Unexpected error while exporting Excel report.",
        "error"
      );
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleExportPdf = () => {
    if (jobs.length === 0) return;
    window.print();
  };

  if (!hasViewAccess || forbiddenError) {
    return (
      <div className="flex flex-col items-center justify-center p-10 bg-white rounded-2xl border border-slate-200 text-center max-w-lg mx-auto mt-8 shadow-xs">
        <div className="h-14 w-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
          {forbiddenError ||
            "You do not have permission to view Profit & Loss Financial Reports."}
        </p>
        <div className="mt-4 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
          Active Role:{" "}
          <span className="font-bold text-blue-600 capitalize">
            {currentRole}
          </span>
        </div>
      </div>
    );
  }

  const renderFinancialStatusBadge = (
    status: JobProfitLossSummary["financialStatus"]
  ) => {
    const styles: Record<string, string> = {
      "High Margin":
        "bg-emerald-100 text-emerald-800 border border-emerald-300",
      Healthy: "bg-blue-100 text-blue-800 border border-blue-300",
      "Low Margin": "bg-amber-100 text-amber-800 border border-amber-300",
      "Over Budget": "bg-rose-100 text-rose-800 border border-rose-300",
      "N/A": "bg-slate-100 text-slate-600 border border-slate-300",
    };
    return (
      <span
        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
          styles[status] || styles["N/A"]
        }`}
      >
        {status}
      </span>
    );
  };

  const renderMarginPill = (margin: number | null) => {
    if (margin === null || margin === undefined) {
      return (
        <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-500">
          N/A
        </span>
      );
    }
    const tone =
      margin >= 40
        ? "bg-emerald-100 text-emerald-800"
        : margin >= 20
        ? "bg-blue-100 text-blue-800"
        : margin >= 0
        ? "bg-amber-100 text-amber-800"
        : "bg-rose-100 text-rose-800";

    return (
      <span
        className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold ${tone}`}
      >
        {Number(margin).toFixed(2)}%
      </span>
    );
  };

  const renderJobRow = (j: JobProfitLossSummary, isPrintRow = false) => (
    <tr
      key={isPrintRow ? `print-${j.jobId}` : j.jobId}
      className="hover:bg-slate-50/70 transition-colors"
    >
      {/* Job Info */}
      <td className="py-3 px-3">
        <div className="font-semibold text-slate-900">{j.jobName}</div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="font-mono text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
            {j.jobCode}
          </span>
          {!isPrintRow && <StatusBadge status={j.status} />}
          {isPrintRow && (
            <span className="text-[10px] font-semibold text-slate-500">
              [{j.status}]
            </span>
          )}
        </div>
      </td>

      {/* Client & Date */}
      <td className="py-3 px-3">
        <div className="font-medium text-slate-800 flex items-center gap-1">
          <Building2 className="h-3 w-3 text-slate-400 shrink-0" />
          <span className="truncate max-w-[140px]" title={j.clientName}>
            {j.clientName}
          </span>
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
          <Calendar className="h-3 w-3 text-slate-400 shrink-0" />
          <span className="font-mono">{j.jobDate || "—"}</span>
        </div>
      </td>

      {/* Approved Revenue */}
      <td className="py-3 px-2.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
        {formatCurrency(j.approvedJobValue)}
      </td>

      {/* Original Estimated Cost */}
      <td className="py-3 px-2.5 text-right font-mono text-slate-600 whitespace-nowrap">
        {reportPermissions.canViewOriginalCosts ? (
          formatCurrency(j.originalEstimatedCost)
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
            <Lock className="h-3 w-3" /> Restricted
          </span>
        )}
      </td>

      {/* Actual Supplier Invoice Cost */}
      <td className="py-3 px-2.5 text-right font-mono text-slate-800 whitespace-nowrap">
        {reportPermissions.canViewActualSupplierCosts ? (
          <>
            <div className="font-semibold">
              {formatCurrency(j.totalSupplierCost)}
            </div>
            <span className="text-[10px] text-slate-400">
              {j.supplierInvoicesCount} inv.
            </span>
          </>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
            <Lock className="h-3 w-3" /> Restricted
          </span>
        )}
      </td>

      {/* Additional Job Expenses */}
      <td className="py-3 px-2.5 text-right font-mono text-slate-700 whitespace-nowrap">
        <div>{formatCurrency(j.additionalExpenses)}</div>
        <span className="text-[10px] text-slate-400">
          {j.additionalExpensesCount || 0} exp.
        </span>
      </td>

      {/* Total Actual Expenses */}
      <td className="py-3 px-2.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
        {formatCurrency(j.totalActualCost)}
      </td>

      {/* Cost Saving */}
      <td className="py-3 px-2.5 text-right font-mono whitespace-nowrap">
        {!reportPermissions.canViewOriginalCosts ||
        !reportPermissions.canViewActualSupplierCosts ? (
          <span className="text-[10px] text-slate-400">—</span>
        ) : j.costSaving > 0 ? (
          <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200/70">
            +{formatCurrency(j.costSaving)}
          </span>
        ) : (
          <span className="text-slate-300">0.00</span>
        )}
      </td>

      {/* Cost Overrun */}
      <td className="py-3 px-2.5 text-right font-mono whitespace-nowrap">
        {!reportPermissions.canViewOriginalCosts ||
        !reportPermissions.canViewActualSupplierCosts ? (
          <span className="text-[10px] text-slate-400">—</span>
        ) : j.costOverrun > 0 ? (
          <span className="inline-block px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-semibold border border-rose-200/70">
            -{formatCurrency(j.costOverrun)}
          </span>
        ) : (
          <span className="text-slate-300">0.00</span>
        )}
      </td>

      {/* Gross Profit */}
      <td
        className={`py-3 px-2.5 text-right font-mono font-bold whitespace-nowrap ${
          j.grossProfit >= 0
            ? "text-emerald-700 bg-emerald-50/30"
            : "text-rose-700 bg-rose-50/40"
        }`}
      >
        {formatCurrency(j.grossProfit)}
      </td>

      {/* Profit Margin */}
      <td className="py-3 px-2.5 text-center font-mono whitespace-nowrap">
        {renderMarginPill(j.profitMargin)}
      </td>

      {/* Financial Status */}
      <td className="py-3 px-2.5 text-center whitespace-nowrap">
        {renderFinancialStatusBadge(j.financialStatus)}
      </td>

      {/* Action */}
      {!isPrintRow && (
        <td className="py-3 px-3 text-right print:hidden">
          <Link
            href={`/admin/jobs/${j.jobId}`}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
            title="Inspect Job Cost Comparison, Additional Expenses & P&L"
          >
            <span>Details</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </td>
      )}
    </tr>
  );

  return (
    <div className="space-y-5">
      {/* Print-Only Formal Header */}
      <div className="hidden print:block pb-4 border-b border-slate-300">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              Reflect Total Solutions ERP — Job Profit &amp; Loss Analysis
            </h1>
            <p className="text-xs text-slate-600 mt-0.5">
              Cost Variance (Original vs Actual Supplier Invoices), Additional Expenses &amp; Net Margin Statement
            </p>
          </div>
          <div className="text-right text-[11px] text-slate-600 font-mono">
            <div>Generated: {new Date().toLocaleString()}</div>
            <div>Jobs Included: {summary.totalJobsCount}</div>
          </div>
        </div>
      </div>

      {/* Screen Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200 print:hidden">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Job Financial Summary &amp; Profit / Loss Analysis
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Compare Original Estimated Job Costs against Actual Supplier Invoices, track non-invoice Additional Expenses, and audit Gross Profit.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={() => setRefreshTick((t) => t + 1)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${
                loading ? "animate-spin text-blue-600" : "text-slate-500"
              }`}
            />
            <span>Refresh</span>
          </button>

          {allowExportAction && (
            <>
              <button
                type="button"
                onClick={handleExportPdf}
                disabled={jobs.length === 0 || loading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Printer className="h-3.5 w-3.5 text-slate-500" />
                <span>Export PDF</span>
              </button>

              <button
                type="button"
                onClick={handleExportExcel}
                disabled={jobs.length === 0 || isExportingExcel || loading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isExportingExcel ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Exporting .xlsx...</span>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="h-4 w-4" />
                    <span>Export Excel (.xlsx)</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Authoritative Accounting Policy Notice */}
      <div className="p-3.5 rounded-xl bg-blue-50/80 border border-blue-200 text-blue-900 text-xs flex items-start gap-2.5">
        <AlertCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Accounting &amp; Profitability Basis:</span>
          <p className="text-[11px] text-blue-800 mt-0.5 leading-relaxed">
            <strong>Total Actual Expenses</strong> = Active Supplier Invoices + Active Additional Expenses.{" "}
            <strong>Gross Profit</strong> = Approved Job Revenue − Total Actual Expenses. Cost Savings (Original Cost − Actual Supplier Cost) measure procurement efficiency and are never added to Gross Profit. Purchase Orders (commitments) and cash Supplier Payments (payables settlement) do not inflate or reduce expenses.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      {loading && jobs.length === 0 ? (
        <DashboardSkeleton cardCount={4} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Approved Job Revenue & Payables */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">
                Approved Job Revenue
              </p>
              <p className="text-xl font-bold text-slate-900 mt-1 font-mono truncate">
                {formatCurrency(summary.totalApprovedValue, {
                  showCurrencyPrefix: true,
                })}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Across {summary.totalJobsCount} job
                {summary.totalJobsCount === 1 ? "" : "s"}
              </p>
              {reportPermissions.canViewActualSupplierCosts && (
                <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                  <CreditCard className="h-3 w-3 text-slate-400 shrink-0" />
                  <span>
                    Paid {formatCurrency(summary.totalSupplierPaid)} • Due{" "}
                    {formatCurrency(summary.totalSupplierOutstanding)}
                  </span>
                </p>
              )}
            </div>
            <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>

          {/* Original Job Cost vs Cost Saving/Overrun */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">
                Original Est. Job Cost
              </p>
              {reportPermissions.canViewOriginalCosts ? (
                <>
                  <p className="text-xl font-bold text-slate-900 mt-1 font-mono truncate">
                    {formatCurrency(summary.totalOriginalEstimatedCost, {
                      showCurrencyPrefix: true,
                    })}
                  </p>
                  {reportPermissions.canViewActualSupplierCosts ? (
                    <div className="text-[11px] mt-1 flex items-center gap-2 flex-wrap font-mono">
                      <span className="text-emerald-700 font-semibold">
                        Saving: {formatCurrency(summary.totalCostSaving)}
                      </span>
                      {summary.totalCostOverrun > 0 && (
                        <span className="text-rose-700 font-semibold">
                          Overrun: {formatCurrency(summary.totalCostOverrun)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400 mt-1">
                      Saved Excel budget baseline
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm font-semibold text-slate-400 mt-2 flex items-center gap-1">
                  <Lock className="h-3.5 w-3.5" /> Restricted by Role
                </p>
              )}
            </div>
            <div className="h-10 w-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 shrink-0">
              <Briefcase className="h-5 w-5" />
            </div>
          </div>

          {/* Total Actual Expenses */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">
                Total Actual Expenses
              </p>
              <p className="text-xl font-bold text-amber-700 mt-1 font-mono truncate">
                {formatCurrency(summary.totalActualCost, {
                  showCurrencyPrefix: true,
                })}
              </p>
              <div className="text-[10px] text-slate-500 mt-1 space-y-0.5 font-mono">
                <div>
                  Supplier Inv:{" "}
                  {reportPermissions.canViewActualSupplierCosts
                    ? formatCurrency(summary.totalSupplierCost)
                    : "Restricted"}
                </div>
                <div>
                  Additional Exp: {formatCurrency(summary.totalAdditionalExpenses)}
                </div>
              </div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
              <TrendingDown className="h-5 w-5" />
            </div>
          </div>

          {/* Gross Profit & Margin */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">
                Gross Profit &amp; Margin
              </p>
              <div className="flex items-baseline gap-2 mt-1 flex-wrap">
                <p
                  className={`text-xl font-bold font-mono truncate ${
                    summary.totalGrossProfit >= 0
                      ? "text-emerald-700"
                      : "text-rose-700"
                  }`}
                >
                  {formatCurrency(summary.totalGrossProfit, {
                    showCurrencyPrefix: true,
                  })}
                </p>
                <span className="text-xs font-bold font-mono text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                  {summary.averageProfitMargin !== null
                    ? `${Number(summary.averageProfitMargin).toFixed(2)}%`
                    : "N/A"}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {summary.profitableJobsCount} profitable •{" "}
                {summary.overBudgetJobsCount} over budget
              </p>
            </div>
            <div
              className={`h-10 w-10 rounded-xl border flex items-center justify-center shrink-0 ${
                summary.totalGrossProfit >= 0
                  ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                  : "bg-rose-50 border-rose-200 text-rose-600"
              }`}
            >
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs space-y-3 print:hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          <FilterSelect
            label="Job"
            value={jobIdFilter}
            onChange={(val) => {
              setJobIdFilter(val);
              setCurrentPage(1);
            }}
            options={[
              { label: "All Jobs", value: "all" },
              ...filtersMeta.jobs.map((j) => ({
                label: `${j.jobCode} — ${j.name}`,
                value: j.id,
              })),
            ]}
          />

          <FilterSelect
            label="Client"
            value={clientFilter}
            onChange={(val) => {
              setClientFilter(val);
              setCurrentPage(1);
            }}
            options={[
              { label: "All Clients", value: "all" },
              ...filtersMeta.clients.map((c) => ({ label: c, value: c })),
            ]}
          />

          <FilterSelect
            label="Job Status"
            value={jobStatusFilter}
            onChange={(val) => {
              setJobStatusFilter(val);
              setCurrentPage(1);
            }}
            options={[
              { label: "All Workflow Statuses", value: "all" },
              { label: "Approved / Active", value: "APPROVED" },
              { label: "Pending Approval", value: "PENDING_APPROVAL" },
              { label: "Rejected", value: "REJECTED" },
              { label: "Draft", value: "DRAFT" },
            ]}
          />

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Job Date From
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setCurrentPage(1);
              }}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Job Date To
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setCurrentPage(1);
              }}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2.5 pt-2 border-t border-slate-100">
          {/* Financial Status Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              {
                key: "all",
                label: `All (${filtersMeta.statusCounts.all})`,
                activeClass: "bg-slate-900 text-white",
              },
              {
                key: "high_margin",
                label: `High Margin (${filtersMeta.statusCounts.highMargin})`,
                activeClass: "bg-emerald-600 text-white",
              },
              {
                key: "healthy",
                label: `Healthy (${filtersMeta.statusCounts.healthy})`,
                activeClass: "bg-blue-600 text-white",
              },
              {
                key: "low_margin",
                label: `Low Margin (${filtersMeta.statusCounts.lowMargin})`,
                activeClass: "bg-amber-600 text-white",
              },
              {
                key: "over_budget",
                label: `Over Budget (${filtersMeta.statusCounts.overBudget})`,
                activeClass: "bg-rose-600 text-white",
              },
              {
                key: "n_a",
                label: `N/A (${filtersMeta.statusCounts.na})`,
                activeClass: "bg-slate-700 text-white",
              },
            ].map((pill) => (
              <button
                key={pill.key}
                type="button"
                onClick={() => {
                  setFinancialStatusFilter(pill.key);
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                  financialStatusFilter === pill.key
                    ? pill.activeClass
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="w-full sm:w-64">
              <SearchField
                value={searchTerm}
                isLoading={loading}
                onChange={setSearchTerm}
                placeholder="Search job code, name, client..."
              />
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        {loading && jobs.length === 0 ? (
          <TableSkeleton rows={6} columns={12} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-3">Job</th>
                    <th className="py-3 px-3">Client &amp; Date</th>
                    <th className="py-3 px-2.5 text-right">Approved Rev.</th>
                    <th className="py-3 px-2.5 text-right">Orig. Est. Cost</th>
                    <th className="py-3 px-2.5 text-right">Supplier Inv.</th>
                    <th className="py-3 px-2.5 text-right">Add&apos;l Exp.</th>
                    <th className="py-3 px-2.5 text-right">Total Actual</th>
                    <th className="py-3 px-2.5 text-right">Cost Saving</th>
                    <th className="py-3 px-2.5 text-right">Cost Overrun</th>
                    <th className="py-3 px-2.5 text-right">Gross Profit</th>
                    <th className="py-3 px-2.5 text-center">Margin</th>
                    <th className="py-3 px-2.5 text-center">Status</th>
                    <th className="py-3 px-3 text-right print:hidden">Action</th>
                  </tr>
                </thead>

                {/* Paginated Screen Rows */}
                <tbody className="divide-y divide-slate-100 print:hidden">
                  {paginatedJobs.length === 0 ? (
                    <tr>
                      <td
                        colSpan={13}
                        className="py-12 text-center text-slate-400"
                      >
                        <Briefcase className="h-10 w-10 text-slate-300 stroke-[1.5] mx-auto mb-2" />
                        <p className="text-sm font-semibold text-slate-600">
                          No Job Financial Records Found
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {hasActiveFilters
                            ? "No jobs match the selected filters."
                            : "No active job financial records exist yet."}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    paginatedJobs.map((j) => renderJobRow(j, false))
                  )}
                </tbody>

                {/* Full Filtered Rows for Print / PDF Export */}
                <tbody className="hidden print:table-row-group divide-y divide-slate-200">
                  {jobs.map((j) => renderJobRow(j, true))}
                </tbody>

                {/* Totals Footer Row */}
                {jobs.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-100/80 border-t-2 border-slate-300 font-bold text-slate-900 text-xs">
                      <td colSpan={2} className="py-3 px-3 uppercase tracking-wide text-[11px]">
                        Report Totals ({summary.totalJobsCount} Job
                        {summary.totalJobsCount === 1 ? "" : "s"})
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono whitespace-nowrap">
                        {formatCurrency(summary.totalApprovedValue)}
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono whitespace-nowrap">
                        {reportPermissions.canViewOriginalCosts
                          ? formatCurrency(summary.totalOriginalEstimatedCost)
                          : "Restricted"}
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono whitespace-nowrap">
                        {reportPermissions.canViewActualSupplierCosts
                          ? formatCurrency(summary.totalSupplierCost)
                          : "Restricted"}
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono whitespace-nowrap">
                        {formatCurrency(summary.totalAdditionalExpenses)}
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono whitespace-nowrap">
                        {formatCurrency(summary.totalActualCost)}
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono text-emerald-700 whitespace-nowrap">
                        {reportPermissions.canViewOriginalCosts &&
                        reportPermissions.canViewActualSupplierCosts
                          ? formatCurrency(summary.totalCostSaving)
                          : "—"}
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono text-rose-700 whitespace-nowrap">
                        {reportPermissions.canViewOriginalCosts &&
                        reportPermissions.canViewActualSupplierCosts
                          ? formatCurrency(summary.totalCostOverrun)
                          : "—"}
                      </td>
                      <td
                        className={`py-3 px-2.5 text-right font-mono whitespace-nowrap ${
                          summary.totalGrossProfit >= 0
                            ? "text-emerald-700"
                            : "text-rose-700"
                        }`}
                      >
                        {formatCurrency(summary.totalGrossProfit)}
                      </td>
                      <td className="py-3 px-2.5 text-center font-mono whitespace-nowrap">
                        {renderMarginPill(summary.averageProfitMargin)}
                      </td>
                      <td className="py-3 px-2.5" />
                      <td className="py-3 px-3 print:hidden" />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Pagination */}
            <div className="p-3 border-t border-slate-200 bg-slate-50/50 print:hidden">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalItems={jobs.length}
                onPageChange={setCurrentPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setCurrentPage(1);
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
