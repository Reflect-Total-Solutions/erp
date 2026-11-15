"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Modal } from "@/components/admin/ui/modal";
import { useAdminData } from "@/context/admin-data-context";
import { formatCurrency, roundFinancial, toDecimal } from "@/lib/financial";
import { SupplierInvoice } from "@/types/admin";
import {
  SUPPLIER_PAYMENT_METHODS,
  computeDerivedPaymentSummary,
  diffCalendarDays,
  getTodayDateKeyInTimezone,
  parseDateKeyToUtcMidnight,
} from "@/lib/supplier-payment-date";
import {
  formatBytes,
  getFileCategory,
  isSupportedExtension,
  MAX_ATTACHMENT_SIZE_BYTES,
} from "@/lib/file-validation";
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  CreditCard,
  FileText,
  Landmark,
  Loader2,
  Upload,
  X,
} from "lucide-react";

interface MakeSupplierPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: SupplierInvoice | null;
  onSuccess?: (result: any) => void;
}

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `pay-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function MakeSupplierPaymentModal({
  isOpen,
  onClose,
  invoice,
  onSuccess,
}: MakeSupplierPaymentModalProps) {
  const { can } = useAdminData();
  const canOverrideDueDate =
    can("supplierInvoices", "overrideDueDate") || can("supplierPayments", "overrideDueDate");

  const [paymentDate, setPaymentDate] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>(SUPPLIER_PAYMENT_METHODS[0]);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [notes, setNotes] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptError, setReceiptError] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const derived = useMemo(() => {
    if (!invoice) {
      return null;
    }
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

  const outstandingBalance = derived?.outstandingBalance ?? 0;

  useEffect(() => {
    if (!isOpen || !invoice) return;
    const summary = computeDerivedPaymentSummary({
      totalAmount: invoice.totalAmount,
      paidAmount: invoice.paidAmount,
      dueDate: invoice.paymentDueDate || invoice.invoiceDate,
      invoiceDate: invoice.invoiceDate,
      invoiceStatus: invoice.status,
      payments: Array.isArray(invoice.payments) ? invoice.payments : undefined,
      lastPaymentDate: invoice.lastPaymentDate,
    });
    const timer = setTimeout(() => {
      setPaymentDate(getTodayDateKeyInTimezone());
      setAmount(summary.outstandingBalance > 0 ? summary.outstandingBalance.toFixed(2) : "");
      setPaymentMethod(SUPPLIER_PAYMENT_METHODS[0]);
      setReferenceNumber("");
      setBankAccountName("");
      setNotes("");
      setReceiptFile(null);
      setReceiptError("");
      setSubmitError("");
      setIdempotencyKey(generateIdempotencyKey());
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, invoice]);

  const enteredAmount = useMemo(() => {
    const dec = roundFinancial(toDecimal(amount), 2);
    return dec.gt(0) ? dec.toNumber() : 0;
  }, [amount]);

  const projectedRemaining = useMemo(() => {
    if (!derived) return 0;
    return Math.max(0, roundFinancial(toDecimal(derived.outstandingBalance).minus(enteredAmount), 2).toNumber());
  }, [derived, enteredAmount]);

  const projectedPaidTotal = useMemo(() => {
    if (!derived) return 0;
    return roundFinancial(toDecimal(derived.paidAmount).plus(enteredAmount), 2).toNumber();
  }, [derived, enteredAmount]);

  const isExceedingBalance = enteredAmount > outstandingBalance + 0.009;
  const isBeforeInvoiceDate = Boolean(
    invoice?.invoiceDate &&
      paymentDate &&
      parseDateKeyToUtcMidnight(invoice.invoiceDate) &&
      parseDateKeyToUtcMidnight(paymentDate) &&
      diffCalendarDays(invoice.invoiceDate, paymentDate) < 0
  );

  const handleSelectReceiptFile = (file: File | null) => {
    setReceiptError("");
    if (!file) {
      setReceiptFile(null);
      return;
    }
    if (!isSupportedExtension(file.name)) {
      setReceiptError("Unsupported file type. Allowed: PDF, Word (.doc/.docx), PNG, JPG, WEBP.");
      setReceiptFile(null);
      return;
    }
    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      setReceiptError(`File exceeds 15MB limit (${formatBytes(file.size)}).`);
      setReceiptFile(null);
      return;
    }
    setReceiptFile(file);
  };

  const handleSetQuickFraction = (ratio: number) => {
    if (outstandingBalance <= 0) return;
    if (ratio >= 1) {
      setAmount(outstandingBalance.toFixed(2));
      return;
    }
    const partial = roundFinancial(toDecimal(outstandingBalance).times(ratio), 2).toNumber();
    setAmount(partial.toFixed(2));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !invoice || !derived) return;
    setSubmitError("");

    if (invoice.status === "CANCELLED") {
      setSubmitError("Payments cannot be recorded against a cancelled Supplier Invoice.");
      return;
    }

    if (outstandingBalance <= 0) {
      setSubmitError("This Supplier Invoice has already been fully settled.");
      return;
    }

    if (!paymentDate || !parseDateKeyToUtcMidnight(paymentDate)) {
      setSubmitError("Please select a valid Payment Date.");
      return;
    }

    if (isBeforeInvoiceDate && !canOverrideDueDate) {
      setSubmitError(
        `Payment Date (${paymentDate}) cannot be earlier than Invoice Date (${invoice.invoiceDate}) without Override Due Date permission.`
      );
      return;
    }

    const amtDec = roundFinancial(toDecimal(amount), 2);
    if (amtDec.lte(0)) {
      setSubmitError("Payment Amount must be greater than 0.00.");
      return;
    }

    if (amtDec.gt(toDecimal(outstandingBalance).plus(0.009))) {
      setSubmitError(
        `Payment Amount (${formatCurrency(amtDec.toNumber())}) exceeds Outstanding Balance (${formatCurrency(outstandingBalance)}).`
      );
      return;
    }

    if (receiptError) {
      setSubmitError(receiptError);
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("supplierInvoiceId", invoice.id);
      formData.append("paymentDate", paymentDate);
      formData.append("amount", amtDec.toFixed(2));
      formData.append("paymentMethod", paymentMethod);
      if (referenceNumber.trim()) formData.append("referenceNumber", referenceNumber.trim());
      if (bankAccountName.trim()) formData.append("bankAccountName", bankAccountName.trim());
      if (notes.trim()) formData.append("notes", notes.trim());
      if (idempotencyKey) formData.append("idempotencyKey", idempotencyKey);
      if (receiptFile) formData.append("attachment", receiptFile);

      const res = await fetch("/api/supplier-payments", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        setSubmitError(json?.error || "Failed to record supplier payment.");
        return;
      }

      onSuccess?.(json);
      onClose();
    } catch (err: any) {
      setSubmitError(err?.message || "Network error while recording supplier payment.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!invoice || !derived) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Record Payment • ${invoice.invoiceNumber}`}
      description="Record a full or partial cash/bank settlement against this Supplier Invoice"
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs text-slate-800">
        {submitError && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">Payment Rejected</p>
              <p className="text-[11px] mt-0.5">{submitError}</p>
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

        {/* Invoice Context Strip */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-600" />
              <span className="font-bold text-slate-900">{invoice.supplier?.name || "Supplier"}</span>
              {invoice.job?.jobCode && (
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                  {invoice.job.jobCode}
                </span>
              )}
            </div>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                derived.countdown.severity === "overdue"
                  ? "bg-rose-100 text-rose-800 border-rose-200"
                  : derived.countdown.severity === "warning"
                  ? "bg-amber-100 text-amber-800 border-amber-200"
                  : "bg-blue-50 text-blue-700 border-blue-200"
              }`}
            >
              Due {derived.dueDateKey || invoice.invoiceDate} • {derived.countdown.label}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-slate-200">
            <div className="bg-white rounded-lg p-2 border border-slate-200">
              <span className="text-[10px] text-slate-500 block">Invoice Total</span>
              <span className="font-mono font-bold text-slate-900 text-xs">
                {formatCurrency(derived.totalAmount, { showCurrencyPrefix: true })}
              </span>
            </div>
            <div className="bg-white rounded-lg p-2 border border-slate-200">
              <span className="text-[10px] text-slate-500 block">Already Paid</span>
              <span className="font-mono font-bold text-emerald-700 text-xs">
                {formatCurrency(derived.paidAmount, { showCurrencyPrefix: true })}
              </span>
            </div>
            <div className="bg-blue-50 rounded-lg p-2 border border-blue-200">
              <span className="text-[10px] text-blue-700 font-semibold block">
                Outstanding Balance
              </span>
              <span className="font-mono font-bold text-blue-900 text-xs">
                {formatCurrency(outstandingBalance, { showCurrencyPrefix: true })}
              </span>
            </div>
          </div>
        </div>

        {/* Form Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="flex items-center gap-1 font-semibold text-slate-700 mb-1">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <span>
                Payment Date <span className="text-rose-500">*</span>
              </span>
            </label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            {isBeforeInvoiceDate && (
              <p className="text-[10px] text-amber-700 mt-1">
                {canOverrideDueDate
                  ? "Payment date precedes invoice date (allowed via Override Due Date permission)."
                  : `Warning: Date is before invoice date (${invoice.invoiceDate}).`}
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-slate-700">
                Payment Amount <span className="text-rose-500">*</span>
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleSetQuickFraction(0.5)}
                  className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[10px] font-semibold text-slate-700 cursor-pointer"
                >
                  50%
                </button>
                <button
                  type="button"
                  onClick={() => handleSetQuickFraction(1)}
                  className="px-1.5 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-[10px] font-semibold text-blue-700 border border-blue-200 cursor-pointer"
                >
                  Full Balance
                </button>
              </div>
            </div>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              placeholder="0.00"
              className={`w-full px-3 py-2 rounded-lg border bg-white text-xs font-mono font-bold outline-none focus:ring-2 ${
                isExceedingBalance
                  ? "border-rose-400 text-rose-700 focus:ring-rose-500"
                  : "border-slate-300 text-slate-900 focus:ring-blue-500"
              }`}
            />
            {isExceedingBalance && (
              <p className="text-[10px] text-rose-600 mt-1 font-medium">
                Cannot exceed Outstanding Balance ({formatCurrency(outstandingBalance)}).
              </p>
            )}
          </div>

          <div>
            <label className="flex items-center gap-1 font-semibold text-slate-700 mb-1">
              <CreditCard className="h-3.5 w-3.5 text-slate-400" />
              <span>
                Payment Method <span className="text-rose-500">*</span>
              </span>
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              {SUPPLIER_PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Reference / Cheque / Transfer #
            </label>
            <input
              type="text"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="e.g. TXN-998811 or CHQ-4021"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none font-mono"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="flex items-center gap-1 font-semibold text-slate-700 mb-1">
              <Landmark className="h-3.5 w-3.5 text-slate-400" />
              <span>Bank / Cash Account</span>
            </label>
            <input
              type="text"
              value={bankAccountName}
              onChange={(e) => setBankAccountName(e.target.value)}
              placeholder="e.g. Sampath Bank Corporate Current A/C or Petty Cash"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block font-semibold text-slate-700 mb-1">Notes / Remarks</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional remittance notes or settlement comments..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </div>

          {/* Receipt Upload */}
          <div className="sm:col-span-2">
            <label className="block font-semibold text-slate-700 mb-1">
              Payment Proof / Bank Slip / Receipt (Optional)
            </label>
            {!receiptFile ? (
              <label className="flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 hover:bg-blue-50/40 hover:border-blue-300 cursor-pointer transition-colors text-slate-600">
                <Upload className="h-4 w-4 text-blue-600" />
                <span>Attach PDF, Word, or Image receipt (max 15MB)</span>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => handleSelectReceiptFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="flex items-center justify-between p-2.5 rounded-lg border border-blue-200 bg-blue-50/50">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{receiptFile.name}</p>
                    <p className="text-[10px] text-slate-500">
                      {getFileCategory(receiptFile.name, receiptFile.type).toUpperCase()} •{" "}
                      {formatBytes(receiptFile.size)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleSelectReceiptFile(null)}
                  className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {receiptError && <p className="text-[10px] text-rose-600 mt-1">{receiptError}</p>}
          </div>
        </div>

        {/* Live Balance Impact Preview */}
        {enteredAmount > 0 && !isExceedingBalance && (
          <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50/70 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-1.5 text-emerald-900 font-semibold">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>
                {projectedRemaining <= 0
                  ? "This payment settles the invoice in full (Status -> PAID)."
                  : "Partial payment preview:"}
              </span>
            </div>
            <div className="font-mono text-emerald-900">
              Total Paid:{" "}
              <strong>{formatCurrency(projectedPaidTotal, { showCurrencyPrefix: true })}</strong> •
              Remaining:{" "}
              <strong>{formatCurrency(projectedRemaining, { showCurrencyPrefix: true })}</strong>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || isExceedingBalance || enteredAmount <= 0}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Recording Payment...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                <span>Confirm &amp; Record Payment</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
