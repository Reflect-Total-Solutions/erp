"use client";

import React, { useState } from "react";
import { Modal } from "@/components/admin/ui/modal";
import { StatusBadge } from "@/components/admin/ui/badge";
import { CustomerInvoice } from "@/types/admin";
import { formatCurrency } from "@/lib/financial";
import {
  FileText,
  Building,
  Calendar,
  Printer,
  Download,
  RotateCcw,
  Clock,
  History,
  CheckCircle,
  AlertTriangle,
  Loader2,
  DollarSign,
  ShieldAlert,
} from "lucide-react";

interface ViewInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: CustomerInvoice | null;
  onInvoiceUpdated: (updated: CustomerInvoice) => void;
  currentRole: string;
}

export function ViewInvoiceModal({
  isOpen,
  onClose,
  invoice,
  onInvoiceUpdated,
  currentRole,
}: ViewInvoiceModalProps) {
  const [activeTab, setActiveTab] = useState<"preview" | "revisions">("preview");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [regenReason, setRegenReason] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  if (!invoice) return null;

  const isAdmin = currentRole.toLowerCase() === "admin";
  const itemsSnapshot = invoice.itemsSnapshot || {};
  const categories = itemsSnapshot.categories || [];
  const costSummary = invoice.costSummarySnapshot || {};
  const revisions = invoice.revisions || [];

  const handleExecuteRegenerate = async () => {
    if (!regenReason.trim()) {
      setErrorMsg("Please enter a mandatory regeneration reason for the audit log.");
      return;
    }

    setIsRegenerating(true);
    setErrorMsg("");

    try {
      const res = await fetch(`/api/invoices/${invoice.id}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: regenReason.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to regenerate invoice.");
      }

      setShowRegenConfirm(false);
      setRegenReason("");
      onInvoiceUpdated(json.data);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to regenerate invoice.");
    } finally {
      setIsRegenerating(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Customer Billing Invoice: ${invoice.invoiceNumber} (v${invoice.version})`}
      maxWidth="4xl"
    >
      <div className="space-y-4">
        {/* Top Action / Nav Bar */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("preview")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "preview"
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Invoice Document
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("revisions")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === "revisions"
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <History className="h-3.5 w-3.5" />
              <span>Version History ({revisions.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
            >
              <Printer className="h-3.5 w-3.5 text-slate-500" />
              <span>Print</span>
            </button>

            {isAdmin && !showRegenConfirm && (
              <button
                type="button"
                onClick={() => setShowRegenConfirm(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-xs font-bold text-amber-800 hover:bg-amber-100 transition-colors shadow-2xs"
                title="Regenerate/Reissue this invoice from latest job costing"
              >
                <RotateCcw className="h-3.5 w-3.5 text-amber-600" />
                <span>Regenerate (Admin)</span>
              </button>
            )}
          </div>
        </div>

        {/* Admin Regeneration Dialog */}
        {showRegenConfirm && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-3 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                  Controlled Invoice Regeneration (Admin Only)
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowRegenConfirm(false)}
                className="text-slate-400 hover:text-slate-600 text-xs"
              >
                Cancel
              </button>
            </div>

            <p className="text-xs text-amber-800 leading-relaxed">
              This action will recalculate the invoice using the latest Job costing details and increment the version from{" "}
              <strong>v{invoice.version}</strong> to <strong>v{invoice.version + 1}</strong>. The current version will be{" "}
              <strong>preserved immutably in the revision history</strong>.
            </p>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-amber-950">
                Reason for Regeneration / Correction <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={regenReason}
                onChange={(e) => setRegenReason(e.target.value)}
                placeholder="Enter audit reason (e.g. Rate revision for client, tax rate adjustment, additional line item added)..."
                rows={2}
                className="w-full text-xs rounded-lg border border-amber-300 p-2 bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            {errorMsg && <p className="text-xs text-rose-600 font-semibold">{errorMsg}</p>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowRegenConfirm(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isRegenerating}
                onClick={handleExecuteRegenerate}
                className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-2xs flex items-center gap-1.5 disabled:opacity-50"
              >
                {isRegenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                <span>Authorize & Regenerate to v{invoice.version + 1}</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 1: PREVIEW */}
        {activeTab === "preview" && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs space-y-6 print:border-none print:p-0">
            {/* Header: Company & Invoice Info */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-5 border-b border-slate-200">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                  REFLECT TOTAL SOLUTIONS (PVT) LTD
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Commercial Brand Activation & Production Management
                </p>
                <p className="text-xs text-slate-500">Colombo, Sri Lanka</p>
              </div>

              <div className="text-right space-y-1">
                <span className="text-lg font-black font-mono text-blue-700 block">
                  {invoice.invoiceNumber}
                </span>
                <div className="flex items-center justify-end gap-1.5">
                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                    Version {invoice.version}
                  </span>
                  <StatusBadge status={invoice.status} />
                </div>
              </div>
            </div>

            {/* Bill To & Project Reference */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Billed To (Client)
                </span>
                <strong className="text-sm text-slate-900 block">{invoice.clientName}</strong>
                {invoice.clientAddress && <p className="text-slate-600">{invoice.clientAddress}</p>}
                {invoice.clientEmail && <p className="text-slate-500">{invoice.clientEmail}</p>}
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1 text-right">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Project Reference
                </span>
                <strong className="text-slate-900 font-mono block">
                  Job: {invoice.job?.jobCode || "JOB"}
                </strong>
                <p className="text-slate-700 truncate">{invoice.job?.name}</p>
                <p className="text-slate-500">Invoice Date: {invoice.issueDate}</p>
                {invoice.dueDate && <p className="text-slate-500">Due Date: {invoice.dueDate}</p>}
              </div>
            </div>

            {/* Itemized Categories Table */}
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 w-10 text-center">#</th>
                    <th className="px-3 py-2">Item Description</th>
                    <th className="px-2 py-2 w-16 text-center">RC/NRC</th>
                    <th className="px-3 py-2 w-16 text-right">Qty</th>
                    <th className="px-3 py-2 w-28 text-right">Rate (Rs.)</th>
                    <th className="px-4 py-2 w-32 text-right">Total Cost (Rs.)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {categories.map((cat: any, catIdx: number) => (
                    <React.Fragment key={cat.id || catIdx}>
                      <tr className="bg-slate-50/70 font-bold text-slate-800">
                        <td colSpan={5} className="px-3 py-1.5 uppercase text-[11px]">
                          📁 {cat.name}
                        </td>
                        <td className="px-4 py-1.5 text-right font-mono text-slate-900">
                          {formatCurrency(cat.subtotal, { showCurrencyPrefix: true })}
                        </td>
                      </tr>
                      {(cat.items || []).map((item: any, itemIdx: number) => (
                        <tr key={item.id || itemIdx} className="hover:bg-slate-50/50">
                          <td className="px-3 py-2 text-center text-slate-400 font-mono text-[11px]">
                            {item.itemNumber || itemIdx + 1}
                          </td>
                          <td className="px-3 py-2 font-medium text-slate-800">{item.description}</td>
                          <td className="px-2 py-2 text-center">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                              {item.rcNrc || "NRC"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-slate-600">{item.quantity}</td>
                          <td className="px-3 py-2 text-right font-mono text-slate-600">
                            {formatCurrency(item.rate, { showCurrencyPrefix: false })}
                          </td>
                          <td className="px-4 py-2 text-right font-mono font-semibold text-slate-900">
                            {formatCurrency(item.totalCost, { showCurrencyPrefix: false })}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Financial Summary Recapitulation */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pt-2">
              <div className="text-xs text-slate-500 space-y-1.5 max-w-sm">
                {invoice.notes && (
                  <div>
                    <strong className="text-slate-700 block">Notes:</strong>
                    <p className="whitespace-pre-wrap">{invoice.notes}</p>
                  </div>
                )}
                {invoice.terms && (
                  <div>
                    <strong className="text-slate-700 block">Terms & Conditions:</strong>
                    <p>{invoice.terms}</p>
                  </div>
                )}
              </div>

              <div className="w-full sm:w-72 rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Grand Total Before Tax:</span>
                  <span className="font-semibold text-slate-900 font-mono">
                    {formatCurrency(invoice.subTotal, { showCurrencyPrefix: true })}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>
                    {invoice.taxType || "SSCL"} ({invoice.taxRate || 2.5}%):
                  </span>
                  <span className="font-semibold text-slate-900 font-mono">
                    {formatCurrency(invoice.taxAmount, { showCurrencyPrefix: true })}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-extrabold text-blue-900">
                  <span>Final Grand Total:</span>
                  <span className="font-mono">
                    {formatCurrency(invoice.grandTotal, { showCurrencyPrefix: true })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: REVISION HISTORY */}
        {activeTab === "revisions" && (
          <div className="space-y-3">
            {revisions.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 bg-white rounded-xl border border-slate-200">
                This is the original invoice version (Version 1). No previous revisions exist.
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  Complete audit history of previous invoice versions. Archived immutably upon admin regeneration.
                </p>

                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden max-h-96 overflow-y-auto">
                  {revisions.map((rev) => (
                    <div key={rev.id} className="p-4 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[11px]">
                            Version {rev.version}
                          </span>
                          <span className="text-slate-500 font-mono text-[11px]">
                            Invoice #: {rev.previousInvoiceNumber}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {new Date(rev.createdAt).toLocaleString()}
                        </span>
                      </div>

                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-1">
                        <strong className="text-slate-700 block">Regeneration Reason:</strong>
                        <p className="text-slate-600 italic">&quot;{rev.reason}&quot;</p>
                        <p className="text-[10px] text-slate-400 pt-1">
                          Authorized by: <strong>{rev.regeneratedByName || "Administrator"}</strong>
                        </p>
                      </div>

                      {rev.snapshot && (
                        <div className="flex items-center gap-4 text-[11px] text-slate-500">
                          <span>
                            Archived Subtotal:{" "}
                            <strong className="text-slate-800">
                              {formatCurrency(rev.snapshot.subTotal || 0, { showCurrencyPrefix: true })}
                            </strong>
                          </span>
                          <span>
                            Archived Grand Total:{" "}
                            <strong className="text-blue-700 font-bold">
                              {formatCurrency(rev.snapshot.grandTotal || 0, { showCurrencyPrefix: true })}
                            </strong>
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-200">
          <span className="text-[11px] text-slate-400">
            Created by {invoice.createdByName || "System"} on {invoice.createdAt.split("T")[0]}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
