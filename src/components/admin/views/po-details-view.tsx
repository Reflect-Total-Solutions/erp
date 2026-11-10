"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Briefcase,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Download,
  Edit,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  History,
  Loader2,
  Paperclip,
  RotateCcw,
  Send,
  ShieldAlert,
  Trash2,
  Upload,
  User,
  X,
} from "lucide-react";
import { useAdminData } from "@/context/admin-data-context";
import { Modal } from "@/components/admin/ui/modal";
import { StatusBadge } from "@/components/admin/ui/badge";
import { PoDocumentPreview } from "@/components/admin/purchase-orders/po-document-preview";
import {
  AttachmentPreviewModal,
  PreviewableAttachment,
} from "@/components/admin/modals/attachment-preview-modal";
import { ViewSupplierInvoiceModal } from "@/components/admin/modals/view-supplier-invoice-modal";
import { formatCurrency, roundFinancial } from "@/lib/financial";
import { getFileCategory } from "@/lib/file-validation";
import { PurchaseOrder, PurchaseOrderSettings } from "@/types/admin";

interface PoDetailsViewProps {
  poId: string;
}

export function PoDetailsView({ poId }: PoDetailsViewProps) {
  const { can, showToast, currentRole, currentUserId, activeUserId, refreshJobs } =
    useAdminData();

  const canView = can("purchaseOrders", "view");
  const canEdit = can("purchaseOrders", "edit");
  const canSubmit = can("purchaseOrders", "submit");
  const canApprove = can("purchaseOrders", "approve");
  const canReject = can("purchaseOrders", "reject");
  const canIssue = can("purchaseOrders", "issue");
  const canCancel = can("purchaseOrders", "cancel");
  const canDownloadExcel = can("purchaseOrders", "downloadExcel") || can("purchaseOrders", "download");
  const canPrint = can("purchaseOrders", "print");
  const canViewHistory = can("purchaseOrders", "viewHistory") || can("purchaseOrders", "view");

  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [settings, setSettings] = useState<PurchaseOrderSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<
    "overview" | "document" | "invoices" | "attachments" | "audit"
  >("overview");

  // Modals
  const [reasonModalAction, setReasonModalAction] = useState<"REJECT" | "CANCEL" | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [actionNotes, setActionNotes] = useState("");
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // Attachment upload & preview
  const [uploadCategory, setUploadCategory] = useState<
    "PO_DOCUMENT" | "SUPPLIER_QUOTATION" | "OTHER"
  >("PO_DOCUMENT");
  const [isUploadingAtt, setIsUploadingAtt] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<PreviewableAttachment | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  const loadPo = useCallback(async () => {
    if (!canView || !poId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      const [poRes, settingsRes] = await Promise.all([
        fetch(`/api/purchase-orders/${poId}`),
        fetch("/api/purchase-orders/settings"),
      ]);
      const poJson = await poRes.json();
      if (!poRes.ok || !poJson.success || !poJson.data) {
        throw new Error(poJson?.error || "Failed to load Purchase Order.");
      }
      setPo(poJson.data);

      const settingsJson = await settingsRes.json().catch(() => null);
      if (settingsJson?.success && settingsJson.data?.settings) {
        setSettings(settingsJson.data.settings);
      }
    } catch (err: any) {
      setError(err?.message || "Purchase Order not found.");
    } finally {
      setIsLoading(false);
    }
  }, [canView, poId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadPo();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadPo]);

  const handleWorkflowAction = async (
    action: "SUBMIT" | "APPROVE" | "REJECT" | "ISSUE" | "CANCEL" | "RETURN_TO_DRAFT",
    reason?: string,
    notes?: string
  ) => {
    if (!po) return;
    setIsProcessingAction(true);
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}/approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reason || null, notes: notes || null }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || `Failed to execute ${action}.`);
      }
      showToast("Workflow Updated", json.message, "success");
      setReasonModalAction(null);
      setActionReason("");
      setActionNotes("");
      await loadPo();
      refreshJobs?.();
    } catch (err: any) {
      showToast("Action Failed", err?.message || "Workflow action failed.", "error");
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleUploadAttachments = async (fileList: FileList | null) => {
    if (!po || !fileList || fileList.length === 0) return;
    setIsUploadingAtt(true);
    try {
      const fd = new FormData();
      fd.append("category", uploadCategory);
      Array.from(fileList).forEach((f) => fd.append("files", f));
      const res = await fetch(`/api/purchase-orders/${po.id}/attachments`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || "Failed to upload attachments.");
      }
      showToast("Attachments Uploaded", json.message, "success");
      await loadPo();
    } catch (err: any) {
      showToast("Upload Error", err?.message || "Attachment upload failed.", "error");
    } finally {
      setIsUploadingAtt(false);
    }
  };

  const handleDeleteAttachment = async (attId: string, fileName: string) => {
    const reason = window.prompt(
      `Enter an audit reason to delete "${fileName}":`,
      "Replaced with updated file"
    );
    if (!reason || !reason.trim()) return;
    try {
      const res = await fetch(
        `/api/purchase-orders/attachments/${attId}?reason=${encodeURIComponent(reason.trim())}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || "Failed to delete attachment.");
      }
      showToast("Attachment Deleted", json.message, "success");
      await loadPo();
    } catch (err: any) {
      showToast("Delete Blocked", err?.message || "Cannot remove attachment.", "error");
    }
  };

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center p-10 bg-white rounded-2xl border border-slate-200 text-center max-w-lg mx-auto mt-8 shadow-xs">
        <div className="h-14 w-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-500 mt-2">
          You do not have permission to view Purchase Orders ({currentRole}).
        </p>
      </div>
    );
  }

  if (isLoading && !po) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-xs font-semibold">Loading Purchase Order details...</p>
      </div>
    );
  }

  if (error || !po) {
    return (
      <div className="max-w-lg mx-auto mt-8 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center space-y-3">
        <AlertTriangle className="h-8 w-8 text-rose-600 mx-auto" />
        <h3 className="text-base font-bold text-rose-900">Purchase Order Not Found</h3>
        <p className="text-xs text-rose-700">{error}</p>
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

  const currencyPrefix = po.currency === "LKR" ? "Rs. " : `${po.currency} `;
  const viewerId = activeUserId || currentUserId;
  const isSelfCreatedNonAdmin =
    po.createdById === viewerId && currentRole !== "admin";
  const activeInvCount = (po.supplierInvoices || []).filter(
    (inv) => inv.status !== "CANCELLED"
  ).length;

  return (
    <div className="space-y-5 text-xs">
      {/* Top Header & Workflow Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-3 border-b border-slate-200">
        <div className="flex items-start gap-3">
          <Link
            href="/admin/purchase-orders/list"
            className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 mt-0.5"
            title="Back to All POs"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold font-mono text-slate-900">{po.poNumber}</h2>
              <StatusBadge status={po.status} />
              {po.isDeleted && (
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                  In Trash
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
              <Link
                href={`/admin/jobs/${po.jobId}`}
                className="font-semibold text-blue-700 hover:underline flex items-center gap-1"
              >
                <Briefcase className="h-3.5 w-3.5" />
                {po.jobCode} — {po.jobName}
              </Link>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5 text-slate-400" />
                {po.supplierName}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <User className="h-3.5 w-3.5 text-slate-400" />
                Created by {po.createdByName || "Admin"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canDownloadExcel && (
            <a
              href={`/api/purchase-orders/${po.id}/export/excel`}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 font-semibold hover:bg-emerald-100"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>Download Excel</span>
            </a>
          )}

          {!po.isDeleted && canEdit && ["DRAFT", "REJECTED"].includes(po.status) && (
            <Link
              href={`/admin/purchase-orders/${po.id}/edit`}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-50"
            >
              <Edit className="h-3.5 w-3.5" />
              <span>Edit PO</span>
            </Link>
          )}

          {!po.isDeleted && canSubmit && ["DRAFT", "REJECTED"].includes(po.status) && (
            <button
              type="button"
              disabled={isProcessingAction}
              onClick={() => handleWorkflowAction("SUBMIT")}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#2563EB] text-white font-semibold hover:bg-[#1d4ed8] cursor-pointer disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Submit for Approval</span>
            </button>
          )}

          {!po.isDeleted && canApprove && po.status === "PENDING" && (
            <button
              type="button"
              disabled={isProcessingAction || isSelfCreatedNonAdmin}
              title={
                isSelfCreatedNonAdmin
                  ? "Segregation of Duties: Non-admin users cannot approve their own PO"
                  : "Approve Purchase Order"
              }
              onClick={() => handleWorkflowAction("APPROVE")}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Approve</span>
            </button>
          )}

          {!po.isDeleted && canReject && po.status === "PENDING" && (
            <button
              type="button"
              disabled={isProcessingAction || isSelfCreatedNonAdmin}
              onClick={() => setReasonModalAction("REJECT")}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-semibold hover:bg-rose-100 cursor-pointer disabled:opacity-40"
            >
              <X className="h-3.5 w-3.5" />
              <span>Reject</span>
            </button>
          )}

          {!po.isDeleted && canIssue && po.status === "APPROVED" && (
            <button
              type="button"
              disabled={isProcessingAction}
              onClick={() => handleWorkflowAction("ISSUE")}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 cursor-pointer disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Mark as Issued</span>
            </button>
          )}

          {!po.isDeleted && canEdit && ["REJECTED", "PENDING"].includes(po.status) && (
            <button
              type="button"
              disabled={isProcessingAction}
              onClick={() => handleWorkflowAction("RETURN_TO_DRAFT")}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 font-semibold hover:bg-amber-100 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Return to Draft</span>
            </button>
          )}

          {!po.isDeleted &&
            canCancel &&
            !["CANCELLED", "DRAFT"].includes(po.status) &&
            activeInvCount === 0 && (
              <button
                type="button"
                disabled={isProcessingAction}
                onClick={() => setReasonModalAction("CANCEL")}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-200 bg-white text-rose-600 font-semibold hover:bg-rose-50 cursor-pointer"
              >
                <Ban className="h-3.5 w-3.5" />
                <span>Cancel PO</span>
              </button>
            )}
        </div>
      </div>

      {/* Rejection / Cancellation / Budget Override Alert Banners */}
      {po.status === "REJECTED" && po.rejectionReason && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 flex items-start gap-2.5 text-rose-900">
          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Purchase Order Rejected by {po.rejectedByName || "Approver"}</p>
            <p className="text-[11px] text-rose-700 mt-0.5">Reason: {po.rejectionReason}</p>
          </div>
        </div>
      )}

      {po.status === "CANCELLED" && po.cancellationReason && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 flex items-start gap-2.5 text-rose-900">
          <Ban className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Purchase Order Cancelled by {po.cancelledByName || "Admin"}</p>
            <p className="text-[11px] text-rose-700 mt-0.5">Reason: {po.cancellationReason}</p>
          </div>
        </div>
      )}

      {po.budgetOverrideApproved && po.budgetOverrideReason && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-center gap-2 text-amber-900">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <span>
            <strong>Budget Override Approved:</strong> {po.budgetOverrideReason}
          </span>
        </div>
      )}

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <span className="text-[11px] text-slate-500">Grand Total ({po.currency})</span>
          <p className="text-xl font-extrabold font-mono text-slate-900 mt-1">
            {formatCurrency(po.grandTotal, { showCurrencyPrefix: true, currencySymbol: currencyPrefix })}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Sub-Total: {formatCurrency(po.subTotal)} • Taxes:{" "}
            {formatCurrency(po.ssclAmount + po.vatAmount)}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <span className="text-[11px] text-slate-500">Invoiced Against PO</span>
          <p className="text-xl font-bold font-mono text-emerald-700 mt-1">
            {formatCurrency(po.invoicedTotal || 0, {
              showCurrencyPrefix: true,
              currencySymbol: currencyPrefix,
            })}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Remaining Unbilled:{" "}
            <strong className="font-mono">
              {formatCurrency(po.remainingUninvoiced ?? po.grandTotal)}
            </strong>
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <span className="text-[11px] text-slate-500">Schedule & Reference</span>
          <p className="font-mono font-bold text-slate-800 mt-1 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            PO Date: {po.poDate}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Exp Delivery: <strong>{po.expectedDeliveryDate || "Not set"}</strong>
          </p>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 overflow-x-auto pb-2">
        {[
          { key: "overview", label: `1. Overview & Items (${po.items?.length || 0})` },
          { key: "document", label: "2. Formal PO Document & Allocation" },
          { key: "invoices", label: `3. Linked Invoices (${po.supplierInvoices?.length || 0})` },
          { key: "attachments", label: `4. Attachments (${po.attachments?.length || 0})` },
          ...(canViewHistory ? [{ key: "audit", label: "5. Approval & Audit Trail" }] : []),
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === tab.key
                ? "bg-[#2563EB] text-white shadow-xs"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW & ITEMS */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-1.5">
              <h4 className="font-bold text-slate-900 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                <Building2 className="h-4 w-4 text-blue-600" />
                Supplier / Vendor Information
              </h4>
              <p className="font-bold text-sm text-slate-900">{po.supplierName}</p>
              <p className="text-slate-600">{po.supplierAddress || "—"}</p>
              <p className="text-slate-500">
                Contact: {po.supplierContactPerson || "—"} • Tel: {po.supplierPhone || "—"}
              </p>
              <p className="text-slate-500">Email: {po.supplierEmail || "—"}</p>
              {po.quotationRef && (
                <p className="text-slate-600">
                  Supplier Quotation Ref: <strong className="font-mono">{po.quotationRef}</strong>
                </p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-1.5">
              <h4 className="font-bold text-slate-900 border-b border-slate-100 pb-2">
                Delivery Destination & Approvals
              </h4>
              <p className="font-bold text-sm text-slate-900">{po.deliverToName}</p>
              <p className="text-slate-600">{po.deliverToAddress}</p>
              {po.deliverToEmail && <p className="text-slate-500">Email: {po.deliverToEmail}</p>}
              <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
                <span>
                  Approved By: <strong>{po.approvedByName || "Pending"}</strong>
                </span>
                {po.issuedByName && (
                  <span>
                    Issued By: <strong>{po.issuedByName}</strong>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 font-bold text-slate-900">
              Line Items & Invoicing Status
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-500 text-[10px] uppercase">
                    <th className="py-2.5 px-3 text-center w-10">#</th>
                    <th className="py-2.5 px-3">Particular</th>
                    <th className="py-2.5 px-3">Brand / Specs</th>
                    <th className="py-2.5 px-3 text-right">Ordered</th>
                    <th className="py-2.5 px-3 text-right">Invoiced</th>
                    <th className="py-2.5 px-3 text-right">Unit Cost</th>
                    <th className="py-2.5 px-3 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(po.items || []).map((it) => (
                    <tr key={it.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 text-center font-mono text-slate-400">
                        {it.rowNumber}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                          <span>{it.particular}</span>
                          {it.isAdditionalItem && (
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200">
                              Additional
                            </span>
                          )}
                        </div>
                        {it.jobCostCategoryName && (
                          <span className="text-[10px] text-blue-700">{it.jobCostCategoryName}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">
                        {[it.brand, it.specifications].filter(Boolean).join(" • ") || "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        {roundFinancial(it.quantity, 2).toFixed(2)} {it.measure}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                        {formatCurrency(it.invoicedAmount)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        {formatCurrency(it.unitCost)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(it.totalAmount, {
                          showCurrencyPrefix: true,
                          currencySymbol: currencyPrefix,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DOCUMENT PREVIEW */}
      {activeTab === "document" && (
        <PoDocumentPreview
          po={po}
          settings={settings}
          canPrint={canPrint}
          canDownloadExcel={canDownloadExcel}
        />
      )}

      {/* TAB 3: LINKED SUPPLIER INVOICES */}
      {activeTab === "invoices" && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h4 className="font-bold text-slate-900">
              Supplier Invoices Linked to {po.poNumber}
            </h4>
            <Link
              href="/admin/invoices"
              className="text-[11px] font-semibold text-blue-600 hover:underline flex items-center gap-1"
            >
              <span>Open Supplier Invoices Module</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          {(po.supplierInvoices || []).length === 0 ? (
            <div className="p-10 text-center text-slate-400">
              <FileText className="h-10 w-10 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold text-slate-600 text-sm">No Supplier Invoices Linked</p>
              <p className="text-xs mt-1">
                Record Supplier Invoices against this Approved/Issued PO inside the Invoices module to update Profit & Loss.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-200 text-[10px] uppercase text-slate-500">
                    <th className="py-2.5 px-3">Invoice No</th>
                    <th className="py-2.5 px-3">Invoice Date</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3">Created By</th>
                    <th className="py-2.5 px-3 text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(po.supplierInvoices || []).map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-bold text-blue-700">
                        {inv.invoiceNumber}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">{inv.invoiceDate}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(inv.totalAmount, { showCurrencyPrefix: true })}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <StatusBadge status={inv.status} />
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{inv.createdByName || "Admin"}</td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedInvoiceId(inv.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-semibold cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: ATTACHMENTS */}
      {activeTab === "attachments" && (
        <div className="space-y-4">
          {canEdit && !po.isDeleted && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value as any)}
                  className="h-9 rounded-lg border border-slate-300 px-2.5 text-xs bg-white font-medium"
                >
                  <option value="PO_DOCUMENT">Signed PO Document</option>
                  <option value="SUPPLIER_QUOTATION">Supplier Quotation</option>
                  <option value="OTHER">Other Supporting File</option>
                </select>
              </div>
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2563EB] text-white font-semibold hover:bg-[#1d4ed8] cursor-pointer">
                {isUploadingAtt ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                <span>Upload Supporting Files</span>
                <input
                  type="file"
                  multiple
                  disabled={isUploadingAtt}
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => {
                    handleUploadAttachments(e.target.files);
                    e.target.value = "";
                  }}
                  className="hidden"
                />
              </label>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            {(po.attachments || []).length === 0 ? (
              <div className="p-10 text-center text-slate-400">
                <Paperclip className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-600 text-sm">No Supporting Files Attached</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {(po.attachments || []).map((att) => (
                  <div
                    key={att.id}
                    className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{att.fileName}</p>
                      <p className="text-[11px] text-slate-500">
                        <span className="font-mono uppercase bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200 mr-2">
                          {att.category}
                        </span>
                        {att.fileSize} • {new Date(att.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewAttachment({
                            name: att.fileName,
                            url: att.fileUrl,
                            category: getFileCategory(att.fileName, att.mimeType || undefined),
                            size: att.fileSize,
                          })
                        }
                        className="p-1.5 rounded-lg text-slate-600 hover:text-blue-700 hover:bg-blue-50 cursor-pointer"
                        title="Preview File"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <a
                        href={`${att.fileUrl}?action=download`}
                        className="p-1.5 rounded-lg text-slate-600 hover:text-emerald-700 hover:bg-emerald-50"
                        title="Download File"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => handleDeleteAttachment(att.id, att.fileName)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                          title="Delete File"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: APPROVAL & AUDIT TRAIL */}
      {activeTab === "audit" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Approval History ({po.approvalHistory?.length || 0})
            </div>
            <div className="divide-y divide-slate-100">
              {(po.approvalHistory || []).length === 0 ? (
                <div className="p-6 text-center text-slate-400">No approval transitions yet.</div>
              ) : (
                (po.approvalHistory || []).map((h) => (
                  <div key={h.id} className="px-4 py-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">{h.action}</span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {new Date(h.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      {h.previousStatus} → <strong>{h.newStatus}</strong> • By{" "}
                      <strong>{h.userName || "System"}</strong>
                    </p>
                    {(h.reason || h.notes) && (
                      <p className="text-[11px] text-slate-500 italic">
                        {h.reason || h.notes}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 font-bold text-slate-900 flex items-center gap-2">
              <History className="h-4 w-4 text-blue-600" />
              Audit Activity Log ({po.auditLogs?.length || 0})
            </div>
            <div className="divide-y divide-slate-100">
              {(po.auditLogs || []).length === 0 ? (
                <div className="p-6 text-center text-slate-400">No audit logs recorded.</div>
              ) : (
                (po.auditLogs || []).map((log) => (
                  <div key={log.id} className="px-4 py-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] font-bold text-blue-700">
                        {log.action}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      By <strong>{log.userName || "System"}</strong>
                      {log.reason ? ` — ${log.reason}` : ""}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* REJECT / CANCEL MANDATORY REASON MODAL */}
      <Modal
        isOpen={reasonModalAction !== null}
        onClose={() => {
          setReasonModalAction(null);
          setActionReason("");
          setActionNotes("");
        }}
        title={
          reasonModalAction === "REJECT"
            ? `Reject Purchase Order — ${po.poNumber}`
            : `Cancel Purchase Order — ${po.poNumber}`
        }
        maxWidth="md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!reasonModalAction || !actionReason.trim()) return;
            handleWorkflowAction(reasonModalAction, actionReason.trim(), actionNotes.trim());
          }}
          className="space-y-3 text-xs"
        >
          <p className="text-slate-600">
            {reasonModalAction === "REJECT"
              ? "Provide a mandatory rejection reason so the creator can revise and resubmit the PO."
              : "Cancelling a Purchase Order releases its committed budget from the linked Job. Provide a mandatory reason."}
          </p>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Mandatory Reason *
            </label>
            <textarea
              rows={3}
              required
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              placeholder={
                reasonModalAction === "REJECT"
                  ? "Explain required pricing, item, or vendor corrections..."
                  : "Reason for cancelling this Purchase Order..."
              }
              className="w-full rounded-lg border border-slate-300 p-2.5 text-xs"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setReasonModalAction(null)}
              className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isProcessingAction || !actionReason.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700 disabled:opacity-50"
            >
              {isProcessingAction && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>
                {reasonModalAction === "REJECT" ? "Confirm Rejection" : "Confirm Cancellation"}
              </span>
            </button>
          </div>
        </form>
      </Modal>

      {/* ATTACHMENT PREVIEW MODAL */}
      <AttachmentPreviewModal
        isOpen={Boolean(previewAttachment)}
        onClose={() => setPreviewAttachment(null)}
        attachment={previewAttachment}
      />

      {/* VIEW SUPPLIER INVOICE MODAL */}
      {selectedInvoiceId && (
        <ViewSupplierInvoiceModal
          isOpen={true}
          onClose={() => setSelectedInvoiceId(null)}
          invoiceId={selectedInvoiceId}
          onStatusChange={loadPo}
        />
      )}
    </div>
  );
}
