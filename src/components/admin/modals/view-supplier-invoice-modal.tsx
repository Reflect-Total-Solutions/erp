"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Modal } from "@/components/admin/ui/modal";
import { StatusBadge } from "@/components/admin/ui/badge";
import { useAdminData } from "@/context/admin-data-context";
import { formatCurrency } from "@/lib/financial";
import { SupplierInvoice, SupplierPayment } from "@/types/admin";
import { downloadSingleInvoiceZip } from "@/lib/bulk-download";
import { computeDerivedPaymentSummary } from "@/lib/supplier-payment-date";
import {
  FileText,
  Building2,
  Briefcase,
  Calendar,
  Download,
  AlertTriangle,
  Ban,
  Loader2,
  ExternalLink,
  Eye,
  Trash2,
  Edit,
  ShoppingCart,
  ShieldAlert,
  CreditCard,
  RotateCcw,
  Clock,
  Receipt,
  CheckCircle2,
} from "lucide-react";
import { getFileCategory } from "@/lib/file-validation";
import {
  AttachmentPreviewModal,
  PreviewableAttachment,
} from "@/components/admin/modals/attachment-preview-modal";
import { MakeSupplierPaymentModal } from "@/components/admin/modals/make-supplier-payment-modal";
import { ReverseSupplierPaymentModal } from "@/components/admin/modals/reverse-supplier-payment-modal";

interface ViewSupplierInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice?: SupplierInvoice | null;
  invoiceId?: string | null;
  initialTab?: "items" | "history" | "payments";
  onCancelInvoice?: (invoiceId: string, reason: string) => Promise<boolean>;
  onStatusChange?: () => void;
  onPaymentUpdated?: () => void;
  onEditInvoice?: (invoice: SupplierInvoice) => void;
  isAdmin?: boolean;
  canEdit?: boolean;
  canCancel?: boolean;
  canManageAttachments?: boolean;
}

export function ViewSupplierInvoiceModal({
  isOpen,
  onClose,
  invoice: propInvoice,
  invoiceId,
  initialTab = "items",
  onCancelInvoice,
  onStatusChange,
  onPaymentUpdated,
  onEditInvoice,
  canEdit,
  canCancel,
  canManageAttachments,
}: ViewSupplierInvoiceModalProps) {
  const { can } = useAdminData();
  const allowEdit = typeof canEdit === "boolean" ? canEdit : can("supplierInvoices", "edit");
  const allowCancel =
    typeof canCancel === "boolean" ? canCancel : can("supplierInvoices", "cancel");
  const allowRemoveAttachment =
    typeof canManageAttachments === "boolean"
      ? canManageAttachments
      : can("supplierInvoices", "edit") || can("supplierInvoices", "manageAttachments");
  const allowCreatePayment = can("supplierPayments", "create");
  const allowEditPayment = can("supplierPayments", "edit");
  const allowReversePayment = can("supplierPayments", "reverse");
  const allowViewPayments =
    can("supplierPayments", "view") || allowCreatePayment || allowEditPayment || allowReversePayment;

  const targetId = propInvoice?.id || invoiceId || null;

  const [fetchedResult, setFetchedResult] = useState<{
    id: string;
    data: SupplierInvoice | null;
  } | null>(null);
  const [patchedInvoice, setPatchedInvoice] = useState<{
    id: string;
    baseKey: string;
    data: SupplierInvoice;
  } | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [isProcessingCancel, setIsProcessingCancel] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [isZipping, setIsZipping] = useState(false);
  const [activeTab, setActiveTab] = useState<"items" | "history" | "payments">(initialTab);
  const [previewAttachment, setPreviewAttachment] = useState<PreviewableAttachment | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [loadingReceiptId, setLoadingReceiptId] = useState<string | null>(null);
  const [isRemovingAttachmentId, setIsRemovingAttachmentId] = useState<string | null>(null);

  // Payment modals embedded cleanly inside View modal
  const [isMakePaymentOpen, setIsMakePaymentOpen] = useState(false);
  const [paymentActionModal, setPaymentActionModal] = useState<{
    mode: "REVERSE" | "EDIT";
    payment: SupplierPayment;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      setActiveTab(initialTab);
      setIsCancelDialogOpen(false);
      setCancelReason("");
      setCancelError("");
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, initialTab, targetId]);

  // Fetch full invoice (with payments & paymentAuditLogs) whenever needed or after payment mutations
  useEffect(() => {
    if (!isOpen || !targetId) return;
    const needsFullFetch =
      refreshTick > 0 ||
      !propInvoice ||
      propInvoice.payments === undefined ||
      propInvoice.paymentAuditLogs === undefined;

    if (!needsFullFetch) return;

    let cancelled = false;
    fetch(`/api/supplier-invoices/${targetId}`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) {
          setFetchedResult({
            id: targetId,
            data: json.success && json.data ? json.data : null,
          });
        }
      })
      .catch((err) => {
        console.error("Error loading invoice:", err);
        if (!cancelled && !propInvoice) {
          setFetchedResult({ id: targetId, data: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, targetId, propInvoice, refreshTick]);

  const fetchedForTarget =
    targetId && fetchedResult?.id === targetId ? fetchedResult.data : null;
  const baseInvoice = fetchedForTarget || propInvoice || null;
  const baseKey = baseInvoice
    ? `${baseInvoice.id}:${baseInvoice.status}:${baseInvoice.paymentStatus || ""}:${baseInvoice.paidAmount ?? ""}:${baseInvoice.paymentDueDate || ""}:${baseInvoice.updatedAt}:${(baseInvoice.attachments || []).length}:${(baseInvoice.payments || []).length}`
    : "";
  const invoice =
    baseInvoice && patchedInvoice?.id === baseInvoice.id && patchedInvoice.baseKey === baseKey
      ? patchedInvoice.data
      : baseInvoice;
  const isLoading = Boolean(isOpen && !propInvoice && targetId && fetchedResult?.id !== targetId);

  const paymentSummary = useMemo(() => {
    if (!invoice) return null;
    return computeDerivedPaymentSummary({
      totalAmount: invoice.totalAmount,
      paidAmount: invoice.paidAmount,
      dueDate: invoice.paymentDueDate || invoice.invoiceDate,
      invoiceDate: invoice.invoiceDate,
      invoiceStatus: invoice.status,
      payments: Array.isArray(invoice.payments) ? invoice.payments : undefined,
      lastPaymentDate: invoice.lastPaymentDate,
    });
  }, [invoice]);

  const triggerRefreshAfterPayment = useCallback(() => {
    setRefreshTick((t) => t + 1);
    onPaymentUpdated?.();
    onStatusChange?.();
  }, [onPaymentUpdated, onStatusChange]);

  const handleOpenPreview = (
    att: { fileName: string; fileUrl: string; fileType?: string | null; fileSize?: string },
    rowDesc?: string
  ) => {
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

  const handlePreviewPaymentReceipt = async (payment: SupplierPayment) => {
    const fileName =
      payment.attachmentOriginalName || payment.attachmentName || `${payment.paymentNumber}-receipt`;
    const category = getFileCategory(fileName, payment.attachmentMimeType || undefined);
    setLoadingReceiptId(payment.id);
    try {
      const res = await fetch(`/api/supplier-payments/${payment.id}/receipt?action=signed-url`);
      const json = await res.json();
      const url =
        res.ok && json.success && json.signedUrl
          ? json.signedUrl
          : `/api/supplier-payments/${payment.id}/receipt?action=preview`;
      setPreviewAttachment({
        name: fileName,
        url,
        category,
        size: payment.attachmentSize || undefined,
        description: `Payment ${payment.paymentNumber} (${payment.paymentMethod})`,
      });
      setIsPreviewModalOpen(true);
    } catch {
      setPreviewAttachment({
        name: fileName,
        url: `/api/supplier-payments/${payment.id}/receipt?action=preview`,
        category,
        size: payment.attachmentSize || undefined,
        description: `Payment ${payment.paymentNumber}`,
      });
      setIsPreviewModalOpen(true);
    } finally {
      setLoadingReceiptId(null);
    }
  };

  const handleRemoveAttachment = async (attachmentId: string, fileName: string) => {
    const reason = window.prompt(
      `Please enter an audit reason to remove attachment "${fileName}":`,
      "Updated document version"
    );
    if (!reason || !reason.trim()) return;

    if (!invoice) return;

    setIsRemovingAttachmentId(attachmentId);
    try {
      const res = await fetch(`/api/supplier-invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "REMOVE_ATTACHMENT", attachmentId, reason: reason.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to remove attachment.");
      }
      setPatchedInvoice({
        id: invoice.id,
        baseKey,
        data: {
          ...invoice,
          attachments: (invoice.attachments || []).filter((a) => a.id !== attachmentId),
          items: (invoice.items || []).map((it) => ({
            ...it,
            attachments: (it.attachments || []).filter((a) => a.id !== attachmentId),
          })),
        },
      });
      onStatusChange?.();
    } catch (err: any) {
      alert(err.message || "Failed to remove attachment.");
    } finally {
      setIsRemovingAttachmentId(null);
    }
  };

  if (!isOpen) return null;

  if (isLoading) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Loading Supplier Invoice..." maxWidth="3xl">
        <div className="py-12 flex flex-col items-center justify-center space-y-3 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-xs font-semibold">Retrieving invoice details &amp; attachments...</p>
        </div>
      </Modal>
    );
  }

  if (!invoice || !paymentSummary) return null;

  const isCancelled = invoice.status === "CANCELLED";
  const paymentsList = invoice.payments || [];
  const paymentAuditLogs = invoice.paymentAuditLogs || [];
  const canPayNow = !isCancelled && paymentSummary.outstandingBalance > 0 && allowCreatePayment;

  const handleExecuteCancel = async () => {
    if (!cancelReason.trim()) {
      setCancelError("A mandatory cancellation reason is required.");
      return;
    }
    setCancelError("");
    setIsProcessingCancel(true);
    try {
      if (onCancelInvoice) {
        const success = await onCancelInvoice(invoice.id, cancelReason.trim());
        if (success) {
          setIsCancelDialogOpen(false);
          setCancelReason("");
          onStatusChange?.();
          onPaymentUpdated?.();
        }
      } else {
        const res = await fetch(`/api/supplier-invoices/${invoice.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "CANCEL", reason: cancelReason.trim() }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Failed to cancel invoice.");
        }
        setIsCancelDialogOpen(false);
        setCancelReason("");
        setPatchedInvoice({
          id: invoice.id,
          baseKey,
          data: {
            ...invoice,
            status: "CANCELLED",
            paymentStatus: "CANCELLED",
            cancellationReason: cancelReason.trim(),
          },
        });
        onStatusChange?.();
        onPaymentUpdated?.();
      }
    } catch (err: any) {
      setCancelError(err.message || "Failed to cancel invoice.");
    } finally {
      setIsProcessingCancel(false);
    }
  };

  const handleDownloadAllZip = async () => {
    setIsZipping(true);
    try {
      await downloadSingleInvoiceZip(invoice);
    } catch (err) {
      console.error("ZIP download failed:", err);
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Supplier Invoice — ${invoice.invoiceNumber}`}
      maxWidth="6xl"
    >
      <div className="space-y-4 text-xs">
        {/* Banner Alert if Cancelled */}
        {isCancelled && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-900">
            <Ban className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
            <div>
              <p className="font-bold">This Supplier Invoice Has Been Cancelled / Reversed</p>
              <p className="text-[11px] text-rose-700 mt-0.5">
                {invoice.cancellationReason
                  ? `Reason: "${invoice.cancellationReason}"`
                  : "This invoice has been voided and is excluded from actual Job cost calculations."}
              </p>
              {invoice.cancelledAt && (
                <p className="text-[10px] text-rose-500 mt-1">
                  Cancelled by {invoice.cancelledByName || "Admin"} on{" "}
                  {new Date(invoice.cancelledAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Banner Alert if Budget Override Was Authorized */}
        {invoice.budgetOverrideUsed && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-amber-900">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <p className="font-bold">Budget Override Authorized on This Invoice</p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                {invoice.budgetOverrideReason
                  ? `Reason: "${invoice.budgetOverrideReason}"`
                  : "One or more line items exceeded the original Job cost budget with explicit override authorization."}
              </p>
            </div>
          </div>
        )}

        {/* Top Header Card */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-bold text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-md">
                {invoice.invoiceNumber}
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  isCancelled
                    ? "bg-rose-100 text-rose-700 border border-rose-200"
                    : "bg-slate-200 text-slate-700 border border-slate-300"
                }`}
              >
                {invoice.status}
              </span>
              <StatusBadge status={paymentSummary.paymentStatus} />
              {paymentSummary.paymentStatus === "OVERDUE" && paymentSummary.isPartiallyPaid && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  Partial Paid
                </span>
              )}
            </div>

            <div className="mt-3 space-y-1.5 text-slate-600 text-[11px]">
              <div className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="font-semibold text-slate-800">
                  {invoice.supplierName || invoice.supplier?.name || "Supplier"}
                </span>
                {(invoice.supplierCode || invoice.supplier?.code) && (
                  <span className="font-mono text-[10px] text-slate-500 bg-slate-200/70 px-1.5 rounded">
                    {invoice.supplierCode || invoice.supplier?.code}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span>
                  Job:{" "}
                  <strong className="text-slate-800">
                    {invoice.jobCode || invoice.job?.jobCode}
                  </strong>{" "}
                  • {invoice.jobName || invoice.job?.name}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span>
                    Invoice Date: <strong>{invoice.invoiceDate}</strong>
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                  <span>
                    Due Date:{" "}
                    <strong
                      className={
                        paymentSummary.isOverdue
                          ? "text-rose-700 font-mono"
                          : "text-slate-900 font-mono"
                      }
                    >
                      {paymentSummary.dueDateKey || invoice.invoiceDate}
                    </strong>
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      paymentSummary.countdown.severity === "overdue"
                        ? "bg-rose-100 text-rose-700"
                        : paymentSummary.countdown.severity === "warning"
                        ? "bg-amber-100 text-amber-800"
                        : paymentSummary.countdown.severity === "paid"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {paymentSummary.countdown.label}
                  </span>
                </span>
              </div>

              {(invoice.paymentTerms || invoice.creditPeriodDays != null) && (
                <div className="text-[11px] text-slate-500 pl-5">
                  Terms:{" "}
                  <strong className="text-slate-700">
                    {invoice.paymentTerms || `${invoice.creditPeriodDays} Days`}
                  </strong>
                  {invoice.paymentTerms && invoice.creditPeriodDays != null
                    ? ` (${invoice.creditPeriodDays} days)`
                    : ""}
                </div>
              )}

              {invoice.purchaseOrderId && (
                <div className="flex items-center gap-1.5 pt-0.5">
                  <ShoppingCart className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                  <span>Linked PO:</span>
                  <Link
                    href={`/admin/purchase-orders/${invoice.purchaseOrderId}`}
                    onClick={onClose}
                    className="inline-flex items-center gap-1 font-mono font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded transition-colors"
                  >
                    <span>{invoice.purchaseOrderNumber || "View PO"}</span>
                    <ExternalLink className="h-2.5 w-2.5" />
                  </Link>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col justify-between items-start md:items-end border-t md:border-t-0 md:border-l border-slate-200 pt-3 md:pt-0 md:pl-4">
            <div className="text-left md:text-right">
              <span className="text-[11px] text-slate-400 block font-medium">
                Total Invoice Amount
              </span>
              <span className="text-2xl font-extrabold text-slate-900 font-mono">
                {formatCurrency(invoice.totalAmount, { showCurrencyPrefix: true })}
              </span>
            </div>

            <div className="text-left md:text-right text-[11px] text-slate-500 mt-2 space-y-0.5">
              <p>
                <span className="text-slate-400">Created:</span>{" "}
                <span className="font-medium text-slate-700">
                  {invoice.createdByName || "System Admin"}
                </span>
                {invoice.createdAt && (
                  <span className="text-slate-400 text-[10px] ml-1 font-mono">
                    ({new Date(invoice.createdAt).toLocaleString()})
                  </span>
                )}
              </p>
              {(invoice.updatedByName || invoice.updatedAt) && (
                <p>
                  <span className="text-slate-400">Last Modified:</span>{" "}
                  <span className="font-medium text-slate-700">
                    {invoice.updatedByName || "System"}
                  </span>
                  {invoice.updatedAt && (
                    <span className="text-slate-400 text-[10px] ml-1 font-mono">
                      ({new Date(invoice.updatedAt).toLocaleString()})
                    </span>
                  )}
                </p>
              )}
              {invoice.notes && (
                <p className="text-slate-500 italic mt-0.5">Remarks: {invoice.notes}</p>
              )}
            </div>
          </div>
        </div>

        {/* Payment Settlement Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
                Invoice Total
              </span>
              <span className="text-sm font-bold font-mono text-slate-900">
                {formatCurrency(paymentSummary.totalAmount, { showCurrencyPrefix: true })}
              </span>
            </div>
            <FileText className="h-4 w-4 text-slate-300" />
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-3.5 py-2.5 flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-emerald-700 font-bold block">
                Paid Amount ({paymentsList.filter((p) => p.status === "SUCCESS").length} payment
                {paymentsList.filter((p) => p.status === "SUCCESS").length === 1 ? "" : "s"})
              </span>
              <span className="text-sm font-bold font-mono text-emerald-700">
                {formatCurrency(paymentSummary.paidAmount, { showCurrencyPrefix: true })}
              </span>
              {paymentSummary.lastPaymentDate && (
                <span className="text-[10px] text-emerald-700/80 block">
                  Last paid: {paymentSummary.lastPaymentDate}
                </span>
              )}
            </div>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>

          <div
            className={`rounded-xl border px-3.5 py-2.5 flex items-center justify-between ${
              paymentSummary.outstandingBalance <= 0
                ? "border-slate-200 bg-slate-50"
                : paymentSummary.isOverdue
                ? "border-rose-200 bg-rose-50/60"
                : "border-blue-200 bg-blue-50/60"
            }`}
          >
            <div>
              <span
                className={`text-[10px] uppercase tracking-wider font-bold block ${
                  paymentSummary.outstandingBalance <= 0
                    ? "text-slate-500"
                    : paymentSummary.isOverdue
                    ? "text-rose-700"
                    : "text-blue-700"
                }`}
              >
                Outstanding Balance
              </span>
              <span
                className={`text-sm font-bold font-mono ${
                  paymentSummary.outstandingBalance <= 0
                    ? "text-slate-600"
                    : paymentSummary.isOverdue
                    ? "text-rose-800"
                    : "text-blue-900"
                }`}
              >
                {formatCurrency(paymentSummary.outstandingBalance, { showCurrencyPrefix: true })}
              </span>
            </div>
            <CreditCard
              className={`h-4 w-4 ${
                paymentSummary.outstandingBalance <= 0
                  ? "text-slate-300"
                  : paymentSummary.isOverdue
                  ? "text-rose-500"
                  : "text-blue-500"
              }`}
            />
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("items")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "items"
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Invoice Items &amp; Attachments ({invoice.items?.length || 0})
            </button>
            {(allowViewPayments || paymentsList.length > 0) && (
              <button
                type="button"
                onClick={() => setActiveTab("payments")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === "payments"
                    ? "bg-blue-600 text-white shadow-2xs"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Payment History ({paymentsList.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveTab("history")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "history"
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Audit History ({invoice.auditLogs?.length || 0})
            </button>
          </div>

          {canPayNow && (
            <button
              type="button"
              onClick={() => setIsMakePaymentOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs transition-colors cursor-pointer"
            >
              <CreditCard className="h-3.5 w-3.5" />
              <span>Make Payment</span>
            </button>
          )}
        </div>

        {/* TAB 1: Items & Attachments */}
        {activeTab === "items" && (
          <div className="space-y-4">
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                      <th className="py-2.5 px-3 w-12 text-center">Row</th>
                      <th className="py-2.5 px-3 min-w-[130px]">Cost Category</th>
                      <th className="py-2.5 px-3 min-w-[200px]">Description</th>
                      <th className="py-2.5 px-3 w-28 text-right">Orig. Job Amt</th>
                      <th className="py-2.5 px-3 w-24 text-right">Qty &amp; Unit</th>
                      <th className="py-2.5 px-3 w-28 text-right">Rate</th>
                      <th className="py-2.5 px-3 min-w-[240px]">
                        Attached Documents (PDF, Word, Images)
                      </th>
                      <th className="py-2.5 px-3 w-32 text-right">Amount (Rs.)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {(invoice.items || []).map((item, idx) => {
                      const rowAttachments =
                        item.attachments && item.attachments.length > 0
                          ? item.attachments
                          : (invoice.attachments || []).filter((a) => a.itemId === item.id);

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/70 transition-colors align-top">
                          <td className="py-3 px-3 text-center font-mono font-bold text-slate-400">
                            {item.rowNumber || idx + 1}
                          </td>
                          <td className="py-3 px-3">
                            {item.jobCostCategoryName ? (
                              <span className="inline-flex px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[11px] border border-slate-200">
                                {item.jobCostCategoryName}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">
                                General / Uncategorized
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <p className="font-semibold text-slate-900">{item.description}</p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              {item.jobCostItemId ? (
                                <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Excel Cost Line
                                </span>
                              ) : item.purchaseOrderItemId ? (
                                <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  PO Line Item
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200">
                                  Manual Entry
                                </span>
                              )}
                            </div>
                            {item.budgetOverrideReason && (
                              <p className="text-[10px] text-amber-700 mt-1 font-medium">
                                Override: {item.budgetOverrideReason}
                              </p>
                            )}
                            {item.notes && (
                              <p className="text-[11px] text-slate-400 mt-0.5">{item.notes}</p>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-600">
                            {item.originalJobAmount != null
                              ? formatCurrency(item.originalJobAmount)
                              : "—"}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-700 whitespace-nowrap">
                            {item.quantity != null
                              ? `${item.quantity} ${item.unit || "Nos"}`
                              : "—"}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-600">
                            {item.unitRate != null ? formatCurrency(item.unitRate) : "—"}
                          </td>
                          <td className="py-3 px-3">
                            {rowAttachments.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {rowAttachments.map((doc) => {
                                  const category = getFileCategory(
                                    doc.fileName,
                                    doc.fileType || undefined
                                  );
                                  const isImage = category === "image";
                                  const isWord = category === "word";

                                  return (
                                    <div
                                      key={doc.id}
                                      className={`group flex items-center gap-1.5 p-1 px-2 rounded-lg border text-[11px] transition-all ${
                                        isImage
                                          ? "bg-emerald-50 border-emerald-200 text-emerald-950"
                                          : isWord
                                          ? "bg-blue-50 border-blue-200 text-blue-950"
                                          : "bg-rose-50 border-rose-200 text-rose-950"
                                      }`}
                                    >
                                      {isImage ? (
                                        /* eslint-disable-next-line @next/next/no-img-element */
                                        <img
                                          src={doc.fileUrl}
                                          alt={doc.fileName}
                                          className="h-6 w-6 rounded object-cover border border-emerald-300 shrink-0 cursor-pointer"
                                          onClick={() => handleOpenPreview(doc, item.description)}
                                          title="Click to preview image"
                                        />
                                      ) : isWord ? (
                                        <FileText className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                      ) : (
                                        <FileText className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                                      )}

                                      <div className="max-w-[140px] truncate">
                                        <span
                                          className="truncate block font-semibold leading-tight cursor-pointer hover:underline"
                                          title={doc.fileName}
                                          onClick={() => handleOpenPreview(doc, item.description)}
                                        >
                                          {doc.fileName}
                                        </span>
                                        <span className="text-[9px] text-slate-400 block font-mono">
                                          {doc.fileSize}
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-0.5 ml-1 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => handleOpenPreview(doc, item.description)}
                                          className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-white transition-colors cursor-pointer"
                                          title="Preview attachment"
                                        >
                                          <Eye className="h-3 w-3" />
                                        </button>

                                        <a
                                          href={doc.fileUrl}
                                          download={doc.fileName}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="p-1 rounded text-slate-500 hover:text-emerald-600 hover:bg-white transition-colors"
                                          title="Download file"
                                        >
                                          <Download className="h-3 w-3" />
                                        </a>

                                        {allowRemoveAttachment && !isCancelled && (
                                          <button
                                            type="button"
                                            disabled={isRemovingAttachmentId === doc.id}
                                            onClick={() =>
                                              handleRemoveAttachment(doc.id, doc.fileName)
                                            }
                                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-white transition-colors cursor-pointer disabled:opacity-40"
                                            title="Remove attachment (authorized users only)"
                                          >
                                            {isRemovingAttachmentId === doc.id ? (
                                              <Loader2 className="h-3 w-3 animate-spin text-rose-600" />
                                            ) : (
                                              <Trash2 className="h-3 w-3" />
                                            )}
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">
                                No attachments recorded
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                            {formatCurrency(item.amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t border-slate-200 font-bold text-slate-900">
                      <td colSpan={7} className="py-3 px-3 text-right">
                        Total Invoice Amount:
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-sm text-emerald-700">
                        {formatCurrency(invoice.totalAmount, { showCurrencyPrefix: true })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {invoice.attachments && invoice.attachments.length > 0 && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50/70 border border-blue-200">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-700" />
                  <span className="font-semibold text-blue-900 text-xs">
                    {invoice.attachments.length} Total Attachment
                    {invoice.attachments.length === 1 ? "" : "s"} (PDF, Word, Images) Available
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadAllZip}
                  disabled={isZipping}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
                >
                  {isZipping ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  <span>Download All Attachments as ZIP</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Payment History & Payment Audit Trail */}
        {activeTab === "payments" && (
          <div className="space-y-4">
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                      <th className="py-2.5 px-3">Payment #</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Method &amp; Account</th>
                      <th className="py-2.5 px-3">Reference / Notes</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Receipt</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {paymentsList.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-10 text-center text-slate-400">
                          No payments have been recorded against this invoice yet.
                        </td>
                      </tr>
                    ) : (
                      paymentsList.map((p) => {
                        const isReversed = p.status === "REVERSED";
                        return (
                          <tr
                            key={p.id}
                            className={`align-top ${isReversed ? "bg-rose-50/30 opacity-80" : "hover:bg-slate-50/70"}`}
                          >
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                              {p.paymentNumber}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                              {p.paymentDate}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="font-semibold text-slate-800 block">
                                {p.paymentMethod}
                              </span>
                              {p.bankAccountName && (
                                <span className="text-[10px] text-slate-500">
                                  {p.bankAccountName}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              {p.referenceNumber ? (
                                <span className="font-mono text-slate-800 block">
                                  Ref: {p.referenceNumber}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                              {p.notes && (
                                <span className="text-[10px] text-slate-500 block">{p.notes}</span>
                              )}
                              {isReversed && p.reversalReason && (
                                <span className="text-[10px] text-rose-700 font-medium block mt-0.5">
                                  Reversed: {p.reversalReason}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                              <span className={isReversed ? "line-through text-rose-600" : ""}>
                                {formatCurrency(p.amount, { showCurrencyPrefix: true })}
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              <StatusBadge status={p.status} />
                            </td>
                            <td className="py-2.5 px-3">
                              {p.attachmentName || p.attachmentStoragePath ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handlePreviewPaymentReceipt(p)}
                                    disabled={loadingReceiptId === p.id}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 text-[10px] font-semibold cursor-pointer"
                                    title="Preview receipt"
                                  >
                                    {loadingReceiptId === p.id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Receipt className="h-3 w-3" />
                                    )}
                                    <span>View</span>
                                  </button>
                                  <a
                                    href={`/api/supplier-payments/${p.id}/receipt?action=download`}
                                    className="p-1 rounded text-slate-500 hover:text-emerald-600"
                                    title="Download receipt"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </a>
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-400">None</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right whitespace-nowrap">
                              {!isReversed && !isCancelled && (allowEditPayment || allowReversePayment) ? (
                                <div className="inline-flex items-center gap-1">
                                  {allowEditPayment && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPaymentActionModal({ mode: "EDIT", payment: p })
                                      }
                                      className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                                      title="Edit payment entry"
                                    >
                                      <Edit className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  {allowReversePayment && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPaymentActionModal({ mode: "REVERSE", payment: p })
                                      }
                                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                      title="Reverse payment"
                                    >
                                      <RotateCcw className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-400">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {paymentAuditLogs.length > 0 && (
              <div className="space-y-2 p-3 rounded-xl bg-slate-50 border border-slate-200 max-h-56 overflow-y-auto">
                <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                  Payment &amp; Due Date Audit Log ({paymentAuditLogs.length})
                </h4>
                {paymentAuditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-2 rounded-lg bg-white border border-slate-200 text-[11px] flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-mono font-bold text-blue-700 mr-2">{log.action}</span>
                      <span className="text-slate-700">{log.reason || "State recorded."}</span>
                      <span className="text-[10px] text-slate-400 ml-2">
                        by {log.userName || "System"}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Invoice Audit History */}
        {activeTab === "history" && (
          <div className="space-y-3 p-3 rounded-xl bg-slate-50 border border-slate-200 max-h-64 overflow-y-auto">
            {invoice.auditLogs && invoice.auditLogs.length > 0 ? (
              invoice.auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-blue-700 uppercase tracking-wider text-[10px] font-bold">
                      {log.action}
                    </span>
                    <span className="text-slate-400 text-[10px]">{log.createdAt}</span>
                  </div>
                  <p className="text-slate-700">{log.reason || "Invoice state recorded."}</p>
                  <p className="text-slate-400 text-[10px]">
                    Performed by: {log.userName || "System Admin"}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-center text-slate-400 py-6">
                No previous audit revisions recorded for this invoice.
              </p>
            )}
          </div>
        )}

        {/* Cancellation Reason Dialog */}
        {isCancelDialogOpen && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-300 space-y-3">
            <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
              <AlertTriangle className="h-4 w-4 text-rose-600" />
              <span>Confirm Invoice Cancellation &amp; Cost Reversal</span>
            </div>
            <p className="text-[11px] text-rose-700 leading-relaxed">
              Cancelling this invoice will immediately deduct{" "}
              <strong>{formatCurrency(invoice.totalAmount, { showCurrencyPrefix: true })}</strong>{" "}
              from the linked Job&apos;s actual costs and restore the remaining job budget. This action
              is permanently audited.
            </p>

            <textarea
              rows={2}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Mandatory cancellation reason (e.g. Billed to wrong job, duplicate receipt, supplier issued credit note)..."
              className="w-full p-2.5 rounded-lg border border-rose-300 bg-white text-xs text-slate-900 outline-none focus:ring-2 focus:ring-rose-500"
            />

            {cancelError && <p className="text-[10px] text-rose-700 font-bold">{cancelError}</p>}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCancelDialogOpen(false)}
                className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-200 text-xs font-semibold cursor-pointer"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={handleExecuteCancel}
                disabled={isProcessingCancel || !cancelReason.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isProcessingCancel ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Ban className="h-3.5 w-3.5" />
                )}
                <span>
                  {isProcessingCancel
                    ? "Cancelling Invoice & Recalculating..."
                    : "Confirm Cancellation"}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Modal Footer Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200">
          <div className="flex items-center gap-2">
            {!isCancelled && !isCancelDialogOpen && (allowCancel || (onEditInvoice && allowEdit)) && (
              <>
                {allowCancel && (
                  <button
                    type="button"
                    onClick={() => setIsCancelDialogOpen(true)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-xs font-semibold transition-colors cursor-pointer"
                    title="Cancel or reverse this supplier invoice"
                  >
                    <Ban className="h-3.5 w-3.5 text-rose-600" />
                    <span>Cancel / Void Invoice</span>
                  </button>
                )}
                {onEditInvoice && allowEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onEditInvoice(invoice);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-xs font-semibold transition-colors cursor-pointer"
                    title="Edit invoice items, due date, attachments, and amounts"
                  >
                    <Edit className="h-3.5 w-3.5 text-blue-600" />
                    <span>Edit Invoice</span>
                  </button>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {canPayNow && (
              <button
                type="button"
                onClick={() => setIsMakePaymentOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors cursor-pointer"
              >
                <CreditCard className="h-3.5 w-3.5" />
                <span>Make Payment</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Attachment / Payment Receipt Preview Modal */}
      <AttachmentPreviewModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        attachment={previewAttachment}
      />

      {/* Embedded Make Payment Modal */}
      <MakeSupplierPaymentModal
        isOpen={isMakePaymentOpen}
        onClose={() => setIsMakePaymentOpen(false)}
        invoice={invoice}
        onSuccess={() => {
          setActiveTab("payments");
          triggerRefreshAfterPayment();
        }}
      />

      {/* Embedded Edit / Reverse Payment Modal */}
      <ReverseSupplierPaymentModal
        isOpen={Boolean(paymentActionModal)}
        onClose={() => setPaymentActionModal(null)}
        mode={paymentActionModal?.mode || "REVERSE"}
        payment={paymentActionModal?.payment || null}
        onSuccess={() => {
          triggerRefreshAfterPayment();
        }}
      />
    </Modal>
  );
}
