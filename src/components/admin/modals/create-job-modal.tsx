"use client";

import React, { useState, useRef } from "react";
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
  AlertCircle,
  CheckCircle2,
  FileUp,
  Loader2,
  Layers,
  DollarSign,
  AlertTriangle,
  RotateCcw,
  Eye,
  ChevronDown,
  ChevronUp,
  Check,
  Building,
  User,
  ArrowRight,
  ShieldAlert,
  Download,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { ParsedJobData } from "@/lib/excel-parser";
import { formatCurrency } from "@/lib/financial";

interface CreateJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJobCreated?: (newJobId: string) => void;
}

export interface StagedQuotationFile {
  id: string;
  file: File;
  fileName: string;
  fileSize: string;
  status:
    | "pending"
    | "parsing"
    | "parsed"
    | "uploading"
    | "processing"
    | "completed"
    | "error"
    | "failed"
    | "duplicate_rejected";
  errorMessage?: string;
  isDuplicate?: boolean;
  duplicateReason?: string;
  duplicateDetails?: {
    originalFileName: string;
    existingJobId: string;
    existingJobNumber: string;
    existingJobTitle: string;
    existingClientName?: string | null;
    uploadedDate: string;
    duplicateReason: string;
  } | null;
  // Editable extracted data
  parsedData?: ParsedJobData;
  name: string;
  jobCode: string;
  clientName: string;
  date: string;
  commencingDate: string;
  handledBy: string;
  description: string;
  // Progress tracking
  uploadProgress?: number;
  processingStage?: string;
}

interface CreatedJobInfo {
  id: string;
  jobCode: string;
  name: string;
  clientName?: string;
  grandTotal: number;
  totalCost?: number;
  fileUrl?: string;
  fileName: string;
  originalFile?: File;
}

interface FailedFileInfo {
  fileName: string;
  error: string;
  isDuplicate?: boolean;
  duplicateDetails?: any;
}

interface BulkUploadSummaryResult {
  totalFiles: number;
  successCount: number;
  failedCount: number;
  totalCostOfAllJobs: number;
  createdJobs: CreatedJobInfo[];
  failedFiles: FailedFileInfo[];
}

export function CreateJobModal({ isOpen, onClose, onJobCreated }: CreateJobModalProps) {
  const { jobs, refreshJobs, showToast } = useAdminData();

  const [stagedFiles, setStagedFiles] = useState<StagedQuotationFile[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsingBatch, setIsParsingBatch] = useState(false);
  const [parsingStageText, setParsingStageText] = useState("");
  const [showCostBreakdownTable, setShowCostBreakdownTable] = useState(true);

  // Upload & processing progress states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadCurrentIndex, setUploadCurrentIndex] = useState(0);
  const [uploadTotalCount, setUploadTotalCount] = useState(0);
  const [uploadCompletedCount, setUploadCompletedCount] = useState(0);
  const [uploadFailedCount, setUploadFailedCount] = useState(0);
  const [uploadCurrentFileName, setUploadCurrentFileName] = useState("");
  const [uploadOverallProgress, setUploadOverallProgress] = useState(0);
  const [uploadCurrentStage, setUploadCurrentStage] = useState("");

  // Post-upload summary modal state
  const [summaryResult, setSummaryResult] = useState<BulkUploadSummaryResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetAll = () => {
    setStagedFiles([]);
    setActiveFileIndex(0);
    setIsParsingBatch(false);
    setIsSubmitting(false);
    setUploadCurrentIndex(0);
    setUploadTotalCount(0);
    setUploadCompletedCount(0);
    setUploadFailedCount(0);
    setUploadOverallProgress(0);
    setUploadCurrentFileName("");
    setUploadCurrentStage("");
    setSummaryResult(null);
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  // ── Drag & Drop Handlers ──────────────────────────────────────────────────
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  // ── File Selection & Parsing ─────────────────────────────────────────────
  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const validFiles: File[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      const lower = f.name.toLowerCase();
      if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        validFiles.push(f);
      }
    }

    if (validFiles.length === 0) {
      showToast("Invalid File Type", "Please select valid Excel quotation files (.xlsx or .xls).", "error");
      return;
    }

    // Create preliminary staged file items
    const newStaged: StagedQuotationFile[] = validFiles.map((file) => {
      const sizeKB = Math.round(file.size / 1024);
      const sizeStr = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB || 50} KB`;
      return {
        id: "staged-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7),
        file,
        fileName: file.name,
        fileSize: sizeStr,
        status: "parsing",
        name: file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " "),
        jobCode: "",
        clientName: "",
        date: new Date().toISOString().split("T")[0],
        commencingDate: new Date().toISOString().split("T")[0],
        handledBy: "",
        description: "",
      };
    });

    const startIndex = stagedFiles.length;
    setStagedFiles((prev) => [...prev, ...newStaged]);
    setActiveFileIndex(startIndex);
    setIsParsingBatch(true);
    setParsingStageText("Reading Excel worksheets & calculating file hash...");

    try {
      const formData = new FormData();
      validFiles.forEach((file) => {
        formData.append("files", file);
      });

      setParsingStageText("Extracting job details, cost categories & line items...");

      const res = await fetch("/api/jobs/parse-excel", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        showToast("Parsing Notice", json.error || "Some files could not be parsed automatically.", "error");
      }

      const results = json.results || [];

      // Update staged files with parsed results & duplicate flags
      setStagedFiles((prev) =>
        prev.map((item) => {
          const matchResult = results.find((r: any) => r.fileName === item.fileName);
          if (!matchResult) return item;

          if (!matchResult.success) {
            return {
              ...item,
              status: "error",
              errorMessage: matchResult.error || "Failed to parse spreadsheet.",
            };
          }

          if (matchResult.isDuplicate) {
            return {
              ...item,
              status: "duplicate_rejected",
              isDuplicate: true,
              duplicateReason: matchResult.duplicateReason || "This Excel file has already been uploaded.",
              duplicateDetails: matchResult.duplicateDetails || null,
              name: matchResult.data?.name || item.name,
              jobCode: matchResult.data?.jobCode || "",
              clientName: matchResult.data?.clientName || "",
            };
          }

          const d: ParsedJobData = matchResult.data;
          return {
            ...item,
            status: "parsed",
            parsedData: d,
            isDuplicate: false,
            name: d.name || item.name,
            jobCode: d.jobCode || "",
            clientName: d.clientName || "",
            date: d.date || item.date,
            commencingDate: d.commencingDate || item.commencingDate,
            handledBy: d.handledBy || "",
            description: d.description || "",
          };
        })
      );
    } catch (err: any) {
      console.error("Batch parse error:", err);
      showToast("Parse Error", "Failed to communicate with Excel parsing service.", "error");
    } finally {
      setIsParsingBatch(false);
      setParsingStageText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── Staged File Management ───────────────────────────────────────────────
  const handleRemoveStagedFile = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setStagedFiles((prev) => {
      const filtered = prev.filter((f) => f.id !== id);
      if (activeFileIndex >= filtered.length) {
        setActiveFileIndex(Math.max(0, filtered.length - 1));
      }
      return filtered;
    });
  };

  const handleUpdateActiveField = (field: keyof StagedQuotationFile, value: any) => {
    setStagedFiles((prev) =>
      prev.map((item, idx) => (idx === activeFileIndex ? { ...item, [field]: value } : item))
    );
  };

  const currentActiveFile = stagedFiles[activeFileIndex];

  // ── Download Helper ──────────────────────────────────────────────────────
  const handleDownloadOriginalFile = (created: CreatedJobInfo) => {
    if (created.originalFile) {
      const url = URL.createObjectURL(created.originalFile);
      const a = document.createElement("a");
      a.href = url;
      a.download = created.fileName || "Original_Quotation.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else if (created.fileUrl && created.fileUrl.startsWith("http")) {
      window.open(created.fileUrl, "_blank");
    }
  };

  // ── Submit Staged Files (Sequential with Live Real-time Progress) ────────
  const handleSaveAllJobs = async (filesOverride?: StagedQuotationFile[]) => {
    // Only upload non-duplicate, successfully parsed files
    const targetFiles = (filesOverride || stagedFiles).filter(
      (f) => (f.status === "parsed" || f.status === "error") && !f.isDuplicate && f.name.trim()
    );

    if (targetFiles.length === 0) {
      showToast(
        "Cannot Submit",
        "Please ensure at least one valid, non-duplicate Excel file is ready to create.",
        "error"
      );
      return;
    }

    setIsSubmitting(true);
    setUploadCurrentIndex(0);
    setUploadTotalCount(targetFiles.length);
    setUploadCompletedCount(0);
    setUploadFailedCount(0);
    setUploadOverallProgress(0);

    const successfullyCreated: CreatedJobInfo[] = [];
    const failedList: FailedFileInfo[] = [];
    let combinedCost = 0;

    for (let i = 0; i < targetFiles.length; i++) {
      const f = targetFiles[i];
      setUploadCurrentIndex(i + 1);
      setUploadCurrentFileName(f.fileName);
      setUploadCurrentStage("1. Uploading Excel file...");

      // Update state for this specific file
      setStagedFiles((prev) =>
        prev.map((item) => (item.id === f.id ? { ...item, status: "uploading", uploadProgress: 5 } : item))
      );

      let serverStageTimer: any = null;

      try {
        const formData = new FormData();
        formData.append("files", f.file);

        const pd = f.parsedData;
        const payload = [
          {
            fileName: f.fileName,
            fileSize: f.fileSize,
            fileHash: pd?.fileHash,
            name: f.name.trim(),
            jobCode: f.jobCode.trim() || undefined,
            clientName: f.clientName.trim() || undefined,
            date: f.date,
            commencingDate: f.commencingDate || f.date,
            handledBy: f.handledBy.trim() || undefined,
            description: f.description.trim() || undefined,
            status: "PENDING_APPROVAL",
            totalCost: pd?.costSummary?.subTotal || 0,
            grandTotal: pd?.costSummary?.grandTotal || 0,
            costCategories: pd?.costCategories || [],
            allCostItems: pd?.allCostItems || [],
            costSummary: pd?.costSummary,
          },
        ];
        formData.append("payload", JSON.stringify(payload));

        // Use XMLHttpRequest to track real byte upload progress
        const resJson: any = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/jobs/bulk-upload");

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const filePercent = Math.round((event.loaded / event.total) * 100);
              const overall = Math.round(((i + filePercent / 100) / targetFiles.length) * 100);
              setUploadOverallProgress(overall);
              setUploadCurrentStage(`1. Uploading Excel file (${filePercent}%)...`);
              setStagedFiles((prev) =>
                prev.map((item) => (item.id === f.id ? { ...item, uploadProgress: filePercent } : item))
              );

              if (filePercent >= 100) {
                // Bytes transferred; advancing through server processing stages
                const backendStages = [
                  "2. Reading worksheets...",
                  "3. Extracting Job Information...",
                  "4. Extracting Cost Categories...",
                  "5. Extracting Cost Items...",
                  "6. Calculating Financial Totals...",
                  "7. Validating Excel Data...",
                  "8. Saving to Database...",
                ];
                let bIdx = 0;
                setUploadCurrentStage(backendStages[0]);
                serverStageTimer = setInterval(() => {
                  bIdx++;
                  if (bIdx < backendStages.length) {
                    setUploadCurrentStage(backendStages[bIdx]);
                  } else {
                    clearInterval(serverStageTimer);
                  }
                }, 300);
              }
            }
          };

          xhr.onload = () => {
            if (serverStageTimer) clearInterval(serverStageTimer);
            setUploadCurrentStage("9. Saving Original Excel to Storage...");
            setTimeout(() => {
              setUploadCurrentStage("10. Completing Job Creation...");
            }, 100);

            try {
              const data = JSON.parse(xhr.responseText);
              resolve(data);
            } catch {
              reject(new Error("Invalid response format from server."));
            }
          };

          xhr.onerror = () => {
            if (serverStageTimer) clearInterval(serverStageTimer);
            reject(new Error("Network connection error during file upload."));
          };

          xhr.send(formData);
        });

        if (resJson.createdJobs && resJson.createdJobs.length > 0) {
          const created = resJson.createdJobs[0];
          successfullyCreated.push({
            id: created.id,
            jobCode: created.jobCode,
            name: created.name,
            clientName: created.clientName,
            grandTotal: created.grandTotal,
            totalCost: created.totalCost,
            fileUrl: created.fileUrl,
            fileName: f.fileName,
            originalFile: f.file,
          });
          combinedCost += created.grandTotal || 0;
          setUploadCompletedCount((c) => c + 1);

          setStagedFiles((prev) =>
            prev.map((item) =>
              item.id === f.id
                ? {
                    ...item,
                    status: "completed",
                    uploadProgress: 100,
                    processingStage: "Completed",
                  }
                : item
            )
          );
        } else if (resJson.failedFiles && resJson.failedFiles.length > 0) {
          const failed = resJson.failedFiles[0];
          failedList.push({
            fileName: f.fileName,
            error: failed.error || "File upload rejected.",
            isDuplicate: failed.isDuplicate,
            duplicateDetails: failed.duplicateDetails,
          });
          setUploadFailedCount((c) => c + 1);

          setStagedFiles((prev) =>
            prev.map((item) =>
              item.id === f.id
                ? {
                    ...item,
                    status: failed.isDuplicate ? "duplicate_rejected" : "error",
                    isDuplicate: failed.isDuplicate,
                    duplicateDetails: failed.duplicateDetails,
                    errorMessage: failed.error,
                  }
                : item
            )
          );
        }
      } catch (fileErr: any) {
        if (serverStageTimer) clearInterval(serverStageTimer);
        setUploadFailedCount((c) => c + 1);
        failedList.push({
          fileName: f.fileName,
          error: fileErr.message || "Failed to process file.",
        });
        setStagedFiles((prev) =>
          prev.map((item) =>
            item.id === f.id ? { ...item, status: "error", errorMessage: fileErr.message } : item
          )
        );
      }

      const completedOverall = Math.round(((i + 1) / targetFiles.length) * 100);
      setUploadOverallProgress(completedOverall);
    }

    await refreshJobs();

    setSummaryResult({
      totalFiles: targetFiles.length,
      successCount: successfullyCreated.length,
      failedCount: failedList.length,
      totalCostOfAllJobs: combinedCost,
      createdJobs: successfullyCreated,
      failedFiles: failedList,
    });

    setIsSubmitting(false);

    if (successfullyCreated.length > 0 && failedList.length === 0) {
      showToast(
        "Upload Complete",
        `Job Created Successfully! ${successfullyCreated.length} quotation job(s) created.`,
        "success"
      );
    } else if (successfullyCreated.length > 0 && failedList.length > 0) {
      showToast(
        "Partial Upload",
        `Created ${successfullyCreated.length} job(s), ${failedList.length} failed or rejected as duplicate.`,
        "info"
      );
    } else {
      showToast("Upload Failed", "No jobs were created. Please inspect duplicate notices or errors.", "error");
    }
  };

  // ── Retry Failed Files ──────────────────────────────────────────────────
  const handleRetryFailed = () => {
    const failedFilesToRetry = stagedFiles.filter(
      (f) => (f.status === "error" || f.status === "failed") && !f.isDuplicate
    );
    if (failedFilesToRetry.length > 0) {
      setSummaryResult(null);
      handleSaveAllJobs(failedFilesToRetry);
    }
  };

  // ── Post-Upload Success & Summary View ──────────────────────────────────
  if (summaryResult) {
    const isSingleSuccess = summaryResult.successCount === 1 && summaryResult.failedCount === 0;
    const singleJob = isSingleSuccess ? summaryResult.createdJobs[0] : null;

    return (
      <Modal isOpen={isOpen} onClose={handleClose} title="Quotation Upload Summary" maxWidth="3xl">
        <div className="space-y-6 py-2">
          {/* Header Banner */}
          {summaryResult.successCount > 0 ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-emerald-950">Job Created Successfully!</h3>
                <p className="text-xs text-emerald-700 mt-0.5">
                  {summaryResult.successCount} quotation spreadsheet(s) processed and stored in database.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-rose-950">Upload Could Not Be Completed</h3>
                <p className="text-xs text-rose-700 mt-0.5">
                  All uploaded files were either duplicates or encountered processing errors.
                </p>
              </div>
            </div>
          )}

          {/* Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Total Files</span>
              <p className="mt-1 text-xl font-bold text-slate-900">{summaryResult.totalFiles}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-center">
              <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">Completed</span>
              <p className="mt-1 text-xl font-bold text-emerald-700">{summaryResult.successCount}</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 text-center">
              <span className="text-[10px] font-semibold text-rose-600 uppercase tracking-wider">Failed / Duplicate</span>
              <p className="mt-1 text-xl font-bold text-rose-700">{summaryResult.failedCount}</p>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 text-center">
              <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider">Combined Total</span>
              <p className="mt-1 text-base font-bold text-blue-700 truncate">
                {formatCurrency(summaryResult.totalCostOfAllJobs, { showCurrencyPrefix: true })}
              </p>
            </div>
          </div>

          {/* Single Job Highlight View (When 1 file uploaded) */}
          {singleJob && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-md bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700">
                      {singleJob.jobCode}
                    </span>
                    <h4 className="text-sm font-bold text-slate-900">{singleJob.name}</h4>
                  </div>
                  {singleJob.clientName && (
                    <p className="text-xs text-slate-600 mt-1 flex items-center gap-1.5">
                      <Building className="h-3.5 w-3.5 text-blue-600" />
                      Client: <strong>{singleJob.clientName}</strong>
                    </p>
                  )}
                </div>

                <div className="text-right">
                  <span className="text-[11px] text-slate-400 block">Total Quotation Value</span>
                  <span className="text-base font-bold text-blue-700">
                    {formatCurrency(singleJob.grandTotal, { showCurrencyPrefix: true })}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
                <span className="flex items-center gap-1.5 truncate">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600 shrink-0" />
                  Uploaded Excel: <strong className="text-slate-800">{singleJob.fileName}</strong>
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadOriginalFile(singleJob)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5 text-blue-600" />
                    <span>Download Original Excel</span>
                  </button>

                  {onJobCreated && (
                    <button
                      type="button"
                      onClick={() => {
                        handleClose();
                        onJobCreated(singleJob.id);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#1d4ed8] transition-colors"
                    >
                      <span>View Job</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Multiple Created Jobs List */}
          {!singleJob && summaryResult.createdJobs.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                Created Project Jobs ({summaryResult.createdJobs.length})
              </h4>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden max-h-60 overflow-y-auto">
                {summaryResult.createdJobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3.5 hover:bg-slate-50/80 transition-colors gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-md bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                          {job.jobCode}
                        </span>
                        <p className="text-xs font-bold text-slate-900">{job.name}</p>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                        {job.clientName && <span>Client: {job.clientName}</span>}
                        <span>File: {job.fileName}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs font-bold text-blue-700">
                        {formatCurrency(job.grandTotal, { showCurrencyPrefix: true })}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDownloadOriginalFile(job)}
                        className="p-1 text-slate-500 hover:text-blue-600 rounded"
                        title="Download original Excel file"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      {onJobCreated && (
                        <button
                          type="button"
                          onClick={() => {
                            handleClose();
                            onJobCreated(job.id);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1d4ed8]"
                        >
                          <span>View Job</span>
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Failed / Rejected Files */}
          {summaryResult.failedFiles.length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4 space-y-2.5">
              <h4 className="text-xs font-bold text-rose-900 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 text-rose-600" />
                  <span>Failed / Rejected Files ({summaryResult.failedFiles.length})</span>
                </span>
                {summaryResult.failedFiles.some((f) => !f.isDuplicate) && (
                  <button
                    type="button"
                    onClick={handleRetryFailed}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 hover:text-rose-900 underline"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Retry Non-Duplicate Failed</span>
                  </button>
                )}
              </h4>
              <div className="space-y-2">
                {summaryResult.failedFiles.map((f, idx) => (
                  <div key={idx} className="rounded-lg bg-white/80 border border-rose-200 p-2.5 text-xs text-rose-800">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900">{f.fileName}</span>
                      {f.isDuplicate && (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                          Duplicate Rejected
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-rose-700 mt-1">{f.error}</p>
                    {f.duplicateDetails && (
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] bg-slate-50 p-2 rounded border border-slate-200 text-slate-700">
                        <div>Existing Job: <strong>{f.duplicateDetails.existingJobNumber}</strong></div>
                        <div>Job Title: <strong>{f.duplicateDetails.existingJobTitle}</strong></div>
                        <div>Original File: <strong>{f.duplicateDetails.originalFileName}</strong></div>
                        <div>Uploaded Date: <strong>{f.duplicateDetails.uploadedDate}</strong></div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer Action Buttons */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Upload Another Job</span>
            </button>

            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg bg-[#2563EB] px-5 py-2 text-xs font-semibold text-white hover:bg-[#1d4ed8] transition-colors"
            >
              Done & Return to Jobs
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // ── Main Upload & Preview Modal ──────────────────────────────────────────
  const nonDuplicateCount = stagedFiles.filter((f) => f.status === "parsed" && !f.isDuplicate).length;
  const duplicateFilesCount = stagedFiles.filter((f) => f.isDuplicate).length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Create Jobs & Dynamic Excel Quotation Upload"
      maxWidth="4xl"
    >
      <div className="space-y-5 py-1">
        {/* Upload & Dropzone Area */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative rounded-xl border-2 border-dashed p-5 text-center transition-all ${
            isDragging
              ? "border-blue-500 bg-blue-50/60"
              : "border-slate-300 bg-slate-50/50 hover:bg-slate-50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".xlsx, .xls"
            onChange={(e) => handleFilesSelected(e.target.files)}
            className="hidden"
            id="quotation-bulk-input"
          />

          <div className="flex flex-col items-center justify-center">
            <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 mb-2">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <p className="text-xs font-bold text-slate-800">
              Drag & Drop Excel Quotations (.xlsx / .xls) here, or{" "}
              <label
                htmlFor="quotation-bulk-input"
                className="text-blue-600 hover:underline cursor-pointer"
              >
                browse computer
              </label>
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Supports multiple files simultaneously. Automatically extracts metadata, dynamic cost categories, RC/NRC, items, and tax summaries.
            </p>
          </div>

          {isParsingBatch && (
            <div className="absolute inset-0 bg-white/90 backdrop-blur-xs rounded-xl flex flex-col items-center justify-center gap-2 text-xs font-semibold text-blue-600 p-4">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>{parsingStageText || "Analyzing spreadsheet structures & calculating SHA-256 hash..."}</span>
            </div>
          )}
        </div>

        {/* Live Upload & Processing Loading Indicator (Section 16.A, 16.B, 16.C) */}
        {isSubmitting && (
          <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-3 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                <span className="text-xs font-bold text-blue-900">
                  Uploading & Processing Excel Files... (File {uploadCurrentIndex} of {uploadTotalCount})
                </span>
              </div>
              <span className="text-xs font-bold text-blue-700">{uploadOverallProgress}%</span>
            </div>

            {/* Animated Progress Bar */}
            <div className="h-2.5 w-full rounded-full bg-blue-100 overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-300 ease-out rounded-full"
                style={{ width: `${Math.max(5, uploadOverallProgress)}%` }}
              />
            </div>

            {/* Current File and Dynamic Stage */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-[11px] text-slate-600 pt-1">
              <span className="truncate max-w-sm">
                Active File: <strong className="text-slate-800">{uploadCurrentFileName}</strong>
              </span>
              <span className="font-semibold text-blue-700 flex items-center gap-1.5 shrink-0">
                <RefreshCw className="h-3 w-3 animate-spin" />
                <span>{uploadCurrentStage}</span>
              </span>
            </div>

            {/* Badges for Completed, Failed, Remaining */}
            <div className="flex items-center gap-2 pt-1 border-t border-blue-200/60 text-[11px]">
              <span className="rounded bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">
                Completed: {uploadCompletedCount}
              </span>
              <span className="rounded bg-rose-100 px-2 py-0.5 font-semibold text-rose-800">
                Failed: {uploadFailedCount}
              </span>
              <span className="rounded bg-slate-200 px-2 py-0.5 font-semibold text-slate-700">
                Remaining: {Math.max(0, uploadTotalCount - uploadCompletedCount - uploadFailedCount)}
              </span>
            </div>
          </div>
        )}

        {/* Staged Files Selector Tabs */}
        {stagedFiles.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-blue-600" />
                <span>Uploaded Files ({stagedFiles.length})</span>
                {duplicateFilesCount > 0 && (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full ml-1">
                    {duplicateFilesCount} duplicate rejected
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => setStagedFiles([])}
                disabled={isSubmitting}
                className="text-[11px] text-slate-500 hover:text-rose-600 disabled:opacity-50"
              >
                Clear All Files
              </button>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
              {stagedFiles.map((fileItem, idx) => {
                const isActive = idx === activeFileIndex;
                const isError = fileItem.status === "error";
                const isDuplicate = fileItem.isDuplicate;

                return (
                  <div
                    key={fileItem.id}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all shrink-0 ${
                      isActive
                        ? isDuplicate
                          ? "border-amber-500 bg-amber-50/60 shadow-2xs"
                          : isError
                          ? "border-rose-500 bg-rose-50/60 shadow-2xs"
                          : "border-blue-600 bg-blue-50/50 shadow-2xs"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveFileIndex(idx)}
                      className="flex items-center gap-2 text-left focus:outline-none cursor-pointer"
                    >
                      <FileSpreadsheet
                        className={`h-4 w-4 shrink-0 ${
                          isError ? "text-rose-500" : isDuplicate ? "text-amber-500" : "text-blue-600"
                        }`}
                      />
                      <div className="max-w-[140px] truncate">
                        <p className="text-xs font-semibold text-slate-900 truncate">
                          {fileItem.name || fileItem.fileName}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {isDuplicate ? "Duplicate" : fileItem.fileSize}
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleRemoveStagedFile(fileItem.id, e)}
                      disabled={isSubmitting}
                      className="ml-1 text-slate-400 hover:text-rose-600 p-0.5 rounded disabled:opacity-50 cursor-pointer"
                      title="Remove file"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Active File Preview & Edit Card */}
        {currentActiveFile && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4 shadow-2xs">
            {/* Status & Alerts Banner */}
            {currentActiveFile.status === "error" ? (
              <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                <div>
                  <p className="font-semibold">Parsing Error</p>
                  <p className="text-[11px] mt-0.5">{currentActiveFile.errorMessage}</p>
                </div>
              </div>
            ) : currentActiveFile.isDuplicate ? (
              /* Section 15: Strong Duplicate File Detected Card */
              <div className="rounded-xl border-2 border-amber-300 bg-amber-50/80 p-4 space-y-3 text-xs">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-amber-200/80 flex items-center justify-center text-amber-800 shrink-0 mt-0.5">
                      <ShieldAlert className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-amber-950">Duplicate File Detected!</h4>
                      <p className="text-xs text-amber-800 mt-0.5">
                        This Excel file has already been uploaded. Duplicate Job creation is not allowed.
                      </p>
                    </div>
                  </div>

                  <span className="rounded-md bg-amber-200/80 px-2.5 py-1 text-[11px] font-bold text-amber-900">
                    Upload Blocked
                  </span>
                </div>

                {/* Duplicate Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-amber-200/80">
                  <div className="rounded-lg bg-white/90 p-2.5 border border-amber-200">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                      Original File Name
                    </span>
                    <strong className="text-xs text-slate-900 block truncate mt-0.5">
                      {currentActiveFile.duplicateDetails?.originalFileName || currentActiveFile.fileName}
                    </strong>
                  </div>

                  <div className="rounded-lg bg-white/90 p-2.5 border border-amber-200">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                      Existing Job Number
                    </span>
                    <strong className="text-xs font-mono text-blue-700 block truncate mt-0.5">
                      {currentActiveFile.duplicateDetails?.existingJobNumber || "N/A"}
                    </strong>
                  </div>

                  <div className="rounded-lg bg-white/90 p-2.5 border border-amber-200">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                      Existing Job Title
                    </span>
                    <strong className="text-xs text-slate-900 block truncate mt-0.5">
                      {currentActiveFile.duplicateDetails?.existingJobTitle || "N/A"}
                    </strong>
                  </div>

                  <div className="rounded-lg bg-white/90 p-2.5 border border-amber-200">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                      Previously Uploaded Date
                    </span>
                    <strong className="text-xs text-slate-900 block truncate mt-0.5">
                      {currentActiveFile.duplicateDetails?.uploadedDate || "N/A"}
                    </strong>
                  </div>
                </div>

                {/* Open Existing Job Option */}
                <div className="flex items-center justify-between pt-1">
                  <p className="text-[11px] text-amber-700 italic">
                    SHA-256 content hash matched an existing database record.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleRemoveStagedFile(currentActiveFile.id)}
                      className="px-3 py-1.5 rounded-lg border border-amber-300 text-amber-900 hover:bg-amber-100 font-semibold text-xs"
                    >
                      Dismiss Duplicate
                    </button>
                    {currentActiveFile.duplicateDetails?.existingJobId && (
                      <a
                        href={`/admin/jobs/${currentActiveFile.duplicateDetails.existingJobId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 transition-colors shadow-2xs"
                      >
                        <span>Open Existing Job</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between bg-emerald-50/60 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-800">
                <div className="flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>
                    Excel Parsed Successfully: {currentActiveFile.parsedData?.allCostItems.length || 0} cost items
                    extracted across {currentActiveFile.parsedData?.costCategories.length || 0} categories.
                  </span>
                </div>
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                  Ready to Create
                </span>
              </div>
            )}

            {/* Extracted Metadata Edit Fields (Disabled if Duplicate) */}
            {!currentActiveFile.isDuplicate && (
              <>
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <Briefcase className="h-3.5 w-3.5 text-blue-600" />
                    <span>Extracted Job Information</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Job Title <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={currentActiveFile.name}
                        onChange={(e) => handleUpdateActiveField("name", e.target.value)}
                        placeholder="e.g. Keells Beach Carnival"
                        className="h-8 w-full rounded border border-slate-200 px-2.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-blue-600"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Client Name</label>
                      <input
                        type="text"
                        value={currentActiveFile.clientName}
                        onChange={(e) => handleUpdateActiveField("clientName", e.target.value)}
                        placeholder="e.g. Keells Supermarkets PLC"
                        className="h-8 w-full rounded border border-slate-200 px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-600"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Job Number / Code</label>
                      <input
                        type="text"
                        value={currentActiveFile.jobCode}
                        onChange={(e) => handleUpdateActiveField("jobCode", e.target.value)}
                        placeholder="Auto-generated if empty"
                        className="h-8 w-full rounded border border-slate-200 px-2.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-600"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Job Date</label>
                      <input
                        type="date"
                        value={currentActiveFile.date}
                        onChange={(e) => handleUpdateActiveField("date", e.target.value)}
                        className="h-8 w-full rounded border border-slate-200 px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-600"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Commencing Date</label>
                      <input
                        type="date"
                        value={currentActiveFile.commencingDate}
                        onChange={(e) => handleUpdateActiveField("commencingDate", e.target.value)}
                        className="h-8 w-full rounded border border-slate-200 px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-600"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Handled By</label>
                      <input
                        type="text"
                        value={currentActiveFile.handledBy}
                        onChange={(e) => handleUpdateActiveField("handledBy", e.target.value)}
                        placeholder="e.g. Account Manager"
                        className="h-8 w-full rounded border border-slate-200 px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-600"
                      />
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className="block font-semibold text-slate-700 mb-1 text-xs">Description / Scope</label>
                    <textarea
                      rows={2}
                      value={currentActiveFile.description}
                      onChange={(e) => handleUpdateActiveField("description", e.target.value)}
                      placeholder="Project details extracted from quotation..."
                      className="w-full rounded border border-slate-200 p-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-600"
                    />
                  </div>
                </div>

                {/* Financial Summary KPIs */}
                {currentActiveFile.parsedData?.costSummary && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Extracted Quotation Financial Summary</span>
                    </h4>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                        <span className="text-[10px] text-slate-400 uppercase font-semibold">Production Cost</span>
                        <p className="text-xs font-bold text-slate-900 mt-0.5">
                          {formatCurrency(currentActiveFile.parsedData.costSummary.productionCost, { showCurrencyPrefix: true })}
                        </p>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                        <span className="text-[10px] text-slate-400 uppercase font-semibold">Total Before Tax</span>
                        <p className="text-xs font-bold text-slate-900 mt-0.5">
                          {formatCurrency(currentActiveFile.parsedData.costSummary.totalBeforeTax, { showCurrencyPrefix: true })}
                        </p>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                        <span className="text-[10px] text-slate-400 uppercase font-semibold">
                          Tax ({currentActiveFile.parsedData.costSummary.taxType || "SSCL"}{" "}
                          {currentActiveFile.parsedData.costSummary.taxRate}%)
                        </span>
                        <p className="text-xs font-bold text-slate-900 mt-0.5">
                          {formatCurrency(currentActiveFile.parsedData.costSummary.taxAmount, { showCurrencyPrefix: true })}
                        </p>
                      </div>

                      <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-2.5">
                        <span className="text-[10px] text-blue-700 uppercase font-semibold">Final Grand Total</span>
                        <p className="text-xs font-bold text-blue-800 mt-0.5">
                          {formatCurrency(currentActiveFile.parsedData.costSummary.grandTotal, { showCurrencyPrefix: true })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Dynamic Cost Breakdown Accordion Table */}
                {currentActiveFile.parsedData?.costCategories &&
                  currentActiveFile.parsedData.costCategories.length > 0 && (
                    <div className="rounded-lg border border-slate-200 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setShowCostBreakdownTable(!showCostBreakdownTable)}
                        className="w-full flex items-center justify-between bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-100 transition-colors"
                      >
                        <span className="flex items-center gap-1.5">
                          <FileSpreadsheet className="h-3.5 w-3.5 text-blue-600" />
                          <span>
                            Dynamic Cost Breakdown ({currentActiveFile.parsedData.allCostItems.length} items across{" "}
                            {currentActiveFile.parsedData.costCategories.length} categories)
                          </span>
                        </span>
                        {showCostBreakdownTable ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>

                      {showCostBreakdownTable && (
                        <div className="max-h-60 overflow-y-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100/70 text-[11px] font-semibold text-slate-600 border-b border-slate-200 sticky top-0">
                              <tr>
                                <th className="px-3 py-2 w-12 text-center">#</th>
                                <th className="px-3 py-2">Item Description</th>
                                <th className="px-2 py-2 text-center w-16">RC/NRC</th>
                                <th className="px-2 py-2 text-right w-16">Qty</th>
                                <th className="px-3 py-2 text-right w-24">Rate (Rs.)</th>
                                <th className="px-3 py-2 text-right w-28">Total Cost (Rs.)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {currentActiveFile.parsedData.costCategories.map((cat, catIdx) => (
                                <React.Fragment key={catIdx}>
                                  <tr className="bg-slate-50 font-bold text-slate-700">
                                    <td colSpan={5} className="px-3 py-1.5 text-[11px] uppercase tracking-wide">
                                      📁 {cat.name}
                                    </td>
                                    <td className="px-3 py-1.5 text-right text-[11px]">
                                      {formatCurrency(cat.subtotal, { showCurrencyPrefix: true })}
                                    </td>
                                  </tr>
                                  {cat.items.map((item, itemIdx) => (
                                    <tr key={itemIdx} className="hover:bg-slate-50/50">
                                      <td className="px-3 py-1.5 text-center text-slate-400 text-[11px]">
                                        {item.itemNumber || itemIdx + 1}
                                      </td>
                                      <td className="px-3 py-1.5 text-slate-800 font-medium">{item.description}</td>
                                      <td className="px-2 py-1.5 text-center">
                                        <span
                                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                            item.rcNrc === "RC"
                                              ? "bg-amber-100 text-amber-800"
                                              : "bg-slate-100 text-slate-700"
                                          }`}
                                        >
                                          {item.rcNrc || "NRC"}
                                        </span>
                                      </td>
                                      <td className="px-2 py-1.5 text-right text-slate-600">{item.quantity}</td>
                                      <td className="px-3 py-1.5 text-right text-slate-600">
                                        {formatCurrency(item.rate, { showCurrencyPrefix: false })}
                                      </td>
                                      <td className="px-3 py-1.5 text-right font-semibold text-slate-900">
                                        {formatCurrency(item.totalCost, { showCurrencyPrefix: false })}
                                      </td>
                                    </tr>
                                  ))}
                                </React.Fragment>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
              </>
            )}
          </div>
        )}

        {/* Modal Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200">
          <p className="text-xs text-slate-500">
            {stagedFiles.length > 0
              ? `${nonDuplicateCount} of ${stagedFiles.length} file(s) ready to create.`
              : "Upload quotation spreadsheets to begin."}
            {duplicateFilesCount > 0 && (
              <span className="text-amber-600 font-medium ml-1">
                ({duplicateFilesCount} duplicate excluded)
              </span>
            )}
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={() => handleSaveAllJobs()}
              disabled={isSubmitting || nonDuplicateCount === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-5 py-2 text-xs font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50 shadow-2xs"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Processing {uploadCurrentIndex} of {uploadTotalCount}...</span>
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  <span>Create & Save {nonDuplicateCount} Job(s)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
