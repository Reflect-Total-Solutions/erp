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
  Building2,
  Calendar,
  Check,
  X,
  Eye,
  FileSpreadsheet,
  Download,
  AlertCircle,
  ShieldAlert,
  RotateCcw,
  User,
  DollarSign,
  ArrowRight,
  Lock,
  Receipt,
} from "lucide-react";
import { useAdminData } from "@/context/admin-data-context";
import { StatusBadge } from "@/components/admin/ui/badge";
import { Pagination } from "@/components/admin/ui/pagination";
import { SearchField } from "@/components/admin/ui/search-field";
import { TableSkeleton } from "@/components/ui/loading/table-skeleton";
import { JobApprovalModal } from "@/components/admin/modals/job-approval-modal";
import { Job } from "@/types/admin";
import {
  downloadFileFromUrl,
} from "@/lib/export-utils";
import { formatCurrency } from "@/lib/financial";

export function ApprovalsView() {
  const {
    jobs,
    isLoadingJobs,
    showToast,
    refreshJobs,
    can,
    currentRole,
  } = useAdminData();

  // Status Filter: "pending" | "approved" | "rejected" | "all"
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [searchTerm, setSearchTerm] = useState("");

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Job Approval Modal state
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [modalAction, setModalAction] = useState<"APPROVE" | "REJECT" | "RESET" | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const canApprove = can("approvals", "approve");
  const canReject = can("approvals", "reject");
  const canMoveToPending = can("approvals", "moveToPending");

  // Filtered Jobs
  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (job.isDeleted) return false;

      const q = searchTerm.toLowerCase();
      const matchSearch =
        !q ||
        job.name.toLowerCase().includes(q) ||
        (job.jobCode && job.jobCode.toLowerCase().includes(q)) ||
        (job.clientName && job.clientName.toLowerCase().includes(q)) ||
        (job.handledBy && job.handledBy.toLowerCase().includes(q)) ||
        (job.description && job.description.toLowerCase().includes(q));

      const status = (job.status || "").toUpperCase();
      const matchStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "pending"
          ? status === "PENDING_APPROVAL" || status.includes("PENDING") || status === "DRAFT" || status.includes("REVIEW")
          : statusFilter === "approved"
          ? status === "APPROVED" || status.includes("INVOIC")
          : statusFilter === "rejected"
          ? status === "REJECTED"
          : true;

      return matchSearch && matchStatus;
    });
  }, [jobs, searchTerm, statusFilter]);

  // Counts
  const pendingJobsCount = useMemo(
    () =>
      jobs.filter((j) => {
        if (j.isDeleted) return false;
        const s = (j.status || "").toUpperCase();
        return s === "PENDING_APPROVAL" || s.includes("PENDING") || s === "DRAFT" || s.includes("REVIEW");
      }).length,
    [jobs]
  );

  const approvedJobsCount = useMemo(
    () =>
      jobs.filter((j) => {
        if (j.isDeleted) return false;
        const s = (j.status || "").toUpperCase();
        return s === "APPROVED" || s.includes("INVOIC");
      }).length,
    [jobs]
  );

  const rejectedJobsCount = useMemo(
    () =>
      jobs.filter((j) => {
        if (j.isDeleted) return false;
        const s = (j.status || "").toUpperCase();
        return s === "REJECTED";
      }).length,
    [jobs]
  );

  const totalActiveJobsCount = useMemo(
    () => jobs.filter((j) => !j.isDeleted).length,
    [jobs]
  );

  // Pagination slice
  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / pageSize));
  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredJobs.slice(start, start + pageSize);
  }, [filteredJobs, currentPage, pageSize]);

  // Open Review / Action Modal
  const openJobReview = (job: Job, action: "APPROVE" | "REJECT" | "RESET" | null = null) => {
    setSelectedJob(job);
    setModalAction(action);
    setIsModalOpen(true);
  };

  const handleModalComplete = async () => {
    setIsModalOpen(false);
    setSelectedJob(null);
    setModalAction(null);
    if (refreshJobs) {
      await refreshJobs();
    }
  };

  // Download quotation file
  const handleDownloadJobFile = (job: Job) => {
    const primaryDoc = job.documents && job.documents[0];
    if (primaryDoc?.fileUrl) {
      downloadFileFromUrl(primaryDoc.fileUrl, primaryDoc.fileName);
    } else {
      showToast(
        "No Quotation File Attached",
        `There is no uploaded Excel quotation file stored for Job ${job.jobCode || job.name}.`,
        "info"
      );
    }
  };

  if (!can("approvals", "view")) {
    return (
      <div className="flex flex-col items-center justify-center p-10 bg-white rounded-2xl border border-slate-200 text-center max-w-lg mx-auto mt-8 shadow-xs">
        <div className="h-14 w-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
          You do not have authorization to view or process Job Approvals. Contact your system administrator if access is required.
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
          <h2 className="text-xl font-bold text-slate-900">Job Approvals & Authorization Center</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Review, authorize, or reject pending project quotations. Approved jobs automatically transition to Invoice Management for billing.
          </p>
        </div>

        {/* Quick Pending Badge */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900">
            <Clock className="h-4 w-4 text-amber-600" />
            {pendingJobsCount} Job{pendingJobsCount === 1 ? "" : "s"} Pending Approval
          </span>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Pending Job Approvals</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">{pendingJobsCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Awaiting supervisor review</p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <Clock className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Approved Jobs</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{approvedJobsCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Ready for invoice generation</p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
            <CheckCircle className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Rejected Jobs</p>
            <p className="text-2xl font-bold text-rose-600 mt-1">{rejectedJobsCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Returned with audit reasons</p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
            <XCircle className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Total Project Jobs</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{totalActiveJobsCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">In active ERP database</p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
            <Briefcase className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Filter Toolbar & Search */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Status Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setStatusFilter("pending");
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                statusFilter === "pending"
                  ? "bg-amber-600 text-white font-semibold shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              <span>Pending Approval</span>
              <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-black/15 font-bold">
                {pendingJobsCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setStatusFilter("approved");
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                statusFilter === "approved"
                  ? "bg-emerald-600 text-white font-semibold shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <CheckCircle className="h-3.5 w-3.5" />
              <span>Approved Jobs</span>
              <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-black/15 font-bold">
                {approvedJobsCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setStatusFilter("rejected");
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                statusFilter === "rejected"
                  ? "bg-rose-600 text-white font-semibold shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <XCircle className="h-3.5 w-3.5" />
              <span>Rejected Jobs</span>
              <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-black/15 font-bold">
                {rejectedJobsCount}
              </span>
            </button>

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
              All Jobs ({totalActiveJobsCount})
            </button>
          </div>

          {/* Search Field */}
          <div className="w-full sm:w-72">
            <SearchField
              value={searchTerm}
              isLoading={isLoadingJobs}
              onChange={(val) => {
                setSearchTerm(val);
                setCurrentPage(1);
              }}
              placeholder="Search jobs, clients, code..."
            />
          </div>
        </div>
      </div>

      {/* Main Job Approvals Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        {isLoadingJobs && jobs.length === 0 ? (
          <TableSkeleton rows={6} columns={10} />
        ) : (
          <>
            <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-3.5">Job Info</th>
                <th className="py-3 px-3.5">Client & Handler</th>
                <th className="py-3 px-3.5">Dates</th>
                <th className="py-3 px-3.5 text-right">Production Cost</th>
                <th className="py-3 px-3.5 text-right">Agency Fee</th>
                <th className="py-3 px-3.5 text-right">Tax Amount</th>
                <th className="py-3 px-3.5 text-right">Grand Total</th>
                <th className="py-3 px-3.5 text-center">Excel Sheet</th>
                <th className="py-3 px-3.5">Submitted By</th>
                <th className="py-3 px-3.5 text-center">Status</th>
                <th className="py-3 px-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedJobs.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center">
                      <Briefcase className="h-10 w-10 text-slate-300 stroke-[1.5] mb-2" />
                      <p className="text-sm font-semibold text-slate-600">No Jobs Found</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {searchTerm
                          ? "No jobs match your search criteria."
                          : statusFilter === "pending"
                          ? "There are currently no jobs waiting for approval."
                          : "No jobs match the selected filter."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedJobs.map((job) => {
                  const costSummary = job.costSummary;
                  const prodCost = Number(costSummary?.productionCost ?? job.totalCost ?? 0);
                  const agencyCost =
                    Number(costSummary?.agencyOperationFee || 0) + Number(costSummary?.agencyProductionFee || 0);
                  const taxAmt = Number(costSummary?.taxAmount || 0);
                  const grandTotal = Number(job.grandTotal || costSummary?.grandTotal || job.totalCost || 0);

                  const statusNorm = (job.status || "").toLowerCase();
                  const isJobPending = statusNorm.includes("pending") || statusNorm.includes("review") || statusNorm === "draft";
                  const isJobApproved = statusNorm.includes("approved");
                  const isJobRejected = statusNorm.includes("rejected");
                  const hasInvoice = Boolean(job.invoice);
                  const activeSupplierInvoicesCount = typeof job.supplierInvoiceCount === "number" ? job.supplierInvoiceCount : (job.supplierInvoices || []).filter((i: any) => i.status !== "CANCELLED").length;
                  const activeSupplierInvoicesTotal = typeof job.supplierInvoiceTotal === "number" ? job.supplierInvoiceTotal : (job.supplierInvoices || []).filter((i: any) => i.status !== "CANCELLED").reduce((sum: number, i: any) => sum + Number(i.totalAmount || 0), 0);
                  const isApprovalLocked = isJobApproved && activeSupplierInvoicesCount > 0;

                  return (
                    <tr key={job.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Job Info */}
                      <td className="py-3.5 px-3.5">
                        <div className="font-semibold text-slate-900">{job.name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-[11px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                            {job.jobCode || "NO CODE"}
                          </span>
                          {job.description && (
                            <span
                              className="text-[11px] text-slate-400 truncate max-w-[140px]"
                              title={job.description}
                            >
                              • {job.description}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Client & Handler */}
                      <td className="py-3.5 px-3.5">
                        <div className="font-medium text-slate-800 flex items-center gap-1">
                          <Building2 className="h-3 w-3 text-slate-400" />
                          {job.clientName || "—"}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <User className="h-3 w-3 text-slate-400" />
                          <span>Handled: {job.handledBy || "—"}</span>
                        </div>
                      </td>

                      {/* Dates */}
                      <td className="py-3.5 px-3.5 whitespace-nowrap">
                        <div className="text-slate-700 flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-slate-400" />
                          <span>Job: {job.date || "—"}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Comm: {job.commencingDate || job.date || "—"}
                        </div>
                      </td>

                      {/* Production Cost */}
                      <td className="py-3.5 px-3.5 text-right font-mono font-medium text-slate-700">
                        {formatCurrency(prodCost)}
                      </td>

                      {/* Agency Fee */}
                      <td className="py-3.5 px-3.5 text-right font-mono text-slate-600">
                        {agencyCost > 0 ? formatCurrency(agencyCost) : "—"}
                      </td>

                      {/* Tax Amount */}
                      <td className="py-3.5 px-3.5 text-right font-mono text-slate-600">
                        {taxAmt > 0 ? (
                          <span title={`${costSummary?.taxType || "Tax"} @ ${costSummary?.taxRate || 0}%`}>
                            {formatCurrency(taxAmt)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>

                      {/* Grand Total */}
                      <td className="py-3.5 px-3.5 text-right font-mono font-bold text-slate-900 bg-slate-50/50">
                        {formatCurrency(grandTotal)}
                      </td>

                      {/* Excel File Download */}
                      <td className="py-3.5 px-3.5 text-center">
                        {job.documents && job.documents[0]?.fileUrl ? (
                          <button
                            type="button"
                            onClick={() => handleDownloadJobFile(job)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer"
                            title="Download original Excel quotation"
                          >
                            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                            <span>Excel</span>
                            <Download className="h-3 w-3 text-emerald-500" />
                          </button>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] text-slate-400 select-none"
                            title="No uploaded Excel quotation file attached"
                          >
                            <FileSpreadsheet className="h-3.5 w-3.5 text-slate-300" />
                            <span>—</span>
                          </span>
                        )}
                      </td>

                      {/* Submitted By & Date */}
                      <td className="py-3.5 px-3.5">
                        <div className="font-medium text-slate-700">
                          {job.submittedBy?.name || "System Admin"}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {job.createdAt || "—"}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-3.5 text-center whitespace-nowrap">
                        <StatusBadge status={job.status} />
                        {hasInvoice && (
                          <div className="mt-1">
                            <span className="text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                              Invoiced
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View Details */}
                          <button
                            type="button"
                            onClick={() => openJobReview(job, null)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                            title="View Job Details & Cost Breakdown"
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          {/* Approve Button */}
                          {canApprove && (isJobPending || isJobRejected) && (
                            <button
                              type="button"
                              onClick={() => openJobReview(job, "APPROVE")}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-xs"
                              title="Authorize Job for Billing"
                            >
                              <Check className="h-3.5 w-3.5" />
                              <span>Approve</span>
                            </button>
                          )}

                          {/* Reject Button */}
                          {canReject && (isJobPending || isJobApproved) && !hasInvoice && (
                            <button
                              type="button"
                              onClick={() => openJobReview(job, "REJECT")}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors"
                              title="Reject Job with Mandatory Reason"
                            >
                              <X className="h-3.5 w-3.5" />
                              <span>Reject</span>
                            </button>
                          )}

                          {/* Move Back to Pending Button with Approval Lock */}
                          {canMoveToPending && isJobApproved && isApprovalLocked && (
                            <div className="relative group inline-block">
                              <button
                                type="button"
                                disabled
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-400 bg-slate-100 border border-slate-200 cursor-not-allowed opacity-80"
                                title={`Approval Locked: ${activeSupplierInvoicesCount} active supplier invoice(s) recorded`}
                              >
                                <Lock className="h-3.5 w-3.5 text-amber-600" />
                                <span>Locked</span>
                              </button>
                              <div className="absolute right-0 bottom-full mb-1.5 hidden group-hover:block z-50 w-72 p-2.5 bg-slate-900 text-white text-[11px] rounded-lg shadow-xl border border-slate-700 pointer-events-none">
                                <div className="flex items-center gap-1.5 font-bold text-amber-400">
                                  <Lock className="h-3.5 w-3.5" />
                                  <span>Approval Locked</span>
                                </div>
                                <p className="mt-1 text-slate-300 leading-relaxed">
                                  This Job has <strong>{activeSupplierInvoicesCount}</strong> active Supplier Invoice{activeSupplierInvoicesCount === 1 ? "" : "s"} totaling <strong>{formatCurrency(activeSupplierInvoicesTotal, { showCurrencyPrefix: true })}</strong>.
                                </p>
                                <p className="text-rose-400 font-semibold mt-1">
                                  Cannot be moved back to Pending Approval.
                                </p>
                              </div>
                            </div>
                          )}

                          {canMoveToPending && (isJobApproved || isJobRejected) && !isApprovalLocked && (
                            <button
                              type="button"
                              onClick={() => openJobReview(job, "RESET")}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors shadow-2xs"
                              title="Admin: Move Job Back to Pending Approval"
                            >
                              <RotateCcw className="h-3.5 w-3.5 text-amber-600" />
                              <span>Move to Pending</span>
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

      {/* Job Details & Approval / Rejection Modal */}
      <JobApprovalModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedJob(null);
          setModalAction(null);
        }}
        job={selectedJob}
        onActionComplete={handleModalComplete}
        currentRole={currentRole}
        initialAction={modalAction}
      />
    </div>
  );
}
