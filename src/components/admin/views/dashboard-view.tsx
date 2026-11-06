"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  Users,
  Receipt,
  DollarSign,
  Plus,
  ArrowRight,
  Eye,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Upload,
  UserPlus,
  ShieldCheck,
  ShieldAlert,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Layers,
  CheckCheck,
  XCircle,
  FileText,
} from "lucide-react";
import { useAdminData } from "@/context/admin-data-context";
import { StatusBadge } from "@/components/admin/ui/badge";
import { CreateJobModal } from "@/components/admin/modals/create-job-modal";
import { RegisterSupplierModal } from "@/components/admin/modals/register-supplier-modal";
import { BulkInvoiceUploadModal } from "@/components/admin/modals/bulk-invoice-upload-modal";
import { DashboardSkeleton } from "@/components/ui/loading/dashboard-skeleton";
import { formatCurrency } from "@/lib/financial";
import { Job } from "@/types/admin";

export function DashboardView() {
  const router = useRouter();
  const {
    jobs,
    suppliers,
    invoices,
    totalJobsCount,
    totalSuppliersCount,
    totalInvoicesCount,
    totalInvoiceValue,
    getJobTotalInvoiceValue,
    dashboardStats,
    can,
    currentRole,
    isLoadingInitial,
  } = useAdminData();

  // Modals state
  const [isCreateJobOpen, setIsCreateJobOpen] = useState(false);
  const [isRegisterSupplierOpen, setIsRegisterSupplierOpen] = useState(false);
  const [isUploadInvoiceOpen, setIsUploadInvoiceOpen] = useState(false);

  // 10 Key Dashboard Metrics (backed by PostgreSQL aggregation & live jobs)
  const stats = useMemo(() => {
    const totalJobs = dashboardStats?.totalJobs ?? jobs.filter((j) => !j.isDeleted).length;
    const pendingJobsCount =
      dashboardStats?.pendingJobs ??
      jobs.filter((j) => {
        if (j.isDeleted) return false;
        const s = (j.status || "").toUpperCase();
        return s === "PENDING_APPROVAL" || s.includes("PENDING") || s === "DRAFT" || s.includes("REVIEW");
      }).length;
    const approvedJobsCount =
      dashboardStats?.approvedJobs ??
      jobs.filter((j) => {
        if (j.isDeleted) return false;
        const s = (j.status || "").toUpperCase();
        return s === "APPROVED" || s === "ACTIVE" || s.includes("INVOIC");
      }).length;
    const rejectedJobsCount =
      dashboardStats?.rejectedJobs ??
      jobs.filter((j) => {
        if (j.isDeleted) return false;
        return (j.status || "").toUpperCase().includes("REJECT");
      }).length;

    const totalSuppliers = dashboardStats?.totalSuppliers ?? suppliers.filter((s) => !s.isDeleted).length;

    const totalSupplierInvoices =
      dashboardStats?.totalSupplierInvoices ??
      jobs.reduce((sum, j) => sum + (j.supplierInvoiceCount || 0), 0);

    const totalSupplierInvoiceAmount =
      dashboardStats?.totalSupplierInvoiceAmount ??
      jobs.reduce((sum, j) => sum + (Number(j.supplierInvoiceTotal) || 0), 0);

    const jobsWithSupplierInvoices =
      dashboardStats?.jobsWithSupplierInvoices ??
      jobs.filter((j) => !j.isDeleted && (j.supplierInvoiceCount || 0) > 0).length;

    const jobsWithoutSupplierInvoices =
      dashboardStats?.jobsWithoutSupplierInvoices ??
      Math.max(0, totalJobs - jobsWithSupplierInvoices);

    const totalActualJobCosts =
      dashboardStats?.totalActualJobCosts ?? totalSupplierInvoiceAmount;

    const totalApprovedJobValue =
      dashboardStats?.totalApprovedJobValue ??
      jobs
        .filter((j) => {
          if (j.isDeleted) return false;
          const s = (j.status || "").toUpperCase();
          return s === "APPROVED" || s === "ACTIVE" || s.includes("INVOIC");
        })
        .reduce((sum, j) => sum + Number(j.grandTotal || j.totalCost || 0), 0);

    const totalRecordedGrossProfit =
      dashboardStats?.totalRecordedGrossProfit ?? (totalApprovedJobValue - totalActualJobCosts);

    const profitMargin =
      totalApprovedJobValue > 0
        ? Number(((totalRecordedGrossProfit / totalApprovedJobValue) * 100).toFixed(1))
        : 0;

    return {
      totalJobs,
      pendingJobsCount,
      approvedJobsCount,
      rejectedJobsCount,
      totalSuppliers,
      totalSupplierInvoices,
      totalSupplierInvoiceAmount,
      jobsWithSupplierInvoices,
      jobsWithoutSupplierInvoices,
      totalActualJobCosts,
      totalApprovedJobValue,
      totalRecordedGrossProfit,
      profitMargin,
    };
  }, [dashboardStats, jobs, suppliers]);

  // Pending Job Approvals list
  const pendingJobs = useMemo(() => {
    return jobs.filter((j) => {
      if (j.isDeleted) return false;
      const s = (j.status || "").toUpperCase();
      return s === "PENDING_APPROVAL" || s.includes("PENDING") || s === "DRAFT" || s.includes("REVIEW");
    });
  }, [jobs]);
  const pendingApprovalsCount = stats.pendingJobsCount;

  const recentJobs = useMemo(() => jobs.filter((j) => !j.isDeleted).slice(0, 5), [jobs]);

  // Recent Supplier Invoices (flattened from jobs)
  const recentSupplierInvoices = useMemo(() => {
    const list: any[] = [];
    jobs.forEach((j) => {
      (j.supplierInvoices || []).forEach((inv) => {
        list.push({
          ...inv,
          jobId: j.id,
          jobName: j.name,
          jobCode: j.jobCode,
        });
      });
    });
    list.sort((a, b) => new Date(b.createdAt || b.invoiceDate).getTime() - new Date(a.createdAt || a.invoiceDate).getTime());
    return list.slice(0, 5);
  }, [jobs]);

  if (isLoadingInitial) {
    return <DashboardSkeleton cardCount={4} />;
  }

  if (!can("dashboard", "view")) {
    return (
      <div className="flex flex-col items-center justify-center p-10 bg-white rounded-2xl border border-slate-200 text-center max-w-lg mx-auto mt-8 shadow-xs">
        <div className="h-14 w-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
          You do not have authorization to view the Executive Dashboard.
        </p>
        <div className="mt-4 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
          Active Role: <span className="font-bold text-blue-600 capitalize">{currentRole}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Professional Page Heading & Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-5 rounded-2xl bg-white border border-slate-200">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Dashboard Overview
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Online
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-200 capitalize">
              Role: {currentRole}
            </span>
            {dashboardStats?.visibilityScope && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200">
                Scope:{" "}
                <strong className="text-slate-800">
                  {dashboardStats.visibilityScope === "own"
                    ? "Own Records Only"
                    : dashboardStats.visibilityScope === "team"
                    ? "Team & Subordinates"
                    : "All Company Records"}
                </strong>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Reflect Total Solutions ERP • Real-time project schedules, supplier invoices, and authorized metrics.
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {can("jobs", "create") && (
            <button
              type="button"
              onClick={() => setIsCreateJobOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#1d4ed8] transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create Job</span>
            </button>
          )}

          {can("suppliers", "create") && (
            <button
              type="button"
              onClick={() => setIsRegisterSupplierOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <UserPlus className="h-3.5 w-3.5 text-slate-500" />
              <span>New Supplier</span>
            </button>
          )}

          {can("invoices", "create") && (
            <button
              type="button"
              onClick={() => setIsUploadInvoiceOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Upload className="h-3.5 w-3.5 text-slate-500" />
              <span>Upload Invoices</span>
            </button>
          )}
        </div>
      </div>

      {/* 5 Primary Executive Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Jobs */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 transition-all hover:border-slate-300">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Jobs</span>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <Briefcase className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{stats.totalJobs}</p>
          <p className="text-[11px] text-slate-400 mt-1">
            {stats.approvedJobsCount} Approved • {stats.pendingJobsCount} Pending
          </p>
        </div>

        {/* Total Supplier Invoices */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 transition-all hover:border-slate-300">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Supplier Invoices</span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <Receipt className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{stats.totalSupplierInvoices}</p>
          <p className="text-[11px] text-slate-400 mt-1">Active recorded bills</p>
        </div>

        {/* Total Supplier Invoice Amount */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 transition-all hover:border-slate-300">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Invoice Cost</span>
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <p
            className="text-xl font-bold text-slate-900 mt-2 truncate"
            title={formatCurrency(stats.totalSupplierInvoiceAmount, { showCurrencyPrefix: true })}
          >
            {formatCurrency(stats.totalSupplierInvoiceAmount, { showCurrencyPrefix: true })}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Actual supplier costs</p>
        </div>

        {/* Recorded Gross Profit */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 transition-all hover:border-slate-300">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Gross Profit</span>
            <div className={`p-2 rounded-lg ${stats.totalRecordedGrossProfit >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <p
            className={`text-xl font-bold mt-2 truncate ${
              stats.totalRecordedGrossProfit >= 0 ? "text-emerald-600" : "text-rose-600"
            }`}
            title={formatCurrency(stats.totalRecordedGrossProfit, { showCurrencyPrefix: true })}
          >
            {formatCurrency(stats.totalRecordedGrossProfit, { showCurrencyPrefix: true })}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            {stats.profitMargin}% gross margin
          </p>
        </div>

        {/* Total Suppliers */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 transition-all hover:border-slate-300">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Suppliers</span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{stats.totalSuppliers}</p>
          <p className="text-[11px] text-slate-400 mt-1">Active vendor partners</p>
        </div>
      </div>

      {/* Synchronized Operational & Financial Status Panel (Section 4) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Pending Jobs */}
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-medium">
            <span>Pending Jobs</span>
            <Clock className="h-3.5 w-3.5 text-amber-500" />
          </div>
          <div className="flex items-baseline justify-between mt-1.5">
            <span className="text-lg font-bold text-amber-600">{stats.pendingJobsCount}</span>
            <Link href="/admin/approvals" className="text-[10px] font-semibold text-blue-600 hover:underline">
              Review →
            </Link>
          </div>
        </div>

        {/* Approved Jobs */}
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-medium">
            <span>Approved Jobs</span>
            <CheckCheck className="h-3.5 w-3.5 text-emerald-600" />
          </div>
          <div className="flex items-baseline justify-between mt-1.5">
            <span className="text-lg font-bold text-slate-900">{stats.approvedJobsCount}</span>
            <span className="text-[10px] text-slate-400">Authorized</span>
          </div>
        </div>

        {/* Rejected Jobs */}
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-medium">
            <span>Rejected Jobs</span>
            <XCircle className="h-3.5 w-3.5 text-rose-500" />
          </div>
          <div className="flex items-baseline justify-between mt-1.5">
            <span className="text-lg font-bold text-slate-900">{stats.rejectedJobsCount}</span>
            <span className="text-[10px] text-slate-400">Declined</span>
          </div>
        </div>

        {/* Jobs With Supplier Invoices */}
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-medium">
            <span>With Invoices</span>
            <Receipt className="h-3.5 w-3.5 text-blue-600" />
          </div>
          <div className="flex items-baseline justify-between mt-1.5">
            <span className="text-lg font-bold text-slate-900">{stats.jobsWithSupplierInvoices}</span>
            <span className="text-[10px] text-slate-400">
              {stats.totalJobs > 0 ? `${Math.round((stats.jobsWithSupplierInvoices / stats.totalJobs) * 100)}%` : "0%"}
            </span>
          </div>
        </div>

        {/* Jobs Without Supplier Invoices */}
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-medium">
            <span>Without Invoices</span>
            <Layers className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <div className="flex items-baseline justify-between mt-1.5">
            <span className="text-lg font-bold text-slate-900">{stats.jobsWithoutSupplierInvoices}</span>
            <span className="text-[10px] text-slate-400">Pending Bills</span>
          </div>
        </div>

        {/* Total Actual Job Costs */}
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-medium">
            <span>Total Actual Cost</span>
            <DollarSign className="h-3.5 w-3.5 text-indigo-600" />
          </div>
          <div className="flex items-baseline justify-between mt-1.5">
            <span
              className="text-sm font-bold text-slate-900 truncate"
              title={formatCurrency(stats.totalActualJobCosts, { showCurrencyPrefix: true })}
            >
              {formatCurrency(stats.totalActualJobCosts, { showCurrencyPrefix: true })}
            </span>
          </div>
        </div>
      </div>

      {/* Middle Row: Pending Tasks & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pending Tasks & Attention Required */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-bold text-slate-900">
                Pending Tasks & Attention Required
              </h2>
            </div>
            <Link
              href="/admin/approvals"
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <span>View All Approvals</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="p-4 divide-y divide-slate-100">
            {pendingJobs.length === 0 ? (
              <div className="py-8 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
                <p className="text-xs font-medium text-slate-700 mt-2">
                  All approvals are up to date!
                </p>
                <p className="text-[11px] text-slate-400">
                  No project jobs currently require authorization.
                </p>
              </div>
            ) : (
              pendingJobs.slice(0, 4).map((job: Job) => (
                <div
                  key={job.id}
                  className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {job.name}
                      </span>
                      <span className="inline-flex rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                        Pending Approval
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Code: {job.jobCode || "NO CODE"} • Client: {job.clientName || "Valued Client"} • Handled By: {job.handledBy || "Admin"}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-bold text-slate-900 font-mono">
                      {formatCurrency(job.grandTotal || job.totalCost || 0, { showCurrencyPrefix: true })}
                    </span>
                    <Link
                      href="/admin/approvals"
                      className="px-2.5 py-1 text-xs font-semibold rounded bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                    >
                      Review
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Activity Timeline */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Recent Activity</h2>
            <Link
              href="/admin/audit-controller"
              className="text-[11px] font-semibold text-blue-600 hover:underline"
            >
              Audit Log
            </Link>
          </div>

          <div className="p-4 space-y-3.5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <Receipt className="h-3 w-3" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-800">
                  Invoice <span className="font-semibold text-slate-900">{recentSupplierInvoices[0]?.invoiceNumber || "INV-001"}</span> recorded
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">10 minutes ago • Finance Dept</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <Briefcase className="h-3 w-3" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-800">
                  Job <span className="font-semibold text-slate-900">{recentJobs[0]?.name || "Phase 1"}</span> updated
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">1 hour ago • Operations</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                <ShieldCheck className="h-3 w-3" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-800">
                  Compliance verification passed
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">3 hours ago • Audit System</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                <Users className="h-3 w-3" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-800">
                  Vendor <span className="font-semibold text-slate-900">{suppliers[0]?.name || "Apex"}</span> verified
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Yesterday • Procurement</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Jobs Table */}
      {can("jobs", "view") && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50/50">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Recent Jobs</h2>
              <p className="text-[11px] text-slate-500">Latest active jobs in the system</p>
            </div>
            <Link
              href="/admin/jobs"
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <span>View All Jobs</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">Job Name</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-center">Suppliers</th>
                  <th className="px-4 py-3 text-right">Invoice Value</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentJobs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-xs text-slate-400">
                      No jobs created yet. Click &quot;Create Job&quot; above to initialize a project schedule.
                    </td>
                  </tr>
                ) : (
                  recentJobs.map((job) => {
                  const val = typeof job.supplierInvoiceTotal === "number" ? job.supplierInvoiceTotal : getJobTotalInvoiceValue(job.id);
                  return (
                    <tr key={job.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3">
                        <Link
                          href={`/admin/jobs/${job.id}`}
                          className="font-semibold text-slate-900 hover:text-blue-600"
                        >
                          {job.name}
                        </Link>
                        {job.jobCode && (
                          <span className="text-[10px] font-mono text-blue-600 ml-1.5 font-medium">
                            {job.jobCode}
                          </span>
                        )}
                        {job.description && (
                          <p className="text-[11px] text-slate-400 truncate max-w-sm mt-0.5">
                            {job.description}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {job.date}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-700 font-medium">
                        {job.supplierIds.length}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">
                        {formatCurrency(val, { showCurrencyPrefix: true })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/admin/jobs/${job.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Details</span>
                        </Link>
                      </td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Invoices Table */}
      {can("invoices", "view") && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50/50">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Recent Supplier Invoices</h2>
              <p className="text-[11px] text-slate-500">Latest recorded supplier vouchers</p>
            </div>
            <Link
              href="/admin/invoices"
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <span>View All Invoices</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">Invoice Ref</th>
                  <th className="px-4 py-3">Job</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-5 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentSupplierInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-xs text-slate-400">
                      No supplier invoices recorded yet. Click &quot;Upload Invoices&quot; or visit the Invoices section to record your first supplier bill.
                    </td>
                  </tr>
                ) : (
                  recentSupplierInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3">
                        <span className="font-semibold text-slate-900 block font-mono">
                          {inv.invoiceNumber}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {inv.attachmentsCount || (inv.attachments || []).length} attachment(s)
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {inv.jobId ? (
                          <Link href={`/admin/jobs/${inv.jobId}`} className="hover:text-blue-600 font-medium">
                            {inv.jobName}
                          </Link>
                        ) : (
                          "—"
                        )}
                        {inv.jobCode && (
                          <span className="text-[10px] text-slate-400 block font-mono">
                            {inv.jobCode}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700 font-medium">
                        {inv.supplierName || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {inv.invoiceDate || "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">
                        {formatCurrency(inv.totalAmount || 0, { showCurrencyPrefix: true })}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <StatusBadge status={inv.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Employee Breakdown Table (Supervisor & Admin) */}
      {dashboardStats?.employeeStats && dashboardStats.employeeStats.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50/50">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Team & Employee Ownership Breakdown</h2>
              <p className="text-[11px] text-slate-500">
                Summary of jobs and supplier invoices created by employees within your authorized scope
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
              {dashboardStats.employeeStats.length} user(s)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3 text-center">Jobs Created</th>
                  <th className="px-4 py-3 text-center">Invoices Recorded</th>
                  <th className="px-5 py-3 text-right">Invoiced Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dashboardStats.employeeStats.map((emp) => (
                  <tr key={emp.userId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3 font-semibold text-slate-900">
                      {emp.name}
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono">
                      {emp.email}
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-blue-600">
                      {emp.jobCount}
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-slate-700">
                      {emp.invoiceCount}
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-semibold text-slate-900">
                      {dashboardStats.canViewFinancials !== false
                        ? formatCurrency(emp.totalInvoiceAmount, { showCurrencyPrefix: true })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      <CreateJobModal
        isOpen={isCreateJobOpen}
        onClose={() => setIsCreateJobOpen(false)}
        onJobCreated={(id) => router.push(`/admin/jobs/${id}`)}
      />

      <RegisterSupplierModal
        isOpen={isRegisterSupplierOpen}
        onClose={() => setIsRegisterSupplierOpen(false)}
      />

      <BulkInvoiceUploadModal
        isOpen={isUploadInvoiceOpen}
        onClose={() => setIsUploadInvoiceOpen(false)}
      />
    </div>
  );
}
