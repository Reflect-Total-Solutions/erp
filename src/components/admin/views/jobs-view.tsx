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
  ShieldAlert,
  RotateCcw,
  AlertTriangle,
  Briefcase,
} from "lucide-react";
import { useAdminData } from "@/context/admin-data-context";
import { StatusBadge } from "@/components/admin/ui/badge";
import { Modal } from "@/components/admin/ui/modal";
import { Pagination } from "@/components/admin/ui/pagination";
import { SearchField } from "@/components/admin/ui/search-field";
import { FilterSelect, FilterDate } from "@/components/admin/ui/filter-controls";
import { CreateJobModal } from "@/components/admin/modals/create-job-modal";
import { Job, JobStatus } from "@/types/admin";
import {
  exportJobsToCsv,
  exportJobDetailedReportToCsv,
  downloadMockExcelFile,
  downloadAllJobExcelFiles,
} from "@/lib/export-utils";
import { formatCurrency } from "@/lib/financial";

export function JobsView() {
  const router = useRouter();
  const {
    jobs,
    invoices,
    excelFiles,
    suppliers,
    deleteJob,
    restoreJob,
    permanentlyDeleteJob,
    updateJob,
    getJobTotalInvoiceValue,
    getJobInvoices,
    getJobSuppliers,
    getJobExcelFiles,
    can,
    currentRole,
  } = useAdminData();

  // Tab: "active" | "trash"
  const [activeTab, setActiveTab] = useState<"active" | "trash">("active");

  // Search and filter
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Bulk Selection
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<Job | null>(null);

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

  const handleConfirmPermanentDelete = () => {
    if (permanentDeleteTarget) {
      permanentlyDeleteJob(permanentDeleteTarget.id);
      setPermanentDeleteTarget(null);
    }
  };

  const trashCount = useMemo(() => jobs.filter((j) => j.isDeleted).length, [jobs]);

  // Tab-filtered jobs
  const tabJobs = useMemo(() => {
    if (activeTab === "active") {
      return jobs.filter((j) => !j.isDeleted);
    }
    return jobs.filter((j) => j.isDeleted);
  }, [jobs, activeTab]);

  // Filtered jobs
  const filteredJobs = useMemo(() => {
    return tabJobs.filter((job) => {
      const matchSearch =
        job.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (job.jobCode && job.jobCode.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (job.clientName && job.clientName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (job.handledBy && job.handledBy.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (job.remarks && job.remarks.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (job.description && job.description.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchDate = !dateFilter || job.date === dateFilter;
      const matchStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "PENDING_APPROVAL"
          ? (job.status || "").toUpperCase() === "PENDING_APPROVAL" || (job.status || "").toLowerCase().includes("pending")
          : statusFilter === "APPROVED"
          ? (job.status || "").toUpperCase() === "APPROVED" || (job.status || "").toLowerCase().includes("approved")
          : statusFilter === "REJECTED"
          ? (job.status || "").toUpperCase() === "REJECTED" || (job.status || "").toLowerCase().includes("reject")
          : (job.status || "").toUpperCase() === statusFilter.toUpperCase();

      return matchSearch && matchDate && matchStatus;
    });
  }, [tabJobs, searchTerm, dateFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / pageSize));
  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredJobs.slice(start, start + pageSize);
  }, [filteredJobs, currentPage, pageSize]);

  if (!can("jobs", "view")) {
    return (
      <div className="flex flex-col items-center justify-center p-10 bg-white rounded-2xl border border-slate-200 text-center max-w-lg mx-auto mt-8 shadow-xs">
        <div className="h-14 w-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
          You do not have authorization to view Jobs & Work Orders. Contact your system administrator if access is needed.
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

          {can("jobs", "create") && (
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1d4ed8] transition-colors shrink-0"
            >
              <Plus className="h-4 w-4" />
              Create New Job
            </button>
          )}
        </div>
      </div>

      {/* Active vs Trash View Toggle */}
      <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => {
            setActiveTab("active");
            setCurrentPage(1);
          }}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
            activeTab === "active"
              ? "bg-white text-blue-600 shadow-2xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <span>Active Jobs</span>
          <span className="rounded-full bg-blue-100 text-blue-700 px-1.5 py-0.2 text-[10px] font-bold">
            {jobs.filter((j) => !j.isDeleted).length}
          </span>
        </button>

        {can("jobs", "delete") && (
          <button
            type="button"
            onClick={() => {
              setActiveTab("trash");
              setCurrentPage(1);
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "trash"
                ? "bg-white text-rose-600 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Trash2 className="h-3.5 w-3.5 text-rose-500" />
            <span>Trash / Archived</span>
            <span className="rounded-full bg-slate-200 text-slate-700 px-1.5 py-0.2 text-[10px] font-bold">
              {trashCount}
            </span>
          </button>
        )}
      </div>

      {/* Reusable Filter Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
          {/* Search */}
          <SearchField
            value={searchTerm}
            onChange={(val) => {
              setSearchTerm(val);
              setCurrentPage(1);
            }}
            placeholder="Search by job name, code, description..."
          />

          {/* Date Filter */}
          <FilterDate
            value={dateFilter}
            onChange={(val) => {
              setDateFilter(val);
              setCurrentPage(1);
            }}
          />

          {/* Status Filter */}
          <FilterSelect
            value={statusFilter}
            onChange={(val) => {
              setStatusFilter(val);
              setCurrentPage(1);
            }}
            options={[
              { value: "all", label: "All Statuses" },
              { value: "PENDING_APPROVAL", label: "Pending Approval" },
              { value: "APPROVED", label: "Approved" },
              { value: "REJECTED", label: "Rejected" },
              { value: "DRAFT", label: "Draft" },
            ]}
          />

          {/* Reset Filters */}
          <div className="flex items-center justify-between">
            {searchTerm || dateFilter || statusFilter !== "all" ? (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setDateFilter("");
                  setStatusFilter("all");
                  setCurrentPage(1);
                }}
                className="text-xs text-blue-600 hover:underline font-medium"
              >
                Clear Filters
              </button>
            ) : (
              <span />
            )}

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
              (Total combined cost:{" "}
              {formatCurrency(
                filteredJobs
                  .filter((j) => selectedJobIds.includes(j.id))
                  .reduce((sum, j) => sum + getJobTotalInvoiceValue(j.id), 0),
                { showCurrencyPrefix: true }
              )}
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
            {tabJobs.length === 0 ? (
              activeTab === "trash" ? (
                <div className="py-6 flex flex-col items-center justify-center">
                  <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 mb-2">
                    <Trash2 className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700">Trash is empty</p>
                  <p className="text-xs text-slate-400 mt-1">No archived jobs found in trash.</p>
                </div>
              ) : (
                <div className="py-8 flex flex-col items-center justify-center">
                  <div className="h-12 w-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mb-3">
                    <Briefcase className="h-6 w-6 text-blue-600" />
                  </div>
                  <p className="text-sm font-bold text-slate-800">No jobs found</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm text-center">
                    No jobs have been created yet. Click &quot;Create New Job&quot; to initialize a project schedule.
                  </p>
                  {can("jobs", "create") && (
                    <button
                      type="button"
                      onClick={() => setIsCreateOpen(true)}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1d4ed8] transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                      Create New Job
                    </button>
                  )}
                </div>
              )
            ) : (
              <div className="py-6">
                <p className="font-medium text-slate-700">No jobs match your search or filter criteria.</p>
                <p className="text-slate-400 mt-1">Try resetting your search query or filters.</p>
              </div>
            )}
          </div>
        ) : (
          <>
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
                  <th className="px-4 py-3 text-right">Quotation / Invoices</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedJobs.map((job) => {
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
                            {job.clientName && (
                              <span className="text-[10px] font-medium text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                                {job.clientName}
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
                      <td className="px-4 py-3.5 text-right font-semibold text-slate-900 whitespace-nowrap">
                        {job.grandTotal || job.totalCost ? (
                          <div>
                            <span className="text-blue-700 font-bold block">
                              {formatCurrency(job.grandTotal || job.totalCost || 0, { showCurrencyPrefix: true })}
                            </span>
                            <span className="text-[10px] text-slate-400 block font-normal">
                              Invoices: {formatCurrency(val, { showCurrencyPrefix: true })}
                            </span>
                          </div>
                        ) : (
                          <span>{formatCurrency(val, { showCurrencyPrefix: true })}</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {activeTab === "active" ? (
                            <>
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
                              {can("jobs", "edit") && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenEdit(job)}
                                  className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                                  title="Edit Job"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </button>
                              )}
                              {can("jobs", "delete") && (
                                <button
                                  type="button"
                                  onClick={() => setDeletingJobId(job.id)}
                                  className="p-1 rounded text-slate-500 hover:text-rose-600 hover:bg-slate-100 transition-colors"
                                  title="Move Job to Trash"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              {can("jobs", "edit") && (
                                <button
                                  type="button"
                                  onClick={() => restoreJob(job.id)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors cursor-pointer"
                                  title="Restore to Active"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  <span>Restore</span>
                                </button>
                              )}
                              {can("jobs", "delete") && (
                                <button
                                  type="button"
                                  onClick={() => setPermanentDeleteTarget(job)}
                                  className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                  title="Permanently Delete Job"
                                >
                                  <Trash2 className="h-4 w-4 text-rose-500" />
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
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredJobs.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setCurrentPage(1);
            }}
          />
        </>
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
                  <option value="PENDING_APPROVAL">Pending Approval</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="DRAFT">Draft</option>
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

      {/* Delete / Move to Trash Modal */}
      {deletingJobId && (
        <Modal
          isOpen={true}
          onClose={() => setDeletingJobId(null)}
          title="Move Job to Trash"
          maxWidth="sm"
        >
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 space-y-1">
                <p className="font-semibold">Move to Trash / Archive</p>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Moving this job to trash will remove it from active lists. All linked documents, invoices, and audit records remain preserved and can be restored at any time.
                </p>
              </div>
            </div>

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
                className="h-8 px-3.5 rounded-lg bg-amber-600 text-xs font-medium text-white hover:bg-amber-700"
              >
                Move to Trash
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Permanent Delete Modal */}
      {permanentDeleteTarget && (
        <Modal
          isOpen={true}
          onClose={() => setPermanentDeleteTarget(null)}
          title="Permanently Delete Job"
          maxWidth="sm"
        >
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 bg-rose-50 rounded-lg border border-rose-200">
              <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs text-rose-900 space-y-1">
                <p className="font-semibold">Permanent Destruction Warning</p>
                <p className="text-[11px] text-rose-800 leading-relaxed">
                  Are you sure you want to permanently delete <strong>{permanentDeleteTarget.name}</strong> ({permanentDeleteTarget.jobCode})? This action <strong>cannot</strong> be undone.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setPermanentDeleteTarget(null)}
                className="h-8 px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPermanentDelete}
                className="h-8 px-3.5 rounded-lg bg-rose-600 text-xs font-medium text-white hover:bg-rose-700"
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
