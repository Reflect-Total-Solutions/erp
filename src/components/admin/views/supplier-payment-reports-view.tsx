"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import {
  AlertTriangle,
  Briefcase,
  Building2,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Download,
  FileSpreadsheet,
  Loader2,
  Printer,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { useAdminData } from "@/context/admin-data-context";
import { StatusBadge } from "@/components/admin/ui/badge";
import { SearchField } from "@/components/admin/ui/search-field";
import { FilterSelect } from "@/components/admin/ui/filter-controls";
import { ViewSupplierInvoiceModal } from "@/components/admin/modals/view-supplier-invoice-modal";
import { SupplierDetailsModal } from "@/components/admin/modals/supplier-details-modal";
import { SupplierInvoice, SupplierPayment } from "@/types/admin";
import { formatCurrency } from "@/lib/financial";
import { SUPPLIER_PAYMENT_METHODS } from "@/lib/supplier-payment-date";

interface ReportsPayload {
  summary: {
    totalInvoices: number;
    totalPayableAmount: number;
    totalPaidAmount: number;
    totalOutstandingAmount: number;
    overdueCount: number;
    overdueAmount: number;
    dueSoonCount: number;
    dueSoonAmount: number;
    unpaidCount: number;
    partiallyPaidCount: number;
    paidCount: number;
    paymentTransactionsCount: number;
    reversedCount: number;
  };
  agingBuckets: {
    currentAmount: number;
    currentCount: number;
    days1To30Amount: number;
    days1To30Count: number;
    days31To60Amount: number;
    days31To60Count: number;
    days60PlusAmount: number;
    days60PlusCount: number;
  };
  supplierBreakdown: Array<{
    supplierId: string;
    supplierCode: string;
    supplierName: string;
    invoiceCount: number;
    totalBilled: number;
    totalPaid: number;
    outstandingBalance: number;
    overdueCount: number;
    overdueBalance: number;
  }>;
  jobBreakdown: Array<{
    jobId: string;
    jobCode: string;
    jobName: string;
    clientName: string;
    invoiceCount: number;
    totalBilled: number;
    totalPaid: number;
    outstandingBalance: number;
    overdueBalance: number;
  }>;
  paymentMethodBreakdown: Array<{
    method: string;
    count: number;
    totalAmount: number;
  }>;
  invoiceLedger: SupplierInvoice[];
  paymentLedger: SupplierPayment[];
  meta?: {
    timezone?: string;
  };
}

export function SupplierPaymentReportsView() {
  const { suppliers, jobs, showToast, can, currentRole } = useAdminData();

  const canView = can("supplierPayments", "exportReports") || can("supplierPayments", "view");
  const canExport = can("supplierPayments", "exportReports") || can("supplierPayments", "view");

  const [activeTab, setActiveTab] = useState<
    "invoices" | "suppliers" | "jobs" | "methods"
  >("invoices");

  // Filters
  const [search, setSearch] = useState("");
  const [supplierId, setSupplierId] = useState("all");
  const [jobId, setJobId] = useState("all");
  const [paymentStatus, setPaymentStatus] = useState("ALL");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [refreshTick, setRefreshTick] = useState(0);
  const [loadedKey, setLoadedKey] = useState("");
  const [report, setReport] = useState<ReportsPayload | null>(null);
  const [viewingInvoiceId, setViewingInvoiceId] = useState<string | null>(null);
  const [viewingSupplierId, setViewingSupplierId] = useState<string | null>(null);

  const queryKey = `${search.trim()}|${supplierId}|${jobId}|${paymentStatus}|${paymentMethod}|${dateFrom}|${dateTo}|${refreshTick}`;
  const isLoading = canView && loadedKey !== queryKey;

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    const qs = new URLSearchParams();
    if (search.trim()) qs.set("search", search.trim());
    if (supplierId !== "all") qs.set("supplierId", supplierId);
    if (jobId !== "all") qs.set("jobId", jobId);
    if (paymentStatus !== "ALL") qs.set("paymentStatus", paymentStatus);
    if (paymentMethod !== "all") qs.set("paymentMethod", paymentMethod);
    if (dateFrom) qs.set("dateFrom", dateFrom);
    if (dateTo) qs.set("dateTo", dateTo);

    fetch(`/api/supplier-payments/reports?${qs.toString()}`)
      .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        if (cancelled) return;
        if (!ok || !json.success) {
          throw new Error(json?.error || "Failed to generate supplier payment report.");
        }
        setReport(json);
      })
      .catch((err: any) => {
        if (cancelled) return;
        showToast("Error", err?.message || "Failed to generate payment report.", "error");
      })
      .finally(() => {
        if (!cancelled) {
          setLoadedKey(queryKey);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canView, queryKey, search, supplierId, jobId, paymentStatus, paymentMethod, dateFrom, dateTo, showToast]);

  const handleExportExcel = () => {
    if (!report) return;
    try {
      const wb = XLSX.utils.book_new();

      const summarySheet = XLSX.utils.json_to_sheet([
        { Metric: "Total Eligible Invoices", Value: report.summary.totalInvoices },
        { Metric: "Total Payable Billed (Rs.)", Value: report.summary.totalPayableAmount },
        { Metric: "Total Paid Settled (Rs.)", Value: report.summary.totalPaidAmount },
        { Metric: "Total Outstanding Balance (Rs.)", Value: report.summary.totalOutstandingAmount },
        { Metric: "Overdue Invoices Count", Value: report.summary.overdueCount },
        { Metric: "Overdue Payable Amount (Rs.)", Value: report.summary.overdueAmount },
        { Metric: "Due Within 7 Days Count", Value: report.summary.dueSoonCount },
        { Metric: "Due Within 7 Days Amount (Rs.)", Value: report.summary.dueSoonAmount },
        { Metric: "Active Payment Transactions", Value: report.summary.paymentTransactionsCount },
        { Metric: "Reversed Transactions", Value: report.summary.reversedCount },
        { Metric: "Current / Not Overdue (Rs.)", Value: report.agingBuckets.currentAmount },
        { Metric: "1-30 Days Overdue (Rs.)", Value: report.agingBuckets.days1To30Amount },
        { Metric: "31-60 Days Overdue (Rs.)", Value: report.agingBuckets.days31To60Amount },
        { Metric: "60+ Days Overdue (Rs.)", Value: report.agingBuckets.days60PlusAmount },
      ]);
      XLSX.utils.book_append_sheet(wb, summarySheet, "Executive Summary");

      const supSheet = XLSX.utils.json_to_sheet(
        report.supplierBreakdown.map((s) => ({
          "Supplier Code": s.supplierCode,
          "Supplier Name": s.supplierName,
          Invoices: s.invoiceCount,
          "Total Billed": s.totalBilled,
          "Total Paid": s.totalPaid,
          "Outstanding Balance": s.outstandingBalance,
          "Overdue Invoices": s.overdueCount,
          "Overdue Balance": s.overdueBalance,
        }))
      );
      XLSX.utils.book_append_sheet(wb, supSheet, "By Supplier");

      const jobSheet = XLSX.utils.json_to_sheet(
        report.jobBreakdown.map((j) => ({
          "Job Code": j.jobCode,
          "Job Name": j.jobName,
          Client: j.clientName,
          Invoices: j.invoiceCount,
          "Total Billed": j.totalBilled,
          "Total Paid": j.totalPaid,
          "Outstanding Balance": j.outstandingBalance,
          "Overdue Balance": j.overdueBalance,
        }))
      );
      XLSX.utils.book_append_sheet(wb, jobSheet, "By Job");

      const invSheet = XLSX.utils.json_to_sheet(
        report.invoiceLedger.map((inv) => ({
          "Invoice #": inv.invoiceNumber,
          "Supplier Name": inv.supplierName,
          "Supplier Code": inv.supplierCode,
          "Job Code": inv.jobCode,
          "Job Name": inv.jobName,
          "Invoice Date": inv.invoiceDate,
          "Due Date": inv.paymentDueDate || inv.invoiceDate,
          "Payment Terms": inv.paymentTerms || "",
          "Invoice Total": inv.totalAmount,
          "Paid Amount": inv.paidAmount ?? 0,
          "Outstanding Balance": inv.outstandingBalance ?? 0,
          "Payment Status": inv.paymentStatus || inv.status,
          Countdown: inv.countdown?.label || "",
        }))
      );
      XLSX.utils.book_append_sheet(wb, invSheet, "Invoices Ledger");

      const paySheet = XLSX.utils.json_to_sheet(
        report.paymentLedger.map((p) => ({
          "Payment #": p.paymentNumber,
          "Payment Date": p.paymentDate,
          "Invoice #": p.invoiceNumber || "",
          Supplier: p.supplierName || "",
          "Job Code": p.jobCode || "",
          "Payment Method": p.paymentMethod,
          "Reference #": p.referenceNumber || "",
          "Bank Account": p.bankAccountName || "",
          Amount: p.amount,
          Status: p.status,
          "Reversal Reason": p.reversalReason || "",
        }))
      );
      XLSX.utils.book_append_sheet(wb, paySheet, "Payments Ledger");

      const stamp = new Date().toISOString().split("T")[0];
      XLSX.writeFile(wb, `Supplier-Payment-Report-${stamp}.xlsx`);
      showToast("Excel Exported", "Multi-sheet payment report downloaded (.xlsx).", "success");
    } catch (err: any) {
      showToast("Export Failed", err?.message || "Unable to export workbook.", "error");
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
          You do not have permission to view or export Supplier Payment Reports.
        </p>
        <div className="mt-4 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
          Active Role: <span className="font-bold text-blue-600 capitalize">{currentRole}</span>
        </div>
      </div>
    );
  }

  const activeSuppliers = suppliers.filter((s) => !s.isDeleted);
  const eligibleJobs = jobs.filter(
    (j) => !j.isDeleted && ["APPROVED", "ACTIVE", "INVOICED"].includes(j.status)
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Supplier Payables, Aging &amp; Payment Reports
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Overdue aging analysis, payables by supplier &amp; job, method totals, and Excel/PDF financial exports.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap print:hidden">
          <button
            type="button"
            onClick={() => setRefreshTick((t) => t + 1)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin text-blue-600" : ""}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            disabled={!report}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
          >
            <Printer className="h-3.5 w-3.5 text-slate-500" />
            <span>Print / PDF</span>
          </button>

          {canExport && (
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={!report || isLoading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white shadow-xs cursor-pointer disabled:opacity-50"
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>Export Excel (.xlsx)</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2 flex-wrap">
          <FilterSelect
            label="Supplier"
            value={supplierId}
            onChange={setSupplierId}
            options={[
              { label: "All Suppliers", value: "all" },
              ...activeSuppliers.map((s) => ({ label: `${s.name} (${s.code})`, value: s.id })),
            ]}
          />

          <FilterSelect
            label="Job"
            value={jobId}
            onChange={setJobId}
            options={[
              { label: "All Jobs", value: "all" },
              ...eligibleJobs.map((j) => ({ label: `${j.jobCode || "JOB"} - ${j.name}`, value: j.id })),
            ]}
          />

          <FilterSelect
            label="Status"
            value={paymentStatus}
            onChange={setPaymentStatus}
            options={[
              { label: "All Statuses", value: "ALL" },
              { label: "Overdue", value: "OVERDUE" },
              { label: "Unpaid", value: "UNPAID" },
              { label: "Partially Paid", value: "PARTIALLY_PAID" },
              { label: "Paid", value: "PAID" },
            ]}
          />

          <FilterSelect
            label="Method"
            value={paymentMethod}
            onChange={setPaymentMethod}
            options={[
              { label: "All Methods", value: "all" },
              ...SUPPLIER_PAYMENT_METHODS.map((m) => ({ label: m, value: m })),
            ]}
          />

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 outline-none"
            title="Invoice Date From"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 outline-none"
            title="Invoice Date To"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="w-full sm:w-56">
            <SearchField
              value={search}
              isLoading={isLoading}
              onChange={setSearch}
              placeholder="Search invoice, supplier, job..."
            />
          </div>
          {(search ||
            supplierId !== "all" ||
            jobId !== "all" ||
            paymentStatus !== "ALL" ||
            paymentMethod !== "all" ||
            dateFrom ||
            dateTo) && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setSupplierId("all");
                setJobId("all");
                setPaymentStatus("ALL");
                setPaymentMethod("all");
                setDateFrom("");
                setDateTo("");
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-rose-600 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {isLoading && !report ? (
        <div className="py-16 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
          <p className="text-xs font-semibold">Calculating aging buckets &amp; financial totals...</p>
        </div>
      ) : !report ? null : (
        <>
          {/* Executive KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">Total Billed Payables</p>
                <p className="text-lg font-bold text-slate-900 mt-1 font-mono">
                  {formatCurrency(report.summary.totalPayableAmount, { showCurrencyPrefix: true })}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {report.summary.totalInvoices} invoices
                </p>
              </div>
              <DollarSign className="h-5 w-5 text-blue-600" />
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">Total Paid Settled</p>
                <p className="text-lg font-bold text-emerald-700 mt-1 font-mono">
                  {formatCurrency(report.summary.totalPaidAmount, { showCurrencyPrefix: true })}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {report.summary.paymentTransactionsCount} active payments
                </p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">Outstanding Payable</p>
                <p className="text-lg font-bold text-blue-800 mt-1 font-mono">
                  {formatCurrency(report.summary.totalOutstandingAmount, {
                    showCurrencyPrefix: true,
                  })}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Due within 7d: {formatCurrency(report.summary.dueSoonAmount)}
                </p>
              </div>
              <CreditCard className="h-5 w-5 text-indigo-600" />
            </div>

            <div className="bg-white p-4 rounded-xl border border-rose-200 bg-rose-50/30 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-rose-700">Overdue Payables</p>
                <p className="text-lg font-bold text-rose-700 mt-1 font-mono">
                  {formatCurrency(report.summary.overdueAmount, { showCurrencyPrefix: true })}
                </p>
                <p className="text-[11px] text-rose-600 mt-0.5">
                  {report.summary.overdueCount} past-due invoices
                </p>
              </div>
              <AlertTriangle className="h-5 w-5 text-rose-600" />
            </div>
          </div>

          {/* Aging Buckets */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                label: "Current / Not Due Yet",
                count: report.agingBuckets.currentCount,
                amount: report.agingBuckets.currentAmount,
                tone: "border-emerald-200 bg-emerald-50/40 text-emerald-800",
              },
              {
                label: "1 – 30 Days Overdue",
                count: report.agingBuckets.days1To30Count,
                amount: report.agingBuckets.days1To30Amount,
                tone: "border-amber-200 bg-amber-50/50 text-amber-800",
              },
              {
                label: "31 – 60 Days Overdue",
                count: report.agingBuckets.days31To60Count,
                amount: report.agingBuckets.days31To60Amount,
                tone: "border-orange-200 bg-orange-50/60 text-orange-900",
              },
              {
                label: "60+ Days Overdue",
                count: report.agingBuckets.days60PlusCount,
                amount: report.agingBuckets.days60PlusAmount,
                tone: "border-rose-200 bg-rose-50/70 text-rose-800",
              },
            ].map((b) => (
              <div key={b.label} className={`p-3.5 rounded-xl border ${b.tone}`}>
                <span className="text-[10px] font-bold uppercase tracking-wider block">
                  {b.label} ({b.count} inv)
                </span>
                <span className="text-base font-extrabold font-mono block mt-1">
                  {formatCurrency(b.amount, { showCurrencyPrefix: true })}
                </span>
              </div>
            ))}
          </div>

          {/* Breakdown Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2 print:hidden flex-wrap">
            {[
              { key: "invoices" as const, label: `Invoices Ledger (${report.invoiceLedger.length})` },
              { key: "suppliers" as const, label: `By Supplier (${report.supplierBreakdown.length})` },
              { key: "jobs" as const, label: `By Job (${report.jobBreakdown.length})` },
              {
                key: "methods" as const,
                label: `By Payment Method & Transactions (${report.paymentLedger.length})`,
              },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  activeTab === t.key
                    ? "bg-blue-600 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {activeTab === "invoices" && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                      <th className="py-2.5 px-3">Invoice #</th>
                      <th className="py-2.5 px-3">Supplier</th>
                      <th className="py-2.5 px-3">Job</th>
                      <th className="py-2.5 px-3">Invoice Date</th>
                      <th className="py-2.5 px-3">Due Date</th>
                      <th className="py-2.5 px-3 text-right">Billed</th>
                      <th className="py-2.5 px-3 text-right">Paid</th>
                      <th className="py-2.5 px-3 text-right">Outstanding</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.invoiceLedger.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-10 text-center text-slate-400">
                          No invoices match the current report filters.
                        </td>
                      </tr>
                    ) : (
                      report.invoiceLedger.map((inv) => (
                        <tr key={inv.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-mono font-bold">
                            <button
                              type="button"
                              onClick={() => setViewingInvoiceId(inv.id)}
                              className="text-blue-600 hover:underline cursor-pointer"
                            >
                              {inv.invoiceNumber}
                            </button>
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-800">
                            {inv.supplierName}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-600">{inv.jobCode}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-600">{inv.invoiceDate}</td>
                          <td className="py-2.5 px-3 font-mono">
                            <span className={inv.isOverdue ? "text-rose-700 font-bold" : "text-slate-700"}>
                              {inv.paymentDueDate || inv.invoiceDate}
                            </span>
                            {inv.countdown?.label && (
                              <span className="block text-[10px] font-sans text-slate-400">
                                {inv.countdown.label}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">
                            {formatCurrency(inv.totalAmount)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                            {formatCurrency(inv.paidAmount ?? 0)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-900">
                            {formatCurrency(inv.outstandingBalance ?? 0)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <StatusBadge status={inv.paymentStatus || inv.status} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "suppliers" && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                      <th className="py-2.5 px-3.5">Supplier</th>
                      <th className="py-2.5 px-3.5 text-center">Invoices</th>
                      <th className="py-2.5 px-3.5 text-right">Total Billed</th>
                      <th className="py-2.5 px-3.5 text-right">Total Paid</th>
                      <th className="py-2.5 px-3.5 text-right">Outstanding Balance</th>
                      <th className="py-2.5 px-3.5 text-right">Overdue Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.supplierBreakdown.map((s) => (
                      <tr key={s.supplierId} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3.5">
                          <button
                            type="button"
                            onClick={() => setViewingSupplierId(s.supplierId)}
                            className="inline-flex items-center gap-1.5 font-semibold text-blue-700 hover:underline cursor-pointer"
                          >
                            <Building2 className="h-3.5 w-3.5 text-slate-400" />
                            <span>{s.supplierName}</span>
                            <span className="font-mono text-[10px] text-slate-500">
                              ({s.supplierCode})
                            </span>
                          </button>
                        </td>
                        <td className="py-2.5 px-3.5 text-center font-mono">{s.invoiceCount}</td>
                        <td className="py-2.5 px-3.5 text-right font-mono">
                          {formatCurrency(s.totalBilled, { showCurrencyPrefix: true })}
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono text-emerald-700">
                          {formatCurrency(s.totalPaid, { showCurrencyPrefix: true })}
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono font-bold text-blue-900">
                          {formatCurrency(s.outstandingBalance, { showCurrencyPrefix: true })}
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono font-bold text-rose-700">
                          {s.overdueBalance > 0
                            ? `${formatCurrency(s.overdueBalance)} (${s.overdueCount})`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "jobs" && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                      <th className="py-2.5 px-3.5">Job</th>
                      <th className="py-2.5 px-3.5">Client</th>
                      <th className="py-2.5 px-3.5 text-center">Invoices</th>
                      <th className="py-2.5 px-3.5 text-right">Billed</th>
                      <th className="py-2.5 px-3.5 text-right">Paid</th>
                      <th className="py-2.5 px-3.5 text-right">Outstanding</th>
                      <th className="py-2.5 px-3.5 text-right">Overdue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.jobBreakdown.map((j) => (
                      <tr key={j.jobId} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3.5">
                          <Link
                            href={`/admin/jobs/${j.jobId}`}
                            className="inline-flex items-center gap-1.5 font-semibold text-blue-700 hover:underline"
                          >
                            <Briefcase className="h-3.5 w-3.5 text-slate-400" />
                            <span className="font-mono">{j.jobCode}</span>
                            <span className="text-slate-700">{j.jobName}</span>
                          </Link>
                        </td>
                        <td className="py-2.5 px-3.5 text-slate-600">{j.clientName}</td>
                        <td className="py-2.5 px-3.5 text-center font-mono">{j.invoiceCount}</td>
                        <td className="py-2.5 px-3.5 text-right font-mono">
                          {formatCurrency(j.totalBilled, { showCurrencyPrefix: true })}
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono text-emerald-700">
                          {formatCurrency(j.totalPaid, { showCurrencyPrefix: true })}
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono font-bold text-blue-900">
                          {formatCurrency(j.outstandingBalance, { showCurrencyPrefix: true })}
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono text-rose-700 font-bold">
                          {j.overdueBalance > 0 ? formatCurrency(j.overdueBalance) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "methods" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {report.paymentMethodBreakdown.map((m) => (
                  <div
                    key={m.method}
                    className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs"
                  >
                    <span className="text-[11px] font-semibold text-slate-500 block">
                      {m.method} ({m.count} txn)
                    </span>
                    <span className="text-base font-extrabold font-mono text-slate-900 block mt-1">
                      {formatCurrency(m.totalAmount, { showCurrencyPrefix: true })}
                    </span>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                        <th className="py-2.5 px-3">Payment #</th>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Invoice #</th>
                        <th className="py-2.5 px-3">Supplier</th>
                        <th className="py-2.5 px-3">Method &amp; Ref</th>
                        <th className="py-2.5 px-3 text-right">Amount</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                        <th className="py-2.5 px-3">Receipt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.paymentLedger.map((p) => (
                        <tr
                          key={p.id}
                          className={p.status === "REVERSED" ? "bg-rose-50/30" : "hover:bg-slate-50"}
                        >
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                            {p.paymentNumber}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-600">{p.paymentDate}</td>
                          <td className="py-2.5 px-3">
                            <button
                              type="button"
                              onClick={() => setViewingInvoiceId(p.supplierInvoiceId)}
                              className="font-mono font-bold text-blue-600 hover:underline cursor-pointer"
                            >
                              {p.invoiceNumber || "—"}
                            </button>
                          </td>
                          <td className="py-2.5 px-3 text-slate-800">{p.supplierName || "—"}</td>
                          <td className="py-2.5 px-3">
                            <span className="font-semibold block">{p.paymentMethod}</span>
                            {p.referenceNumber && (
                              <span className="font-mono text-[10px] text-slate-400">
                                {p.referenceNumber}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold">
                            {formatCurrency(p.amount, { showCurrencyPrefix: true })}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <StatusBadge status={p.status} />
                          </td>
                          <td className="py-2.5 px-3">
                            {p.attachmentName || p.attachmentStoragePath ? (
                              <a
                                href={`/api/supplier-payments/${p.id}/receipt?action=download`}
                                className="inline-flex items-center gap-1 text-blue-600 hover:underline text-[11px]"
                              >
                                <Download className="h-3 w-3" />
                                <span>Receipt</span>
                              </a>
                            ) : (
                              <span className="text-[10px] text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <ViewSupplierInvoiceModal
        isOpen={Boolean(viewingInvoiceId)}
        onClose={() => setViewingInvoiceId(null)}
        invoiceId={viewingInvoiceId}
        initialTab="payments"
        onPaymentUpdated={() => setRefreshTick((t) => t + 1)}
      />

      <SupplierDetailsModal
        isOpen={Boolean(viewingSupplierId)}
        onClose={() => setViewingSupplierId(null)}
        supplierId={viewingSupplierId}
        onPaymentChanged={() => setRefreshTick((t) => t + 1)}
      />
    </div>
  );
}
