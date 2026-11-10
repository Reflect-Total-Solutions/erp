"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle,
  Clock,
  XCircle,
  Briefcase,
  Building2,
  Calendar,
  Check,
  X,
  Eye,
  FileSpreadsheet,
  Download,
  ShieldAlert,
  RotateCcw,
  User,
  Lock,
  ShoppingCart,
  Send,
  AlertTriangle,
  ExternalLink,
  Loader2,
  Ban,
} from "lucide-react";
import { useAdminData } from "@/context/admin-data-context";
import { StatusBadge } from "@/components/admin/ui/badge";
import { Pagination } from "@/components/admin/ui/pagination";
import { SearchField } from "@/components/admin/ui/search-field";
import { Modal } from "@/components/admin/ui/modal";
import { TableSkeleton } from "@/components/ui/loading/table-skeleton";
import { JobApprovalModal } from "@/components/admin/modals/job-approval-modal";
import { PoDocumentPreview } from "@/components/admin/purchase-orders/po-document-preview";
import {
  Department,
  Job,
  PurchaseOrder,
  PurchaseOrderSettings,
} from "@/types/admin";
import { downloadFileFromUrl } from "@/lib/export-utils";
import { formatCurrency } from "@/lib/financial";

export function ApprovalsView() {
  const {
    jobs,
    isLoadingJobs,
    showToast,
    refreshJobs,
    can,
    currentRole,
    currentUserId,
    activeUserId,
  } = useAdminData();

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const urlTab = searchParams.get("tab");

  // Module permissions
  const canViewJobApprovals = can("approvals", "view");
  const canApproveJobs = can("approvals", "approve");
  const canRejectJobs = can("approvals", "reject");
  const canMoveJobsToPending = can("approvals", "moveToPending");

  const canReadPoList = can("purchaseOrders", "view");
  const canApprovePos = can("purchaseOrders", "approve");
  const canRejectPos = can("purchaseOrders", "reject");
  const canIssuePos = can("purchaseOrders", "issue");
  const canEditPos = can("purchaseOrders", "edit");
  const canViewPoFinancials = can("purchaseOrders", "viewFinancials");
  const canPrintPo = can("purchaseOrders", "print");
  const canDownloadPoExcel =
    can("purchaseOrders", "downloadExcel") || can("purchaseOrders", "download");
  const canViewPoTab = canReadPoList || canApprovePos || canRejectPos;

  const [tabOverride, setTabOverride] = useState<{
    urlTab: string | null;
    tab: "jobs" | "purchase-orders";
  } | null>(null);

  const moduleTab: "jobs" | "purchase-orders" = useMemo(() => {
    if (tabOverride && tabOverride.urlTab === urlTab) {
      if (tabOverride.tab === "purchase-orders" && canViewPoTab) return "purchase-orders";
      if (tabOverride.tab === "jobs" && canViewJobApprovals) return "jobs";
    }
    if (urlTab === "purchase-orders" && canViewPoTab) return "purchase-orders";
    if (urlTab === "jobs" && canViewJobApprovals) return "jobs";
    if (!urlTab && canViewJobApprovals) return "jobs";
    if (!canViewJobApprovals && canViewPoTab) return "purchase-orders";
    return "jobs";
  }, [tabOverride, urlTab, canViewPoTab, canViewJobApprovals]);

  const handleSwitchModuleTab = (next: "jobs" | "purchase-orders") => {
    setTabOverride({ urlTab, tab: next });
    if (next === "purchase-orders") {
      router.replace(`${pathname}?tab=purchase-orders`, { scroll: false });
    } else {
      router.replace(pathname, { scroll: false });
    }
  };

  // ─── Job Quotation Approval State ────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<
    "pending" | "approved" | "rejected" | "all"
  >("pending");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [modalAction, setModalAction] = useState<
    "APPROVE" | "REJECT" | "RESET" | null
  >(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // ─── Purchase Order Approval State ───────────────────────────────────────────
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [poSettings, setPoSettings] = useState<PurchaseOrderSettings | null>(
    null
  );
  const [poDepartments, setPoDepartments] = useState<Department[]>([]);
  const [isLoadingPos, setIsLoadingPos] = useState(false);
  const [poFetchError, setPoFetchError] = useState("");
  const [poStatusFilter, setPoStatusFilter] = useState<
    "pending" | "approved" | "rejected" | "all"
  >("pending");
  const [poSearchTerm, setPoSearchTerm] = useState("");
  const [poCurrentPage, setPoCurrentPage] = useState(1);
  const [poPageSize, setPoPageSize] = useState(10);

  // PO Action & Preview Modals
  const [previewPo, setPreviewPo] = useState<PurchaseOrder | null>(null);
  const [isLoadingPreviewPo, setIsLoadingPreviewPo] = useState(false);
  const [rejectPoTarget, setRejectPoTarget] = useState<PurchaseOrder | null>(
    null
  );
  const [rejectPoReason, setRejectPoReason] = useState("");
  const [rejectPoNotes, setRejectPoNotes] = useState("");
  const [isProcessingPoAction, setIsProcessingPoAction] = useState(false);

  const fetchPurchaseOrders = useCallback(async () => {
    if (!canReadPoList) {
      setPurchaseOrders([]);
      return;
    }
    setIsLoadingPos(true);
    setPoFetchError("");
    try {
      const [poRes, settingsRes] = await Promise.all([
        fetch("/api/purchase-orders?trash=false&limit=200"),
        fetch("/api/purchase-orders/settings"),
      ]);
      const poJson = await poRes.json();
      if (!poRes.ok || !poJson.success) {
        throw new Error(poJson?.error || "Failed to load Purchase Orders.");
      }
      setPurchaseOrders(Array.isArray(poJson.data) ? poJson.data : []);

      const settingsJson = await settingsRes.json().catch(() => null);
      if (settingsJson?.success && settingsJson.data) {
        setPoSettings(settingsJson.data.settings || null);
        setPoDepartments(
          Array.isArray(settingsJson.data.departments)
            ? settingsJson.data.departments
            : []
        );
      }
    } catch (err: any) {
      setPoFetchError(
        err?.message || "Unable to fetch Purchase Orders for approval."
      );
    } finally {
      setIsLoadingPos(false);
    }
  }, [canReadPoList]);

  useEffect(() => {
    if (!canReadPoList) return;
    const timer = setTimeout(() => {
      void fetchPurchaseOrders();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchPurchaseOrders, canReadPoList]);

  // ─── Job Computed Lists & Counts ─────────────────────────────────────────────
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
          ? status === "PENDING_APPROVAL" ||
            status.includes("PENDING") ||
            status === "DRAFT" ||
            status.includes("REVIEW")
          : statusFilter === "approved"
          ? status === "APPROVED" || status.includes("INVOIC")
          : statusFilter === "rejected"
          ? status === "REJECTED"
          : true;

      return matchSearch && matchStatus;
    });
  }, [jobs, searchTerm, statusFilter]);

  const pendingJobsCount = useMemo(
    () =>
      jobs.filter((j) => {
        if (j.isDeleted) return false;
        const s = (j.status || "").toUpperCase();
        return (
          s === "PENDING_APPROVAL" ||
          s.includes("PENDING") ||
          s === "DRAFT" ||
          s.includes("REVIEW")
        );
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

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / pageSize));
  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredJobs.slice(start, start + pageSize);
  }, [filteredJobs, currentPage, pageSize]);

  // ─── Purchase Order Computed Lists & Counts ──────────────────────────────────
  const pendingPoCount = useMemo(
    () =>
      purchaseOrders.filter(
        (po) => String(po.status || "").toUpperCase() === "PENDING"
      ).length,
    [purchaseOrders]
  );

  const approvedActivePoCount = useMemo(
    () =>
      purchaseOrders.filter((po) =>
        ["APPROVED", "ISSUED"].includes(
          String(po.status || "").toUpperCase()
        )
      ).length,
    [purchaseOrders]
  );

  const rejectedPoCount = useMemo(
    () =>
      purchaseOrders.filter(
        (po) => String(po.status || "").toUpperCase() === "REJECTED"
      ).length,
    [purchaseOrders]
  );

  const totalPoCommittedValue = useMemo(
    () =>
      purchaseOrders
        .filter((po) =>
          [
            "PENDING",
            "APPROVED",
            "ISSUED",
          ].includes(String(po.status || "").toUpperCase())
        )
        .reduce((sum, po) => sum + Number(po.grandTotal || 0), 0),
    [purchaseOrders]
  );

  const filteredPos = useMemo(() => {
    const q = poSearchTerm.trim().toLowerCase();
    return purchaseOrders.filter((po) => {
      const s = String(po.status || "").toUpperCase();
      const matchStatus =
        poStatusFilter === "all"
          ? true
          : poStatusFilter === "pending"
          ? s === "PENDING"
          : poStatusFilter === "approved"
          ? [
              "APPROVED",
              "ISSUED",
            ].includes(s)
          : poStatusFilter === "rejected"
          ? s === "REJECTED"
          : true;

      if (!matchStatus) return false;
      if (!q) return true;
      return (
        po.poNumber.toLowerCase().includes(q) ||
        (po.jobCode && po.jobCode.toLowerCase().includes(q)) ||
        (po.jobName && po.jobName.toLowerCase().includes(q)) ||
        (po.supplierName && po.supplierName.toLowerCase().includes(q)) ||
        (po.quotationRef && po.quotationRef.toLowerCase().includes(q)) ||
        (po.createdByName && po.createdByName.toLowerCase().includes(q))
      );
    });
  }, [purchaseOrders, poStatusFilter, poSearchTerm]);

  const poTotalPages = Math.max(
    1,
    Math.ceil(filteredPos.length / poPageSize)
  );
  const paginatedPos = useMemo(() => {
    const start = (poCurrentPage - 1) * poPageSize;
    return filteredPos.slice(start, start + poPageSize);
  }, [filteredPos, poCurrentPage, poPageSize]);

  // ─── Handlers ────────────────────────────────────────────────────────────────
  const openJobReview = (
    job: Job,
    action: "APPROVE" | "REJECT" | "RESET" | null = null
  ) => {
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

  const handleDownloadJobFile = (job: Job) => {
    const primaryDoc = job.documents && job.documents[0];
    if (primaryDoc?.fileUrl) {
      downloadFileFromUrl(primaryDoc.fileUrl, primaryDoc.fileName);
    } else {
      showToast(
        "No Quotation File Attached",
        `There is no uploaded Excel quotation file stored for Job ${
          job.jobCode || job.name
        }.`,
        "info"
      );
    }
  };

  const handleOpenPoPreview = async (po: PurchaseOrder) => {
    setPreviewPo(po);
    setIsLoadingPreviewPo(true);
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}`);
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        setPreviewPo(json.data);
      }
    } catch {
      // Keep summary PO if details fetch fails
    } finally {
      setIsLoadingPreviewPo(false);
    }
  };

  const handlePoWorkflowAction = async (
    po: PurchaseOrder,
    action: "APPROVE" | "REJECT" | "ISSUE" | "RETURN_TO_DRAFT",
    reason?: string,
    notes?: string
  ) => {
    setIsProcessingPoAction(true);
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}/approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reason: reason || null,
          notes: notes || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || `Failed to execute ${action}.`);
      }

      showToast(
        "PO Status Updated",
        json.message || `${po.poNumber} updated successfully.`,
        "success"
      );
      setRejectPoTarget(null);
      setRejectPoReason("");
      setRejectPoNotes("");
      if (previewPo?.id === po.id) {
        setPreviewPo(null);
      }
      await fetchPurchaseOrders();
      refreshJobs?.();
    } catch (err: any) {
      showToast(
        "Action Failed",
        err?.message || "Could not process PO approval action.",
        "error"
      );
    } finally {
      setIsProcessingPoAction(false);
    }
  };

  // Strict authorization screen if user cannot view either approval stream
  if (!canViewJobApprovals && !canViewPoTab) {
    return (
      <div className="flex flex-col items-center justify-center p-10 bg-white rounded-2xl border border-slate-200 text-center max-w-lg mx-auto mt-8 shadow-xs">
        <div className="h-14 w-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
          You do not have authorization to view or process Job or Purchase Order
          Approvals. Contact your system administrator if access is required.
        </p>
        <div className="mt-4 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
          Active Role:{" "}
          <span className="font-bold text-blue-600 capitalize">
            {currentRole}
          </span>
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

  const viewerId = activeUserId || currentUserId;

  return (
    <div className="space-y-5" suppressHydrationWarning>
      {/* Unified Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Unified Approvals &amp; Authorization Center
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {moduleTab === "purchase-orders"
              ? "Review, approve, reject, or issue submitted Purchase Orders. Self-approval is enforced via segregation of duties."
              : "Review, authorize, or reject pending project quotations. Approved jobs automatically transition to Invoice Management for billing."}
          </p>
        </div>

        {/* Pending Status Counters */}
        <div className="flex flex-wrap items-center gap-2">
          {canViewJobApprovals && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900">
              <Clock className="h-4 w-4 text-amber-600" />
              {pendingJobsCount} Job{pendingJobsCount === 1 ? "" : "s"} Pending
            </span>
          )}
          {canViewPoTab && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-900">
              <ShoppingCart className="h-4 w-4 text-blue-600" />
              {pendingPoCount} PO{pendingPoCount === 1 ? "" : "s"} Pending
            </span>
          )}
        </div>
      </div>

      {/* Unified Queue Switcher Tabs */}
      {canViewJobApprovals && canViewPoTab && (
        <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
          <button
            type="button"
            onClick={() => handleSwitchModuleTab("jobs")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              moduleTab === "jobs"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Briefcase className="h-3.5 w-3.5 text-blue-600" />
            <span>Job Quotations</span>
            {pendingJobsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                {pendingJobsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleSwitchModuleTab("purchase-orders")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              moduleTab === "purchase-orders"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <ShoppingCart className="h-3.5 w-3.5 text-indigo-600" />
            <span>Purchase Orders</span>
            {pendingPoCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                {pendingPoCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* ==================== TAB A: JOB QUOTATION APPROVALS ==================== */}
      {moduleTab === "jobs" && canViewJobApprovals && (
        <>
          {/* Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Pending Job Approvals
                </p>
                <p className="text-2xl font-bold text-amber-600 mt-1">
                  {pendingJobsCount}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Awaiting supervisor review
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                <Clock className="h-5 w-5" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Approved Jobs
                </p>
                <p className="text-2xl font-bold text-emerald-600 mt-1">
                  {approvedJobsCount}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Ready for invoice &amp; PO creation
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                <CheckCircle className="h-5 w-5" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Rejected Jobs
                </p>
                <p className="text-2xl font-bold text-rose-600 mt-1">
                  {rejectedJobsCount}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Returned with audit reasons
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
                <XCircle className="h-5 w-5" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Total Project Jobs
                </p>
                <p className="text-2xl font-bold text-slate-800 mt-1">
                  {totalActiveJobsCount}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  In active ERP database
                </p>
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
                        <th className="py-3 px-3.5">Client &amp; Handler</th>
                        <th className="py-3 px-3.5">Dates</th>
                        <th className="py-3 px-3.5 text-right">
                          Production Cost
                        </th>
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
                          <td
                            colSpan={11}
                            className="py-12 text-center text-slate-400"
                          >
                            <div className="flex flex-col items-center justify-center">
                              <Briefcase className="h-10 w-10 text-slate-300 stroke-[1.5] mb-2" />
                              <p className="text-sm font-semibold text-slate-600">
                                No Jobs Found
                              </p>
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
                          const prodCost = Number(
                            costSummary?.productionCost ?? job.totalCost ?? 0
                          );
                          const agencyCost =
                            Number(costSummary?.agencyOperationFee || 0) +
                            Number(costSummary?.agencyProductionFee || 0);
                          const taxAmt = Number(costSummary?.taxAmount || 0);
                          const grandTotal = Number(
                            job.grandTotal ||
                              costSummary?.grandTotal ||
                              job.totalCost ||
                              0
                          );

                          const statusNorm = (job.status || "").toLowerCase();
                          const isJobPending =
                            statusNorm.includes("pending") ||
                            statusNorm.includes("review") ||
                            statusNorm === "draft";
                          const isJobApproved = statusNorm.includes("approved");
                          const isJobRejected = statusNorm.includes("rejected");
                          const hasInvoice = Boolean(job.invoice);
                          const activeSupplierInvoicesCount =
                            typeof job.supplierInvoiceCount === "number"
                              ? job.supplierInvoiceCount
                              : (job.supplierInvoices || []).filter(
                                  (i: any) => i.status !== "CANCELLED"
                                ).length;
                          const activeSupplierInvoicesTotal =
                            typeof job.supplierInvoiceTotal === "number"
                              ? job.supplierInvoiceTotal
                              : (job.supplierInvoices || [])
                                  .filter((i: any) => i.status !== "CANCELLED")
                                  .reduce(
                                    (sum: number, i: any) =>
                                      sum + Number(i.totalAmount || 0),
                                    0
                                  );
                          const isApprovalLocked =
                            isJobApproved && activeSupplierInvoicesCount > 0;

                          return (
                            <tr
                              key={job.id}
                              className="hover:bg-slate-50/70 transition-colors"
                            >
                              {/* Job Info */}
                              <td className="py-3.5 px-3.5">
                                <div className="font-semibold text-slate-900">
                                  {job.name}
                                </div>
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
                                {agencyCost > 0
                                  ? formatCurrency(agencyCost)
                                  : "—"}
                              </td>

                              {/* Tax Amount */}
                              <td className="py-3.5 px-3.5 text-right font-mono text-slate-600">
                                {taxAmt > 0 ? (
                                  <span
                                    title={`${
                                      costSummary?.taxType || "Tax"
                                    } @ ${costSummary?.taxRate || 0}%`}
                                  >
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
                                  <button
                                    type="button"
                                    onClick={() => openJobReview(job, null)}
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                                    title="View Job Details & Cost Breakdown"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </button>

                                  {canApproveJobs &&
                                    (isJobPending || isJobRejected) && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          openJobReview(job, "APPROVE")
                                        }
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-xs"
                                        title="Authorize Job for Billing"
                                      >
                                        <Check className="h-3.5 w-3.5" />
                                        <span>Approve</span>
                                      </button>
                                    )}

                                  {canRejectJobs &&
                                    (isJobPending || isJobApproved) &&
                                    !hasInvoice && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          openJobReview(job, "REJECT")
                                        }
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors"
                                        title="Reject Job with Mandatory Reason"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                        <span>Reject</span>
                                      </button>
                                    )}

                                  {canMoveJobsToPending &&
                                    isJobApproved &&
                                    isApprovalLocked && (
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
                                            This Job has{" "}
                                            <strong>
                                              {activeSupplierInvoicesCount}
                                            </strong>{" "}
                                            active Supplier Invoice
                                            {activeSupplierInvoicesCount === 1
                                              ? ""
                                              : "s"}{" "}
                                            totaling{" "}
                                            <strong>
                                              {formatCurrency(
                                                activeSupplierInvoicesTotal,
                                                { showCurrencyPrefix: true }
                                              )}
                                            </strong>
                                            .
                                          </p>
                                          <p className="text-rose-400 font-semibold mt-1">
                                            Cannot be moved back to Pending
                                            Approval.
                                          </p>
                                        </div>
                                      </div>
                                    )}

                                  {canMoveJobsToPending &&
                                    (isJobApproved || isJobRejected) &&
                                    !isApprovalLocked && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          openJobReview(job, "RESET")
                                        }
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
        </>
      )}

      {/* ==================== TAB B: PURCHASE ORDER APPROVALS ==================== */}
      {moduleTab === "purchase-orders" && canViewPoTab && (
        <>
          {!canReadPoList ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-xs text-amber-900 space-y-2">
              <p className="font-bold">Purchase Order Read Permission Required</p>
              <p className="text-amber-800">
                You hold PO action permission, but require{" "}
                <code>purchaseOrders:view</code> to list the Purchase Order
                approval queue. Contact an Administrator in Access Controller.
              </p>
            </div>
          ) : (
            <>
              {/* PO Approval KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      Pending PO Approvals
                    </p>
                    <p className="text-2xl font-bold text-amber-600 mt-1">
                      {pendingPoCount}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Submitted awaiting sign-off
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                    <Clock className="h-5 w-5" />
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      Approved / Active POs
                    </p>
                    <p className="text-2xl font-bold text-emerald-600 mt-1">
                      {approvedActivePoCount}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Approved &amp; Issued
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                    <CheckCircle className="h-5 w-5" />
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      Rejected POs
                    </p>
                    <p className="text-2xl font-bold text-rose-600 mt-1">
                      {rejectedPoCount}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Returned with audit remarks
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
                    <XCircle className="h-5 w-5" />
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      Committed PO Value
                    </p>
                    <p className="text-xl font-bold font-mono text-slate-900 mt-1">
                      {canViewPoFinancials
                        ? formatCurrency(totalPoCommittedValue, {
                            showCurrencyPrefix: true,
                          })
                        : "Restricted"}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Active procurement commitments
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                    <ShoppingCart className="h-5 w-5" />
                  </div>
                </div>
              </div>

              {poFetchError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 flex items-center justify-between">
                  <span>{poFetchError}</span>
                  <button
                    type="button"
                    onClick={fetchPurchaseOrders}
                    className="underline font-semibold cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Filter Toolbar & Search */}
              <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        setPoStatusFilter("pending");
                        setPoCurrentPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                        poStatusFilter === "pending"
                          ? "bg-amber-600 text-white font-semibold shadow-xs"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      <Clock className="h-3.5 w-3.5" />
                      <span>Pending Approval</span>
                      <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-black/15 font-bold">
                        {pendingPoCount}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPoStatusFilter("approved");
                        setPoCurrentPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                        poStatusFilter === "approved"
                          ? "bg-emerald-600 text-white font-semibold shadow-xs"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      <span>Approved &amp; Active</span>
                      <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-black/15 font-bold">
                        {approvedActivePoCount}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPoStatusFilter("rejected");
                        setPoCurrentPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                        poStatusFilter === "rejected"
                          ? "bg-rose-600 text-white font-semibold shadow-xs"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      <span>Rejected POs</span>
                      <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-black/15 font-bold">
                        {rejectedPoCount}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPoStatusFilter("all");
                        setPoCurrentPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        poStatusFilter === "all"
                          ? "bg-slate-900 text-white font-semibold"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      All Active POs ({purchaseOrders.length})
                    </button>
                  </div>

                  <div className="w-full sm:w-72">
                    <SearchField
                      value={poSearchTerm}
                      isLoading={isLoadingPos}
                      onChange={(val) => {
                        setPoSearchTerm(val);
                        setPoCurrentPage(1);
                      }}
                      placeholder="Search PO #, job, supplier..."
                    />
                  </div>
                </div>
              </div>

              {/* PO Approvals Table */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                {isLoadingPos && purchaseOrders.length === 0 ? (
                  <TableSkeleton rows={6} columns={9} />
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                            <th className="py-3 px-3.5">PO Number</th>
                            <th className="py-3 px-3.5">Approved Job</th>
                            <th className="py-3 px-3.5">Supplier</th>
                            <th className="py-3 px-3.5">PO &amp; Exp. Dates</th>
                            <th className="py-3 px-3.5 text-right">
                              Grand Total
                            </th>
                            <th className="py-3 px-3.5">Created By</th>
                            <th className="py-3 px-3.5 text-center">Status</th>
                            <th className="py-3 px-3.5 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {paginatedPos.length === 0 ? (
                            <tr>
                              <td
                                colSpan={8}
                                className="py-12 text-center text-slate-400"
                              >
                                <div className="flex flex-col items-center justify-center">
                                  <ShoppingCart className="h-10 w-10 text-slate-300 stroke-[1.5] mb-2" />
                                  <p className="text-sm font-semibold text-slate-600">
                                    No Purchase Orders Found
                                  </p>
                                  <p className="text-xs text-slate-400 mt-1">
                                    {poSearchTerm
                                      ? "No Purchase Orders match your search criteria."
                                      : poStatusFilter === "pending"
                                      ? "There are currently no Purchase Orders awaiting approval."
                                      : "No Purchase Orders match the selected filter."}
                                  </p>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            paginatedPos.map((po) => {
                              const statusUpper = String(
                                po.status || ""
                              ).toUpperCase();
                              const isSelfCreatedNonAdmin =
                                po.createdById === viewerId &&
                                currentRole !== "admin";
                              const currencyPrefix =
                                po.currency === "LKR"
                                  ? "Rs. "
                                  : `${po.currency || "LKR"} `;
                              const canShowMoney =
                                canViewPoFinancials ||
                                po.createdById === viewerId;

                              return (
                                <tr
                                  key={po.id}
                                  className="hover:bg-slate-50/70 transition-colors"
                                >
                                  {/* PO Number */}
                                  <td className="py-3.5 px-3.5">
                                    <Link
                                      href={`/admin/purchase-orders/${po.id}`}
                                      className="font-mono font-bold text-blue-700 hover:underline flex items-center gap-1"
                                    >
                                      <span>{po.poNumber}</span>
                                      <ExternalLink className="h-3 w-3 opacity-60" />
                                    </Link>
                                    <div className="flex flex-wrap items-center gap-1 mt-1">
                                      {po.quotationRef && (
                                        <span className="text-[10px] font-mono text-slate-500">
                                          Ref: {po.quotationRef}
                                        </span>
                                      )}
                                      {po.budgetOverrideApproved && (
                                        <span
                                          className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200"
                                          title={
                                            po.budgetOverrideReason ||
                                            "Budget override requested"
                                          }
                                        >
                                          Budget Override
                                        </span>
                                      )}
                                    </div>
                                  </td>

                                  {/* Approved Job */}
                                  <td className="py-3.5 px-3.5">
                                    <Link
                                      href={`/admin/jobs/${po.jobId}`}
                                      className="font-semibold text-slate-900 hover:text-blue-700 hover:underline block"
                                    >
                                      {po.jobName || "—"}
                                    </Link>
                                    <span className="font-mono text-[10px] text-slate-500">
                                      {po.jobCode}
                                      {po.clientName ? ` • ${po.clientName}` : ""}
                                    </span>
                                  </td>

                                  {/* Supplier */}
                                  <td className="py-3.5 px-3.5">
                                    <div className="font-medium text-slate-800 flex items-center gap-1">
                                      <Building2 className="h-3 w-3 text-slate-400 shrink-0" />
                                      <span>{po.supplierName || "—"}</span>
                                    </div>
                                    {po.supplierCode && (
                                      <span className="font-mono text-[10px] text-slate-400">
                                        {po.supplierCode}
                                      </span>
                                    )}
                                  </td>

                                  {/* Dates */}
                                  <td className="py-3.5 px-3.5 whitespace-nowrap font-mono text-[11px]">
                                    <div className="text-slate-700">
                                      PO: {po.poDate}
                                    </div>
                                    <div className="text-slate-400 mt-0.5">
                                      Exp: {po.expectedDeliveryDate || "—"}
                                    </div>
                                  </td>

                                  {/* Grand Total */}
                                  <td className="py-3.5 px-3.5 text-right font-mono font-bold text-slate-900 bg-slate-50/50">
                                    {canShowMoney ? (
                                      <>
                                        <div>
                                          {formatCurrency(po.grandTotal, {
                                            showCurrencyPrefix: true,
                                            currencySymbol: currencyPrefix,
                                          })}
                                        </div>
                                        <div className="text-[10px] font-normal text-slate-400">
                                          {po.items?.length || 0} item
                                          {(po.items?.length || 0) === 1
                                            ? ""
                                            : "s"}
                                        </div>
                                      </>
                                    ) : (
                                      <span className="text-slate-400 italic font-normal">
                                        Hidden
                                      </span>
                                    )}
                                  </td>

                                  {/* Created By */}
                                  <td className="py-3.5 px-3.5">
                                    <div className="font-medium text-slate-700">
                                      {po.createdByName || "System Admin"}
                                    </div>
                                    {po.approvedByName && (
                                      <div className="text-[10px] text-emerald-700 mt-0.5">
                                        Appr: {po.approvedByName}
                                      </div>
                                    )}
                                  </td>

                                  {/* Status */}
                                  <td className="py-3.5 px-3.5 text-center whitespace-nowrap">
                                    <StatusBadge status={po.status} />
                                  </td>

                                  {/* Actions */}
                                  <td className="py-3.5 px-3.5 text-right whitespace-nowrap">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenPoPreview(po)}
                                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                                        title="Quick Preview PO Document"
                                      >
                                        <Eye className="h-4 w-4" />
                                      </button>

                                      {canDownloadPoExcel && (
                                        <a
                                          href={`/api/purchase-orders/${po.id}/export/excel`}
                                          className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
                                          title="Download PO Excel Workbook"
                                        >
                                          <FileSpreadsheet className="h-4 w-4" />
                                        </a>
                                      )}

                                      {canApprovePos &&
                                        statusUpper === "PENDING" && (
                                          <button
                                            type="button"
                                            disabled={
                                              isProcessingPoAction ||
                                              isSelfCreatedNonAdmin
                                            }
                                            title={
                                              isSelfCreatedNonAdmin
                                                ? "Segregation of Duties: Non-admin creators cannot approve their own PO"
                                                : "Approve Purchase Order"
                                            }
                                            onClick={() =>
                                              handlePoWorkflowAction(
                                                po,
                                                "APPROVE"
                                              )
                                            }
                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                          >
                                            <Check className="h-3.5 w-3.5" />
                                            <span>Approve</span>
                                          </button>
                                        )}

                                      {canRejectPos &&
                                        statusUpper === "PENDING" && (
                                          <button
                                            type="button"
                                            disabled={
                                              isProcessingPoAction ||
                                              isSelfCreatedNonAdmin
                                            }
                                            title={
                                              isSelfCreatedNonAdmin
                                                ? "Segregation of Duties: Non-admin creators cannot reject their own PO"
                                                : "Reject Purchase Order with Reason"
                                            }
                                            onClick={() =>
                                              setRejectPoTarget(po)
                                            }
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                          >
                                            <X className="h-3.5 w-3.5" />
                                            <span>Reject</span>
                                          </button>
                                        )}

                                      {canIssuePos &&
                                        statusUpper === "APPROVED" && (
                                          <button
                                            type="button"
                                            disabled={isProcessingPoAction}
                                            onClick={() =>
                                              handlePoWorkflowAction(
                                                po,
                                                "ISSUE"
                                              )
                                            }
                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                                            title="Mark Approved PO as Issued to Supplier"
                                          >
                                            <Send className="h-3.5 w-3.5" />
                                            <span>Issue PO</span>
                                          </button>
                                        )}

                                      {canEditPos &&
                                        ["PENDING", "REJECTED"].includes(
                                          statusUpper
                                        ) && (
                                          <button
                                            type="button"
                                            disabled={isProcessingPoAction}
                                            onClick={() =>
                                              handlePoWorkflowAction(
                                                po,
                                                "RETURN_TO_DRAFT"
                                              )
                                            }
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors cursor-pointer"
                                            title="Return PO to Draft for Revision"
                                          >
                                            <RotateCcw className="h-3.5 w-3.5" />
                                            <span>Draft</span>
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
                        currentPage={poCurrentPage}
                        totalPages={poTotalPages}
                        pageSize={poPageSize}
                        totalItems={filteredPos.length}
                        onPageChange={setPoCurrentPage}
                        onPageSizeChange={(size) => {
                          setPoPageSize(size);
                          setPoCurrentPage(1);
                        }}
                      />
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}

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

      {/* Quick Preview PO Modal */}
      {previewPo && (
        <Modal
          isOpen={true}
          onClose={() => setPreviewPo(null)}
          title={`Purchase Order Preview — ${previewPo.poNumber}`}
          maxWidth="4xl"
        >
          <div className="space-y-4">
            {isLoadingPreviewPo ? (
              <div className="py-10 flex items-center justify-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                <span>Loading full PO items &amp; allocations...</span>
              </div>
            ) : (
              <PoDocumentPreview
                po={previewPo}
                settings={poSettings}
                departments={poDepartments}
                canPrint={canPrintPo}
                canDownloadExcel={canDownloadPoExcel}
              />
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200">
              <Link
                href={`/admin/purchase-orders/${previewPo.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-blue-700 hover:bg-blue-50"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Open Full PO Details Page</span>
              </Link>

              <div className="flex items-center gap-2">
                {canApprovePos &&
                  String(previewPo.status || "").toUpperCase() ===
                    "PENDING" && (
                    <button
                      type="button"
                      disabled={
                        isProcessingPoAction ||
                        (previewPo.createdById === viewerId &&
                          currentRole !== "admin")
                      }
                      onClick={() =>
                        handlePoWorkflowAction(previewPo, "APPROVE")
                      }
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 cursor-pointer disabled:opacity-40"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>Approve PO</span>
                    </button>
                  )}

                {canRejectPos &&
                  String(previewPo.status || "").toUpperCase() ===
                    "PENDING" && (
                    <button
                      type="button"
                      disabled={
                        isProcessingPoAction ||
                        (previewPo.createdById === viewerId &&
                          currentRole !== "admin")
                      }
                      onClick={() => setRejectPoTarget(previewPo)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 cursor-pointer disabled:opacity-40"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      <span>Reject PO</span>
                    </button>
                  )}

                {canIssuePos &&
                  String(previewPo.status || "").toUpperCase() ===
                    "APPROVED" && (
                    <button
                      type="button"
                      disabled={isProcessingPoAction}
                      onClick={() => handlePoWorkflowAction(previewPo, "ISSUE")}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 cursor-pointer"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>Mark as Issued</span>
                    </button>
                  )}

                <button
                  type="button"
                  onClick={() => setPreviewPo(null)}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-xs font-semibold text-slate-700 hover:bg-slate-200 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Mandatory PO Rejection Reason Modal */}
      {rejectPoTarget && (
        <Modal
          isOpen={true}
          onClose={() => {
            setRejectPoTarget(null);
            setRejectPoReason("");
            setRejectPoNotes("");
          }}
          title={`Reject Purchase Order — ${rejectPoTarget.poNumber}`}
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-900 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <p>
                Rejecting PO <strong>{rejectPoTarget.poNumber}</strong> will
                release its budget reservations on{" "}
                <strong>{rejectPoTarget.jobCode}</strong> until revised and
                resubmitted.
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Mandatory Rejection Reason{" "}
                <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                value={rejectPoReason}
                onChange={(e) => setRejectPoReason(e.target.value)}
                placeholder="Enter specific reason for rejecting this Purchase Order..."
                className="w-full rounded-lg border border-slate-300 p-2.5 text-xs outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Additional Remarks (Optional)
              </label>
              <input
                type="text"
                value={rejectPoNotes}
                onChange={(e) => setRejectPoNotes(e.target.value)}
                placeholder="Instructions for revision..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setRejectPoTarget(null);
                  setRejectPoReason("");
                  setRejectPoNotes("");
                }}
                className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessingPoAction || !rejectPoReason.trim()}
                onClick={() =>
                  handlePoWorkflowAction(
                    rejectPoTarget,
                    "REJECT",
                    rejectPoReason.trim(),
                    rejectPoNotes.trim()
                  )
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 text-white font-bold hover:bg-rose-700 cursor-pointer disabled:opacity-50"
              >
                {isProcessingPoAction && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                <span>Confirm Reject PO</span>
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
