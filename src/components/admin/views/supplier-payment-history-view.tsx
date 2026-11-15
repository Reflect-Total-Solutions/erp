"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  CreditCard,
  Download,
  Edit,
  Eye,
  Loader2,
  Receipt,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { useAdminData } from "@/context/admin-data-context";
import { StatusBadge } from "@/components/admin/ui/badge";
import { Pagination } from "@/components/admin/ui/pagination";
import { SearchField } from "@/components/admin/ui/search-field";
import { FilterSelect } from "@/components/admin/ui/filter-controls";
import { TableSkeleton } from "@/components/ui/loading/table-skeleton";
import { ViewSupplierInvoiceModal } from "@/components/admin/modals/view-supplier-invoice-modal";
import { ReverseSupplierPaymentModal } from "@/components/admin/modals/reverse-supplier-payment-modal";
import {
  AttachmentPreviewModal,
  PreviewableAttachment,
} from "@/components/admin/modals/attachment-preview-modal";
import { SupplierPayment } from "@/types/admin";
import { formatCurrency } from "@/lib/financial";
import { getFileCategory } from "@/lib/file-validation";
import { SUPPLIER_PAYMENT_METHODS } from "@/lib/supplier-payment-date";

interface HistorySummary {
  totalTransactions: number;
  successCount: number;
  totalSuccessAmount: number;
  reversedCount: number;
  totalReversedAmount: number;
}

const DEFAULT_SUMMARY: HistorySummary = {
  totalTransactions: 0,
  successCount: 0,
  totalSuccessAmount: 0,
  reversedCount: 0,
  totalReversedAmount: 0,
};

export function SupplierPaymentHistoryView() {
  const { suppliers, refreshSuppliers, showToast, can, currentRole } = useAdminData();

  const canView = can("supplierPayments", "viewHistory") || can("supplierPayments", "view");
  const canEditPayment = can("supplierPayments", "edit");
  const canReversePayment = can("supplierPayments", "reverse");

  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [summary, setSummary] = useState<HistorySummary>(DEFAULT_SUMMARY);
  const [refreshTick, setRefreshTick] = useState(0);
  const [loadedKey, setLoadedKey] = useState("");

  const [search, setSearch] = useState("");
  const [supplierId, setSupplierId] = useState("all");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [viewingInvoiceId, setViewingInvoiceId] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<{
    mode: "REVERSE" | "EDIT";
    payment: SupplierPayment;
  } | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<PreviewableAttachment | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const queryKey = `${search.trim()}|${supplierId}|${statusFilter}|${paymentMethod}|${dateFrom}|${dateTo}|${page}|${pageSize}|${refreshTick}`;
  const isLoading = canView && loadedKey !== queryKey;

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    const qs = new URLSearchParams();
    if (search.trim()) qs.set("search", search.trim());
    if (supplierId !== "all") qs.set("supplierId", supplierId);
    if (statusFilter !== "ALL") qs.set("status", statusFilter);
    if (paymentMethod !== "all") qs.set("paymentMethod", paymentMethod);
    if (dateFrom) qs.set("dateFrom", dateFrom);
    if (dateTo) qs.set("dateTo", dateTo);
    qs.set("page", String(page));
    qs.set("limit", String(pageSize));

    fetch(`/api/supplier-payments/history?${qs.toString()}`)
      .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        if (cancelled) return;
        if (!ok || !json.success) {
          throw new Error(json?.error || "Failed to load payment history.");
        }
        setPayments(json.data || []);
        setSummary(json.summary || DEFAULT_SUMMARY);
        setTotalItems(json.pagination?.totalItems ?? (json.data || []).length);
        setTotalPages(Math.max(1, json.pagination?.totalPages ?? 1));
      })
      .catch((err: any) => {
        if (cancelled) return;
        showToast("Error", err?.message || "Failed to load payment history.", "error");
      })
      .finally(() => {
        if (!cancelled) {
          setLoadedKey(queryKey);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    canView,
    queryKey,
    search,
    supplierId,
    statusFilter,
    paymentMethod,
    dateFrom,
    dateTo,
    page,
    pageSize,
    showToast,
  ]);

  const handleMutated = useCallback(
    (result?: any) => {
      setRefreshTick((t) => t + 1);
      if (refreshSuppliers) void refreshSuppliers();
      if (result?.message) {
        showToast("Payment Ledger Updated", result.message, "success");
      }
    },
    [refreshSuppliers, showToast]
  );

  const handlePreviewReceipt = async (p: SupplierPayment) => {
    const fileName = p.attachmentOriginalName || p.attachmentName || `${p.paymentNumber}-receipt`;
    const category = getFileCategory(fileName, p.attachmentMimeType || undefined);
    try {
      const res = await fetch(`/api/supplier-payments/${p.id}/receipt?action=signed-url`);
      const json = await res.json();
      const url =
        res.ok && json.success && json.signedUrl
          ? json.signedUrl
          : `/api/supplier-payments/${p.id}/receipt?action=preview`;
      setPreviewAttachment({
        name: fileName,
        url,
        category,
        size: p.attachmentSize || undefined,
        description: `Payment ${p.paymentNumber}`,
      });
      setIsPreviewOpen(true);
    } catch {
      setPreviewAttachment({
        name: fileName,
        url: `/api/supplier-payments/${p.id}/receipt?action=preview`,
        category,
        size: p.attachmentSize || undefined,
        description: `Payment ${p.paymentNumber}`,
      });
      setIsPreviewOpen(true);
    }
  };

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center p-10 bg-white rounded-2xl border border-slate-200 text-center max-w-lg mx-auto mt-8 shadow-xs">
        <div className="h-14 w-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-500 mt-2">
          You do not have permission to view Supplier Payment History.
        </p>
        <div className="mt-4 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
          Active Role: <span className="font-bold text-blue-600 capitalize">{currentRole}</span>
        </div>
      </div>
    );
  }

  const activeSuppliers = suppliers.filter((s) => !s.isDeleted);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Supplier Payment History</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Complete financial ledger of partial payments, full settlements, bank receipts, and audited reversals.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRefreshTick((t) => t + 1)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin text-blue-600" : ""}`} />
            <span>Refresh</span>
          </button>
          <Link
            href="/admin/supplier-payments/outstanding"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1d4ed8] px-3.5 py-2 text-xs font-semibold text-white shadow-xs"
          >
            <CreditCard className="h-3.5 w-3.5" />
            <span>Pay Outstanding Invoices</span>
          </Link>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Total Transactions</p>
            <p className="text-xl font-bold text-slate-900 mt-1 font-mono">
              {summary.totalTransactions}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Across filtered period</p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
            <Receipt className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">
              Completed Payments ({summary.successCount})
            </p>
            <p className="text-xl font-bold text-emerald-700 mt-1 font-mono">
              {formatCurrency(summary.totalSuccessAmount, { showCurrencyPrefix: true })}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Active cash/bank disbursements</p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">
              Reversed Entries ({summary.reversedCount})
            </p>
            <p className="text-xl font-bold text-rose-700 mt-1 font-mono">
              {formatCurrency(summary.totalReversedAmount, { showCurrencyPrefix: true })}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Audited &amp; voided payments</p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
            <RotateCcw className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <FilterSelect
            label="Supplier"
            value={supplierId}
            onChange={(val) => {
              setSupplierId(val);
              setPage(1);
            }}
            options={[
              { label: "All Suppliers", value: "all" },
              ...activeSuppliers.map((s) => ({ label: `${s.name} (${s.code})`, value: s.id })),
            ]}
          />

          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={(val) => {
              setStatusFilter(val);
              setPage(1);
            }}
            options={[
              { label: "All Statuses", value: "ALL" },
              { label: "Completed (SUCCESS)", value: "SUCCESS" },
              { label: "Reversed", value: "REVERSED" },
            ]}
          />

          <FilterSelect
            label="Method"
            value={paymentMethod}
            onChange={(val) => {
              setPaymentMethod(val);
              setPage(1);
            }}
            options={[
              { label: "All Methods", value: "all" },
              ...SUPPLIER_PAYMENT_METHODS.map((m) => ({ label: m, value: m })),
            ]}
          />

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
            title="Payment Date From"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
            title="Payment Date To"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="w-full sm:w-64">
            <SearchField
              value={search}
              isLoading={isLoading}
              onChange={(val) => {
                setSearch(val);
                setPage(1);
              }}
              placeholder="Search payment #, ref, invoice..."
            />
          </div>

          {(search ||
            supplierId !== "all" ||
            statusFilter !== "ALL" ||
            paymentMethod !== "all" ||
            dateFrom ||
            dateTo) && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setSupplierId("all");
                setStatusFilter("ALL");
                setPaymentMethod("all");
                setDateFrom("");
                setDateTo("");
                setPage(1);
              }}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        {isLoading && payments.length === 0 ? (
          <TableSkeleton rows={6} columns={10} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-3.5">Payment #</th>
                    <th className="py-3 px-3.5">Payment Date</th>
                    <th className="py-3 px-3.5">Invoice #</th>
                    <th className="py-3 px-3.5">Supplier</th>
                    <th className="py-3 px-3.5">Job #</th>
                    <th className="py-3 px-3.5">Method &amp; Account</th>
                    <th className="py-3 px-3.5">Reference / Notes</th>
                    <th className="py-3 px-3.5 text-right">Amount</th>
                    <th className="py-3 px-3.5 text-center">Status</th>
                    <th className="py-3 px-3.5">Receipt</th>
                    <th className="py-3 px-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-slate-400">
                        <Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto mb-2" />
                        <p className="text-xs font-semibold">Loading transaction ledger...</p>
                      </td>
                    </tr>
                  ) : payments.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-slate-400">
                        <Receipt className="h-10 w-10 text-slate-300 stroke-[1.5] mx-auto mb-2" />
                        <p className="text-sm font-semibold text-slate-600">
                          No Supplier Payment Transactions Found
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          Record a payment from All Supplier Payments or adjust your filters.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    payments.map((p) => {
                      const isReversed = p.status === "REVERSED";
                      return (
                        <tr
                          key={p.id}
                          className={
                            isReversed ? "bg-rose-50/30 opacity-80" : "hover:bg-slate-50/70"
                          }
                        >
                          <td className="py-3 px-3.5 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {p.paymentNumber}
                          </td>
                          <td className="py-3 px-3.5 font-mono text-slate-700 whitespace-nowrap">
                            {p.paymentDate}
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setViewingInvoiceId(p.supplierInvoiceId)}
                              className="font-mono font-bold text-blue-600 hover:underline cursor-pointer"
                            >
                              {p.invoiceNumber || "—"}
                            </button>
                          </td>
                          <td className="py-3 px-3.5">
                            <span className="font-semibold text-slate-900 block">
                              {p.supplierName || "—"}
                            </span>
                            {p.supplierCode && (
                              <span className="font-mono text-[10px] text-slate-400">
                                {p.supplierCode}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3.5 font-mono text-slate-700 whitespace-nowrap">
                            {p.jobCode ? (
                              <Link
                                href={`/admin/jobs/${p.jobId}`}
                                className="text-blue-700 hover:underline font-semibold"
                              >
                                {p.jobCode}
                              </Link>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-3 px-3.5">
                            <span className="font-semibold text-slate-800 block">
                              {p.paymentMethod}
                            </span>
                            {p.bankAccountName && (
                              <span className="text-[10px] text-slate-500">
                                {p.bankAccountName}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3.5 max-w-[200px]">
                            {p.referenceNumber ? (
                              <span className="font-mono text-slate-800 block truncate">
                                {p.referenceNumber}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                            {p.notes && (
                              <span className="text-[10px] text-slate-500 block truncate">
                                {p.notes}
                              </span>
                            )}
                            {isReversed && p.reversalReason && (
                              <span className="text-[10px] text-rose-700 font-medium block">
                                Reason: {p.reversalReason}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                            <span className={isReversed ? "line-through text-rose-600" : ""}>
                              {formatCurrency(p.amount, { showCurrencyPrefix: true })}
                            </span>
                          </td>
                          <td className="py-3 px-3.5 text-center whitespace-nowrap">
                            <StatusBadge status={p.status} />
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            {p.attachmentName || p.attachmentStoragePath ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handlePreviewReceipt(p)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 text-[10px] font-semibold cursor-pointer"
                                >
                                  <Receipt className="h-3 w-3" />
                                  <span>View</span>
                                </button>
                                <a
                                  href={`/api/supplier-payments/${p.id}/receipt?action=download`}
                                  className="p-1 text-slate-500 hover:text-emerald-600"
                                  title="Download receipt"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </a>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400">None</span>
                            )}
                          </td>
                          <td className="py-3 px-3.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setViewingInvoiceId(p.supplierInvoiceId)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
                                title="View Invoice & Payment Audit Trail"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              {!isReversed && canEditPayment && (
                                <button
                                  type="button"
                                  onClick={() => setActionModal({ mode: "EDIT", payment: p })}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 cursor-pointer"
                                  title="Edit Payment Entry"
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {!isReversed && canReversePayment && (
                                <button
                                  type="button"
                                  onClick={() => setActionModal({ mode: "REVERSE", payment: p })}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                  title="Reverse Payment"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
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

            <div className="p-3 border-t border-slate-200 bg-slate-50/50">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                pageSize={pageSize}
                totalItems={totalItems}
                onPageChange={setPage}
                onPageSizeChange={(sz) => {
                  setPageSize(sz);
                  setPage(1);
                }}
              />
            </div>
          </>
        )}
      </div>

      <ViewSupplierInvoiceModal
        isOpen={Boolean(viewingInvoiceId)}
        onClose={() => setViewingInvoiceId(null)}
        invoiceId={viewingInvoiceId}
        initialTab="payments"
        onPaymentUpdated={() => handleMutated()}
      />

      <ReverseSupplierPaymentModal
        isOpen={Boolean(actionModal)}
        onClose={() => setActionModal(null)}
        mode={actionModal?.mode || "REVERSE"}
        payment={actionModal?.payment || null}
        onSuccess={handleMutated}
      />

      <AttachmentPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        attachment={previewAttachment}
      />
    </div>
  );
}
