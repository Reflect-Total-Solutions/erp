"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { Modal } from "@/components/admin/ui/modal";
import { useAdminData } from "@/context/admin-data-context";
import { Decimal, formatCurrency, roundFinancial, toDecimal } from "@/lib/financial";
import { JobCostItemInvoiceInfo } from "@/types/admin";
import {
  computeInitialRowValuesFromCostItem,
  recalcRowPricingOnChange,
  normalizeRowAmountOnBlur,
} from "@/lib/supplier-invoice-calc";
import {
  JobCostLineSelector,
  JobCostCategoryGroup,
  JobCostTotalsSummary,
} from "@/components/admin/modals/job-cost-line-selector";
import {
  FileText,
  Upload,
  Plus,
  Trash2,
  Building2,
  Briefcase,
  AlertTriangle,
  CheckCircle2,
  Check,
  X,
  Eye,
  Loader2,
  ChevronDown,
  ExternalLink,
  Edit3,
  Lock,
  ShieldAlert,
  Calendar,
} from "lucide-react";
import {
  addCalendarDays,
  diffCalendarDays,
  getTodayDateKeyInTimezone,
  parseDateKeyToUtcMidnight,
} from "@/lib/supplier-payment-date";
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
  costItemsCount?: number;
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
  jobCostCategoryId: string | null;
  jobCostCategoryName: string | null;
  jobCostItemId: string | null;
  originalJobAmount: number | null;
  remainingAvailable: number | null;
  invoicedAmountBefore: number | null;
  description: string;
  quantity: string;
  unit: string;
  unitRate: string;
  amount: string;
  isAdditionalItem: boolean;
  budgetOverrideReason: string;
  isEditingDetails: boolean;
  notes: string;
  attachments: RowAttachmentItem[];
}

interface CreateSupplierInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (createdInvoice: any) => void;
  preselectedJobId?: string;
}

function makeManualRow(costCategoryName: string | null = null): InvoiceRowItem {
  return {
    id: "row-" + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
    jobCostCategoryId: null,
    jobCostCategoryName: costCategoryName,
    jobCostItemId: null,
    originalJobAmount: null,
    remainingAvailable: null,
    invoicedAmountBefore: null,
    description: "",
    quantity: "1",
    unit: "Nos",
    unitRate: "",
    amount: "",
    isAdditionalItem: true,
    budgetOverrideReason: "",
    isEditingDetails: true,
    notes: "",
    attachments: [],
  };
}

export function CreateSupplierInvoiceModal({
  isOpen,
  onClose,
  onSuccess,
  preselectedJobId,
}: CreateSupplierInvoiceModalProps) {
  const { jobs: contextJobs, suppliers: contextSuppliers, can } = useAdminData();

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

  // Job Excel Cost Lines state
  const [jobCostCategories, setJobCostCategories] = useState<JobCostCategoryGroup[]>([]);
  const [jobCostTotals, setJobCostTotals] = useState<JobCostTotalsSummary | null>(null);
  const [hasJobCostItems, setHasJobCostItems] = useState<boolean>(false);
  const [isLoadingJobCosts, setIsLoadingJobCosts] = useState(false);
  const [jobCostLoadError, setJobCostLoadError] = useState("");
  const [serverPerms, setServerPerms] = useState<{
    canOverrideBudget?: boolean;
    canManualEntry?: boolean;
  }>({});

  const canManualEntry = can("supplierInvoices", "manualEntry") || Boolean(serverPerms.canManualEntry);
  const canOverrideBudget =
    can("supplierInvoices", "overrideJobBudget") || Boolean(serverPerms.canOverrideBudget);
  const canOverrideDueDate =
    can("supplierInvoices", "overrideDueDate") || can("supplierPayments", "overrideDueDate");

  // Invoice header
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [paymentDueDate, setPaymentDueDate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [creditPeriodDays, setCreditPeriodDays] = useState("");
  const [dueDateManuallySet, setDueDateManuallySet] = useState(false);
  const [notes, setNotes] = useState("");
  const [budgetOverrideReason, setBudgetOverrideReason] = useState("");

  // Dynamic rows & entry-table checkbox selection state
  const [rows, setRows] = useState<InvoiceRowItem[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

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
  const jobCostFetchSeq = useRef(0);

  // Search Approved Jobs (Excludes Pending/Rejected - strictly APPROVED/eligible only)
  const searchApprovedJobs = useCallback(
    async (query: string = "") => {
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
            const isApproved = ["APPROVED", "Approved", "ACTIVE", "Active", "INVOICED", "Invoiced"].includes(
              j.status
            );
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
    },
    [preselectedJobId, contextJobs]
  );

  // Search Suppliers
  const searchSuppliers = useCallback(
    async (query: string) => {
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

      if (
        !apiSuccess &&
        currentSeq === supplierSearchSeq.current &&
        contextSuppliers &&
        contextSuppliers.length > 0
      ) {
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
    },
    [contextSuppliers]
  );

  // Load Job's Excel Cost Lines whenever selectedJob changes
  const fetchJobCostItems = useCallback(async (jobId: string) => {
    const seq = ++jobCostFetchSeq.current;
    setIsLoadingJobCosts(true);
    setJobCostLoadError("");
    try {
      const res = await fetch(`/api/supplier-invoices/job-cost-items?jobId=${encodeURIComponent(jobId)}`);
      const json = await res.json();
      if (seq !== jobCostFetchSeq.current) return;

      if (!res.ok || !json.success || !json.data) {
        setJobCostCategories([]);
        setJobCostTotals(null);
        setHasJobCostItems(false);
        setJobCostLoadError(json?.error || "Failed to load Job cost items.");
        return;
      }

      const categories: JobCostCategoryGroup[] = json.data.categories || [];
      const hasItems = Boolean(json.data.hasCostItems);
      setJobCostCategories(categories);
      setJobCostTotals(json.data.totals || null);
      setHasJobCostItems(hasItems);

      const resolvedPerms = json.permissions || {};
      setServerPerms(resolvedPerms);

      // Update selectedJob live numbers with latest authoritative totals from server
      if (json.data.job && json.data.totals) {
        setSelectedJob((prev) =>
          prev && prev.id === jobId
            ? {
                ...prev,
                originalApprovedCost: json.data.job.approvedJobValue,
                currentSupplierCost: json.data.totals.jobActiveSupplierCost,
                remainingBudget: json.data.totals.jobRemainingBudget,
              }
            : prev
        );
      }

      // If this Job has NO saved Excel cost lines and user has manual entry permission,
      // auto-seed 1 blank manual row if rows are currently empty.
      const allowManual = Boolean(resolvedPerms.canManualEntry);
      if (!hasItems && allowManual) {
        setRows((prev) => (prev.length === 0 ? [makeManualRow(null)] : prev));
      }
    } catch (err: any) {
      if (seq !== jobCostFetchSeq.current) return;
      console.error("fetchJobCostItems error:", err);
      setJobCostCategories([]);
      setJobCostTotals(null);
      setHasJobCostItems(false);
      setJobCostLoadError(err?.message || "Network error loading Job cost items.");
    } finally {
      if (seq === jobCostFetchSeq.current) {
        setIsLoadingJobCosts(false);
      }
    }
  }, []);

  // Revoke preview object URLs cleanly helper
  const revokeRowsPreviewUrls = useCallback((targetRows: InvoiceRowItem[]) => {
    targetRows.forEach((r) => {
      r.attachments.forEach((a) => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      });
    });
  }, []);

  // Reset or bootstrap modal on open/close
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isOpen) {
        setRows((prev) => {
          revokeRowsPreviewUrls(prev);
          return [];
        });
        setSelectedRowIds(new Set());
        setSelectedSupplier(null);
        setSelectedJob(null);
        setJobCostCategories([]);
        setJobCostTotals(null);
        setHasJobCostItems(false);
        setJobCostLoadError("");
        setSupplierSearch("");
        setJobSearch("");
        setInvoiceNumber("");
        setInvoiceDate("");
        setPaymentDueDate("");
        setPaymentTerms("");
        setCreditPeriodDays("");
        setDueDateManuallySet(false);
        setNotes("");
        setBudgetOverrideReason("");
        setSubmitError("");
        setCreatedInvoiceResult(null);
        return;
      }

      const todayKey = getTodayDateKeyInTimezone();
      setInvoiceDate(todayKey);
      setPaymentDueDate(todayKey);
      setPaymentTerms("");
      setCreditPeriodDays("");
      setDueDateManuallySet(false);
      void searchSuppliers("");
      void searchApprovedJobs("");
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, searchSuppliers, searchApprovedJobs, revokeRowsPreviewUrls]);

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

  // Trigger loading Excel cost items automatically whenever selectedJob changes
  const selectedJobId = selectedJob?.id || "";
  useEffect(() => {
    if (!isOpen || !selectedJobId) return;
    const timer = setTimeout(() => {
      void fetchJobCostItems(selectedJobId);
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, selectedJobId, fetchJobCostItems]);

  const handleSelectJob = (job: ApprovedJobOption | null) => {
    if (job?.id === selectedJob?.id) {
      setIsJobDropdownOpen(false);
      return;
    }
    // Clear rows and cost items linked to any previous Job when switching Jobs
    setRows((prev) => {
      revokeRowsPreviewUrls(prev);
      return [];
    });
    setSelectedRowIds(new Set());
    setJobCostCategories([]);
    setJobCostTotals(null);
    setHasJobCostItems(false);
    setJobCostLoadError("");
    setBudgetOverrideReason("");
    setSubmitError("");
    setSelectedJob(job);
    setIsJobDropdownOpen(false);
  };

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

  // Track which JobCostItem IDs are already present in `rows`
  const addedCostItemIds = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.jobCostItemId) set.add(r.jobCostItemId);
    });
    return set;
  }, [rows]);

  // Add selected cost lines as SEPARATE individual Supplier Invoice entry rows (no merging!)
  const handleAddSelectedCostItems = (selectedItems: JobCostItemInvoiceInfo[]) => {
    if (!selectedItems || selectedItems.length === 0) return;

    setRows((prev) => {
      const existingIds = new Set(prev.filter((r) => r.jobCostItemId).map((r) => r.jobCostItemId!));

      // Remove untouched completely blank manual starter rows before appending imported cost items
      const cleanedPrev = prev.filter((r) => {
        const isBlankStarter =
          !r.jobCostItemId &&
          !r.description.trim() &&
          (!r.amount.trim() || parseFloat(r.amount) === 0) &&
          r.attachments.length === 0;
        return !isBlankStarter;
      });

      const additions: InvoiceRowItem[] = [];
      selectedItems.forEach((ci, idx) => {
        if (existingIds.has(ci.id)) return;
        existingIds.add(ci.id);

        const init = computeInitialRowValuesFromCostItem(ci);
        additions.push({
          id: `row-${Date.now().toString(36)}-${idx}-${Math.random().toString(36).substring(2, 5)}`,
          jobCostCategoryId: ci.categoryId || null,
          jobCostCategoryName: ci.categoryName,
          jobCostItemId: ci.id,
          originalJobAmount: init.originalJobAmount,
          remainingAvailable: init.remainingAvailable,
          invoicedAmountBefore: ci.invoicedAmount,
          description: ci.description,
          quantity: init.quantity,
          unit: init.unit,
          unitRate: init.unitRate,
          amount: init.amount,
          isAdditionalItem: false,
          budgetOverrideReason: "",
          isEditingDetails: false,
          notes: "",
          attachments: [],
        });
      });

      return [...cleanedPrev, ...additions];
    });
    setSubmitError("");
  };

  // Manual row creation (allowed only when canManualEntry is true)
  const handleAddManualRow = () => {
    if (!canManualEntry) return;
    setRows((prev) => [...prev, makeManualRow(null)]);
  };

  // Entry-table checkbox selection & removal
  const handleToggleRowSelect = (rowId: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  const allTableRowsSelected = rows.length > 0 && rows.every((r) => selectedRowIds.has(r.id));

  const handleToggleSelectAllTableRows = () => {
    if (rows.length === 0) return;
    if (allTableRowsSelected) {
      setSelectedRowIds(new Set());
    } else {
      setSelectedRowIds(new Set(rows.map((r) => r.id)));
    }
  };

  const handleRemoveRow = (id: string) => {
    const target = rows.find((r) => r.id === id);
    if (target) {
      target.attachments.forEach((att) => {
        if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
      });
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
    setSelectedRowIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleRemoveSelectedRows = () => {
    if (selectedRowIds.size === 0) return;
    setRows((prev) => {
      prev.forEach((r) => {
        if (selectedRowIds.has(r.id)) {
          r.attachments.forEach((att) => {
            if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
          });
        }
      });
      return prev.filter((r) => !selectedRowIds.has(r.id));
    });
    setSelectedRowIds(new Set());
  };

  const handleToggleEditRowDetails = (id: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, isEditingDetails: !r.isEditingDetails } : r))
    );
  };

  const handleRowFieldChange = (
    id: string,
    field: "description" | "unit" | "jobCostCategoryName" | "budgetOverrideReason" | "notes",
    value: string
  ) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const handleRowNumericChange = (
    id: string,
    field: "quantity" | "unitRate" | "amount",
    value: string
  ) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const synced = recalcRowPricingOnChange({
          field,
          value,
          currentQuantity: r.quantity,
          currentUnitRate: r.unitRate,
          currentAmount: r.amount,
        });
        return { ...r, ...synced };
      })
    );
  };

  const handleRowAmountBlur = (id: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const normalized = normalizeRowAmountOnBlur({
          quantity: r.quantity,
          unitRate: r.unitRate,
          amount: r.amount,
        });
        return { ...r, ...normalized };
      })
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
        r.id === rowId ? { ...r, attachments: [...r.attachments, ...newAttachments] } : r
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
      const amtDec = toDecimal(row.amount);
      if (amtDec.gt(0)) {
        sum = sum.plus(roundFinancial(amtDec, 2));
      }
    }
    return roundFinancial(sum, 2).toNumber();
  }, [rows]);

  const totalAttachmentsCount = useMemo(() => {
    return rows.reduce((sum, r) => sum + (r.attachments?.length || 0), 0);
  }, [rows]);

  // Identify per-cost-line budget overruns
  const overBudgetRows = useMemo(() => {
    const list: Array<{
      rowId: string;
      description: string;
      amount: number;
      remainingAvailable: number;
      excess: number;
    }> = [];
    rows.forEach((r) => {
      if (!r.jobCostItemId || r.remainingAvailable == null) return;
      const amtDec = roundFinancial(toDecimal(r.amount), 2);
      const remDec = Decimal.max(0, roundFinancial(r.remainingAvailable, 2));
      if (amtDec.gt(remDec.plus(0.01))) {
        list.push({
          rowId: r.id,
          description: r.description,
          amount: amtDec.toNumber(),
          remainingAvailable: remDec.toNumber(),
          excess: roundFinancial(amtDec.minus(remDec), 2).toNumber(),
        });
      }
    });
    return list;
  }, [rows]);

  const overBudgetRowIdSet = useMemo(
    () => new Set(overBudgetRows.map((x) => x.rowId)),
    [overBudgetRows]
  );

  // Projected Remaining Job Budget
  const projectedRemainingBudget = useMemo(() => {
    if (!selectedJob) return 0;
    return roundFinancial(toDecimal(selectedJob.remainingBudget).minus(totalInvoiceAmount), 2).toNumber();
  }, [selectedJob, totalInvoiceAmount]);

  const isJobBudgetExceeded = projectedRemainingBudget < 0;

  // Due Date & Terms Computation Helpers
  const suggestedDueDate = useMemo(() => {
    if (!invoiceDate) return "";
    const trimmed = creditPeriodDays.trim();
    if (!trimmed) return invoiceDate;
    const days = Number(trimmed);
    if (!Number.isInteger(days) || days < 0 || days > 3650) return invoiceDate;
    return addCalendarDays(invoiceDate, days) || invoiceDate;
  }, [invoiceDate, creditPeriodDays]);

  const isDueDateBeforeInvoiceDate = useMemo(() => {
    if (!invoiceDate || !paymentDueDate) return false;
    if (!parseDateKeyToUtcMidnight(invoiceDate) || !parseDateKeyToUtcMidnight(paymentDueDate)) {
      return false;
    }
    return diffCalendarDays(invoiceDate, paymentDueDate) < 0;
  }, [invoiceDate, paymentDueDate]);

  const handleInvoiceDateChange = (nextDate: string) => {
    setInvoiceDate(nextDate);
    if (!dueDateManuallySet && nextDate) {
      const trimmed = creditPeriodDays.trim();
      const days = trimmed === "" ? 0 : Number(trimmed);
      if (Number.isInteger(days) && days >= 0 && days <= 3650) {
        setPaymentDueDate(addCalendarDays(nextDate, days) || nextDate);
      } else {
        setPaymentDueDate(nextDate);
      }
    }
  };

  const handleCreditPeriodDaysChange = (val: string) => {
    setCreditPeriodDays(val);
    if (val.trim() === "") {
      if (!dueDateManuallySet && invoiceDate) {
        setPaymentDueDate(invoiceDate);
      }
      return;
    }
    const parsed = Number(val);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 3650 && invoiceDate) {
      setDueDateManuallySet(false);
      setPaymentDueDate(addCalendarDays(invoiceDate, parsed) || invoiceDate);
    }
  };

  const handlePaymentTermsChange = (val: string) => {
    setPaymentTerms(val);
    const trimmed = val.trim();
    if (/^(immediate|due on receipt|cash)$/i.test(trimmed)) {
      setCreditPeriodDays("0");
      setDueDateManuallySet(false);
      if (invoiceDate) setPaymentDueDate(invoiceDate);
      return;
    }
    const match = trimmed.match(/^(?:net\s*)?(\d{1,4})\s*(?:days?|d)?$/i);
    if (match) {
      const parsedDays = Number(match[1]);
      if (Number.isInteger(parsedDays) && parsedDays >= 0 && parsedDays <= 3650) {
        setCreditPeriodDays(String(parsedDays));
        setDueDateManuallySet(false);
        if (invoiceDate) {
          setPaymentDueDate(addCalendarDays(invoiceDate, parsedDays) || invoiceDate);
        }
      }
    }
  };

  const applyPaymentTermPreset = (days: number, label: string) => {
    setPaymentTerms(label);
    setCreditPeriodDays(String(days));
    setDueDateManuallySet(false);
    if (invoiceDate) {
      setPaymentDueDate(addCalendarDays(invoiceDate, days) || invoiceDate);
    }
  };

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

    if (!invoiceDate || !parseDateKeyToUtcMidnight(invoiceDate)) {
      setSubmitError("Please provide a valid Invoice Date.");
      return;
    }

    const effectiveDueDate = paymentDueDate || suggestedDueDate || invoiceDate;
    if (!effectiveDueDate || !parseDateKeyToUtcMidnight(effectiveDueDate)) {
      setSubmitError("Please provide a valid Payment Due Date.");
      return;
    }

    if (creditPeriodDays.trim() !== "") {
      const daysNum = Number(creditPeriodDays.trim());
      if (!Number.isInteger(daysNum) || daysNum < 0 || daysNum > 3650) {
        setSubmitError("Credit Period / Payment Within days must be a whole number (0 - 3650).");
        return;
      }
    }

    if (diffCalendarDays(invoiceDate, effectiveDueDate) < 0 && !canOverrideDueDate) {
      setSubmitError(
        `Payment Due Date (${effectiveDueDate}) cannot be earlier than Invoice Date (${invoiceDate}) unless an authorized administrator overrides it.`
      );
      return;
    }

    if (rows.length === 0) {
      setSubmitError(
        hasJobCostItems
          ? "Please select at least one Job Excel cost line above and click 'Add Selected Items'."
          : "Please add at least one Supplier Invoice entry row."
      );
      return;
    }

    // Validate rows
    let attachmentSum = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.description.trim()) {
        setSubmitError(`Row ${i + 1}: Please enter an item description.`);
        return;
      }
      const qtyDec = roundFinancial(toDecimal(row.quantity), 4);
      if (qtyDec.lte(0)) {
        setSubmitError(`Row ${i + 1} ("${row.description}"): Invoice quantity must be greater than 0.`);
        return;
      }
      const rateDec = roundFinancial(toDecimal(row.unitRate), 2);
      if (rateDec.lte(0)) {
        setSubmitError(`Row ${i + 1} ("${row.description}"): Invoice rate must be greater than 0.00.`);
        return;
      }
      const amtDec = roundFinancial(toDecimal(row.amount), 2);
      if (amtDec.lte(0)) {
        setSubmitError(`Row ${i + 1} ("${row.description}"): Invoice amount must be greater than 0.00.`);
        return;
      }
      const hasErrorAttachment = row.attachments.some((a) => a.error);
      if (hasErrorAttachment) {
        setSubmitError(
          `Row ${i + 1} ("${row.description}"): Contains invalid attachment(s). Please remove them before submitting.`
        );
        return;
      }
      attachmentSum += row.attachments.length;
    }

    if (attachmentSum === 0) {
      setSubmitError(
        "Please attach at least one supporting supplier invoice document (PDF, Word, or Image) to an entry row."
      );
      return;
    }

    if (overBudgetRows.length > 0) {
      if (!canOverrideBudget) {
        setSubmitError(
          `Row "${overBudgetRows[0].description}" exceeds remaining uninvoiced Job cost line balance (${formatCurrency(overBudgetRows[0].remainingAvailable)}). Your role does not have 'Override Job Cost Line Budget' permission.`
        );
        return;
      }
      const missingReasons = overBudgetRows.filter(
        (ob) =>
          !budgetOverrideReason.trim() &&
          !(rows.find((r) => r.id === ob.rowId)?.budgetOverrideReason || "").trim()
      );
      if (missingReasons.length > 0) {
        setSubmitError(
          `Budget override justification reason is required for over-budget cost line(s) such as "${missingReasons[0].description}".`
        );
        return;
      }
    }

    setIsSubmitting(true);
    setUploadProgress(0);
    setUploadStageText(
      attachmentSum > 0
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
      formData.append("paymentDueDate", paymentDueDate || suggestedDueDate || invoiceDate);
      if (paymentTerms.trim()) {
        formData.append("paymentTerms", paymentTerms.trim());
      }
      if (creditPeriodDays.trim() !== "") {
        formData.append("creditPeriodDays", creditPeriodDays.trim());
      }
      formData.append("notes", notes.trim());
      if (budgetOverrideReason.trim()) {
        formData.append("budgetOverrideReason", budgetOverrideReason.trim());
      }

      const itemsPayload = rows.map((r, idx) => {
        const normalizedPricing = normalizeRowAmountOnBlur({
          quantity: r.quantity,
          unitRate: r.unitRate,
          amount: r.amount,
        });
        return {
          rowNumber: idx + 1,
          jobCostCategoryId: r.jobCostCategoryId || null,
          jobCostCategoryName: r.jobCostCategoryName?.trim() || null,
          jobCostItemId: r.jobCostItemId || null,
          description: r.description.trim(),
          originalJobAmount: r.originalJobAmount,
          quantity: parseFloat(normalizedPricing.quantity),
          unit: r.unit.trim() || "Nos",
          unitRate: parseFloat(normalizedPricing.unitRate),
          amount: parseFloat(normalizedPricing.amount),
          isAdditionalItem: Boolean(!r.jobCostItemId || r.isAdditionalItem),
          budgetOverrideReason: r.budgetOverrideReason.trim() || null,
          notes: r.notes || "",
        };
      });
      formData.append("items", JSON.stringify(itemsPayload));

      rows.forEach((r, idx) => {
        r.attachments.forEach((att) => {
          formData.append(`files_${idx}`, att.file);
        });
      });

      const json: any = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/supplier-invoices");

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const pct = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(pct);
            if (pct < 100) {
              setUploadStageText(
                attachmentSum > 0
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
    revokeRowsPreviewUrls(rows);
    setCreatedInvoiceResult(null);
    setInvoiceNumber("");
    setPaymentTerms("");
    setCreditPeriodDays("");
    setDueDateManuallySet(false);
    setPaymentDueDate(invoiceDate || getTodayDateKeyInTimezone());
    setBudgetOverrideReason("");
    setSelectedRowIds(new Set());
    setRows(!hasJobCostItems && canManualEntry ? [makeManualRow(null)] : []);
    setSubmitError("");
    if (selectedJob?.id) {
      void fetchJobCostItems(selectedJob.id);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Supplier Invoice & Record Actual Job Cost"
      maxWidth="6xl"
    >
      {createdInvoiceResult ? (
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
            <div className="flex justify-between py-1 border-b border-slate-200">
              <span className="text-slate-500">Invoice Date / Due Date:</span>
              <span className="font-mono font-semibold text-slate-800">
                {createdInvoiceResult.invoiceDate || "—"} →{" "}
                <span className="text-blue-700 font-bold">
                  {createdInvoiceResult.paymentDueDate || createdInvoiceResult.invoiceDate || "—"}
                </span>
              </span>
            </div>
            {createdInvoiceResult.paymentTerms && (
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-500">Payment Terms:</span>
                <span className="font-semibold text-slate-800">
                  {createdInvoiceResult.paymentTerms}
                  {createdInvoiceResult.creditPeriodDays != null
                    ? ` (${createdInvoiceResult.creditPeriodDays} days)`
                    : ""}
                </span>
              </div>
            )}
            <div className="flex justify-between py-1 border-b border-slate-200">
              <span className="text-slate-500">Line Items Recorded:</span>
              <span className="font-mono font-bold text-slate-800">
                {createdInvoiceResult.itemCount} item(s)
              </span>
            </div>
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
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              + Create Another Invoice
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-xs font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-xs cursor-pointer"
            >
              Close & View Invoices
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5 text-xs">
          {submitError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-800">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold">Cannot Save Invoice</p>
                <p className="mt-0.5 text-[11px] leading-relaxed">{submitError}</p>
              </div>
              <button
                type="button"
                onClick={() => setSubmitError("")}
                className="text-rose-400 hover:text-rose-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Section 1: Supplier & Approved Job Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Supplier Selection */}
            <div className="space-y-2">
              <label className="block font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                1. Select Supplier <span className="text-rose-500">*</span>
              </label>

              <div className="relative">
                <div className="flex items-center border border-slate-300 rounded-lg bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
                  <Building2 className="h-4 w-4 text-slate-400 mr-2 shrink-0" />
                  <input
                    type="text"
                    value={
                      selectedSupplier
                        ? `${selectedSupplier.name} (${selectedSupplier.code})`
                        : supplierSearch
                    }
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
                      className="text-slate-400 hover:text-slate-600 ml-1 p-0.5 cursor-pointer"
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
                      className="text-slate-400 hover:text-slate-600 ml-1 p-0.5 cursor-pointer"
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${
                          isSupplierDropdownOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                  )}
                </div>

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
                          <Check className="h-4 w-4 text-blue-600 opacity-0" />
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {selectedSupplier && (
                <div className="p-3 rounded-lg bg-blue-50/70 border border-blue-200 text-slate-700 space-y-1 text-[11px]">
                  <div className="flex items-center justify-between font-bold text-blue-900">
                    <span>{selectedSupplier.name}</span>
                    <span className="font-mono text-[10px] bg-blue-200/70 px-1.5 py-0.5 rounded">
                      {selectedSupplier.code}
                    </span>
                  </div>
                  <p>
                    Contact: {selectedSupplier.contactPerson || "Primary Contact"} •{" "}
                    {selectedSupplier.phone || "No phone"}
                  </p>
                  <p className="text-slate-500 truncate">
                    {selectedSupplier.address || selectedSupplier.email}
                  </p>
                </div>
              )}
            </div>

            {/* Approved Job Selection */}
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
                      Only jobs with status <strong className="text-emerald-700">APPROVED</strong> can have supplier invoices recorded against them.
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
                  <div className="relative">
                    <div className="flex items-center rounded-xl border-2 border-blue-200 bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-600 shadow-xs">
                      <Briefcase className="h-4 w-4 text-blue-600 mr-2 shrink-0" />
                      <input
                        type="text"
                        value={jobSearch}
                        onFocus={() => setIsJobDropdownOpen(true)}
                        onChange={(e) => handleJobSearchChange(e.target.value)}
                        placeholder="Search approved Job by Job #, Title, or Client..."
                        className="w-full text-xs text-slate-900 bg-transparent outline-none font-medium"
                      />
                      <button
                        type="button"
                        onClick={() => setIsJobDropdownOpen((o) => !o)}
                        className="text-slate-400 hover:text-slate-700 ml-1 p-0.5 cursor-pointer"
                      >
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${
                            isJobDropdownOpen ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                    </div>

                    {isJobDropdownOpen && (
                      <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-slate-100">
                        {approvedJobsList.length === 0 ? (
                          <div className="p-3 text-center text-slate-400">
                            No matching approved jobs found.
                          </div>
                        ) : (
                          approvedJobsList.map((job) => (
                            <button
                              key={job.id}
                              type="button"
                              onClick={() => handleSelectJob(job)}
                              className="w-full text-left p-2.5 hover:bg-emerald-50/70 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-mono font-bold text-emerald-700">
                                    {job.jobCode}
                                  </span>
                                  <span className="font-semibold text-slate-900 truncate">
                                    {job.name}
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-500 mt-0.5">
                                  Client: {job.clientName}
                                  {typeof job.costItemsCount === "number" &&
                                    ` • ${job.costItemsCount} Excel line${
                                      job.costItemsCount === 1 ? "" : "s"
                                    }`}
                                </p>
                              </div>
                              <div className="text-right shrink-0 font-mono">
                                <span className="block font-bold text-slate-800">
                                  {formatCurrency(job.originalApprovedCost)}
                                </span>
                                <span className="text-[10px] text-emerald-700">
                                  Rem: {formatCurrency(job.remainingBudget)}
                                </span>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                    <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-1.5">
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                      Selecting a Job automatically loads its saved Excel cost lines.
                    </p>
                  </div>
                )
              ) : (
                <div className="rounded-xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50/80 to-teal-50/40 p-3.5 space-y-2.5 shadow-xs">
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
                        Client:{" "}
                        <span className="font-semibold text-slate-800">
                          {selectedJob.clientName}
                        </span>
                        {selectedJob.handledBy && ` • Handled By: ${selectedJob.handledBy}`}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSelectJob(null)}
                      className="shrink-0 text-[11px] font-semibold text-slate-700 hover:text-rose-600 bg-white hover:bg-rose-50 border border-slate-300 hover:border-rose-300 px-2.5 py-1 rounded-lg transition-colors shadow-2xs flex items-center gap-1 cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                      <span>Change Job</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-emerald-200/80 text-[11px]">
                    <div className="bg-white/90 rounded-lg p-2 border border-emerald-100 shadow-2xs">
                      <span className="text-[10px] text-slate-500 font-medium block">
                        Approved Budget
                      </span>
                      <span className="font-mono font-bold text-slate-900 text-xs">
                        {formatCurrency(selectedJob.originalApprovedCost)}
                      </span>
                    </div>
                    <div className="bg-white/90 rounded-lg p-2 border border-emerald-100 shadow-2xs">
                      <span className="text-[10px] text-slate-500 font-medium block">
                        Current Expenses
                      </span>
                      <span className="font-mono font-bold text-amber-700 text-xs">
                        {formatCurrency(selectedJob.currentSupplierCost)}
                      </span>
                    </div>
                    <div className="bg-white/90 rounded-lg p-2 border border-emerald-100 shadow-2xs">
                      <span className="text-[10px] text-slate-500 font-medium block">
                        Remaining Budget
                      </span>
                      <span
                        className={`font-mono font-bold text-xs ${
                          selectedJob.remainingBudget < 0 ? "text-rose-600" : "text-emerald-700"
                        }`}
                      >
                        {formatCurrency(selectedJob.remainingBudget)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Invoice Metadata & Payment Due Terms */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
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
                  onChange={(e) => handleInvoiceDateChange(e.target.value)}
                  required
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-semibold text-slate-700">
                    Credit Period (Days)
                  </label>
                  <span className="text-[10px] text-slate-400">Optional</span>
                </div>
                <input
                  type="number"
                  min={0}
                  max={3650}
                  step={1}
                  value={creditPeriodDays}
                  onChange={(e) => handleCreditPeriodDaysChange(e.target.value)}
                  placeholder="e.g. 30"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="flex items-center gap-1 font-semibold text-slate-700">
                    <Calendar className="h-3.5 w-3.5 text-blue-600" />
                    <span>
                      Payment Due Date <span className="text-rose-500">*</span>
                    </span>
                  </label>
                  {dueDateManuallySet && suggestedDueDate && suggestedDueDate !== paymentDueDate && (
                    <button
                      type="button"
                      onClick={() => {
                        setDueDateManuallySet(false);
                        setPaymentDueDate(suggestedDueDate);
                      }}
                      className="text-[10px] font-semibold text-blue-600 hover:underline cursor-pointer"
                    >
                      Reset ({suggestedDueDate})
                    </button>
                  )}
                </div>
                <input
                  type="date"
                  value={paymentDueDate}
                  onChange={(e) => {
                    setPaymentDueDate(e.target.value);
                    setDueDateManuallySet(true);
                  }}
                  required
                  className={`w-full px-3 py-1.5 rounded-lg border bg-white text-xs text-slate-900 focus:ring-2 outline-none ${
                    isDueDateBeforeInvoiceDate
                      ? canOverrideDueDate
                        ? "border-amber-400 focus:ring-amber-500"
                        : "border-rose-400 focus:ring-rose-500"
                      : "border-slate-300 focus:ring-blue-500"
                  }`}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
              <div className="lg:col-span-5">
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-semibold text-slate-700">
                    Payment Terms (Optional)
                  </label>
                  <div className="flex items-center gap-1 flex-wrap">
                    {[
                      { days: 0, label: "Due Today" },
                      { days: 15, label: "15 Days" },
                      { days: 30, label: "30 Days" },
                      { days: 45, label: "45 Days" },
                      { days: 60, label: "60 Days" },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => applyPaymentTermPreset(preset.days, preset.label)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-colors cursor-pointer ${
                          creditPeriodDays === String(preset.days) && paymentTerms === preset.label
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-700"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="text"
                  value={paymentTerms}
                  onChange={(e) => handlePaymentTermsChange(e.target.value)}
                  placeholder="e.g. Net 30 Days, Immediate, Credit 45..."
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                />
                {suggestedDueDate && !dueDateManuallySet && creditPeriodDays.trim() !== "" && (
                  <p className="text-[10px] text-blue-700 mt-1">
                    Suggested Due Date:{" "}
                    <span className="font-mono font-bold">{suggestedDueDate}</span> (calculated from Invoice Date + {creditPeriodDays} day{Number(creditPeriodDays) === 1 ? "" : "s"}).
                  </p>
                )}
              </div>

              <div className="lg:col-span-4">
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

              <div className="lg:col-span-3">
                <label className="block font-semibold text-slate-700 mb-1">
                  Live Invoice Total
                </label>
                <div className="w-full px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50/70 flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-emerald-700 uppercase">Total</span>
                  <span className="font-mono font-bold text-sm text-emerald-800">
                    {formatCurrency(totalInvoiceAmount, { showCurrencyPrefix: true })}
                  </span>
                </div>
              </div>
            </div>

            {isDueDateBeforeInvoiceDate && (
              <div
                className={`p-2.5 rounded-lg border flex items-center gap-2 text-[11px] ${
                  canOverrideDueDate
                    ? "bg-amber-50 border-amber-200 text-amber-800"
                    : "bg-rose-50 border-rose-200 text-rose-800"
                }`}
              >
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  {canOverrideDueDate
                    ? `Payment Due Date (${paymentDueDate}) is earlier than Invoice Date (${invoiceDate}). Permitted via your Override Due Date permission.`
                    : `Payment Due Date (${paymentDueDate}) cannot be earlier than Invoice Date (${invoiceDate}). Please select a date on or after ${invoiceDate}.`}
                </span>
              </div>
            )}
          </div>

          {/* Section 3: Dynamic Supplier Invoice Entries & Attachments + Job Excel Cost Selector */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
              <div>
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                  3. Dynamic Supplier Invoice Entries & Attachments
                </h4>
                <p className="text-[11px] text-slate-500">
                  Select saved Job Excel cost lines below to populate separate entry rows, adjust Qty / Rate / Amount, and attach supporting supplier bills (at least 1 attachment required per invoice).
                </p>
              </div>

              <div className="flex items-center gap-2">
                {selectedRowIds.size > 0 && (
                  <button
                    type="button"
                    onClick={handleRemoveSelectedRows}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 font-semibold transition-colors cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Remove Selected ({selectedRowIds.size})</span>
                  </button>
                )}

                {canManualEntry ? (
                  <button
                    type="button"
                    onClick={handleAddManualRow}
                    disabled={!selectedJob}
                    title={
                      !selectedJob
                        ? "Select an Approved Job first"
                        : "Add an unplanned manual line item"
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 font-semibold transition-colors shadow-2xs disabled:opacity-40 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Manual Row</span>
                  </button>
                ) : (
                  <span
                    title="Your role only permits selecting saved Job cost lines"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-500 border border-slate-200 text-[11px] font-medium"
                  >
                    <Lock className="h-3 w-3" />
                    <span>Excel Cost Lines Only</span>
                  </span>
                )}
              </div>
            </div>

            {/* Job Excel Cost Lines Selector Panel */}
            {!selectedJob ? (
              <div className="p-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center text-slate-500 text-xs">
                Select an Approved Job above to automatically load its saved Excel cost categories and line items.
              </div>
            ) : (
              <JobCostLineSelector
                key={selectedJob.id}
                jobId={selectedJob.id}
                jobCode={selectedJob.jobCode}
                categories={jobCostCategories}
                totals={jobCostTotals}
                isLoading={isLoadingJobCosts}
                loadError={jobCostLoadError}
                addedCostItemIds={addedCostItemIds}
                canManualEntry={canManualEntry}
                canOverrideBudget={canOverrideBudget}
                onAddSelectedItems={handleAddSelectedCostItems}
                onAddManualRow={canManualEntry ? handleAddManualRow : undefined}
                onRetryLoad={() => fetchJobCostItems(selectedJob.id)}
              />
            )}

            {/* Budget Overrun Alert Banner (Per-Item Budget Control) */}
            {overBudgetRows.length > 0 && (
              <div
                className={`p-3.5 rounded-xl border space-y-2.5 ${
                  canOverrideBudget
                    ? "bg-amber-50 border-amber-300 text-amber-950"
                    : "bg-rose-50 border-rose-300 text-rose-950"
                }`}
              >
                <div className="flex items-start gap-2">
                  <ShieldAlert
                    className={`h-4 w-4 shrink-0 mt-0.5 ${
                      canOverrideBudget ? "text-amber-600" : "text-rose-600"
                    }`}
                  />
                  <div className="flex-1 space-y-1">
                    <p className="font-bold text-xs">
                      {canOverrideBudget
                        ? "Cost Line Budget Overrun Detected — Override Justification Required"
                        : "Cost Line Budget Guard Blocked — Cannot Exceed Remaining Job Line Balance"}
                    </p>
                    {overBudgetRows.map((ob) => (
                      <p key={ob.rowId} className="text-[11px]">
                        • <strong>{ob.description}</strong>: Entering{" "}
                        <span className="font-mono font-bold">
                          {formatCurrency(ob.amount, { showCurrencyPrefix: true })}
                        </span>{" "}
                        vs Remaining Uninvoiced Balance{" "}
                        <span className="font-mono font-bold">
                          {formatCurrency(ob.remainingAvailable, { showCurrencyPrefix: true })}
                        </span>{" "}
                        (Excess:{" "}
                        <span className="font-mono font-bold text-rose-700">
                          {formatCurrency(ob.excess, { showCurrencyPrefix: true })}
                        </span>
                        )
                      </p>
                    ))}
                  </div>
                </div>

                {canOverrideBudget ? (
                  <div>
                    <label className="block text-[11px] font-bold mb-1">
                      Budget Override Justification Reason <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={budgetOverrideReason}
                      onChange={(e) => setBudgetOverrideReason(e.target.value)}
                      placeholder="Explain why exceeding the budgeted cost line amount is authorized..."
                      className="w-full px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                  </div>
                ) : (
                  <p className="text-[11px] font-semibold text-rose-700">
                    Reduce the invoice amounts above within remaining Job cost balances, or ask a
                    Supervisor/Administrator with &ldquo;Override Job Cost Line Budget&rdquo; permission.
                  </p>
                )}
              </div>
            )}

            {/* Dynamic Invoice Entries Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/90 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                      <th className="py-2.5 px-2.5 w-14 text-center">
                        <label className="inline-flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={allTableRowsSelected}
                            disabled={rows.length === 0}
                            onChange={handleToggleSelectAllTableRows}
                            title="Select all entry rows"
                            className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <span>Sel</span>
                        </label>
                      </th>
                      <th className="py-2.5 px-2.5 w-32">Cost Category</th>
                      <th className="py-2.5 px-2.5 min-w-[200px]">Description</th>
                      <th className="py-2.5 px-2.5 w-28 text-right">Orig. Job Amt</th>
                      <th className="py-2.5 px-2.5 w-24 text-right">Invoice Qty</th>
                      <th className="py-2.5 px-2.5 w-20">Unit</th>
                      <th className="py-2.5 px-2.5 w-28 text-right">Invoice Rate</th>
                      <th className="py-2.5 px-2.5 w-32 text-right">Invoice Amount (Rs.)</th>
                      <th className="py-2.5 px-2.5 min-w-[240px]">Attachments (PDF, Word, Img)</th>
                      <th className="py-2.5 px-2 w-20 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-10 text-center text-slate-400">
                          <p className="font-semibold text-slate-600 text-xs">
                            No Supplier Invoice Entry Rows Added Yet
                          </p>
                          <p className="text-[11px] text-slate-400 mt-1">
                            {selectedJob
                              ? hasJobCostItems
                                ? "Check the Job Excel cost lines in the selector above and click 'Add Selected Items'."
                                : canManualEntry
                                ? "Click '+ Add Manual Row' above to add invoice entries."
                                : "This Job has no saved Excel cost lines and manual entry is disabled for your role."
                              : "Select an Approved Job first."}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      rows.map((row, idx) => {
                        const isOver = overBudgetRowIdSet.has(row.id);
                        const isLinked = Boolean(row.jobCostItemId);
                        const isDescEditable = !isLinked || row.isEditingDetails;

                        return (
                          <tr
                            key={row.id}
                            className={`hover:bg-slate-50/60 transition-colors align-top ${
                              isOver ? "bg-amber-50/30" : ""
                            }`}
                          >
                            {/* Select + Row # */}
                            <td className="py-3 px-2.5 text-center">
                              <div className="flex flex-col items-center gap-1">
                                <input
                                  type="checkbox"
                                  checked={selectedRowIds.has(row.id)}
                                  onChange={() => handleToggleRowSelect(row.id)}
                                  className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                />
                                <span className="font-mono text-[10px] font-bold text-slate-400">
                                  #{idx + 1}
                                </span>
                              </div>
                            </td>

                            {/* Cost Category */}
                            <td className="py-3 px-2.5">
                              {isLinked || !isDescEditable ? (
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                    isLinked
                                      ? "bg-blue-50 text-blue-800 border-blue-200"
                                      : "bg-amber-50 text-amber-800 border-amber-200"
                                  }`}
                                >
                                  {row.jobCostCategoryName || "Manual"}
                                </span>
                              ) : (
                                <input
                                  type="text"
                                  value={row.jobCostCategoryName || ""}
                                  onChange={(e) =>
                                    handleRowFieldChange(
                                      row.id,
                                      "jobCostCategoryName",
                                      e.target.value
                                    )
                                  }
                                  placeholder="Category (Manual)"
                                  className="w-full px-2 py-1 rounded border border-slate-300 text-[11px] text-slate-800 bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                                />
                              )}
                            </td>

                            {/* Description */}
                            <td className="py-3 px-2.5 space-y-1">
                              {isDescEditable ? (
                                <input
                                  type="text"
                                  value={row.description}
                                  onChange={(e) =>
                                    handleRowFieldChange(row.id, "description", e.target.value)
                                  }
                                  placeholder="Enter item description..."
                                  required
                                  className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                />
                              ) : (
                                <p className="font-semibold text-slate-900 leading-snug">
                                  {row.description}
                                </p>
                              )}

                              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                                {isLinked ? (
                                  <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                                    Excel Cost Line
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                                    Manual Entry
                                  </span>
                                )}
                                {row.remainingAvailable != null && (
                                  <span
                                    className={`font-mono ${
                                      isOver ? "text-rose-600 font-bold" : "text-slate-500"
                                    }`}
                                  >
                                    Rem. Budget: {formatCurrency(row.remainingAvailable)}
                                  </span>
                                )}
                                {row.remainingAvailable != null && Number(row.amount || 0) > 0 && (
                                  (() => {
                                    const diff = Number(row.remainingAvailable) - Number(row.amount || 0);
                                    if (diff > 0.005) {
                                      return (
                                        <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono font-semibold">
                                          Saving / Left: {formatCurrency(diff)}
                                        </span>
                                      );
                                    }
                                    if (diff < -0.005) {
                                      return (
                                        <span className="px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-200 font-mono font-semibold">
                                          Over Budget: +{formatCurrency(Math.abs(diff))}
                                        </span>
                                      );
                                    }
                                    return (
                                      <span className="px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                                        On Budget
                                      </span>
                                    );
                                  })()
                                )}
                              </div>
                            </td>

                            {/* Original Job Amount (immutable) */}
                            <td className="py-3 px-2.5 text-right font-mono font-semibold text-slate-600">
                              {row.originalJobAmount != null
                                ? formatCurrency(row.originalJobAmount)
                                : "—"}
                            </td>

                            {/* Invoice Quantity */}
                            <td className="py-3 px-2.5 text-right">
                              <input
                                type="number"
                                step="0.0001"
                                min="0.0001"
                                value={row.quantity}
                                onChange={(e) =>
                                  handleRowNumericChange(row.id, "quantity", e.target.value)
                                }
                                required
                                className="w-full text-right px-2 py-1.5 rounded-md border border-slate-300 font-mono text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                              />
                            </td>

                            {/* Unit */}
                            <td className="py-3 px-2.5">
                              <input
                                type="text"
                                value={row.unit}
                                onChange={(e) =>
                                  handleRowFieldChange(row.id, "unit", e.target.value)
                                }
                                placeholder="Nos"
                                className="w-full px-2 py-1.5 rounded-md border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                              />
                            </td>

                            {/* Invoice Rate */}
                            <td className="py-3 px-2.5 text-right">
                              <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={row.unitRate}
                                onChange={(e) =>
                                  handleRowNumericChange(row.id, "unitRate", e.target.value)
                                }
                                placeholder="0.00"
                                required
                                className="w-full text-right px-2 py-1.5 rounded-md border border-slate-300 font-mono text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                              />
                            </td>

                            {/* Invoice Amount */}
                            <td className="py-3 px-2.5 text-right">
                              <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={row.amount}
                                onChange={(e) =>
                                  handleRowNumericChange(row.id, "amount", e.target.value)
                                }
                                onBlur={() => handleRowAmountBlur(row.id)}
                                placeholder="0.00"
                                required
                                className={`w-full text-right px-2 py-1.5 rounded-md border font-mono font-bold text-xs outline-none focus:ring-2 bg-white ${
                                  isOver
                                    ? "border-amber-400 text-amber-800 focus:ring-amber-500"
                                    : "border-slate-300 text-slate-900 focus:ring-blue-500"
                                }`}
                              />
                            </td>

                            {/* Attachments (Multiple PDF, Word, Images) */}
                            <td className="py-3 px-2.5">
                              <div className="space-y-1.5">
                                {row.attachments.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {row.attachments.map((att) => (
                                      <div
                                        key={att.id}
                                        className={`group flex items-center gap-1 p-1 px-1.5 rounded-md text-[10px] border transition-all ${
                                          att.error
                                            ? "bg-rose-50 border-rose-300 text-rose-800"
                                            : att.category === "image"
                                            ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                                            : att.category === "word"
                                            ? "bg-blue-50 border-blue-200 text-blue-900"
                                            : "bg-slate-100 border-slate-200 text-slate-800"
                                        }`}
                                      >
                                        {att.category === "image" && att.previewUrl ? (
                                          <Image
                                            unoptimized
                                            src={att.previewUrl}
                                            alt={att.name}
                                            width={20}
                                            height={20}
                                            className="h-5 w-5 rounded object-cover border border-emerald-300 shrink-0 cursor-pointer"
                                            onClick={() => handleOpenPreview(att, row.description)}
                                          />
                                        ) : att.category === "word" ? (
                                          <FileText className="h-3 w-3 text-blue-600 shrink-0" />
                                        ) : (
                                          <FileText className="h-3 w-3 text-rose-600 shrink-0" />
                                        )}

                                        <span
                                          className="max-w-[100px] truncate font-semibold cursor-pointer hover:underline"
                                          title={`${att.name} (${att.formattedSize})`}
                                          onClick={() => handleOpenPreview(att, row.description)}
                                        >
                                          {att.name}
                                        </span>

                                        {att.previewUrl && (
                                          <button
                                            type="button"
                                            onClick={() => handleOpenPreview(att, row.description)}
                                            className="p-0.5 text-slate-400 hover:text-blue-600 cursor-pointer"
                                            title="Preview"
                                          >
                                            <Eye className="h-2.5 w-2.5" />
                                          </button>
                                        )}

                                        <button
                                          type="button"
                                          onClick={() => handleRemoveAttachment(row.id, att.id)}
                                          className="p-0.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                                          title="Remove attachment"
                                        >
                                          <X className="h-2.5 w-2.5" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}

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
                                  className="flex items-center justify-center gap-1 px-2 py-1 rounded-lg border border-dashed border-slate-300 hover:border-blue-500 bg-slate-50/70 hover:bg-blue-50/40 cursor-pointer transition-colors text-slate-600"
                                >
                                  <Upload className="h-3 w-3 text-blue-600 shrink-0" />
                                  <span className="text-[10px] font-semibold text-slate-700">
                                    {row.attachments.length === 0 ? "Attach File(s)" : "+ More"}
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

                                {row.attachments.some((a) => a.error) && (
                                  <p className="text-[10px] text-rose-600 font-semibold">
                                    Remove invalid attachment(s).
                                  </p>
                                )}
                              </div>
                            </td>

                            {/* Actions: Edit Details + Remove */}
                            <td className="py-3 px-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleToggleEditRowDetails(row.id)}
                                  className={`p-1 rounded transition-colors cursor-pointer ${
                                    row.isEditingDetails
                                      ? "bg-blue-100 text-blue-700"
                                      : "text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                  }`}
                                  title={
                                    row.isEditingDetails
                                      ? "Lock description editing"
                                      : "Edit description"
                                  }
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveRow(row.id)}
                                  className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                  title="Remove this entry row"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Section 4: Live Total & Budget Impact Summary */}
          <div className="p-4 rounded-xl bg-slate-900 text-white space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <span className="text-slate-400 text-[11px] block">Total Invoice Summary</span>
                <span className="text-sm font-semibold text-slate-200">
                  {rows.length} Invoice Row{rows.length === 1 ? "" : "s"} • {totalAttachmentsCount} Attachment
                  {totalAttachmentsCount === 1 ? "" : "s"}
                </span>
              </div>

              <div className="text-right">
                <span className="text-slate-400 text-[11px] block">Supplier Invoice Total</span>
                <span className="text-2xl font-extrabold text-emerald-400 font-mono">
                  {formatCurrency(totalInvoiceAmount, { showCurrencyPrefix: true })}
                </span>
              </div>
            </div>

            {selectedJob && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                <div>
                  <span className="text-slate-400 text-[10px] block">Approved Job Value</span>
                  <span className="font-mono font-bold text-slate-200">
                    {formatCurrency(selectedJob.originalApprovedCost)}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 text-[10px] block">Current Supplier Expenses</span>
                  <span className="font-mono font-bold text-slate-200">
                    {formatCurrency(selectedJob.currentSupplierCost)}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 text-[10px] block">Projected Remaining Budget</span>
                  <span
                    className={`font-mono font-bold text-sm ${
                      isJobBudgetExceeded ? "text-rose-400" : "text-emerald-400"
                    }`}
                  >
                    {formatCurrency(projectedRemainingBudget)}
                  </span>
                </div>
              </div>
            )}

            {isJobBudgetExceeded && (
              <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-[11px] flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>
                  <strong>Warning:</strong> Adding this invoice will cause total Job supplier expenses
                  to exceed the Approved Job Value by{" "}
                  <strong className="font-mono">
                    {formatCurrency(Math.abs(projectedRemainingBudget))}
                  </strong>
                  .
                </span>
              </div>
            )}

            {isSubmitting && (
              <div className="p-3 rounded-xl bg-blue-950/70 border border-blue-700 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-blue-100">
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
                    <span>{uploadStageText || "Processing invoice..."}</span>
                  </span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-blue-900 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300 rounded-full"
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
              className="px-4 py-2 text-xs font-semibold rounded-lg text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={
                isSubmitting ||
                rows.length === 0 ||
                totalInvoiceAmount <= 0 ||
                (overBudgetRows.length > 0 && !canOverrideBudget)
              }
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{uploadStageText ? uploadStageText.split(" (")[0] : "Saving Invoice..."}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>
                    Submit Invoice ({formatCurrency(totalInvoiceAmount, { showCurrencyPrefix: true })})
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      <AttachmentPreviewModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        attachment={previewAttachment}
      />
    </Modal>
  );
}
