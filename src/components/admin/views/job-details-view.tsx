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
  Layers,
  Printer,
  Building,
  User,
  Clock,
  ShieldAlert,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  FileArchive,
  ExternalLink,
  ShoppingCart,
} from "lucide-react";
import { useAdminData } from "@/context/admin-data-context";
import { StatusBadge } from "@/components/admin/ui/badge";
import { Modal } from "@/components/admin/ui/modal";
import { BulkInvoiceUploadModal } from "@/components/admin/modals/bulk-invoice-upload-modal";
import { EditJobCostsModal } from "@/components/admin/modals/edit-job-costs-modal";
import { CreateSupplierInvoiceModal } from "@/components/admin/modals/create-supplier-invoice-modal";
import { ViewSupplierInvoiceModal } from "@/components/admin/modals/view-supplier-invoice-modal";
import { Invoice, InvoiceStatus, Job, JobCostCategory, JobCostItem, JobCostSummary, SupplierInvoice } from "@/types/admin";
import { downloadProcessedQuotationExcel } from "@/lib/excel-generator";
import { formatCurrency } from "@/lib/financial";
import { isJobEligibleForPo } from "@/lib/po-financial";
import { downloadSingleInvoiceZip } from "@/lib/bulk-download";
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
    refreshJobs,
    can,
  } = useAdminData();

  const job = getJobById(jobId);
  const [liveJob, setLiveJob] = useState<Job | null>(null);
  const [isEditCostModalOpen, setIsEditCostModalOpen] = useState(false);
  const [isCreateSupplierInvModalOpen, setIsCreateSupplierInvModalOpen] = useState(false);
  const [selectedSupplierInvoiceId, setSelectedSupplierInvoiceId] = useState<string | null>(null);
  const [supplierInvSearch, setSupplierInvSearch] = useState("");

  // Active Tab: breakdown (quotation), excel, suppliers, invoices, purchase-orders
  const [activeTab, setActiveTab] = useState<
    "breakdown" | "excel" | "suppliers" | "invoices" | "purchase-orders"
  >("breakdown");

  const canViewPos = can("purchaseOrders", "view");
  const canCreatePo = can("purchaseOrders", "create");
  const canDownloadPoExcel =
    can("purchaseOrders", "downloadExcel") || can("purchaseOrders", "download");

  // Fetch complete job with dynamic cost categories and items from PostgreSQL
  const fetchFullJob = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) return;
      const json = await res.json();
      if (json?.success && json.data) {
        setLiveJob(json.data);
      }
    } catch (err) {
      console.error("Error loading full job details:", err);
    }
  }, [jobId]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      void fetchFullJob();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchFullJob]);

  const currentJob = liveJob || job;

  const financialOverview = useMemo(() => {
    if (currentJob?.financialOverview) {
      return currentJob.financialOverview;
    }
    const approvedVal = Number(currentJob?.grandTotal || currentJob?.totalCost || 0);
    const activeInvs = (currentJob?.supplierInvoices || []).filter((i: any) => i.status !== "CANCELLED");
    const totalSupCost = activeInvs.reduce((sum: number, i: any) => sum + Number(i.totalAmount || 0), 0);
    const remaining = approvedVal - totalSupCost;
    const grossProfit = approvedVal - totalSupCost;
    const profitMargin = approvedVal > 0 ? (grossProfit / approvedVal) * 100 : 0;
    const costUtil = approvedVal > 0 ? (totalSupCost / approvedVal) * 100 : 0;
    return {
      approvedJobValue: approvedVal,
      totalSupplierCost: totalSupCost,
      otherCosts: 0,
      totalActualCost: totalSupCost,
      remainingBudget: remaining,
      grossProfit,
      profitMargin,
      costUtilization: costUtil,
      isBudgetExceeded: totalSupCost > approvedVal,
      supplierInvoicesCount: activeInvs.length,
    };
  }, [currentJob]);

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

  const filteredSupplierInvoices = useMemo(() => {
    const list = currentJob?.supplierInvoices || [];
    if (!supplierInvSearch.trim()) return list;
    const q = supplierInvSearch.toLowerCase();
    return list.filter((inv) =>
      inv.invoiceNumber.toLowerCase().includes(q) ||
      (inv.supplierName && inv.supplierName.toLowerCase().includes(q)) ||
      (inv.supplierCode && inv.supplierCode.toLowerCase().includes(q)) ||
      (inv.notes && inv.notes.toLowerCase().includes(q)) ||
      (inv.items && inv.items.some((it) => it.description.toLowerCase().includes(q)))
    );
  }, [currentJob?.supplierInvoices, supplierInvSearch]);

  // Derived data
  const jobSuppliers = useMemo(() => (currentJob ? getJobSuppliers(currentJob.id) : []), [currentJob, getJobSuppliers]);
  const jobInvoices = useMemo(() => (currentJob ? getJobInvoices(currentJob.id) : []), [currentJob, getJobInvoices]);
  const jobExcelFiles = useMemo(() => (currentJob ? getJobExcelFiles(currentJob.id) : []), [currentJob, getJobExcelFiles]);
  const totalValue = useMemo(() => (currentJob ? getJobTotalInvoiceValue(currentJob.id) : 0), [currentJob, getJobTotalInvoiceValue]);

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

  if (!currentJob) {
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

  const handleDownloadOriginalExcel = () => {
    if (!currentJob) return;
    const doc = currentJob.documents?.find(
      (d) => d.fileName?.endsWith(".xlsx") || d.fileName?.endsWith(".xls") || d.fileUrl?.startsWith("http")
    );
    if (doc?.fileUrl && doc.fileUrl.startsWith("http")) {
      const link = document.createElement("a");
      link.href = doc.fileUrl;
      link.download = doc.fileName;
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      downloadProcessedQuotationExcel(
        currentJob,
        currentJob.costCategories,
        currentJob.costItems,
        currentJob.costSummary
      );
    }
  };

  const handleDownloadProcessedExcel = () => {
    if (!currentJob) return;
    downloadProcessedQuotationExcel(
      currentJob,
      currentJob.costCategories,
      currentJob.costItems,
      currentJob.costSummary
    );
  };

  const categoriesToRender =
    currentJob.costCategories && currentJob.costCategories.length > 0
      ? currentJob.costCategories
      : [
          {
            id: "cat-def",
            jobId: currentJob.id,
            name: "Production Cost",
            sortOrder: 1,
            subtotal: (currentJob.costItems || []).reduce((s, i) => s + (Number(i.totalCost) || 0), 0),
            items: currentJob.costItems || [],
          },
        ];

  const totalCostItemsCount = categoriesToRender.reduce((sum, c) => sum + (c.items?.length || 0), 0);
  const summaryData = currentJob.costSummary || {
    productionCost: currentJob.totalCost || 0,
    runningCost: 0,
    agencyOperationFee: 0,
    agencyProductionFee: 0,
    adminCharges: 0,
    monitoringCost: 0,
    artworkCharges: 0,
    contingencies: 0,
    subTotal: currentJob.totalCost || 0,
    totalBeforeTax: currentJob.totalCost || 0,
    taxType: "SSCL",
    taxRate: 2.5,
    taxAmount: (Number(currentJob.totalCost) || 0) * 0.025,
    grandTotal: currentJob.grandTotal || currentJob.totalCost || 0,
  };

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
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-slate-900">{currentJob.name}</h2>
              {currentJob.jobCode && (
                <span className="text-xs font-mono font-medium text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded border border-blue-200">
                  {currentJob.jobCode}
                </span>
              )}
              <StatusBadge status={currentJob.status} />
            </div>

            <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 flex-wrap">
              {currentJob.clientName && (
                <span className="flex items-center gap-1.5 text-slate-800 font-semibold bg-slate-50 px-2.5 py-1 rounded border border-slate-200">
                  <Building className="h-3.5 w-3.5 text-blue-600" />
                  <span>Client: {currentJob.clientName}</span>
                </span>
              )}

              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                Job Date: <strong className="text-slate-700">{currentJob.date}</strong>
              </span>

              {currentJob.commencingDate && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  Commencing: <strong className="text-slate-700">{currentJob.commencingDate}</strong>
                </span>
              )}

              {currentJob.handledBy && (
                <span className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  Handled By: <strong className="text-slate-700">{currentJob.handledBy}</strong>
                </span>
              )}

              <span className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-slate-400" />
                Created By:{" "}
                <strong className="text-slate-700">
                  {currentJob.createdByName || currentJob.submittedBy?.name || "System Admin"}
                </strong>
                {currentJob.createdAt && (
                  <span className="text-[10px] text-slate-400 font-mono">
                    ({new Date(currentJob.createdAt).toLocaleDateString()})
                  </span>
                )}
              </span>

              {(currentJob.updatedByName || currentJob.updatedAt) && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  Last Updated:{" "}
                  <strong className="text-slate-700">
                    {currentJob.updatedByName || "System"}
                  </strong>
                  {currentJob.updatedAt && (
                    <span className="text-[10px] text-slate-400 font-mono">
                      ({new Date(currentJob.updatedAt).toLocaleDateString()})
                    </span>
                  )}
                </span>
              )}
            </div>

            {currentJob.description && (
              <p className="mt-2 text-xs text-slate-600 max-w-2xl leading-relaxed">
                {currentJob.description}
              </p>
            )}
          </div>

          {/* Action & Download Buttons */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              type="button"
              onClick={handleDownloadOriginalExcel}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
              title="Download original uploaded Excel quotation from secure storage"
            >
              <Download className="h-3.5 w-3.5 text-blue-600" />
              <span>Original Excel</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadProcessedExcel}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
              title="Download clean structured Excel file with all dynamic cost items"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
              <span>Processed Excel</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
              title="Print or save quotation document as PDF"
            >
              <Printer className="h-3.5 w-3.5 text-slate-600" />
              <span>Print / PDF</span>
            </button>

            <button
              type="button"
              onClick={() => setIsEditCostModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 px-3 py-2 text-xs font-semibold hover:bg-blue-100 transition-colors shadow-2xs"
            >
              <Edit2 className="h-3.5 w-3.5" />
              <span>Edit Quotation & Costs</span>
            </button>

            <button
              type="button"
              onClick={() => setIsBulkInvoiceOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1d4ed8] transition-colors shadow-2xs"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Upload Invoices</span>
            </button>
          </div>
        </div>

        {/* Quick summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-100 text-xs">
          <div>
            <span className="text-slate-400 block text-[11px]">Quotation Grand Total</span>
            <span className="font-bold text-blue-700 text-base">
              {formatCurrency(summaryData.grandTotal || totalValue, { showCurrencyPrefix: true })}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Cost Items Extracted</span>
            <span className="font-bold text-slate-900 text-base">
              {totalCostItemsCount} items ({categoriesToRender.length} categories)
            </span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Assigned Suppliers</span>
            <span className="font-bold text-slate-900 text-base">{jobSuppliers.length}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Vendor Invoices Value</span>
            <span className="font-bold text-slate-900 text-base">
              {formatCurrency(totalValue, { showCurrencyPrefix: true })}
            </span>
          </div>
        </div>
      </div>

      {/* Financial Overview & Budget Utilization Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
        {/* Warning if budget exceeded */}
        {financialOverview.isBudgetExceeded && (
          <div className="flex items-start gap-3 p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800">
            <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-0.5">
              <span className="font-bold text-rose-900 block">
                Budget Exceeded: Supplier Expenses Exceed Approved Quotation
              </span>
              <p className="text-rose-700">
                Total supplier costs of <strong>{formatCurrency(financialOverview.totalSupplierCost, { showCurrencyPrefix: true })}</strong> exceed
                the approved job value of <strong>{formatCurrency(financialOverview.approvedJobValue, { showCurrencyPrefix: true })}</strong> by{" "}
                <strong className="font-bold underline">{formatCurrency(Math.abs(financialOverview.remainingBudget), { showCurrencyPrefix: true })}</strong>.
                Budget utilization is at <strong>{financialOverview.costUtilization.toFixed(1)}%</strong>.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-600" />
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Financial Overview & Budget Utilization
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setIsCreateSupplierInvModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 shadow-2xs transition-colors shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Record Supplier Invoice</span>
          </button>
        </div>

        {/* Financial KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-200/80">
            <span className="text-[11px] font-medium text-slate-500 block">Approved Job Value</span>
            <span className="text-base font-bold text-slate-900 font-mono block mt-1">
              {formatCurrency(financialOverview.approvedJobValue, { showCurrencyPrefix: true })}
            </span>
            <span className="text-[10px] text-slate-400">Approved Quotation</span>
          </div>

          <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-200/80">
            <span className="text-[11px] font-medium text-slate-500 block">Supplier Invoices Cost</span>
            <span className="text-base font-bold text-blue-700 font-mono block mt-1">
              {formatCurrency(financialOverview.totalSupplierCost, { showCurrencyPrefix: true })}
            </span>
            <span className="text-[10px] text-slate-400">
              {financialOverview.supplierInvoicesCount} active invoice{financialOverview.supplierInvoicesCount !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-200/80">
            <span className="text-[11px] font-medium text-slate-500 block">Remaining Budget</span>
            <span
              className={`text-base font-bold font-mono block mt-1 ${
                financialOverview.remainingBudget < 0 ? "text-rose-600" : "text-emerald-700"
              }`}
            >
              {formatCurrency(financialOverview.remainingBudget, { showCurrencyPrefix: true })}
            </span>
            <span className="text-[10px] text-slate-400">
              {financialOverview.remainingBudget >= 0 ? "Available balance" : "Over-budget deficit"}
            </span>
          </div>

          <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-200/80">
            <span className="text-[11px] font-medium text-slate-500 block">Gross Profit</span>
            <span
              className={`text-base font-bold font-mono block mt-1 ${
                financialOverview.grossProfit < 0 ? "text-rose-600" : "text-emerald-700"
              }`}
            >
              {formatCurrency(financialOverview.grossProfit, { showCurrencyPrefix: true })}
            </span>
            <span className="text-[10px] text-slate-400">Value minus supplier costs</span>
          </div>

          <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-200/80">
            <span className="text-[11px] font-medium text-slate-500 block">Profit Margin</span>
            <div className="flex items-center gap-1.5 mt-1">
              {financialOverview.profitMargin >= 20 ? (
                <TrendingUp className="h-4 w-4 text-emerald-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-rose-500" />
              )}
              <span
                className={`text-base font-bold font-mono ${
                  financialOverview.profitMargin >= 30
                    ? "text-emerald-600"
                    : financialOverview.profitMargin >= 10
                    ? "text-slate-900"
                    : "text-rose-600"
                }`}
              >
                {financialOverview.profitMargin.toFixed(1)}%
              </span>
            </div>
            <span className="text-[10px] text-slate-400">Margin ratio</span>
          </div>
        </div>

        {/* Budget Utilization Progress Bar */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600 font-medium">
              Budget Utilization: <strong className="text-slate-900">{financialOverview.costUtilization.toFixed(1)}%</strong>
            </span>
            <span className="text-[11px] text-slate-400">
              {financialOverview.totalSupplierCost <= financialOverview.approvedJobValue
                ? `${formatCurrency(financialOverview.remainingBudget, { showCurrencyPrefix: true })} remaining`
                : `${formatCurrency(Math.abs(financialOverview.remainingBudget), { showCurrencyPrefix: true })} over budget`}
            </span>
          </div>
          <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                financialOverview.costUtilization > 100
                  ? "bg-rose-500"
                  : financialOverview.costUtilization > 80
                  ? "bg-amber-500"
                  : "bg-emerald-500"
              }`}
              style={{ width: `${Math.min(financialOverview.costUtilization, 100)}%` }}
            />
          </div>
        </div>

        {/* Purchase Order Commitments Strip (Separate from Actual Supplier Cost / Gross Profit) */}
        {canViewPos && (
          <div className="pt-3 border-t border-slate-100 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-3.5 w-3.5 text-indigo-600" />
                <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">
                  Purchase Order Commitments (Planned Procurement)
                </span>
                <span className="text-[10px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.2 rounded-full">
                  Commitments Only — P&amp;L driven strictly by Supplier Invoices
                </span>
              </div>

              {canCreatePo &&
                isJobEligibleForPo(
                  currentJob.status,
                  currentJob.deletedAt || (currentJob.isDeleted ? "deleted" : null)
                ) && (
                  <Link
                    href={`/admin/purchase-orders/create?jobId=${currentJob.id}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors shrink-0"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Create Purchase Order</span>
                  </Link>
                )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              <div className="p-2.5 rounded-lg bg-indigo-50/50 border border-indigo-100">
                <span className="text-[10px] font-medium text-slate-500 block">
                  Committed PO Value
                </span>
                <span className="text-sm font-bold font-mono text-indigo-800">
                  {formatCurrency(currentJob.poSummary?.totalCommittedPoValue || 0, {
                    showCurrencyPrefix: true,
                  })}
                </span>
                <span className="text-[10px] text-slate-400 block">
                  {currentJob.poSummary?.activePoCount || 0} active committed PO
                  {(currentJob.poSummary?.activePoCount || 0) === 1 ? "" : "s"}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                <span className="text-[10px] font-medium text-slate-500 block">
                  Draft POs
                </span>
                <span className="text-sm font-bold font-mono text-slate-700">
                  {formatCurrency(currentJob.poSummary?.draftPoValue || 0, {
                    showCurrencyPrefix: true,
                  })}
                </span>
                <span className="text-[10px] text-slate-400 block">
                  Uncommitted drafts
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                <span className="text-[10px] font-medium text-slate-500 block">
                  Approved &amp; Issued POs
                </span>
                <span className="text-sm font-bold font-mono text-emerald-700">
                  {currentJob.poSummary?.approvedPoCount || 0} PO
                  {(currentJob.poSummary?.approvedPoCount || 0) === 1 ? "" : "s"}
                </span>
                <span className="text-[10px] text-slate-400 block">
                  Ready for billing
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                <span className="text-[10px] font-medium text-slate-500 block">
                  Remaining Uncommitted Budget
                </span>
                <span
                  className={`text-sm font-bold font-mono ${
                    (currentJob.poSummary?.remainingUncommittedBudget ??
                      financialOverview.approvedJobValue) < 0
                      ? "text-rose-600"
                      : "text-emerald-700"
                  }`}
                >
                  {formatCurrency(
                    currentJob.poSummary?.remainingUncommittedBudget ??
                      financialOverview.approvedJobValue,
                    { showCurrencyPrefix: true }
                  )}
                </span>
                <span className="text-[10px] text-slate-400 block">
                  Job value minus PO commitments
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex gap-4 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("breakdown")}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === "breakdown"
                ? "border-[#2563EB] text-[#2563EB]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>1. Quotation & Cost Breakdown ({totalCostItemsCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("excel")}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors shrink-0 cursor-pointer ${
              activeTab === "excel"
                ? "border-[#2563EB] text-[#2563EB]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            2. Attached Documents ({jobExcelFiles.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("suppliers")}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors shrink-0 cursor-pointer ${
              activeTab === "suppliers"
                ? "border-[#2563EB] text-[#2563EB]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            3. Assigned Suppliers ({jobSuppliers.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("invoices")}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors shrink-0 cursor-pointer ${
              activeTab === "invoices"
                ? "border-[#2563EB] text-[#2563EB]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            4. Supplier Invoices & Actual Expenses ({(currentJob.supplierInvoices || []).length})
          </button>

          {canViewPos && (
            <button
              type="button"
              onClick={() => setActiveTab("purchase-orders")}
              className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeTab === "purchase-orders"
                  ? "border-[#2563EB] text-[#2563EB]"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              <span>5. Purchase Orders ({(currentJob.purchaseOrders || []).length})</span>
            </button>
          )}
        </div>
      </div>

      {/* ================= TAB 0: QUOTATION & DYNAMIC COST BREAKDOWN ================= */}
      {activeTab === "breakdown" && (
        <div className="space-y-5">
          {/* Detailed Quotation Document Box */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50/80 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-blue-600" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Detailed Cost Breakdown Schedule
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditCostModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
              >
                <Edit2 className="h-3 w-3 text-slate-500" />
                <span>Edit Costs</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/70 text-[11px] font-semibold text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5 w-14 text-center">No</th>
                    <th className="px-4 py-2.5">Item Description</th>
                    <th className="px-3 py-2.5 w-20 text-center">RC / NRC</th>
                    <th className="px-3 py-2.5 w-20 text-right">Qty</th>
                    <th className="px-4 py-2.5 w-32 text-right">Rate (Rs.)</th>
                    <th className="px-5 py-2.5 w-36 text-right">Total Cost (Rs.)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {categoriesToRender.map((cat, catIdx) => (
                    <React.Fragment key={catIdx}>
                      <tr className="bg-slate-50/90 font-bold text-slate-800">
                        <td colSpan={5} className="px-4 py-2 text-xs uppercase tracking-wide">
                          <span className="text-blue-600 mr-2">📁</span>
                          <span>{cat.name}</span>
                        </td>
                        <td className="px-5 py-2 text-right text-xs font-bold text-slate-900 font-mono">
                          {formatCurrency(cat.subtotal, { showCurrencyPrefix: true })}
                        </td>
                      </tr>
                      {(cat.items || []).map((item, itemIdx) => (
                        <tr key={itemIdx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-2.5 text-center text-slate-400 text-[11px]">
                            {item.itemNumber || itemIdx + 1}
                          </td>
                          <td className="px-4 py-2.5 font-medium text-slate-800">
                            {item.description}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span
                              className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                item.rcNrc === "RC"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {item.rcNrc || "NRC"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right text-slate-600 font-mono">
                            {item.quantity}
                          </td>
                          <td className="px-4 py-2.5 text-right text-slate-600 font-mono">
                            {formatCurrency(item.rate, { showCurrencyPrefix: false })}
                          </td>
                          <td className="px-5 py-2.5 text-right font-semibold text-slate-900 font-mono">
                            {formatCurrency(item.totalCost, { showCurrencyPrefix: false })}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Financial Summary Recapitulation Block */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-blue-600" />
                <span>Operational & Agency Breakdown</span>
              </h4>

              <div className="divide-y divide-slate-100 text-xs">
                <div className="flex justify-between py-2 text-slate-600">
                  <span>Total Production Cost (NRC):</span>
                  <span className="font-semibold text-slate-900 font-mono">
                    {formatCurrency(summaryData.productionCost || 0, { showCurrencyPrefix: true })}
                  </span>
                </div>
                <div className="flex justify-between py-2 text-slate-600">
                  <span>Total Running Cost (RC):</span>
                  <span className="font-semibold text-slate-900 font-mono">
                    {formatCurrency(summaryData.runningCost || 0, { showCurrencyPrefix: true })}
                  </span>
                </div>
                {Number(summaryData.agencyOperationFee || 0) > 0 && (
                  <div className="flex justify-between py-2 text-slate-600">
                    <span>Agency Fee for Operation Cost:</span>
                    <span className="font-semibold text-slate-900 font-mono">
                      {formatCurrency(summaryData.agencyOperationFee, { showCurrencyPrefix: true })}
                    </span>
                  </div>
                )}
                {Number(summaryData.agencyProductionFee || 0) > 0 && (
                  <div className="flex justify-between py-2 text-slate-600">
                    <span>Agency Fee for Production Cost:</span>
                    <span className="font-semibold text-slate-900 font-mono">
                      {formatCurrency(summaryData.agencyProductionFee, { showCurrencyPrefix: true })}
                    </span>
                  </div>
                )}
                {Number(summaryData.adminCharges || 0) > 0 && (
                  <div className="flex justify-between py-2 text-slate-600">
                    <span>Agency Administration Charges:</span>
                    <span className="font-semibold text-slate-900 font-mono">
                      {formatCurrency(summaryData.adminCharges, { showCurrencyPrefix: true })}
                    </span>
                  </div>
                )}
                {Number(summaryData.monitoringCost || 0) > 0 && (
                  <div className="flex justify-between py-2 text-slate-600">
                    <span>Agency Monitoring Cost:</span>
                    <span className="font-semibold text-slate-900 font-mono">
                      {formatCurrency(summaryData.monitoringCost, { showCurrencyPrefix: true })}
                    </span>
                  </div>
                )}
                {Number(summaryData.artworkCharges || 0) > 0 && (
                  <div className="flex justify-between py-2 text-slate-600">
                    <span>Artwork & AW Charges:</span>
                    <span className="font-semibold text-slate-900 font-mono">
                      {formatCurrency(summaryData.artworkCharges, { showCurrencyPrefix: true })}
                    </span>
                  </div>
                )}
                {Number(summaryData.contingencies || 0) > 0 && (
                  <div className="flex justify-between py-2 text-slate-600">
                    <span>Contingencies:</span>
                    <span className="font-semibold text-slate-900 font-mono">
                      {formatCurrency(summaryData.contingencies, { showCurrencyPrefix: true })}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3 flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 mb-3">
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                  <span>Taxation & Final Payable</span>
                </h4>

                <div className="divide-y divide-slate-100 text-xs">
                  <div className="flex justify-between py-2 text-slate-600">
                    <span>Grand Total Before Tax:</span>
                    <span className="font-bold text-slate-900 text-sm font-mono">
                      {formatCurrency(summaryData.totalBeforeTax || summaryData.subTotal || 0, { showCurrencyPrefix: true })}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 text-slate-600">
                    <span>{summaryData.taxType || "SSCL"} ({summaryData.taxRate || 2.5}%):</span>
                    <span className="font-semibold text-slate-900 font-mono">
                      {formatCurrency(summaryData.taxAmount || 0, { showCurrencyPrefix: true })}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-blue-800 uppercase tracking-wider">Final Grand Total</span>
                  <p className="text-[11px] text-blue-600">Total payable including all taxes & operational fees</p>
                </div>
                <span className="text-xl font-extrabold text-blue-900 font-mono">
                  {formatCurrency(summaryData.grandTotal || 0, { showCurrencyPrefix: true })}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 1: EXCEL UPLOAD ================= */}
      {activeTab === "excel" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-xs font-bold text-slate-900 mb-1">Upload Excel Files</h3>
            <p className="text-xs text-slate-500 mb-4">
              Upload multiple Excel files (.xlsx or .xls) for {currentJob.name}.
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
                          onClick={() => removeSupplierFromJob(currentJob.id, s.id)}
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

      {/* ================= TAB 4: SUPPLIER INVOICES & ACTUAL EXPENSES ================= */}
      {activeTab === "invoices" && (
        <div className="space-y-5">
          {/* Section Header & Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>Supplier Invoices & Actual Incurred Expenses</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  {(currentJob.supplierInvoices || []).length} recorded
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Record actual supplier bills and PDF quotation attachments against this job without altering the approved quotation.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={supplierInvSearch}
                  onChange={(e) => setSupplierInvSearch(e.target.value)}
                  placeholder="Search invoices..."
                  className="h-8 w-44 sm:w-56 rounded-lg border border-slate-200 pl-8 pr-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white"
                />
              </div>

              <button
                type="button"
                onClick={() => setIsCreateSupplierInvModalOpen(true)}
                className="inline-flex items-center gap-1.5 h-8 rounded-lg bg-blue-600 px-3.5 text-xs font-semibold text-white hover:bg-blue-700 shadow-2xs transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Record Supplier Invoice</span>
              </button>

              <button
                type="button"
                onClick={() => setIsBulkInvoiceOpen(true)}
                className="inline-flex items-center gap-1.5 h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors"
                title="Bulk upload legacy photos or receipts"
              >
                <Upload className="h-3.5 w-3.5 text-slate-500" />
                <span>Upload Photos / Vouchers</span>
              </button>
            </div>
          </div>

          {/* Supplier Invoices Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
            {filteredSupplierInvoices.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <div className="h-12 w-12 rounded-full bg-blue-50 text-blue-600 mx-auto flex items-center justify-center">
                  <FileText className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-slate-800">
                    {supplierInvSearch ? "No matching supplier invoices found" : "No supplier invoices recorded for this job yet"}
                  </h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    {supplierInvSearch
                      ? `No invoices match "${supplierInvSearch}". Try clearing your search term.`
                      : "Attach actual supplier invoices, multiple PDF quotation vouchers, and itemized descriptions to track cost utilization and profitability."}
                  </p>
                </div>
                {!supplierInvSearch && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setIsCreateSupplierInvModalOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-2xs transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Record First Supplier Invoice</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-5 py-3">Invoice Number</th>
                      <th className="px-4 py-3">Supplier</th>
                      <th className="px-4 py-3">Invoice Date</th>
                      <th className="px-4 py-3">Items / Vouchers</th>
                      <th className="px-4 py-3">Attachments</th>
                      <th className="px-4 py-3 text-right">Incurred Cost (Rs.)</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3">Recorded By</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSupplierInvoices.map((inv) => {
                      const isCancelled = inv.status === "CANCELLED";
                      const totalAttachmentsCount =
                        (inv.attachments?.length || 0) +
                        (inv.items || []).reduce((sum, item) => sum + (item.attachments?.length || 0), 0);

                      return (
                        <tr
                          key={inv.id}
                          className={`hover:bg-slate-50/70 transition-colors ${
                            isCancelled ? "bg-slate-50/60 opacity-60" : ""
                          }`}
                        >
                          <td className="px-5 py-3 font-mono font-bold text-slate-900">
                            <button
                              type="button"
                              onClick={() => setSelectedSupplierInvoiceId(inv.id)}
                              className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 text-left"
                            >
                              <span>{inv.invoiceNumber}</span>
                              <ExternalLink className="h-3 w-3 opacity-60" />
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900">{inv.supplierName || "—"}</div>
                            {inv.supplierCode && (
                              <span className="text-[10px] font-mono font-medium text-slate-400">
                                {inv.supplierCode}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600 font-mono whitespace-nowrap">
                            {inv.invoiceDate}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-slate-800 font-medium">
                              {(inv.items || []).length} item{(inv.items || []).length !== 1 ? "s" : ""}
                            </div>
                            {inv.items && inv.items.length > 0 && (
                              <div className="text-[11px] text-slate-500 truncate max-w-xs" title={inv.items.map((i) => i.description).join(", ")}>
                                {inv.items.map((i) => i.description).join(", ")}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {totalAttachmentsCount > 0 ? (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-semibold">
                                  <FileText className="h-3 w-3" />
                                  <span>{totalAttachmentsCount} File{totalAttachmentsCount !== 1 ? "s" : ""}</span>
                                </span>
                                {(inv.attachments || []).slice(0, 1).map((att) => (
                                  <a
                                    key={att.id}
                                    href={att.fileUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[10px] text-blue-600 hover:underline truncate max-w-[100px]"
                                    title={`Open ${att.fileName}`}
                                  >
                                    {att.fileName}
                                  </a>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px]">No PDF attached</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold">
                            <span className={isCancelled ? "line-through text-slate-400" : "text-slate-900"}>
                              {formatCurrency(inv.totalAmount, { showCurrencyPrefix: true })}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <StatusBadge status={inv.status} />
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <span className="block font-medium text-slate-800">{inv.createdByName || "Admin"}</span>
                            <span className="block text-[10px] text-slate-400 font-mono">{inv.createdAt}</span>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => setSelectedSupplierInvoiceId(inv.id)}
                                className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-slate-100 transition-colors"
                                title="View invoice details and audit trail"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => downloadSingleInvoiceZip(inv)}
                                className="p-1 rounded text-slate-400 hover:text-emerald-600 hover:bg-slate-100 transition-colors"
                                title="Download invoice PDFs archive (.zip)"
                              >
                                <Download className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 5: PURCHASE ORDERS FOR THIS JOB ================= */}
      {activeTab === "purchase-orders" && canViewPos && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-indigo-600" />
                <span>Job Purchase Orders</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {(currentJob.purchaseOrders || []).length} PO
                  {(currentJob.purchaseOrders || []).length === 1 ? "" : "s"}
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Purchase orders created against this job&apos;s budgeted cost items. Profit &amp; Loss uses actual Supplier Invoices, not PO totals.
              </p>
            </div>

            {canCreatePo && (
              isJobEligibleForPo(
                currentJob.status,
                currentJob.deletedAt || (currentJob.isDeleted ? "deleted" : null)
              ) ? (
                <Link
                  href={`/admin/purchase-orders/create?jobId=${currentJob.id}`}
                  className="inline-flex items-center gap-1.5 h-8 rounded-lg bg-[#2563EB] px-3.5 text-xs font-semibold text-white hover:bg-[#1d4ed8] shadow-2xs transition-colors shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create Purchase Order</span>
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] font-semibold text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  <span>Job must be Approved &amp; Active to create a PO</span>
                </span>
              )
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
            {(currentJob.purchaseOrders || []).length === 0 ? (
              <div className="p-10 text-center space-y-2.5 text-slate-400">
                <ShoppingCart className="h-10 w-10 text-slate-300 mx-auto" />
                <p className="text-sm font-semibold text-slate-700">
                  No Purchase Orders Created Yet
                </p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {isJobEligibleForPo(
                    currentJob.status,
                    currentJob.deletedAt || (currentJob.isDeleted ? "deleted" : null)
                  )
                    ? "Create a Purchase Order to issue official procurement requests using this job's extracted cost items."
                    : "Purchase Orders can be created once this Job quotation is Approved."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">PO Number</th>
                      <th className="px-4 py-3">Supplier</th>
                      <th className="px-4 py-3">PO Date</th>
                      <th className="px-4 py-3">Exp. Delivery</th>
                      <th className="px-4 py-3 text-center">Items</th>
                      <th className="px-4 py-3 text-right">PO Total</th>
                      <th className="px-4 py-3 text-right">Invoiced</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3">Created By</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(currentJob.purchaseOrders || []).map((po) => {
                      const currencyPrefix =
                        po.currency === "LKR" ? "Rs. " : `${po.currency || "LKR"} `;
                      const poInvoiced = Number(po.invoicedTotal || 0);
                      return (
                        <tr key={po.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-4 py-3 font-mono font-bold text-blue-700">
                            <Link
                              href={`/admin/purchase-orders/${po.id}`}
                              className="inline-flex items-center gap-1 hover:underline"
                            >
                              <span>{po.poNumber}</span>
                              <ExternalLink className="h-3 w-3 opacity-60" />
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900">
                              {po.supplierName || "—"}
                            </div>
                            {po.supplierCode && (
                              <span className="font-mono text-[10px] text-slate-400">
                                {po.supplierCode}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">
                            {po.poDate}
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-500 whitespace-nowrap">
                            {po.expectedDeliveryDate || "—"}
                          </td>
                          <td className="px-4 py-3 text-center font-mono text-slate-700">
                            {po.itemCount ?? po.items?.length ?? 0}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                            {formatCurrency(po.grandTotal, {
                              showCurrencyPrefix: true,
                              currencySymbol: currencyPrefix,
                            })}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-emerald-700 font-semibold">
                            {poInvoiced > 0
                              ? formatCurrency(poInvoiced, {
                                  showCurrencyPrefix: true,
                                  currencySymbol: currencyPrefix,
                                })
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            <StatusBadge status={po.status} />
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <span className="block font-medium text-slate-800">
                              {po.createdByName || "Admin"}
                            </span>
                            {po.approvedByName && (
                              <span className="block text-[10px] text-emerald-700">
                                Appr: {po.approvedByName}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              <Link
                                href={`/admin/purchase-orders/${po.id}`}
                                className="p-1.5 rounded text-slate-500 hover:text-blue-600 hover:bg-slate-100"
                                title="Inspect Purchase Order Details"
                              >
                                <Eye className="h-4 w-4" />
                              </Link>
                              {canDownloadPoExcel && (
                                <a
                                  href={`/api/purchase-orders/${po.id}/export/excel`}
                                  className="p-1.5 rounded text-slate-500 hover:text-emerald-600 hover:bg-emerald-50"
                                  title="Download PO Excel Workbook"
                                >
                                  <FileSpreadsheet className="h-4 w-4" />
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Bulk Invoice Upload */}
      <BulkInvoiceUploadModal
        isOpen={isBulkInvoiceOpen}
        onClose={() => setIsBulkInvoiceOpen(false)}
        preselectedJobId={currentJob.id}
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
                  {formatCurrency(previewingInvoice.totalValue, { showCurrencyPrefix: true })}
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
                      const already = currentJob.supplierIds.includes(s.id);
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

      {/* Edit Job Quotation & Costs Modal */}
      {isEditCostModalOpen && (
        <EditJobCostsModal
          isOpen={isEditCostModalOpen}
          onClose={() => setIsEditCostModalOpen(false)}
          job={currentJob}
          onSaveSuccess={(updatedJob) => {
            setLiveJob(updatedJob);
            refreshJobs?.();
          }}
        />
      )}

      {/* Create Supplier Invoice Modal */}
      <CreateSupplierInvoiceModal
        isOpen={isCreateSupplierInvModalOpen}
        onClose={() => setIsCreateSupplierInvModalOpen(false)}
        preselectedJobId={currentJob.id}
        onSuccess={() => {
          fetchFullJob();
          refreshJobs?.();
        }}
      />

      {/* View Supplier Invoice Modal */}
      {selectedSupplierInvoiceId && (
        <ViewSupplierInvoiceModal
          isOpen={true}
          onClose={() => setSelectedSupplierInvoiceId(null)}
          invoiceId={selectedSupplierInvoiceId}
          onStatusChange={() => {
            fetchFullJob();
            refreshJobs?.();
          }}
        />
      )}
    </div>
  );
}
