"use client";

import React, { useMemo, useState } from "react";
import {
  AdditionalExpenseAuditModal,
  AdditionalExpenseFormModal,
  CancelAdditionalExpenseModal,
} from "@/components/admin/modals/additional-expense-modal";
import { PreviewableAttachment } from "@/components/admin/modals/attachment-preview-modal";
import { StatusBadge } from "@/components/admin/ui/badge";
import { useAdminData } from "@/context/admin-data-context";
import { formatCurrency } from "@/lib/financial";
import { getFileCategory } from "@/lib/file-validation";
import {
  Job,
  JobAdditionalExpense,
  JobCostComparisonRow,
  Supplier,
  SupplierPayment,
} from "@/types/admin";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Download,
  Edit2,
  ExternalLink,
  Eye,
  FileText,
  History,
  Info,
  Loader2,
  Lock,
  Plus,
  Receipt,
  Search,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

// ============================================================================
// C. ADDITIONAL EXPENSES TAB
// ============================================================================

interface JobAdditionalExpensesTabProps {
  job: Job;
  expenses: JobAdditionalExpense[];
  suppliers: Supplier[];
  permissions: {
    canCreateAdditionalExpense: boolean;
    canEditAdditionalExpense: boolean;
    canCancelAdditionalExpense: boolean;
  };
  onRefresh: () => void;
  onPreviewAttachment: (att: PreviewableAttachment) => void;
}

export function JobAdditionalExpensesTab({
  job,
  expenses,
  suppliers,
  permissions,
  onRefresh,
  onPreviewAttachment,
}: JobAdditionalExpensesTabProps) {
  const { showToast } = useAdminData();

  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "CANCELLED">("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<JobAdditionalExpense | null>(null);
  const [cancellingExpense, setCancellingExpense] = useState<JobAdditionalExpense | null>(null);
  const [auditExpense, setAuditExpense] = useState<JobAdditionalExpense | null>(null);
  const [loadingReceiptId, setLoadingReceiptId] = useState<string | null>(null);

  const summary = useMemo(() => {
    const active = expenses.filter((e) => e.status === "ACTIVE" && !e.linkedSupplierInvoiceId);
    const cancelled = expenses.filter((e) => e.status === "CANCELLED");
    const activeTotal = active.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const cancelledTotal = cancelled.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    return {
      activeCount: active.length,
      cancelledCount: cancelled.length,
      activeTotal,
      cancelledTotal,
    };
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return expenses.filter((e) => {
      if (statusFilter !== "ALL" && e.status !== statusFilter) return false;
      if (!q) return true;
      return (
        e.category.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        (e.supplierName && e.supplierName.toLowerCase().includes(q)) ||
        (e.payeeName && e.payeeName.toLowerCase().includes(q)) ||
        (e.paymentReference && e.paymentReference.toLowerCase().includes(q)) ||
        (e.notes && e.notes.toLowerCase().includes(q))
      );
    });
  }, [expenses, statusFilter, searchTerm]);

  const handlePreviewReceipt = async (exp: JobAdditionalExpense) => {
    if (!exp.attachmentStoragePath) return;
    setLoadingReceiptId(exp.id);
    try {
      const res = await fetch(
        `/api/jobs/${job.id}/additional-expenses/${exp.id}/receipt?action=signed-url`
      );
      const json = await res.json();
      if (!res.ok || !json?.success || !json.signedUrl) {
        showToast(
          "Preview Failed",
          json?.error || "Unable to open receipt preview.",
          "error"
        );
        return;
      }
      onPreviewAttachment({
        name: json.fileName || exp.attachmentName || "receipt",
        url: json.signedUrl,
        category: getFileCategory(json.fileName || exp.attachmentName || "file"),
        size: json.fileSize || exp.attachmentSize || undefined,
        description: `${exp.category} — ${exp.description}`,
      });
    } catch (err: any) {
      showToast("Error", err?.message || "Failed to load receipt.", "error");
    } finally {
      setLoadingReceiptId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header & Double Counting Notice */}
      <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
        <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-[11px] leading-relaxed">
          <strong>Additional Operational Expenses:</strong> Record expenses not billed through a Supplier Invoice (e.g. transport, courier, petty cash, site labour, fuel). Active entries automatically add to{" "}
          <strong>Total Actual Expenses</strong> and update <strong>Job Gross Profit</strong>. Any cost already captured on a Supplier Invoice is blocked from duplicate entry here.
        </p>
      </div>

      {/* Summary Cards + Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <span className="text-[11px] font-medium text-slate-500 block">
            Active Additional Expenses
          </span>
          <span className="text-xl font-bold font-mono text-amber-700 mt-1 block">
            {formatCurrency(summary.activeTotal, { showCurrencyPrefix: true })}
          </span>
          <span className="text-[11px] text-slate-400">
            {summary.activeCount} active item{summary.activeCount === 1 ? "" : "s"} included in P&amp;L
          </span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <span className="text-[11px] font-medium text-slate-500 block">
            Cancelled Expenses (Excluded)
          </span>
          <span className="text-xl font-bold font-mono text-slate-500 mt-1 block">
            {formatCurrency(summary.cancelledTotal, { showCurrencyPrefix: true })}
          </span>
          <span className="text-[11px] text-slate-400">
            {summary.cancelledCount} cancelled record{summary.cancelledCount === 1 ? "" : "s"} retained for audit
          </span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-500 block">
              Record New Expense
            </span>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Attach receipt proof &amp; recalculate job profitability immediately.
            </p>
          </div>
          {permissions.canCreateAdditionalExpense ? (
            <button
              type="button"
              onClick={() => setIsAddOpen(true)}
              className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1d4ed8] px-3.5 py-2 text-xs font-semibold text-white shadow-2xs transition-colors cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Additional Expense</span>
            </button>
          ) : (
            <span className="mt-2 text-[11px] text-slate-400 italic flex items-center gap-1">
              <Lock className="h-3 w-3" /> Read-only permission
            </span>
          )}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
        <div className="flex items-center gap-1.5">
          {[
            { key: "ALL", label: `All (${expenses.length})` },
            { key: "ACTIVE", label: `Active (${summary.activeCount})` },
            { key: "CANCELLED", label: `Cancelled (${summary.cancelledCount})` },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                statusFilter === tab.key
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search category, description, ref..."
            className="h-8 w-full rounded-lg border border-slate-200 pl-8 pr-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        {filteredExpenses.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Receipt className="h-10 w-10 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">
              {expenses.length === 0
                ? "No Additional Job Expenses Recorded Yet"
                : "No Expenses Match Your Filter"}
            </p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              {expenses.length === 0
                ? "Record non-invoice operational costs such as transport, emergency courier, fuel, or site labour to include them in accurate Job Profit & Loss."
                : "Adjust your search or status filter."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Description &amp; Notes</th>
                  <th className="px-4 py-3">Supplier / Payee</th>
                  <th className="px-4 py-3">Ref #</th>
                  <th className="px-4 py-3">Receipt</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3">Recorded By</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredExpenses.map((exp) => {
                  const isCancelled = exp.status === "CANCELLED";
                  return (
                    <tr
                      key={exp.id}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        isCancelled ? "bg-slate-50/70 opacity-65" : ""
                      }`}
                    >
                      <td className="px-4 py-3 font-mono text-slate-700 whitespace-nowrap">
                        {exp.expenseDate}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-[11px]">
                          {exp.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <div
                          className={`font-semibold ${
                            isCancelled
                              ? "line-through text-slate-500"
                              : "text-slate-900"
                          }`}
                        >
                          {exp.description}
                        </div>
                        {exp.notes && (
                          <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                            {exp.notes}
                          </div>
                        )}
                        {isCancelled && exp.cancellationReason && (
                          <div className="text-[10px] text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 mt-1">
                            Cancelled: {exp.cancellationReason}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {exp.supplierName ? (
                          <div>
                            <span className="font-medium text-slate-800 block">
                              {exp.supplierName}
                            </span>
                            {exp.supplierCode && (
                              <span className="text-[10px] font-mono text-slate-400">
                                {exp.supplierCode}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span>{exp.payeeName || "—"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">
                        {exp.paymentReference || "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {exp.attachmentStoragePath ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handlePreviewReceipt(exp)}
                              disabled={loadingReceiptId === exp.id}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 text-[11px] font-semibold cursor-pointer"
                              title={`Preview ${exp.attachmentName || "Receipt"}`}
                            >
                              {loadingReceiptId === exp.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Eye className="h-3 w-3" />
                              )}
                              <span>View</span>
                            </button>
                            <a
                              href={`/api/jobs/${job.id}/additional-expenses/${exp.id}/receipt?action=download`}
                              className="p-1 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50"
                              title={`Download ${exp.attachmentName || "Receipt"}`}
                            >
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">No file</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold whitespace-nowrap">
                        <span
                          className={
                            isCancelled
                              ? "line-through text-slate-400"
                              : "text-slate-900"
                          }
                        >
                          {formatCurrency(exp.amount, { showCurrencyPrefix: true })}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <StatusBadge status={exp.status} />
                      </td>
                      <td className="px-4 py-3 text-[11px] text-slate-600">
                        <div className="font-medium text-slate-800">
                          {exp.createdByName || "Admin"}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {exp.createdAt
                            ? new Date(exp.createdAt).toLocaleDateString()
                            : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {permissions.canEditAdditionalExpense && !isCancelled && (
                            <button
                              type="button"
                              onClick={() => setEditingExpense(exp)}
                              className="p-1.5 rounded text-slate-500 hover:text-blue-700 hover:bg-blue-50 cursor-pointer"
                              title="Edit additional expense"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {permissions.canCancelAdditionalExpense && !isCancelled && (
                            <button
                              type="button"
                              onClick={() => setCancellingExpense(exp)}
                              className="p-1.5 rounded text-slate-500 hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
                              title="Cancel expense with reason"
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setAuditExpense(exp)}
                            className="inline-flex items-center gap-0.5 px-1.5 py-1 rounded text-[10px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                            title="View immutable audit log"
                          >
                            <History className="h-3.5 w-3.5" />
                            <span>{exp.auditLogs?.length || 0}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      <AdditionalExpenseFormModal
        isOpen={isAddOpen || Boolean(editingExpense)}
        onClose={() => {
          setIsAddOpen(false);
          setEditingExpense(null);
        }}
        jobId={job.id}
        jobCode={job.jobCode}
        jobName={job.name}
        suppliers={suppliers}
        expense={editingExpense}
        onSuccess={onRefresh}
      />

      {/* Cancel Modal */}
      <CancelAdditionalExpenseModal
        isOpen={Boolean(cancellingExpense)}
        onClose={() => setCancellingExpense(null)}
        jobId={job.id}
        expense={cancellingExpense}
        onSuccess={onRefresh}
      />

      {/* Audit History Modal */}
      <AdditionalExpenseAuditModal
        isOpen={Boolean(auditExpense)}
        onClose={() => setAuditExpense(null)}
        expense={auditExpense}
      />
    </div>
  );
}

// ============================================================================
// D. PROFIT & LOSS & JOB COST VS ACTUAL COST COMPARISON TAB
// ============================================================================

interface JobProfitLossTabProps {
  overview: NonNullable<Job["financialOverview"]>;
  comparison: Job["costComparison"];
  permissions: {
    canViewFinancialSummary: boolean;
    canViewOriginalCosts: boolean;
    canViewActualSupplierCosts: boolean;
  };
  onOpenSupplierInvoice: (invoiceId: string) => void;
}

export function JobProfitLossTab({
  overview,
  comparison,
  permissions,
  onOpenSupplierInvoice,
}: JobProfitLossTabProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [varianceFilter, setVarianceFilter] = useState<
    "ALL" | "SAVING" | "OVERRUN" | "ON_BUDGET" | "UNINVOICED"
  >("ALL");

  const filteredRows = useMemo(() => {
    const rows = comparison?.rows || [];
    const q = searchTerm.trim().toLowerCase();
    return rows.filter((r) => {
      if (varianceFilter !== "ALL" && r.varianceStatus !== varianceFilter) {
        return false;
      }
      if (!q) return true;
      return (
        r.categoryName.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.linkedInvoices.some((inv) =>
          inv.invoiceNumber.toLowerCase().includes(q)
        )
      );
    });
  }, [comparison?.rows, searchTerm, varianceFilter]);

  if (!permissions.canViewFinancialSummary) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-2">
        <ShieldAlert className="h-10 w-10 text-rose-500 mx-auto" />
        <h3 className="text-sm font-bold text-slate-900">
          Profit &amp; Loss Restricted
        </h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Your role does not grant permission to inspect Job Profit &amp; Loss or Cost Comparison figures.
        </p>
      </div>
    );
  }

  const totals = comparison?.totals || {
    originalJobCost: overview.originalEstimatedJobCost,
    actualInvoiceCost: overview.totalSupplierCost,
    costDifference: overview.costDifference,
    costSaving: overview.costSaving,
    costOverrun: overview.costOverrun,
    invoicedAmount: overview.totalSupplierCost,
    paidAllocatedAmount: overview.supplierPaidAmount,
    outstandingInvoiceAmount: overview.supplierOutstandingBalance,
    unlinkedActualCost: 0,
  };

  const renderVarianceCell = (row: JobCostComparisonRow) => {
    if (!permissions.canViewOriginalCosts || !permissions.canViewActualSupplierCosts) {
      return <span className="text-slate-400 text-[11px]">Restricted</span>;
    }
    if (row.actualInvoiceCost === 0 && row.invoiceCount === 0) {
      return (
        <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-semibold">
          Uninvoiced ({formatCurrency(row.originalJobCost)})
        </span>
      );
    }
    if (row.costDifference > 0) {
      return (
        <span className="inline-block px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono font-bold text-[11px]">
          +{formatCurrency(row.costSaving)} Saving
        </span>
      );
    }
    if (row.costDifference < 0) {
      return (
        <span className="inline-block px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-mono font-bold text-[11px]">
          -{formatCurrency(row.costOverrun)} Overrun
        </span>
      );
    }
    return (
      <span className="inline-block px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono font-semibold text-[11px]">
        0.00 On Budget
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* Executive P&L Statement */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Profitability Math Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              <span>Job Profit &amp; Loss Calculation</span>
            </h3>
            <span
              className={`text-xs font-bold font-mono px-2 py-0.5 rounded-full border ${
                overview.profitMargin === null
                  ? "bg-slate-100 text-slate-600 border-slate-300"
                  : overview.grossProfit >= 0
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-rose-50 text-rose-700 border-rose-200"
              }`}
            >
              Margin:{" "}
              {overview.profitMargin !== null
                ? `${Number(overview.profitMargin).toFixed(2)}%`
                : "N/A"}
            </span>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            <div className="flex justify-between py-2">
              <span className="text-slate-600 font-medium">
                Approved Job Revenue (Quotation)
              </span>
              <span className="font-mono font-bold text-slate-900">
                {formatCurrency(overview.approvedJobValue, {
                  showCurrencyPrefix: true,
                })}
              </span>
            </div>

            <div className="flex justify-between py-2">
              <span className="text-slate-600">
                Actual Supplier Invoice Cost ({overview.supplierInvoicesCount}{" "}
                active)
              </span>
              <span className="font-mono font-semibold text-blue-700">
                {permissions.canViewActualSupplierCosts ? (
                  formatCurrency(overview.totalSupplierCost, {
                    showCurrencyPrefix: true,
                  })
                ) : (
                  <span className="text-slate-400">Restricted</span>
                )}
              </span>
            </div>

            <div className="flex justify-between py-2">
              <span className="text-slate-600">
                Additional Operational Expenses (
                {overview.additionalExpensesCount || 0} active)
              </span>
              <span className="font-mono font-semibold text-amber-700">
                {formatCurrency(overview.additionalExpensesTotal, {
                  showCurrencyPrefix: true,
                })}
              </span>
            </div>

            <div className="flex justify-between py-2 bg-slate-50/80 px-2 -mx-2 rounded">
              <span className="font-semibold text-slate-800">
                Total Actual Expenses (Supplier Inv. + Add&apos;l Exp.)
              </span>
              <span className="font-mono font-bold text-slate-900">
                {formatCurrency(overview.totalActualCost, {
                  showCurrencyPrefix: true,
                })}
              </span>
            </div>

            <div className="flex justify-between pt-3 pb-1 text-sm">
              <span className="font-bold text-slate-900">
                Gross Profit (Revenue − Total Actual Expenses)
              </span>
              <span
                className={`font-mono font-extrabold ${
                  overview.grossProfit >= 0
                    ? "text-emerald-700"
                    : "text-rose-700"
                }`}
              >
                {formatCurrency(overview.grossProfit, {
                  showCurrencyPrefix: true,
                })}
              </span>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 bg-blue-50/70 border border-blue-100 rounded-lg px-3 py-2 flex items-start gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 text-blue-600 shrink-0 mt-0.5" />
            <span>
              Cost Savings are tracked strictly for budget variance efficiency and are{" "}
              <strong>never added</strong> to Gross Profit. Purchase Orders are excluded.
            </span>
          </p>
        </div>

        {/* Procurement Cost Variance & Payables Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign className="h-4 w-4 text-blue-600" />
                <span>Original Job Cost vs Actual Supplier Cost</span>
              </h3>
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              <div className="flex justify-between py-2">
                <span className="text-slate-600">
                  Original Estimated Job Cost (Saved Excel Budget)
                </span>
                <span className="font-mono font-bold text-slate-900">
                  {permissions.canViewOriginalCosts ? (
                    formatCurrency(overview.originalEstimatedJobCost, {
                      showCurrencyPrefix: true,
                    })
                  ) : (
                    <span className="text-slate-400">Restricted</span>
                  )}
                </span>
              </div>

              <div className="flex justify-between py-2">
                <span className="text-slate-600">
                  Actual Supplier Invoice Cost
                </span>
                <span className="font-mono font-semibold text-blue-700">
                  {permissions.canViewActualSupplierCosts ? (
                    formatCurrency(overview.totalSupplierCost, {
                      showCurrencyPrefix: true,
                    })
                  ) : (
                    <span className="text-slate-400">Restricted</span>
                  )}
                </span>
              </div>

              <div className="flex justify-between py-2.5">
                <span className="font-bold text-slate-800">
                  Cost Variance (Original − Actual Invoice Cost)
                </span>
                {!permissions.canViewOriginalCosts ||
                !permissions.canViewActualSupplierCosts ? (
                  <span className="text-slate-400 font-semibold">Restricted</span>
                ) : overview.costDifference > 0 ? (
                  <span className="font-mono font-extrabold text-emerald-700">
                    +{formatCurrency(overview.costSaving, { showCurrencyPrefix: true })}{" "}
                    (Cost Saving)
                  </span>
                ) : overview.costDifference < 0 ? (
                  <span className="font-mono font-extrabold text-rose-700">
                    -{formatCurrency(overview.costOverrun, { showCurrencyPrefix: true })}{" "}
                    (Cost Overrun)
                  </span>
                ) : (
                  <span className="font-mono font-bold text-slate-700">
                    Rs. 0.00 (On Budget)
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Accounts Payable Status (Cash Settlement)
              </span>
              <span className="text-[10px] text-slate-400">
                Does not affect P&amp;L profit
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <span className="text-[10px] text-slate-500 block">
                  Cash Paid to Suppliers
                </span>
                <span className="font-mono font-bold text-emerald-700">
                  {permissions.canViewActualSupplierCosts
                    ? formatCurrency(overview.supplierPaidAmount, {
                        showCurrencyPrefix: true,
                      })
                    : "Restricted"}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">
                  Outstanding Payable Balance
                </span>
                <span className="font-mono font-bold text-amber-700">
                  {permissions.canViewActualSupplierCosts
                    ? formatCurrency(overview.supplierOutstandingBalance, {
                        showCurrencyPrefix: true,
                      })
                    : "Restricted"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Line-by-Line Cost vs Actual Cost Comparison Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          <div>
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Job Cost Item vs Actual Supplier Invoice Comparison
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Original Excel cost items preserved permanently vs actual billed amounts and outstanding supplier payables.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={varianceFilter}
              onChange={(e) => setVarianceFilter(e.target.value as any)}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:outline-none"
            >
              <option value="ALL">All Variance ({comparison?.rows.length || 0})</option>
              <option value="SAVING">Cost Saving</option>
              <option value="OVERRUN">Cost Overrun</option>
              <option value="ON_BUDGET">On Budget</option>
              <option value="UNINVOICED">Uninvoiced</option>
            </select>

            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search category, item, invoice..."
                className="h-8 w-52 rounded-lg border border-slate-200 pl-8 pr-2.5 text-xs bg-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/70 text-[10px] font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-4 py-2.5">Cost Category</th>
                <th className="px-4 py-2.5">Description</th>
                <th className="px-3.5 py-2.5 text-right">Original Job Cost</th>
                <th className="px-3.5 py-2.5 text-right">Actual Supplier Invoice Cost</th>
                <th className="px-3.5 py-2.5 text-center">Cost Difference</th>
                <th className="px-3.5 py-2.5 text-right">Invoiced Amount</th>
                <th className="px-4 py-2.5 text-right">Outstanding Invoice Amt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                    No matching Job cost lines found.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.jobCostItemId} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">
                      {row.categoryName}
                    </td>
                    <td className="px-4 py-3 max-w-sm">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-slate-900">
                          {row.description}
                        </span>
                        {row.rcNrc && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                            {row.rcNrc}
                          </span>
                        )}
                      </div>
                      {permissions.canViewOriginalCosts && (
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          Orig Qty: {row.originalQuantity} × {formatCurrency(row.originalRate)}
                        </div>
                      )}
                      {permissions.canViewActualSupplierCosts &&
                        row.linkedInvoices.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {row.linkedInvoices.map((li, idx) => (
                              <button
                                key={`${li.invoiceId}-${idx}`}
                                type="button"
                                onClick={() => onOpenSupplierInvoice(li.invoiceId)}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[10px] font-mono cursor-pointer"
                                title={`${li.supplierName} (${li.invoiceDate.split("T")[0]}) — Paid ${formatCurrency(li.paidAllocatedAmount)} / Due ${formatCurrency(li.outstandingAllocatedAmount)}`}
                              >
                                <span>{li.invoiceNumber}</span>
                                <span className="text-blue-900 font-bold">
                                  ({formatCurrency(li.itemAmount)})
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                    </td>
                    <td className="px-3.5 py-3 text-right font-mono font-semibold text-slate-800 whitespace-nowrap">
                      {permissions.canViewOriginalCosts ? (
                        formatCurrency(row.originalJobCost)
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                          <Lock className="h-3 w-3" /> Restricted
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-3 text-right font-mono font-semibold text-blue-800 whitespace-nowrap">
                      {permissions.canViewActualSupplierCosts ? (
                        formatCurrency(row.actualInvoiceCost)
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                          <Lock className="h-3 w-3" /> Restricted
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-3 text-center whitespace-nowrap">
                      {renderVarianceCell(row)}
                    </td>
                    <td className="px-3.5 py-3 text-right font-mono text-slate-700 whitespace-nowrap">
                      {permissions.canViewActualSupplierCosts ? (
                        <div>
                          <div>{formatCurrency(row.invoicedAmount)}</div>
                          {row.invoiceCount > 0 && (
                            <span className="text-[10px] text-slate-400">
                              {row.invoiceCount} inv.
                            </span>
                          )}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                      {permissions.canViewActualSupplierCosts ? (
                        row.invoicedAmount > 0 ? (
                          <div>
                            <span
                              className={`font-bold ${
                                row.outstandingInvoiceAmount > 0
                                  ? "text-amber-700"
                                  : "text-emerald-700"
                              }`}
                            >
                              {formatCurrency(row.outstandingInvoiceAmount)}
                            </span>
                            <span className="block text-[10px] text-slate-400">
                              Paid: {formatCurrency(row.paidAllocatedAmount)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-300">0.00</span>
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>

            {/* Reconciliation Totals Footer */}
            {comparison && (
              <tfoot>
                {totals.unlinkedActualCost > 0 && (
                  <tr className="bg-amber-50/60 border-t border-amber-200 text-xs">
                    <td colSpan={2} className="px-4 py-2.5 font-semibold text-amber-900">
                      Unlinked / Manual Supplier Invoice Lines ({comparison.unlinkedItems.length} item
                      {comparison.unlinkedItems.length === 1 ? "" : "s"})
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono text-slate-400">
                      0.00
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-bold text-amber-900">
                      {formatCurrency(totals.unlinkedActualCost)}
                    </td>
                    <td className="px-3.5 py-2.5 text-center text-[10px] text-amber-800">
                      Additional invoice items
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-bold text-amber-900">
                      {formatCurrency(totals.unlinkedActualCost)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-amber-900">
                      {formatCurrency(
                        comparison.unlinkedItems.reduce(
                          (s, u) => s + Number(u.outstandingAllocatedAmount || 0),
                          0
                        )
                      )}
                    </td>
                  </tr>
                )}
                <tr className="bg-slate-100/90 border-t-2 border-slate-300 font-bold text-slate-900 text-xs">
                  <td colSpan={2} className="px-4 py-3 uppercase tracking-wide text-[11px]">
                    Grand Totals (Reconciled to Active Supplier Invoices)
                  </td>
                  <td className="px-3.5 py-3 text-right font-mono">
                    {permissions.canViewOriginalCosts
                      ? formatCurrency(totals.originalJobCost)
                      : "Restricted"}
                  </td>
                  <td className="px-3.5 py-3 text-right font-mono text-blue-800">
                    {permissions.canViewActualSupplierCosts
                      ? formatCurrency(totals.actualInvoiceCost)
                      : "Restricted"}
                  </td>
                  <td className="px-3.5 py-3 text-center font-mono">
                    {!permissions.canViewOriginalCosts ||
                    !permissions.canViewActualSupplierCosts ? (
                      "—"
                    ) : totals.costDifference >= 0 ? (
                      <span className="text-emerald-700">
                        +{formatCurrency(totals.costSaving)} Saving
                      </span>
                    ) : (
                      <span className="text-rose-700">
                        -{formatCurrency(totals.costOverrun)} Overrun
                      </span>
                    )}
                  </td>
                  <td className="px-3.5 py-3 text-right font-mono">
                    {permissions.canViewActualSupplierCosts
                      ? formatCurrency(totals.invoicedAmount)
                      : "Restricted"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-amber-800">
                    {permissions.canViewActualSupplierCosts
                      ? formatCurrency(totals.outstandingInvoiceAmount)
                      : "Restricted"}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Detailed Unlinked Invoice Items Breakdown if present */}
      {permissions.canViewActualSupplierCosts &&
        comparison &&
        comparison.unlinkedItems.length > 0 && (
          <div className="bg-white rounded-xl border border-amber-200 overflow-hidden shadow-2xs">
            <div className="px-5 py-3 bg-amber-50/70 border-b border-amber-200 flex items-center justify-between">
              <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                Unlinked / Manual Supplier Invoice Lines
              </h4>
              <span className="text-[11px] font-mono font-bold text-amber-800">
                Total: {formatCurrency(totals.unlinkedActualCost, { showCurrencyPrefix: true })}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[10px] font-semibold uppercase text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2">Invoice #</th>
                    <th className="px-4 py-2">Supplier</th>
                    <th className="px-4 py-2">Description</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2 text-right">Paid</th>
                    <th className="px-4 py-2 text-right">Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {comparison.unlinkedItems.map((ui) => (
                    <tr key={ui.invoiceItemId} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono font-bold">
                        <button
                          type="button"
                          onClick={() => onOpenSupplierInvoice(ui.invoiceId)}
                          className="text-blue-600 hover:underline inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span>{ui.invoiceNumber}</span>
                          <ExternalLink className="h-3 w-3 opacity-60" />
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">{ui.supplierName}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-900">
                        {ui.description}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-900">
                        {formatCurrency(ui.amount)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-emerald-700">
                        {formatCurrency(ui.paidAllocatedAmount)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-amber-700">
                        {formatCurrency(ui.outstandingAllocatedAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
    </div>
  );
}

// ============================================================================
// E. PAYMENT SUMMARY TAB
// ============================================================================

interface JobPaymentSummaryTabProps {
  job: Job;
  overview: NonNullable<Job["financialOverview"]>;
  canViewActualSupplierCosts: boolean;
  onOpenSupplierInvoicePayments: (invoiceId: string) => void;
  onPreviewAttachment: (att: PreviewableAttachment) => void;
}

export function JobPaymentSummaryTab({
  job,
  overview,
  canViewActualSupplierCosts,
  onOpenSupplierInvoicePayments,
  onPreviewAttachment,
}: JobPaymentSummaryTabProps) {
  const { showToast } = useAdminData();
  const [loadingPaymentReceiptId, setLoadingPaymentReceiptId] = useState<string | null>(null);

  const allPayments = useMemo(() => {
    const list: Array<
      SupplierPayment & {
        invoiceNumber: string;
        supplierName: string;
        paymentStatusLabel?: string;
      }
    > = [];
    for (const inv of job.supplierInvoices || []) {
      for (const p of inv.payments || []) {
        list.push({
          ...p,
          invoiceNumber: p.invoiceNumber || inv.invoiceNumber,
          supplierName: p.supplierName || inv.supplierName || "Supplier",
        });
      }
    }
    list.sort(
      (a, b) =>
        new Date(b.paymentDate || b.createdAt).getTime() -
        new Date(a.paymentDate || a.createdAt).getTime()
    );
    return list;
  }, [job.supplierInvoices]);

  const activePaymentsCount = useMemo(
    () => allPayments.filter((p) => p.status === "SUCCESS").length,
    [allPayments]
  );

  const handlePreviewPaymentReceipt = async (p: SupplierPayment) => {
    if (!p.attachmentStoragePath) return;
    setLoadingPaymentReceiptId(p.id);
    try {
      const res = await fetch(
        `/api/supplier-payments/${p.id}/receipt?action=signed-url`
      );
      const json = await res.json();
      if (!res.ok || !json?.success || !json.signedUrl) {
        showToast(
          "Receipt Unavailable",
          json?.error || "Could not open payment receipt.",
          "error"
        );
        return;
      }
      onPreviewAttachment({
        name: json.fileName || p.attachmentName || "payment-receipt",
        url: json.signedUrl,
        category: getFileCategory(json.fileName || p.attachmentName || "file"),
        size: json.fileSize || p.attachmentSize || undefined,
        description: `Payment ${p.paymentNumber} (${p.invoiceNumber || ""})`,
      });
    } catch (err: any) {
      showToast("Error", err?.message || "Failed to load receipt.", "error");
    } finally {
      setLoadingPaymentReceiptId(null);
    }
  };

  if (!canViewActualSupplierCosts) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-2">
        <ShieldAlert className="h-10 w-10 text-rose-500 mx-auto" />
        <h3 className="text-sm font-bold text-slate-900">
          Supplier Payables Restricted
        </h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Your role does not have permission to inspect Supplier Invoice costs or Supplier Payment records.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="p-3.5 rounded-xl bg-blue-50/80 border border-blue-200 text-blue-900 text-xs flex items-start gap-2.5">
        <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-[11px] leading-relaxed">
          <strong>Payables &amp; Cashflow Separation:</strong> Supplier Payments settle Accounts Payable balances against active Supplier Invoices. Recording a partial or full payment never reduces{" "}
          <strong>Actual Supplier Invoice Cost</strong> and never increases{" "}
          <strong>Job Gross Profit</strong>.
        </p>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <span className="text-[11px] font-medium text-slate-500 block">
            Total Billed Invoices
          </span>
          <span className="text-xl font-bold font-mono text-slate-900 mt-1 block">
            {formatCurrency(overview.totalSupplierCost, {
              showCurrencyPrefix: true,
            })}
          </span>
          <span className="text-[11px] text-slate-400">
            {overview.supplierInvoicesCount} active supplier invoice
            {overview.supplierInvoicesCount === 1 ? "" : "s"}
          </span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <span className="text-[11px] font-medium text-slate-500 block">
            Total Paid to Suppliers
          </span>
          <span className="text-xl font-bold font-mono text-emerald-700 mt-1 block">
            {formatCurrency(overview.supplierPaidAmount, {
              showCurrencyPrefix: true,
            })}
          </span>
          <span className="text-[11px] text-slate-400">
            {activePaymentsCount} settled transaction
            {activePaymentsCount === 1 ? "" : "s"}
          </span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <span className="text-[11px] font-medium text-slate-500 block">
            Outstanding Supplier Balance
          </span>
          <span
            className={`text-xl font-bold font-mono mt-1 block ${
              overview.supplierOutstandingBalance > 0
                ? "text-amber-700"
                : "text-emerald-700"
            }`}
          >
            {formatCurrency(overview.supplierOutstandingBalance, {
              showCurrencyPrefix: true,
            })}
          </span>
          <span className="text-[11px] text-slate-400">
            Remaining payable balance across all job invoices
          </span>
        </div>
      </div>

      {/* Payments Ledger */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <CreditCard className="h-4 w-4 text-blue-600" />
              <span>Job Supplier Payment History ({allPayments.length})</span>
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Click any Invoice # to record a new partial/full payment or reverse/adjust an entry.
            </p>
          </div>
        </div>

        {allPayments.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <CreditCard className="h-10 w-10 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">
              No Supplier Payments Recorded Yet
            </p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Open any Supplier Invoice in the Supplier Invoices tab (or use Supplier Payments) to record partial or full payments.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Payment #</th>
                  <th className="px-4 py-3">Invoice #</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Method &amp; Ref</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allPayments.map((p) => {
                  const isReversed = p.status === "REVERSED";
                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-slate-50/70 ${
                        isReversed ? "bg-slate-50/60 opacity-65" : ""
                      }`}
                    >
                      <td className="px-4 py-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                        {p.paymentNumber}
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() =>
                            onOpenSupplierInvoicePayments(p.supplierInvoiceId)
                          }
                          className="text-blue-600 hover:underline inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span>{p.invoiceNumber}</span>
                          <ExternalLink className="h-3 w-3 opacity-60" />
                        </button>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {p.supplierName}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">
                        {p.paymentDate}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">
                          {p.paymentMethod}
                        </div>
                        {(p.referenceNumber || p.bankAccountName) && (
                          <div className="text-[10px] font-mono text-slate-500">
                            {[p.referenceNumber, p.bankAccountName]
                              .filter(Boolean)
                              .join(" • ")}
                          </div>
                        )}
                        {isReversed && p.reversalReason && (
                          <div className="text-[10px] text-rose-700 mt-0.5">
                            Reversed: {p.reversalReason}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold whitespace-nowrap">
                        <span
                          className={
                            isReversed
                              ? "line-through text-slate-400"
                              : "text-emerald-700"
                          }
                        >
                          {formatCurrency(p.amount, { showCurrencyPrefix: true })}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {p.attachmentStoragePath ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handlePreviewPaymentReceipt(p)}
                              disabled={loadingPaymentReceiptId === p.id}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 text-[11px] font-semibold cursor-pointer"
                            >
                              {loadingPaymentReceiptId === p.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Eye className="h-3 w-3" />
                              )}
                              <span>View</span>
                            </button>
                            <a
                              href={`/api/supplier-payments/${p.id}/receipt?action=download`}
                              className="p-1 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50"
                              title="Download payment receipt"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">No file</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
