"use client";

import React, { useState } from "react";
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
  CheckCircle,
} from "lucide-react";
import { useAdminData } from "@/context/admin-data-context";
import { StatusBadge } from "@/components/admin/ui/badge";
import { CreateJobModal } from "@/components/admin/modals/create-job-modal";
import { RegisterSupplierModal } from "@/components/admin/modals/register-supplier-modal";
import { BulkInvoiceUploadModal } from "@/components/admin/modals/bulk-invoice-upload-modal";

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
  } = useAdminData();

  // Modals state
  const [isCreateJobOpen, setIsCreateJobOpen] = useState(false);
  const [isRegisterSupplierOpen, setIsRegisterSupplierOpen] = useState(false);
  const [isUploadInvoiceOpen, setIsUploadInvoiceOpen] = useState(false);

  // Formatted currency (Rs.)
  const formattedTotal = `Rs. ${totalInvoiceValue.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  // Pending Approvals calculation
  const pendingInvoices = invoices.filter(
    (i) => i.status === "Pending" || i.status === "Under Review"
  );
  const pendingJobs = jobs.filter(
    (j) => j.status === "Pending" || j.status === "In Review"
  );
  const pendingApprovalsCount = pendingInvoices.length + pendingJobs.length;

  const recentJobs = jobs.slice(0, 5);
  const recentInvoices = invoices.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Professional Page Heading & Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-5 rounded-2xl bg-white border border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Welcome back, Administrator
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Online
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Reflect Total Solutions ERP • Overview of business operations, project schedules, and financial authorizations.
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCreateJobOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#1d4ed8] transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Create Job</span>
          </button>

          <button
            type="button"
            onClick={() => setIsRegisterSupplierOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <UserPlus className="h-3.5 w-3.5 text-slate-500" />
            <span>New Supplier</span>
          </button>

          <button
            type="button"
            onClick={() => setIsUploadInvoiceOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Upload className="h-3.5 w-3.5 text-slate-500" />
            <span>Upload Invoices</span>
          </button>
        </div>
      </div>

      {/* 5 Clean Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Jobs */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 transition-all hover:border-slate-300">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Jobs</span>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <Briefcase className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{totalJobsCount}</p>
          <p className="text-[11px] text-slate-400 mt-1">Active business projects</p>
        </div>

        {/* Total Suppliers */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 transition-all hover:border-slate-300">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Suppliers</span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{totalSuppliersCount}</p>
          <p className="text-[11px] text-slate-400 mt-1">Registered vendors</p>
        </div>

        {/* Total Invoices */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 transition-all hover:border-slate-300">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Invoices</span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <Receipt className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{totalInvoicesCount}</p>
          <p className="text-[11px] text-slate-400 mt-1">Recorded vouchers</p>
        </div>

        {/* Pending Approvals (Required) */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 transition-all hover:border-slate-300">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Pending Approvals</span>
            <div className="p-2 rounded-lg bg-rose-50 text-rose-600">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-rose-600 mt-2">{pendingApprovalsCount}</p>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[11px] text-slate-400">Needs review</span>
            <Link
              href="/admin/approvals"
              className="text-[11px] font-semibold text-blue-600 hover:underline"
            >
              Review →
            </Link>
          </div>
        </div>

        {/* Total Invoice Value */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 transition-all hover:border-slate-300 sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Gross Value</span>
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <p className="text-xl font-bold text-slate-900 mt-2 truncate" title={formattedTotal}>
            {formattedTotal}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Total invoiced costs</p>
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
            {pendingInvoices.length === 0 && pendingJobs.length === 0 ? (
              <div className="py-8 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
                <p className="text-xs font-medium text-slate-700 mt-2">
                  All tasks are up to date!
                </p>
                <p className="text-[11px] text-slate-400">
                  No invoices or jobs currently require authorization.
                </p>
              </div>
            ) : (
              <>
                {pendingInvoices.slice(0, 3).map((inv) => {
                  const job = jobs.find((j) => j.id === inv.jobId);
                  const supplier = suppliers.find((s) => s.id === inv.supplierId);
                  return (
                    <div
                      key={inv.id}
                      className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {inv.invoiceName}
                          </span>
                          <span className="inline-flex rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                            Invoice Approval
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Job: {job?.name || "General"} • Supplier: {supplier?.name || "Vendor"}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs font-bold text-slate-900">
                          Rs. {inv.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                        <Link
                          href="/admin/approvals"
                          className="px-2.5 py-1 text-xs font-semibold rounded bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                        >
                          Review
                        </Link>
                      </div>
                    </div>
                  );
                })}

                {pendingJobs.slice(0, 2).map((job) => (
                  <div
                    key={job.id}
                    className="py-3 last:pb-0 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 truncate">
                          {job.name}
                        </span>
                        <span className="inline-flex rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 border border-blue-200">
                          Job Review
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Created on {job.date} • {job.supplierIds.length} suppliers assigned
                      </p>
                    </div>

                    <Link
                      href={`/admin/jobs/${job.id}`}
                      className="px-2.5 py-1 text-xs font-semibold rounded bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors shrink-0"
                    >
                      View Job
                    </Link>
                  </div>
                ))}
              </>
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
                  Invoice <span className="font-semibold text-slate-900">{recentInvoices[0]?.invoiceName || "INV-001"}</span> recorded
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
              {recentJobs.map((job) => {
                const val = getJobTotalInvoiceValue(job.id);
                return (
                  <tr key={job.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/jobs/${job.id}`}
                        className="font-semibold text-slate-900 hover:text-blue-600"
                      >
                        {job.name}
                      </Link>
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
                      Rs. {val.toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Invoices Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50/50">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Recent Invoices</h2>
            <p className="text-[11px] text-slate-500">Latest uploaded supplier invoices</p>
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
                <th className="px-5 py-3">Invoice Name</th>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-5 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentInvoices.map((inv) => {
                const job = jobs.find((j) => j.id === inv.jobId);
                const supplier = suppliers.find((s) => s.id === inv.supplierId);

                return (
                  <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3">
                      <span className="font-semibold text-slate-900 block">
                        {inv.invoiceName}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {inv.fileName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {job ? (
                        <Link href={`/admin/jobs/${job.id}`} className="hover:text-blue-600 font-medium">
                          {job.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700 font-medium">
                      {supplier ? supplier.name : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {inv.invoiceDate}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">
                      Rs. {inv.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <StatusBadge status={inv.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

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
