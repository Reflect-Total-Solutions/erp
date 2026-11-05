"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  FileText,
  DollarSign,
  Clock,
  Download,
  CheckSquare,
  Square,
  Eye,
  ShieldAlert,
  Search,
  Building2,
  Briefcase,
  Plus,
  Loader2,
  TrendingUp,
  Edit,
  Ban,
} from "lucide-react";
import { useAdminData } from "@/context/admin-data-context";
import { StatusBadge } from "@/components/admin/ui/badge";
import { Pagination } from "@/components/admin/ui/pagination";
import { SearchField } from "@/components/admin/ui/search-field";
import { FilterSelect } from "@/components/admin/ui/filter-controls";
import { CreateSupplierInvoiceModal } from "@/components/admin/modals/create-supplier-invoice-modal";
import { ViewSupplierInvoiceModal } from "@/components/admin/modals/view-supplier-invoice-modal";
import { EditSupplierInvoiceModal } from "@/components/admin/modals/edit-supplier-invoice-modal";
import { SupplierInvoice } from "@/types/admin";
import { formatCurrency } from "@/lib/financial";
import { downloadInvoicesAsZip } from "@/lib/bulk-download";
import { DashboardSkeleton } from "@/components/ui/loading/dashboard-skeleton";
import { TableSkeleton } from "@/components/ui/loading/table-skeleton";
import { DownloadLoader } from "@/components/ui/loading/download-loader";

export function InvoicesView() {
  const {
    jobs,
    suppliers,
    showToast,
    refreshJobs,
    can,
    currentRole,
  } = useAdminData();

  // =========================================================================
  // SUPPLIER INVOICES STATE
  // =========================================================================
  const [supplierInvoices, setSupplierInvoices] = useState<SupplierInvoice[]>([]);
  const [supplierMetrics, setSupplierMetrics] = useState({
    totalSupplierInvoices: 0,
    totalSupplierInvoiceAmount: 0,
    totalJobCost: 0,
    totalProfit: 0,
    pendingInvoicePayments: 0,
  });
  const [loadingSupplierInvoices, setLoadingSupplierInvoices] = useState(false);
  const [selectedSupplierInvoiceIds, setSelectedSupplierInvoiceIds] = useState<string[]>([]);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierFilterVal, setSupplierFilterVal] = useState("all");
  const [jobFilterVal, setJobFilterVal] = useState("all");
  const [supplierStatusFilter, setSupplierStatusFilter] = useState("all");
  const [supplierPage, setSupplierPage] = useState(1);
  const [supplierPageSize, setSupplierPageSize] = useState(10);

  // Modals for Supplier Invoices
  const [isCreateSupplierModalOpen, setIsCreateSupplierModalOpen] = useState(false);
  const [viewingSupplierInvoice, setViewingSupplierInvoice] = useState<SupplierInvoice | null>(null);
  const [isViewSupplierModalOpen, setIsViewSupplierModalOpen] = useState(false);
  const [editingSupplierInvoice, setEditingSupplierInvoice] = useState<SupplierInvoice | null>(null);
  const [isEditSupplierModalOpen, setIsEditSupplierModalOpen] = useState(false);
  const [isZippingBulk, setIsZippingBulk] = useState(false);
  const searchParams = useSearchParams();
  const createForJob = searchParams?.get("createForJob") || null;

  useEffect(() => {
    if (createForJob) {
      setIsCreateSupplierModalOpen(true);
    }
  }, [createForJob]);

  // Download Loader progress state
  const [downloadProgress, setDownloadProgress] = useState<{
    isOpen: boolean;
    title: string;
    currentFileName: string;
    completedFiles: number;
    totalFiles: number;
    percent: number;
    statusText: string;
    isComplete: boolean;
    errorMessage?: string;
  }>({
    isOpen: false,
    title: "Downloading Invoice Attachments",
    currentFileName: "",
    completedFiles: 0,
    totalFiles: 0,
    percent: 0,
    statusText: "",
    isComplete: false,
  });

  const isAdmin = currentRole.toLowerCase() === "admin";
  const isSupervisor = currentRole.toLowerCase() === "supervisor";
  const canCreate = isAdmin || isSupervisor || can("invoices", "create");

  // =========================================================================
  // DATA FETCHING
  // =========================================================================

  const fetchSupplierInvoices = useCallback(async () => {
    setLoadingSupplierInvoices(true);
    try {
      const res = await fetch("/api/supplier-invoices");
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setSupplierInvoices(json.data);
        if (json.metrics) {
          setSupplierMetrics(json.metrics);
        }
      }
    } catch (err) {
      console.error("fetchSupplierInvoices error:", err);
    } finally {
      setLoadingSupplierInvoices(false);
    }
  }, []);

  useEffect(() => {
    fetchSupplierInvoices();
  }, [fetchSupplierInvoices]);

  // =========================================================================
  // SUPPLIER INVOICE HANDLERS
  // =========================================================================

  const handleCreateSupplierSuccess = (created: any) => {
    fetchSupplierInvoices();
    if (refreshJobs) refreshJobs();
    showToast(
      "Supplier Invoice Created",
      `Invoice ${created.invoiceNumber} recorded for ${created.supplierName}. Actual job costs have been updated.`,
      "success"
    );
  };

  const handleOpenEditSupplierInvoice = (inv: SupplierInvoice) => {
    setEditingSupplierInvoice(inv);
    setIsEditSupplierModalOpen(true);
  };

  const handleEditSupplierSuccess = (updated: any) => {
    fetchSupplierInvoices();
    if (refreshJobs) refreshJobs();
    showToast(
      "Supplier Invoice Updated",
      `Invoice ${updated.invoiceNumber || ""} has been updated. Job costs and budget metrics recalculated.`,
      "success"
    );
  };

  const handleCancelSupplierInvoice = async (invoiceId: string, reason: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/supplier-invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CANCEL", reason }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to cancel invoice.");
      }
      showToast("Invoice Cancelled", json.message || "Supplier invoice cancelled successfully.", "info");
      await fetchSupplierInvoices();
      if (viewingSupplierInvoice?.id === invoiceId) {
        setViewingSupplierInvoice((prev) =>
          prev ? { ...prev, status: "CANCELLED", cancellationReason: reason } : null
        );
      }
      if (refreshJobs) refreshJobs();
      return true;
    } catch (err: any) {
      showToast("Error", err.message || "Could not cancel invoice.", "error");
      return false;
    }
  };

  // Bulk Selection & Download for Supplier Invoices
  const handleSelectAllSupplierInvoices = () => {
    if (selectedSupplierInvoiceIds.length === paginatedSupplierInvoices.length) {
      setSelectedSupplierInvoiceIds([]);
    } else {
      setSelectedSupplierInvoiceIds(paginatedSupplierInvoices.map((i) => i.id));
    }
  };

  const handleToggleSelectSupplierInvoice = (id: string) => {
    setSelectedSupplierInvoiceIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBulkDownloadZip = async () => {
    const selected = supplierInvoices.filter((i) => selectedSupplierInvoiceIds.includes(i.id));
    if (selected.length === 0) {
      showToast("No Invoices Selected", "Please select at least one supplier invoice to download.", "info");
      return;
    }

    setDownloadProgress({
      isOpen: true,
      title: "Downloading Invoice Attachments",
      currentFileName: "Scanning invoice records...",
      completedFiles: 0,
      totalFiles: 0,
      percent: 0,
      statusText: "Packaging multi-format attachments into ZIP...",
      isComplete: false,
    });
    setIsZippingBulk(true);

    try {
      const res = await downloadInvoicesAsZip(selected, (progress) => {
        setDownloadProgress((prev) => ({
          ...prev,
          completedFiles: progress.completedFiles,
          totalFiles: progress.totalFiles,
          percent: progress.percent,
          currentFileName: progress.currentFileName,
          statusText: `Adding ${progress.currentFileName} (${progress.completedFiles + 1}/${progress.totalFiles})...`,
        }));
      });

      if (res.success) {
        setDownloadProgress((prev) => ({
          ...prev,
          percent: 100,
          isComplete: true,
          statusText: `Successfully created ZIP with ${res.totalFiles} attachment(s)!`,
        }));
        showToast(
          "Download Complete",
          `Successfully packaged and downloaded ${res.totalFiles} attachment(s) (PDF, Word, Images) as ZIP.`,
          "success"
        );
        setTimeout(() => {
          setDownloadProgress((prev) => ({ ...prev, isOpen: false }));
        }, 1500);
      } else {
        setDownloadProgress((prev) => ({
          ...prev,
          errorMessage: res.error || "Could not package ZIP archive.",
        }));
        showToast("Download Notice", res.error || "Could not package ZIP archive.", "info");
      }
    } catch (err: any) {
      setDownloadProgress((prev) => ({
        ...prev,
        errorMessage: err.message || "ZIP download failed.",
      }));
      showToast("Error", err.message || "ZIP download failed.", "error");
    } finally {
      setIsZippingBulk(false);
    }
  };

  // Open View Modal for Supplier Invoice
  const handleOpenViewSupplierInvoice = (inv: SupplierInvoice) => {
    setViewingSupplierInvoice(inv);
    setIsViewSupplierModalOpen(true);
  };

  // Only Approved Jobs for filtering (strictly excludes pending, rejected, and deleted jobs)
  const approvedJobs = useMemo(() => {
    return (jobs || []).filter(
      (j) =>
        ["APPROVED", "Approved"].includes(j.status) &&
        !j.isDeleted &&
        !j.deletedAt
    );
  }, [jobs]);

  // Filtered & Paginated Supplier Invoices
  const filteredSupplierInvoices = useMemo(() => {
    return supplierInvoices.filter((inv) => {
      const q = supplierSearch.toLowerCase();
      const matchSearch =
        !q ||
        inv.invoiceNumber.toLowerCase().includes(q) ||
        (inv.supplierName && inv.supplierName.toLowerCase().includes(q)) ||
        (inv.supplierCode && inv.supplierCode.toLowerCase().includes(q)) ||
        (inv.jobCode && inv.jobCode.toLowerCase().includes(q)) ||
        (inv.jobName && inv.jobName.toLowerCase().includes(q)) ||
        (inv.clientName && inv.clientName.toLowerCase().includes(q));

      const matchSupplier = supplierFilterVal === "all" || inv.supplierId === supplierFilterVal;
      const matchJob = jobFilterVal === "all" || inv.jobId === jobFilterVal;
      const matchStatus =
        supplierStatusFilter === "all"
          ? true
          : supplierStatusFilter === "approved"
          ? inv.status === "APPROVED" || inv.status === "PAID"
          : supplierStatusFilter === "cancelled"
          ? inv.status === "CANCELLED"
          : true;

      return matchSearch && matchSupplier && matchJob && matchStatus;
    });
  }, [supplierInvoices, supplierSearch, supplierFilterVal, jobFilterVal, supplierStatusFilter]);

  const totalSupplierPages = Math.max(1, Math.ceil(filteredSupplierInvoices.length / supplierPageSize));
  const paginatedSupplierInvoices = useMemo(() => {
    const start = (supplierPage - 1) * supplierPageSize;
    return filteredSupplierInvoices.slice(start, start + supplierPageSize);
  }, [filteredSupplierInvoices, supplierPage, supplierPageSize]);

  if (!can("invoices", "view")) {
    return (
      <div className="flex flex-col items-center justify-center p-10 bg-white rounded-2xl border border-slate-200 text-center max-w-lg mx-auto mt-8 shadow-xs">
        <div className="h-14 w-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-500 mt-2">
          You do not have authorization to view or manage Invoices. Contact your system administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5" suppressHydrationWarning>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Supplier Invoices & Expense Control</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Record supplier bills with multi-item PDF vouchers, track real-time job expenses, and monitor budget utilization.
          </p>
        </div>

        {/* Primary Action Button */}
        <div className="flex items-center gap-2">
          {canCreate && (
            <button
              type="button"
              onClick={() => setIsCreateSupplierModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>+ Create Invoice</span>
            </button>
          )}

          <Link
            href="/admin/profit-loss"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors shadow-2xs"
          >
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            <span>Profit & Loss Summary</span>
          </Link>
        </div>
      </div>

      {/* Metric Cards */}
      {loadingSupplierInvoices && supplierInvoices.length === 0 ? (
        <DashboardSkeleton cardCount={5} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Total Supplier Invoices */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Total Supplier Invoices</p>
              <p className="text-2xl font-bold text-slate-900 mt-1 font-mono">
                {supplierMetrics.totalSupplierInvoices}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Recorded vendor bills</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <FileText className="h-5 w-5" />
            </div>
          </div>

          {/* Total Supplier Invoice Amount */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Total Supplier Expense</p>
              <p className="text-xl font-bold text-amber-600 mt-1 font-mono">
                {formatCurrency(supplierMetrics.totalSupplierInvoiceAmount, { showCurrencyPrefix: true })}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Actual incurred costs</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>

          {/* Total Approved Job Cost */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Total Approved Job Value</p>
              <p className="text-xl font-bold text-slate-800 mt-1 font-mono">
                {formatCurrency(supplierMetrics.totalJobCost, { showCurrencyPrefix: true })}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Approved budget ceiling</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600">
              <Briefcase className="h-5 w-5" />
            </div>
          </div>

          {/* Total Recorded Profit */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Recorded Gross Profit</p>
              <p
                className={`text-xl font-bold mt-1 font-mono ${
                  supplierMetrics.totalProfit >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {formatCurrency(supplierMetrics.totalProfit, { showCurrencyPrefix: true })}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Budget minus actual bills</p>
            </div>
            <div
              className={`h-10 w-10 rounded-xl border flex items-center justify-center ${
                supplierMetrics.totalProfit >= 0
                  ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                  : "bg-rose-50 border-rose-200 text-rose-600"
              }`}
            >
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>

          {/* Pending Invoice Payments */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between sm:col-span-2 lg:col-span-1">
            <div>
              <p className="text-xs font-medium text-slate-500">Pending Payments</p>
              <p className="text-2xl font-bold text-indigo-600 mt-1 font-mono">
                {supplierMetrics.pendingInvoicePayments}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Approved & active bills</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
              <Clock className="h-5 w-5" />
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="space-y-4">
        {/* Sub Toolbar: Filters, Search & Bulk Actions */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* Dropdown Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <FilterSelect
                label="All Suppliers"
                value={supplierFilterVal}
                onChange={setSupplierFilterVal}
                options={[
                  { label: "All Suppliers", value: "all" },
                  ...suppliers.map((s) => ({ label: `${s.name} (${s.code})`, value: s.id })),
                ]}
              />

              <FilterSelect
                label="Approved Jobs"
                value={jobFilterVal}
                onChange={setJobFilterVal}
                options={[
                  { label: "All Approved Jobs", value: "all" },
                  ...approvedJobs.map((j) => ({ label: `${j.jobCode || "JOB"} - ${j.name}`, value: j.id })),
                ]}
              />

              <FilterSelect
                label="Status"
                value={supplierStatusFilter}
                onChange={setSupplierStatusFilter}
                options={[
                  { label: "All Statuses", value: "all" },
                  { label: "Approved / Active", value: "approved" },
                  { label: "Cancelled", value: "cancelled" },
                ]}
              />
            </div>

            {/* Right: Search Field & Bulk Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-full sm:w-64">
                <SearchField
                  value={supplierSearch}
                  isLoading={loadingSupplierInvoices}
                  onChange={(val) => {
                    setSupplierSearch(val);
                    setSupplierPage(1);
                  }}
                  placeholder="Search invoice #, supplier, job..."
                />
              </div>

              {selectedSupplierInvoiceIds.length > 0 && (
                <button
                  type="button"
                  onClick={handleBulkDownloadZip}
                  disabled={isZippingBulk}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors shrink-0 disabled:opacity-50"
                  title="Download all attachments (PDF, Word, Images) from selected supplier invoices as a ZIP"
                >
                  {isZippingBulk ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  <span>Download ZIP ({selectedSupplierInvoiceIds.length})</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Supplier Invoices Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          {loadingSupplierInvoices && supplierInvoices.length === 0 ? (
            <TableSkeleton rows={6} columns={10} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-3 w-10 text-center">
                    <button
                      type="button"
                      onClick={handleSelectAllSupplierInvoices}
                      className="text-slate-400 hover:text-blue-600"
                      title="Select / Deselect all on this page"
                    >
                      {selectedSupplierInvoiceIds.length === paginatedSupplierInvoices.length &&
                      paginatedSupplierInvoices.length > 0 ? (
                        <CheckSquare className="h-4 w-4 text-blue-600" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-3.5">Invoice #</th>
                  <th className="py-3 px-3.5">Supplier Name</th>
                  <th className="py-3 px-3.5">Linked Job</th>
                  <th className="py-3 px-3.5">Invoice Date</th>
                  <th className="py-3 px-3.5 text-center">Attachments</th>
                  <th className="py-3 px-3.5 text-right">Invoice Amount (Rs.)</th>
                  <th className="py-3 px-3.5">Recorded By</th>
                  <th className="py-3 px-3.5 text-center">Status</th>
                  <th className="py-3 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingSupplierInvoices ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-400">
                      <Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto mb-2" />
                      <p className="text-xs font-semibold">Loading supplier invoices...</p>
                    </td>
                  </tr>
                ) : paginatedSupplierInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-400">
                      <FileText className="h-10 w-10 text-slate-300 stroke-[1.5] mx-auto mb-2" />
                      <p className="text-sm font-semibold text-slate-600">No Supplier Invoices Recorded</p>
                      <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                        Click &quot;+ Create Invoice&quot; to log actual supplier bills and PDF quotation attachments against approved jobs.
                      </p>
                      {canCreate && (
                        <button
                          type="button"
                          onClick={() => setIsCreateSupplierModalOpen(true)}
                          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 shadow-xs"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Record First Invoice</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  paginatedSupplierInvoices.map((inv) => {
                    const isSelected = selectedSupplierInvoiceIds.includes(inv.id);
                    const isCancelled = inv.status === "CANCELLED";
                    const totalAttCount =
                      (inv.attachments?.length || 0) +
                      (inv.items || []).reduce((sum, item) => sum + (item.attachments?.length || 0), 0);

                    return (
                      <tr
                        key={inv.id}
                        className={`hover:bg-slate-50/70 transition-colors ${
                          isSelected ? "bg-blue-50/40" : ""
                        } ${isCancelled ? "bg-slate-50/50 opacity-60" : ""}`}
                      >
                        <td className="py-3.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectSupplierInvoice(inv.id)}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                        <td className="py-3.5 px-3.5 font-mono font-bold text-slate-900">
                          <button
                            type="button"
                            onClick={() => handleOpenViewSupplierInvoice(inv)}
                            className="text-blue-600 hover:text-blue-800 hover:underline text-left cursor-pointer"
                          >
                            {inv.invoiceNumber}
                          </button>
                        </td>
                        <td className="py-3.5 px-3.5">
                          <div className="font-semibold text-slate-900">{inv.supplierName || "—"}</div>
                          {inv.supplierCode && (
                            <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1 py-0.2 rounded">
                              {inv.supplierCode}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-3.5">
                          {inv.jobCode ? (
                            <Link
                              href={`/admin/jobs/${inv.jobId}`}
                              className="font-medium text-slate-800 hover:text-blue-600 block hover:underline"
                            >
                              <span className="font-mono text-blue-600 font-semibold mr-1">{inv.jobCode}</span>
                              <span className="text-slate-600">{inv.jobName}</span>
                            </Link>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                          {inv.clientName && (
                            <span className="text-[11px] text-slate-400 block mt-0.5">
                              Client: {inv.clientName}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-3.5 text-slate-600 font-mono whitespace-nowrap">
                          {inv.invoiceDate}
                        </td>
                        <td className="py-3.5 px-3.5 text-center">
                          {totalAttCount > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-semibold">
                              <FileText className="h-3 w-3" />
                              <span>{totalAttCount} File{totalAttCount !== 1 ? "s" : ""}</span>
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">None</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3.5 text-right font-mono font-bold text-slate-900">
                          <span className={isCancelled ? "line-through text-slate-400" : ""}>
                            {formatCurrency(inv.totalAmount, { showCurrencyPrefix: true })}
                          </span>
                        </td>
                        <td className="py-3.5 px-3.5 text-slate-600">
                          <span className="block font-medium text-slate-800">{inv.createdByName || "Admin"}</span>
                          <span className="block text-[10px] text-slate-400 font-mono">{inv.createdAt}</span>
                        </td>
                        <td className="py-3.5 px-3.5 text-center whitespace-nowrap">
                          <StatusBadge status={inv.status} />
                        </td>
                        <td className="py-3.5 px-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenViewSupplierInvoice(inv)}
                              className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-slate-100 transition-colors"
                              title="View Invoice & Audit Trail"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            {!isCancelled && (
                              <button
                                type="button"
                                onClick={() => handleOpenEditSupplierInvoice(inv)}
                                className="p-1 rounded text-slate-400 hover:text-amber-600 hover:bg-slate-100 transition-colors"
                                title="Edit Invoice & Recalculate Finances"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => downloadInvoicesAsZip([inv])}
                              className="p-1 rounded text-slate-400 hover:text-emerald-600 hover:bg-slate-100 transition-colors"
                              title="Download Attachments (.zip)"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                            {isAdmin && !isCancelled && (
                              <button
                                type="button"
                                onClick={() => {
                                  setViewingSupplierInvoice(inv);
                                  setIsViewSupplierModalOpen(true);
                                }}
                                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-slate-100 transition-colors"
                                title="Cancel / Void Invoice"
                              >
                                <Ban className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="p-3 border-t border-slate-200 bg-slate-50/50">
            <Pagination
              currentPage={supplierPage}
              totalPages={totalSupplierPages}
              pageSize={supplierPageSize}
              totalItems={filteredSupplierInvoices.length}
              onPageChange={setSupplierPage}
              onPageSizeChange={(size) => {
                setSupplierPageSize(size);
                setSupplierPage(1);
              }}
            />
          </div>
        </>
        )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: CREATE SUPPLIER INVOICE (DYNAMIC ROWS + MULTI-PDF ATTACHMENTS)     */}
      {/* ========================================================================= */}
      <CreateSupplierInvoiceModal
        isOpen={isCreateSupplierModalOpen}
        onClose={() => setIsCreateSupplierModalOpen(false)}
        onSuccess={handleCreateSupplierSuccess}
        preselectedJobId={createForJob || undefined}
      />

      {/* ========================================================================= */}
      {/* MODAL: VIEW SUPPLIER INVOICE DETAILS & AUDIT LOG                          */}
      {/* ========================================================================= */}
      <ViewSupplierInvoiceModal
        isOpen={isViewSupplierModalOpen}
        onClose={() => {
          setIsViewSupplierModalOpen(false);
          setViewingSupplierInvoice(null);
        }}
        invoice={viewingSupplierInvoice}
        onCancelInvoice={handleCancelSupplierInvoice}
        onEditInvoice={handleOpenEditSupplierInvoice}
        isAdmin={isAdmin}
      />

      {/* ========================================================================= */}
      {/* MODAL: EDIT SUPPLIER INVOICE (DYNAMIC ROWS + MULTI-FORMAT ATTACHMENTS)    */}
      {/* ========================================================================= */}
      <EditSupplierInvoiceModal
        isOpen={isEditSupplierModalOpen}
        onClose={() => {
          setIsEditSupplierModalOpen(false);
          setEditingSupplierInvoice(null);
        }}
        invoice={editingSupplierInvoice}
        onSuccess={handleEditSupplierSuccess}
        isAdmin={isAdmin}
      />

      {/* ========================================================================= */}
      {/* MODAL: BULK DOWNLOAD PACKAGING PROGRESS LOADER                            */}
      {/* ========================================================================= */}
      <DownloadLoader
        isOpen={downloadProgress.isOpen}
        title={downloadProgress.title}
        currentFileName={downloadProgress.currentFileName}
        completedFiles={downloadProgress.completedFiles}
        totalFiles={downloadProgress.totalFiles}
        percent={downloadProgress.percent}
        statusText={downloadProgress.statusText}
        isComplete={downloadProgress.isComplete}
        errorMessage={downloadProgress.errorMessage}
        onClose={() => setDownloadProgress((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
