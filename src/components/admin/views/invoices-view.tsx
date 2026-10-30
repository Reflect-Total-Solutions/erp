"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Upload,
  Search,
  Trash2,
  X,
  Receipt,
  DollarSign,
  Clock,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  CheckSquare,
  Square,
  Eye,
  ShieldAlert,
} from "lucide-react";
import { useAdminData } from "@/context/admin-data-context";
import { StatusBadge } from "@/components/admin/ui/badge";
import { Modal } from "@/components/admin/ui/modal";
import { Pagination } from "@/components/admin/ui/pagination";
import { SearchField } from "@/components/admin/ui/search-field";
import { FilterSelect } from "@/components/admin/ui/filter-controls";
import { BulkInvoiceUploadModal } from "@/components/admin/modals/bulk-invoice-upload-modal";
import { Invoice, InvoiceAttachment } from "@/types/admin";
import {
  exportInvoicesToCsv,
  downloadMockInvoiceFile,
  downloadSingleAttachment,
} from "@/lib/export-utils";

export function InvoicesView() {
  const {
    invoices,
    jobs,
    suppliers,
    totalInvoicesCount,
    totalInvoiceValue,
    deleteInvoice,
    can,
    currentRole,
  } = useAdminData();

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [jobFilter, setJobFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Selection for Bulk Download
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);

  // Modals
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null);
  const [previewingInvoice, setPreviewingInvoice] = useState<Invoice | null>(null);

  // Summary Metrics
  const pendingValue = useMemo(() => {
    return invoices
      .filter((i) => i.status === "Pending" || i.status === "Under Review")
      .reduce((acc, curr) => acc + curr.totalValue, 0);
  }, [invoices]);

  const paidValue = useMemo(() => {
    return invoices
      .filter((i) => i.status === "Paid")
      .reduce((acc, curr) => acc + curr.totalValue, 0);
  }, [invoices]);

  const handleConfirmDelete = () => {
    if (deletingInvoiceId) {
      deleteInvoice(deletingInvoiceId);
      setDeletingInvoiceId(null);
    }
  };

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const matchSearch =
        inv.invoiceName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.fileName.toLowerCase().includes(searchTerm.toLowerCase());

      const matchJob = jobFilter === "all" || inv.jobId === jobFilter;
      const matchSupplier = supplierFilter === "all" || inv.supplierId === supplierFilter;
      const matchStatus = statusFilter === "all" || inv.status === statusFilter;

      return matchSearch && matchJob && matchSupplier && matchStatus;
    });
  }, [invoices, searchTerm, jobFilter, supplierFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / pageSize));
  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredInvoices.slice(start, start + pageSize);
  }, [filteredInvoices, currentPage, pageSize]);

  if (!can("invoices", "view")) {
    return (
      <div className="flex flex-col items-center justify-center p-10 bg-white rounded-2xl border border-slate-200 text-center max-w-lg mx-auto mt-8 shadow-xs">
        <div className="h-14 w-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
          You do not have authorization to view Vendor Invoices. Contact your system administrator if access is needed.
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Invoices Management</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            View and manage all uploaded vendor invoices across all jobs.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => exportInvoicesToCsv(filteredInvoices, jobs, suppliers, "invoices_full_report")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shrink-0"
            title="Download CSV report of all invoices"
          >
            <Download className="h-4 w-4 text-slate-500" />
            <span>Download All ({filteredInvoices.length})</span>
          </button>

          {can("invoices", "create") && (
            <button
              type="button"
              onClick={() => setIsBulkUploadOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1d4ed8] transition-colors shrink-0"
            >
              <Upload className="h-4 w-4" />
              Bulk Upload Invoices
            </button>
          )}
        </div>
      </div>

      {/* 4 Clean Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <span className="text-xs font-medium text-slate-500">Total Invoices</span>
          <p className="text-2xl font-bold text-slate-900 mt-1">{totalInvoicesCount}</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <span className="text-xs font-medium text-slate-500">Total Value</span>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            Rs. {totalInvoiceValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <span className="text-xs font-medium text-slate-500">Pending Approval</span>
          <p className="text-2xl font-bold text-amber-600 mt-1">
            Rs. {pendingValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <span className="text-xs font-medium text-slate-500">Paid Invoices</span>
          <p className="text-2xl font-bold text-emerald-600 mt-1">
            Rs. {paidValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Reusable Filter Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
          {/* Search */}
          <SearchField
            value={searchTerm}
            onChange={(val) => {
              setSearchTerm(val);
              setCurrentPage(1);
            }}
            placeholder="Search invoice or file name..."
          />

          {/* Job Filter */}
          <FilterSelect
            value={jobFilter}
            onChange={(val) => {
              setJobFilter(val);
              setCurrentPage(1);
            }}
            options={[
              { value: "all", label: "All Jobs" },
              ...jobs.map((j) => ({ value: j.id, label: j.name })),
            ]}
          />

          {/* Supplier Filter */}
          <FilterSelect
            value={supplierFilter}
            onChange={(val) => {
              setSupplierFilter(val);
              setCurrentPage(1);
            }}
            options={[
              { value: "all", label: "All Suppliers" },
              ...suppliers.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })),
            ]}
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
              { value: "Pending", label: "Pending" },
              { value: "Approved", label: "Approved" },
              { value: "Under Review", label: "Under Review" },
              { value: "Paid", label: "Paid" },
            ]}
          />
        </div>
      </div>

      {/* Bulk Selection Bar */}
      {selectedInvoiceIds.length > 0 && (
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-xs text-blue-900 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-blue-600" />
            <span className="font-semibold">
              {selectedInvoiceIds.length} invoices selected
            </span>
            <span className="text-slate-500 text-[11px]">
              (Combined value: Rs.{" "}
              {filteredInvoices
                .filter((i) => selectedInvoiceIds.includes(i.id))
                .reduce((sum, i) => sum + i.totalValue, 0)
                .toLocaleString(undefined, { minimumFractionDigits: 2 })}
              )
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const selectedInvs = invoices.filter((i) => selectedInvoiceIds.includes(i.id));
                exportInvoicesToCsv(selectedInvs, jobs, suppliers, "selected_invoices_report");
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3 py-1.5 font-semibold text-white hover:bg-[#1d4ed8] shadow-xs"
            >
              <Download className="h-3.5 w-3.5" />
              Download Selected CSV ({selectedInvoiceIds.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedInvoiceIds([])}
              className="text-slate-500 hover:text-slate-700 px-2 py-1 text-xs"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      {/* Invoices Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {filteredInvoices.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No invoices found. Click &quot;Bulk Upload Invoices&quot; to add some.
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
                        if (selectedInvoiceIds.length === filteredInvoices.length) {
                          setSelectedInvoiceIds([]);
                        } else {
                          setSelectedInvoiceIds(filteredInvoices.map((i) => i.id));
                        }
                      }}
                      className="text-slate-400 hover:text-blue-600 inline-flex items-center justify-center"
                      title={
                        selectedInvoiceIds.length === filteredInvoices.length
                          ? "Deselect All"
                          : "Select All Filtered"
                      }
                    >
                      {selectedInvoiceIds.length === filteredInvoices.length &&
                      filteredInvoices.length > 0 ? (
                        <CheckSquare className="h-4 w-4 text-blue-600" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  </th>
                  <th className="px-5 py-3">Invoice Name / File</th>
                  <th className="px-4 py-3">Job Name</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedInvoices.map((inv) => {
                  const job = jobs.find((j) => j.id === inv.jobId);
                  const supplier = suppliers.find((s) => s.id === inv.supplierId);
                  const isSelected = selectedInvoiceIds.includes(inv.id);

                  return (
                    <tr
                      key={inv.id}
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
                              setSelectedInvoiceIds((prev) => [...prev, inv.id]);
                            } else {
                              setSelectedInvoiceIds((prev) =>
                                prev.filter((id) => id !== inv.id)
                              );
                            }
                          }}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>

                      <td className="px-5 py-3.5">
                        <div className="space-y-1.5">
                          <div>
                            <span className="font-semibold text-slate-900 block">
                              {inv.invoiceName}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              Primary: {inv.fileName} ({inv.fileSize})
                            </span>
                          </div>

                          {/* Multiple files list under invoice */}
                          {inv.attachments && inv.attachments.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {inv.attachments.map((att, aIdx) => {
                                const isPdf = att.fileName.toLowerCase().endsWith(".pdf");
                                return (
                                  <div
                                    key={att.id || aIdx}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px]"
                                  >
                                    <span
                                      className={`font-mono font-bold uppercase ${
                                        isPdf ? "text-rose-600" : "text-blue-600"
                                      }`}
                                    >
                                      {isPdf ? "PDF" : "IMG"}
                                    </span>
                                    <span className="text-slate-700 max-w-[120px] truncate" title={att.fileName}>
                                      {att.fileName}
                                    </span>
                                    <span className="text-slate-400">({att.fileSize})</span>
                                    <button
                                      type="button"
                                      onClick={() => downloadSingleAttachment(att.fileName, att.fileName)}
                                      className="text-slate-400 hover:text-blue-600 ml-0.5 p-0.5"
                                      title={`Download ${att.fileName} separately`}
                                    >
                                      <Download className="h-3 w-3" />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px]">
                              <span className="font-mono font-bold uppercase text-slate-600">
                                {inv.fileName?.toLowerCase().endsWith(".pdf") ? "PDF" : "IMG"}
                              </span>
                              <span className="text-slate-700">{inv.fileName}</span>
                              <button
                                type="button"
                                onClick={() => downloadSingleAttachment(inv.fileName, inv.fileName)}
                                className="text-slate-400 hover:text-blue-600 p-0.5 ml-0.5"
                                title="Download file"
                              >
                                <Download className="h-3 w-3" />
                              </button>
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
                        {supplier ? supplier.name : "—"}
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
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setPreviewingInvoice(inv)}
                            className="p-1 rounded text-slate-400 hover:text-blue-600 transition-colors"
                            title="Preview Invoice Document"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadMockInvoiceFile(inv)}
                            className="p-1 rounded text-slate-400 hover:text-blue-600 transition-colors"
                            title={`Download File: ${inv.fileName}`}
                          >
                            <Download className="h-4 w-4" />
                          </button>
                          {can("invoices", "delete") && (
                            <button
                              type="button"
                              onClick={() => setDeletingInvoiceId(inv.id)}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
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
            totalItems={filteredInvoices.length}
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

      {/* Bulk Upload Modal */}
      <BulkInvoiceUploadModal
        isOpen={isBulkUploadOpen}
        onClose={() => setIsBulkUploadOpen(false)}
      />

      {/* Invoice Document Preview Modal */}
      {previewingInvoice && (
        <Modal
          isOpen={true}
          onClose={() => setPreviewingInvoice(null)}
          title="Invoice Document Preview"
          maxWidth="2xl"
        >
          <div className="space-y-4">
            {/* Metadata Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <div>
                <span className="text-[11px] text-slate-400 block font-medium">Invoice Name</span>
                <span className="font-bold text-slate-900 truncate block">{previewingInvoice.invoiceName}</span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block font-medium">Total Amount</span>
                <span className="font-bold text-slate-900 block">
                  Rs. {previewingInvoice.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block font-medium">Invoice Date</span>
                <span className="font-semibold text-slate-700 block">{previewingInvoice.invoiceDate}</span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block font-medium">Status</span>
                <div className="mt-0.5"><StatusBadge status={previewingInvoice.status} /></div>
              </div>
            </div>

            {/* Document Preview Pane */}
            <div className="rounded-xl border border-slate-200 bg-slate-100 p-6 flex flex-col items-center justify-center min-h-[220px] text-center">
              <div className="h-14 w-14 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-blue-600 mb-3">
                <Receipt className="h-7 w-7" />
              </div>
              <p className="text-sm font-bold text-slate-900">{previewingInvoice.fileName}</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Document verified. Format: {previewingInvoice.fileName?.endsWith('.pdf') ? 'Adobe Acrobat PDF Document' : 'Digital Photo Proof'}.
              </p>
              <button
                type="button"
                onClick={() => downloadMockInvoiceFile(previewingInvoice)}
                className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#2563EB] text-xs font-semibold text-white shadow-xs hover:bg-[#1d4ed8] transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Download Original Document
              </button>
            </div>

            {/* Attachments Section if multiple exist */}
            {previewingInvoice.attachments && previewingInvoice.attachments.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-800">
                  Attached Documents ({previewingInvoice.attachments.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {previewingInvoice.attachments.map((att: InvoiceAttachment, i: number) => (
                    <div
                      key={att.id || i}
                      className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-white text-xs"
                    >
                      <span className="font-medium text-slate-800 truncate max-w-[180px]">{att.fileName}</span>
                      <button
                        type="button"
                        onClick={() => downloadSingleAttachment(att.fileName, att.fileName)}
                        className="p-1 rounded text-blue-600 hover:bg-blue-50"
                        title="Download file"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deletingInvoiceId && (
        <Modal
          isOpen={true}
          onClose={() => setDeletingInvoiceId(null)}
          title="Delete Invoice"
          maxWidth="sm"
        >
          <div className="space-y-3">
            <p className="text-xs text-slate-600">
              Are you sure you want to delete this invoice?
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setDeletingInvoiceId(null)}
                className="h-8 px-3 rounded text-xs text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="h-8 px-3.5 rounded bg-rose-600 text-xs font-semibold text-white hover:bg-rose-700"
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
