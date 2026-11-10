"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/admin/ui/modal";
import { formatCurrency } from "@/lib/financial";
import { SupplierInvoice } from "@/types/admin";
import { downloadSingleInvoiceZip } from "@/lib/bulk-download";
import {
  FileText,
  Building2,
  Briefcase,
  Calendar,
  User,
  Download,
  AlertTriangle,
  RotateCcw,
  History,
  CheckCircle2,
  Ban,
  Clock,
  Layers,
  Loader2,
  ExternalLink,
  Eye,
  Trash2,
  Image as ImageIcon,
  Edit,
  ShoppingCart,
} from "lucide-react";
import { getFileCategory, FileCategory } from "@/lib/file-validation";
import {
  AttachmentPreviewModal,
  PreviewableAttachment,
} from "@/components/admin/modals/attachment-preview-modal";

interface ViewSupplierInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice?: SupplierInvoice | null;
  invoiceId?: string | null;
  onCancelInvoice?: (invoiceId: string, reason: string) => Promise<boolean>;
  onStatusChange?: () => void;
  onEditInvoice?: (invoice: SupplierInvoice) => void;
  isAdmin?: boolean;
}

export function ViewSupplierInvoiceModal({
  isOpen,
  onClose,
  invoice: propInvoice,
  invoiceId,
  onCancelInvoice,
  onStatusChange,
  onEditInvoice,
  isAdmin = true,
}: ViewSupplierInvoiceModalProps) {
  const [fetchedInvoice, setFetchedInvoice] = useState<SupplierInvoice | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [isProcessingCancel, setIsProcessingCancel] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [isZipping, setIsZipping] = useState(false);
  const [activeTab, setActiveTab] = useState<"items" | "history">("items");
  const [previewAttachment, setPreviewAttachment] = useState<PreviewableAttachment | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isRemovingAttachmentId, setIsRemovingAttachmentId] = useState<string | null>(null);

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
      setFetchedInvoice((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          attachments: (prev.attachments || []).filter((a) => a.id !== attachmentId),
          items: (prev.items || []).map((it) => ({
            ...it,
            attachments: (it.attachments || []).filter((a) => a.id !== attachmentId),
          })),
        };
      });
      onStatusChange?.();
    } catch (err: any) {
      alert(err.message || "Failed to remove attachment.");
    } finally {
      setIsRemovingAttachmentId(null);
    }
  };

  React.useEffect(() => {
    if (propInvoice) {
      setFetchedInvoice(propInvoice);
    } else if (invoiceId && isOpen) {
      setIsLoading(true);
      fetch(`/api/supplier-invoices/${invoiceId}`)
        .then((res) => res.json())
        .then((json) => {
          if (json.success && json.data) {
            setFetchedInvoice(json.data);
          }
        })
        .catch((err) => console.error("Error loading invoice:", err))
        .finally(() => setIsLoading(false));
    }
  }, [propInvoice, invoiceId, isOpen]);

  const invoice = fetchedInvoice || propInvoice;

  if (!isOpen) return null;

  if (isLoading) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Loading Supplier Invoice..." maxWidth="3xl">
        <div className="py-12 flex flex-col items-center justify-center space-y-3 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-xs font-semibold">Retrieving invoice details & attachments...</p>
        </div>
      </Modal>
    );
  }

  if (!invoice) return null;

  const isCancelled = invoice.status === "CANCELLED";

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
        setFetchedInvoice((prev) =>
          prev ? { ...prev, status: "CANCELLED", cancellationReason: cancelReason.trim() } : null
        );
        onStatusChange?.();
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
      maxWidth="4xl"
    >
      <div className="space-y-5 text-xs">
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
                  Cancelled by {invoice.cancelledByName || "Admin"} on {new Date(invoice.cancelledAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Top Header Card */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-md">
                {invoice.invoiceNumber}
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  isCancelled
                    ? "bg-rose-100 text-rose-700 border border-rose-200"
                    : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                }`}
              >
                {invoice.status}
              </span>
            </div>

            <div className="mt-3 space-y-1.5 text-slate-600 text-[11px]">
              <div className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="font-semibold text-slate-800">
                  {invoice.supplierName || "Supplier"}
                </span>
                {invoice.supplierCode && (
                  <span className="font-mono text-[10px] text-slate-500 bg-slate-200/70 px-1.5 rounded">
                    {invoice.supplierCode}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span>
                  Job: <strong className="text-slate-800">{invoice.jobCode}</strong> • {invoice.jobName}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span>Invoice Date: <strong>{invoice.invoiceDate}</strong></span>
              </div>

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
              <span className="text-[11px] text-slate-400 block font-medium">Total Recorded Expense</span>
              <span className="text-2xl font-extrabold text-slate-900 font-mono">
                {formatCurrency(invoice.totalAmount, { showCurrencyPrefix: true })}
              </span>
            </div>

            <div className="text-left md:text-right text-[11px] text-slate-500 mt-2 space-y-0.5">
              <p>
                <span className="text-slate-400">Created:</span>{" "}
                <span className="font-medium text-slate-700">{invoice.createdByName || "System Admin"}</span>
                {invoice.createdAt && (
                  <span className="text-slate-400 text-[10px] ml-1 font-mono">
                    ({new Date(invoice.createdAt).toLocaleString()})
                  </span>
                )}
              </p>
              {(invoice.updatedByName || invoice.updatedAt) && (
                <p>
                  <span className="text-slate-400">Last Modified:</span>{" "}
                  <span className="font-medium text-slate-700">{invoice.updatedByName || "System"}</span>
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

        {/* Tab Controls */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("items")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "items"
                ? "bg-blue-600 text-white shadow-2xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Invoice Items & Attachments ({invoice.items?.length || 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "history"
                ? "bg-blue-600 text-white shadow-2xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Audit History ({invoice.auditLogs?.length || 0})
          </button>
        </div>

        {/* TAB 1: Items & Attachments */}
        {activeTab === "items" && (
          <div className="space-y-4">
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100/80 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <th className="py-2.5 px-3 w-12 text-center">Row</th>
                    <th className="py-2.5 px-3 min-w-[180px]">Description</th>
                    <th className="py-2.5 px-3 min-w-[280px]">Attached Documents (PDF, Word, Images)</th>
                    <th className="py-2.5 px-3 w-36 text-right">Amount (Rs.)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {(invoice.items || []).map((item, idx) => {
                    const rowAttachments =
                      (item.attachments && item.attachments.length > 0)
                        ? item.attachments
                        : (invoice.attachments || []).filter((a) => a.itemId === item.id);

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/70 transition-colors align-top">
                        <td className="py-3 px-3 text-center font-mono font-bold text-slate-400">
                          {item.rowNumber || idx + 1}
                        </td>
                        <td className="py-3 px-3">
                          <p className="font-semibold text-slate-900">{item.description}</p>
                          {(item.quantity != null || item.purchaseOrderItemId) && (
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              {item.purchaseOrderItemId && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  PO Line Item
                                </span>
                              )}
                              {item.quantity != null && (
                                <span className="text-[10px] font-mono text-slate-500">
                                  Qty: {item.quantity}
                                </span>
                              )}
                            </div>
                          )}
                          {item.notes && (
                            <p className="text-[11px] text-slate-400 mt-0.5">{item.notes}</p>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {rowAttachments.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {rowAttachments.map((doc) => {
                                const category = getFileCategory(doc.fileName, doc.fileType || undefined);
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
                                    {/* Thumbnail for image, icon for others */}
                                    {isImage ? (
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

                                    {/* Preview, Download & Delete Actions */}
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

                                      {isAdmin && !isCancelled && (
                                        <button
                                          type="button"
                                          disabled={isRemovingAttachmentId === doc.id}
                                          onClick={() => handleRemoveAttachment(doc.id, doc.fileName)}
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
                            <span className="text-slate-400 italic text-[11px]">No attachments recorded</span>
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
                    <td colSpan={3} className="py-3 px-3 text-right">
                      Total Invoice Amount:
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-sm text-emerald-700">
                      {formatCurrency(invoice.totalAmount, { showCurrencyPrefix: true })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Quick Attachment Downloads (Multi-format ZIP) */}
            {invoice.attachments && invoice.attachments.length > 0 && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50/70 border border-blue-200">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-700" />
                  <span className="font-semibold text-blue-900 text-xs">
                    {invoice.attachments.length} Total Attachment{invoice.attachments.length === 1 ? "" : "s"} (PDF, Word, Images) Available
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

        {/* TAB 2: History & Audit Logs */}
        {activeTab === "history" && (
          <div className="space-y-3 p-3 rounded-xl bg-slate-50 border border-slate-200 max-h-64 overflow-y-auto">
            {invoice.auditLogs && invoice.auditLogs.length > 0 ? (
              invoice.auditLogs.map((log) => (
                <div key={log.id} className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs space-y-1">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-blue-700 uppercase tracking-wider text-[10px] font-bold">
                      {log.action}
                    </span>
                    <span className="text-slate-400 text-[10px]">{log.createdAt}</span>
                  </div>
                  <p className="text-slate-700">{log.reason || "Invoice state recorded."}</p>
                  <p className="text-slate-400 text-[10px]">Performed by: {log.userName || "System Admin"}</p>
                </div>
              ))
            ) : (
              <p className="text-center text-slate-400 py-6">No previous audit revisions recorded for this invoice.</p>
            )}
          </div>
        )}

        {/* Cancellation Reason Modal Dialog */}
        {isCancelDialogOpen && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-300 space-y-3">
            <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
              <AlertTriangle className="h-4 w-4 text-rose-600" />
              <span>Confirm Invoice Cancellation & Cost Reversal</span>
            </div>
            <p className="text-[11px] text-rose-700 leading-relaxed">
              Cancelling this invoice will immediately deduct{" "}
              <strong>{formatCurrency(invoice.totalAmount, { showCurrencyPrefix: true })}</strong> from the linked
              Job's actual costs and restore the remaining job budget. This action is permanently audited.
            </p>

            <textarea
              rows={2}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Mandatory cancellation reason (e.g. Billed to wrong job, duplicate receipt, supplier issued credit note)..."
              className="w-full p-2.5 rounded-lg border border-rose-300 bg-white text-xs text-slate-900 outline-none focus:ring-2 focus:ring-rose-500"
            />

            {cancelError && (
              <p className="text-[10px] text-rose-700 font-bold">{cancelError}</p>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCancelDialogOpen(false)}
                className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-200 text-xs font-semibold"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={handleExecuteCancel}
                disabled={isProcessingCancel || !cancelReason.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors disabled:opacity-50"
              >
                {isProcessingCancel ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Ban className="h-3.5 w-3.5" />
                )}
                <span>{isProcessingCancel ? "Cancelling Invoice & Recalculating..." : "Confirm Cancellation"}</span>
              </button>
            </div>
          </div>
        )}

        {/* Modal Footer Controls */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200">
          <div className="flex items-center gap-2">
            {isAdmin && !isCancelled && !isCancelDialogOpen && (
              <>
                <button
                  type="button"
                  onClick={() => setIsCancelDialogOpen(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-xs font-semibold transition-colors"
                  title="Cancel or reverse this supplier invoice"
                >
                  <Ban className="h-3.5 w-3.5 text-rose-600" />
                  <span>Cancel / Void Invoice</span>
                </button>
                {onEditInvoice && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onEditInvoice(invoice);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-xs font-semibold transition-colors"
                    title="Edit invoice items, attachments, and amounts"
                  >
                    <Edit className="h-3.5 w-3.5 text-blue-600" />
                    <span>Edit Invoice</span>
                  </button>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Attachment Preview Modal */}
      <AttachmentPreviewModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        attachment={previewAttachment}
      />
    </Modal>
  );
}
