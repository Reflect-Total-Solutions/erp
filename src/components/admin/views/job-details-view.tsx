"use client";

import React, { useState, useRef, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  FileSpreadsheet,
  Upload,
  Plus,
  Trash2,
  Edit2,
  Eye,
  FileText,
  Search,
  DollarSign,
  Users,
  X,
  Image as ImageIcon,
  Download,
  CheckSquare,
  Square,
  Loader2,
} from "lucide-react";
import { useAdminData } from "@/context/admin-data-context";
import { StatusBadge } from "@/components/admin/ui/badge";
import { Modal } from "@/components/admin/ui/modal";
import { BulkInvoiceUploadModal } from "@/components/admin/modals/bulk-invoice-upload-modal";
import { Invoice, InvoiceStatus } from "@/types/admin";
import {
  exportJobDetailedReportToCsv,
  exportInvoicesToCsv,
  downloadMockInvoiceFile,
  downloadMockExcelFile,
  downloadSingleAttachment,
  downloadAllJobExcelFiles,
} from "@/lib/export-utils";

interface JobDetailsViewProps {
  jobId: string;
}

export function JobDetailsView({ jobId }: JobDetailsViewProps) {
  const {
    jobs,
    suppliers,
    getJobById,
    getJobSuppliers,
    getJobInvoices,
    getJobExcelFiles,
    getJobTotalInvoiceValue,
    assignSupplierToJob,
    removeSupplierFromJob,
    addSupplier,
    addExcelFiles,
    addBulkInvoices,
    removeExcelFile,
    deleteInvoice,
    updateInvoice,
  } = useAdminData();

  const job = getJobById(jobId);

  // Active Tab
  const [activeTab, setActiveTab] = useState<"excel" | "suppliers" | "invoices">("excel");

  // Modal states
  const [isBulkInvoiceOpen, setIsBulkInvoiceOpen] = useState(false);
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);
  const [supplierTab, setSupplierTab] = useState<"existing" | "new">("existing");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");

  // New Supplier form state
  const [newSupName, setNewSupName] = useState("");
  const [newSupCode, setNewSupCode] = useState("");
  const [newSupContact, setNewSupContact] = useState("");
  const [newSupPhone, setNewSupPhone] = useState("");
  const [newSupEmail, setNewSupEmail] = useState("");
  const [newSupAddress, setNewSupAddress] = useState("");

  // Edit Invoice state
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [editInvName, setEditInvName] = useState("");
  const [editInvDate, setEditInvDate] = useState("");
  const [editInvValue, setEditInvValue] = useState("");
  const [editInvSupplier, setEditInvSupplier] = useState("");
  const [editInvStatus, setEditInvStatus] = useState<InvoiceStatus>("Pending");

  // Invoices search and selection
  const [invSearch, setInvSearch] = useState("");
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);

  // Derived data
  const jobSuppliers = useMemo(() => (job ? getJobSuppliers(job.id) : []), [job, getJobSuppliers]);
  const jobInvoices = useMemo(() => (job ? getJobInvoices(job.id) : []), [job, getJobInvoices]);
  const jobExcelFiles = useMemo(() => (job ? getJobExcelFiles(job.id) : []), [job, getJobExcelFiles]);
  const totalValue = useMemo(() => (job ? getJobTotalInvoiceValue(job.id) : 0), [job, getJobTotalInvoiceValue]);

  const filteredInvoices = useMemo(() => {
    return jobInvoices.filter((inv) =>
      inv.invoiceName.toLowerCase().includes(invSearch.toLowerCase()) ||
      inv.fileName.toLowerCase().includes(invSearch.toLowerCase())
    );
  }, [jobInvoices, invSearch]);

  // Excel staging
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [stagedExcelFiles, setStagedExcelFiles] = useState<
    Array<{ id: string; file: File; name: string; date: string }>
  >([]);

  // Excel handling
  const handleSelectExcel = (files: FileList | null) => {
    if (!files) return;
    const todayStr = new Date().toISOString().split("T")[0];
    const valid = Array.from(files).filter(
      (f) => f.name.endsWith(".xlsx") || f.name.endsWith(".xls")
    );

    const newItems = valid.map((f, i) => {
      const cleanName = f.name
        .replace(/\.[^/.]+$/, "")
        .replace(/[_-]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

      return {
        id: "staged-detail-" + Date.now() + "-" + i,
        file: f,
        name: cleanName,
        date: job?.date || todayStr,
      };
    });

    setStagedExcelFiles((prev) => [...prev, ...newItems]);
  };

  const updateExcelStagedItem = (id: string, field: "name" | "date", val: string) => {
    setStagedExcelFiles((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: val } : item))
    );
  };

  const [isUploadingDoc, setIsUploadingDoc] = useState(false);

  const handleUploadExcel = async () => {
    if (stagedExcelFiles.length === 0 || !job) return;
    setIsUploadingDoc(true);

    try {
      for (const item of stagedExcelFiles) {
        const formData = new FormData();
        formData.append("file", item.file);
        formData.append("customName", item.name.trim() || item.file.name);
        formData.append("fileDate", item.date);

        const res = await fetch(`/api/jobs/${job.id}/documents`, {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data)) {
            addExcelFiles(json.data);
          }
        } else {
          const sizeKB = Math.round(item.file.size / 1024);
          addExcelFiles([
            {
              jobId: job.id,
              fileName: item.file.name,
              customName: item.name.trim() || item.file.name,
              fileDate: item.date,
              fileSize: sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB || 100} KB`,
              status: "Processed" as const,
            },
          ]);
        }
      }
      setStagedExcelFiles([]);
    } catch (err) {
      console.error("Error uploading Excel document to Supabase Storage:", err);
    } finally {
      setIsUploadingDoc(false);
    }
  };

  // Invoice staging for Tab 3 (Photos & PDFs in Bulk)
  const invoiceFileInputRef = useRef<HTMLInputElement>(null);
  const [stagedInvoiceFiles, setStagedInvoiceFiles] = useState<
    Array<{
      id: string;
      file: File;
      fileName: string;
      fileSize: string;
      fileType: "pdf" | "image";
      previewUrl?: string;
      invoiceName: string;
      invoiceDate: string;
      totalValue: string;
      supplierId: string;
    }>
  >([]);
  const [isInvoiceDragging, setIsInvoiceDragging] = useState(false);
  const [previewingInvoice, setPreviewingInvoice] = useState<Invoice | null>(null);

  const handleSelectInvoiceFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const todayStr = new Date().toISOString().split("T")[0];
    const valid = Array.from(files).filter((f) =>
      /\.(pdf|jpg|jpeg|png|webp)$/i.test(f.name)
    );

    const defaultSupId =
      (job?.supplierIds && job.supplierIds[0]) || suppliers[0]?.id || "";

    const newItems = valid.map((f, i) => {
      const cleanName = f.name
        .replace(/\.[^/.]+$/, "")
        .replace(/[_-]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

      const sizeKB = Math.round(f.size / 1024);
      const sizeStr = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB || 180} KB`;
      const isPdf = f.name.toLowerCase().endsWith(".pdf");

      return {
        id: "staged-inv-" + Date.now() + "-" + i + "-" + Math.random().toString(36).substring(2, 5),
        file: f,
        fileName: f.name,
        fileSize: sizeStr,
        fileType: isPdf ? ("pdf" as const) : ("image" as const),
        previewUrl: !isPdf ? URL.createObjectURL(f) : undefined,
        invoiceName: cleanName || `Invoice #${i + 1}`,
        invoiceDate: job?.date || todayStr,
        totalValue: "",
        supplierId: defaultSupId,
      };
    });

    setStagedInvoiceFiles((prev) => [...prev, ...newItems]);
  };

  const updateStagedInvoiceItem = (
    id: string,
    field: "invoiceName" | "invoiceDate" | "totalValue" | "supplierId",
    val: string
  ) => {
    setStagedInvoiceFiles((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: val } : item))
    );
  };

  const handleUploadStagedInvoices = () => {
    if (stagedInvoiceFiles.length === 0 || !job) return;

    const invoicesToCreate = stagedInvoiceFiles.map((item) => ({
      jobId: job.id,
      supplierId: item.supplierId || (suppliers[0]?.id ?? ""),
      invoiceName: item.invoiceName.trim() || item.fileName,
      invoiceDate: item.invoiceDate || job.date,
      totalValue: parseFloat(item.totalValue) || 0,
      fileName: item.fileName,
      fileSize: item.fileSize,
      status: "Pending" as InvoiceStatus,
    }));

    addBulkInvoices(invoicesToCreate);
    setStagedInvoiceFiles([]);
  };

  // Assign existing supplier
  const handleAssignExisting = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId || !job) return;
    assignSupplierToJob(job.id, selectedSupplierId);
    setSelectedSupplierId("");
    setIsAddSupplierOpen(false);
  };

  // Add new supplier inline
  const handleAddNewSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupName.trim() || !newSupCode.trim() || !job) return;

    const created = addSupplier({
      name: newSupName.trim(),
      code: newSupCode.trim().toUpperCase(),
      contactPerson: newSupContact.trim(),
      phone: newSupPhone.trim(),
      email: newSupEmail.trim(),
      address: newSupAddress.trim(),
    });

    assignSupplierToJob(job.id, created.id);

    setNewSupName("");
    setNewSupCode("");
    setNewSupContact("");
    setNewSupPhone("");
    setNewSupEmail("");
    setNewSupAddress("");
    setIsAddSupplierOpen(false);
  };

  // Edit invoice
  const handleOpenEditInvoice = (inv: Invoice) => {
    setEditingInvoice(inv);
    setEditInvName(inv.invoiceName);
    setEditInvDate(inv.invoiceDate);
    setEditInvValue(inv.totalValue.toString());
    setEditInvSupplier(inv.supplierId);
    setEditInvStatus(inv.status);
  };

  const handleSaveInvoiceEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInvoice) return;

    updateInvoice(editingInvoice.id, {
      invoiceName: editInvName.trim(),
      invoiceDate: editInvDate,
      totalValue: parseFloat(editInvValue) || editingInvoice.totalValue,
      supplierId: editInvSupplier,
      status: editInvStatus,
    });
    setEditingInvoice(null);
  };

  if (!job) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-3">
        <p className="text-sm font-semibold text-slate-800">Job not found</p>
        <p className="text-xs text-slate-500">The requested job could not be located.</p>
        <div>
          <Link
            href="/admin/jobs"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Jobs
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Back button */}
      <div>
        <Link
          href="/admin/jobs"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-blue-600 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Jobs</span>
        </Link>
      </div>

      {/* Job Header Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-slate-900">{job.name}</h2>
              {job.jobCode && (
                <span className="text-xs font-mono font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {job.jobCode}
                </span>
              )}
              <StatusBadge status={job.status} />
            </div>

            <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-500 flex-wrap">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                Job Date: <strong className="text-slate-700">{job.date}</strong>
              </span>
              {job.remarks && (
                <span className="text-slate-600 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                  Remarks: {job.remarks}
                </span>
              )}
            </div>

            {job.description && (
              <p className="mt-2 text-xs text-slate-600 max-w-2xl leading-relaxed">
                {job.description}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => exportJobDetailedReportToCsv(job, jobInvoices, jobSuppliers, jobExcelFiles)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
              title="Download complete cost breakdown, invoices, and suppliers dossier"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" />
              Download Job Dossier
            </button>

            <button
              type="button"
              onClick={() => setIsBulkInvoiceOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1d4ed8] transition-colors"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload Invoices
            </button>
          </div>
        </div>

        {/* Quick summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-100 text-xs">
          <div>
            <span className="text-slate-400 block text-[11px]">Total Invoice Value</span>
            <span className="font-bold text-slate-900 text-base">
              Rs. {totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Assigned Suppliers</span>
            <span className="font-bold text-slate-900 text-base">{jobSuppliers.length}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Invoices Uploaded</span>
            <span className="font-bold text-slate-900 text-base">{jobInvoices.length}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Excel Files Attached</span>
            <span className="font-bold text-slate-900 text-base">{jobExcelFiles.length}</span>
          </div>
        </div>
      </div>

      {/* Simple Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => setActiveTab("excel")}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === "excel"
                ? "border-[#2563EB] text-[#2563EB]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            1. Excel Files ({jobExcelFiles.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("suppliers")}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === "suppliers"
                ? "border-[#2563EB] text-[#2563EB]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            2. Suppliers ({jobSuppliers.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("invoices")}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === "invoices"
                ? "border-[#2563EB] text-[#2563EB]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            3. Bulk Invoice Upload & Invoices ({jobInvoices.length})
          </button>
        </div>
      </div>

      {/* ================= TAB 1: EXCEL UPLOAD ================= */}
      {activeTab === "excel" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-xs font-bold text-slate-900 mb-1">Upload Excel Files</h3>
            <p className="text-xs text-slate-500 mb-4">
              Upload multiple Excel files (.xlsx or .xls) for {job.name}.
            </p>

            {/* File Selector */}
            <div className="flex items-center gap-3">
              <input
                ref={excelInputRef}
                type="file"
                multiple
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => handleSelectExcel(e.target.files)}
              />
              <button
                type="button"
                onClick={() => excelInputRef.current?.click()}
                className="h-9 px-4 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                Select Excel Files
              </button>
              <span className="text-xs text-slate-400">
                You can select multiple files at once.
              </span>
            </div>

            {/* Staged files */}
            {stagedExcelFiles.length > 0 && (
              <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                <span className="text-xs font-bold text-slate-800 block">
                  Selected Files ({stagedExcelFiles.length}):
                </span>
                <div className="space-y-2">
                  {stagedExcelFiles.map((item) => (
                    <div key={item.id} className="p-2.5 bg-white rounded-lg border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-100">
                        <span className="font-mono text-[11px] text-slate-500 truncate">
                          {item.file.name} ({(item.file.size / 1024).toFixed(0)} KB)
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setStagedExcelFiles((prev) => prev.filter((i) => i.id !== item.id))
                          }
                          className="text-slate-400 hover:text-rose-600 p-1"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                            Excel Name *
                          </label>
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => updateExcelStagedItem(item.id, "name", e.target.value)}
                            placeholder="e.g. BOQ Schedule"
                            className="h-8 w-full rounded border border-slate-200 px-2 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                            Date *
                          </label>
                          <input
                            type="date"
                            value={item.date}
                            onChange={(e) => updateExcelStagedItem(item.id, "date", e.target.value)}
                            className="h-8 w-full rounded border border-slate-200 px-2 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setStagedExcelFiles([])}
                    className="h-8 px-3 rounded text-xs text-slate-600 hover:bg-slate-200"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    disabled={isUploadingDoc}
                    onClick={handleUploadExcel}
                    className="h-8 px-4 rounded bg-[#2563EB] text-xs font-semibold text-white hover:bg-[#1d4ed8] flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isUploadingDoc && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <span>{isUploadingDoc ? "Uploading to Supabase..." : `Upload to Supabase (${stagedExcelFiles.length})`}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Files Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
              <span className="font-bold text-xs text-slate-800">
                Attached Excel Files ({jobExcelFiles.length})
              </span>
              {jobExcelFiles.length > 1 && (
                <button
                  type="button"
                  onClick={() => downloadAllJobExcelFiles(jobExcelFiles)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
                  title="Download all attached Excel files individually"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download All {jobExcelFiles.length} Excel Files</span>
                </button>
              )}
            </div>

            {jobExcelFiles.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No Excel files uploaded yet.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-2.5">Document Name</th>
                    <th className="px-4 py-2.5">File Date</th>
                    <th className="px-4 py-2.5">Size</th>
                    <th className="px-4 py-2.5">Uploaded Date</th>
                    <th className="px-4 py-2.5 text-center">Status</th>
                    <th className="px-5 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {jobExcelFiles.map((xf) => (
                    <tr key={xf.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <span className="font-semibold text-slate-900 flex items-center gap-2">
                          <FileSpreadsheet className="h-4 w-4 text-emerald-600 shrink-0" />
                          {xf.customName || xf.fileName}
                        </span>
                        {xf.customName && (
                          <span className="text-[10px] text-slate-400 font-mono ml-6 block">
                            {xf.fileName}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap font-medium">
                        {xf.fileDate || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500 font-mono">{xf.fileSize}</td>
                      <td className="px-4 py-3 text-slate-600">{xf.uploadDateTime}</td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={xf.status} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => downloadMockExcelFile(xf)}
                            className="text-slate-400 hover:text-blue-600 p-1 rounded transition-colors"
                            title={`Download File: ${xf.fileName}`}
                          >
                            <Download className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeExcelFile(xf.id)}
                            className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 2: SUPPLIERS ================= */}
      {activeTab === "suppliers" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Assigned Suppliers</h3>
              <p className="text-xs text-slate-500">Suppliers linked to this job.</p>
            </div>

            <button
              type="button"
              onClick={() => setIsAddSupplierOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1d4ed8]"
            >
              <Plus className="h-4 w-4" />
              Add Supplier to Job
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {jobSuppliers.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No suppliers assigned yet. Click &quot;Add Supplier to Job&quot; above.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-2.5">Code</th>
                    <th className="px-4 py-2.5">Supplier Name</th>
                    <th className="px-4 py-2.5">Contact Person</th>
                    <th className="px-4 py-2.5">Phone</th>
                    <th className="px-4 py-2.5">Email</th>
                    <th className="px-5 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {jobSuppliers.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-mono font-bold text-blue-600">{s.code}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{s.name}</td>
                      <td className="px-4 py-3 text-slate-600">{s.contactPerson}</td>
                      <td className="px-4 py-3 text-slate-600 font-mono">{s.phone}</td>
                      <td className="px-4 py-3 text-slate-600">{s.email}</td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => removeSupplierFromJob(job.id, s.id)}
                          className="text-slate-400 hover:text-rose-600 p-1"
                          title="Remove from job"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 3: INVOICES ================= */}
      {activeTab === "invoices" && (
        <div className="space-y-5">
          {/* Direct Bulk Invoices Upload Section (Photos & PDFs) */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Bulk Invoice Upload (Photos & PDFs)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select multiple invoice photos (.jpg, .png) or PDF files (.pdf) for {job.name}. Enter Invoice Name and Date for each file.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  ref={invoiceFileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  className="hidden"
                  onChange={(e) => handleSelectInvoiceFiles(e.target.files)}
                />
                <button
                  type="button"
                  onClick={() => invoiceFileInputRef.current?.click()}
                  className="h-9 px-3.5 rounded-lg bg-[#2563EB] text-xs font-semibold text-white hover:bg-[#1d4ed8] flex items-center gap-1.5 shadow-xs"
                >
                  <Upload className="h-4 w-4" />
                  <span>Select Invoices (Photos / PDFs)</span>
                </button>
              </div>
            </div>

            {/* Drag & Drop or Empty State Area */}
            {stagedInvoiceFiles.length === 0 ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsInvoiceDragging(true);
                }}
                onDragLeave={() => setIsInvoiceDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsInvoiceDragging(false);
                  handleSelectInvoiceFiles(e.dataTransfer.files);
                }}
                onClick={() => invoiceFileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors bg-slate-50/50 ${
                  isInvoiceDragging
                    ? "border-blue-500 bg-blue-50/40"
                    : "border-slate-300 hover:border-blue-400"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-9 w-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                    <ImageIcon className="h-5 w-5" />
                  </div>
                  <div className="h-9 w-9 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
                    <FileText className="h-5 w-5" />
                  </div>
                </div>
                <p className="text-xs font-bold text-slate-800">
                  Drop invoice Photos & PDFs here, or click to browse
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Supports .jpg, .jpeg, .png, .webp (Camera photos) and .pdf (Scanned vouchers)
                </p>
              </div>
            ) : (
              /* Staged Invoices List (Each file has its own Name & Date right in front) */
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">
                    Selected Invoice Files ({stagedInvoiceFiles.length}):
                  </span>
                  <button
                    type="button"
                    onClick={() => setStagedInvoiceFiles([])}
                    className="text-xs text-rose-600 hover:underline font-medium"
                  >
                    Clear All
                  </button>
                </div>

                <div className="max-h-80 overflow-y-auto space-y-2.5 pr-1">
                  {stagedInvoiceFiles.map((item, idx) => (
                    <div
                      key={item.id}
                      className="p-3 bg-slate-50/70 rounded-xl border border-slate-200 space-y-2.5"
                    >
                      {/* File Header with preview */}
                      <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {item.fileType === "image" ? (
                            item.previewUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={item.previewUrl}
                                alt="preview"
                                className="h-7 w-7 rounded object-cover border border-slate-300 shrink-0"
                              />
                            ) : (
                              <div className="h-7 w-7 rounded bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                                <ImageIcon className="h-4 w-4" />
                              </div>
                            )
                          ) : (
                            <div className="h-7 w-7 rounded bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                              <FileText className="h-4 w-4" />
                            </div>
                          )}

                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase font-mono ${
                              item.fileType === "pdf"
                                ? "bg-rose-100 text-rose-700 border border-rose-200"
                                : "bg-blue-100 text-blue-700 border border-blue-200"
                            }`}
                          >
                            {item.fileType === "pdf" ? "PDF" : "PHOTO"}
                          </span>

                          <span className="text-xs font-semibold text-slate-900 truncate">
                            {item.fileName}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono shrink-0">
                            ({item.fileSize})
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setStagedInvoiceFiles((prev) =>
                              prev.filter((i) => i.id !== item.id)
                            )
                          }
                          className="text-slate-400 hover:text-rose-600 p-1 rounded"
                          title="Remove file"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Inputs in front of each file: Name, Date, Supplier, Amount */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                        {/* Invoice Name */}
                        <div className="sm:col-span-5">
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                            Invoice Name / Title *
                          </label>
                          <input
                            type="text"
                            value={item.invoiceName}
                            onChange={(e) =>
                              updateStagedInvoiceItem(item.id, "invoiceName", e.target.value)
                            }
                            placeholder="e.g. Concrete Bill #401"
                            required
                            className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                          />
                        </div>

                        {/* Invoice Date */}
                        <div className="sm:col-span-4">
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                            Invoice Date *
                          </label>
                          <input
                            type="date"
                            value={item.invoiceDate}
                            onChange={(e) =>
                              updateStagedInvoiceItem(item.id, "invoiceDate", e.target.value)
                            }
                            required
                            className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                          />
                        </div>

                        {/* Amount */}
                        <div className="sm:col-span-3">
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                            Amount (Rs.)
                          </label>
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-medium text-slate-400">
                              Rs.
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.totalValue}
                              onChange={(e) =>
                                updateStagedInvoiceItem(item.id, "totalValue", e.target.value)
                              }
                              placeholder="0.00"
                              className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Supplier dropdown */}
                      <div className="pt-0.5">
                        <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                          Supplier
                        </label>
                        <select
                          value={item.supplierId}
                          onChange={(e) =>
                            updateStagedInvoiceItem(item.id, "supplierId", e.target.value)
                          }
                          className="h-8 w-full sm:w-1/2 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                        >
                          <option value="">-- Choose Supplier --</option>
                          {suppliers.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.code})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Staged Upload Action Bar */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                  <span className="text-xs text-slate-500">
                    Total to upload: <strong>{stagedInvoiceFiles.length} Invoices</strong>
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setStagedInvoiceFiles([])}
                      className="h-8 px-3 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-100"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={handleUploadStagedInvoices}
                      className="h-8 px-4 rounded-lg bg-[#2563EB] text-xs font-semibold text-white hover:bg-[#1d4ed8] shadow-xs"
                    >
                      Upload {stagedInvoiceFiles.length} Invoices
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Existing Invoices Table for this Job */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Uploaded Invoices</h3>
                <p className="text-xs text-slate-500">
                  Total for this job:{" "}
                  <strong className="text-slate-900">
                    Rs. {totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </strong>{" "}
                  ({filteredInvoices.length} records)
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Search bar */}
                <div className="w-full sm:w-56">
                  <input
                    type="text"
                    value={invSearch}
                    onChange={(e) => setInvSearch(e.target.value)}
                    placeholder="Search invoices by name..."
                    className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                  />
                </div>

                <button
                  type="button"
                  onClick={() =>
                    exportInvoicesToCsv(
                      filteredInvoices,
                      [job],
                      suppliers,
                      `${job.jobCode || "JOB"}_invoices_report`
                    )
                  }
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs shrink-0"
                  title="Download all invoices for this job"
                >
                  <Download className="h-3.5 w-3.5 text-slate-500" />
                  <span>Download Invoices ({filteredInvoices.length})</span>
                </button>
              </div>
            </div>

            {/* Bulk Selection Bar */}
            {selectedInvoiceIds.length > 0 && (
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 text-xs text-blue-900 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-blue-600" />
                  <span className="font-semibold">
                    {selectedInvoiceIds.length} invoices selected
                  </span>
                  <span className="text-slate-500 text-[11px]">
                    (Subtotal: Rs.{" "}
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
                      const selectedInvs = jobInvoices.filter((i) =>
                        selectedInvoiceIds.includes(i.id)
                      );
                      exportInvoicesToCsv(
                        selectedInvs,
                        [job],
                        suppliers,
                        `${job.jobCode || "JOB"}_selected_invoices`
                      );
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3 py-1 font-semibold text-white hover:bg-[#1d4ed8] shadow-xs text-xs"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download Selected ({selectedInvoiceIds.length})
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

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {filteredInvoices.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No invoices uploaded yet for this job. Use the bulk upload area above to add Photos or PDFs.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="w-10 px-3 py-2.5 text-center">
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
                      <th className="px-5 py-2.5">Invoice & File</th>
                      <th className="px-4 py-2.5">Supplier</th>
                      <th className="px-4 py-2.5">Invoice Date</th>
                      <th className="px-4 py-2.5 text-right">Amount</th>
                      <th className="px-4 py-2.5 text-center">Status</th>
                      <th className="px-5 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredInvoices.map((inv) => {
                      const sup = suppliers.find((s) => s.id === inv.supplierId);
                      const isPdf = inv.fileName?.toLowerCase().endsWith(".pdf");
                      const isSelected = selectedInvoiceIds.includes(inv.id);

                      return (
                        <tr
                          key={inv.id}
                          className={`hover:bg-slate-50 transition-colors ${
                            isSelected ? "bg-blue-50/40" : ""
                          }`}
                        >
                          <td className="w-10 px-3 py-3 text-center">
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
                          <td className="px-5 py-3">
                            <div className="space-y-1.5">
                              <div>
                                <span className="font-semibold text-slate-900 block">
                                  {inv.invoiceName}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  Primary: {inv.fileName} ({inv.fileSize})
                                </span>
                              </div>

                              {/* Multiple attachments */}
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
                          <td className="px-4 py-3 text-slate-700 font-medium">
                            {sup ? sup.name : "—"}
                          </td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                            {inv.invoiceDate}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900">
                            Rs. {inv.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <StatusBadge status={inv.status} />
                          </td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => downloadMockInvoiceFile(inv)}
                                className="text-slate-400 hover:text-blue-600 p-1 rounded transition-colors"
                                title={`Download File: ${inv.fileName}`}
                              >
                                <Download className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setPreviewingInvoice(inv)}
                                className="text-slate-400 hover:text-blue-600 p-1 rounded transition-colors"
                                title="Preview Invoice Document"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEditInvoice(inv)}
                                className="text-slate-400 hover:text-slate-800 p-1 rounded transition-colors"
                                title="Edit"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteInvoice(inv.id)}
                                className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors"
                                title="Delete"
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
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Bulk Invoice Upload */}
      <BulkInvoiceUploadModal
        isOpen={isBulkInvoiceOpen}
        onClose={() => setIsBulkInvoiceOpen(false)}
        preselectedJobId={job.id}
      />

      {/* Modal: Preview Invoice */}
      {previewingInvoice && (
        <Modal
          isOpen={true}
          onClose={() => setPreviewingInvoice(null)}
          title={`Invoice Preview: ${previewingInvoice.invoiceName}`}
          maxWidth="lg"
        >
          <div className="space-y-4">
            {/* Meta details */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <div>
                <span className="text-[11px] text-slate-400 block">Invoice Date</span>
                <strong className="text-slate-800">{previewingInvoice.invoiceDate}</strong>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block">Total Value</span>
                <strong className="text-slate-900 font-mono text-sm">
                  ${previewingInvoice.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </strong>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block">Supplier</span>
                <strong className="text-slate-800">
                  {suppliers.find((s) => s.id === previewingInvoice.supplierId)?.name || "—"}
                </strong>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block">Status</span>
                <StatusBadge status={previewingInvoice.status} />
              </div>
            </div>

            {/* Document visual preview card */}
            <div className="border border-slate-200 rounded-xl p-5 bg-white text-center space-y-3">
              <div className="h-28 rounded-lg bg-slate-100 flex flex-col items-center justify-center text-slate-500 border border-dashed border-slate-300">
                {previewingInvoice.fileName.toLowerCase().endsWith(".pdf") ? (
                  <>
                    <FileText className="h-10 w-10 text-rose-500 mb-1" />
                    <span className="text-xs font-semibold text-slate-700">
                      PDF Document ({previewingInvoice.fileName})
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {previewingInvoice.fileSize} • Uploaded on {previewingInvoice.uploadDate}
                    </span>
                  </>
                ) : (
                  <>
                    <ImageIcon className="h-10 w-10 text-blue-500 mb-1" />
                    <span className="text-xs font-semibold text-slate-700">
                      Photo / Image Document ({previewingInvoice.fileName})
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {previewingInvoice.fileSize} • Uploaded on {previewingInvoice.uploadDate}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setPreviewingInvoice(null)}
                className="h-8 px-4 rounded-lg bg-slate-100 text-xs font-semibold text-slate-700 hover:bg-slate-200"
              >
                Close Preview
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Add Supplier to Job */}
      {isAddSupplierOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsAddSupplierOpen(false)}
          title="Add Supplier to Job"
          maxWidth="md"
        >
          <div className="space-y-4">
            <div className="flex rounded-lg bg-slate-100 p-1 text-xs">
              <button
                type="button"
                onClick={() => setSupplierTab("existing")}
                className={`flex-1 py-1.5 rounded font-semibold ${
                  supplierTab === "existing" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500"
                }`}
              >
                Choose Existing Supplier
              </button>
              <button
                type="button"
                onClick={() => setSupplierTab("new")}
                className={`flex-1 py-1.5 rounded font-semibold ${
                  supplierTab === "new" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500"
                }`}
              >
                + Register New Supplier
              </button>
            </div>

            {supplierTab === "existing" ? (
              <form onSubmit={handleAssignExisting} className="space-y-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select Supplier
                  </label>
                  <select
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                    required
                    className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                  >
                    <option value="">-- Choose a supplier --</option>
                    {suppliers.map((s) => {
                      const already = job.supplierIds.includes(s.id);
                      return (
                        <option key={s.id} value={s.id} disabled={already}>
                          {s.name} ({s.code}) {already ? "(Already Assigned)" : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setIsAddSupplierOpen(false)}
                    className="h-8 px-3 rounded text-xs text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!selectedSupplierId}
                    className="h-8 px-4 rounded bg-[#2563EB] text-xs font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50"
                  >
                    Assign Supplier
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleAddNewSupplier} className="space-y-2.5 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Supplier Name *
                  </label>
                  <input
                    type="text"
                    value={newSupName}
                    onChange={(e) => setNewSupName(e.target.value)}
                    required
                    className="h-8 w-full rounded border border-slate-200 px-2 text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Code *
                    </label>
                    <input
                      type="text"
                      value={newSupCode}
                      onChange={(e) => setNewSupCode(e.target.value)}
                      placeholder="e.g. SUP-06"
                      required
                      className="h-8 w-full rounded border border-slate-200 px-2 text-xs font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Contact Person
                    </label>
                    <input
                      type="text"
                      value={newSupContact}
                      onChange={(e) => setNewSupContact(e.target.value)}
                      className="h-8 w-full rounded border border-slate-200 px-2 text-xs"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Phone</label>
                    <input
                      type="text"
                      value={newSupPhone}
                      onChange={(e) => setNewSupPhone(e.target.value)}
                      className="h-8 w-full rounded border border-slate-200 px-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={newSupEmail}
                      onChange={(e) => setNewSupEmail(e.target.value)}
                      className="h-8 w-full rounded border border-slate-200 px-2 text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Address</label>
                  <input
                    type="text"
                    value={newSupAddress}
                    onChange={(e) => setNewSupAddress(e.target.value)}
                    className="h-8 w-full rounded border border-slate-200 px-2 text-xs"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setIsAddSupplierOpen(false)}
                    className="h-8 px-3 rounded text-xs text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="h-8 px-4 rounded bg-[#2563EB] text-xs font-semibold text-white hover:bg-[#1d4ed8]"
                  >
                    Save & Assign
                  </button>
                </div>
              </form>
            )}
          </div>
        </Modal>
      )}

      {/* Edit Invoice Modal */}
      {editingInvoice && (
        <Modal
          isOpen={true}
          onClose={() => setEditingInvoice(null)}
          title="Edit Invoice"
          maxWidth="sm"
        >
          <form onSubmit={handleSaveInvoiceEdit} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Invoice Name *
              </label>
              <input
                type="text"
                value={editInvName}
                onChange={(e) => setEditInvName(e.target.value)}
                required
                className="h-8 w-full rounded border border-slate-200 px-2 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Invoice Date
                </label>
                <input
                  type="date"
                  value={editInvDate}
                  onChange={(e) => setEditInvDate(e.target.value)}
                  required
                  className="h-8 w-full rounded border border-slate-200 px-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Amount (Rs.)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editInvValue}
                  onChange={(e) => setEditInvValue(e.target.value)}
                  required
                  className="h-8 w-full rounded border border-slate-200 px-2 text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditingInvoice(null)}
                className="h-8 px-3 rounded text-xs text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-8 px-3.5 rounded bg-[#2563EB] text-xs font-semibold text-white hover:bg-[#1d4ed8]"
              >
                Save
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
