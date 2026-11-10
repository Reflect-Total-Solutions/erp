"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { Modal } from "@/components/admin/ui/modal";
import { useAdminData } from "@/context/admin-data-context";
import { formatCurrency } from "@/lib/financial";
import {
  FileText,
  Upload,
  Plus,
  Trash2,
  Building2,
  Briefcase,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Search,
  Check,
  X,
  FileSpreadsheet,
  Download,
  Eye,
  Loader2,
  Calendar,
  User,
  ChevronDown,
  ExternalLink,
  Image as ImageIcon,
  Paperclip,
} from "lucide-react";
import { Decimal } from "decimal.js";
import {
  isSupportedExtension,
  getFileCategory,
  formatBytes,
  MAX_ATTACHMENT_SIZE_BYTES,
  FileCategory,
} from "@/lib/file-validation";
import {
  AttachmentPreviewModal,
  PreviewableAttachment,
} from "@/components/admin/modals/attachment-preview-modal";

interface SupplierOption {
  id: string;
  code: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
}

interface ApprovedJobOption {
  id: string;
  jobCode: string;
  name: string;
  clientName: string;
  date: string;
  commencingDate?: string;
  handledBy?: string;
  originalApprovedCost: number;
  currentSupplierCost: number;
  remainingBudget: number;
  costUtilization: number;
  isBudgetExceeded: boolean;
}

export interface RowAttachmentItem {
  id: string;
  file: File;
  name: string;
  size: number;
  formattedSize: string;
  category: FileCategory;
  previewUrl?: string;
  error?: string;
}

export interface InvoiceRowItem {
  id: string;
  description: string;
  amount: string;
  attachments: RowAttachmentItem[];
}

interface CreateSupplierInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (createdInvoice: any) => void;
  preselectedJobId?: string;
}

export function CreateSupplierInvoiceModal({
  isOpen,
  onClose,
  onSuccess,
  preselectedJobId,
}: CreateSupplierInvoiceModalProps) {
  const { jobs: contextJobs, suppliers: contextSuppliers } = useAdminData();

  // Supplier selection state
  const [supplierSearch, setSupplierSearch] = useState("");
  const [suppliersList, setSuppliersList] = useState<SupplierOption[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierOption | null>(null);
  const [isSupplierDropdownOpen, setIsSupplierDropdownOpen] = useState(false);
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState(false);

  // Job selection state (Strictly APPROVED jobs)
  const [jobSearch, setJobSearch] = useState("");
  const [approvedJobsList, setApprovedJobsList] = useState<ApprovedJobOption[]>([]);
  const [selectedJob, setSelectedJob] = useState<ApprovedJobOption | null>(null);
  const [isJobDropdownOpen, setIsJobDropdownOpen] = useState(false);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);

  // Invoice header
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [notes, setNotes] = useState("");

  // Dynamic rows state
  const [rows, setRows] = useState<InvoiceRowItem[]>([
    { id: "row-1", description: "", amount: "", attachments: [] },
  ]);

  // Preview Modal state
  const [previewAttachment, setPreviewAttachment] = useState<PreviewableAttachment | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStageText, setUploadStageText] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [createdInvoiceResult, setCreatedInvoiceResult] = useState<any | null>(null);

  const supplierSearchTimeout = useRef<NodeJS.Timeout | null>(null);
  const jobSearchTimeout = useRef<NodeJS.Timeout | null>(null);
  const supplierSearchSeq = useRef(0);
  const jobSearchSeq = useRef(0);

  // Search Approved Jobs (Excludes Pending/Rejected - strictly APPROVED only)
  const searchApprovedJobs = useCallback(async (query: string = "") => {
    const currentSeq = ++jobSearchSeq.current;
    setIsLoadingJobs(true);
    let apiSuccess = false;
    try {
      const res = await fetch(`/api/jobs/approved?search=${encodeURIComponent(query)}`);
      if (res.ok) {
        const json = await res.json();
        if (currentSeq === jobSearchSeq.current && json.success && Array.isArray(json.data)) {
          setApprovedJobsList(json.data);
          apiSuccess = true;
          if (preselectedJobId) {
            const found = json.data.find((j: any) => j.id === preselectedJobId);
            if (found) setSelectedJob((prev) => prev || found);
          }
        }
      }
    } catch (err) {
      if (currentSeq === jobSearchSeq.current) {
        console.error("searchApprovedJobs error:", err);
      }
    } finally {
      if (currentSeq === jobSearchSeq.current) {
        setIsLoadingJobs(false);
      }
    }

    if (!apiSuccess && currentSeq === jobSearchSeq.current) {
      const matchingContextJobs = (contextJobs || [])
        .filter((j) => {
          const isApproved = ["APPROVED", "Approved"].includes(j.status);
          if (!isApproved || j.isDeleted || j.deletedAt) return false;
          if (!query.trim()) return true;
          const q = query.toLowerCase();
          return (
            (j.jobCode && j.jobCode.toLowerCase().includes(q)) ||
            j.name.toLowerCase().includes(q) ||
            (j.clientName && j.clientName.toLowerCase().includes(q))
          );
        })
        .map((j) => {
          const approvedCost = Number(j.grandTotal || j.totalCost || 0);
          return {
            id: j.id,
            jobCode: j.jobCode || "JOB",
            name: j.name,
            clientName: j.clientName || "Valued Client",
            date: j.date,
            commencingDate: j.commencingDate || j.date,
            handledBy: j.handledBy || "Admin",
            originalApprovedCost: approvedCost,
            currentSupplierCost: 0,
            remainingBudget: approvedCost,
            costUtilization: 0,
            isBudgetExceeded: false,
          };
        });

      setApprovedJobsList(matchingContextJobs);
      if (preselectedJobId) {
        const found = matchingContextJobs.find((j) => j.id === preselectedJobId);
        if (found) setSelectedJob((prev) => prev || found);
      }
    }
  }, [preselectedJobId, contextJobs]);

  // Search Suppliers (Real-time server search with race condition mitigation)
  const searchSuppliers = useCallback(async (query: string) => {
    const currentSeq = ++supplierSearchSeq.current;
    setIsLoadingSuppliers(true);
    let apiSuccess = false;
    try {
      const res = await fetch(`/api/suppliers/search?search=${encodeURIComponent(query)}`);
      if (res.ok) {
        const json = await res.json();
        if (currentSeq === supplierSearchSeq.current && json.success && Array.isArray(json.data)) {
          setSuppliersList(json.data);
          apiSuccess = true;
        }
      }
    } catch (err) {
      if (currentSeq === supplierSearchSeq.current) {
        console.error("searchSuppliers error:", err);
      }
    } finally {
      if (currentSeq === supplierSearchSeq.current) {
        setIsLoadingSuppliers(false);
      }
    }

    if (!apiSuccess && currentSeq === supplierSearchSeq.current && contextSuppliers && contextSuppliers.length > 0) {
      const filtered = contextSuppliers
        .filter((s) => !s.isDeleted && !s.deletedAt)
        .filter((s) => {
          if (!query.trim()) return true;
          const q = query.toLowerCase();
          return (
            s.name.toLowerCase().includes(q) ||
            s.code.toLowerCase().includes(q) ||
            (s.contactPerson && s.contactPerson.toLowerCase().includes(q)) ||
            (s.phone && s.phone.toLowerCase().includes(q))
          );
        })
        .map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
          contactPerson: s.contactPerson,
          phone: s.phone,
          email: s.email,
          address: s.address,
        }));
      setSuppliersList(filtered);
    }
  }, [contextSuppliers]);

  // Fetch initial suppliers and approved jobs
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isOpen) {
        // Reset state on close
        setSelectedSupplier(null);
        setSelectedJob(null);
        setSupplierSearch("");
        setJobSearch("");
        setInvoiceNumber("");
        setInvoiceDate("");
        setNotes("");
        setRows([{ id: "row-1", description: "", amount: "", attachments: [] }]);
        setSubmitError("");
        setCreatedInvoiceResult(null);
        return;
      }

      // Initialize invoice date on open (deferred in useEffect for SSR/prerender safety)
      setInvoiceDate(new Date().toISOString().split("T")[0]);

      // Load initial suppliers
      void searchSuppliers("");
      // Load approved jobs
      void searchApprovedJobs("");
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, searchSuppliers, searchApprovedJobs]);

  // Pre-select job if provided
  useEffect(() => {
    if (!preselectedJobId || approvedJobsList.length === 0) return;
    const match = approvedJobsList.find((j) => j.id === preselectedJobId);
    if (!match) return;
    const timer = setTimeout(() => {
      setSelectedJob((prev) => prev || match);
    }, 0);
    return () => clearTimeout(timer);
  }, [preselectedJobId, approvedJobsList]);

  const handleSupplierSearchChange = (val: string) => {
    setSupplierSearch(val);
    setIsSupplierDropdownOpen(true);
    if (supplierSearchTimeout.current) clearTimeout(supplierSearchTimeout.current);
    supplierSearchTimeout.current = setTimeout(() => {
      searchSuppliers(val);
    }, 200);
  };

  const handleJobSearchChange = (val: string) => {
    setJobSearch(val);
    setIsJobDropdownOpen(true);
    if (jobSearchTimeout.current) clearTimeout(jobSearchTimeout.current);
    jobSearchTimeout.current = setTimeout(() => {
      searchApprovedJobs(val);
    }, 200);
  };

  // Dynamic Row Actions
  const handleAddRow = () => {
    const nextId = "row-" + Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
    setRows((prev) => [
      ...prev,
      { id: nextId, description: "", amount: "", attachments: [] },
    ]);
  };

  const handleRemoveRow = (id: string) => {
    if (rows.length <= 1) return;
    const target = rows.find((r) => r.id === id);
    if (target) {
      target.attachments.forEach((att) => {
        if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
      });
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleRowChange = (id: string, field: "description" | "amount", value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const handleAddFilesToRow = (rowId: string, fileList: FileList | File[]) => {
    const newAttachments: RowAttachmentItem[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const cleanName = file.name;
      const ext = cleanName.split(".").pop()?.toLowerCase() || "";
      const isSupported = isSupportedExtension(cleanName);
      const category = getFileCategory(cleanName, file.type);

      let error: string | undefined = undefined;
      if (!isSupported) {
        error = `.${ext || "file"} not supported. Allowed: PDF, Word, Images.`;
      } else if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        error = `Exceeds 15MB limit (${formatBytes(file.size)}).`;
      }

      let previewUrl: string | undefined = undefined;
      if (category === "image" || category === "pdf") {
        try {
          previewUrl = URL.createObjectURL(file);
        } catch {
          // ignore
        }
      }

      newAttachments.push({
        id: "att-" + Date.now().toString(36) + Math.random().toString(36).substring(2, 6) + i,
        file,
        name: cleanName,
        size: file.size,
        formattedSize: formatBytes(file.size),
        category,
        previewUrl,
        error,
      });
    }

    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? { ...r, attachments: [...r.attachments, ...newAttachments] }
          : r
      )
    );
  };

  const handleRemoveAttachment = (rowId: string, attId: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const target = r.attachments.find((a) => a.id === attId);
        if (target?.previewUrl) {
          URL.revokeObjectURL(target.previewUrl);
        }
        return {
          ...r,
          attachments: r.attachments.filter((a) => a.id !== attId),
        };
      })
    );
  };

  const handleOpenPreview = (att: RowAttachmentItem, rowDescription?: string) => {
    if (!att.previewUrl && att.category !== "word") return;
    setPreviewAttachment({
      name: att.name,
      url: att.previewUrl || "",
      category: att.category,
      size: att.formattedSize,
      description: rowDescription,
    });
    setIsPreviewModalOpen(true);
  };

  // Automatic Total Calculation (Decimal.js)
  const totalInvoiceAmount = useMemo(() => {
    let sum = new Decimal(0);
    for (const row of rows) {
      const cleanVal = row.amount.replace(/,/g, "").trim();
      const num = parseFloat(cleanVal);
      if (!isNaN(num) && num > 0) {
        sum = sum.plus(new Decimal(cleanVal));
      }
    }
    return sum.toNumber();
  }, [rows]);

  // Projected Remaining Job Budget
  const projectedRemainingBudget = useMemo(() => {
    if (!selectedJob) return 0;
    const currentRemaining = selectedJob.remainingBudget;
    return currentRemaining - totalInvoiceAmount;
  }, [selectedJob, totalInvoiceAmount]);

  const isBudgetExceeded = projectedRemainingBudget < 0;

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setSubmitError("");

    if (!selectedSupplier) {
      setSubmitError("Please select a registered supplier.");
      return;
    }

    if (!selectedJob) {
      setSubmitError("Please select an approved project Job.");
      return;
    }

    // Validate rows
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.description.trim()) {
        setSubmitError(`Row ${i + 1}: Please enter an item description.`);
        return;
      }
      const cleanAmt = row.amount.replace(/,/g, "").trim();
      const num = parseFloat(cleanAmt);
      if (isNaN(num) || num <= 0) {
        setSubmitError(`Row ${i + 1}: Please enter a valid invoice amount greater than 0.00.`);
        return;
      }
      if (!row.attachments || row.attachments.length === 0) {
        setSubmitError(`Row ${i + 1}: Please attach at least one invoice document (PDF, Word, or Image).`);
        return;
      }
      const hasErrorAttachment = row.attachments.some((a) => a.error);
      if (hasErrorAttachment) {
        setSubmitError(`Row ${i + 1}: Contains invalid attachment(s). Please remove them before submitting.`);
        return;
      }
    }

    const totalAttachments = rows.reduce((acc, r) => acc + (r.attachments?.length || 0), 0);
    setIsSubmitting(true);
    setUploadProgress(0);
    setUploadStageText(
      totalAttachments > 0
        ? "1. Uploading attachments to Supabase Storage..."
        : "1. Preparing invoice data..."
    );

    try {
      const formData = new FormData();
      formData.append("supplierId", selectedSupplier.id);
      formData.append("jobId", selectedJob.id);
      if (invoiceNumber.trim()) {
        formData.append("invoiceNumber", invoiceNumber.trim());
      }
      formData.append("invoiceDate", invoiceDate);
      formData.append("notes", notes.trim());

      const itemsPayload = rows.map((r, idx) => ({
        rowNumber: idx + 1,
        description: r.description.trim(),
        amount: parseFloat(r.amount.replace(/,/g, "").trim()),
      }));
      formData.append("items", JSON.stringify(itemsPayload));

      // Append multiple files per row
      rows.forEach((r, idx) => {
        r.attachments.forEach((att) => {
          formData.append(`files_${idx}`, att.file);
        });
      });

      // Track real byte upload progress using XMLHttpRequest
      const json: any = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/supplier-invoices");

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const pct = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(pct);
            if (pct < 100) {
              setUploadStageText(
                totalAttachments > 0
                  ? `1. Uploading attachments to Supabase Storage (${pct}%)...`
                  : `1. Sending invoice data (${pct}%)...`
              );
            } else {
              setUploadStageText("2. Saving invoice metadata & line items...");
            }
          }
        };

        xhr.onload = () => {
          setUploadStageText("3. Recalculating Job Cost & Gross Profit...");
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300 && data.success) {
              resolve(data);
            } else {
              reject(new Error(data.error || "Failed to create supplier invoice."));
            }
          } catch {
            reject(new Error("Invalid response format received from server."));
          }
        };

        xhr.onerror = () => {
          reject(new Error("Network connection error during invoice submission."));
        };

        xhr.send(formData);
      });

      setUploadStageText("4. Finalizing Supplier Invoice...");
      setCreatedInvoiceResult(json.data);
      onSuccess(json.data);
    } catch (err: any) {
      console.error("Create supplier invoice error:", err?.message || String(err));
      setSubmitError(err?.message || "An unexpected error occurred while saving the supplier invoice.");
    } finally {
      setIsSubmitting(false);
      setUploadProgress(0);
      setUploadStageText("");
    }
  };

  const handleResetForAnother = () => {
    // Revoke preview URLs
    rows.forEach((r) => {
      r.attachments.forEach((a) => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      });
    });
    setCreatedInvoiceResult(null);
    setInvoiceNumber("");
    setRows([{ id: "row-1", description: "", amount: "", attachments: [] }]);
    setSubmitError("");
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Supplier Invoice & Record Actual Job Cost"
      maxWidth="4xl"
    >
      {createdInvoiceResult ? (
        // Success View
        <div className="py-6 text-center space-y-5">
          <div className="h-16 w-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto border-2 border-emerald-300">
            <CheckCircle2 className="h-9 w-9 stroke-[2.5]" />
          </div>

          <div>
            <h3 className="text-xl font-bold text-slate-900">
              Supplier Invoice Created Successfully!
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Actual supplier expense has been recorded and automatically updated in the linked Job budget.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 max-w-md mx-auto text-left text-xs space-y-2">
            <div className="flex justify-between py-1 border-b border-slate-200">
              <span className="text-slate-500">Invoice Reference:</span>
              <span className="font-mono font-bold text-blue-700">
                {createdInvoiceResult.invoiceNumber}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200">
              <span className="text-slate-500">Supplier:</span>
              <span className="font-semibold text-slate-800">
                {createdInvoiceResult.supplierName}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200">
              <span className="text-slate-500">Linked Job:</span>
              <span className="font-semibold text-slate-800">
                {createdInvoiceResult.jobCode} • {createdInvoiceResult.jobName}
              </span>
            </div>
            {createdInvoiceResult.purchaseOrderNumber && (
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-500">Linked Purchase Order:</span>
                <span className="font-mono font-bold text-indigo-700">
                  {createdInvoiceResult.purchaseOrderNumber}
                </span>
              </div>
            )}
            <div className="flex justify-between py-1.5 font-bold">
              <span className="text-slate-700">Total Invoice Amount:</span>
              <span className="text-base text-emerald-700 font-mono">
                {formatCurrency(createdInvoiceResult.totalAmount, { showCurrencyPrefix: true })}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 pt-4">
            <button
              type="button"
              onClick={handleResetForAnother}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
            >
              + Create Another Invoice
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-xs font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-xs"
            >
              Close & View Invoices
            </button>
          </div>
        </div>
      ) : (
        // Creation Form
        <form onSubmit={handleSubmit} className="space-y-6 text-xs">
          {submitError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-800">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <div>
                <p className="font-bold">Cannot Save Invoice</p>
                <p className="mt-0.5 text-[11px] leading-relaxed">{submitError}</p>
              </div>
            </div>
          )}

          {/* Section 1: Supplier & Job Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Section A: Supplier Selection */}
            <div className="space-y-2">
              <label className="block font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                1. Select Supplier <span className="text-rose-500">*</span>
              </label>

              <div className="relative">
                <div className="flex items-center border border-slate-300 rounded-lg bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
                  <Building2 className="h-4 w-4 text-slate-400 mr-2 shrink-0" />
                  <input
                    type="text"
                    value={selectedSupplier ? `${selectedSupplier.name} (${selectedSupplier.code})` : supplierSearch}
                    onChange={(e) => {
                      setSelectedSupplier(null);
                      handleSupplierSearchChange(e.target.value);
                    }}
                    onFocus={() => {
                      setIsSupplierDropdownOpen(true);
                      if (suppliersList.length === 0) searchSuppliers(supplierSearch);
                    }}
                    placeholder="Search or choose supplier..."
                    className="w-full text-xs text-slate-900 bg-transparent outline-none"
                  />
                  {selectedSupplier ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSupplier(null);
                        setSupplierSearch("");
                        searchSuppliers("");
                      }}
                      className="text-slate-400 hover:text-slate-600 ml-1 p-0.5"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : isLoadingSuppliers ? (
                    <Loader2 className="h-4 w-4 text-blue-600 animate-spin ml-1" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setIsSupplierDropdownOpen((prev) => !prev);
                        if (!isSupplierDropdownOpen && suppliersList.length === 0) {
                          searchSuppliers(supplierSearch);
                        }
                      }}
                      className="text-slate-400 hover:text-slate-600 ml-1 p-0.5"
                    >
                      <ChevronDown className={`h-4 w-4 transition-transform ${isSupplierDropdownOpen ? "rotate-180" : ""}`} />
                    </button>
                  )}
                </div>

                {/* Dropdown */}
                {isSupplierDropdownOpen && !selectedSupplier && (
                  <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto divide-y divide-slate-100">
                    {suppliersList.length === 0 ? (
                      <div className="p-3 text-center text-slate-400">
                        {isLoadingSuppliers ? "Searching suppliers..." : "No active suppliers found."}
                      </div>
                    ) : (
                      suppliersList.map((sup) => (
                        <div
                          key={sup.id}
                          onClick={() => {
                            setSelectedSupplier(sup);
                            setIsSupplierDropdownOpen(false);
                          }}
                          className="p-2.5 hover:bg-blue-50 cursor-pointer transition-colors flex items-center justify-between"
                        >
                          <div>
                            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                              <span>{sup.name}</span>
                              <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                                {sup.code}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              Contact: {sup.contactPerson || "—"} • {sup.phone || "No phone"}
                            </p>
                          </div>
                          <Check className="h-4 w-4 text-blue-600 opacity-0 group-hover:opacity-100" />
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Selected Supplier Card */}
              {selectedSupplier && (
                <div className="p-3 rounded-lg bg-blue-50/70 border border-blue-200 text-slate-700 space-y-1 text-[11px]">
                  <div className="flex items-center justify-between font-bold text-blue-900">
                    <span>{selectedSupplier.name}</span>
                    <span className="font-mono text-[10px] bg-blue-200/70 px-1.5 py-0.5 rounded">
                      {selectedSupplier.code}
                    </span>
                  </div>
                  <p>Contact: {selectedSupplier.contactPerson || "Primary Contact"} • {selectedSupplier.phone}</p>
                  <p className="text-slate-500 truncate">{selectedSupplier.address || selectedSupplier.email}</p>
                </div>
              )}
            </div>

            {/* Section B: Approved Job Selection (Strictly Approved Jobs Only) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                  2. Select Approved Job <span className="text-rose-500">*</span>
                </label>
                {approvedJobsList.length > 0 && !selectedJob && (
                  <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    {approvedJobsList.length} Approved Job{approvedJobsList.length > 1 ? "s" : ""} Available
                  </span>
                )}
              </div>

              {isLoadingJobs && approvedJobsList.length === 0 ? (
                <div className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 text-xs">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600 shrink-0" />
                  <span>Loading verified approved jobs...</span>
                </div>
              ) : !selectedJob ? (
                approvedJobsList.length === 0 ? (
                  <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/70 text-slate-700 space-y-1.5 text-xs">
                    <div className="flex items-center gap-2 text-amber-800 font-bold">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                      <span>No Approved Jobs Found</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Only jobs with status <strong className="text-emerald-700">APPROVED</strong> can have supplier invoices recorded against them. Pending approval and rejected jobs are excluded.
                    </p>
                    <div className="pt-1">
                      <Link
                        href="/admin/approvals"
                        target="_blank"
                        className="inline-flex items-center gap-1.5 text-xs text-blue-700 font-bold hover:underline"
                      >
                        <span>Open Job Approvals</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <select
                        value={selectedJob ? (selectedJob as any).id : ""}
                        onChange={(e) => {
                          const found = approvedJobsList.find((j) => j.id === e.target.value);
                          if (found) setSelectedJob(found);
                        }}
                        className="w-full h-11 pl-9 pr-8 rounded-xl border-2 border-blue-200 bg-white text-xs text-slate-900 font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-600 outline-none transition-all cursor-pointer shadow-xs hover:border-blue-400"
                      >
                        <option value="">
                          -- Click to Choose Approved Job ({approvedJobsList.length} Available) --
                        </option>
                        {approvedJobsList.map((job) => (
                          <option key={job.id} value={job.id}>
                            {job.jobCode} — {job.name} (Budget: {formatCurrency(job.originalApprovedCost)})
                          </option>
                        ))}
                      </select>
                      <Briefcase className="absolute left-3 top-3.5 h-4 w-4 text-blue-600 pointer-events-none" />
                    </div>
                    <p className="text-[10px] text-slate-500 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                      Showing only approved jobs eligible for supplier expense booking.
                    </p>
                  </div>
                )
              ) : (
                /* Selected Job Card with Complete Financial Overview */
                <div className="rounded-xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50/80 to-teal-50/40 p-3.5 space-y-2.5 shadow-xs transition-all">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-emerald-600 text-white shadow-2xs">
                          {selectedJob.jobCode}
                        </span>
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-md">
                          APPROVED
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-slate-900 line-clamp-1 mt-1">
                        {selectedJob.name}
                      </h4>
                      <p className="text-[11px] text-slate-600">
                        Client: <span className="font-semibold text-slate-800">{selectedJob.clientName}</span>
                        {selectedJob.handledBy && ` • Handled By: ${selectedJob.handledBy}`}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedJob(null)}
                      className="shrink-0 text-[11px] font-semibold text-slate-700 hover:text-rose-600 bg-white hover:bg-rose-50 border border-slate-300 hover:border-rose-300 px-2.5 py-1 rounded-lg transition-colors shadow-2xs flex items-center gap-1 cursor-pointer"
                      title="Select a different approved job"
                    >
                      <X className="h-3 w-3" />
                      <span>Change Job</span>
                    </button>
                  </div>

                  {/* 3 Metric Cards */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-emerald-200/80 text-[11px]">
                    <div className="bg-white/90 rounded-lg p-2 border border-emerald-100 shadow-2xs">
                      <span className="text-[10px] text-slate-500 font-medium block">Approved Budget</span>
                      <span className="font-mono font-bold text-slate-900 text-xs">
                        {formatCurrency(selectedJob.originalApprovedCost)}
                      </span>
                    </div>
                    <div className="bg-white/90 rounded-lg p-2 border border-emerald-100 shadow-2xs">
                      <span className="text-[10px] text-slate-500 font-medium block">Current Expenses</span>
                      <span className="font-mono font-bold text-amber-700 text-xs">
                        {formatCurrency(selectedJob.currentSupplierCost)}
                      </span>
                    </div>
                    <div className="bg-white/90 rounded-lg p-2 border border-emerald-100 shadow-2xs">
                      <span className="text-[10px] text-slate-500 font-medium block">Remaining Budget</span>
                      <span className="font-mono font-bold text-emerald-700 text-xs">
                        {formatCurrency(selectedJob.remainingBudget)}
                      </span>
                    </div>
                  </div>

                  {/* Utilization Bar */}
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-600 font-medium">Approved Budget Utilization</span>
                      <span className="font-mono font-bold text-slate-800">
                        {selectedJob.costUtilization.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 rounded-full ${
                          selectedJob.costUtilization > 100
                            ? "bg-rose-500"
                            : selectedJob.costUtilization > 85
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                        }`}
                        style={{ width: `${Math.min(100, selectedJob.costUtilization)}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Invoice Metadata (Ref #, Date, Notes) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Invoice Reference # (Optional)
              </label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="e.g. INV-SUP-2026-001 (Auto if empty)"
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Invoice Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                required
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Remarks / Notes
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional supplier notes..."
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Section 3: Dynamic Supplier Invoice Rows */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div>
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                  3. Dynamic Supplier Invoice Entries & Attachments
                </h4>
                <p className="text-[11px] text-slate-500">
                  Add each individual bill item with its specific description, PDF attachment, and amount.
                </p>
              </div>

              <button
                type="button"
                onClick={handleAddRow}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 font-semibold transition-colors shadow-2xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Row</span>
              </button>
            </div>

            {/* Dynamic Rows Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100/80 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <th className="py-2.5 px-3 w-10 text-center">No</th>
                    <th className="py-2.5 px-3 min-w-[180px]">Description</th>
                    <th className="py-2.5 px-3 min-w-[280px]">Attach Files (PDF, Word, Images)</th>
                    <th className="py-2.5 px-3 w-36 text-right">Invoice Amount (Rs.)</th>
                    <th className="py-2.5 px-2 w-12 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {rows.map((row, idx) => (
                    <tr key={row.id} className="hover:bg-slate-50/60 transition-colors align-top">
                      {/* Row Number */}
                      <td className="py-3 px-3 text-center font-mono font-bold text-slate-400">
                        {idx + 1}
                      </td>

                      {/* Description */}
                      <td className="py-3 px-3">
                        <input
                          type="text"
                          value={row.description}
                          onChange={(e) => handleRowChange(row.id, "description", e.target.value)}
                          placeholder="e.g. Printing Materials, Stage Construction..."
                          required
                          className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </td>

                      {/* Attach Files (Multiple PDF, Word, Images) */}
                      <td className="py-3 px-3">
                        <div className="space-y-2">
                          {/* List of uploaded attachments */}
                          {row.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {row.attachments.map((att) => (
                                <div
                                  key={att.id}
                                  className={`group flex items-center gap-1.5 p-1 px-1.5 rounded-md text-[11px] border transition-all ${
                                    att.error
                                      ? "bg-rose-50 border-rose-300 text-rose-800"
                                      : att.category === "image"
                                      ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                                      : att.category === "word"
                                      ? "bg-blue-50 border-blue-200 text-blue-900"
                                      : "bg-slate-100 border-slate-200 text-slate-800"
                                  }`}
                                >
                                  {/* Icon or Thumbnail */}
                                  {att.category === "image" && att.previewUrl ? (
                                    <Image
                                      unoptimized
                                      src={att.previewUrl}
                                      alt={att.name}
                                      width={24}
                                      height={24}
                                      className="h-6 w-6 rounded object-cover border border-emerald-300 shrink-0 cursor-pointer"
                                      onClick={() => handleOpenPreview(att, row.description)}
                                      title="Click to preview image"
                                    />
                                  ) : att.category === "word" ? (
                                    <FileText className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                  ) : (
                                    <FileText className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                                  )}

                                  {/* File Name & Size */}
                                  <div className="max-w-[130px] truncate">
                                    <span
                                      className="truncate block font-semibold leading-tight cursor-pointer hover:underline"
                                      title={att.name}
                                      onClick={() => handleOpenPreview(att, row.description)}
                                    >
                                      {att.name}
                                    </span>
                                    <span className="text-[9px] text-slate-400 block font-mono">
                                      {att.formattedSize}
                                    </span>
                                  </div>

                                  {/* Action Buttons */}
                                  <div className="flex items-center gap-0.5 ml-1 shrink-0">
                                    {att.previewUrl && (
                                      <button
                                        type="button"
                                        onClick={() => handleOpenPreview(att, row.description)}
                                        className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-white transition-colors cursor-pointer"
                                        title="Preview attachment"
                                      >
                                        <Eye className="h-3 w-3" />
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => handleRemoveAttachment(row.id, att.id)}
                                      className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-white transition-colors cursor-pointer"
                                      title="Remove this attachment"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Upload Dropzone */}
                          <label
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                                handleAddFilesToRow(row.id, e.dataTransfer.files);
                              }
                            }}
                            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-slate-300 hover:border-blue-500 bg-slate-50/70 hover:bg-blue-50/40 cursor-pointer transition-colors text-slate-600 group"
                          >
                            <Upload className="h-3.5 w-3.5 text-blue-600 group-hover:scale-110 transition-transform shrink-0" />
                            <span className="text-[11px] font-semibold text-slate-700">
                              {row.attachments.length === 0
                                ? "Attach Files (PDF, Word, Images)"
                                : "+ Add More Attachments"}
                            </span>
                            <span className="text-[10px] text-slate-400 hidden sm:inline">
                              (Drag & Drop or Browse)
                            </span>
                            <input
                              type="file"
                              multiple
                              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp"
                              onChange={(e) => {
                                if (e.target.files && e.target.files.length > 0) {
                                  handleAddFilesToRow(row.id, e.target.files);
                                  e.target.value = "";
                                }
                              }}
                              className="hidden"
                            />
                          </label>

                          {/* Individual error notices if any file failed validation */}
                          {row.attachments.some((a) => a.error) && (
                            <p className="text-[10px] text-rose-600 font-semibold">
                              One or more files have format/size errors. Please remove them.
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-3 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={row.amount}
                          onChange={(e) => handleRowChange(row.id, "amount", e.target.value)}
                          placeholder="0.00"
                          required
                          className="w-full text-right px-2.5 py-1.5 rounded-md border border-slate-300 font-mono font-semibold text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(row.id)}
                          disabled={rows.length <= 1}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:hover:text-slate-400 disabled:hover:bg-transparent transition-colors cursor-pointer"
                          title="Remove row"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 4: Live Total & Budget Impact Calculation */}
          <div className="p-4 rounded-xl bg-slate-900 text-white space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <span className="text-slate-400 text-[11px] block">Total Invoice Summary</span>
                <span className="text-sm font-semibold text-slate-200">
                  {rows.length} Invoice Row{rows.length === 1 ? "" : "s"} Configured
                </span>
              </div>

              <div className="text-right">
                <span className="text-slate-400 text-[11px] block">Supplier Invoice Total</span>
                <span className="text-2xl font-extrabold text-emerald-400 font-mono">
                  {formatCurrency(totalInvoiceAmount, { showCurrencyPrefix: true })}
                </span>
              </div>
            </div>

            {/* Budget Impact when Job is Selected */}
            {selectedJob && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                <div>
                  <span className="text-slate-400 text-[10px] block">Original Job Budget</span>
                  <span className="font-mono font-bold text-slate-200">
                    {formatCurrency(selectedJob.originalApprovedCost)}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 text-[10px] block">Current Recorded Expenses</span>
                  <span className="font-mono font-bold text-slate-200">
                    {formatCurrency(selectedJob.currentSupplierCost)}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 text-[10px] block">Projected Remaining Budget</span>
                  <span
                    className={`font-mono font-bold text-sm ${
                      isBudgetExceeded ? "text-rose-400" : "text-emerald-400"
                    }`}
                  >
                    {formatCurrency(projectedRemainingBudget)}
                  </span>
                </div>
              </div>
            )}

            {isBudgetExceeded && (
              <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-[11px] flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>
                  <strong>Warning:</strong> Adding this invoice will cause actual supplier expenses to exceed the approved Job budget by{" "}
                  <strong className="font-mono">{formatCurrency(Math.abs(projectedRemainingBudget))}</strong>.
                </span>
              </div>
            )}

            {isSubmitting && (
              <div className="p-3 rounded-xl bg-blue-50/80 border border-blue-200 space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between text-xs font-semibold text-blue-900">
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                    <span>{uploadStageText || "Processing invoice..."}</span>
                  </span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-blue-200/60 overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all duration-300 rounded-full"
                    style={{ width: `${Math.max(5, uploadProgress)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold rounded-lg text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting || totalInvoiceAmount <= 0}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{uploadStageText ? uploadStageText.split(" (")[0] : "Saving Invoice..."}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Submit Invoice ({formatCurrency(totalInvoiceAmount)})</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Embedded File Preview Lightbox / Modal */}
      <AttachmentPreviewModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        attachment={previewAttachment}
      />
    </Modal>
  );
}
