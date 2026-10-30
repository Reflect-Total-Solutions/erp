"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  CheckCircle,
  Clock,
  XCircle,
  Search,
  Filter,
  Briefcase,
  FileText,
  Building2,
  Calendar,
  Check,
  X,
  Eye,
  FileSpreadsheet,
  Download,
  AlertCircle,
  FileCheck,
  ShieldAlert,
} from "lucide-react";
import { useAdminData } from "@/context/admin-data-context";
import { StatusBadge } from "@/components/admin/ui/badge";
import { Modal } from "@/components/admin/ui/modal";
import { Pagination } from "@/components/admin/ui/pagination";
import { SearchField } from "@/components/admin/ui/search-field";
import { Job, Invoice } from "@/types/admin";
import { downloadMockInvoiceFile, downloadMockExcelFile, downloadSingleAttachment } from "@/lib/export-utils";

export function ApprovalsView() {
  const {
    jobs,
    invoices,
    suppliers,
    updateJob,
    updateInvoice,
    showToast,
    getJobTotalInvoiceValue,
    getJobExcelFiles,
    getJobSuppliers,
    can,
    currentRole,
  } = useAdminData();

  // Tab: "invoices" | "jobs"
  const [activeTab, setActiveTab] = useState<"invoices" | "jobs">("invoices");

  // Status Filter: "pending" | "approved" | "all"
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "all">("pending");
  const [searchTerm, setSearchTerm] = useState("");

  // Pagination states
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoicePageSize, setInvoicePageSize] = useState(10);
  const [jobPage, setJobPage] = useState(1);
  const [jobPageSize, setJobPageSize] = useState(10);

  // Inspect modal
  const [inspectingInvoice, setInspectingInvoice] = useState<Invoice | null>(null);
  const [inspectingJob, setInspectingJob] = useState<Job | null>(null);

  // Action Dialog state (Approve / Reject confirmation)
  const [actionConfirm, setActionConfirm] = useState<{
    type: "approve_invoice" | "reject_invoice" | "approve_job" | "review_job";
    id: string;
    title: string;
    subtitle?: string;
    amount?: number;
  } | null>(null);
  const [actionNotes, setActionNotes] = useState("");

  // Invoices to display
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const matchSearch =
        inv.invoiceName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.fileName.toLowerCase().includes(searchTerm.toLowerCase());

      const matchStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "pending"
          ? inv.status === "Pending" || inv.status === "Under Review"
          : inv.status === "Approved" || inv.status === "Paid";

      return matchSearch && matchStatus;
    });
  }, [invoices, searchTerm, statusFilter]);

  // Jobs to display
  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const matchSearch =
        job.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (job.jobCode && job.jobCode.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "pending"
          ? job.status === "Pending" || job.status === "In Review"
          : job.status === "Active" || job.status === "Completed";

      return matchSearch && matchStatus;
    });
  }, [jobs, searchTerm, statusFilter]);

  // Counts
  const pendingInvoicesCount = useMemo(
    () => invoices.filter((i) => i.status === "Pending" || i.status === "Under Review").length,
    [invoices]
  );
  const pendingJobsCount = useMemo(
    () => jobs.filter((j) => j.status === "Pending" || j.status === "In Review").length,
    [jobs]
  );

  // Pagination slices
  const totalInvoicePages = Math.max(1, Math.ceil(filteredInvoices.length / invoicePageSize));
  const paginatedInvoices = useMemo(() => {
    const start = (invoicePage - 1) * invoicePageSize;
    return filteredInvoices.slice(start, start + invoicePageSize);
  }, [filteredInvoices, invoicePage, invoicePageSize]);

  const totalJobPages = Math.max(1, Math.ceil(filteredJobs.length / jobPageSize));
  const paginatedJobs = useMemo(() => {
    const start = (jobPage - 1) * jobPageSize;
    return filteredJobs.slice(start, start + jobPageSize);
  }, [filteredJobs, jobPage, jobPageSize]);

  // Action Confirmation Handlers
  const handleExecuteAction = () => {
    if (!actionConfirm) return;

    if (actionConfirm.type === "approve_invoice") {
      updateInvoice(actionConfirm.id, { status: "Approved" });
      showToast("Invoice Authorized", `Invoice "${actionConfirm.title}" approved successfully.`, "success");
    } else if (actionConfirm.type === "reject_invoice") {
      updateInvoice(actionConfirm.id, { status: "Under Review" });
      showToast("Invoice Placed on Hold", `Invoice "${actionConfirm.title}" held for review.`, "info");
    } else if (actionConfirm.type === "approve_job") {
      updateJob(actionConfirm.id, { status: "Active" });
      showToast("Job Authorized", `Job "${actionConfirm.title}" approved and activated.`, "success");
    } else if (actionConfirm.type === "review_job") {
      updateJob(actionConfirm.id, { status: "In Review" });
      showToast("Job Under Review", `Job "${actionConfirm.title}" marked in review.`, "info");
    }

    setActionConfirm(null);
    setActionNotes("");
    if (inspectingInvoice?.id === actionConfirm.id) setInspectingInvoice(null);
    if (inspectingJob?.id === actionConfirm.id) setInspectingJob(null);
  };

  if (!can("approvals", "view")) {
    return (
      <div className="flex flex-col items-center justify-center p-10 bg-white rounded-2xl border border-slate-200 text-center max-w-lg mx-auto mt-8 shadow-xs">
        <div className="h-14 w-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
          You do not have authorization to view or process Approvals & Sign-offs. Contact your system administrator if access is required.
        </p>
        <div className="mt-4 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
          Active Role: <span className="font-bold text-blue-600 capitalize">{currentRole}</span>
        </div>
        <Link
          href="/admin"
          className="mt-6 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2563EB] text-xs font-semibold text-white hover:bg-[#1d4ed8] transition-colors"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5" suppressHydrationWarning>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Approvals & Authorization Center</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Review, authorize, or return pending vendor invoices and project jobs.
          </p>
        </div>

        {/* Quick Pending Badge Summary */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900">
            <Clock className="h-4 w-4 text-amber-600" />
            {pendingInvoicesCount} Invoices & {pendingJobsCount} Jobs Pending
          </span>
        </div>
      </div>

      {/* Main Approval Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => {
              setActiveTab("invoices");
              setSearchTerm("");
            }}
            className={`pb-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === "invoices"
                ? "border-[#2563EB] text-[#2563EB]"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            <FileText className="h-4 w-4" />
            <span>Invoice Approvals</span>
            {pendingInvoicesCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                {pendingInvoicesCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("jobs");
              setSearchTerm("");
            }}
            className={`pb-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === "jobs"
                ? "border-[#2563EB] text-[#2563EB]"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            <Briefcase className="h-4 w-4" />
            <span>Job Approvals</span>
            {pendingJobsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                {pendingJobsCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Search bar */}
          <div className="w-full sm:w-72">
            <SearchField
              value={searchTerm}
              onChange={(val) => {
                setSearchTerm(val);
                setInvoicePage(1);
                setJobPage(1);
              }}
              placeholder={activeTab === "invoices" ? "Search invoices..." : "Search jobs..."}
            />
          </div>

          {/* Status Segment filter */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg text-xs self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setStatusFilter("pending")}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                statusFilter === "pending"
                  ? "bg-white text-slate-900 font-semibold shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Pending Authorization
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("approved")}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                statusFilter === "approved"
                  ? "bg-white text-slate-900 font-semibold shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Approved / Active
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                statusFilter === "all"
                  ? "bg-white text-slate-900 font-semibold shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All Records
            </button>
          </div>
        </div>
      </div>

      {/* ================= TAB 1: INVOICE APPROVALS ================= */}
      {activeTab === "invoices" && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {filteredInvoices.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No invoices match your current filter.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3">Invoice Details & Attachments</th>
                    <th className="px-4 py-3">Associated Job</th>
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-4 py-3">Invoice Date</th>
                    <th className="px-4 py-3 text-right">Amount (Rs.)</th>
                    <th className="px-4 py-3 text-center">Current Status</th>
                    <th className="px-5 py-3 text-right">Approval Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedInvoices.map((inv) => {
                    const job = jobs.find((j) => j.id === inv.jobId);
                    const sup = suppliers.find((s) => s.id === inv.supplierId);
                    const isPending = inv.status === "Pending" || inv.status === "Under Review";

                    return (
                      <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="space-y-1">
                            <span className="font-semibold text-slate-900 block">
                              {inv.invoiceName}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              File: {inv.fileName} ({inv.fileSize})
                            </span>

                            {/* Attached files list */}
                            {inv.attachments && inv.attachments.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-0.5">
                                {inv.attachments.map((att, aIdx) => {
                                  const isPdf = att.fileName.toLowerCase().endsWith(".pdf");
                                  return (
                                    <div
                                      key={att.id || aIdx}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-slate-100 border border-slate-200 text-[10px]"
                                    >
                                      <span
                                        className={`font-mono font-bold uppercase ${
                                          isPdf ? "text-rose-600" : "text-blue-600"
                                        }`}
                                      >
                                        {isPdf ? "PDF" : "IMG"}
                                      </span>
                                      <span className="text-slate-700 max-w-[100px] truncate">
                                        {att.fileName}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => downloadSingleAttachment(att.fileName)}
                                        className="text-slate-400 hover:text-blue-600 ml-0.5"
                                        title={`Download ${att.fileName}`}
                                      >
                                        <Download className="h-2.5 w-2.5" />
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3.5 text-slate-700">
                          {job ? (
                            <Link href={`/admin/jobs/${job.id}`} className="hover:text-blue-600 font-medium">
                              {job.name}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-slate-700 font-medium">
                          {sup ? sup.name : "—"}
                        </td>

                        <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap">
                          {inv.invoiceDate}
                        </td>

                        <td className="px-4 py-3.5 text-right font-semibold text-slate-900">
                          Rs. {inv.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>

                        <td className="px-4 py-3.5 text-center">
                          <StatusBadge status={inv.status} />
                        </td>

                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setInspectingInvoice(inv)}
                              className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-[11px] flex items-center gap-1"
                              title="Inspect Invoice"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Inspect
                            </button>

                            {can("approvals", "approve") && (
                              <>
                                {isPending ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setActionConfirm({
                                          type: "approve_invoice",
                                          id: inv.id,
                                          title: inv.invoiceName,
                                          subtitle: `Job: ${job?.name || "General"} • Supplier: ${sup?.name || "Vendor"}`,
                                          amount: inv.totalValue,
                                        })
                                      }
                                      className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] flex items-center gap-1 shadow-2xs"
                                      title="Approve Invoice"
                                    >
                                      <Check className="h-3.5 w-3.5" />
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setActionConfirm({
                                          type: "reject_invoice",
                                          id: inv.id,
                                          title: inv.invoiceName,
                                          subtitle: `Job: ${job?.name || "General"} • Supplier: ${sup?.name || "Vendor"}`,
                                          amount: inv.totalValue,
                                        })
                                      }
                                      className="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 font-medium text-[11px] flex items-center gap-1"
                                      title="Flag / Hold Invoice"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                      Hold
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setActionConfirm({
                                        type: "reject_invoice",
                                        id: inv.id,
                                        title: inv.invoiceName,
                                        subtitle: `Job: ${job?.name || "General"} • Supplier: ${sup?.name || "Vendor"}`,
                                        amount: inv.totalValue,
                                      })
                                    }
                                    className="px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 text-[11px]"
                                    title="Re-open for Review"
                                  >
                                    Re-Review
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={invoicePage}
              totalPages={totalInvoicePages}
              totalItems={filteredInvoices.length}
              pageSize={invoicePageSize}
              onPageChange={setInvoicePage}
              onPageSizeChange={(newSize) => {
                setInvoicePageSize(newSize);
                setInvoicePage(1);
              }}
            />
          </>
        )}
      </div>
    )}

      {/* ================= TAB 2: JOB APPROVALS ================= */}
      {activeTab === "jobs" && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {filteredJobs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No jobs match your current filter.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3">Job Name & Code</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-center">Suppliers</th>
                    <th className="px-4 py-3 text-center">Attached Excels</th>
                    <th className="px-4 py-3 text-right">Total Invoice Value (Rs.)</th>
                    <th className="px-4 py-3 text-center">Current Status</th>
                    <th className="px-5 py-3 text-right">Approval Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedJobs.map((job) => {
                    const cost = getJobTotalInvoiceValue(job.id);
                    const excels = getJobExcelFiles(job.id);
                    const isPending = job.status === "Pending" || job.status === "In Review";

                    return (
                      <tr key={job.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <Link
                                href={`/admin/jobs/${job.id}`}
                                className="font-semibold text-slate-900 hover:text-blue-600"
                              >
                                {job.name}
                              </Link>
                              {job.jobCode && (
                                <span className="text-[10px] font-mono font-medium text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                                  {job.jobCode}
                                </span>
                              )}
                            </div>
                            {job.remarks && (
                              <p className="text-[11px] text-slate-500 italic truncate max-w-xs">
                                {job.remarks}
                              </p>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap">
                          {job.date}
                        </td>

                        <td className="px-4 py-3.5 text-center font-medium text-slate-700">
                          {job.supplierIds.length}
                        </td>

                        <td className="px-4 py-3.5 text-center font-medium text-slate-700">
                          {excels.length} files
                        </td>

                        <td className="px-4 py-3.5 text-right font-semibold text-slate-900">
                          Rs. {cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>

                        <td className="px-4 py-3.5 text-center">
                          <StatusBadge status={job.status} />
                        </td>

                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setInspectingJob(job)}
                              className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-[11px] flex items-center gap-1"
                              title="Inspect Job"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Inspect
                            </button>

                            {can("approvals", "approve") && (
                              <>
                                {isPending ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setActionConfirm({
                                          type: "approve_job",
                                          id: job.id,
                                          title: job.name,
                                          subtitle: `Date: ${job.date} • ${job.supplierIds.length} Suppliers assigned`,
                                          amount: cost,
                                        })
                                      }
                                      className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] flex items-center gap-1 shadow-2xs"
                                      title="Authorize Job"
                                    >
                                      <Check className="h-3.5 w-3.5" />
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setActionConfirm({
                                          type: "review_job",
                                          id: job.id,
                                          title: job.name,
                                          subtitle: `Date: ${job.date} • ${job.supplierIds.length} Suppliers assigned`,
                                          amount: cost,
                                        })
                                      }
                                      className="px-2 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 font-medium text-[11px]"
                                      title="Mark In Review"
                                    >
                                      Hold
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setActionConfirm({
                                        type: "review_job",
                                        id: job.id,
                                        title: job.name,
                                        subtitle: `Date: ${job.date} • ${job.supplierIds.length} Suppliers assigned`,
                                        amount: cost,
                                      })
                                    }
                                    className="px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 text-[11px]"
                                    title="Re-open Review"
                                  >
                                    Re-Review
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={jobPage}
              totalPages={totalJobPages}
              totalItems={filteredJobs.length}
              pageSize={jobPageSize}
              onPageChange={setJobPage}
              onPageSizeChange={(newSize) => {
                setJobPageSize(newSize);
                setJobPage(1);
              }}
            />
          </>
        )}
      </div>
    )}

      {/* ================= MODAL: INSPECT INVOICE ================= */}
      {inspectingInvoice && (
        <Modal
          isOpen={true}
          onClose={() => setInspectingInvoice(null)}
          title={`Inspect Invoice: ${inspectingInvoice.invoiceName}`}
          maxWidth="lg"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Amount</span>
                <span className="font-bold text-slate-900 text-sm">
                  Rs. {inspectingInvoice.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Invoice Date</span>
                <span className="font-semibold text-slate-700">{inspectingInvoice.invoiceDate}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Supplier</span>
                <span className="font-semibold text-slate-700">
                  {suppliers.find((s) => s.id === inspectingInvoice.supplierId)?.name || "—"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Current Status</span>
                <StatusBadge status={inspectingInvoice.status} />
              </div>
            </div>

            {/* Attached documents */}
            <div>
              <h4 className="text-xs font-bold text-slate-900 mb-1.5">Attached Files</h4>
              <div className="space-y-1.5">
                {(inspectingInvoice.attachments || [
                  { id: "1", fileName: inspectingInvoice.fileName, fileSize: inspectingInvoice.fileSize, fileType: "pdf" },
                ]).map((att, i) => (
                  <div
                    key={att.id || i}
                    className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-white text-xs"
                  >
                    <span className="font-medium text-slate-800">{att.fileName} ({att.fileSize})</span>
                    <button
                      type="button"
                      onClick={() => downloadSingleAttachment(att.fileName)}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline font-semibold"
                    >
                      <Download className="h-3 w-3" />
                      Download File
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Decision Buttons */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setActionConfirm({
                    type: "reject_invoice",
                    id: inspectingInvoice.id,
                    title: inspectingInvoice.invoiceName,
                    amount: inspectingInvoice.totalValue,
                  });
                }}
                className="px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-semibold"
              >
                Mark Hold / Under Review
              </button>
              <button
                type="button"
                onClick={() => {
                  setActionConfirm({
                    type: "approve_invoice",
                    id: inspectingInvoice.id,
                    title: inspectingInvoice.invoiceName,
                    amount: inspectingInvoice.totalValue,
                  });
                }}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs"
              >
                Approve & Authorize Invoice
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ================= MODAL: INSPECT JOB ================= */}
      {inspectingJob && (
        <Modal
          isOpen={true}
          onClose={() => setInspectingJob(null)}
          title={`Inspect Job: ${inspectingJob.name}`}
          maxWidth="lg"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Job Code</span>
                <span className="font-mono font-bold text-blue-700">{inspectingJob.jobCode || "—"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Scheduled Date</span>
                <span className="font-semibold text-slate-700">{inspectingJob.date}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Total Invoice Value</span>
                <span className="font-bold text-slate-900 text-sm">
                  Rs. {getJobTotalInvoiceValue(inspectingJob.id).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Current Status</span>
                <StatusBadge status={inspectingJob.status} />
              </div>
            </div>

            {inspectingJob.remarks && (
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                <strong>Remarks:</strong> {inspectingJob.remarks}
              </div>
            )}

            {/* Attached Excel Files */}
            <div>
              <h4 className="text-xs font-bold text-slate-900 mb-1.5">Attached Excel Schedules</h4>
              <div className="space-y-1.5">
                {getJobExcelFiles(inspectingJob.id).map((xf) => (
                  <div
                    key={xf.id}
                    className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-white text-xs"
                  >
                    <span className="font-medium text-slate-800">
                      {xf.customName || xf.fileName} ({xf.fileSize})
                    </span>
                    <button
                      type="button"
                      onClick={() => downloadMockExcelFile(xf)}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline font-semibold"
                    >
                      <Download className="h-3 w-3" />
                      Download Sheet
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Decision Buttons */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setActionConfirm({
                    type: "review_job",
                    id: inspectingJob.id,
                    title: inspectingJob.name,
                    subtitle: `Job Code: ${inspectingJob.jobCode || "—"}`,
                  });
                }}
                className="px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 text-xs font-semibold"
              >
                Mark In Review
              </button>
              <button
                type="button"
                onClick={() => {
                  setActionConfirm({
                    type: "approve_job",
                    id: inspectingJob.id,
                    title: inspectingJob.name,
                    subtitle: `Job Code: ${inspectingJob.jobCode || "—"}`,
                  });
                }}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs"
              >
                Approve & Activate Job
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ================= MODAL: ACTION CONFIRMATION DIALOG ================= */}
      {actionConfirm && (
        <Modal
          isOpen={true}
          onClose={() => {
            setActionConfirm(null);
            setActionNotes("");
          }}
          title={
            actionConfirm.type === "approve_invoice"
              ? "Authorize Vendor Invoice"
              : actionConfirm.type === "reject_invoice"
              ? "Place Invoice on Hold"
              : actionConfirm.type === "approve_job"
              ? "Authorize Project Job"
              : "Mark Job in Review"
          }
          maxWidth="sm"
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-1">
              <p className="text-xs font-bold text-slate-900">{actionConfirm.title}</p>
              {actionConfirm.subtitle && (
                <p className="text-[11px] text-slate-500">{actionConfirm.subtitle}</p>
              )}
              {actionConfirm.amount !== undefined && (
                <p className="text-sm font-bold text-blue-600 pt-1">
                  Rs. {actionConfirm.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {actionConfirm.type.startsWith("approve")
                  ? "Authorization Remarks (Optional)"
                  : "Reason for Hold / Return (Required)"}
              </label>
              <textarea
                rows={2}
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                placeholder={
                  actionConfirm.type.startsWith("approve")
                    ? "Add authorization comments..."
                    : "Specify the discrepancy or reason for hold..."
                }
                className="w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setActionConfirm(null);
                  setActionNotes("");
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteAction}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold text-white shadow-xs transition-colors ${
                  actionConfirm.type.startsWith("approve")
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {actionConfirm.type.startsWith("approve") ? "Confirm Authorization" : "Confirm Hold"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
