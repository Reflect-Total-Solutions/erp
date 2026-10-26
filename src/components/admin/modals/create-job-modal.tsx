"use client";

import React, { useState, useRef, useEffect } from "react";
import { Modal } from "@/components/admin/ui/modal";
import { useAdminData } from "@/context/admin-data-context";
import {
  Briefcase,
  Calendar,
  FileSpreadsheet,
  Upload,
  Plus,
  Trash2,
  X,
  Hash,
  AlertCircle,
  CheckCircle2,
  FileUp,
} from "lucide-react";

interface CreateJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJobCreated?: (newJobId: string) => void;
}

export interface StagedJobItem {
  id: string;
  jobName: string;
  jobDate: string;
  jobCode: string;
  remarks: string;
  file?: File;
  fileName?: string;
  fileSize?: string;
}

const INITIAL_STAGED_ROW: StagedJobItem = {
  id: "row-initial",
  jobName: "",
  jobDate: "",
  jobCode: "JOB-2026-001",
  remarks: "",
};

export function CreateJobModal({ isOpen, onClose, onJobCreated }: CreateJobModalProps) {
  const { jobs, addJob, addExcelFiles } = useAdminData();

  const [currentDate] = useState(() => (typeof window !== "undefined" ? new Date().toISOString().split("T")[0] : "2026-10-23"));
  const [stagedItems, setStagedItems] = useState<StagedJobItem[]>([INITIAL_STAGED_ROW]);
  const [isDragging, setIsDragging] = useState(false);
  const [errors, setErrors] = useState<Record<string, { jobName?: string; jobDate?: string }>>({});

  const bulkFileInputRef = useRef<HTMLInputElement>(null);
  const singleRowFileInputRef = useRef<{ [rowId: string]: HTMLInputElement | null }>({});

  const getTodayString = () => {
    return currentDate || new Date().toISOString().split("T")[0];
  };

  const createEmptyRow = (offsetIndex: number = 0, defaultDate?: string): StagedJobItem => {
    const codeNum = jobs.length + offsetIndex + 1;
    const dateToUse = defaultDate || getTodayString();
    return {
      id: "row-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
      jobName: "",
      jobDate: dateToUse,
      jobCode: `JOB-2026-${String(codeNum).padStart(3, "0")}`,
      remarks: "",
    };
  };

  // Initialized without cascading effects
  const resetRows = () => {
    const today = new Date().toISOString().split("T")[0];
    setStagedItems([createEmptyRow(0, today)]);
    setErrors({});
  };

  // Handle selecting multiple files in bulk
  const handleBulkFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const excelFiles = Array.from(files).filter(
      (f) => f.name.endsWith(".xlsx") || f.name.endsWith(".xls")
    );

    if (excelFiles.length === 0) return;

    const baseCount = jobs.length;
    const fileDate = getTodayString();

    const newRows: StagedJobItem[] = excelFiles.map((file, idx) => {
      // Auto-generate clean Job Name from the Excel file name
      const cleanName = file.name
        .replace(/\.[^/.]+$/, "")
        .replace(/[_-]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

      const sizeKB = Math.round(file.size / 1024);
      const sizeStr = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB || 80} KB`;
      const codeNum = baseCount + idx + 1;

      return {
        id: "row-" + Date.now() + "-" + idx + "-" + Math.random().toString(36).substring(2, 6),
        jobName: cleanName || "New Job Project",
        jobDate: fileDate,
        jobCode: `JOB-2026-${String(codeNum).padStart(3, "0")}`,
        remarks: "",
        file,
        fileName: file.name,
        fileSize: sizeStr,
      };
    });

    setStagedItems((prev) => {
      // If the current list only has 1 blank row without name and file, replace it with the new rows
      if (prev.length === 1 && !prev[0].jobName.trim() && !prev[0].file) {
        return newRows;
      }
      return [...prev, ...newRows];
    });

    // Reset input
    if (bulkFileInputRef.current) bulkFileInputRef.current.value = "";
  };

  // Add a blank row manually
  const handleAddBlankRow = () => {
    const nextOffset = stagedItems.length;
    setStagedItems((prev) => [...prev, createEmptyRow(nextOffset)]);
  };

  // Update specific field on a row
  const updateRow = (id: string, field: keyof StagedJobItem, value: any) => {
    setStagedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
    if (errors[id]) {
      setErrors((prev) => ({
        ...prev,
        [id]: { ...prev[id], [field]: undefined },
      }));
    }
  };

  // Attach a file to a specific row
  const handleAttachFileToRow = (rowId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) return;

    const sizeKB = Math.round(file.size / 1024);
    const sizeStr = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB || 80} KB`;

    setStagedItems((prev) =>
      prev.map((item) => {
        if (item.id === rowId) {
          // If jobName is empty, prefill from filename
          const cleanName = item.jobName.trim()
            ? item.jobName
            : file.name
                .replace(/\.[^/.]+$/, "")
                .replace(/[_-]/g, " ")
                .replace(/\b\w/g, (c) => c.toUpperCase());

          return {
            ...item,
            jobName: cleanName,
            file,
            fileName: file.name,
            fileSize: sizeStr,
          };
        }
        return item;
      })
    );
  };

  // Remove file from row
  const handleRemoveFileFromRow = (rowId: string) => {
    setStagedItems((prev) =>
      prev.map((item) =>
        item.id === rowId
          ? { ...item, file: undefined, fileName: undefined, fileSize: undefined }
          : item
      )
    );
  };

  // Remove a row
  const handleRemoveRow = (id: string) => {
    setStagedItems((prev) => {
      const next = prev.filter((item) => item.id !== id);
      if (next.length === 0) {
        return [createEmptyRow(0)];
      }
      return next;
    });
    setErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  // Submit all rows
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const rowErrors: Record<string, { jobName?: string; jobDate?: string }> = {};
    let hasError = false;

    stagedItems.forEach((row) => {
      const err: { jobName?: string; jobDate?: string } = {};
      if (!row.jobName.trim()) {
        err.jobName = "Job Name is required";
        hasError = true;
      }
      if (!row.jobDate) {
        err.jobDate = "Job Date is required";
        hasError = true;
      }
      if (Object.keys(err).length > 0) {
        rowErrors[row.id] = err;
      }
    });

    if (hasError) {
      setErrors(rowErrors);
      return;
    }

    let firstJobId: string | null = null;

    stagedItems.forEach((row, index) => {
      // 1. Create Job with its own Job Name and Job Date
      const created = addJob({
        name: row.jobName.trim(),
        jobCode: row.jobCode.trim().toUpperCase() || undefined,
        date: row.jobDate,
        remarks: row.remarks.trim() || undefined,
        status: "Active",
        supplierIds: [],
      });

      if (index === 0) {
        firstJobId = created.id;
      }

      // 2. Attach Excel file to this specific Job if uploaded
      if (row.file) {
        addExcelFiles([
          {
            jobId: created.id,
            fileName: row.fileName || row.file.name,
            customName: row.jobName.trim(),
            fileDate: row.jobDate,
            fileSize: row.fileSize || "120 KB",
            status: "Processed",
          },
        ]);
      }
    });

    onClose();
    if (firstJobId && onJobCreated) {
      onJobCreated(firstJobId);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Jobs & Bulk Excel Upload"
      description="Upload multiple Excel files. Each file has its own Job Name, Job Date, and Excel attachment."
      maxWidth="4xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Bulk Dropzone Area */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleBulkFiles(e.dataTransfer.files);
          }}
          onClick={() => bulkFileInputRef.current?.click()}
          className={`flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-xl border-2 border-dashed cursor-pointer transition-colors bg-slate-50/80 ${
            isDragging
              ? "border-blue-500 bg-blue-50/50"
              : "border-slate-300 hover:border-blue-400 hover:bg-slate-50"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">
                Bulk Upload: Drag & Drop multiple Excel files (.xlsx, .xls) here
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Every Excel file will automatically create a separate row with its own <strong>Job Name</strong> and <strong>Job Date</strong>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                bulkFileInputRef.current?.click();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 shadow-xs"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Select Excel Files</span>
            </button>
          </div>

          <input
            ref={bulkFileInputRef}
            type="file"
            multiple
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => handleBulkFiles(e.target.files)}
          />
        </div>

        {/* Section Header with count and Add Row button */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-900">
              Job Rows ({stagedItems.length})
            </span>
            <span className="text-[11px] text-slate-500">
              — Enter separate Job Name & Date for each Excel file
            </span>
          </div>

          <button
            type="button"
            onClick={handleAddBlankRow}
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Row</span>
          </button>
        </div>

        {/* List of Staged Jobs (Each has Job Name, Job Date, Job Code, and Excel File) */}
        <div className="max-h-[380px] overflow-y-auto space-y-2.5 pr-1">
          {stagedItems.map((item, index) => {
            const rowErr = errors[item.id];

            return (
              <div
                key={item.id}
                className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs hover:border-slate-300 transition-colors space-y-2.5"
              >
                {/* Row Header & Main Inputs */}
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <span className="h-5 w-5 rounded-full bg-slate-100 text-slate-600 font-bold text-[11px] flex items-center justify-center shrink-0">
                    {index + 1}
                  </span>

                  <span className="text-xs font-bold text-slate-700">
                    Job #{index + 1}
                  </span>

                  <div className="ml-auto flex items-center gap-2">
                    {item.file && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        <CheckCircle2 className="h-3 w-3" />
                        Excel Attached
                      </span>
                    )}

                    {stagedItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(item.id)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded"
                        title="Remove row"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Primary Fields: Job Name, Job Date, Job Code */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                  {/* Job Name */}
                  <div className="sm:col-span-5">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Job Name <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <Briefcase className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={item.jobName}
                        onChange={(e) => updateRow(item.id, "jobName", e.target.value)}
                        placeholder="e.g. Office Renovation Project"
                        required
                        className={`h-8 w-full rounded-lg border bg-white pl-8 pr-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600 ${
                          rowErr?.jobName ? "border-rose-400" : "border-slate-200"
                        }`}
                      />
                    </div>
                    {rowErr?.jobName && (
                      <p className="text-[10px] text-rose-500 mt-0.5">{rowErr.jobName}</p>
                    )}
                  </div>

                  {/* Job Date */}
                  <div className="sm:col-span-4">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Job Date <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="date"
                        value={item.jobDate}
                        onChange={(e) => updateRow(item.id, "jobDate", e.target.value)}
                        required
                        className={`h-8 w-full rounded-lg border bg-white pl-8 pr-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600 ${
                          rowErr?.jobDate ? "border-rose-400" : "border-slate-200"
                        }`}
                      />
                    </div>
                    {rowErr?.jobDate && (
                      <p className="text-[10px] text-rose-500 mt-0.5">{rowErr.jobDate}</p>
                    )}
                  </div>

                  {/* Job Code */}
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Job Code / Ref
                    </label>
                    <div className="relative">
                      <Hash className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={item.jobCode}
                        onChange={(e) => updateRow(item.id, "jobCode", e.target.value)}
                        placeholder="JOB-2026-001"
                        className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-7 pr-2 text-xs font-mono uppercase text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                      />
                    </div>
                  </div>
                </div>

                {/* Excel File Row and optional Remarks */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-1">
                  {/* Excel file indicator / attachment */}
                  <div className="sm:col-span-7">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Attached Excel File (.xlsx, .xls)
                    </label>

                    {item.file ? (
                      <div className="flex items-center justify-between h-8 px-2.5 bg-emerald-50/70 border border-emerald-200 rounded-lg text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          <span className="font-mono text-[11px] text-emerald-950 truncate font-semibold">
                            {item.fileName}
                          </span>
                          <span className="text-[10px] text-emerald-600 font-mono shrink-0">
                            ({item.fileSize})
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveFileFromRow(item.id)}
                          className="text-slate-400 hover:text-rose-600 p-0.5 ml-2"
                          title="Remove file"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => singleRowFileInputRef.current[item.id]?.click()}
                          className="h-8 px-3 rounded-lg border border-dashed border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/30 text-slate-600 hover:text-emerald-700 text-xs font-medium inline-flex items-center gap-1.5 transition-colors w-full"
                        >
                          <FileUp className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Attach Excel file for this job</span>
                        </button>

                        <input
                          ref={(el) => {
                            singleRowFileInputRef.current[item.id] = el;
                          }}
                          type="file"
                          accept=".xlsx,.xls"
                          className="hidden"
                          onChange={(e) => handleAttachFileToRow(item.id, e.target.files)}
                        />
                      </div>
                    )}
                  </div>

                  {/* Remarks / Notes */}
                  <div className="sm:col-span-5">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Remarks / Notes <span className="text-slate-400 font-normal">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      value={item.remarks}
                      onChange={(e) => updateRow(item.id, "remarks", e.target.value)}
                      placeholder="e.g. Priority client"
                      className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200">
          <div className="text-xs text-slate-500">
            Total to create: <strong className="text-slate-900">{stagedItems.length} Job{stagedItems.length > 1 ? "s" : ""}</strong>
            {" "}({stagedItems.filter((i) => i.file).length} with Excel files)
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-8 px-4 rounded-lg bg-[#2563EB] text-xs font-semibold text-white hover:bg-[#1d4ed8] shadow-xs"
            >
              {stagedItems.length > 1
                ? `Create ${stagedItems.length} Jobs & Upload`
                : "Create Job & Upload"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
