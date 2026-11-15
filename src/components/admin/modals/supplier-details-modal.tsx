"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Modal } from "@/components/admin/ui/modal";
import { StatusBadge } from "@/components/admin/ui/badge";
import { useAdminData } from "@/context/admin-data-context";
import { formatCurrency } from "@/lib/financial";
import { SupplierInvoice, SupplierPayment } from "@/types/admin";
import { getFileCategory } from "@/lib/file-validation";
import {
  AttachmentPreviewModal,
  PreviewableAttachment,
} from "@/components/admin/modals/attachment-preview-modal";
import { ViewSupplierInvoiceModal } from "@/components/admin/modals/view-supplier-invoice-modal";
import { MakeSupplierPaymentModal } from "@/components/admin/modals/make-supplier-payment-modal";
import {
  AlertTriangle,
  Building2,
  CreditCard,
  Download,
  Eye,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Receipt,
  User,
} from "lucide-react";

interface SupplierDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplierId: string | null;
  onPaymentChanged?: () => void;
}

interface SupplierDetailsResponse {
  id: string;
  code: string;
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  isActive: boolean;
  summary: {
    invoiceCount: number;
    totalBilled: number;
    totalPaid: number;
    outstandingBalance: number;
    overdueInvoiceCount: number;
    overdueBalance: number;
    paymentCount: number;
  };
  invoices: Array<SupplierInvoice & { jobCode?: string; jobName?: string }>;
  payments: SupplierPayment[];
}

export function SupplierDetailsModal({
  isOpen,
  onClose,
  supplierId,
  onPaymentChanged,
}: SupplierDetailsModalProps) {
  const { can } = useAdminData();
  const canCreatePayment = can("supplierPayments", "create");

  const [fetchedState, setFetchedState] = useState<{
    supplierId: string;
    requestKey: string;
    data: SupplierDetailsResponse | null;
    error: string;
  } | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [activeTab, setActiveTab] = useState<"invoices" | "payments">("invoices");

  const [viewingInvoiceId, setViewingInvoiceId] = useState<string | null>(null);
  const [payingInvoice, setPayingInvoice] = useState<SupplierInvoice | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<PreviewableAttachment | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const requestKey = isOpen && supplierId ? `${supplierId}:${refreshTick}` : "";

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      setActiveTab("invoices");
      setViewingInvoiceId(null);
      setPayingInvoice(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, supplierId]);

  useEffect(() => {
    if (!requestKey || !supplierId) return;
    let cancelled = false;
    fetch(`/api/suppliers/${supplierId}`)
      .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        if (cancelled) return;
        if (!ok || !json.success) {
          setFetchedState({
            supplierId,
            requestKey,
            data: null,
            error: json?.error || "Failed to load supplier financial profile.",
          });
        } else {
          setFetchedState({
            supplierId,
            requestKey,
            data: json.data,
            error: "",
          });
        }
      })
      .catch((err: any) => {
        if (cancelled) return;
        setFetchedState({
          supplierId,
          requestKey,
          data: null,
          error: err?.message || "Network error loading supplier details.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [requestKey, supplierId]);

  const detail =
    isOpen && supplierId && fetchedState?.supplierId === supplierId ? fetchedState.data : null;
  const error =
    isOpen && supplierId && fetchedState?.supplierId === supplierId ? fetchedState.error : "";
  const isLoading = Boolean(requestKey && fetchedState?.requestKey !== requestKey);

  const handlePaymentMutated = useCallback(() => {
    setRefreshTick((t) => t + 1);
    onPaymentChanged?.();
  }, [onPaymentChanged]);

  const handlePreviewReceipt = async (p: SupplierPayment) => {
    const fileName = p.attachmentOriginalName || p.attachmentName || `${p.paymentNumber}-receipt`;
    const category = getFileCategory(fileName, p.attachmentMimeType || undefined);
    try {
      const res = await fetch(`/api/supplier-payments/${p.id}/receipt?action=signed-url`);
      const json = await res.json();
      const url =
        res.ok && json.success && json.signedUrl
          ? json.signedUrl
          : `/api/supplier-payments/${p.id}/receipt?action=preview`;
      setPreviewAttachment({
        name: fileName,
        url,
        category,
        size: p.attachmentSize || undefined,
        description: `Payment ${p.paymentNumber}`,
      });
      setIsPreviewOpen(true);
    } catch {
      setPreviewAttachment({
        name: fileName,
        url: `/api/supplier-payments/${p.id}/receipt?action=preview`,
        category,
        size: p.attachmentSize || undefined,
        description: `Payment ${p.paymentNumber}`,
      });
      setIsPreviewOpen(true);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={detail ? `${detail.name} (${detail.code})` : "Supplier Financial Profile"}
      description="View supplier contact details, payables, overdue invoices, and full settlement history"
      maxWidth="6xl"
    >
      {isLoading && !detail ? (
        <div className="py-16 text-center text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
          <p className="text-xs font-semibold">Loading supplier invoices &amp; payments...</p>
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2 text-xs">
          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      ) : !detail ? null : (
        <div className="space-y-4 text-xs">
          {/* Header Contact & Code Card */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-600" />
                <span className="font-bold text-sm text-slate-900">{detail.name}</span>
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                  {detail.code}
                </span>
                <StatusBadge status={detail.isActive ? "active" : "inactive"} />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
                {detail.contactPerson && (
                  <span className="inline-flex items-center gap-1">
                    <User className="h-3 w-3 text-slate-400" /> {detail.contactPerson}
                  </span>
                )}
                {detail.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3 w-3 text-slate-400" /> {detail.phone}
                  </span>
                )}
                {detail.email && (
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-3 w-3 text-slate-400" /> {detail.email}
                  </span>
                )}
                {detail.address && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-slate-400" /> {detail.address}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 4 Financial KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl border border-slate-200 bg-white">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">
                Total Billed ({detail.summary.invoiceCount} inv)
              </span>
              <span className="text-base font-extrabold font-mono text-slate-900">
                {formatCurrency(detail.summary.totalBilled, { showCurrencyPrefix: true })}
              </span>
            </div>

            <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/50">
              <span className="text-[10px] uppercase font-bold text-emerald-700 block">
                Total Paid ({detail.summary.paymentCount} txn)
              </span>
              <span className="text-base font-extrabold font-mono text-emerald-800">
                {formatCurrency(detail.summary.totalPaid, { showCurrencyPrefix: true })}
              </span>
            </div>

            <div className="p-3 rounded-xl border border-blue-200 bg-blue-50/50">
              <span className="text-[10px] uppercase font-bold text-blue-700 block">
                Outstanding Payable
              </span>
              <span className="text-base font-extrabold font-mono text-blue-900">
                {formatCurrency(detail.summary.outstandingBalance, { showCurrencyPrefix: true })}
              </span>
            </div>

            <div
              className={`p-3 rounded-xl border ${
                detail.summary.overdueInvoiceCount > 0
                  ? "border-rose-200 bg-rose-50/70"
                  : "border-slate-200 bg-slate-50"
              }`}
            >
              <span
                className={`text-[10px] uppercase font-bold block ${
                  detail.summary.overdueInvoiceCount > 0 ? "text-rose-700" : "text-slate-500"
                }`}
              >
                Overdue ({detail.summary.overdueInvoiceCount} inv)
              </span>
              <span
                className={`text-base font-extrabold font-mono ${
                  detail.summary.overdueInvoiceCount > 0 ? "text-rose-800" : "text-slate-700"
                }`}
              >
                {formatCurrency(detail.summary.overdueBalance, { showCurrencyPrefix: true })}
              </span>
            </div>
          </div>

          {/* Tab Strip */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <button
              type="button"
              onClick={() => setActiveTab("invoices")}
              className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${
                activeTab === "invoices"
                  ? "bg-blue-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Supplier Invoices ({detail.invoices.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("payments")}
              className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${
                activeTab === "payments"
                  ? "bg-blue-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Payment History ({detail.payments.length})
            </button>
          </div>

          {activeTab === "invoices" ? (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-100 z-10">
                    <tr className="text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                      <th className="py-2.5 px-3">Invoice #</th>
                      <th className="py-2.5 px-3">Job</th>
                      <th className="py-2.5 px-3">Inv Date</th>
                      <th className="py-2.5 px-3">Due Date</th>
                      <th className="py-2.5 px-3 text-right">Total</th>
                      <th className="py-2.5 px-3 text-right">Paid</th>
                      <th className="py-2.5 px-3 text-right">Balance</th>
                      <th className="py-2.5 px-3">Payment Status</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {detail.invoices.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-10 text-center text-slate-400">
                          No invoices recorded for this supplier yet.
                        </td>
                      </tr>
                    ) : (
                      detail.invoices.map((inv) => {
                        const out = Number(inv.outstandingBalance ?? 0);
                        const canPay = inv.status !== "CANCELLED" && out > 0 && canCreatePayment;
                        return (
                          <tr key={inv.id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-mono font-bold text-blue-700">
                              {inv.invoiceNumber}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="font-mono font-semibold text-slate-800">
                                {inv.jobCode || "—"}
                              </span>
                              <span className="block text-[10px] text-slate-500 truncate max-w-[160px]">
                                {inv.jobName}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-600">
                              {inv.invoiceDate}
                            </td>
                            <td className="py-2.5 px-3 font-mono">
                              <span className={inv.isOverdue ? "text-rose-700 font-bold" : "text-slate-700"}>
                                {inv.paymentDueDate || inv.invoiceDate}
                              </span>
                              {inv.countdown?.label && (
                                <span
                                  className={`block text-[10px] font-sans ${
                                    inv.isOverdue ? "text-rose-600 font-semibold" : "text-slate-400"
                                  }`}
                                >
                                  {inv.countdown.label}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900">
                              {formatCurrency(inv.totalAmount)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                              {formatCurrency(inv.paidAmount ?? 0)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-900">
                              {formatCurrency(out)}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex flex-wrap items-center gap-1">
                                <StatusBadge status={inv.paymentStatus || inv.status} />
                                {inv.paymentStatus === "OVERDUE" && inv.isPartiallyPaid && (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                                    Partial
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-1">
                              <button
                                type="button"
                                onClick={() => setViewingInvoiceId(inv.id)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
                                title="View invoice & payments"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              {canPay && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPayingInvoice({
                                      ...inv,
                                      supplier: {
                                        id: detail.id,
                                        code: detail.code,
                                        name: detail.name,
                                      },
                                      job: {
                                        id: inv.jobId,
                                        jobCode: inv.jobCode || "",
                                        name: inv.jobName || "",
                                        clientName: "",
                                        date: "",
                                      },
                                    })
                                  }
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold cursor-pointer"
                                >
                                  <CreditCard className="h-3 w-3" />
                                  <span>Pay</span>
                                </button>
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
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-100 z-10">
                    <tr className="text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                      <th className="py-2.5 px-3">Payment #</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Invoice #</th>
                      <th className="py-2.5 px-3">Job #</th>
                      <th className="py-2.5 px-3">Method &amp; Ref</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {detail.payments.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-10 text-center text-slate-400">
                          No payments recorded for this supplier yet.
                        </td>
                      </tr>
                    ) : (
                      detail.payments.map((p) => (
                        <tr
                          key={p.id}
                          className={p.status === "REVERSED" ? "bg-rose-50/40" : "hover:bg-slate-50"}
                        >
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                            {p.paymentNumber}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-700">{p.paymentDate}</td>
                          <td className="py-2.5 px-3">
                            <button
                              type="button"
                              onClick={() => setViewingInvoiceId(p.supplierInvoiceId)}
                              className="font-mono font-bold text-blue-700 hover:underline cursor-pointer"
                            >
                              {p.invoiceNumber || "—"}
                            </button>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-700">
                            {p.jobCode || "—"}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-semibold text-slate-800 block">
                              {p.paymentMethod}
                            </span>
                            {p.referenceNumber && (
                              <span className="font-mono text-[10px] text-slate-500">
                                {p.referenceNumber}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                            <span className={p.status === "REVERSED" ? "line-through text-rose-600" : ""}>
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
                                  onClick={() => handlePreviewReceipt(p)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 text-[10px] font-semibold cursor-pointer"
                                >
                                  <Receipt className="h-3 w-3" />
                                  <span>View</span>
                                </button>
                                <a
                                  href={`/api/supplier-payments/${p.id}/receipt?action=download`}
                                  className="p-1 text-slate-500 hover:text-emerald-600"
                                  title="Download receipt"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </a>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400">None</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <ViewSupplierInvoiceModal
        isOpen={Boolean(viewingInvoiceId)}
        onClose={() => setViewingInvoiceId(null)}
        invoiceId={viewingInvoiceId}
        initialTab="payments"
        onPaymentUpdated={handlePaymentMutated}
      />

      <MakeSupplierPaymentModal
        isOpen={Boolean(payingInvoice)}
        onClose={() => setPayingInvoice(null)}
        invoice={payingInvoice}
        onSuccess={handlePaymentMutated}
      />

      <AttachmentPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        attachment={previewAttachment}
      />
    </Modal>
  );
}
