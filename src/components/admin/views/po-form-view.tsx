"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  DollarSign,
  Eye,
  FileText,
  Layers,
  Loader2,
  Plus,
  PlusCircle,
  Save,
  Search,
  Send,
  ShieldAlert,
  Trash2,
  Upload,
  AlertTriangle,
  X,
  Paperclip,
} from "lucide-react";
import { useAdminData } from "@/context/admin-data-context";
import { Modal } from "@/components/admin/ui/modal";
import { StatusBadge } from "@/components/admin/ui/badge";
import { PoDocumentPreview } from "@/components/admin/purchase-orders/po-document-preview";
import { formatCurrency, roundFinancial, toDecimal } from "@/lib/financial";
import { computePurchaseOrderFinancials } from "@/lib/po-financial";
import {
  Department,
  JobCostItemBudgetInfo,
  PurchaseOrder,
  PurchaseOrderAttachment,
  PurchaseOrderSettings,
} from "@/types/admin";
import {
  isSupportedExtension,
  formatBytes,
  MAX_ATTACHMENT_SIZE_BYTES,
} from "@/lib/file-validation";

interface EligibleJobOption {
  id: string;
  jobCode: string;
  name: string;
  date: string;
  commencingDate?: string | null;
  clientName?: string | null;
  status: string;
  approvedJobValue: number;
  committedPoValue: number;
  activePoCount: number;
  costItemsCount: number;
}

interface SupplierOption {
  id: string;
  code: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
}

interface JobCostCategoryGroup {
  id: string;
  name: string;
  sortOrder: number;
  subtotal: number;
  items: JobCostItemBudgetInfo[];
}

interface JobCostPayload {
  job: {
    id: string;
    jobCode: string;
    name: string;
    date: string;
    clientName: string | null;
    status: string;
    approvedJobValue: number;
  };
  categories: JobCostCategoryGroup[];
  totals: {
    originalBudgetTotal: number;
    committedPoTotal: number;
    draftPoTotal: number;
    remainingBudgetTotal: number;
  };
}

interface FormDeptAlloc {
  departmentId: string;
  allocatedQuantity: string;
  allocatedAmount: string;
  notes?: string;
}

interface FormLineItem {
  localId: string;
  jobCostCategoryId: string | null;
  jobCostCategoryName: string | null;
  jobCostItemId: string | null;
  particular: string;
  brand: string;
  specifications: string;
  quantity: string;
  measure: string;
  unitCost: string;
  isAdditionalItem: boolean;
  budgetOverrideReason: string;
  notes: string;
  departmentAllocations: Record<string, FormDeptAlloc>;
}

interface StagedAttachment {
  localId: string;
  file: File;
  category: "PO_DOCUMENT" | "SUPPLIER_QUOTATION" | "OTHER";
  name: string;
  size: string;
  error?: string;
}

interface PoFormViewProps {
  mode: "create" | "edit";
  poId?: string;
  initialJobId?: string;
}

export function PoFormView({ mode, poId, initialJobId }: PoFormViewProps) {
  const router = useRouter();
  const { can, showToast, refreshJobs, refreshSuppliers, currentRole } = useAdminData();

  const canCreate = can("purchaseOrders", "create");
  const canEdit = can("purchaseOrders", "edit");
  const canSubmit = can("purchaseOrders", "submit");
  const canCreateSupplier = can("suppliers", "create");
  const canManageDeptAlloc = can("purchaseOrders", "manageDepartmentAllocation");

  // Loading & initialization state
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState("");
  const [settings, setSettings] = useState<PurchaseOrderSettings | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [existingPo, setExistingPo] = useState<PurchaseOrder | null>(null);

  // Permissions resolved by server (combined with RBAC context)
  const [canOverrideBudgetServer, setCanOverrideBudgetServer] = useState<boolean>(
    can("purchaseOrders", "overrideJobBudget")
  );
  const canOverrideBudget = can("purchaseOrders", "overrideJobBudget") || canOverrideBudgetServer;

  // Step 1: Eligible Approved+Active Jobs
  const [jobSearch, setJobSearch] = useState("");
  const [eligibleJobs, setEligibleJobs] = useState<EligibleJobOption[]>([]);
  const [isJobDropdownOpen, setIsJobDropdownOpen] = useState(false);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [selectedJob, setSelectedJob] = useState<EligibleJobOption | null>(null);

  // Step 2: Job Cost Breakdown
  const [jobCostData, setJobCostData] = useState<JobCostPayload | null>(null);
  const [isLoadingJobCosts, setIsLoadingJobCosts] = useState(false);
  const [showJobItemsPicker, setShowJobItemsPicker] = useState(true);
  const [costItemSearch, setCostItemSearch] = useState("");

  // Step 3: Suppliers
  const [supplierSearch, setSupplierSearch] = useState("");
  const [suppliersList, setSuppliersList] = useState<SupplierOption[]>([]);
  const [isSupplierDropdownOpen, setIsSupplierDropdownOpen] = useState(false);
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierOption | null>(null);

  // Quick-Create Supplier Modal
  const [isNewSupplierOpen, setIsNewSupplierOpen] = useState(false);
  const [newSupCode, setNewSupCode] = useState("");
  const [newSupName, setNewSupName] = useState("");
  const [newSupContact, setNewSupContact] = useState("");
  const [newSupPhone, setNewSupPhone] = useState("");
  const [newSupEmail, setNewSupEmail] = useState("");
  const [newSupAddress, setNewSupAddress] = useState("");
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);
  const [newSupplierError, setNewSupplierError] = useState("");

  // PO Header Fields
  const [customPoNumber, setCustomPoNumber] = useState("");
  const [useCustomPoNumber, setUseCustomPoNumber] = useState(false);
  const [poDate, setPoDate] = useState("");
  const [quotationRef, setQuotationRef] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [deliverToName, setDeliverToName] = useState("");
  const [deliverToAddress, setDeliverToAddress] = useState("");
  const [deliverToEmail, setDeliverToEmail] = useState("");
  const [comments, setComments] = useState("");
  const [terms, setTerms] = useState("");
  const [currency, setCurrency] = useState("LKR");

  // Tax & Discount Fields
  const [discountAmount, setDiscountAmount] = useState("0");
  const [applySscl, setApplySscl] = useState(true);
  const [ssclRate, setSsclRate] = useState("2.56");
  const [applyVat, setApplyVat] = useState(true);
  const [vatRate, setVatRate] = useState("18");

  // Budget override reason (global)
  const [budgetOverrideReason, setBudgetOverrideReason] = useState("");

  // Line Items
  const [items, setItems] = useState<FormLineItem[]>([]);

  // Department Allocation
  const [hasDepartmentAllocation, setHasDepartmentAllocation] = useState(false);
  const [departmentAllocationMode, setDepartmentAllocationMode] = useState<"AMOUNT" | "QUANTITY">(
    "AMOUNT"
  );

  // Attachments
  const [existingAttachments, setExistingAttachments] = useState<PurchaseOrderAttachment[]>([]);
  const [stagedAttachments, setStagedAttachments] = useState<StagedAttachment[]>([]);
  const [uploadCategory, setUploadCategory] = useState<
    "PO_DOCUMENT" | "SUPPLIER_QUOTATION" | "OTHER"
  >("SUPPLIER_QUOTATION");

  // Preview Modal & Submission
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const jobSearchTimeout = useRef<NodeJS.Timeout | null>(null);
  const supplierSearchTimeout = useRef<NodeJS.Timeout | null>(null);

  // Fetch Job cost items whenever selectedJob changes
  const loadJobCostItems = React.useCallback(
    async (jobId: string, excludePo?: string) => {
      if (!jobId) {
        setJobCostData(null);
        return;
      }
      setIsLoadingJobCosts(true);
      try {
        const qs = new URLSearchParams({ jobId });
        if (excludePo) qs.set("excludePoId", excludePo);
        const res = await fetch(`/api/purchase-orders/job-cost-items?${qs.toString()}`);
        const json = await res.json();
        if (res.ok && json.success && json.data) {
          setJobCostData(json.data);
          if (typeof json.permissions?.canOverrideBudget === "boolean") {
            setCanOverrideBudgetServer(json.permissions.canOverrideBudget);
          }
        } else {
          setJobCostData(null);
          if (json?.error) setInitError(json.error);
        }
      } catch (err) {
        console.error("loadJobCostItems error:", err);
      } finally {
        setIsLoadingJobCosts(false);
      }
    },
    []
  );

  const searchEligibleJobs = React.useCallback(async (q = "") => {
    setIsLoadingJobs(true);
    try {
      const res = await fetch(
        `/api/purchase-orders/eligible-jobs?search=${encodeURIComponent(q)}`
      );
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data)) {
        setEligibleJobs(json.data);
        return json.data as EligibleJobOption[];
      }
    } catch (err) {
      console.error("searchEligibleJobs error:", err);
    } finally {
      setIsLoadingJobs(false);
    }
    return [];
  }, []);

  const searchSuppliers = React.useCallback(async (q = "") => {
    setIsLoadingSuppliers(true);
    try {
      const res = await fetch(`/api/suppliers/search?search=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data)) {
        setSuppliersList(json.data);
        return json.data as SupplierOption[];
      }
    } catch (err) {
      console.error("searchSuppliers error:", err);
    } finally {
      setIsLoadingSuppliers(false);
    }
    return [];
  }, []);

  // Initialize form
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      setIsInitializing(true);
      setInitError("");
      try {
        const [settingsRes, jobsList, supList] = await Promise.all([
          fetch("/api/purchase-orders/settings").then((r) => r.json()),
          searchEligibleJobs(""),
          searchSuppliers(""),
        ]);

        if (cancelled) return;

        if (settingsRes?.success && settingsRes.data) {
          const s: PurchaseOrderSettings = settingsRes.data.settings;
          setSettings(s);
          const activeDepts: Department[] = (settingsRes.data.departments || []).filter(
            (d: Department) => d.isActive
          );
          setDepartments(activeDepts);

          if (mode === "create") {
            setPoDate(new Date().toISOString().split("T")[0]);
            setDeliverToName(s.defaultDeliverToName || s.companyName || "");
            setDeliverToAddress(s.defaultDeliverToAddress || s.companyAddress || "");
            setDeliverToEmail(s.defaultDeliverToEmail || s.companyEmail || "");
            setApplySscl(Boolean(s.defaultApplySscl));
            setSsclRate(String(s.defaultSsclRate ?? 2.56));
            setApplyVat(Boolean(s.defaultApplyVat));
            setVatRate(String(s.defaultVatRate ?? 18));
            setCurrency(s.defaultCurrency || "LKR");
            setComments(s.defaultComments || "");
            setTerms(s.defaultTerms || "");
          }
        }

        if (mode === "edit" && poId) {
          const poRes = await fetch(`/api/purchase-orders/${poId}`);
          const poJson = await poRes.json();
          if (!poRes.ok || !poJson.success || !poJson.data) {
            setInitError(poJson?.error || "Failed to load Purchase Order for editing.");
            return;
          }
          const po: PurchaseOrder = poJson.data;
          if (cancelled) return;
          setExistingPo(po);
          setCustomPoNumber(po.poNumber);
          setPoDate(po.poDate || new Date().toISOString().split("T")[0]);
          setQuotationRef(po.quotationRef || "");
          setExpectedDeliveryDate(po.expectedDeliveryDate || "");
          setDeliverToName(po.deliverToName || "");
          setDeliverToAddress(po.deliverToAddress || "");
          setDeliverToEmail(po.deliverToEmail || "");
          setComments(po.comments || "");
          setTerms(po.terms || "");
          setCurrency(po.currency || "LKR");
          setDiscountAmount(String(po.discountAmount ?? 0));
          setApplySscl(Boolean(po.applySscl));
          setSsclRate(String(po.ssclRate ?? 0));
          setApplyVat(Boolean(po.applyVat));
          setVatRate(String(po.vatRate ?? 0));
          setBudgetOverrideReason(po.budgetOverrideReason || "");
          setHasDepartmentAllocation(Boolean(po.hasDepartmentAllocation));
          setDepartmentAllocationMode(
            po.departmentAllocationMode === "QUANTITY" ? "QUANTITY" : "AMOUNT"
          );
          setExistingAttachments(po.attachments || []);

          // Match job
          const matchedJob =
            jobsList.find((j) => j.id === po.jobId) ||
            ({
              id: po.jobId,
              jobCode: po.jobCode || "",
              name: po.jobName || "",
              date: po.jobDate || "",
              clientName: po.clientName || "",
              status: "APPROVED",
              approvedJobValue: Number(po.jobApprovedValue || 0),
              committedPoValue: 0,
              activePoCount: 0,
              costItemsCount: 0,
            } as EligibleJobOption);
          setSelectedJob(matchedJob);
          await loadJobCostItems(po.jobId, po.id);

          // Match supplier
          const matchedSup =
            supList.find((s) => s.id === po.supplierId) ||
            ({
              id: po.supplierId,
              code: po.supplierCode || "",
              name: po.supplierName || "",
              contactPerson: po.supplierContactPerson || "",
              phone: po.supplierPhone || "",
              email: po.supplierEmail || "",
              address: po.supplierAddress || "",
            } as SupplierOption);
          setSelectedSupplier(matchedSup);

          // Populate items
          const mappedItems: FormLineItem[] = (po.items || []).map((it, idx) => {
            const allocRecord: Record<string, FormDeptAlloc> = {};
            (it.departmentAllocations || []).forEach((da) => {
              allocRecord[da.departmentId] = {
                departmentId: da.departmentId,
                allocatedQuantity: String(da.allocatedQuantity ?? 0),
                allocatedAmount: String(da.allocatedAmount ?? 0),
                notes: da.notes || "",
              };
            });
            return {
              localId: it.id || `item-${idx}`,
              jobCostCategoryId: it.jobCostCategoryId || null,
              jobCostCategoryName: it.jobCostCategoryName || null,
              jobCostItemId: it.jobCostItemId || null,
              particular: it.particular || "",
              brand: it.brand || "",
              specifications: it.specifications || "",
              quantity: String(it.quantity ?? 1),
              measure: it.measure || "Nos",
              unitCost: String(it.unitCost ?? 0),
              isAdditionalItem: Boolean(it.isAdditionalItem || !it.jobCostItemId),
              budgetOverrideReason: it.budgetOverrideReason || "",
              notes: it.notes || "",
              departmentAllocations: allocRecord,
            };
          });
          setItems(mappedItems);
        } else if (mode === "create" && initialJobId) {
          const found = jobsList.find((j) => j.id === initialJobId);
          if (found) {
            setSelectedJob(found);
            await loadJobCostItems(found.id);
          }
        }
      } catch (err: any) {
        console.error("Bootstrap PO Form error:", err);
        setInitError(err?.message || "Failed to initialize Purchase Order form.");
      } finally {
        if (!cancelled) setIsInitializing(false);
      }
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [mode, poId, initialJobId, searchEligibleJobs, searchSuppliers, loadJobCostItems]);

  // Fast map of jobCostItemId -> JobCostItemBudgetInfo
  const costItemBudgetMap = useMemo(() => {
    const map = new Map<string, JobCostItemBudgetInfo>();
    if (!jobCostData) return map;
    jobCostData.categories.forEach((cat) => {
      cat.items.forEach((it) => {
        map.set(it.id, it);
      });
    });
    return map;
  }, [jobCostData]);

  // Live financial calculations using Decimal.js
  const financials = useMemo(() => {
    return computePurchaseOrderFinancials({
      items: items.map((it) => ({
        quantity: Number(it.quantity) || 0,
        unitCost: Number(it.unitCost) || 0,
      })),
      discountAmount: Number(discountAmount) || 0,
      applySscl,
      ssclRate: Number(ssclRate) || 0,
      applyVat,
      vatRate: Number(vatRate) || 0,
    });
  }, [items, discountAmount, applySscl, ssclRate, applyVat, vatRate]);

  // Real-time budget overrun & additional item evaluation
  const budgetAnalysis = useMemo(() => {
    const hasStructuredCostItems = costItemBudgetMap.size > 0;
    const requestedByItem = new Map<string, number>();
    let hasAdditionalItem = false;

    items.forEach((it, idx) => {
      const lineTotal = financials.items[idx]?.totalAmount.toNumber() || 0;
      if (it.isAdditionalItem || !it.jobCostItemId) {
        hasAdditionalItem = true;
      } else {
        requestedByItem.set(
          it.jobCostItemId,
          (requestedByItem.get(it.jobCostItemId) || 0) + lineTotal
        );
      }
    });

    const overBudgetItems: Array<{
      costItemId: string;
      description: string;
      requested: number;
      remaining: number;
      excess: number;
    }> = [];

    if (hasStructuredCostItems) {
      requestedByItem.forEach((reqAmt, costItemId) => {
        const info = costItemBudgetMap.get(costItemId);
        if (info && reqAmt > info.remainingBudget + 0.01) {
          overBudgetItems.push({
            costItemId,
            description: info.description,
            requested: reqAmt,
            remaining: info.remainingBudget,
            excess: reqAmt - info.remainingBudget,
          });
        }
      });
    }

    const jobRemaining = jobCostData
      ? hasStructuredCostItems
        ? jobCostData.totals.remainingBudgetTotal
        : roundFinancial(
            toDecimal(jobCostData.job.approvedJobValue).minus(
              jobCostData.totals.committedPoTotal
            ),
            2
          ).toNumber()
      : selectedJob
      ? roundFinancial(selectedJob.approvedJobValue - selectedJob.committedPoValue, 2).toNumber()
      : 0;

    const poTotalNum = financials.grandTotal.toNumber();
    const exceedsJobCeiling = selectedJob ? poTotalNum > jobRemaining + 0.01 : false;

    const requiresOverride =
      overBudgetItems.length > 0 ||
      (hasStructuredCostItems && hasAdditionalItem) ||
      (!hasStructuredCostItems && exceedsJobCeiling);

    return {
      hasStructuredCostItems,
      hasAdditionalItem,
      overBudgetItems,
      exceedsJobCeiling,
      jobRemaining,
      requiresOverride,
    };
  }, [items, financials, costItemBudgetMap, jobCostData, selectedJob]);

  // Select Job Handler
  const handleSelectJob = async (job: EligibleJobOption) => {
    setSelectedJob(job);
    setIsJobDropdownOpen(false);
    setJobSearch("");
    // When switching jobs on create, clear cost-linked items from previous job
    setItems((prev) => prev.filter((it) => it.isAdditionalItem));
    await loadJobCostItems(job.id, existingPo?.id);
  };

  // Add Job Cost Item into PO Line Items
  const handleAddCostItemToPo = (costItem: JobCostItemBudgetInfo) => {
    const qty = costItem.quantity > 0 ? costItem.quantity : 1;
    // Suggest unit cost matching either original rate or adjusted to remaining budget if partially committed
    const suggestedUnitCost =
      costItem.committedPoAmount > 0 && costItem.remainingBudget > 0
        ? roundFinancial(costItem.remainingBudget / qty, 2).toNumber()
        : costItem.rate > 0
        ? costItem.rate
        : costItem.remainingBudget;

    setItems((prev) => [
      ...prev,
      {
        localId: `ci-${costItem.id}-${Date.now().toString(36)}`,
        jobCostCategoryId: costItem.categoryId || null,
        jobCostCategoryName: costItem.categoryName || null,
        jobCostItemId: costItem.id,
        particular: costItem.description,
        brand: "",
        specifications: "",
        quantity: String(qty),
        measure: "Nos",
        unitCost: String(Math.max(0, suggestedUnitCost)),
        isAdditionalItem: false,
        budgetOverrideReason: "",
        notes: "",
        departmentAllocations: {},
      },
    ]);
  };

  const handleAddAllRemainingCostItems = () => {
    if (!jobCostData) return;
    const alreadyAddedIds = new Set(items.map((it) => it.jobCostItemId).filter(Boolean));
    const additions: FormLineItem[] = [];
    jobCostData.categories.forEach((cat) => {
      cat.items.forEach((ci) => {
        if (alreadyAddedIds.has(ci.id) || ci.remainingBudget <= 0) return;
        const qty = ci.quantity > 0 ? ci.quantity : 1;
        const suggestedUnitCost =
          ci.committedPoAmount > 0
            ? roundFinancial(ci.remainingBudget / qty, 2).toNumber()
            : ci.rate > 0
            ? ci.rate
            : ci.remainingBudget;
        additions.push({
          localId: `ci-${ci.id}-${Date.now().toString(36)}-${additions.length}`,
          jobCostCategoryId: ci.categoryId || null,
          jobCostCategoryName: ci.categoryName || null,
          jobCostItemId: ci.id,
          particular: ci.description,
          brand: "",
          specifications: "",
          quantity: String(qty),
          measure: "Nos",
          unitCost: String(Math.max(0, suggestedUnitCost)),
          isAdditionalItem: false,
          budgetOverrideReason: "",
          notes: "",
          departmentAllocations: {},
        });
      });
    });
    if (additions.length === 0) {
      showToast("No Remaining Items", "All cost items with remaining budget are already added.", "info");
      return;
    }
    setItems((prev) => [...prev, ...additions]);
    showToast("Cost Items Loaded", `Added ${additions.length} job cost item(s) to Purchase Order.`, "success");
  };

  const handleAddAdditionalRow = () => {
    setItems((prev) => [
      ...prev,
      {
        localId: `add-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        jobCostCategoryId: null,
        jobCostCategoryName: "Additional Item",
        jobCostItemId: null,
        particular: "",
        brand: "",
        specifications: "",
        quantity: "1",
        measure: "Nos",
        unitCost: "0",
        isAdditionalItem: true,
        budgetOverrideReason: "",
        notes: "",
        departmentAllocations: {},
      },
    ]);
  };

  const handleUpdateItem = (localId: string, field: keyof FormLineItem, value: any) => {
    setItems((prev) =>
      prev.map((it) => (it.localId === localId ? { ...it, [field]: value } : it))
    );
  };

  const handleRemoveItem = (localId: string) => {
    setItems((prev) => prev.filter((it) => it.localId !== localId));
  };

  // Department allocation update helper
  const handleDeptAllocChange = (
    itemLocalId: string,
    deptId: string,
    valueStr: string
  ) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.localId !== itemLocalId) return it;
        const curr = it.departmentAllocations[deptId] || {
          departmentId: deptId,
          allocatedQuantity: "0",
          allocatedAmount: "0",
        };
        const numVal = Number(valueStr) || 0;
        const qty = Number(it.quantity) || 0;
        const unitCost = Number(it.unitCost) || 0;
        const lineAmt = qty * unitCost;

        const nextAlloc: FormDeptAlloc =
          departmentAllocationMode === "QUANTITY"
            ? {
                ...curr,
                allocatedQuantity: valueStr,
                allocatedAmount: roundFinancial(numVal * unitCost, 2).toFixed(2),
              }
            : {
                ...curr,
                allocatedAmount: valueStr,
                allocatedQuantity:
                  lineAmt > 0 && qty > 0
                    ? roundFinancial((numVal / lineAmt) * qty, 4).toFixed(2)
                    : "0",
              };

        return {
          ...it,
          departmentAllocations: {
            ...it.departmentAllocations,
            [deptId]: nextAlloc,
          },
        };
      })
    );
  };

  const handleEqualSplitItemDepartments = (itemLocalId: string) => {
    if (departments.length === 0) return;
    setItems((prev) =>
      prev.map((it) => {
        if (it.localId !== itemLocalId) return it;
        const qty = Number(it.quantity) || 0;
        const lineAmt = roundFinancial(qty * (Number(it.unitCost) || 0), 2).toNumber();
        const count = departments.length;
        const nextMap: Record<string, FormDeptAlloc> = {};

        departments.forEach((dept, idx) => {
          if (departmentAllocationMode === "QUANTITY") {
            const perDeptQty =
              idx === count - 1
                ? roundFinancial(qty - roundFinancial(qty / count, 2).toNumber() * (count - 1), 2).toNumber()
                : roundFinancial(qty / count, 2).toNumber();
            const perDeptAmt =
              lineAmt > 0 && qty > 0
                ? roundFinancial((perDeptQty / qty) * lineAmt, 2).toNumber()
                : 0;
            nextMap[dept.id] = {
              departmentId: dept.id,
              allocatedQuantity: String(perDeptQty),
              allocatedAmount: String(perDeptAmt),
            };
          } else {
            const perDeptAmt =
              idx === count - 1
                ? roundFinancial(
                    lineAmt - roundFinancial(lineAmt / count, 2).toNumber() * (count - 1),
                    2
                  ).toNumber()
                : roundFinancial(lineAmt / count, 2).toNumber();
            const perDeptQty =
              lineAmt > 0 && qty > 0
                ? roundFinancial((perDeptAmt / lineAmt) * qty, 2).toNumber()
                : 0;
            nextMap[dept.id] = {
              departmentId: dept.id,
              allocatedAmount: String(perDeptAmt),
              allocatedQuantity: String(perDeptQty),
            };
          }
        });

        return { ...it, departmentAllocations: nextMap };
      })
    );
  };

  // Attachments handling
  const handleSelectFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const additions: StagedAttachment[] = [];
    Array.from(fileList).forEach((file) => {
      let error: string | undefined;
      if (!isSupportedExtension(file.name)) {
        error = "Unsupported format. Allowed: PDF, Word (.doc/.docx), Images.";
      } else if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        error = `Exceeds 15MB limit (${formatBytes(file.size)}).`;
      }
      additions.push({
        localId: `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        file,
        category: uploadCategory,
        name: file.name,
        size: formatBytes(file.size),
        error,
      });
    });
    setStagedAttachments((prev) => [...prev, ...additions]);
  };

  // Quick-Create Supplier submit
  const handleCreateSupplierQuick = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewSupplierError("");
    setIsSavingSupplier(true);
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newSupCode.trim().toUpperCase(),
          name: newSupName.trim(),
          contactPerson: newSupContact.trim(),
          phone: newSupPhone.trim(),
          email: newSupEmail.trim(),
          address: newSupAddress.trim(),
          isActive: true,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        const issueMsg = json.issues
          ? Object.values(json.issues).flat().join(" ")
          : "";
        throw new Error(issueMsg || json.error || "Failed to create supplier.");
      }
      const created: SupplierOption = json.data;
      setSelectedSupplier(created);
      setSuppliersList((prev) => [created, ...prev]);
      setIsNewSupplierOpen(false);
      setNewSupCode("");
      setNewSupName("");
      setNewSupContact("");
      setNewSupPhone("");
      setNewSupEmail("");
      setNewSupAddress("");
      refreshSuppliers?.();
      showToast("Supplier Created", `${created.name} (${created.code}) created and selected.`, "success");
    } catch (err: any) {
      setNewSupplierError(err.message || "Failed to create supplier.");
    } finally {
      setIsSavingSupplier(false);
    }
  };

  // Build PO Preview Object
  const previewPoObject = useMemo(() => {
    return {
      id: existingPo?.id,
      poNumber:
        existingPo?.poNumber ||
        (useCustomPoNumber && customPoNumber.trim()
          ? customPoNumber.trim()
          : settings?.nextPoNumberPreview || "AUTO"),
      poDate,
      quotationRef: quotationRef || null,
      expectedDeliveryDate: expectedDeliveryDate || null,
      status: existingPo?.status || "DRAFT",
      approvalStatus: existingPo?.approvalStatus || "DRAFT",
      jobCode: selectedJob?.jobCode || existingPo?.jobCode || "—",
      jobName: selectedJob?.name || existingPo?.jobName || "—",
      clientName: selectedJob?.clientName || existingPo?.clientName || "—",
      supplierName: selectedSupplier?.name || "—",
      supplierAddress: selectedSupplier?.address || "—",
      supplierContactPerson: selectedSupplier?.contactPerson || "—",
      supplierPhone: selectedSupplier?.phone || "—",
      supplierEmail: selectedSupplier?.email || "—",
      deliverToName,
      deliverToAddress,
      deliverToEmail,
      comments,
      terms,
      currency,
      subTotal: financials.subTotal.toNumber(),
      discountAmount: financials.discountAmount.toNumber(),
      totalAfterDiscount: financials.totalAfterDiscount.toNumber(),
      applySscl,
      ssclRate: Number(ssclRate) || 0,
      ssclAmount: financials.ssclAmount.toNumber(),
      totalWithSscl: financials.totalWithSscl.toNumber(),
      applyVat,
      vatRate: Number(vatRate) || 0,
      vatAmount: financials.vatAmount.toNumber(),
      grandTotal: financials.grandTotal.toNumber(),
      hasDepartmentAllocation,
      departmentAllocationMode,
      items: items.map((it, idx) => ({
        id: it.localId,
        rowNumber: idx + 1,
        particular: it.particular || "Item",
        brand: it.brand || null,
        specifications: it.specifications || null,
        jobCostCategoryName: it.jobCostCategoryName || null,
        quantity: Number(it.quantity) || 0,
        measure: it.measure || "Nos",
        unitCost: Number(it.unitCost) || 0,
        totalAmount: financials.items[idx]?.totalAmount.toNumber() || 0,
        isAdditionalItem: it.isAdditionalItem || !it.jobCostItemId,
        departmentAllocations: Object.values(it.departmentAllocations).map((a) => ({
          id: `${it.localId}-${a.departmentId}`,
          purchaseOrderId: existingPo?.id || "",
          purchaseOrderItemId: it.localId,
          departmentId: a.departmentId,
          departmentName:
            departments.find((d) => d.id === a.departmentId)?.name || "Department",
          allocatedQuantity: Number(a.allocatedQuantity) || 0,
          allocatedAmount: Number(a.allocatedAmount) || 0,
          percentage: 0,
        })),
      })),
    };
  }, [
    existingPo,
    useCustomPoNumber,
    customPoNumber,
    settings,
    poDate,
    quotationRef,
    expectedDeliveryDate,
    selectedJob,
    selectedSupplier,
    deliverToName,
    deliverToAddress,
    deliverToEmail,
    comments,
    terms,
    currency,
    financials,
    applySscl,
    ssclRate,
    applyVat,
    vatRate,
    hasDepartmentAllocation,
    departmentAllocationMode,
    items,
    departments,
  ]);

  // Submit handler (DRAFT or SUBMIT)
  const handleSave = async (submitAction: "DRAFT" | "SUBMIT") => {
    setSubmitError("");

    if (!selectedJob) {
      setSubmitError("Please select an active, APPROVED Job.");
      return;
    }
    if (!selectedSupplier) {
      setSubmitError("Please select or create a Supplier.");
      return;
    }
    if (!poDate) {
      setSubmitError("PO Date is required.");
      return;
    }
    if (!deliverToName.trim() || !deliverToAddress.trim()) {
      setSubmitError("Deliver To Name and Deliver To Address are required.");
      return;
    }
    if (items.length === 0) {
      setSubmitError("Add at least one Purchase Order line item.");
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.particular.trim()) {
        setSubmitError(`Row ${i + 1}: Particular / Item description is required.`);
        return;
      }
      if ((Number(it.quantity) || 0) <= 0) {
        setSubmitError(`Row ${i + 1} ("${it.particular}"): Quantity must be greater than 0.`);
        return;
      }
      if (!it.measure.trim()) {
        setSubmitError(`Row ${i + 1} ("${it.particular}"): Measure unit is required.`);
        return;
      }
    }

    if (budgetAnalysis.requiresOverride) {
      if (!canOverrideBudget) {
        setSubmitError(
          "Your role does not have 'Override Job Cost Budget' permission. Reduce PO item quantities/costs within remaining Job budget or remove unbudgeted additional items."
        );
        return;
      }
      const anyReasonProvided =
        budgetOverrideReason.trim().length > 0 ||
        items.some((it) => it.budgetOverrideReason.trim().length > 0);
      if (!anyReasonProvided) {
        setSubmitError(
          "Budget override justification reason is required when exceeding Job item budget or adding unplanned additional items."
        );
        return;
      }
    }

    const badAttachment = stagedAttachments.find((a) => a.error);
    if (badAttachment) {
      setSubmitError(`Fix or remove invalid attachment "${badAttachment.name}": ${badAttachment.error}`);
      return;
    }

    const payload = {
      jobId: selectedJob.id,
      supplierId: selectedSupplier.id,
      poNumber: mode === "create" && useCustomPoNumber ? customPoNumber.trim() || null : undefined,
      poDate,
      quotationRef: quotationRef.trim() || null,
      expectedDeliveryDate: expectedDeliveryDate || null,
      deliverToName: deliverToName.trim(),
      deliverToAddress: deliverToAddress.trim(),
      deliverToEmail: deliverToEmail.trim() || null,
      comments: comments.trim() || null,
      terms: terms.trim() || null,
      discountAmount: Number(discountAmount) || 0,
      applySscl,
      ssclRate: Number(ssclRate) || 0,
      applyVat,
      vatRate: Number(vatRate) || 0,
      currency: currency.trim() || "LKR",
      hasDepartmentAllocation: canManageDeptAlloc && hasDepartmentAllocation,
      departmentAllocationMode,
      budgetOverrideReason: budgetOverrideReason.trim() || null,
      submitAction,
      items: items.map((it) => ({
        jobCostCategoryId: it.jobCostCategoryId || null,
        jobCostCategoryName: it.jobCostCategoryName || null,
        jobCostItemId: it.isAdditionalItem ? null : it.jobCostItemId || null,
        particular: it.particular.trim(),
        brand: it.brand.trim() || null,
        specifications: it.specifications.trim() || null,
        quantity: Number(it.quantity) || 0,
        measure: it.measure.trim() || "Nos",
        unitCost: Number(it.unitCost) || 0,
        isAdditionalItem: Boolean(it.isAdditionalItem || !it.jobCostItemId),
        budgetOverrideReason: it.budgetOverrideReason.trim() || null,
        notes: it.notes.trim() || null,
        departmentAllocations:
          canManageDeptAlloc && hasDepartmentAllocation
            ? Object.values(it.departmentAllocations)
                .filter((a) => Number(a.allocatedAmount) > 0 || Number(a.allocatedQuantity) > 0)
                .map((a) => ({
                  departmentId: a.departmentId,
                  allocatedQuantity: Number(a.allocatedQuantity) || 0,
                  allocatedAmount: Number(a.allocatedAmount) || 0,
                  notes: a.notes || null,
                }))
            : [],
      })),
    };

    setIsSubmitting(true);
    try {
      if (mode === "create") {
        let res: Response;
        if (stagedAttachments.length > 0) {
          const fd = new FormData();
          fd.append("payload", JSON.stringify(payload));
          stagedAttachments.forEach((att) => {
            fd.append("files", att.file);
            fd.append("fileCategories", att.category);
          });
          res = await fetch("/api/purchase-orders", {
            method: "POST",
            body: fd,
          });
        } else {
          res = await fetch("/api/purchase-orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        }
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Failed to create Purchase Order.");
        }
        refreshJobs?.();
        showToast(
          submitAction === "SUBMIT" ? "PO Submitted for Approval" : "PO Saved as Draft",
          json.message || `Purchase Order ${json.data.poNumber} saved.`,
          "success"
        );
        router.push(`/admin/purchase-orders/${json.data.id}`);
      } else if (mode === "edit" && poId) {
        const res = await fetch(`/api/purchase-orders/${poId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Failed to update Purchase Order.");
        }

        // Upload any newly staged attachments on Edit
        if (stagedAttachments.length > 0) {
          const groupedByCat = new Map<string, File[]>();
          stagedAttachments.forEach((a) => {
            const arr = groupedByCat.get(a.category) || [];
            arr.push(a.file);
            groupedByCat.set(a.category, arr);
          });
          for (const [cat, files] of groupedByCat.entries()) {
            const fd = new FormData();
            fd.append("category", cat);
            files.forEach((f) => fd.append("files", f));
            const upRes = await fetch(`/api/purchase-orders/${poId}/attachments`, {
              method: "POST",
              body: fd,
            });
            if (!upRes.ok) {
              const upJson = await upRes.json().catch(() => ({}));
              showToast(
                "PO Saved with Attachment Warning",
                upJson?.error || "PO updated, but one or more files failed to upload.",
                "error"
              );
            }
          }
        }

        refreshJobs?.();
        showToast(
          submitAction === "SUBMIT" ? "PO Updated & Submitted" : "Purchase Order Updated",
          json.message || "Purchase Order saved.",
          "success"
        );
        router.push(`/admin/purchase-orders/${poId}`);
      }
    } catch (err: any) {
      setSubmitError(err?.message || "Failed to save Purchase Order.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (mode === "create" && !canCreate) {
    return (
      <div className="flex flex-col items-center justify-center p-10 bg-white rounded-2xl border border-slate-200 text-center max-w-lg mx-auto mt-8 shadow-xs">
        <div className="h-14 w-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-500 mt-2">
          You do not have permission to create Purchase Orders ({currentRole}).
        </p>
        <Link
          href="/admin/purchase-orders/list"
          className="mt-5 px-4 py-2 rounded-lg bg-[#2563EB] text-white text-xs font-semibold hover:bg-[#1d4ed8]"
        >
          Back to Purchase Orders
        </Link>
      </div>
    );
  }

  if (mode === "edit" && !canEdit) {
    return (
      <div className="flex flex-col items-center justify-center p-10 bg-white rounded-2xl border border-slate-200 text-center max-w-lg mx-auto mt-8 shadow-xs">
        <div className="h-14 w-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Edit Permission Required</h2>
        <p className="text-xs text-slate-500 mt-2">
          You do not have permission to edit Purchase Orders.
        </p>
        <Link
          href={poId ? `/admin/purchase-orders/${poId}` : "/admin/purchase-orders/list"}
          className="mt-5 px-4 py-2 rounded-lg bg-[#2563EB] text-white text-xs font-semibold hover:bg-[#1d4ed8]"
        >
          View Purchase Order
        </Link>
      </div>
    );
  }

  if (isInitializing) {
    return (
      <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-xs font-semibold">
          {mode === "edit"
            ? "Loading Purchase Order, Job cost items & settings..."
            : "Loading approved Jobs, Suppliers & PO defaults..."}
        </p>
      </div>
    );
  }

  if (initError && mode === "edit" && !existingPo) {
    return (
      <div className="max-w-lg mx-auto mt-8 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center space-y-3">
        <AlertTriangle className="h-8 w-8 text-rose-600 mx-auto" />
        <h3 className="text-base font-bold text-rose-900">Unable to Edit Purchase Order</h3>
        <p className="text-xs text-rose-700">{initError}</p>
        <Link
          href="/admin/purchase-orders/list"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to All Purchase Orders
        </Link>
      </div>
    );
  }

  if (mode === "edit" && existingPo && !["DRAFT", "REJECTED"].includes(existingPo.status)) {
    return (
      <div className="max-w-xl mx-auto mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center space-y-3">
        <AlertTriangle className="h-8 w-8 text-amber-600 mx-auto" />
        <h3 className="text-base font-bold text-amber-900">
          PO {existingPo.poNumber} Cannot Be Edited Directly
        </h3>
        <p className="text-xs text-amber-800">
          Only <strong>DRAFT</strong> or <strong>REJECTED</strong> Purchase Orders can be modified.
          Current status is <strong>{existingPo.status}</strong>. Return the PO to Draft from its
          details page if a revision is required.
        </p>
        <Link
          href={`/admin/purchase-orders/${existingPo.id}`}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2563EB] text-white text-xs font-semibold"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Return to PO Details
        </Link>
      </div>
    );
  }

  const currencyPrefix = currency === "LKR" ? "Rs. " : `${currency} `;

  return (
    <div className="space-y-5 text-xs">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <Link
            href={
              mode === "edit" && poId
                ? `/admin/purchase-orders/${poId}`
                : "/admin/purchase-orders/list"
            }
            className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
            title="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">
                {mode === "edit"
                  ? `Edit Purchase Order ${existingPo?.poNumber || ""}`
                  : "Create Purchase Order"}
              </h2>
              {existingPo && <StatusBadge status={existingPo.status} />}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Select an active approved Job, load budgeted cost items, choose a Supplier, configure taxes & optional department allocations.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setIsPreviewOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Preview PO</span>
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleSave("DRAFT")}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-blue-300 bg-blue-50 text-blue-800 font-semibold hover:bg-blue-100 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            <span>Save Draft</span>
          </button>
          {canSubmit && (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSave("SUBMIT")}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2563EB] text-white font-semibold hover:bg-[#1d4ed8] transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              <span>Submit for Approval</span>
            </button>
          )}
        </div>
      </div>

      {submitError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 flex items-start gap-2.5 text-rose-900">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold">Validation / Submission Error</p>
            <p className="text-[11px] text-rose-700 mt-0.5">{submitError}</p>
          </div>
          <button
            type="button"
            onClick={() => setSubmitError("")}
            className="text-rose-400 hover:text-rose-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* STEP 1 & SUPPLIER SELECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Step 1: Select Approved + Active Job */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
                1
              </span>
              Select Approved Active Job *
            </h3>
            {selectedJob && (
              <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                {selectedJob.status}
              </span>
            )}
          </div>

          <div className="relative">
            <div className="flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
              <Search className="h-4 w-4 text-slate-400 mr-2 shrink-0" />
              <input
                type="text"
                value={
                  isJobDropdownOpen || !selectedJob
                    ? jobSearch
                    : `${selectedJob.jobCode} — ${selectedJob.name}`
                }
                onFocus={() => setIsJobDropdownOpen(true)}
                onChange={(e) => {
                  const val = e.target.value;
                  setJobSearch(val);
                  setIsJobDropdownOpen(true);
                  if (jobSearchTimeout.current) clearTimeout(jobSearchTimeout.current);
                  jobSearchTimeout.current = setTimeout(() => {
                    searchEligibleJobs(val);
                  }, 200);
                }}
                placeholder="Search approved jobs by Job Number, Title, or Client..."
                className="w-full text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden bg-transparent"
              />
              {selectedJob && (
                <button
                  type="button"
                  onClick={() => {
                    setIsJobDropdownOpen((o) => !o);
                    setJobSearch("");
                  }}
                  className="text-slate-400 hover:text-slate-700 ml-1"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              )}
            </div>

            {isJobDropdownOpen && (
              <div className="absolute z-30 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl divide-y divide-slate-100">
                <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 text-[10px] font-bold uppercase text-slate-500">
                  <span>Eligible Approved Jobs ({eligibleJobs.length})</span>
                  <button
                    type="button"
                    onClick={() => setIsJobDropdownOpen(false)}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    Close
                  </button>
                </div>
                {isLoadingJobs ? (
                  <div className="p-4 text-center text-slate-400 flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Searching Jobs...
                  </div>
                ) : eligibleJobs.length === 0 ? (
                  <div className="p-4 text-center text-slate-400">
                    No active APPROVED Jobs match your search.
                  </div>
                ) : (
                  eligibleJobs.map((job) => (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => handleSelectJob(job)}
                      className={`w-full text-left px-3 py-2.5 hover:bg-blue-50/70 transition-colors flex items-start justify-between gap-2 ${
                        selectedJob?.id === job.id ? "bg-blue-50" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-blue-700">{job.jobCode}</span>
                          <span className="font-semibold text-slate-900 truncate">{job.name}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                          Client: {job.clientName || "—"} • Date: {job.date || "—"} • {job.costItemsCount} cost item(s)
                        </p>
                      </div>
                      <div className="text-right shrink-0 font-mono">
                        <span className="block font-bold text-slate-800">
                          {formatCurrency(job.approvedJobValue, { showCurrencyPrefix: true })}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          POs: {job.activePoCount} ({formatCurrency(job.committedPoValue)})
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {selectedJob && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div>
                <span className="text-slate-500 block">Client</span>
                <span className="font-semibold text-slate-900">{selectedJob.clientName || "—"}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Approved Value</span>
                <span className="font-mono font-bold text-slate-900">
                  {formatCurrency(selectedJob.approvedJobValue, { showCurrencyPrefix: true })}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Committed POs</span>
                <span className="font-mono font-semibold text-blue-700">
                  {formatCurrency(
                    jobCostData?.totals.committedPoTotal ?? selectedJob.committedPoValue,
                    { showCurrencyPrefix: true }
                  )}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Remaining Budget</span>
                <span
                  className={`font-mono font-bold ${
                    budgetAnalysis.jobRemaining < 0 ? "text-rose-600" : "text-emerald-700"
                  }`}
                >
                  {formatCurrency(budgetAnalysis.jobRemaining, { showCurrencyPrefix: true })}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Supplier Selection + Quick Create */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
                2
              </span>
              Select Supplier / Vendor *
            </h3>
            {canCreateSupplier && (
              <button
                type="button"
                onClick={() => setIsNewSupplierOpen(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold hover:bg-emerald-100 transition-colors cursor-pointer"
              >
                <Plus className="h-3 w-3" />
                <span>Quick-Create Supplier</span>
              </button>
            )}
          </div>

          <div className="relative">
            <div className="flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
              <Building2 className="h-4 w-4 text-slate-400 mr-2 shrink-0" />
              <input
                type="text"
                value={
                  isSupplierDropdownOpen || !selectedSupplier
                    ? supplierSearch
                    : `${selectedSupplier.name} (${selectedSupplier.code})`
                }
                onFocus={() => setIsSupplierDropdownOpen(true)}
                onChange={(e) => {
                  const val = e.target.value;
                  setSupplierSearch(val);
                  setIsSupplierDropdownOpen(true);
                  if (supplierSearchTimeout.current) clearTimeout(supplierSearchTimeout.current);
                  supplierSearchTimeout.current = setTimeout(() => {
                    searchSuppliers(val);
                  }, 200);
                }}
                placeholder="Search suppliers by Name, Code, or Contact Person..."
                className="w-full text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden bg-transparent"
              />
              {selectedSupplier && (
                <button
                  type="button"
                  onClick={() => {
                    setIsSupplierDropdownOpen((o) => !o);
                    setSupplierSearch("");
                  }}
                  className="text-slate-400 hover:text-slate-700 ml-1"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              )}
            </div>

            {isSupplierDropdownOpen && (
              <div className="absolute z-30 mt-1 w-full max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl divide-y divide-slate-100">
                <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 text-[10px] font-bold uppercase text-slate-500">
                  <span>Active Suppliers ({suppliersList.length})</span>
                  <button
                    type="button"
                    onClick={() => setIsSupplierDropdownOpen(false)}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    Close
                  </button>
                </div>
                {isLoadingSuppliers ? (
                  <div className="p-4 text-center text-slate-400 flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Searching Suppliers...
                  </div>
                ) : suppliersList.length === 0 ? (
                  <div className="p-4 text-center text-slate-400">No active suppliers found.</div>
                ) : (
                  suppliersList.map((sup) => (
                    <button
                      key={sup.id}
                      type="button"
                      onClick={() => {
                        setSelectedSupplier(sup);
                        setIsSupplierDropdownOpen(false);
                        setSupplierSearch("");
                      }}
                      className={`w-full text-left px-3 py-2 hover:bg-blue-50/70 transition-colors ${
                        selectedSupplier?.id === sup.id ? "bg-blue-50" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900">{sup.name}</span>
                        <span className="font-mono text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                          {sup.code}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {sup.contactPerson} • {sup.phone} • {sup.email}
                      </p>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {selectedSupplier && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 space-y-1 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">{selectedSupplier.name}</span>
                <span className="font-mono text-slate-600">{selectedSupplier.code}</span>
              </div>
              <p className="text-slate-600">{selectedSupplier.address}</p>
              <p className="text-slate-500">
                Contact: {selectedSupplier.contactPerson} • Tel: {selectedSupplier.phone} • Email:{" "}
                {selectedSupplier.email}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* STEP 2 EXPANDED: JOB COST ITEMS PICKER */}
      {selectedJob && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Job Cost Breakdown — Load Budgeted Items Into PO
              </h3>
              {isLoadingJobCosts && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {jobCostData && jobCostData.categories.length > 0 && (
                <>
                  <input
                    type="text"
                    value={costItemSearch}
                    onChange={(e) => setCostItemSearch(e.target.value)}
                    placeholder="Filter job cost items..."
                    className="h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-xs focus:outline-hidden focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddAllRemainingCostItems}
                    className="h-8 px-3 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 font-semibold hover:bg-blue-100 transition-colors cursor-pointer"
                  >
                    + Add All Available Items
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setShowJobItemsPicker((s) => !s)}
                className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 font-medium cursor-pointer"
              >
                {showJobItemsPicker ? "Collapse" : "Expand"}
              </button>
            </div>
          </div>

          {showJobItemsPicker && (
            <div className="p-4">
              {isLoadingJobCosts ? (
                <div className="py-6 text-center text-slate-400">
                  Loading Job cost categories and remaining PO budgets...
                </div>
              ) : !jobCostData || jobCostData.categories.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-amber-900 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold">Manual Job Without Cost Breakdown Items</p>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      Add Purchase Order line items directly below. PO total will be validated against Remaining Job Value (
                      <strong className="font-mono">
                        {formatCurrency(budgetAnalysis.jobRemaining, { showCurrencyPrefix: true })}
                      </strong>
                      ).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddAdditionalRow}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 cursor-pointer"
                  >
                    + Add Line Item
                  </button>
                </div>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {jobCostData.categories.map((cat) => {
                    const filteredCatItems = cat.items.filter((it) =>
                      !costItemSearch.trim()
                        ? true
                        : it.description.toLowerCase().includes(costItemSearch.toLowerCase()) ||
                          cat.name.toLowerCase().includes(costItemSearch.toLowerCase())
                    );
                    if (filteredCatItems.length === 0) return null;

                    return (
                      <div key={cat.id} className="rounded-lg border border-slate-200 overflow-hidden">
                        <div className="bg-slate-100/80 px-3 py-1.5 flex items-center justify-between text-[11px] font-bold text-slate-700">
                          <span>{cat.name}</span>
                          <span className="font-mono text-slate-500">
                            Category Total: {formatCurrency(cat.subtotal, { showCurrencyPrefix: true })}
                          </span>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {filteredCatItems.map((ci) => {
                            const isAlreadyInPo = items.some((row) => row.jobCostItemId === ci.id);
                            return (
                              <div
                                key={ci.id}
                                className="px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50"
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-semibold text-slate-900">
                                      {ci.description}
                                    </span>
                                    {ci.rcNrc && (
                                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                        {ci.rcNrc}
                                      </span>
                                    )}
                                    {ci.isFullyAllocated && (
                                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200">
                                        Fully Committed
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                                    <span>
                                      Orig Budget:{" "}
                                      <strong className="font-mono text-slate-700">
                                        {formatCurrency(ci.originalAmount, { showCurrencyPrefix: true })}
                                      </strong>
                                    </span>
                                    <span>
                                      Committed:{" "}
                                      <strong className="font-mono text-blue-700">
                                        {formatCurrency(ci.committedPoAmount, { showCurrencyPrefix: true })}
                                      </strong>
                                    </span>
                                    <span>
                                      Remaining:{" "}
                                      <strong
                                        className={`font-mono ${
                                          ci.remainingBudget <= 0 ? "text-rose-600" : "text-emerald-700"
                                        }`}
                                      >
                                        {formatCurrency(ci.remainingBudget, { showCurrencyPrefix: true })}
                                      </strong>
                                    </span>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleAddCostItemToPo(ci)}
                                  disabled={ci.remainingBudget <= 0 && !canOverrideBudget}
                                  className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                    isAlreadyInPo
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                                      : "bg-blue-600 text-white hover:bg-blue-700"
                                  }`}
                                >
                                  {isAlreadyInPo ? (
                                    <>
                                      <Check className="h-3.5 w-3.5" />
                                      <span>Added (Add Again)</span>
                                    </>
                                  ) : (
                                    <>
                                      <Plus className="h-3.5 w-3.5" />
                                      <span>Add to PO</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* PO HEADER & DELIVERY DETAILS */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
          Purchase Order Header & Delivery Information
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-slate-700">PO Number</label>
              {mode === "create" && (
                <label className="inline-flex items-center gap-1 text-[10px] text-blue-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useCustomPoNumber}
                    onChange={(e) => setUseCustomPoNumber(e.target.checked)}
                    className="rounded"
                  />
                  <span>Override</span>
                </label>
              )}
            </div>
            {mode === "create" && !useCustomPoNumber ? (
              <div className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 flex items-center font-mono font-bold text-blue-700">
                {settings?.nextPoNumberPreview || "Auto-generated"}
              </div>
            ) : (
              <input
                type="text"
                value={customPoNumber}
                onChange={(e) => setCustomPoNumber(e.target.value)}
                disabled={mode === "edit"}
                placeholder={settings?.nextPoNumberPreview || "e.g. PO/RTS/2026/001"}
                className="h-9 w-full rounded-lg border border-slate-300 px-3 font-mono font-bold text-slate-900 disabled:bg-slate-50"
              />
            )}
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">PO Date *</label>
            <input
              type="date"
              value={poDate}
              onChange={(e) => setPoDate(e.target.value)}
              required
              className="h-9 w-full rounded-lg border border-slate-300 px-3"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Expected Delivery Date</label>
            <input
              type="date"
              value={expectedDeliveryDate}
              onChange={(e) => setExpectedDeliveryDate(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-300 px-3"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Supplier Quotation Ref</label>
            <input
              type="text"
              value={quotationRef}
              onChange={(e) => setQuotationRef(e.target.value)}
              placeholder="e.g. QTN-2026-104"
              className="h-9 w-full rounded-lg border border-slate-300 px-3"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Currency *</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-300 px-2.5 bg-white font-mono font-semibold"
            >
              <option value="LKR">LKR (Rs.)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Deliver To Name *</label>
            <input
              type="text"
              value={deliverToName}
              onChange={(e) => setDeliverToName(e.target.value)}
              required
              className="h-9 w-full rounded-lg border border-slate-300 px-3"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Deliver To Address *</label>
            <input
              type="text"
              value={deliverToAddress}
              onChange={(e) => setDeliverToAddress(e.target.value)}
              required
              className="h-9 w-full rounded-lg border border-slate-300 px-3"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Deliver To Email</label>
            <input
              type="email"
              value={deliverToEmail}
              onChange={(e) => setDeliverToEmail(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-300 px-3"
            />
          </div>
        </div>
      </div>

      {/* PO LINE ITEMS TABLE */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-3 border-b border-slate-200">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Purchase Order Line Items ({items.length})
            </h3>
            <p className="text-[11px] text-slate-500">
              Adjust quantities, measure units, brands, specifications, and unit prices. Line totals and taxes recalculate automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddAdditionalRow}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
              budgetAnalysis.hasStructuredCostItems && !canOverrideBudget
                ? "border-slate-200 bg-slate-100 text-slate-500"
                : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
            }`}
          >
            <PlusCircle className="h-3.5 w-3.5" />
            <span>Add Unplanned / Additional Item</span>
          </button>
        </div>

        {/* Budget Alert Banner */}
        {budgetAnalysis.requiresOverride && (
          <div
            className={`mx-4 mt-3 rounded-xl border p-3.5 space-y-2 ${
              canOverrideBudget
                ? "border-amber-300 bg-amber-50 text-amber-950"
                : "border-rose-300 bg-rose-50 text-rose-950"
            }`}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle
                className={`h-4 w-4 shrink-0 mt-0.5 ${
                  canOverrideBudget ? "text-amber-600" : "text-rose-600"
                }`}
              />
              <div className="flex-1 space-y-1">
                <p className="font-bold">
                  {canOverrideBudget
                    ? "Budget Override Required — Justification Needed"
                    : "Budget Guard Blocked — Exceeds Authorized Job Budget"}
                </p>
                {budgetAnalysis.overBudgetItems.map((ob) => (
                  <p key={ob.costItemId} className="text-[11px]">
                    • <strong>{ob.description}</strong>: Requested{" "}
                    <span className="font-mono font-bold">{formatCurrency(ob.requested)}</span> vs
                    Remaining Budget{" "}
                    <span className="font-mono font-bold">{formatCurrency(ob.remaining)}</span>{" "}
                    (Excess: {formatCurrency(ob.excess)})
                  </p>
                ))}
                {budgetAnalysis.hasStructuredCostItems && budgetAnalysis.hasAdditionalItem && (
                  <p className="text-[11px]">
                    • PO contains unbudgeted additional item(s) outside the approved Job quotation.
                  </p>
                )}
                {!budgetAnalysis.hasStructuredCostItems && budgetAnalysis.exceedsJobCeiling && (
                  <p className="text-[11px]">
                    • PO Grand Total ({formatCurrency(financials.grandTotal.toNumber())}) exceeds
                    Remaining Job Value ({formatCurrency(budgetAnalysis.jobRemaining)}).
                  </p>
                )}
              </div>
            </div>

            {canOverrideBudget ? (
              <div>
                <label className="block text-[11px] font-bold mb-1">
                  Budget Override Justification Reason *
                </label>
                <input
                  type="text"
                  value={budgetOverrideReason}
                  onChange={(e) => setBudgetOverrideReason(e.target.value)}
                  placeholder="Explain why additional cost or budget overrun is authorized..."
                  className="h-9 w-full rounded-lg border border-amber-300 bg-white px-3 text-xs text-slate-900"
                />
              </div>
            ) : (
              <p className="text-[11px] font-semibold">
                Your user profile lacks the &ldquo;Override Job Cost Budget&rdquo; permission. Please
                stay within budgeted line amounts or ask a Supervisor/Admin.
              </p>
            )}
          </div>
        )}

        <div className="overflow-x-auto p-4">
          {items.length === 0 ? (
            <div className="py-8 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400">
              <p className="font-semibold text-slate-600">No PO Line Items Added</p>
              <p className="text-[11px] mt-1">
                Select cost items from the Job Cost Breakdown above or add a line item manually.
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-[10px] uppercase tracking-wider border-b border-slate-200">
                  <th className="py-2 px-2 w-8 text-center">#</th>
                  <th className="py-2 px-2 min-w-[180px]">Particular *</th>
                  <th className="py-2 px-2 w-28">Brand</th>
                  <th className="py-2 px-2 min-w-[140px]">Specifications</th>
                  <th className="py-2 px-2 w-24 text-right">Qty *</th>
                  <th className="py-2 px-2 w-24">Measure *</th>
                  <th className="py-2 px-2 w-32 text-right">Unit Cost ({currency}) *</th>
                  <th className="py-2 px-2 w-32 text-right">Total ({currency})</th>
                  <th className="py-2 px-2 w-10 text-center">Del</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, idx) => {
                  const lineTotal = financials.items[idx]?.totalAmount.toNumber() || 0;
                  const linkedBudget = item.jobCostItemId
                    ? costItemBudgetMap.get(item.jobCostItemId)
                    : undefined;
                  const itemOver = linkedBudget
                    ? lineTotal > linkedBudget.remainingBudget + 0.01
                    : false;

                  return (
                    <tr key={item.localId} className="align-top hover:bg-slate-50/60">
                      <td className="py-2 px-2 text-center font-mono text-slate-400 pt-3">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-2 space-y-1">
                        <input
                          type="text"
                          value={item.particular}
                          onChange={(e) => handleUpdateItem(item.localId, "particular", e.target.value)}
                          placeholder="Item description"
                          className="h-8 w-full rounded border border-slate-300 px-2 text-xs font-medium"
                        />
                        <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                          {item.jobCostCategoryName && (
                            <span className="px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200">
                              {item.jobCostCategoryName}
                            </span>
                          )}
                          {item.isAdditionalItem && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200 font-semibold">
                              Additional
                            </span>
                          )}
                          {linkedBudget && (
                            <span
                              className={`font-mono ${
                                itemOver ? "text-rose-600 font-bold" : "text-slate-500"
                              }`}
                            >
                              Rem Budget: {formatCurrency(linkedBudget.remainingBudget)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={item.brand}
                          onChange={(e) => handleUpdateItem(item.localId, "brand", e.target.value)}
                          placeholder="Optional"
                          className="h-8 w-full rounded border border-slate-300 px-2 text-xs"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={item.specifications}
                          onChange={(e) =>
                            handleUpdateItem(item.localId, "specifications", e.target.value)
                          }
                          placeholder="Dimensions / specs"
                          className="h-8 w-full rounded border border-slate-300 px-2 text-xs"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={item.quantity}
                          onChange={(e) => handleUpdateItem(item.localId, "quantity", e.target.value)}
                          className="h-8 w-full rounded border border-slate-300 px-2 text-xs text-right font-mono"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={item.measure}
                          onChange={(e) => handleUpdateItem(item.localId, "measure", e.target.value)}
                          placeholder="Nos / Kg"
                          className="h-8 w-full rounded border border-slate-300 px-2 text-xs"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.unitCost}
                          onChange={(e) => handleUpdateItem(item.localId, "unitCost", e.target.value)}
                          className="h-8 w-full rounded border border-slate-300 px-2 text-xs text-right font-mono"
                        />
                      </td>
                      <td
                        className={`py-2 px-2 text-right font-mono font-bold pt-3 ${
                          itemOver ? "text-rose-600" : "text-slate-900"
                        }`}
                      >
                        {formatCurrency(lineTotal)}
                      </td>
                      <td className="py-2 px-2 text-center pt-2.5">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.localId)}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                          title="Remove line"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* OPTIONAL DEPARTMENT ALLOCATION (SHEET 2) */}
      {canManageDeptAlloc && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex items-center gap-2 font-bold text-sm text-slate-900 cursor-pointer">
              <input
                type="checkbox"
                checked={hasDepartmentAllocation}
                onChange={(e) => setHasDepartmentAllocation(e.target.checked)}
                className="rounded border-slate-300 text-blue-600"
              />
              <Layers className="h-4 w-4 text-indigo-600" />
              <span>Enable Department Cost Allocation (Sheet 2)</span>
            </label>

            {hasDepartmentAllocation && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500">Allocation Mode:</span>
                <select
                  value={departmentAllocationMode}
                  onChange={(e) =>
                    setDepartmentAllocationMode(
                      e.target.value === "QUANTITY" ? "QUANTITY" : "AMOUNT"
                    )
                  }
                  className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold"
                >
                  <option value="AMOUNT">By Amount ({currency})</option>
                  <option value="QUANTITY">By Quantity</option>
                </select>
              </div>
            )}
          </div>

          {hasDepartmentAllocation && (
            <>
              {departments.length === 0 ? (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  No active departments configured. Administrators can add departments under PO Reports → Settings.
                </p>
              ) : items.length === 0 ? (
                <p className="text-xs text-slate-400">
                  Add PO line items above to allocate costs/quantities across departments.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-indigo-50 text-indigo-950 text-[10px] uppercase tracking-wider border-b border-indigo-200">
                        <th className="py-2 px-2.5 min-w-[160px]">Item Particular</th>
                        <th className="py-2 px-2.5 text-right w-24">
                          {departmentAllocationMode === "QUANTITY" ? "Qty" : `Total`}
                        </th>
                        {departments.map((dept) => (
                          <th key={dept.id} className="py-2 px-2.5 text-right min-w-[110px]">
                            {dept.name}
                          </th>
                        ))}
                        <th className="py-2 px-2.5 text-center w-24">Quick Split</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((item, idx) => {
                        const targetVal =
                          departmentAllocationMode === "QUANTITY"
                            ? Number(item.quantity) || 0
                            : financials.items[idx]?.totalAmount.toNumber() || 0;
                        const allocatedSum = departments.reduce((sum, d) => {
                          const entry = item.departmentAllocations[d.id];
                          return (
                            sum +
                            (departmentAllocationMode === "QUANTITY"
                              ? Number(entry?.allocatedQuantity || 0)
                              : Number(entry?.allocatedAmount || 0))
                          );
                        }, 0);

                        return (
                          <tr key={item.localId} className="hover:bg-slate-50">
                            <td className="py-2 px-2.5 font-medium text-slate-800">
                              {item.particular || `Row ${idx + 1}`}
                            </td>
                            <td className="py-2 px-2.5 text-right font-mono">
                              <div>{formatCurrency(targetVal)}</div>
                              {allocatedSum > 0 && Math.abs(allocatedSum - targetVal) > 0.05 && (
                                <span className="text-[10px] text-amber-600">
                                  Alloc: {formatCurrency(allocatedSum)}
                                </span>
                              )}
                            </td>
                            {departments.map((dept) => {
                              const entry = item.departmentAllocations[dept.id];
                              const val =
                                departmentAllocationMode === "QUANTITY"
                                  ? entry?.allocatedQuantity ?? ""
                                  : entry?.allocatedAmount ?? "";
                              return (
                                <td key={dept.id} className="py-1.5 px-2">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={val}
                                    onChange={(e) =>
                                      handleDeptAllocChange(item.localId, dept.id, e.target.value)
                                    }
                                    placeholder="0"
                                    className="h-7 w-full rounded border border-slate-300 px-1.5 text-right font-mono text-[11px]"
                                  />
                                </td>
                              );
                            })}
                            <td className="py-1.5 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleEqualSplitItemDepartments(item.localId)}
                                className="px-2 py-1 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-semibold hover:bg-indigo-100 cursor-pointer"
                              >
                                Equal Split
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* FINANCIALS, COMMENTS, TERMS & ATTACHMENTS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Comments, Terms & Attachments */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Comments & Commercial Terms</h3>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Comments / Special Instructions
              </label>
              <textarea
                rows={2}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Delivery instructions or order remarks..."
                className="w-full rounded-lg border border-slate-300 p-2.5 text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Terms & Conditions</label>
              <textarea
                rows={3}
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                placeholder="Payment terms, warranty, delivery SLA..."
                className="w-full rounded-lg border border-slate-300 p-2.5 text-xs"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Paperclip className="h-4 w-4 text-slate-500" />
                Supporting Documents (Quotes, Signed POs)
              </h3>
              <select
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value as any)}
                className="h-8 rounded-lg border border-slate-300 px-2 text-xs bg-white"
              >
                <option value="SUPPLIER_QUOTATION">Supplier Quotation</option>
                <option value="PO_DOCUMENT">Signed PO Document</option>
                <option value="OTHER">Other Supporting File</option>
              </select>
            </div>

            <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/70 p-4 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors">
              <Upload className="h-5 w-5 text-blue-600 mb-1" />
              <span className="font-semibold text-slate-700">
                Click to attach PDF, Word, or Images (max 15MB each)
              </span>
              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                onChange={(e) => {
                  handleSelectFiles(e.target.files);
                  e.target.value = "";
                }}
                className="hidden"
              />
            </label>

            {existingAttachments.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] font-bold text-slate-500 uppercase">Saved Attachments</p>
                {existingAttachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5"
                  >
                    <span className="truncate font-medium text-slate-700">
                      {att.fileName} ({att.category})
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">{att.fileSize}</span>
                  </div>
                ))}
              </div>
            )}

            {stagedAttachments.length > 0 && (
              <div className="space-y-1.5">
                {stagedAttachments.map((att) => (
                  <div
                    key={att.localId}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                      att.error
                        ? "border-rose-300 bg-rose-50 text-rose-800"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{att.name}</p>
                      <p className="text-[10px] text-slate-500">
                        {att.category} • {att.size} {att.error ? `• ${att.error}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setStagedAttachments((prev) =>
                          prev.filter((a) => a.localId !== att.localId)
                        )
                      }
                      className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Tax & Totals Calculator */}
        <div className="lg:col-span-5">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              Two-Stage Tax & Financial Summary
            </h3>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-600">Sub-Total</span>
                <span className="font-mono font-bold text-slate-900">
                  {formatCurrency(financials.subTotal.toNumber(), {
                    showCurrencyPrefix: true,
                    currencySymbol: currencyPrefix,
                  })}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 py-1">
                <label className="text-slate-600">Discount ({currency})</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                  className="h-8 w-36 rounded-lg border border-slate-300 px-2.5 text-right font-mono font-semibold"
                />
              </div>

              <div className="flex items-center justify-between py-1.5 border-t border-slate-100 bg-slate-50 px-2 rounded">
                <span className="font-semibold text-slate-700">Total After Discount</span>
                <span className="font-mono font-bold text-slate-900">
                  {formatCurrency(financials.totalAfterDiscount.toNumber(), {
                    showCurrencyPrefix: true,
                    currencySymbol: currencyPrefix,
                  })}
                </span>
              </div>

              {/* SSCL Stage 1 */}
              <div className="rounded-lg border border-slate-200 p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={applySscl}
                      onChange={(e) => setApplySscl(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    <span>Apply SSCL (%)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      disabled={!applySscl}
                      value={ssclRate}
                      onChange={(e) => setSsclRate(e.target.value)}
                      className="h-7 w-20 rounded border border-slate-300 px-2 text-right font-mono disabled:bg-slate-100"
                    />
                    <span className="font-mono font-semibold text-slate-800 w-28 text-right">
                      {formatCurrency(financials.ssclAmount.toNumber(), {
                        showCurrencyPrefix: true,
                        currencySymbol: currencyPrefix,
                      })}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1 border-t border-slate-100">
                  <span>Total With SSCL (VAT Base)</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {formatCurrency(financials.totalWithSscl.toNumber(), {
                      showCurrencyPrefix: true,
                      currencySymbol: currencyPrefix,
                    })}
                  </span>
                </div>
              </div>

              {/* VAT Stage 2 */}
              <div className="rounded-lg border border-slate-200 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={applyVat}
                      onChange={(e) => setApplyVat(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    <span>Apply VAT (%)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      disabled={!applyVat}
                      value={vatRate}
                      onChange={(e) => setVatRate(e.target.value)}
                      className="h-7 w-20 rounded border border-slate-300 px-2 text-right font-mono disabled:bg-slate-100"
                    />
                    <span className="font-mono font-semibold text-slate-800 w-28 text-right">
                      {formatCurrency(financials.vatAmount.toNumber(), {
                        showCurrencyPrefix: true,
                        currencySymbol: currencyPrefix,
                      })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Grand Total */}
              <div className="rounded-xl bg-blue-600 text-white p-3.5 flex items-center justify-between shadow-sm">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-blue-100 block">
                    PO Grand Total ({currency})
                  </span>
                  <span className="text-xs text-blue-100">
                    {items.length} line item(s)
                  </span>
                </div>
                <span className="text-xl font-extrabold font-mono">
                  {formatCurrency(financials.grandTotal.toNumber(), {
                    showCurrencyPrefix: true,
                    currencySymbol: currencyPrefix,
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PO DOCUMENT PREVIEW MODAL */}
      <Modal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        title={`Purchase Order Document Preview`}
        maxWidth="4xl"
      >
        <PoDocumentPreview
          po={previewPoObject}
          settings={settings}
          departments={departments}
          canPrint={can("purchaseOrders", "print")}
          canDownloadExcel={false}
        />
      </Modal>

      {/* QUICK-CREATE SUPPLIER MODAL */}
      <Modal
        isOpen={isNewSupplierOpen}
        onClose={() => setIsNewSupplierOpen(false)}
        title="Quick-Create Supplier"
        maxWidth="md"
      >
        <form onSubmit={handleCreateSupplierQuick} className="space-y-3 text-xs">
          {newSupplierError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-rose-800 text-[11px]">
              {newSupplierError}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Supplier Code *</label>
              <input
                type="text"
                required
                value={newSupCode}
                onChange={(e) => setNewSupCode(e.target.value.toUpperCase())}
                placeholder="e.g. SUP-VS-01"
                className="h-8 w-full rounded-lg border border-slate-300 px-2.5 font-mono uppercase"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Contact Person *</label>
              <input
                type="text"
                required
                value={newSupContact}
                onChange={(e) => setNewSupContact(e.target.value)}
                placeholder="Full name"
                className="h-8 w-full rounded-lg border border-slate-300 px-2.5"
              />
            </div>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Supplier Company Name *</label>
            <input
              type="text"
              required
              value={newSupName}
              onChange={(e) => setNewSupName(e.target.value)}
              placeholder="e.g. V S Stationery"
              className="h-8 w-full rounded-lg border border-slate-300 px-2.5"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Phone *</label>
              <input
                type="text"
                required
                value={newSupPhone}
                onChange={(e) => setNewSupPhone(e.target.value)}
                placeholder="0112345678"
                className="h-8 w-full rounded-lg border border-slate-300 px-2.5"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Email *</label>
              <input
                type="email"
                required
                value={newSupEmail}
                onChange={(e) => setNewSupEmail(e.target.value)}
                placeholder="orders@supplier.lk"
                className="h-8 w-full rounded-lg border border-slate-300 px-2.5"
              />
            </div>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Address *</label>
            <input
              type="text"
              required
              value={newSupAddress}
              onChange={(e) => setNewSupAddress(e.target.value)}
              placeholder="Complete street & city address"
              className="h-8 w-full rounded-lg border border-slate-300 px-2.5"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsNewSupplierOpen(false)}
              className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingSupplier}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#2563EB] text-white font-semibold hover:bg-[#1d4ed8] disabled:opacity-50"
            >
              {isSavingSupplier && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>Save & Select Supplier</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
