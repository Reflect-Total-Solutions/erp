"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Calendar,
  Eye,
  Edit2,
  Trash2,
  X,
  AlertCircle,
  Download,
  CheckSquare,
  Square,
  FileSpreadsheet,
} from "lucide-react";
import { useAdminData } from "@/context/admin-data-context";
import { StatusBadge } from "@/components/admin/ui/badge";
import { Modal } from "@/components/admin/ui/modal";
import { CreateJobModal } from "@/components/admin/modals/create-job-modal";
import { Job, JobStatus } from "@/types/admin";
import {
  exportJobsToCsv,
  exportJobDetailedReportToCsv,
  downloadMockExcelFile,
  downloadAllJobExcelFiles,
} from "@/lib/export-utils";

export function JobsView() {
  const router = useRouter();
  const {
    jobs,
    invoices,
    excelFiles,
    suppliers,
    deleteJob,
    updateJob,
    getJobTotalInvoiceValue,
    getJobInvoices,
    getJobSuppliers,
    getJobExcelFiles,
  } = useAdminData();

  // Search and filter
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Bulk Selection
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editJobCode, setEditJobCode] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editRemarks, setEditRemarks] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState<JobStatus>("Active");

  const handleOpenEdit = (job: Job) => {
    setEditingJob(job);
    setEditName(job.name);
    setEditJobCode(job.jobCode || "");
    setEditDate(job.date);
    setEditRemarks(job.remarks || "");
    setEditDescription(job.description || "");
    setEditStatus(job.status);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingJob) return;

    updateJob(editingJob.id, {
      name: editName.trim(),
      jobCode: editJobCode.trim().toUpperCase() || undefined,
      date: editDate,
      remarks: editRemarks.trim() || undefined,
      description: editDescription.trim() || undefined,
      status: editStatus,
    });
    setEditingJob(null);
  };

  const handleConfirmDelete = () => {
    if (deletingJobId) {
      deleteJob(deletingJobId);
      setDeletingJobId(null);
    }
  };

  // Filtered jobs
  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const matchSearch =
        job.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (job.jobCode && job.jobCode.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (job.remarks && job.remarks.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (job.description && job.description.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchDate = !dateFilter || job.date === dateFilter;
      const matchStatus = statusFilter === "all" || job.status === statusFilter;

      return matchSearch && matchDate && matchStatus;
    });
  }, [jobs, searchTerm, dateFilter, statusFilter]);

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Jobs Management</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage your project schedules, assigned suppliers, and invoices.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => exportJobsToCsv(filteredJobs, invoices, excelFiles, "jobs_cost_report")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shrink-0"
            title="Export all filtered jobs with cost breakdown to CSV"
          >
            <Download className="h-4 w-4 text-slate-500" />
            <span>Download Cost Report ({filteredJobs.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1d4ed8] transition-colors shrink-0"
          >
            <Plus className="h-4 w-4" />
            Create New Job
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by job name..."
              className="h-9 w-full rounded-lg border border-slate-200 pl-8 pr-7 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Date Filter */}
          <div className="relative">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
            />
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
            >
              <option value="all">All Statuses</option>
              <option value="Active">Active</option>
              <option value="In Review">In Review</option>
              <option value="Pending">Pending</option>
              <option value="Completed">Completed</option>
            </select>
          </div>

          {/* Reset Filters */}
          <div className="flex items-center justify-between">
            {(searchTerm || dateFilter || statusFilter !== "all") ? (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setDateFilter("");
                  setStatusFilter("all");
                }}
                className="text-xs text-blue-600 hover:underline font-medium"
              >
                Clear Filters
              </button>
            ) : <span />}

            <span className="text-xs text-slate-500">
              Total: <strong>{filteredJobs.length}</strong> jobs
            </span>
          </div>
        </div>
      </div>

      {/* Bulk Selection Bar */}
      {selectedJobIds.length > 0 && (
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-xs text-blue-900 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-blue-600" />
            <span className="font-semibold">
              {selectedJobIds.length} jobs selected
            </span>
            <span className="text-slate-500 text-[11px]">
              (Total combined cost: Rs.{" "}
              {filteredJobs
                .filter((j) => selectedJobIds.includes(j.id))
                .reduce((sum, j) => sum + getJobTotalInvoiceValue(j.id), 0)
                .toLocaleString(undefined, { minimumFractionDigits: 2 })}
              )
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const selectedJobs = jobs.filter((j) => selectedJobIds.includes(j.id));
                exportJobsToCsv(selectedJobs, invoices, excelFiles, "selected_jobs_cost_report");
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3 py-1.5 font-semibold text-white hover:bg-[#1d4ed8] shadow-xs"
            >
              <Download className="h-3.5 w-3.5" />
              Download Selected Jobs ({selectedJobIds.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedJobIds([])}
              className="text-slate-500 hover:text-slate-700 px-2 py-1 text-xs"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      {/* Jobs Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {filteredJobs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No jobs match your search. Click "Create New Job" above to add one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="w-10 px-3 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedJobIds.length === filteredJobs.length) {
                          setSelectedJobIds([]);
                        } else {
                          setSelectedJobIds(filteredJobs.map((j) => j.id));
                        }
                      }}
                      className="text-slate-400 hover:text-blue-600 inline-flex items-center justify-center"
                      title={
                        selectedJobIds.length === filteredJobs.length
                          ? "Deselect All"
                          : "Select All Filtered"
                      }
                    >
                      {selectedJobIds.length === filteredJobs.length &&
                      filteredJobs.length > 0 ? (
                        <CheckSquare className="h-4 w-4 text-blue-600" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  </th>
                  <th className="px-5 py-3">Job Name</th>
                  <th className="px-4 py-3">Job Date</th>
                  <th className="px-4 py-3 text-center">Suppliers</th>
                  <th className="px-4 py-3 text-center">Invoices</th>
                  <th className="px-4 py-3 text-right">Total Invoice Value</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredJobs.map((job) => {
                  const val = getJobTotalInvoiceValue(job.id);
                  const invCount = getJobInvoices(job.id).length;
                  const isSelected = selectedJobIds.includes(job.id);

                  return (
                    <tr
                      key={job.id}
                      className={`hover:bg-slate-50 transition-colors ${
                        isSelected ? "bg-blue-50/40" : ""
                      }`}
                    >
                      <td className="w-10 px-3 py-3.5 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedJobIds((prev) => [...prev, job.id]);
                            } else {
                              setSelectedJobIds((prev) =>
                                prev.filter((id) => id !== job.id)
                              );
                            }
                          }}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>

                      <td className="px-5 py-3.5">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/admin/jobs/${job.id}`}
                              className="font-semibold text-slate-900 hover:text-blue-600"
                            >
                              {job.name}
                            </Link>
                            {job.jobCode && (
                              <span className="text-[10px] font-mono font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 shrink-0">
                                {job.jobCode}
                              </span>
                            )}
                          </div>

                          {job.remarks && (
                            <p className="text-[11px] text-slate-500 italic truncate max-w-xs">
                              {job.remarks}
                            </p>
                          )}

                          {/* Attached Excel Files (Separate downloads) */}
                          {(() => {
                            const jobExcels = getJobExcelFiles(job.id);
                            if (jobExcels.length === 0) return null;
                            return (
                              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                <span className="text-[10px] font-semibold text-slate-500">
                                  Excel Files ({jobExcels.length}):
                                </span>
                                {jobExcels.map((xf) => (
                                  <div
                                    key={xf.id}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[10px] text-emerald-900"
                                  >
                                    <FileSpreadsheet className="h-3 w-3 text-emerald-600 shrink-0" />
                                    <span className="max-w-[110px] truncate" title={xf.customName || xf.fileName}>
                                      {xf.customName || xf.fileName}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => downloadMockExcelFile(xf)}
                                      className="text-emerald-700 hover:text-emerald-900 p-0.5 ml-0.5"
                                      title={`Download ${xf.fileName} separately`}
                                    >
                                      <Download className="h-2.5 w-2.5" />
                                    </button>
                                  </div>
                                ))}

                                {jobExcels.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => downloadAllJobExcelFiles(jobExcels)}
                                    className="text-[10px] text-blue-600 hover:underline font-medium ml-1"
                                    title="Download all Excel files for this job"
                                  >
                                    Download all {jobExcels.length} XL
                                  </button>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap">
                        {job.date}
                      </td>
                      <td className="px-4 py-3.5 text-center font-medium text-slate-700">
                        {job.supplierIds.length}
                      </td>
                      <td className="px-4 py-3.5 text-center font-medium text-slate-700">
                        {invCount}
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold text-slate-900">
                        Rs. {val.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const jInvs = getJobInvoices(job.id);
                              const jSups = getJobSuppliers(job.id);
                              const jExcels = getJobExcelFiles(job.id);
                              exportJobDetailedReportToCsv(job, jInvs, jSups, jExcels);
                            }}
                            className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-slate-100 transition-colors"
                            title="Download Job Cost & Invoices Dossier"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                          <Link
                            href={`/admin/jobs/${job.id}`}
                            className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-slate-100 transition-colors"
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(job)}
                            className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                            title="Edit Job"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingJobId(job.id)}
                            className="p-1 rounded text-slate-500 hover:text-rose-600 hover:bg-slate-100 transition-colors"
                            title="Delete Job"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Job Modal */}
      <CreateJobModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onJobCreated={(id) => router.push(`/admin/jobs/${id}`)}
      />

      {/* Edit Job Modal */}
      {editingJob && (
        <Modal
          isOpen={true}
          onClose={() => setEditingJob(null)}
          title="Edit Job"
          description="Update job details"
          maxWidth="md"
        >
          <form onSubmit={handleSaveEdit} className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Job Name *
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Job Code / Ref
                </label>
                <input
                  type="text"
                  value={editJobCode}
                  onChange={(e) => setEditJobCode(e.target.value)}
                  placeholder="e.g. JOB-2026-001"
                  className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs font-mono uppercase text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Job Date *
                </label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  required
                  className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as JobStatus)}
                  className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                >
                  <option value="Active">Active</option>
                  <option value="In Review">In Review</option>
                  <option value="Pending">Pending</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Remarks / Notes (optional)
              </label>
              <input
                type="text"
                value={editRemarks}
                onChange={(e) => setEditRemarks(e.target.value)}
                placeholder="e.g. Priority client project"
                className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Description (optional)
              </label>
              <textarea
                rows={3}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditingJob(null)}
                className="h-8 px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-8 px-4 rounded-lg bg-[#2563EB] text-xs font-medium text-white hover:bg-[#1d4ed8]"
              >
                Save Job
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deletingJobId && (
        <Modal
          isOpen={true}
          onClose={() => setDeletingJobId(null)}
          title="Delete Job"
          maxWidth="sm"
        >
          <div className="space-y-3">
            <p className="text-xs text-slate-600">
              Are you sure you want to delete this job? All linked invoices and attached files will also be removed.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setDeletingJobId(null)}
                className="h-8 px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="h-8 px-3.5 rounded-lg bg-rose-600 text-xs font-medium text-white hover:bg-rose-700"
              >
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
