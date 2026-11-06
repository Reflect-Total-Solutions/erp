"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Briefcase,
  AlertCircle,
  Building2,
  Calendar,
  Search,
  Filter,
  Download,
  Eye,
  ArrowRight,
  ShieldAlert,
  Loader2,
  FileSpreadsheet,
} from "lucide-react";
import { useAdminData } from "@/context/admin-data-context";
import { formatCurrency } from "@/lib/financial";
import { Pagination } from "@/components/admin/ui/pagination";
import { SearchField } from "@/components/admin/ui/search-field";
import { DashboardSkeleton } from "@/components/ui/loading/dashboard-skeleton";
import { TableSkeleton } from "@/components/ui/loading/table-skeleton";
import { JobProfitLossSummary } from "@/types/admin";

export function ProfitLossView() {
  const { can, currentRole } = useAdminData();

  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [jobs, setJobs] = useState<JobProfitLossSummary[]>([]);
  const [summary, setSummary] = useState({
    totalJobsCount: 0,
    totalApprovedValue: 0,
    totalSupplierCost: 0,
    totalGrossProfit: 0,
    averageProfitMargin: 0,
    profitableJobsCount: 0,
    overBudgetJobsCount: 0,
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fetchProfitLossData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reports/profit-loss");
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        setJobs(json.data || []);
        if (json.summary) {
          setSummary(json.summary);
        }
      }
    } catch (err) {
      console.error("fetchProfitLossData error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfitLossData();
  }, []);

  // Filtered jobs
  const filteredJobs = useMemo(() => {
    return jobs.filter((j) => {
      const q = searchTerm.toLowerCase();
      const matchSearch =
        !q ||
        j.jobCode.toLowerCase().includes(q) ||
        j.jobName.toLowerCase().includes(q) ||
        j.clientName.toLowerCase().includes(q);

      const matchStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "profitable"
          ? j.grossProfit >= 0
          : statusFilter === "over_budget"
          ? j.grossProfit < 0
          : statusFilter === "high_margin"
          ? j.financialStatus === "High Margin"
          : true;

      return matchSearch && matchStatus;
    });
  }, [jobs, searchTerm, statusFilter]);

  // Pagination slice
  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / pageSize));
  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredJobs.slice(start, start + pageSize);
  }, [filteredJobs, currentPage, pageSize]);

  // Export to CSV
  const handleExportCsv = async () => {
    if (jobs.length === 0 || isExporting) return;
    setIsExporting(true);
    try {
      const headers = [
        "Job Number",
        "Job Title",
        "Client Name",
        "Job Date",
        "Approved Quotation Value",
        "Recorded Supplier Expenses",
        "Total Actual Cost",
        "Gross Profit",
        "Profit Margin (%)",
        "Financial Status",
      ];

      const rowsData = jobs.map((j) => [
        `"${j.jobCode}"`,
        `"${j.jobName.replace(/"/g, '""')}"`,
        `"${j.clientName.replace(/"/g, '""')}"`,
        `"${j.jobDate}"`,
        j.approvedJobValue.toFixed(2),
        j.totalSupplierCost.toFixed(2),
        j.totalActualCost.toFixed(2),
        j.grossProfit.toFixed(2),
        `${j.profitMargin}%`,
        `"${j.financialStatus}"`,
      ]);

      const csvContent =
        "data:text/csv;charset=utf-8," +
        [headers.join(","), ...rowsData.map((e) => e.join(","))].join("\n");

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute(
        "download",
        `Job_Profit_Loss_Report_${new Date().toISOString().split("T")[0]}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setTimeout(() => setIsExporting(false), 500);
    }
  };

  if (!can("profitLoss", "view")) {
    return (
      <div className="flex flex-col items-center justify-center p-10 bg-white rounded-2xl border border-slate-200 text-center max-w-lg mx-auto mt-8 shadow-xs">
        <div className="h-14 w-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-500 mt-2">
          You do not have permission to view Profit & Loss Financial Reports.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Job Financial Summary / Profit & Loss</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time comparison of approved project revenue against recorded actual supplier invoice costs.
          </p>
        </div>

        {can("profitLoss", "export") && (
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={jobs.length === 0 || isExporting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs self-start sm:self-auto disabled:opacity-50"
          >
            {isExporting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                <span>Preparing CSV...</span>
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5 text-slate-500" />
                <span>Export P&L Report</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Accounting Scope Disclosure Alert */}
      <div className="p-3.5 rounded-xl bg-blue-50/80 border border-blue-200 text-blue-900 text-xs flex items-start gap-2.5">
        <AlertCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Accounting Disclosure Note:</span>
          <p className="text-[11px] text-blue-800 mt-0.5 leading-relaxed">
            All gross profit and margin figures displayed are estimated and recorded strictly from approved quotation values minus
            actual supplier bills recorded in the system. Final audited company profit may vary based on statutory taxes, overheads,
            and unbilled operational adjustments.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      {loading ? (
        <DashboardSkeleton cardCount={4} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Quoted Value */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Approved Quotation Value</p>
            <p className="text-2xl font-bold text-slate-900 mt-1 font-mono">
              {formatCurrency(summary.totalApprovedValue, { showCurrencyPrefix: true })}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Across {summary.totalJobsCount} project jobs</p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
            <DollarSign className="h-5 w-5" />
          </div>
        </div>

        {/* Total Supplier Cost */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Actual Supplier Expenses</p>
            <p className="text-2xl font-bold text-amber-600 mt-1 font-mono">
              {formatCurrency(summary.totalSupplierCost, { showCurrencyPrefix: true })}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Recorded vendor vouchers</p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <TrendingDown className="h-5 w-5" />
          </div>
        </div>

        {/* Recorded Gross Profit */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Recorded Gross Profit</p>
            <p
              className={`text-2xl font-bold mt-1 font-mono ${
                summary.totalGrossProfit >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {formatCurrency(summary.totalGrossProfit, { showCurrencyPrefix: true })}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {summary.profitableJobsCount} profitable / {summary.overBudgetJobsCount} over budget
            </p>
          </div>
          <div
            className={`h-10 w-10 rounded-xl border flex items-center justify-center ${
              summary.totalGrossProfit >= 0
                ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                : "bg-rose-50 border-rose-200 text-rose-600"
            }`}
          >
            <TrendingUp className="h-5 w-5" />
          </div>
        </div>

        {/* Average Profit Margin */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Average Profit Margin</p>
            <p className="text-2xl font-bold text-indigo-600 mt-1 font-mono">
              {summary.averageProfitMargin}%
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Weighted project profitability</p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
            <Briefcase className="h-5 w-5" />
          </div>
        </div>
      </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setStatusFilter("all");
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === "all"
                ? "bg-slate-900 text-white font-semibold"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All Jobs ({jobs.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter("profitable");
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === "profitable"
                ? "bg-emerald-600 text-white font-semibold"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Profitable ({summary.profitableJobsCount})
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter("over_budget");
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === "over_budget"
                ? "bg-rose-600 text-white font-semibold"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Over Budget ({summary.overBudgetJobsCount})
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter("high_margin");
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === "high_margin"
                ? "bg-indigo-600 text-white font-semibold"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            High Margin (≥ 50%)
          </button>
        </div>

        <div className="w-full sm:w-72">
          <SearchField
            value={searchTerm}
            isLoading={loading}
            onChange={(val) => {
              setSearchTerm(val);
              setCurrentPage(1);
            }}
            placeholder="Search job code, name, client..."
          />
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        {loading && jobs.length === 0 ? (
          <TableSkeleton rows={6} columns={9} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-3.5">Job Info</th>
                    <th className="py-3 px-3.5">Client & Date</th>
                    <th className="py-3 px-3.5 text-right">Approved Value</th>
                    <th className="py-3 px-3.5 text-right">Supplier Cost</th>
                    <th className="py-3 px-3.5 text-right">Total Actual Cost</th>
                    <th className="py-3 px-3.5 text-right">Gross Profit</th>
                    <th className="py-3 px-3.5 text-center">Profit Margin</th>
                    <th className="py-3 px-3.5 text-center">Status</th>
                    <th className="py-3 px-3.5 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedJobs.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        <Briefcase className="h-10 w-10 text-slate-300 stroke-[1.5] mx-auto mb-2" />
                        <p className="text-sm font-semibold text-slate-600">No Job Financial Records Found</p>
                        <p className="text-xs text-slate-400 mt-1">
                          {searchTerm ? "No jobs match your search criteria." : "No jobs found for the selected filter."}
                        </p>
                      </td>
                    </tr>
                  ) : (
                paginatedJobs.map((j) => (
                  <tr key={j.jobId} className="hover:bg-slate-50/70 transition-colors">
                    {/* Job Info */}
                    <td className="py-3 px-3.5">
                      <div className="font-semibold text-slate-900">{j.jobName}</div>
                      <span className="font-mono text-[11px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 mt-0.5 inline-block">
                        {j.jobCode}
                      </span>
                    </td>

                    {/* Client & Date */}
                    <td className="py-3 px-3.5">
                      <div className="font-medium text-slate-800 flex items-center gap-1">
                        <Building2 className="h-3 w-3 text-slate-400 shrink-0" />
                        <span>{j.clientName}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-slate-400 shrink-0" />
                        <span>{j.jobDate}</span>
                      </div>
                      {j.createdByName && (
                        <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                          By: {j.createdByName}
                        </div>
                      )}
                    </td>

                    {/* Approved Value */}
                    <td className="py-3 px-3.5 text-right font-mono font-bold text-slate-800">
                      {formatCurrency(j.approvedJobValue)}
                    </td>

                    {/* Supplier Invoices Cost */}
                    <td className="py-3 px-3.5 text-right font-mono text-slate-700">
                      <div>{formatCurrency(j.totalSupplierCost)}</div>
                      <span className="text-[10px] text-slate-400">
                        {j.supplierInvoicesCount} bill{j.supplierInvoicesCount === 1 ? "" : "s"}
                      </span>
                    </td>

                    {/* Total Actual Cost */}
                    <td className="py-3 px-3.5 text-right font-mono font-medium text-slate-800">
                      {formatCurrency(j.totalActualCost)}
                    </td>

                    {/* Gross Profit */}
                    <td
                      className={`py-3 px-3.5 text-right font-mono font-bold ${
                        j.grossProfit >= 0 ? "text-emerald-700 bg-emerald-50/30" : "text-rose-700 bg-rose-50/40"
                      }`}
                    >
                      {formatCurrency(j.grossProfit)}
                    </td>

                    {/* Profit Margin */}
                    <td className="py-3 px-3.5 text-center font-mono">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold ${
                          j.profitMargin >= 50
                            ? "bg-emerald-100 text-emerald-800"
                            : j.profitMargin >= 20
                            ? "bg-blue-100 text-blue-800"
                            : j.profitMargin >= 0
                            ? "bg-amber-100 text-amber-800"
                            : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {j.profitMargin}%
                      </span>
                    </td>

                    {/* Financial Status Badge */}
                    <td className="py-3 px-3.5 text-center whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          j.financialStatus === "High Margin"
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                            : j.financialStatus === "Healthy"
                            ? "bg-blue-100 text-blue-800 border border-blue-300"
                            : j.financialStatus === "Low Margin"
                            ? "bg-amber-100 text-amber-800 border border-amber-300"
                            : "bg-rose-100 text-rose-800 border border-rose-300"
                        }`}
                      >
                        {j.financialStatus}
                      </span>
                    </td>

                    {/* Action: Link to Job Details */}
                    <td className="py-3 px-3.5 text-right">
                      <Link
                        href={`/admin/jobs/${j.jobId}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                        title="View Full Job Details & Financial Breakdown"
                      >
                        <span>View</span>
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-3 border-t border-slate-200 bg-slate-50/50">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={filteredJobs.length}
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
