"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Image from "next/image";
import { Modal } from "@/components/admin/ui/modal";
import { useAdminData } from "@/context/admin-data-context";
import { formatCurrency } from "@/lib/financial";
import { SupplierInvoice, SupplierInvoiceAttachment } from "@/types/admin";
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
  Eye,
  Loader2,
  Calendar,
  ChevronDown,
  ExternalLink,
  Image as ImageIcon,
  Paperclip,
  Edit,
  Info,
  ShieldAlert,
  ShoppingCart,
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
import type { EligiblePoOption } from "@/components/admin/modals/create-supplier-invoice-modal";

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
  id: string; // Database item id or temporary "new-row-xxx"
  isNew?: boolean;
  purchaseOrderItemId?: string | null;
  quantity?: string;
  description: string;
  amount: string;
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

export function EditSupplierInvoiceModal({
  isOpen,
  onClose,
  invoice: initialInvoice,
  invoiceId,
  onSuccess,
  isAdmin = true,
}: EditSupplierInvoiceModalProps) {
  const { suppliers: contextSuppliers, refreshJobs, can } = useAdminData();
  const canOverridePoBalance = can("purchaseOrders", "overrideJobBudget");

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

  // Invoice header
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [notes, setNotes] = useState("");
  const [editReason, setEditReason] = useState("");

  // Optional Purchase Order Linking
  const [eligiblePos, setEligiblePos] = useState<EligiblePoOption[]>([]);
  const [isLoadingPos, setIsLoadingPos] = useState(false);
  const [selectedPo, setSelectedPo] = useState<EligiblePoOption | null>(null);
  const [poOverInvoiceOverride, setPoOverInvoiceOverride] = useState(false);

  // Dynamic rows & attachments
  const [rows, setRows] = useState<EditInvoiceRow[]>([]);
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
  const selectedPoRef = useRef<EligiblePoOption | null>(null);

  useEffect(() => {
    selectedPoRef.current = selectedPo;
  }, [selectedPo]);

  const loadEligiblePosForEdit = useCallback(async (
    jobIdFilter?: string,
    supplierIdFilter?: string,
    includePoId?: string | null,
    excludeInvId?: string | null
  ): Promise<EligiblePoOption[]> => {
    setIsLoadingPos(true);
    try {
      const qs = new URLSearchParams();
      if (jobIdFilter) qs.set("jobId", jobIdFilter);
      if (supplierIdFilter) qs.set("supplierId", supplierIdFilter);
      if (includePoId) qs.set("includePoId", includePoId);
      if (excludeInvId) qs.set("excludeInvoiceId", excludeInvId);
      const res = await fetch(`/api/purchase-orders/eligible-for-invoice?${qs.toString()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setEligiblePos(json.data);
          return json.data;
        }
      }
    } catch (err) {
      console.error("loadEligiblePosForEdit error:", err);
    } finally {
      setIsLoadingPos(false);
    }
    return [];
  }, []);

  // Search Suppliers
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
  }, [contextSuppliers]);

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

  // 1. Fetch full invoice details on open
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      if (!isOpen) {
        setRows([]);
        setDeletedAttachmentIds([]);
        setSubmitError("");
        setEditReason("");
        setSelectedPo(null);
        setEligiblePos([]);
        setPoOverInvoiceOverride(false);
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
            setInvoiceNumber(inv.invoiceNumber || "");
            setInvoiceDate(inv.invoiceDate || new Date().toISOString().split("T")[0]);
            setNotes(inv.notes || "");

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
                originalApprovedCost: Number((json.data as any).approvedJobValue || inv.job.grandTotal || 0),
                currentSupplierCost: Number((json.data as any).totalJobSupplierCost || 0),
                remainingBudget: Number((json.data as any).remainingJobBudget || 0),
                costUtilization: 0,
                isBudgetExceeded: false,
              });
            }

            // Populate rows (preserve purchaseOrderItemId & quantity)
            if (inv.items && inv.items.length > 0) {
              const mappedRows: EditInvoiceRow[] = inv.items.map((it: any) => ({
                id: it.id,
                purchaseOrderItemId: it.purchaseOrderItemId || null,
                quantity: it.quantity != null ? String(it.quantity) : "",
                description: it.description || "",
                amount: String(it.amount || 0),
                notes: it.notes || "",
                existingAttachments: it.attachments || [],
                newAttachments: [],
              }));
              setRows(mappedRows);
            } else {
              setRows([
                {
                  id: "row-1",
                  isNew: true,
                  purchaseOrderItemId: null,
                  quantity: "",
                  description: "",
                  amount: "",
                  existingAttachments: [],
                  newAttachments: [],
                },
              ]);
            }

            // Load eligible POs & auto-select existing linked PO if present
            const pos = await loadEligiblePosForEdit(
              inv.jobId,
              inv.supplierId,
              inv.purchaseOrderId || null,
              inv.id
            );
            if (cancelled) return;
            if (inv.purchaseOrderId) {
              const matchedPo = pos.find((p) => p.id === inv.purchaseOrderId);
              if (matchedPo) setSelectedPo(matchedPo);
            } else {
              setSelectedPo(null);
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

      // Load initial suppliers & approved jobs
      void searchSuppliers("");
      void searchApprovedJobs("");
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, initialInvoice?.id, invoiceId, searchSuppliers, searchApprovedJobs, loadEligiblePosForEdit]);

  // Reload eligible POs if supplier/job changes during edit
  useEffect(() => {
    if (!isOpen || isLoadingInvoice || !currentInvoice?.id) return;
    const invId = currentInvoice.id;
    const linkedPoId = currentInvoice.purchaseOrderId || null;
    const timer = setTimeout(() => {
      void loadEligiblePosForEdit(
        selectedJob?.id,
        selectedSupplier?.id,
        linkedPoId,
        invId
      );
      const currentPo = selectedPoRef.current;
      if (currentPo) {
        const jobMismatch = selectedJob && currentPo.jobId !== selectedJob.id;
        const supMismatch = selectedSupplier && currentPo.supplierId !== selectedSupplier.id;
        if (jobMismatch || supMismatch) {
          setSelectedPo(null);
          setPoOverInvoiceOverride(false);
          setRows((prev) => prev.map((r) => ({ ...r, purchaseOrderItemId: null })));
        }
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [
    isOpen,
    isLoadingInvoice,
    currentInvoice?.id,
    currentInvoice?.purchaseOrderId,
    selectedJob,
    selectedSupplier,
    loadEligiblePosForEdit,
  ]);

  const handleSelectPurchaseOrder = (poId: string) => {
    if (!poId) {
      setSelectedPo(null);
      setPoOverInvoiceOverride(false);
      setRows((prev) => prev.map((r) => ({ ...r, purchaseOrderItemId: null })));
      return;
    }
    const found = eligiblePos.find((p) => p.id === poId);
    if (!found) return;
    setSelectedPo(found);
    setPoOverInvoiceOverride(false);

    if (!selectedSupplier || selectedSupplier.id !== found.supplierId) {
      const matchedSup =
        suppliersList.find((s) => s.id === found.supplierId) ||
        (contextSuppliers || []).find((s) => s.id === found.supplierId);
      if (matchedSup) {
        setSelectedSupplier({
          id: matchedSup.id,
          code: matchedSup.code,
          name: matchedSup.name,
          contactPerson: matchedSup.contactPerson,
          phone: matchedSup.phone,
          email: matchedSup.email,
        });
      } else {
        setSelectedSupplier({
          id: found.supplierId,
          code: found.supplierCode,
          name: found.supplierName,
        });
      }
    }

    if (!selectedJob || selectedJob.id !== found.jobId) {
      const matchedJob = approvedJobsList.find((j) => j.id === found.jobId);
      if (matchedJob) setSelectedJob(matchedJob);
    }
  };

  const handleLinkRowPoItem = (rowId: string, poItemId: string) => {
    if (!poItemId) {
      setRows((prev) =>
        prev.map((r) => (r.id === rowId ? { ...r, purchaseOrderItemId: null } : r))
      );
      return;
    }
    const poItem = selectedPo?.items?.find((it) => it.id === poItemId);
    if (!poItem) return;
    const defaultQty = poItem.remainingQuantity > 0 ? poItem.remainingQuantity : poItem.quantity;
    const defaultAmt = poItem.remainingAmount > 0 ? poItem.remainingAmount : poItem.totalAmount;
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        return {
          ...r,
          purchaseOrderItemId: poItem.id,
          description: r.description.trim() ? r.description : poItem.particular,
          quantity: r.quantity && parseFloat(r.quantity) > 0 ? r.quantity : String(defaultQty),
          amount:
            r.amount && parseFloat(r.amount) > 0 ? r.amount : defaultAmt.toFixed(2),
        };
      })
    );
  };

  const handleRowQuantityChange = (rowId: string, value: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const poItem =
          r.purchaseOrderItemId && selectedPo
            ? selectedPo.items.find((it) => it.id === r.purchaseOrderItemId)
            : null;
        const q = parseFloat(value);
        const computedAmt =
          poItem && poItem.unitCost > 0 && !isNaN(q) && q > 0
            ? new Decimal(q).times(poItem.unitCost).toFixed(2)
            : r.amount;
        return { ...r, quantity: value, amount: computedAmt };
      })
    );
  };

  const handleLoadMissingPoItems = () => {
    if (!selectedPo || !selectedPo.items || selectedPo.items.length === 0) return;
    const isSingleBlankRow =
      rows.length === 1 && !rows[0].description.trim() && !rows[0].amount.trim();

    const mappedPoRows: EditInvoiceRow[] = selectedPo.items.map((it, idx) => {
      const qtyToBill = it.remainingQuantity > 0 ? it.remainingQuantity : it.quantity;
      const amtToBill = it.remainingAmount > 0 ? it.remainingAmount : it.totalAmount;
      return {
        id: `new-po-row-${it.id}-${Date.now().toString(36)}-${idx}`,
        isNew: true,
        purchaseOrderItemId: it.id,
        quantity: String(qtyToBill),
        description: it.particular,
        amount: amtToBill.toFixed(2),
        existingAttachments: [],
        newAttachments: [],
      };
    });

    if (isSingleBlankRow) {
      setRows(mappedPoRows);
    } else {
      const existingMappedIds = new Set(
        rows.map((r) => r.purchaseOrderItemId).filter(Boolean)
      );
      const additions = mappedPoRows.filter(
        (r) => !existingMappedIds.has(r.purchaseOrderItemId!)
      );
      if (additions.length > 0) {
        setRows((prev) => [...prev, ...additions]);
      }
    }
  };

  // Dynamic Row Actions
  const handleAddRow = () => {
    const nextId = "new-row-" + Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
    setRows((prev) => [
      ...prev,
      {
        id: nextId,
        isNew: true,
        purchaseOrderItemId: null,
        quantity: "",
        description: "",
        amount: "",
        existingAttachments: [],
        newAttachments: [],
      },
    ]);
  };

  const handleRemoveRow = (id: string) => {
    if (rows.length <= 1) return;
    const target = rows.find((r) => r.id === id);
    if (target) {
      // Mark existing attachments in this row for deletion
      target.existingAttachments.forEach((att) => {
        setDeletedAttachmentIds((prev) => [...prev, att.id]);
      });
      // Revoke preview object URLs for new attachments
      target.newAttachments.forEach((att) => {
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

  const handleRemoveExistingAttachment = (rowId: string, attachmentId: string) => {
    setDeletedAttachmentIds((prev) => [...prev, attachmentId]);
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

  // Preview Existing Attachment
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

  // Preview New Attachment
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

  // Calculate Live Totals & Projected Financials
  const { totalInvoiceAmount, isOverBudget, projectedJobSupplierCost, projectedRemainingBudget } =
    useMemo(() => {
      let total = new Decimal(0);
      for (const r of rows) {
        const val = parseFloat(r.amount);
        if (!isNaN(val) && val > 0) {
          total = total.plus(new Decimal(val));
        }
      }

      const totalNum = total.toNumber();
      if (!selectedJob) {
        return {
          totalInvoiceAmount: totalNum,
          isOverBudget: false,
          projectedJobSupplierCost: 0,
          projectedRemainingBudget: 0,
        };
      }

      // If this invoice is already linked to selectedJob, subtract the original invoice amount
      // before adding the new edited total to avoid double counting
      const originalInvoiceTotal =
        currentInvoice?.jobId === selectedJob.id ? Number(currentInvoice.totalAmount || 0) : 0;

      const otherJobSupplierCosts = Math.max(0, selectedJob.currentSupplierCost - originalInvoiceTotal);
      const projectedSupplierCost = otherJobSupplierCosts + totalNum;
      const projectedRemaining = selectedJob.originalApprovedCost - projectedSupplierCost;
      const isOver = projectedSupplierCost > selectedJob.originalApprovedCost;

      return {
        totalInvoiceAmount: totalNum,
        isOverBudget: isOver,
        projectedJobSupplierCost: projectedSupplierCost,
        projectedRemainingBudget: projectedRemaining,
      };
    }, [rows, selectedJob, currentInvoice]);

  const isPoOverInvoiced = Boolean(
    selectedPo && totalInvoiceAmount > Number(selectedPo.remainingUninvoiced || 0) + 0.01
  );

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
      setSubmitError("A mandatory reason for editing this invoice is required for financial audit tracking.");
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

    if (selectedPo && isPoOverInvoiced) {
      if (!canOverridePoBalance) {
        setSubmitError(
          `Invoice total (${formatCurrency(totalInvoiceAmount)}) exceeds remaining uninvoiced balance of PO "${selectedPo.poNumber}" (${formatCurrency(selectedPo.remainingUninvoiced)}). Over-invoicing requires budget override permission.`
        );
        return;
      }
      if (!poOverInvoiceOverride) {
        setSubmitError(
          `Invoice total exceeds remaining uninvoiced balance of PO "${selectedPo.poNumber}". Check "Approve Over-Invoicing Override" below or reduce row amounts.`
        );
        return;
      }
    }

    if (rows.length === 0) {
      setSubmitError("At least one invoice row item is required.");
      return;
    }

    // Check rows validity
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.description.trim()) {
        setSubmitError(`Row ${i + 1}: Description is required.`);
        return;
      }
      const amt = parseFloat(r.amount);
      if (isNaN(amt) || amt <= 0) {
        setSubmitError(`Row ${i + 1}: Amount must be a valid number greater than 0.00.`);
        return;
      }
      // Check attachment errors
      const hasError = r.newAttachments.some((a) => a.error);
      if (hasError) {
        setSubmitError(`Row ${i + 1} has unsupported or oversized attachments. Please remove them.`);
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
      formData.append("purchaseOrderId", selectedPo ? selectedPo.id : "");
      formData.append(
        "poOverInvoiceOverride",
        String(Boolean(selectedPo && isPoOverInvoiced && poOverInvoiceOverride))
      );
      formData.append("invoiceNumber", invoiceNumber.trim() || currentInvoice.invoiceNumber);
      formData.append("invoiceDate", invoiceDate);
      formData.append("notes", notes.trim());
      formData.append("reason", editReason.trim());
      formData.append("deletedAttachmentIds", JSON.stringify(deletedAttachmentIds));

      const itemsPayload = rows.map((r) => ({
        id: r.isNew ? undefined : r.id,
        purchaseOrderItemId: r.purchaseOrderItemId || null,
        quantity: r.quantity && parseFloat(r.quantity) > 0 ? parseFloat(r.quantity) : null,
        description: r.description.trim(),
        amount: parseFloat(r.amount),
        notes: r.notes || "",
      }));
      formData.append("items", JSON.stringify(itemsPayload));

      // Append new attachments per row
      rows.forEach((r, idx) => {
        r.newAttachments.forEach((att) => {
          formData.append(`files_${idx}`, att.file);
        });
      });

      // Track byte progress with XMLHttpRequest
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

      // Trigger background jobs refresh to keep cost overview in sync
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
      description="Modify invoice items, replace multi-format attachments & automatically recalculate job finances"
      maxWidth="4xl"
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
              Supplier invoice <strong>{currentInvoice?.invoiceNumber}</strong> has been cancelled and cannot be
              edited. Please restore the invoice first or create a new invoice.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg"
          >
            Close
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5 text-xs text-slate-800">
          {submitError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-bold">Cannot Save Invoice:</span> {submitError}
              </div>
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
                      className="text-[11px] text-blue-600 hover:text-blue-800 underline font-medium"
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
                            className="w-full text-left px-3 py-2 hover:bg-blue-50/80 flex items-center justify-between border-b border-slate-100 last:border-b-0"
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
                        <span className="font-mono text-emerald-800 font-bold">{selectedJob.jobCode}</span>
                        <span className="text-slate-600 font-normal">| {selectedJob.name}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">Client: {selectedJob.clientName}</p>
                    </div>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedJob(null);
                          setJobSearch("");
                          searchApprovedJobs("");
                        }}
                        className="text-[11px] text-emerald-700 hover:text-emerald-900 underline font-medium"
                      >
                        Change
                      </button>
                    )}
                  </div>

                  {/* Financial Metrics Mini Bar */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-emerald-200/80 text-[11px]">
                    <div className="bg-white/90 rounded-lg p-1.5 border border-emerald-100">
                      <span className="text-[10px] text-slate-500 font-medium block">Approved Budget</span>
                      <span className="font-mono font-bold text-slate-900 text-xs">
                        {formatCurrency(selectedJob.originalApprovedCost)}
                      </span>
                    </div>
                    <div className="bg-white/90 rounded-lg p-1.5 border border-emerald-100">
                      <span className="text-[10px] text-slate-500 font-medium block">Projected Expenses</span>
                      <span
                        className={`font-mono font-bold text-xs ${
                          isOverBudget ? "text-rose-600" : "text-amber-700"
                        }`}
                      >
                        {formatCurrency(projectedJobSupplierCost)}
                      </span>
                    </div>
                    <div className="bg-white/90 rounded-lg p-1.5 border border-emerald-100">
                      <span className="text-[10px] text-slate-500 font-medium block">Remaining Budget</span>
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
                            onClick={() => {
                              setSelectedJob(j);
                              setIsJobDropdownOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-emerald-50/80 flex items-center justify-between border-b border-slate-100 last:border-b-0"
                          >
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-emerald-700 text-xs">{j.jobCode}</span>
                                <span className="font-semibold text-slate-800 text-xs">| {j.name}</span>
                              </div>
                              <span className="text-[10px] text-slate-400">
                                Client: {j.clientName} • Budget: {formatCurrency(j.originalApprovedCost)}
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

          {/* Section 1B: Optional Purchase Order Linking */}
          <div className="p-3.5 rounded-xl bg-indigo-50/50 border border-indigo-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-indigo-600 shrink-0" />
                <div>
                  <label className="font-bold text-slate-900 uppercase tracking-wider text-[11px] block">
                    Link Purchase Order (Optional)
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Link or unlink an Approved/Issued PO for the selected Supplier &amp; Job to track invoiced vs PO balance.
                  </p>
                </div>
              </div>
              {isLoadingPos && (
                <span className="inline-flex items-center gap-1 text-[11px] text-indigo-600 font-semibold">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading POs...
                </span>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={selectedPo?.id || ""}
                onChange={(e) => handleSelectPurchaseOrder(e.target.value)}
                className="flex-1 h-9 rounded-lg border border-indigo-200 bg-white px-3 text-xs text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="">
                  -- Standalone Invoice (No Purchase Order Linked — {eligiblePos.length} Eligible PO
                  {eligiblePos.length === 1 ? "" : "s"} Available) --
                </option>
                {eligiblePos.map((po) => (
                  <option key={po.id} value={po.id}>
                    {po.poNumber} • {po.supplierName} • {po.jobCode} • Remaining:{" "}
                    {formatCurrency(po.remainingUninvoiced)} / {formatCurrency(po.grandTotal)} ({po.status})
                  </option>
                ))}
              </select>

              {selectedPo && (
                <button
                  type="button"
                  onClick={handleLoadMissingPoItems}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors shrink-0 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Unlinked PO Items ({selectedPo.items.length})</span>
                </button>
              )}
            </div>

            {selectedPo && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 rounded-lg bg-white border border-indigo-200 text-[11px]">
                <div>
                  <span className="text-[10px] text-slate-400 block">Selected PO</span>
                  <span className="font-mono font-bold text-indigo-700">
                    {selectedPo.poNumber}
                  </span>
                  <span className="text-[10px] text-slate-500 ml-1">({selectedPo.status})</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">PO Grand Total</span>
                  <span className="font-mono font-bold text-slate-900">
                    {formatCurrency(selectedPo.grandTotal, { showCurrencyPrefix: true })}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Other Invoices on PO</span>
                  <span className="font-mono font-semibold text-amber-700">
                    {formatCurrency(selectedPo.invoicedTotal, { showCurrencyPrefix: true })}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Available PO Ceiling</span>
                  <span
                    className={`font-mono font-bold ${
                      isPoOverInvoiced ? "text-rose-600" : "text-emerald-700"
                    }`}
                  >
                    {formatCurrency(selectedPo.remainingUninvoiced, { showCurrencyPrefix: true })}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Invoice Metadata & Mandatory Edit Reason */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
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
                onChange={(e) => setInvoiceDate(e.target.value)}
                required
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Remarks / Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional remarks..."
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Mandatory Reason for Edit */}
            <div className="sm:col-span-3 pt-2 border-t border-slate-200">
              <label className="block font-bold text-slate-800 mb-1">
                Reason for Edit (Mandatory Financial Audit Trail) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="e.g. Corrected line item 2 amount, uploaded missing supplier delivery note..."
                required
                className="w-full px-3 py-2 rounded-lg border border-amber-300 bg-amber-50/40 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none"
              />
            </div>
          </div>

          {/* Section 3: Dynamic Supplier Invoice Rows */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div>
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                  Invoice Entries & Multi-Format Attachments
                </h4>
                <p className="text-[11px] text-slate-500">
                  Update descriptions, edit amounts, attach PDF, Word (.doc, .docx) or Images (.jpg, .png, .webp).
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

            {/* Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100/80 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <th className="py-2.5 px-3 w-10 text-center">No</th>
                    <th className="py-2.5 px-3 w-64">Description</th>
                    <th className="py-2.5 px-3">Attachments (PDF, Word, Images)</th>
                    <th className="py-2.5 px-3 w-40 text-right">Invoice Amount (Rs.)</th>
                    <th className="py-2.5 px-3 w-12 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {rows.map((row, index) => {
                    const rowNumber = index + 1;
                    return (
                      <tr key={row.id} className="hover:bg-slate-50/60 transition-colors align-top">
                        {/* No */}
                        <td className="py-3 px-3 text-center font-mono font-bold text-slate-500 text-xs">
                          {rowNumber}
                        </td>

                        {/* Description & Optional PO Item Link */}
                        <td className="py-3 px-3 space-y-1.5">
                          <input
                            type="text"
                            value={row.description}
                            onChange={(e) => handleRowChange(row.id, "description", e.target.value)}
                            placeholder={`Description for item #${rowNumber}`}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                            required
                          />
                          {selectedPo && (
                            <div className="flex items-center gap-1.5">
                              <select
                                value={row.purchaseOrderItemId || ""}
                                onChange={(e) => handleLinkRowPoItem(row.id, e.target.value)}
                                className="flex-1 h-7 rounded border border-indigo-200 bg-indigo-50/40 px-2 text-[11px] text-slate-700 outline-none"
                                title="Optionally link row to a specific PO line item"
                              >
                                <option value="">-- Optional: Link PO Line Item --</option>
                                {(selectedPo.items || []).map((it) => (
                                  <option key={it.id} value={it.id}>
                                    #{it.rowNumber} {it.particular} (Rem Qty: {it.remainingQuantity}{" "}
                                    {it.measure} • Rem: {formatCurrency(it.remainingAmount)})
                                  </option>
                                ))}
                              </select>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={row.quantity || ""}
                                onChange={(e) => handleRowQuantityChange(row.id, e.target.value)}
                                placeholder="Qty"
                                className="w-20 h-7 rounded border border-indigo-200 bg-white px-2 text-right font-mono text-[11px] text-slate-800 outline-none"
                                title="Invoiced quantity (optional)"
                              />
                            </div>
                          )}
                        </td>

                        {/* Attachments Section */}
                        <td className="py-3 px-3 space-y-2">
                          {/* 1. Existing Attachments */}
                          {row.existingAttachments.length > 0 && (
                            <div className="space-y-1">
                              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
                                Current Attachments ({row.existingAttachments.length})
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {row.existingAttachments.map((att) => (
                                  <div
                                    key={att.id}
                                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-slate-100 border border-slate-200 text-[11px] group"
                                  >
                                    <FileText className="h-3 w-3 text-slate-600" />
                                    <span
                                      className="font-medium text-slate-700 max-w-[130px] truncate cursor-pointer hover:underline"
                                      onClick={() => handlePreviewExistingAttachment(att, row.description)}
                                      title={att.fileName}
                                    >
                                      {att.fileName}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handlePreviewExistingAttachment(att, row.description)}
                                      className="p-0.5 text-slate-400 hover:text-blue-600"
                                      title="Preview file"
                                    >
                                      <Eye className="h-3 w-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveExistingAttachment(row.id, att.id)}
                                      className="p-0.5 text-slate-400 hover:text-rose-600"
                                      title="Remove attachment"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 2. New Uploads Dropzone */}
                          <div className="flex items-center gap-2">
                            <label className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-dashed border-blue-300 bg-blue-50/50 hover:bg-blue-100/60 text-blue-700 text-[11px] font-semibold transition-colors">
                              <Upload className="h-3 w-3" />
                              <span>Upload Files</span>
                              <input
                                type="file"
                                multiple
                                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                                onChange={(e) => {
                                  if (e.target.files && e.target.files.length > 0) {
                                    handleAddNewFilesToRow(row.id, e.target.files);
                                  }
                                }}
                                className="hidden"
                              />
                            </label>
                            <span className="text-[10px] text-slate-400">PDF, Word, Images (up to 15MB)</span>
                          </div>

                          {/* 3. New Attachments Preview List */}
                          {row.newAttachments.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {row.newAttachments.map((att) => (
                                <div
                                  key={att.id}
                                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] ${
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
                                      width={16}
                                      height={16}
                                      className="h-4 w-4 object-cover rounded shrink-0"
                                    />
                                  ) : (
                                    <Paperclip className="h-3 w-3 shrink-0" />
                                  )}
                                  <span
                                    className="font-medium max-w-[120px] truncate cursor-pointer hover:underline"
                                    onClick={() => !att.error && handlePreviewNewAttachment(att, row.description)}
                                    title={att.name}
                                  >
                                    {att.name}
                                  </span>
                                  {!att.error && (
                                    <button
                                      type="button"
                                      onClick={() => handlePreviewNewAttachment(att, row.description)}
                                      className="p-0.5 text-slate-400 hover:text-emerald-700"
                                      title="Preview"
                                    >
                                      <Eye className="h-3 w-3" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveNewAttachment(row.id, att.id)}
                                    className="p-0.5 text-slate-400 hover:text-rose-600"
                                    title="Remove"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
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
                            className="w-full text-right px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-mono font-bold text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                            required
                          />
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(row.id)}
                            disabled={rows.length <= 1}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-30 disabled:hover:text-slate-400 disabled:hover:bg-transparent"
                            title={rows.length <= 1 ? "At least one row required" : "Delete row"}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200">
                    <td colSpan={3} className="py-3 px-4 font-bold text-slate-700 text-right uppercase text-[11px]">
                      Total Edited Invoice Amount:
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-extrabold text-blue-700 text-sm">
                      {formatCurrency(totalInvoiceAmount, { showCurrencyPrefix: true })}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Over-budget Warning */}
          {isOverBudget && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-800 flex items-start gap-2 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              <div>
                <span className="font-bold">Projected Cost Warning:</span> This invoice will cause total supplier
                expenses for Job <strong>{selectedJob?.jobCode}</strong> (
                {formatCurrency(projectedJobSupplierCost)}) to exceed the approved budget ceiling (
                {formatCurrency(selectedJob?.originalApprovedCost)}).
              </div>
            </div>
          )}

          {/* PO Over-Invoicing Guard */}
          {selectedPo && isPoOverInvoiced && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <span className="font-bold">PO Over-Invoicing Guard:</span> Edited invoice total (
                  <strong className="font-mono">{formatCurrency(totalInvoiceAmount)}</strong>) exceeds the
                  remaining uninvoiced balance of <strong>{selectedPo.poNumber}</strong> (
                  <strong className="font-mono">{formatCurrency(selectedPo.remainingUninvoiced)}</strong>).
                </div>
              </div>
              {canOverridePoBalance ? (
                <label className="flex items-center gap-2 pl-6 cursor-pointer select-none font-semibold text-amber-950">
                  <input
                    type="checkbox"
                    checked={poOverInvoiceOverride}
                    onChange={(e) => setPoOverInvoiceOverride(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-amber-500 text-amber-600"
                  />
                  <span>Approve Over-Invoicing Override (Admin / Authorized Override)</span>
                </label>
              ) : (
                <p className="pl-6 text-rose-700 font-semibold">
                  You do not have Budget Override permission to invoice above the PO balance.
                </p>
              )}
            </div>
          )}

          {isSubmitting && (
            <div className="p-3 rounded-xl bg-blue-50/80 border border-blue-200 space-y-2 animate-in fade-in">
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
                className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !editReason.trim() || rows.length === 0}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition-colors shadow-xs disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{uploadStageText ? uploadStageText.split(" (")[0] : "Saving & Recalculating..."}</span>
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

      {/* Preview Modal */}
      <AttachmentPreviewModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        attachment={previewAttachment}
      />
    </Modal>
  );
}
