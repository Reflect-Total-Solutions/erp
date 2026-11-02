"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "@/components/admin/ui/modal";
import { Job, CustomerInvoice } from "@/types/admin";
import { formatCurrency } from "@/lib/financial";
import {
  FileText,
  Building,
  Calendar,
  DollarSign,
  AlertCircle,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  Clock,
  Layers,
} from "lucide-react";

interface GenerateInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: Job | null;
  onInvoiceCreated: (newInvoice: CustomerInvoice) => void;
}

export function GenerateInvoiceModal({
  isOpen,
  onClose,
  job,
  onInvoiceCreated,
}: GenerateInvoiceModalProps) {
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("Payment due within 30 days. Cheques payable to 'Reflect Total Solutions (Pvt) Ltd'.");
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (isOpen) {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      setDueDate(d.toISOString().split("T")[0]);
    }
  }, [isOpen]);

  if (!job) return null;

  const costSummary = job.costSummary || {
    productionCost: job.totalCost || 0,
    runningCost: 0,
    subTotal: job.totalCost || 0,
    totalBeforeTax: job.totalCost || 0,
    taxType: "SSCL",
    taxRate: 2.5,
    taxAmount: 0,
    grandTotal: job.grandTotal || job.totalCost || 0,
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job.id,
          dueDate,
          notes: notes.trim(),
          terms: terms.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to generate invoice.");
      }

      onInvoiceCreated(json.data);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to generate invoice.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Generate Customer Billing Invoice: ${job.jobCode || "JOB"}`}
      maxWidth="3xl"
    >
      <div className="space-y-4">
        {/* Approved Job Summary Banner */}
        <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded">
              {job.jobCode}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
              <ShieldCheck className="h-3 w-3" />
              Approved Quotation
            </span>
          </div>

          <h3 className="text-sm font-bold text-slate-900">{job.name}</h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-slate-600 pt-1">
            <div>
              <span className="text-[10px] text-slate-400 block font-medium">Billed To</span>
              <strong className="text-slate-800">{job.clientName || "Valued Client"}</strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-medium">Job Date</span>
              <span className="text-slate-700">{job.date}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-medium">Approved Grand Total</span>
              <strong className="text-blue-700 font-mono">
                {formatCurrency(job.grandTotal || job.totalCost || 0, { showCurrencyPrefix: true })}
              </strong>
            </div>
          </div>
        </div>

        {/* Invoice Parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Invoice Due Date <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Client Contact / Attention
            </label>
            <input
              type="text"
              defaultValue={job.handledBy || "Accounts Payable"}
              readOnly
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-600 cursor-not-allowed"
            />
          </div>
        </div>

        {/* Financial Breakdown Preview */}
        <div className="rounded-xl border border-slate-200 p-3.5 bg-slate-50 space-y-2 text-xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
            Automated Pricing Breakdown from Job
          </span>

          <div className="divide-y divide-slate-200/70 text-slate-600">
            <div className="flex justify-between py-1.5">
              <span>Grand Total Before Tax:</span>
              <span className="font-semibold text-slate-900 font-mono">
                {formatCurrency(costSummary.totalBeforeTax || costSummary.subTotal || 0, { showCurrencyPrefix: true })}
              </span>
            </div>
            <div className="flex justify-between py-1.5">
              <span>
                {costSummary.taxType || "SSCL"} ({costSummary.taxRate || 2.5}%):
              </span>
              <span className="font-semibold text-slate-900 font-mono">
                {formatCurrency(costSummary.taxAmount || 0, { showCurrencyPrefix: true })}
              </span>
            </div>
            <div className="flex justify-between py-2 text-sm font-bold text-blue-900">
              <span>Invoice Payable Total:</span>
              <span className="font-mono">
                {formatCurrency(costSummary.grandTotal || 0, { showCurrencyPrefix: true })}
              </span>
            </div>
          </div>
        </div>

        {/* Terms and Notes */}
        <div className="space-y-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Payment Terms</label>
            <input
              type="text"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Optional Invoice Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any specific note printed on the invoice for the customer..."
              rows={2}
              className="w-full rounded-lg border border-slate-300 p-2 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200">
          <p className="text-[11px] text-slate-400">
            Invoice numbering will be automatically assigned sequentially (INV-YYYY-XXXX).
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isGenerating}
              className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isGenerating}
              onClick={handleGenerate}
              className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1d4ed8] text-xs font-bold text-white shadow-2xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              <span>Generate & Save Invoice</span>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
