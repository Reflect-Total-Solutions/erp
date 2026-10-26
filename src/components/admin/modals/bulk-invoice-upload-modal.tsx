"use client";

import React, { useState, useRef, useEffect } from "react";
import { Modal } from "@/components/admin/ui/modal";
import { useAdminData } from "@/context/admin-data-context";
import {
  Upload,
  FileText,
  Trash2,
  Calendar,
  DollarSign,
  Building2,
  AlertCircle,
  Briefcase,
  Image as ImageIcon,
  CheckCircle2,
} from "lucide-react";
import { InvoiceStatus } from "@/types/admin";

interface BulkInvoiceUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedJobId?: string;
  onInvoicesUploaded?: () => void;
}

interface StagedInvoiceItem {
  id: string;
  file?: File;
  fileName: string;
  fileSize: string;
  fileType: "pdf" | "image";
  previewUrl?: string;
  invoiceName: string;
  invoiceDate: string;
  totalValue: string;
  supplierId: string;
  jobId: string;
  status: InvoiceStatus;
}

export function BulkInvoiceUploadModal({
  isOpen,
  onClose,
  preselectedJobId,
  onInvoicesUploaded,
}: BulkInvoiceUploadModalProps) {
  const { jobs, suppliers, addBulkInvoices } = useAdminData();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const defaultJobId = preselectedJobId || (jobs[0]?.id ?? "");
  const [selectedJobId, setSelectedJobId] = useState(defaultJobId);
  const [stagedInvoices, setStagedInvoices] = useState<StagedInvoiceItem[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isDragging, setIsDragging] = useState(false);

  // Selected job id is synced directly from props or state
  const activeJobId = preselectedJobId || selectedJobId || (jobs[0]?.id ?? "");

  // Handle file selection
  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const today = new Date().toISOString().split("T")[0];
    const validFiles = Array.from(files).filter((file) =>
      /\.(pdf|jpg|jpeg|png|webp)$/i.test(file.name)
    );

    const newItems: StagedInvoiceItem[] = validFiles.map((file, idx) => {
      const cleanName = file.name
        .replace(/\.[^/.]+$/, "")
        .replace(/[_-]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

      // Format file size
      const sizeKB = Math.round(file.size / 1024);
      const formattedSize =
        sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB || 320} KB`;

      const isPdf = file.name.toLowerCase().endsWith(".pdf");
      const isImg = /\.(jpg|jpeg|png|webp)$/i.test(file.name);

      // Select default supplier if available
      const job = jobs.find((j) => j.id === (preselectedJobId || activeJobId));
      const firstSupplierId = (job?.supplierIds && job.supplierIds[0]) || suppliers[0]?.id || "";

      return {
        id: "staged-" + Date.now() + "-" + idx + "-" + Math.random().toString(36).substring(2, 5),
        file,
        fileName: file.name,
        fileSize: formattedSize,
        fileType: isPdf ? "pdf" : "image",
        previewUrl: isImg ? URL.createObjectURL(file) : undefined,
        invoiceName: cleanName || `Invoice #${idx + 1}`,
        invoiceDate: today,
        totalValue: "",
        supplierId: firstSupplierId,
        jobId: preselectedJobId || activeJobId,
        status: "Pending" as InvoiceStatus,
      };
    });

    setStagedInvoices((prev) => [...prev, ...newItems]);
    setErrors({});
  };

  const removeStagedItem = (id: string) => {
    setStagedInvoices((prev) => prev.filter((item) => item.id !== id));
  };

  const updateStagedItem = (id: string, field: keyof StagedInvoiceItem, val: string) => {
    setStagedInvoices((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: val } : item))
    );
    // clear error for this field
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[`${id}-${field}`];
      return copy;
    });
  };

  const validate = () => {
    const errs: Record<string, string> = {};

    if (stagedInvoices.length === 0) {
      errs.general = "Please select at least one invoice file (Photo or PDF) to upload.";
    }

    stagedInvoices.forEach((item) => {
      if (!item.invoiceName.trim()) {
        errs[`${item.id}-invoiceName`] = "Invoice name required.";
      }
      if (!item.invoiceDate) {
        errs[`${item.id}-invoiceDate`] = "Invoice date required.";
      }
      const numVal = parseFloat(item.totalValue);
      if (item.totalValue && (isNaN(numVal) || numVal < 0)) {
        errs[`${item.id}-totalValue`] = "Valid positive amount required.";
      }
      if (!item.supplierId) {
        errs[`${item.id}-supplierId`] = "Supplier must be selected.";
      }
      if (!item.jobId) {
        errs[`${item.id}-jobId`] = "Job must be selected.";
      }
    });

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const invoicesToCreate = stagedInvoices.map((item) => ({
      jobId: item.jobId,
      supplierId: item.supplierId,
      invoiceName: item.invoiceName.trim(),
      invoiceDate: item.invoiceDate,
      totalValue: parseFloat(item.totalValue) || 0,
      fileName: item.fileName,
      fileSize: item.fileSize,
      status: item.status,
    }));

    addBulkInvoices(invoicesToCreate);
    setStagedInvoices([]);
    setErrors({});
    onClose();

    if (onInvoicesUploaded) {
      onInvoicesUploaded();
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => {
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Bulk Invoice Upload (Photos & PDFs)"
      description="Upload multiple invoice photos (.jpg, .png) or PDF files (.pdf) in bulk. Enter Invoice Name and Date for each file."
      maxWidth="3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Job Selector (if not preselected) */}
        {!preselectedJobId && (
          <div>
            <label className="block text-xs font-semibold text-[#0F172A] mb-1">
              Target Job <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Briefcase className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <select
                value={activeJobId}
                onChange={(e) => {
                  setSelectedJobId(e.target.value);
                  setStagedInvoices((prev) =>
                    prev.map((item) => ({ ...item, jobId: e.target.value }))
                  );
                }}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-blue-600"
              >
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name} ({j.date})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Drag & Drop Upload Box */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 text-center cursor-pointer transition-colors ${
            isDragging
              ? "border-[#2563EB] bg-blue-50/50"
              : "border-slate-300 hover:border-slate-400 bg-slate-50/50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white border border-slate-200 shadow-xs mb-2">
            <Upload className="h-5 w-5 text-[#2563EB]" />
          </div>
          <p className="text-xs font-bold text-slate-800">
            Click to select multiple invoice files or drag & drop here
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Supports <strong>Photos (.jpg, .jpeg, .png, .webp)</strong> & <strong>PDF Documents (.pdf)</strong>
          </p>
        </div>

        {errors.general && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-600">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errors.general}</span>
          </div>
        )}

        {/* Staged Invoice Items Card List */}
        {stagedInvoices.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#0F172A]">
                Selected Invoices ({stagedInvoices.length})
              </span>
              <button
                type="button"
                onClick={() => setStagedInvoices([])}
                className="text-xs text-rose-600 hover:underline font-medium"
              >
                Clear All
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1">
              {stagedInvoices.map((item, idx) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs space-y-2.5"
                >
                  {/* File Header with preview */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {item.fileType === "image" ? (
                        item.previewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.previewUrl}
                            alt="preview"
                            className="h-7 w-7 rounded object-cover border border-slate-200 shrink-0"
                          />
                        ) : (
                          <div className="h-7 w-7 rounded bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-200">
                            <ImageIcon className="h-4 w-4" />
                          </div>
                        )
                      ) : (
                        <div className="h-7 w-7 rounded bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200">
                          <FileText className="h-4 w-4" />
                        </div>
                      )}

                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase font-mono ${
                          item.fileType === "pdf"
                            ? "bg-rose-100 text-rose-700"
                            : "bg-blue-100 text-blue-700"
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
                      onClick={() => removeStagedItem(item.id)}
                      className="text-slate-400 hover:text-rose-600 p-1 rounded"
                      title="Remove file"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Form fields for this invoice (Name, Date, Supplier, Value) */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    {/* Invoice Name */}
                    <div className="sm:col-span-5">
                      <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                        Invoice Name / Title <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={item.invoiceName}
                        onChange={(e) =>
                          updateStagedItem(item.id, "invoiceName", e.target.value)
                        }
                        placeholder="e.g. Concrete Supply Voucher"
                        required
                        className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-blue-600"
                      />
                      {errors[`${item.id}-invoiceName`] && (
                        <p className="text-[10px] text-rose-500 mt-0.5">
                          {errors[`${item.id}-invoiceName`]}
                        </p>
                      )}
                    </div>

                    {/* Invoice Date */}
                    <div className="sm:col-span-4">
                      <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                        Invoice Date <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={item.invoiceDate}
                        onChange={(e) =>
                          updateStagedItem(item.id, "invoiceDate", e.target.value)
                        }
                        required
                        className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-blue-600"
                      />
                      {errors[`${item.id}-invoiceDate`] && (
                        <p className="text-[10px] text-rose-500 mt-0.5">
                          {errors[`${item.id}-invoiceDate`]}
                        </p>
                      )}
                    </div>

                    {/* Total Value */}
                    <div className="sm:col-span-3">
                      <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                        Value (Rs.)
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
                            updateStagedItem(item.id, "totalValue", e.target.value)
                          }
                          placeholder="0.00"
                          className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-2 text-xs text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-blue-600"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Supplier & Status */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-0.5">
                    {/* Supplier */}
                    <div className="sm:col-span-7">
                      <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                        Supplier <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={item.supplierId}
                        onChange={(e) =>
                          updateStagedItem(item.id, "supplierId", e.target.value)
                        }
                        className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-blue-600"
                      >
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Status */}
                    <div className="sm:col-span-5">
                      <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                        Status
                      </label>
                      <select
                        value={item.status}
                        onChange={(e) =>
                          updateStagedItem(item.id, "status", e.target.value as InvoiceStatus)
                        }
                        className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-blue-600"
                      >
                        <option value="Pending">Pending</option>
                        <option value="Approved">Approved</option>
                        <option value="Under Review">Under Review</option>
                        <option value="Paid">Paid</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <div className="text-xs text-slate-500">
            {stagedInvoices.length > 0 && (
              <span>
                Total Batch Value:{" "}
                <strong className="text-slate-900">
                  ${stagedInvoices
                    .reduce((acc, curr) => acc + (parseFloat(curr.totalValue) || 0), 0)
                    .toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </strong>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={stagedInvoices.length === 0}
              className="h-8 px-4 rounded-lg bg-[#2563EB] text-xs font-semibold text-white shadow-xs hover:bg-[#1d4ed8] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Upload {stagedInvoices.length} Invoice{stagedInvoices.length === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
