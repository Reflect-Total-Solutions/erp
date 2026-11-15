"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Eye,
  Filter,
  Loader2,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldAlert,
} from "lucide-react";
import { useAdminData } from "@/context/admin-data-context";
import { StatusBadge } from "@/components/admin/ui/badge";
import { Pagination } from "@/components/admin/ui/pagination";
import { SearchField } from "@/components/admin/ui/search-field";
import { FilterSelect } from "@/components/admin/ui/filter-controls";
import { TableSkeleton } from "@/components/ui/loading/table-skeleton";
import { ViewSupplierInvoiceModal } from "@/components/admin/modals/view-supplier-invoice-modal";
import { MakeSupplierPaymentModal } from "@/components/admin/modals/make-supplier-payment-modal";
import { SupplierDetailsModal } from "@/components/admin/modals/supplier-details-modal";
import { SupplierPaymentSettingsModal } from "@/components/admin/modals/supplier-payment-settings-modal";
import { SupplierInvoice } from "@/types/admin";
import { formatCurrency } from "@/lib/financial";

interface SupplierPaymentsListViewProps {
  outstandingOnly?: boolean;
}

interface ListSummary {
  totalInvoices: number;
  totalPayableAmount: number;
  totalPaidAmount: number;
  totalOutstandingAmount: number;
  overdueCount: number;
  overdueAmount: number;
  unpaidCount: number;
  partiallyPaidCount: number;
  paidCount: number;
  dueSoonCount: number;
}

const DEFAULT_SUMMARY: ListSummary = {
  totalInvoices: 0,
  totalPayableAmount: 0,
  totalPaidAmount: 0,
  totalOutstandingAmount: 0,
  overdueCount: 0,
  overdueAmount: 0,
  unpaidCount: 0,
  partiallyPaidCount: 0,
  paidCount: 0,
  dueSoonCount: 0,
};

export function SupplierPaymentsListView({
  outstandingOnly = false,
}: SupplierPaymentsListViewProps) {
  const { suppliers, refreshSuppliers, showToast, can, currentRole } = useAdminData();
  const searchParams = useSearchParams();

  const canView =
    can("supplierPayments", "view") ||
    (outstandingOnly && can("supplierPayments", "viewOutstanding"));
  const canCreatePayment = can("supplierPayments", "create");
  const canManageSettings =
    can("supplierPayments", "manageSettings") || can("supplierPayments", "manageNotifications");

  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [summary, setSummary] = useState<ListSummary>(DEFAULT_SUMMARY);
  const [timezoneLabel, setTimezoneLabel] = useState("Asia/Colombo");
  const [refreshTick, setRefreshTick] = useState(0);
  const [loadedKey, setLoadedKey] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [supplierId, setSupplierId] = useState(() => searchParams?.get("supplierId") || "all");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [jobNumber, setJobNumber] = useState("");
  const [invoiceDateFrom, setInvoiceDateFrom] = useState("");
  const [invoiceDateTo, setInvoiceDateTo] = useState("");
  const [dueDateFrom, setDueDateFrom] = useState("");
  const [dueDateTo, setDueDateTo] = useState("");
  const [paymentStatus, setPaymentStatus] = useState(
    () => searchParams?.get("paymentStatus") || "ALL"
  );
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Modals
  const [viewingInvoice, setViewingInvoice] = useState<SupplierInvoice | null>(null);
  const [deepLinkInvoiceId, setDeepLinkInvoiceId] = useState<string | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [payingInvoice, setPayingInvoice] = useState<SupplierInvoice | null>(null);
  const [viewingSupplierId, setViewingSupplierId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const viewInvoiceParam = searchParams?.get("viewInvoiceId") || null;
  const paramStatus = searchParams?.get("paymentStatus") || null;
  const paramSupplier = searchParams?.get("supplierId") || null;

  useEffect(() => {
    if (!viewInvoiceParam && !paramStatus && !paramSupplier) return;
    const timer = setTimeout(() => {
      if (viewInvoiceParam) {
        setViewingInvoice(null);
        setDeepLinkInvoiceId(viewInvoiceParam);
        setIsViewModalOpen(true);
      }
      if (paramStatus) {
        setPaymentStatus(paramStatus);
        setPage(1);
      }
      if (paramSupplier) {
        setSupplierId(paramSupplier);
        setPage(1);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [viewInvoiceParam, paramStatus, paramSupplier]);

  const queryKey = `${search.trim()}|${supplierId}|${invoiceNumber.trim()}|${jobNumber.trim()}|${invoiceDateFrom}|${invoiceDateTo}|${dueDateFrom}|${dueDateTo}|${paymentStatus}|${outstandingOnly ? "1" : "0"}|${page}|${pageSize}|${refreshTick}`;
  const isLoading = canView && loadedKey !== queryKey;

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    const qs = new URLSearchParams();
    if (search.trim()) qs.set("search", search.trim());
    if (supplierId && supplierId !== "all") qs.set("supplierId", supplierId);
    if (invoiceNumber.trim()) qs.set("invoiceNumber", invoiceNumber.trim());
    if (jobNumber.trim()) qs.set("jobNumber", jobNumber.trim());
    if (invoiceDateFrom) qs.set("invoiceDateFrom", invoiceDateFrom);
    if (invoiceDateTo) qs.set("invoiceDateTo", invoiceDateTo);
    if (dueDateFrom) qs.set("dueDateFrom", dueDateFrom);
    if (dueDateTo) qs.set("dueDateTo", dueDateTo);
    if (paymentStatus && paymentStatus !== "ALL") qs.set("paymentStatus", paymentStatus);
    if (outstandingOnly) qs.set("outstandingOnly", "true");
    qs.set("page", String(page));
    qs.set("limit", String(pageSize));

    fetch(`/api/supplier-payments?${qs.toString()}`)
      .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        if (cancelled) return;
        if (!ok || !json.success) {
          throw new Error(json?.error || "Failed to load supplier invoices for payments.");
        }
        setInvoices(json.data || []);
        setSummary(json.summary || DEFAULT_SUMMARY);
        setTotalItems(json.pagination?.totalItems ?? (json.data || []).length);
        setTotalPages(Math.max(1, json.pagination?.totalPages ?? 1));
        if (json.meta?.timezone) setTimezoneLabel(json.meta.timezone);
      })
      .catch((err: any) => {
        if (cancelled) return;
        showToast("Error", err?.message || "Failed to fetch supplier payments.", "error");
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
    invoiceNumber,
    jobNumber,
    invoiceDateFrom,
    invoiceDateTo,
    dueDateFrom,
    dueDateTo,
    paymentStatus,
    outstandingOnly,
    page,
    pageSize,
    showToast,
  ]);

  const handlePaymentMutated = useCallback(
    (result?: any) => {
      setRefreshTick((t) => t + 1);
      if (refreshSuppliers) void refreshSuppliers();
      if (result?.data?.paymentNumber) {
        showToast(
          result.duplicate ? "Already Recorded" : "Payment Recorded",
          result.message || `Payment ${result.data.paymentNumber} processed successfully.`,
          "success"
        );
      }
    },
    [refreshSuppliers, showToast]
  );

  const handleClearFilters = () => {
    setSearch("");
    setSupplierId("all");
    setInvoiceNumber("");
    setJobNumber("");
    setInvoiceDateFrom("");
    setInvoiceDateTo("");
    setDueDateFrom("");
    setDueDateTo("");
    setPaymentStatus("ALL");
    setPage(1);
  };

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center p-10 bg-white rounded-2xl border border-slate-200 text-center max-w-lg mx-auto mt-8 shadow-xs">
        <div className="h-14 w-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
          You do not have authorization to access Supplier Payment Management.
        </p>
        <div className="mt-4 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
          Active Role: <span className="font-bold text-blue-600 capitalize">{currentRole}</span>
        </div>
        <Link
          href="/admin"
          className="mt-6 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2563EB] text-xs font-semibold text-white hover:bg-[#1d4ed8]"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const activeSuppliers = suppliers.filter((s) => !s.isDeleted);
  const statusPills = outstandingOnly
    ? [
        { label: "All Outstanding", value: "ALL" },
        { label: `Overdue (${summary.overdueCount})`, value: "OVERDUE" },
        { label: `Unpaid (${summary.unpaidCount})`, value: "UNPAID" },
        { label: `Partially Paid (${summary.partiallyPaidCount})`, value: "PARTIALLY_PAID" },
      ]
    : [
        { label: "All Statuses", value: "ALL" },
        { label: `Overdue (${summary.overdueCount})`, value: "OVERDUE" },
        { label: `Unpaid (${summary.unpaidCount})`, value: "UNPAID" },
        { label: `Partially Paid (${summary.partiallyPaidCount})`, value: "PARTIALLY_PAID" },
        { label: `Paid (${summary.paidCount})`, value: "PAID" },
      ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            {outstandingOnly ? "Outstanding Supplier Invoices" : "All Supplier Payments"}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {outstandingOnly
              ? "Active supplier payables awaiting partial or full settlement, ordered by upcoming & overdue due dates."
              : "Automatically loaded eligible Supplier Invoices with real-time settlement status, due countdowns, and partial payment tracking."}
            <span className="ml-2 font-mono text-[10px] text-slate-400">TZ: {timezoneLabel}</span>
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={() => setRefreshTick((t) => t + 1)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin text-blue-600" : ""}`} />
            <span>Refresh</span>
          </button>

          {can("supplierPayments", "viewHistory") || can("supplierPayments", "view") ? (
            <Link
              href="/admin/supplier-payments/history"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Clock className="h-3.5 w-3.5 text-slate-500" />
              <span>Payment History</span>
            </Link>
          ) : null}

          {canManageSettings && (
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <Settings className="h-3.5 w-3.5 text-slate-500" />
              <span>Reminder Settings</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Total Payable Billed</p>
            <p className="text-lg font-bold text-slate-900 mt-1 font-mono">
              {formatCurrency(summary.totalPayableAmount, { showCurrencyPrefix: true })}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {summary.totalInvoices} non-cancelled invoice{summary.totalInvoices === 1 ? "" : "s"}
            </p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
            <DollarSign className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Total Paid / Settled</p>
            <p className="text-lg font-bold text-emerald-700 mt-1 font-mono">
              {formatCurrency(summary.totalPaidAmount, { showCurrencyPrefix: true })}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {summary.paidCount} paid • {summary.partiallyPaidCount} partial
            </p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Outstanding Balance</p>
            <p className="text-lg font-bold text-blue-800 mt-1 font-mono">
              {formatCurrency(summary.totalOutstandingAmount, { showCurrencyPrefix: true })}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {summary.dueSoonCount} due within 7 days
            </p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
            <CreditCard className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Overdue Payables</p>
            <p className="text-lg font-bold text-rose-700 mt-1 font-mono">
              {formatCurrency(summary.overdueAmount, { showCurrencyPrefix: true })}
            </p>
            <p className="text-[11px] text-rose-500 mt-0.5 font-medium">
              {summary.overdueCount} invoice{summary.overdueCount === 1 ? "" : "s"} past due
            </p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Filters & Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Status Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {statusPills.map((pill) => (
              <button
                key={pill.value}
                type="button"
                onClick={() => {
                  setPaymentStatus(pill.value);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                  paymentStatus === pill.value
                    ? pill.value === "OVERDUE"
                      ? "bg-rose-600 text-white border-rose-600"
                      : "bg-blue-600 text-white border-blue-600"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>

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

            <div className="w-full sm:w-64">
              <SearchField
                value={search}
                isLoading={isLoading}
                onChange={(val) => {
                  setSearch(val);
                  setPage(1);
                }}
                placeholder="Search invoice #, supplier, job..."
              />
            </div>

            <button
              type="button"
              onClick={() => setShowAdvancedFilters((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${
                showAdvancedFilters
                  ? "bg-blue-50 border-blue-200 text-blue-700"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              <span>Date &amp; Code Filters</span>
            </button>

            {(search ||
              supplierId !== "all" ||
              invoiceNumber ||
              jobNumber ||
              invoiceDateFrom ||
              invoiceDateTo ||
              dueDateFrom ||
              dueDateTo ||
              paymentStatus !== "ALL") && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>

        {showAdvancedFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 pt-3 border-t border-slate-200 text-xs">
            <div>
              <label className="block font-semibold text-slate-600 mb-1">Invoice #</label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => {
                  setInvoiceNumber(e.target.value);
                  setPage(1);
                }}
                placeholder="e.g. SUP-INV-"
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-mono outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-600 mb-1">Job # / Name</label>
              <input
                type="text"
                value={jobNumber}
                onChange={(e) => {
                  setJobNumber(e.target.value);
                  setPage(1);
                }}
                placeholder="e.g. JOB-2026"
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-mono outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-600 mb-1">Invoice From</label>
              <input
                type="date"
                value={invoiceDateFrom}
                onChange={(e) => {
                  setInvoiceDateFrom(e.target.value);
                  setPage(1);
                }}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-600 mb-1">Invoice To</label>
              <input
                type="date"
                value={invoiceDateTo}
                onChange={(e) => {
                  setInvoiceDateTo(e.target.value);
                  setPage(1);
                }}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-600 mb-1">Due Date From</label>
              <input
                type="date"
                value={dueDateFrom}
                onChange={(e) => {
                  setDueDateFrom(e.target.value);
                  setPage(1);
                }}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-600 mb-1">Due Date To</label>
              <input
                type="date"
                value={dueDateTo}
                onChange={(e) => {
                  setDueDateTo(e.target.value);
                  setPage(1);
                }}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        {isLoading && invoices.length === 0 ? (
          <TableSkeleton rows={6} columns={10} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-3.5">Invoice #</th>
                    <th className="py-3 px-3.5">Supplier</th>
                    <th className="py-3 px-3.5">Job #</th>
                    <th className="py-3 px-3.5">Invoice Date</th>
                    <th className="py-3 px-3.5">Due Date</th>
                    <th className="py-3 px-3.5 text-right">Invoice Total</th>
                    <th className="py-3 px-3.5 text-right">Paid Amount</th>
                    <th className="py-3 px-3.5 text-right">Outstanding Balance</th>
                    <th className="py-3 px-3.5 text-center">Payment Status</th>
                    <th className="py-3 px-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400">
                        <Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto mb-2" />
                        <p className="text-xs font-semibold">Loading supplier payables...</p>
                      </td>
                    </tr>
                  ) : invoices.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400">
                        <Building2 className="h-10 w-10 text-slate-300 stroke-[1.5] mx-auto mb-2" />
                        <p className="text-sm font-semibold text-slate-600">
                          No Matching Supplier Invoices
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {outstandingOnly
                            ? "All filtered supplier invoices are fully settled, or no invoices match your filter."
                            : "Create a Supplier Invoice or adjust your active filters."}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    invoices.map((inv) => {
                      const outBal = Number(inv.outstandingBalance ?? 0);
                      const paidAmt = Number(inv.paidAmount ?? 0);
                      const canPay = inv.status !== "CANCELLED" && outBal > 0 && canCreatePayment;

                      return (
                        <tr
                          key={inv.id}
                          className={`hover:bg-slate-50/70 transition-colors ${
                            inv.isOverdue ? "bg-rose-50/20" : ""
                          }`}
                        >
                          <td className="py-3 px-3.5 font-mono font-bold">
                            <button
                              type="button"
                              onClick={() => {
                                setViewingInvoice(inv);
                                setDeepLinkInvoiceId(null);
                                setIsViewModalOpen(true);
                              }}
                              className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer text-left"
                            >
                              {inv.invoiceNumber}
                            </button>
                          </td>
                          <td className="py-3 px-3.5">
                            <button
                              type="button"
                              onClick={() => setViewingSupplierId(inv.supplierId)}
                              className="font-semibold text-slate-900 hover:text-blue-600 hover:underline cursor-pointer text-left block"
                            >
                              {inv.supplierName || inv.supplier?.name || "—"}
                            </button>
                            {(inv.supplierCode || inv.supplier?.code) && (
                              <span className="font-mono text-[10px] text-slate-400">
                                {inv.supplierCode || inv.supplier?.code}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3.5">
                            {inv.jobCode || inv.job?.jobCode ? (
                              <Link
                                href={`/admin/jobs/${inv.jobId}`}
                                className="hover:underline block"
                              >
                                <span className="font-mono font-semibold text-blue-700">
                                  {inv.jobCode || inv.job?.jobCode}
                                </span>
                                <span className="block text-[10px] text-slate-500 truncate max-w-[160px]">
                                  {inv.jobName || inv.job?.name}
                                </span>
                              </Link>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-3 px-3.5 font-mono text-slate-600 whitespace-nowrap">
                            {inv.invoiceDate}
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <span
                              className={`font-mono block ${
                                inv.isOverdue
                                  ? "text-rose-700 font-bold"
                                  : "text-slate-800 font-medium"
                              }`}
                            >
                              {inv.paymentDueDate || inv.invoiceDate}
                            </span>
                            {inv.countdown?.label && (
                              <span
                                className={`text-[10px] block ${
                                  inv.isOverdue
                                    ? "text-rose-600 font-semibold"
                                    : inv.paymentStatus === "PAID"
                                    ? "text-emerald-600"
                                    : "text-slate-500"
                                }`}
                              >
                                {inv.countdown.label}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                            {formatCurrency(inv.totalAmount, { showCurrencyPrefix: true })}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono font-medium text-emerald-700 whitespace-nowrap">
                            {formatCurrency(paidAmt, { showCurrencyPrefix: true })}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono font-bold whitespace-nowrap">
                            <span
                              className={
                                outBal <= 0
                                  ? "text-slate-400"
                                  : inv.isOverdue
                                  ? "text-rose-700"
                                  : "text-blue-900"
                              }
                            >
                              {formatCurrency(outBal, { showCurrencyPrefix: true })}
                            </span>
                          </td>
                          <td className="py-3 px-3.5 text-center whitespace-nowrap">
                            <div className="inline-flex flex-col items-center gap-1">
                              <StatusBadge status={inv.paymentStatus || "UNPAID"} />
                              {inv.paymentStatus === "OVERDUE" && inv.isPartiallyPaid && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200">
                                  Partial Paid
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setViewingInvoice(inv);
                                  setDeepLinkInvoiceId(null);
                                  setIsViewModalOpen(true);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-[11px] cursor-pointer"
                                title="View invoice & payment history"
                              >
                                <Eye className="h-3.5 w-3.5 text-slate-500" />
                                <span>View</span>
                              </button>

                              {canPay && (
                                <button
                                  type="button"
                                  onClick={() => setPayingInvoice(inv)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-2xs cursor-pointer"
                                >
                                  <CreditCard className="h-3.5 w-3.5" />
                                  <span>Make Payment</span>
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

      {/* View Invoice & Payments Modal */}
      <ViewSupplierInvoiceModal
        isOpen={isViewModalOpen}
        onClose={() => {
          setIsViewModalOpen(false);
          setViewingInvoice(null);
          setDeepLinkInvoiceId(null);
        }}
        invoice={viewingInvoice}
        invoiceId={viewingInvoice ? undefined : deepLinkInvoiceId}
        initialTab="payments"
        onPaymentUpdated={() => handlePaymentMutated()}
      />

      {/* Make Payment Modal */}
      <MakeSupplierPaymentModal
        isOpen={Boolean(payingInvoice)}
        onClose={() => setPayingInvoice(null)}
        invoice={payingInvoice}
        onSuccess={handlePaymentMutated}
      />

      {/* Supplier Financial Details Modal */}
      <SupplierDetailsModal
        isOpen={Boolean(viewingSupplierId)}
        onClose={() => setViewingSupplierId(null)}
        supplierId={viewingSupplierId}
        onPaymentChanged={() => handlePaymentMutated()}
      />

      {/* Notification & Reminder Settings Modal */}
      <SupplierPaymentSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSettingsUpdated={() => handlePaymentMutated()}
      />
    </div>
  );
}
