"use client";

import React, { useState, useMemo } from "react";
import { Modal } from "@/components/admin/ui/modal";
import { Job, SupplierInvoice } from "@/types/admin";
import { formatCurrency } from "@/lib/financial";
import { StatusBadge } from "@/components/admin/ui/badge";
import {
  Receipt,
  Building2,
  Calendar,
  User,
  Paperclip,
  Eye,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Ban,
  DollarSign,
  ArrowRight,
  Download,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import {
  AttachmentPreviewModal,
  PreviewableAttachment,
} from "@/components/admin/modals/attachment-preview-modal";
import { getFileCategory } from "@/lib/file-validation";

interface JobSupplierInvoicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: Job | null;
  onViewInvoiceDetails?: (invoice: any) => void;
  onCreateInvoice?: (jobId: string) => void;
}

export function JobSupplierInvoicesModal({
  isOpen,
  onClose,
  job,
  onViewInvoiceDetails,
  onCreateInvoice,
}: JobSupplierInvoicesModalProps) {
  const [search, setSearch] = useState("");
  const [previewAttachment, setPreviewAttachment] = useState<PreviewableAttachment | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const supplierInvoices = useMemo(() => {
    return (job?.supplierInvoices || []) as any[];
  }, [job]);

  const activeInvoices = useMemo(() => {
    return supplierInvoices.filter((inv) => inv.status !== "CANCELLED");
  }, [supplierInvoices]);

  const totalInvoicedAmount = useMemo(() => {
    return activeInvoices.reduce((sum, inv) => sum + (Number(inv.totalAmount) || 0), 0);
  }, [activeInvoices]);

  const approvedJobValue = Number(job?.grandTotal || job?.totalCost || 0);
  const remainingBudget = approvedJobValue - totalInvoicedAmount;

  const filteredInvoices = useMemo(() => {
    if (!search.trim()) return supplierInvoices;
    const q = search.toLowerCase();
    return supplierInvoices.filter(
      (inv) =>
        inv.invoiceNumber.toLowerCase().includes(q) ||
        (inv.supplierName && inv.supplierName.toLowerCase().includes(q)) ||
        (inv.supplierCode && inv.supplierCode.toLowerCase().includes(q)) ||
        (inv.createdByName && inv.createdByName.toLowerCase().includes(q)) ||
        (inv.status && inv.status.toLowerCase().includes(q))
    );
  }, [supplierInvoices, search]);

  const handlePreviewAttachment = (att: any, invNumber: string) => {
    const category = getFileCategory(att.fileName, att.fileType);
    setPreviewAttachment({
      name: att.fileName,
      url: att.fileUrl,
      category,
      size: att.fileSize,
      description: `Invoice: ${invNumber}`,
    });
    setIsPreviewOpen(true);
  };

  if (!job) return null;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`Supplier Invoices — ${job.name} (${job.jobCode || "NO-CODE"})`}
        maxWidth="4xl"
      >
        <div className="space-y-4">
          {/* Header Banner */}
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-blue-100 text-blue-700">
                <Receipt className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900">{job.name}</span>
                  {job.jobCode && (
                    <span className="text-[11px] font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {job.jobCode}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 font-normal mt-0.5">
                  {job.clientName ? `Client: ${job.clientName}` : "General Client Project"} • Job Date: {job.date}
                </p>
              </div>
            </div>
            <StatusBadge status={job.status} />
          </div>
          {/* Key Financial Metrics Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                Active Invoices
              </span>
              <span className="text-lg font-bold text-slate-900 mt-0.5 block">
                {activeInvoices.length}
              </span>
              <span className="text-[10px] text-slate-500">
                {supplierInvoices.length - activeInvoices.length > 0
                  ? `(${supplierInvoices.length - activeInvoices.length} cancelled)`
                  : "All active"}
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                Total Invoiced Cost
              </span>
              <span className="text-lg font-bold text-blue-600 mt-0.5 block truncate">
                {formatCurrency(totalInvoicedAmount, { showCurrencyPrefix: true })}
              </span>
              <span className="text-[10px] text-slate-500">Active bills total</span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                Approved Budget
              </span>
              <span className="text-lg font-bold text-slate-800 mt-0.5 block truncate">
                {formatCurrency(approvedJobValue, { showCurrencyPrefix: true })}
              </span>
              <span className="text-[10px] text-slate-500">Quotation value</span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                Remaining Budget
              </span>
              <span
                className={`text-lg font-bold mt-0.5 block truncate ${
                  remainingBudget >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {formatCurrency(remainingBudget, { showCurrencyPrefix: true })}
              </span>
              <span className="text-[10px] text-slate-500">
                {remainingBudget >= 0 ? "Within Budget" : "Budget Overrun"}
              </span>
            </div>
          </div>

          {/* Search & Actions Bar */}
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search reference, supplier, status..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {onCreateInvoice && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onCreateInvoice(job.id);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-xs shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Record New Invoice</span>
              </button>
            )}
          </div>

          {/* Invoices List / Table */}
          {filteredInvoices.length === 0 ? (
            <div className="text-center py-12 px-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <Receipt className="mx-auto h-9 w-9 text-slate-300 mb-2" />
              <h3 className="text-sm font-semibold text-slate-700">No Supplier Invoices Found</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                {search
                  ? "No invoices match your search keyword. Try a different query."
                  : "No supplier invoices have been recorded against this job yet."}
              </p>
              {onCreateInvoice && !search && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onCreateInvoice(job.id);
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create First Supplier Invoice</span>
                </button>
              )}
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[380px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="px-3.5 py-2.5">Invoice Ref</th>
                    <th className="px-3.5 py-2.5">Supplier</th>
                    <th className="px-3.5 py-2.5">Date</th>
                    <th className="px-3.5 py-2.5 text-right">Amount</th>
                    <th className="px-3 py-2.5 text-center">Files</th>
                    <th className="px-3.5 py-2.5">Created By</th>
                    <th className="px-3.5 py-2.5 text-center">Status</th>
                    <th className="px-3.5 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInvoices.map((inv) => {
                    const isCancelled = inv.status === "CANCELLED";
                    const attachmentsCount = inv.attachmentsCount || (inv.attachments || []).length;

                    return (
                      <tr
                        key={inv.id}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          isCancelled ? "bg-rose-50/20 opacity-75" : ""
                        }`}
                      >
                        <td className="px-3.5 py-2.5 font-mono font-semibold text-slate-900">
                          {inv.invoiceNumber}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <span className="font-semibold text-slate-800 block">
                            {inv.supplierName}
                          </span>
                          {inv.supplierCode && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              {inv.supplierCode}
                            </span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 text-slate-600 whitespace-nowrap">
                          {inv.invoiceDate || "—"}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-semibold whitespace-nowrap">
                          <span className={isCancelled ? "line-through text-slate-400" : "text-slate-900"}>
                            {formatCurrency(inv.totalAmount || 0, { showCurrencyPrefix: true })}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {attachmentsCount > 0 ? (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold text-[10px] border border-blue-200"
                              title={`${attachmentsCount} attachment file(s)`}
                            >
                              <Paperclip className="h-3 w-3" />
                              {attachmentsCount}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-[11px]">—</span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 text-slate-600">
                          <span className="block">{inv.createdByName || "System Admin"}</span>
                          {inv.createdAt && (
                            <span className="text-[10px] text-slate-400">{inv.createdAt}</span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 text-center">
                          {isCancelled ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 font-semibold text-[10px] border border-rose-200">
                              <Ban className="h-2.5 w-2.5" />
                              Cancelled
                            </span>
                          ) : inv.status === "PAID" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold text-[10px] border border-emerald-200">
                              <CheckCircle2 className="h-2.5 w-2.5" />
                              Paid
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold text-[10px] border border-blue-200">
                              <Clock className="h-2.5 w-2.5" />
                              Approved
                            </span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {onViewInvoiceDetails && (
                              <button
                                type="button"
                                onClick={() => {
                                  onViewInvoiceDetails(inv);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition-colors"
                                title="View Full Invoice Details"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                <span>Details</span>
                              </button>
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

          {/* Modal Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <span className="text-xs text-slate-500">
              Showing {filteredInvoices.length} of {supplierInvoices.length} total invoice records
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-semibold text-xs transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>

      {/* Attachment Preview Modal */}
      <AttachmentPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false);
          setPreviewAttachment(null);
        }}
        attachment={previewAttachment}
      />
    </>
  );
}
