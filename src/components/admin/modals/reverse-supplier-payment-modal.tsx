"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Modal } from "@/components/admin/ui/modal";
import { formatCurrency, roundFinancial, toDecimal } from "@/lib/financial";
import { SupplierPayment } from "@/types/admin";
import {
  SUPPLIER_PAYMENT_METHODS,
  parseDateKeyToUtcMidnight,
} from "@/lib/supplier-payment-date";
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, X } from "lucide-react";

interface ReverseSupplierPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "REVERSE" | "EDIT";
  payment: SupplierPayment | null;
  onSuccess?: (result: any) => void;
}

export function ReverseSupplierPaymentModal({
  isOpen,
  onClose,
  mode,
  payment,
  onSuccess,
}: ReverseSupplierPaymentModalProps) {
  const [reason, setReason] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>(SUPPLIER_PAYMENT_METHODS[0]);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!isOpen || !payment) return;
    const timer = setTimeout(() => {
      setReason("");
      setPaymentDate(payment.paymentDate || "");
      setAmount(Number(payment.amount || 0).toFixed(2));
      setPaymentMethod(payment.paymentMethod || SUPPLIER_PAYMENT_METHODS[0]);
      setReferenceNumber(payment.referenceNumber || "");
      setBankAccountName(payment.bankAccountName || "");
      setNotes(payment.notes || "");
      setSubmitError("");
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, payment, mode]);

  const maxAllowableEditAmount = useMemo(() => {
    if (!payment || payment.invoiceTotalAmount == null || payment.invoicePaidAmount == null) {
      return null;
    }
    const otherPaid = Math.max(
      0,
      roundFinancial(toDecimal(payment.invoicePaidAmount).minus(payment.amount), 2).toNumber()
    );
    return Math.max(
      0,
      roundFinancial(toDecimal(payment.invoiceTotalAmount).minus(otherPaid), 2).toNumber()
    );
  }, [payment]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !payment) return;
    setSubmitError("");

    const trimmedReason = reason.trim();
    if (trimmedReason.length < 3) {
      setSubmitError("Please provide a clear audit reason (minimum 3 characters).");
      return;
    }

    if (mode === "EDIT") {
      if (!paymentDate || !parseDateKeyToUtcMidnight(paymentDate)) {
        setSubmitError("Please provide a valid Payment Date.");
        return;
      }
      const amtDec = roundFinancial(toDecimal(amount), 2);
      if (amtDec.lte(0)) {
        setSubmitError("Payment Amount must be greater than 0.00.");
        return;
      }
      if (maxAllowableEditAmount != null && amtDec.gt(toDecimal(maxAllowableEditAmount).plus(0.009))) {
        setSubmitError(
          `Updated amount (${formatCurrency(amtDec.toNumber())}) exceeds allowable invoice balance (${formatCurrency(maxAllowableEditAmount)}).`
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload: Record<string, any> =
        mode === "REVERSE"
          ? { action: "REVERSE", reason: trimmedReason }
          : {
              action: "EDIT",
              reason: trimmedReason,
              paymentDate,
              amount: roundFinancial(toDecimal(amount), 2).toNumber(),
              paymentMethod,
              referenceNumber: referenceNumber.trim() || null,
              bankAccountName: bankAccountName.trim() || null,
              notes: notes.trim() || null,
            };

      const res = await fetch(`/api/supplier-payments/${payment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setSubmitError(json?.error || `Failed to ${mode === "REVERSE" ? "reverse" : "update"} payment.`);
        return;
      }
      onSuccess?.(json);
      onClose();
    } catch (err: any) {
      setSubmitError(err?.message || "Network error updating payment record.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!payment) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        mode === "REVERSE"
          ? `Reverse Payment • ${payment.paymentNumber}`
          : `Edit Payment • ${payment.paymentNumber}`
      }
      description={
        mode === "REVERSE"
          ? "Mark payment as REVERSED, preserve full audit history, and restore invoice balance"
          : "Modify recorded payment fields with mandatory financial audit reason"
      }
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs text-slate-800">
        {submitError && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
            <span className="flex-1">{submitError}</span>
            <button
              type="button"
              onClick={() => setSubmitError("")}
              className="text-rose-400 hover:text-rose-700 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Payment Summary */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <span className="text-slate-500 block">Payment #</span>
            <span className="font-mono font-bold text-slate-900">{payment.paymentNumber}</span>
          </div>
          <div>
            <span className="text-slate-500 block">Supplier Invoice</span>
            <span className="font-mono font-semibold text-blue-700">
              {payment.invoiceNumber || "—"}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Supplier</span>
            <span className="font-semibold text-slate-800">{payment.supplierName || "—"}</span>
          </div>
          <div>
            <span className="text-slate-500 block">Original Amount</span>
            <span className="font-mono font-bold text-slate-900">
              {formatCurrency(payment.amount, { showCurrencyPrefix: true })}
            </span>
          </div>
        </div>

        {mode === "REVERSE" ? (
          <div className="p-3 rounded-xl border border-rose-200 bg-rose-50/70 text-rose-900 space-y-1 text-[11px]">
            <p className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-rose-600" />
              <span>Reversal Financial Impact</span>
            </p>
            <ul className="list-disc pl-5 space-y-0.5 text-rose-800">
              <li>
                This transaction will be marked <strong>REVERSED</strong> and cannot be reversed twice.
              </li>
              <li>
                Invoice outstanding balance will increase by{" "}
                <strong className="font-mono">
                  {formatCurrency(payment.amount, { showCurrencyPrefix: true })}
                </strong>{" "}
                (settled invoices revert to Approved / Unpaid / Overdue status).
              </li>
              <li>Job costs, PO commitments, and Profit &amp; Loss remain unaffected.</li>
            </ul>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Payment Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Amount <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-blue-500"
              />
              {maxAllowableEditAmount != null && (
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Max allowable: {formatCurrency(maxAllowableEditAmount, { showCurrencyPrefix: true })}
                </p>
              )}
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SUPPLIER_PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Reference #</label>
              <input
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Bank / Cash Account</label>
              <input
                type="text"
                value={bankAccountName}
                onChange={(e) => setBankAccountName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        <div>
          <label className="block font-bold text-slate-800 mb-1">
            {mode === "REVERSE"
              ? "Mandatory Reversal Reason"
              : "Mandatory Audit Reason for Edit"}{" "}
            <span className="text-rose-500">*</span>
          </label>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            placeholder={
              mode === "REVERSE"
                ? "e.g. Cheque bounced, duplicate entry, wrong supplier invoice selected..."
                : "e.g. Corrected bank reference number, updated transfer date..."
            }
            className="w-full px-3 py-2 rounded-lg border border-amber-300 bg-amber-50/40 text-xs outline-none focus:ring-2 focus:ring-amber-500 resize-none"
          />
        </div>

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
            disabled={isSubmitting || reason.trim().length < 3}
            className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-lg font-bold text-white shadow-xs disabled:opacity-50 cursor-pointer ${
              mode === "REVERSE"
                ? "bg-rose-600 hover:bg-rose-700"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Processing...</span>
              </>
            ) : mode === "REVERSE" ? (
              <>
                <RotateCcw className="h-4 w-4" />
                <span>Confirm Reversal</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                <span>Save Payment Changes</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
