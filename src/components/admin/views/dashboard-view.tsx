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
  const formattedTotal = `Rs. ${totalInvoiceValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const recentJobs = jobs.slice(0, 5);
  const recentInvoices = invoices.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Dashboard</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Overview of jobs, suppliers, and invoices.
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          
          
          
        </div>
      </div>

      {/* 4 Clean Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Jobs */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
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
        <div className="bg-white rounded-xl border border-slate-200 p-4">
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
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Invoices</span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <Receipt className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{totalInvoicesCount}</p>
          <p className="text-[11px] text-slate-400 mt-1">Uploaded vouchers</p>
        </div>

        {/* Total Invoice Value */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Invoice Value</span>
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{formattedTotal}</p>
          <p className="text-[11px] text-slate-400 mt-1">Gross invoices total</p>
        </div>
      </div>

      {/* Recent Jobs Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50/50">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Recent Jobs</h3>
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
                  <tr key={job.id} className="hover:bg-slate-50">
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
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
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
            <h3 className="text-sm font-bold text-slate-900">Recent Invoices</h3>
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
                  <tr key={inv.id} className="hover:bg-slate-50">
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
                        <Link href={`/admin/jobs/${job.id}`} className="hover:text-blue-600">
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
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
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
