"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Image from "next/image";
import { Modal } from "@/components/admin/ui/modal";
import { useAdminData } from "@/context/admin-data-context";
import { Decimal, formatCurrency, roundFinancial, toDecimal } from "@/lib/financial";
import {
  JobCostItemInvoiceInfo,
  SupplierInvoice,
  SupplierInvoiceAttachment,
} from "@/types/admin";
import {
  computeInitialRowValuesFromCostItem,
  formatQtyInput,
  normalizeRowAmountOnBlur,
  recalcRowPricingOnChange,
} from "@/lib/supplier-invoice-calc";
import {
  JobCostCategoryGroup,
  JobCostLineSelector,
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
  Search,
  X,
  Eye,
  Loader2,
  Paperclip,
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
}

interface ApprovedJobOption {
  id: string;
  jobCode: string;
  name: string;
  clientName: string;
  date: string;
  originalApprovedCost: number;
  currentSupplierCost: number;
  remainingBudget: number;
  costUtilization: number;
  isBudgetExceeded: boolean;
}

export interface NewRowAttachment {
  id: string;
  file: File;
  name: string;
  size: number;
  formattedSize: string;
  category: FileCategory;
  previewUrl?: string;
  error?: string;
}

export interface EditInvoiceRow {
  id: string;
  isNew?: boolean;
  isLegacy?: boolean;
  purchaseOrderItemId?: string | null;
  jobCostCategoryId: string | null;
  jobCostCategoryName: string | null;
  jobCostItemId: string | null;
  originalJobAmount: number | null;
  remainingAvailable: number | null;
  invoicedAmountBefore: number | null;
  quantity: string;
  unit: string;
  unitRate: string;
  description: string;
  amount: string;
  isAdditionalItem: boolean;
  budgetOverrideReason: string;
  isEditingDetails: boolean;
  notes?: string;
  existingAttachments: SupplierInvoiceAttachment[];
  newAttachments: NewRowAttachment[];
}

interface EditSupplierInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: SupplierInvoice | null;
  invoiceId?: string | null;
  onSuccess: (updatedInvoice: any) => void;
  isAdmin?: boolean;
}

function makeNewManualEditRow(): EditInvoiceRow {
  return {
    id: "new-row-" + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
    isNew: true,
    isLegacy: false,
    purchaseOrderItemId: null,
    jobCostCategoryId: null,
    jobCostCategoryName: null,
    jobCostItemId: null,
    originalJobAmount: null,
    remainingAvailable: null,
    invoicedAmountBefore: null,
    quantity: "1",
    unit: "Nos",
    unitRate: "",
    description: "",
    amount: "",
    isAdditionalItem: true,
    budgetOverrideReason: "",
    isEditingDetails: true,
    notes: "",
    existingAttachments: [],
    newAttachments: [],
  };
}

export function EditSupplierInvoiceModal({
  isOpen,
  onClose,
  invoice: initialInvoice,
  invoiceId,
  onSuccess,
  isAdmin = true,
}: EditSupplierInvoiceModalProps) {
  const { suppliers: contextSuppliers, refreshJobs, can } = useAdminData();

  const [isLoadingInvoice, setIsLoadingInvoice] = useState(false);
  const [currentInvoice, setCurrentInvoice] = useState<SupplierInvoice | null>(initialInvoice);

  // Supplier state
  const [supplierSearch, setSupplierSearch] = useState("");
  const [suppliersList, setSuppliersList] = useState<SupplierOption[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierOption | null>(null);
  const [isSupplierDropdownOpen, setIsSupplierDropdownOpen] = useState(false);
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState(false);

  // Job state (Strictly APPROVED jobs)
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
  const [dueDateManuallySet, setDueDateManuallySet] = useState(true);
  const [notes, setNotes] = useState("");
  const [editReason, setEditReason] = useState("");
  const [budgetOverrideReason, setBudgetOverrideReason] = useState("");

  // Dynamic rows, selection checkboxes & deleted attachments
  const [rows, setRows] = useState<EditInvoiceRow[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [deletedAttachmentIds, setDeletedAttachmentIds] = useState<string[]>([]);

  // UI / Preview / Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStageText, setUploadStageText] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [previewAttachment, setPreviewAttachment] = useState<PreviewableAttachment | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

  const supplierSearchTimeout = useRef<NodeJS.Timeout | null>(null);
  const jobSearchTimeout = useRef<NodeJS.Timeout | null>(null);
  const supplierSearchSeq = useRef(0);
  const jobSearchSeq = useRef(0);
  const jobCostFetchSeq = useRef(0);

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
              (s.contactPerson && s.contactPerson.toLowerCase().includes(q))
            );
          })
          .map((s) => ({
            id: s.id,
            code: s.code,
            name: s.name,
            contactPerson: s.contactPerson,
            phone: s.phone,
            email: s.email,
          }));
        setSuppliersList(filtered);
      }
    },
    [contextSuppliers]
  );

  // Search Approved Jobs
  const searchApprovedJobs = useCallback(async (query: string) => {
    const currentSeq = ++jobSearchSeq.current;
    setIsLoadingJobs(true);
    try {
      const res = await fetch(`/api/jobs/approved?search=${encodeURIComponent(query)}`);
      if (res.ok) {
        const json = await res.json();
        if (currentSeq === jobSearchSeq.current && json.success && Array.isArray(json.data)) {
          setApprovedJobsList(json.data);
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
  }, []);

  // Load Job's Excel Cost Lines (excluding this invoice's existing amounts)
  const fetchJobCostItems = useCallback(
    async (jobId: string, excludeInvoiceId?: string | null) => {
      const seq = ++jobCostFetchSeq.current;
      setIsLoadingJobCosts(true);
      setJobCostLoadError("");
      try {
        const qs = new URLSearchParams({ jobId });
        if (excludeInvoiceId) qs.set("excludeInvoiceId", excludeInvoiceId);
        const res = await fetch(`/api/supplier-invoices/job-cost-items?${qs.toString()}`);
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
        setJobCostCategories(categories);
        setJobCostTotals(json.data.totals || null);
        setHasJobCostItems(Boolean(json.data.hasCostItems));
        setServerPerms(json.permissions || {});

        // Build lookup map & hydrate live remaining balances onto linked rows
        const costMap = new Map<string, JobCostItemInvoiceInfo>();
        categories.forEach((cat) => {
          (cat.items || []).forEach((it) => costMap.set(it.id, it));
        });

        setRows((prevRows) =>
          prevRows.map((row) => {
            if (!row.jobCostItemId) return row;
            const info = costMap.get(row.jobCostItemId);
            if (!info) return row;
            return {
              ...row,
              jobCostCategoryId: info.categoryId || row.jobCostCategoryId,
              jobCostCategoryName: info.categoryName || row.jobCostCategoryName,
              originalJobAmount: info.originalAmount,
              remainingAvailable: info.remainingAmount,
              invoicedAmountBefore: info.invoicedAmount,
            };
          })
        );
      } catch (err: any) {
        if (seq !== jobCostFetchSeq.current) return;
        console.error("fetchJobCostItems (edit) error:", err);
        setJobCostCategories([]);
        setJobCostTotals(null);
        setHasJobCostItems(false);
        setJobCostLoadError(err?.message || "Network error loading Job cost items.");
      } finally {
        if (seq === jobCostFetchSeq.current) {
          setIsLoadingJobCosts(false);
        }
      }
    },
    []
  );

  // 1. Fetch full invoice details on open
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      if (!isOpen) {
        setRows((prev) => {
          prev.forEach((r) => {
            r.newAttachments.forEach((a) => {
              if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
            });
          });
          return [];
        });
        setSelectedRowIds(new Set());
        setDeletedAttachmentIds([]);
        setJobCostCategories([]);
        setJobCostTotals(null);
        setHasJobCostItems(false);
        setJobCostLoadError("");
        setSubmitError("");
        setEditReason("");
        setBudgetOverrideReason("");
        return;
      }

      const idToFetch = initialInvoice?.id || invoiceId;
      if (!idToFetch) return;

      setIsLoadingInvoice(true);
      fetch(`/api/supplier-invoices/${idToFetch}`)
        .then((res) => res.json())
        .then(async (json) => {
          if (cancelled) return;
          if (json.success && json.data) {
            const inv: SupplierInvoice = json.data;
            setCurrentInvoice(inv);
            const resolvedInvDate = inv.invoiceDate || getTodayDateKeyInTimezone();
            setInvoiceNumber(inv.invoiceNumber || "");
            setInvoiceDate(resolvedInvDate);
            setPaymentDueDate(inv.paymentDueDate || resolvedInvDate);
            setPaymentTerms(inv.paymentTerms || "");
            setCreditPeriodDays(
              inv.creditPeriodDays != null && !Number.isNaN(Number(inv.creditPeriodDays))
                ? String(inv.creditPeriodDays)
                : ""
            );
            setDueDateManuallySet(Boolean(inv.paymentDueDate));
            setNotes(inv.notes || "");
            setBudgetOverrideReason(inv.budgetOverrideReason || "");

            if (inv.supplier) {
              setSelectedSupplier({
                id: inv.supplier.id,
                code: inv.supplier.code || "",
                name: inv.supplier.name,
                contactPerson: inv.supplier.contactPerson,
                phone: inv.supplier.phone,
                email: inv.supplier.email,
              });
            }

            if (inv.job) {
              setSelectedJob({
                id: inv.job.id,
                jobCode: inv.job.jobCode,
                name: inv.job.name,
                clientName: inv.job.clientName,
                date: inv.job.date,
                originalApprovedCost: Number(
                  (json.data as any).approvedJobValue || inv.job.grandTotal || 0
                ),
                currentSupplierCost: Number((json.data as any).totalJobSupplierCost || 0),
                remainingBudget: Number((json.data as any).remainingJobBudget || 0),
                costUtilization: 0,
                isBudgetExceeded: false,
              });
            }

            if (inv.items && inv.items.length > 0) {
              const mappedRows: EditInvoiceRow[] = inv.items.map((it: any) => {
                const amtDec = roundFinancial(toDecimal(it.amount || 0), 2);
                let qtyStr = "1";
                let rateStr = amtDec.toFixed(2);
                if (it.quantity != null && Number(it.quantity) > 0) {
                  qtyStr = formatQtyInput(it.quantity);
                  if (it.unitRate != null && Number(it.unitRate) > 0) {
                    rateStr = roundFinancial(toDecimal(it.unitRate), 2).toFixed(2);
                  } else {
                    rateStr = roundFinancial(amtDec.div(toDecimal(it.quantity)), 2).toFixed(2);
                  }
                }

                return {
                  id: it.id,
                  isNew: false,
                  isLegacy: !it.jobCostItemId,
                  purchaseOrderItemId: it.purchaseOrderItemId || null,
                  jobCostCategoryId: it.jobCostCategoryId || null,
                  jobCostCategoryName: it.jobCostCategoryName || null,
                  jobCostItemId: it.jobCostItemId || null,
                  originalJobAmount:
                    it.originalJobAmount != null ? Number(it.originalJobAmount) : null,
                  remainingAvailable: null,
                  invoicedAmountBefore: null,
                  quantity: qtyStr,
                  unit: it.unit || "Nos",
                  unitRate: rateStr,
                  description: it.description || "",
                  amount: amtDec.toFixed(2),
                  isAdditionalItem: Boolean(it.isAdditionalItem),
                  budgetOverrideReason: it.budgetOverrideReason || "",
                  isEditingDetails: false,
                  notes: it.notes || "",
                  existingAttachments: it.attachments || [],
                  newAttachments: [],
                };
              });
              setRows(mappedRows);
            } else {
              setRows([]);
            }
          }
        })
        .catch((err) => {
          if (cancelled) return;
          console.error("Failed to fetch supplier invoice details:", err);
          setSubmitError("Failed to load invoice details.");
        })
        .finally(() => {
          if (!cancelled) setIsLoadingInvoice(false);
        });

      void searchSuppliers("");
      void searchApprovedJobs("");
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, initialInvoice?.id, invoiceId, searchSuppliers, searchApprovedJobs]);

  // Trigger fetching Job Excel Cost Lines when selectedJob / currentInvoice loads or changes
  const selectedJobId = selectedJob?.id || "";
  const currentInvoiceId = currentInvoice?.id || null;
  useEffect(() => {
    if (!isOpen || !selectedJobId) return;
    const timer = setTimeout(() => {
      void fetchJobCostItems(selectedJobId, currentInvoiceId);
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, selectedJobId, currentInvoiceId, fetchJobCostItems]);

  // Switching to a different Job (Admin only): clear old job's linked items cleanly
  const handleSelectDifferentJob = (newJob: ApprovedJobOption | null) => {
    if (!newJob) {
      setSelectedJob(null);
      setJobSearch("");
      setJobCostCategories([]);
      setJobCostTotals(null);
      setHasJobCostItems(false);
      setJobCostLoadError("");
      searchApprovedJobs("");
      return;
    }
    if (newJob.id !== selectedJob?.id) {
      // Clear any rows tied to old JobCostItems and record any removed existing attachments
      setRows((prev) => {
        prev.forEach((r) => {
          if (r.jobCostItemId) {
            r.existingAttachments.forEach((att) => {
              setDeletedAttachmentIds((d) => (d.includes(att.id) ? d : [...d, att.id]));
            });
            r.newAttachments.forEach((att) => {
              if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
            });
          }
        });
        return prev.filter((r) => !r.jobCostItemId);
      });
      setSelectedRowIds(new Set());
      setJobCostCategories([]);
      setJobCostTotals(null);
      setHasJobCostItems(false);
      setJobCostLoadError("");
      setBudgetOverrideReason("");
    }
    setSelectedJob(newJob);
    setIsJobDropdownOpen(false);
  };

  // Track which JobCostItem IDs are currently in `rows`
  const addedCostItemIds = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.jobCostItemId) set.add(r.jobCostItemId);
    });
    return set;
  }, [rows]);

  // Add selected Excel cost lines as SEPARATE entry rows
  const handleAddSelectedCostItems = (selectedItems: JobCostItemInvoiceInfo[]) => {
    if (!selectedItems || selectedItems.length === 0) return;
    setRows((prev) => {
      const existingIds = new Set(prev.filter((r) => r.jobCostItemId).map((r) => r.jobCostItemId!));
      const additions: EditInvoiceRow[] = [];

      selectedItems.forEach((ci, idx) => {
        if (existingIds.has(ci.id)) return;
        existingIds.add(ci.id);

        const init = computeInitialRowValuesFromCostItem(ci);
        additions.push({
          id: `new-row-${Date.now().toString(36)}-${idx}-${Math.random()
            .toString(36)
            .substring(2, 5)}`,
          isNew: true,
          isLegacy: false,
          purchaseOrderItemId: null,
          jobCostCategoryId: ci.categoryId || null,
          jobCostCategoryName: ci.categoryName,
          jobCostItemId: ci.id,
          originalJobAmount: init.originalJobAmount,
          remainingAvailable: init.remainingAvailable,
          invoicedAmountBefore: ci.invoicedAmount,
          quantity: init.quantity,
          unit: init.unit,
          unitRate: init.unitRate,
          description: ci.description,
          amount: init.amount,
          isAdditionalItem: false,
          budgetOverrideReason: "",
          isEditingDetails: false,
          notes: "",
          existingAttachments: [],
          newAttachments: [],
        });
      });

      return [...prev, ...additions];
    });
    setSubmitError("");
  };

  // Dynamic Row Actions
  const handleAddManualRow = () => {
    if (!canManualEntry) return;
    setRows((prev) => [...prev, makeNewManualEditRow()]);
  };

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
      target.existingAttachments.forEach((att) => {
        setDeletedAttachmentIds((prev) => (prev.includes(att.id) ? prev : [...prev, att.id]));
      });
      target.newAttachments.forEach((att) => {
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
    const deletedAttIds: string[] = [];
    setRows((prev) => {
      prev.forEach((r) => {
        if (selectedRowIds.has(r.id)) {
          r.existingAttachments.forEach((att) => deletedAttIds.push(att.id));
          r.newAttachments.forEach((att) => {
            if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
          });
        }
      });
      return prev.filter((r) => !selectedRowIds.has(r.id));
    });
    if (deletedAttIds.length > 0) {
      setDeletedAttachmentIds((prev) => Array.from(new Set([...prev, ...deletedAttIds])));
    }
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
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
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

  const handleRemoveExistingAttachment = (rowId: string, attachmentId: string) => {
    setDeletedAttachmentIds((prev) => (prev.includes(attachmentId) ? prev : [...prev, attachmentId]));
    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? {
              ...r,
              existingAttachments: r.existingAttachments.filter((att) => att.id !== attachmentId),
            }
          : r
      )
    );
  };

  const handleAddNewFilesToRow = (rowId: string, fileList: FileList | File[]) => {
    const newAttachments: NewRowAttachment[] = [];
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
        r.id === rowId ? { ...r, newAttachments: [...r.newAttachments, ...newAttachments] } : r
      )
    );
  };

  const handleRemoveNewAttachment = (rowId: string, attId: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const target = r.newAttachments.find((a) => a.id === attId);
        if (target && target.previewUrl) URL.revokeObjectURL(target.previewUrl);
        return {
          ...r,
          newAttachments: r.newAttachments.filter((a) => a.id !== attId),
        };
      })
    );
  };

  const handlePreviewExistingAttachment = (att: SupplierInvoiceAttachment, rowDesc?: string) => {
    const category = getFileCategory(att.fileName, att.fileType || undefined);
    setPreviewAttachment({
      name: att.fileName,
      url: att.fileUrl,
      category,
      size: att.fileSize,
      description: rowDesc,
    });
    setIsPreviewModalOpen(true);
  };

  const handlePreviewNewAttachment = (att: NewRowAttachment, rowDesc?: string) => {
    setPreviewAttachment({
      name: att.name,
      url: att.previewUrl || "",
      category: att.category,
      size: att.formattedSize,
      description: rowDesc,
    });
    setIsPreviewModalOpen(true);
  };

  // Calculate Live Totals & Projected Financials (Decimal.js)
  const { totalInvoiceAmount, isOverBudget, projectedJobSupplierCost, projectedRemainingBudget } =
    useMemo(() => {
      let total = new Decimal(0);
      for (const r of rows) {
        const dec = toDecimal(r.amount);
        if (dec.gt(0)) {
          total = total.plus(roundFinancial(dec, 2));
        }
      }

      const totalRounded = roundFinancial(total, 2);
      const totalNum = totalRounded.toNumber();
      if (!selectedJob) {
        return {
          totalInvoiceAmount: totalNum,
          isOverBudget: false,
          projectedJobSupplierCost: 0,
          projectedRemainingBudget: 0,
        };
      }

      const originalInvoiceTotal =
        currentInvoice?.jobId === selectedJob.id ? toDecimal(currentInvoice.totalAmount || 0) : new Decimal(0);

      const otherJobSupplierCosts = Decimal.max(
        0,
        toDecimal(selectedJob.currentSupplierCost).minus(originalInvoiceTotal)
      );
      const projectedSupplierCost = roundFinancial(otherJobSupplierCosts.plus(totalRounded), 2);
      const projectedRemaining = roundFinancial(
        toDecimal(selectedJob.originalApprovedCost).minus(projectedSupplierCost),
        2
      );
      const isOver = projectedSupplierCost.gt(toDecimal(selectedJob.originalApprovedCost));

      return {
        totalInvoiceAmount: totalNum,
        isOverBudget: isOver,
        projectedJobSupplierCost: projectedSupplierCost.toNumber(),
        projectedRemainingBudget: projectedRemaining.toNumber(),
      };
    }, [rows, selectedJob, currentInvoice]);

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

  // Due Date & Terms Helpers
  const existingPaidAmount = roundFinancial(toDecimal(currentInvoice?.paidAmount ?? 0), 2).toNumber();
  const hasExistingPayments = existingPaidAmount > 0;
  const originalDueDateKey = currentInvoice?.paymentDueDate || currentInvoice?.invoiceDate || "";
  const isDueDateChanged = Boolean(originalDueDateKey && paymentDueDate && paymentDueDate !== originalDueDateKey);

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

  const isTotalBelowPaidAmount = useMemo(() => {
    if (!hasExistingPayments) return false;
    return toDecimal(totalInvoiceAmount).lt(toDecimal(existingPaidAmount));
  }, [hasExistingPayments, totalInvoiceAmount, existingPaidAmount]);

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

  // Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setSubmitError("");

    if (!currentInvoice?.id) {
      setSubmitError("No invoice ID provided.");
      return;
    }

    if (currentInvoice.status === "CANCELLED") {
      setSubmitError("Cancelled invoices cannot be edited.");
      return;
    }

    if (!editReason.trim()) {
      setSubmitError(
        "A mandatory reason for editing this invoice is required for financial audit tracking."
      );
      return;
    }

    if (!selectedSupplier?.id) {
      setSubmitError("Please select a valid supplier.");
      return;
    }

    if (!selectedJob?.id) {
      setSubmitError("Please select an approved Job.");
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

    if (isTotalBelowPaidAmount) {
      setSubmitError(
        `Invoice Total (${formatCurrency(totalInvoiceAmount)}) cannot be reduced below the already Paid Amount (${formatCurrency(existingPaidAmount)}). Reverse excess payments first.`
      );
      return;
    }

    if (rows.length === 0) {
      setSubmitError("At least one invoice row item is required.");
      return;
    }

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.description.trim()) {
        setSubmitError(`Row ${i + 1}: Description is required.`);
        return;
      }
      const qtyDec = roundFinancial(toDecimal(r.quantity), 4);
      if (qtyDec.lte(0)) {
        setSubmitError(`Row ${i + 1} ("${r.description}"): Invoice quantity must be greater than 0.`);
        return;
      }
      const rateDec = roundFinancial(toDecimal(r.unitRate), 2);
      if (rateDec.lte(0)) {
        setSubmitError(`Row ${i + 1} ("${r.description}"): Invoice rate must be greater than 0.00.`);
        return;
      }
      const amtDec = roundFinancial(toDecimal(r.amount), 2);
      if (amtDec.lte(0)) {
        setSubmitError(`Row ${i + 1} ("${r.description}"): Invoice amount must be greater than 0.00.`);
        return;
      }
      const hasError = r.newAttachments.some((a) => a.error);
      if (hasError) {
        setSubmitError(
          `Row ${i + 1} ("${r.description}") has unsupported or oversized attachments. Please remove them.`
        );
        return;
      }
    }

    if (overBudgetRows.length > 0) {
      if (!canOverrideBudget) {
        setSubmitError(
          `Row "${overBudgetRows[0].description}" exceeds remaining uninvoiced Job cost line balance (${formatCurrency(overBudgetRows[0].remainingAvailable)}). Requires 'Override Job Cost Line Budget' permission.`
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

    const totalNewAttachments = rows.reduce((acc, r) => acc + (r.newAttachments?.length || 0), 0);
    setIsSubmitting(true);
    setUploadProgress(0);
    setUploadStageText(
      totalNewAttachments > 0
        ? "1. Uploading modified attachments to Supabase Storage..."
        : "1. Preparing updated invoice data..."
    );

    try {
      const formData = new FormData();
      formData.append("supplierId", selectedSupplier.id);
      formData.append("jobId", selectedJob.id);
      formData.append("invoiceNumber", invoiceNumber.trim() || currentInvoice.invoiceNumber);
      formData.append("invoiceDate", invoiceDate);
      formData.append("paymentDueDate", paymentDueDate || suggestedDueDate || invoiceDate);
      formData.append("paymentTerms", paymentTerms.trim());
      formData.append("creditPeriodDays", creditPeriodDays.trim());
      formData.append("notes", notes.trim());
      formData.append("reason", editReason.trim());
      formData.append("budgetOverrideReason", budgetOverrideReason.trim());
      formData.append("deletedAttachmentIds", JSON.stringify(deletedAttachmentIds));

      const itemsPayload = rows.map((r, idx) => {
        const normalizedPricing = normalizeRowAmountOnBlur({
          quantity: r.quantity,
          unitRate: r.unitRate,
          amount: r.amount,
        });
        return {
          id: r.isNew ? undefined : r.id,
          rowNumber: idx + 1,
          purchaseOrderItemId: r.purchaseOrderItemId || null,
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
        r.newAttachments.forEach((att) => {
          formData.append(`files_${idx}`, att.file);
        });
      });

      const json: any = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", `/api/supplier-invoices/${currentInvoice.id}`);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const pct = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(pct);
            if (pct < 100) {
              setUploadStageText(
                totalNewAttachments > 0
                  ? `1. Uploading attachments (${pct}%)...`
                  : `1. Sending update payload (${pct}%)...`
              );
            } else {
              setUploadStageText("2. Updating invoice line items & storage references...");
            }
          }
        };

        xhr.onload = () => {
          setUploadStageText("3. Recalculating Job Cost, Remaining Budget & Profit...");
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300 && data.success) {
              resolve(data);
            } else {
              reject(new Error(data.error || "Failed to update supplier invoice."));
            }
          } catch {
            reject(new Error("Invalid response format received from server."));
          }
        };

        xhr.onerror = () => {
          reject(new Error("Network connection error during invoice update."));
        };

        xhr.send(formData);
      });

      if (refreshJobs) {
        refreshJobs().catch(() => {});
      }

      onSuccess(json.data);
      onClose();
    } catch (err: any) {
      console.error("Edit supplier invoice error:", err?.message || String(err));
      setSubmitError(err?.message || "An unexpected error occurred while saving the invoice.");
    } finally {
      setIsSubmitting(false);
      setUploadProgress(0);
      setUploadStageText("");
    }
  };

  const isCancelled = currentInvoice?.status === "CANCELLED";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Edit Supplier Invoice: ${currentInvoice?.invoiceNumber || ""}`}
      description="Load additional Job Excel cost lines, adjust quantities/rates/amounts, manage attachments & recalculate job finances"
      maxWidth="6xl"
    >
      {isLoadingInvoice ? (
        <div className="py-20 text-center text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
          <p className="text-xs font-semibold">Loading invoice details & line items...</p>
        </div>
      ) : isCancelled ? (
        <div className="p-6 text-center space-y-4">
          <div className="h-12 w-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">This Invoice is Cancelled</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              Supplier invoice <strong>{currentInvoice?.invoiceNumber}</strong> has been cancelled and
              cannot be edited. Please restore the invoice first or create a new invoice.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg cursor-pointer"
          >
            Close
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5 text-xs text-slate-800">
          {submitError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="text-xs flex-1">
                <span className="font-bold">Cannot Save Invoice:</span> {submitError}
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

          {/* Section 1: Linked Supplier & Job */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Supplier Selector */}
            <div className="space-y-1 relative">
              <label className="block font-semibold text-slate-700">
                Supplier Register <span className="text-rose-500">*</span>
              </label>

              {selectedSupplier ? (
                <div className="p-2.5 rounded-xl border border-blue-200 bg-blue-50/50 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs">
                      <Building2 className="h-3.5 w-3.5 text-blue-600" />
                      <span>{selectedSupplier.name}</span>
                      <span className="text-[10px] text-blue-700 font-mono font-medium px-1.5 py-0.2 bg-blue-100 rounded">
                        {selectedSupplier.code}
                      </span>
                    </div>
                    {selectedSupplier.contactPerson && (
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Contact: {selectedSupplier.contactPerson} ({selectedSupplier.phone || "No phone"})
                      </p>
                    )}
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSupplier(null);
                        setSupplierSearch("");
                        searchSuppliers("");
                      }}
                      className="text-[11px] text-blue-600 hover:text-blue-800 underline font-medium cursor-pointer"
                    >
                      Change
                    </button>
                  )}
                </div>
              ) : (
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={supplierSearch}
                      onChange={(e) => {
                        setSupplierSearch(e.target.value);
                        setIsSupplierDropdownOpen(true);
                        if (supplierSearchTimeout.current) clearTimeout(supplierSearchTimeout.current);
                        supplierSearchTimeout.current = setTimeout(() => {
                          searchSuppliers(e.target.value);
                        }, 200);
                      }}
                      onFocus={() => setIsSupplierDropdownOpen(true)}
                      placeholder="Search supplier name or code..."
                      className="w-full pl-8 pr-8 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    {isLoadingSuppliers && (
                      <Loader2 className="absolute right-3 top-2.5 h-3.5 w-3.5 animate-spin text-slate-400" />
                    )}
                  </div>

                  {isSupplierDropdownOpen && (
                    <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg py-1">
                      {suppliersList.length === 0 ? (
                        <div className="px-3 py-2 text-center text-slate-400 text-xs">
                          {isLoadingSuppliers ? "Searching..." : "No matching suppliers found"}
                        </div>
                      ) : (
                        suppliersList.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setSelectedSupplier(s);
                              setIsSupplierDropdownOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-blue-50/80 flex items-center justify-between border-b border-slate-100 last:border-b-0 cursor-pointer"
                          >
                            <div>
                              <span className="font-semibold text-slate-900 block">{s.name}</span>
                              <span className="text-[10px] text-slate-400">
                                Code: {s.code} {s.contactPerson ? `• ${s.contactPerson}` : ""}
                              </span>
                            </div>
                            <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                              Select
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Approved Job Selector */}
            <div className="space-y-1 relative">
              <label className="block font-semibold text-slate-700">
                Linked Approved Job <span className="text-rose-500">*</span>
              </label>

              {selectedJob ? (
                <div className="p-2.5 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs">
                        <Briefcase className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="font-mono text-emerald-800 font-bold">
                          {selectedJob.jobCode}
                        </span>
                        <span className="text-slate-600 font-normal">| {selectedJob.name}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Client: {selectedJob.clientName}
                      </p>
                    </div>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleSelectDifferentJob(null)}
                        className="text-[11px] text-emerald-700 hover:text-emerald-900 underline font-medium cursor-pointer"
                      >
                        Change
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-emerald-200/80 text-[11px]">
                    <div className="bg-white/90 rounded-lg p-1.5 border border-emerald-100">
                      <span className="text-[10px] text-slate-500 font-medium block">
                        Approved Budget
                      </span>
                      <span className="font-mono font-bold text-slate-900 text-xs">
                        {formatCurrency(selectedJob.originalApprovedCost)}
                      </span>
                    </div>
                    <div className="bg-white/90 rounded-lg p-1.5 border border-emerald-100">
                      <span className="text-[10px] text-slate-500 font-medium block">
                        Projected Expenses
                      </span>
                      <span
                        className={`font-mono font-bold text-xs ${
                          isOverBudget ? "text-rose-600" : "text-amber-700"
                        }`}
                      >
                        {formatCurrency(projectedJobSupplierCost)}
                      </span>
                    </div>
                    <div className="bg-white/90 rounded-lg p-1.5 border border-emerald-100">
                      <span className="text-[10px] text-slate-500 font-medium block">
                        Remaining Budget
                      </span>
                      <span
                        className={`font-mono font-bold text-xs ${
                          projectedRemainingBudget < 0 ? "text-rose-600" : "text-emerald-700"
                        }`}
                      >
                        {formatCurrency(projectedRemainingBudget)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={jobSearch}
                      onChange={(e) => {
                        setJobSearch(e.target.value);
                        setIsJobDropdownOpen(true);
                        if (jobSearchTimeout.current) clearTimeout(jobSearchTimeout.current);
                        jobSearchTimeout.current = setTimeout(() => {
                          searchApprovedJobs(e.target.value);
                        }, 200);
                      }}
                      onFocus={() => setIsJobDropdownOpen(true)}
                      placeholder="Search approved Job by code or client..."
                      className="w-full pl-8 pr-8 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                    />
                    {isLoadingJobs && (
                      <Loader2 className="absolute right-3 top-2.5 h-3.5 w-3.5 animate-spin text-slate-400" />
                    )}
                  </div>

                  {isJobDropdownOpen && (
                    <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg py-1">
                      {approvedJobsList.length === 0 ? (
                        <div className="px-3 py-2 text-center text-slate-400 text-xs">
                          {isLoadingJobs ? "Searching..." : "No approved jobs found"}
                        </div>
                      ) : (
                        approvedJobsList.map((j) => (
                          <button
                            key={j.id}
                            type="button"
                            onClick={() => handleSelectDifferentJob(j)}
                            className="w-full text-left px-3 py-2 hover:bg-emerald-50/80 flex items-center justify-between border-b border-slate-100 last:border-b-0 cursor-pointer"
                          >
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-emerald-700 text-xs">
                                  {j.jobCode}
                                </span>
                                <span className="font-semibold text-slate-800 text-xs">
                                  | {j.name}
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-400">
                                Client: {j.clientName} • Budget:{" "}
                                {formatCurrency(j.originalApprovedCost)}
                              </span>
                            </div>
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                              Select
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Invoice Metadata, Payment Due Terms & Mandatory Edit Reason */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            {hasExistingPayments && (
              <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 flex items-start gap-2 text-[11px]">
                <AlertTriangle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold">
                    Existing Payments Recorded ({formatCurrency(existingPaidAmount, { showCurrencyPrefix: true })} Paid)
                  </p>
                  <p className="text-blue-800">
                    The new Invoice Total cannot be reduced below{" "}
                    <span className="font-mono font-bold">
                      {formatCurrency(existingPaidAmount, { showCurrencyPrefix: true })}
                    </span>
                    . Any change to Payment Due Date{" "}
                    {isDueDateChanged ? `(changing from ${originalDueDateKey} to ${paymentDueDate}) ` : ""}
                    is permanently audited in both Invoice &amp; Payment Audit Logs.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Invoice Reference # <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  required
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
                  <label className="block font-semibold text-slate-700">Credit Period (Days)</label>
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
                      Suggest ({suggestedDueDate})
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

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
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
                  placeholder="e.g. Net 30 Days, Credit 45..."
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="lg:col-span-4">
                <label className="block font-semibold text-slate-700 mb-1">Remarks / Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional remarks..."
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="lg:col-span-3">
                <label className="block font-semibold text-slate-700 mb-1">
                  Updated Invoice Total
                </label>
                <div
                  className={`w-full px-3 py-1.5 rounded-lg border flex items-center justify-between ${
                    isTotalBelowPaidAmount
                      ? "border-rose-300 bg-rose-50 text-rose-800"
                      : "border-emerald-200 bg-emerald-50/70 text-emerald-800"
                  }`}
                >
                  <span className="text-[10px] font-semibold uppercase">Total</span>
                  <span className="font-mono font-bold text-sm">
                    {formatCurrency(totalInvoiceAmount, { showCurrencyPrefix: true })}
                  </span>
                </div>
              </div>
            </div>

            {isDueDateBeforeInvoiceDate && (
              <div
                className={`p-2 rounded-lg border flex items-center gap-2 text-[11px] ${
                  canOverrideDueDate
                    ? "bg-amber-50 border-amber-200 text-amber-800"
                    : "bg-rose-50 border-rose-200 text-rose-800"
                }`}
              >
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  {canOverrideDueDate
                    ? `Payment Due Date (${paymentDueDate}) is earlier than Invoice Date (${invoiceDate}). Permitted via Override Due Date.`
                    : `Payment Due Date (${paymentDueDate}) cannot be earlier than Invoice Date (${invoiceDate}).`}
                </span>
              </div>
            )}

            <div className="pt-2 border-t border-slate-200">
              <label className="block font-bold text-slate-800 mb-1">
                Reason for Edit (Mandatory Financial Audit Trail){" "}
                <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="e.g. Updated item quantity, adjusted Payment Due Date, attached supplier delivery note..."
                required
                className="w-full px-3 py-2 rounded-lg border border-amber-300 bg-amber-50/40 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none"
              />
            </div>
          </div>

          {/* Section 3: Job Cost Selector & Dynamic Invoice Entries */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
              <div>
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                  3. Dynamic Supplier Invoice Entries & Multi-Format Attachments
                </h4>
                <p className="text-[11px] text-slate-500">
                  Add additional saved Job Excel cost lines, modify Qty / Unit / Rate / Amount, and manage attachments.
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 font-semibold transition-colors shadow-2xs disabled:opacity-40 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Manual Row</span>
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-500 border border-slate-200 text-[11px] font-medium">
                    <Lock className="h-3 w-3" />
                    <span>Excel Cost Lines Only</span>
                  </span>
                )}
              </div>
            </div>

            {selectedJob && (
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
                onRetryLoad={() => fetchJobCostItems(selectedJob.id, currentInvoiceId)}
              />
            )}

            {/* Per-Cost-Line Budget Overrun Guard Banner */}
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
                        vs Remaining Balance{" "}
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
                    Reduce the invoice amounts above within remaining balances, or ask a
                    Supervisor/Administrator with &ldquo;Override Job Cost Line Budget&rdquo; permission.
                  </p>
                )}
              </div>
            )}

            {/* Dynamic Entries Table */}
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
                            No Supplier Invoice Entry Rows
                          </p>
                          <p className="text-[11px] text-slate-400 mt-1">
                            Select Job Excel cost lines above{hasJobCostItems ? "" : " or add a manual row"} to continue.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      rows.map((row, index) => {
                        const rowNumber = index + 1;
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
                                  #{rowNumber}
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
                                  {row.jobCostCategoryName || (row.isLegacy ? "Legacy" : "Manual")}
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
                                  placeholder={`Description for item #${rowNumber}`}
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                  required
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
                                    {row.isLegacy ? "Existing Manual Line" : "Manual Entry"}
                                  </span>
                                )}
                                {row.purchaseOrderItemId && (
                                  <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold">
                                    PO Item
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

                            {/* Original Job Amount */}
                            <td className="py-3 px-2.5 text-right font-mono font-semibold text-slate-600">
                              {row.originalJobAmount != null
                                ? formatCurrency(row.originalJobAmount)
                                : "—"}
                            </td>

                            {/* Invoice Qty */}
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
                                className="w-full text-right px-2 py-1.5 rounded-lg border border-slate-300 bg-white font-mono text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
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
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
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
                                className="w-full text-right px-2 py-1.5 rounded-lg border border-slate-300 bg-white font-mono text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
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
                                className={`w-full text-right px-2 py-1.5 rounded-lg border bg-white font-mono font-bold text-xs outline-none focus:ring-2 ${
                                  isOver
                                    ? "border-amber-400 text-amber-800 focus:ring-amber-500"
                                    : "border-slate-300 text-slate-900 focus:ring-blue-500"
                                }`}
                                required
                              />
                            </td>

                            {/* Attachments Section */}
                            <td className="py-3 px-2.5 space-y-1.5">
                              {row.existingAttachments.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {row.existingAttachments.map((att) => (
                                    <div
                                      key={att.id}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px]"
                                    >
                                      <FileText className="h-3 w-3 text-slate-600 shrink-0" />
                                      <span
                                        className="font-medium text-slate-700 max-w-[100px] truncate cursor-pointer hover:underline"
                                        onClick={() =>
                                          handlePreviewExistingAttachment(att, row.description)
                                        }
                                        title={att.fileName}
                                      >
                                        {att.fileName}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handlePreviewExistingAttachment(att, row.description)
                                        }
                                        className="p-0.5 text-slate-400 hover:text-blue-600 cursor-pointer"
                                        title="Preview file"
                                      >
                                        <Eye className="h-2.5 w-2.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveExistingAttachment(row.id, att.id)}
                                        className="p-0.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                                        title="Remove attachment"
                                      >
                                        <X className="h-2.5 w-2.5" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="flex items-center gap-2">
                                <label className="cursor-pointer inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-dashed border-blue-300 bg-blue-50/50 hover:bg-blue-100/60 text-blue-700 text-[10px] font-semibold transition-colors">
                                  <Upload className="h-3 w-3" />
                                  <span>Upload Files</span>
                                  <input
                                    type="file"
                                    multiple
                                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                                    onChange={(e) => {
                                      if (e.target.files && e.target.files.length > 0) {
                                        handleAddNewFilesToRow(row.id, e.target.files);
                                        e.target.value = "";
                                      }
                                    }}
                                    className="hidden"
                                  />
                                </label>
                              </div>

                              {row.newAttachments.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-0.5">
                                  {row.newAttachments.map((att) => (
                                    <div
                                      key={att.id}
                                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] ${
                                        att.error
                                          ? "bg-rose-50 border-rose-200 text-rose-700"
                                          : "bg-emerald-50 border-emerald-200 text-emerald-800"
                                      }`}
                                    >
                                      {att.category === "image" && att.previewUrl ? (
                                        <Image
                                          unoptimized
                                          src={att.previewUrl}
                                          alt={att.name}
                                          width={14}
                                          height={14}
                                          className="h-3.5 w-3.5 object-cover rounded shrink-0"
                                        />
                                      ) : (
                                        <Paperclip className="h-2.5 w-2.5 shrink-0" />
                                      )}
                                      <span
                                        className="font-medium max-w-[100px] truncate cursor-pointer hover:underline"
                                        onClick={() =>
                                          !att.error && handlePreviewNewAttachment(att, row.description)
                                        }
                                        title={att.name}
                                      >
                                        {att.name}
                                      </span>
                                      {!att.error && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handlePreviewNewAttachment(att, row.description)
                                          }
                                          className="p-0.5 text-slate-400 hover:text-emerald-700 cursor-pointer"
                                          title="Preview"
                                        >
                                          <Eye className="h-2.5 w-2.5" />
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveNewAttachment(row.id, att.id)}
                                        className="p-0.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                                        title="Remove"
                                      >
                                        <X className="h-2.5 w-2.5" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>

                            {/* Actions */}
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
                                  title="Delete row"
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
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-200">
                      <td
                        colSpan={7}
                        className="py-3 px-4 font-bold text-slate-700 text-right uppercase text-[11px]"
                      >
                        Total Edited Invoice Amount:
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono font-extrabold text-blue-700 text-sm">
                        {formatCurrency(totalInvoiceAmount, { showCurrencyPrefix: true })}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>

          {isOverBudget && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-800 flex items-start gap-2 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              <div>
                <span className="font-bold">Projected Cost Warning:</span> This invoice will cause total
                supplier expenses for Job <strong>{selectedJob?.jobCode}</strong> (
                {formatCurrency(projectedJobSupplierCost)}) to exceed the approved budget ceiling (
                {formatCurrency(selectedJob?.originalApprovedCost)}).
              </div>
            </div>
          )}

          {isSubmitting && (
            <div className="p-3 rounded-xl bg-blue-50/80 border border-blue-200 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-blue-900">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                  <span>{uploadStageText || "Saving invoice changes..."}</span>
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

          {/* Modal Footer Controls */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            <div className="text-[11px] text-slate-500">
              {rows.length} row{rows.length !== 1 ? "s" : ""} • Total:{" "}
              <strong className="text-slate-800 font-mono">
                {formatCurrency(totalInvoiceAmount, { showCurrencyPrefix: true })}
              </strong>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  isSubmitting ||
                  !editReason.trim() ||
                  rows.length === 0 ||
                  (overBudgetRows.length > 0 && !canOverrideBudget)
                }
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>
                      {uploadStageText ? uploadStageText.split(" (")[0] : "Saving & Recalculating..."}
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Save & Recalculate Finances</span>
                  </>
                )}
              </button>
            </div>
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
