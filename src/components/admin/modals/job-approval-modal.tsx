"use client";

import React, { useState } from "react";
import { Modal } from "@/components/admin/ui/modal";
import { StatusBadge } from "@/components/admin/ui/badge";
import { Job, JobCostCategory, JobCostItem } from "@/types/admin";
import { formatCurrency } from "@/lib/financial";
import {
  Briefcase,
  Building,
  Calendar,
  User,
  FileSpreadsheet,
  Download,
  DollarSign,
  CheckCircle,
  XCircle,
  RotateCcw,
  Clock,
  Layers,
  AlertTriangle,
  Loader2,
  FileText,
} from "lucide-react";

interface JobApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: Job | null;
  onActionComplete: () => void;
  currentRole: string;
  initialAction?: "APPROVE" | "REJECT" | "RESET" | null;
}

export function JobApprovalModal({
  isOpen,
  onClose,
  job,
  onActionComplete,
  currentRole,
  initialAction = null,
}: JobApprovalModalProps) {
  const [activeTab, setActiveTab] = useState<"details" | "breakdown" | "history">("details");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionConfirm, setActionConfirm] = useState<"APPROVE" | "REJECT" | "RESET" | null>(initialAction);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  React.useEffect(() => {
    if (isOpen) {
      setActionConfirm(initialAction || null);
      setReason("");
      setNotes("");
      setErrorMsg("");
    }
  }, [isOpen, initialAction]);

  if (!job) return null;

  const isAdmin = currentRole.toLowerCase() === "admin";
  const isSupervisor = currentRole.toLowerCase() === "supervisor";
  const canApprove = isAdmin || isSupervisor;

  const statusNorm = job.status.toLowerCase();
  const isApproved = statusNorm.includes("approved");
  const isRejected = statusNorm.includes("rejected");
  const isPending = statusNorm.includes("pending");

  const costSummary = job.costSummary || {
    productionCost: job.totalCost || 0,
    runningCost: 0,
    agencyOperationFee: 0,
    agencyProductionFee: 0,
    adminCharges: 0,
    monitoringCost: 0,
    artworkCharges: 0,
    contingencies: 0,
    subTotal: job.totalCost || 0,
    totalBeforeTax: job.totalCost || 0,
    taxType: "SSCL",
    taxRate: 2.5,
    taxAmount: 0,
    grandTotal: job.grandTotal || job.totalCost || 0,
  };

  const categories = job.costCategories || [];
  const primaryDoc = job.documents && job.documents[0];

  const handleExecuteAction = async () => {
    if (!actionConfirm) return;
    setErrorMsg("");

    if ((actionConfirm === "REJECT" || actionConfirm === "RESET" || (actionConfirm as string) === "MOVE_TO_PENDING") && !reason.trim()) {
      setErrorMsg(
        actionConfirm === "REJECT"
          ? "Please enter a mandatory rejection reason."
          : "Please enter a mandatory reason for moving this Job back to Pending Approval."
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}/approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: actionConfirm,
          reason: reason.trim(),
          notes: notes.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to process approval action.");
      }

      setActionConfirm(null);
      setReason("");
      setNotes("");
      onActionComplete();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to process request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Job Approval Review: ${job.jobCode || "JOB"} — ${job.name}`}
      maxWidth="4xl"
    >
      <div className="space-y-4">
        {/* Top Summary Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-bold text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-md">
                {job.jobCode || "NO-CODE"}
              </span>
              <h3 className="text-sm font-bold text-slate-900">{job.name}</h3>
              <StatusBadge status={job.status} />
            </div>

            <div className="flex items-center gap-4 text-xs text-slate-500 mt-2 flex-wrap">
              <span className="flex items-center gap-1">
                <Building className="h-3.5 w-3.5 text-slate-400" />
                Client: <strong className="text-slate-700">{job.clientName || "Valued Client"}</strong>
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                Date: {job.date}
              </span>
              <span className="flex items-center gap-1">
                <User className="h-3.5 w-3.5 text-slate-400" />
                Handled By: {job.handledBy || "Admin"}
              </span>
            </div>
          </div>

          <div className="text-right sm:border-l sm:border-slate-200 sm:pl-4">
            <span className="text-[11px] text-slate-400 block font-medium">Final Grand Total</span>
            <span className="text-lg font-extrabold text-blue-700 font-mono">
              {formatCurrency(job.grandTotal || job.totalCost || 0, { showCurrencyPrefix: true })}
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("details")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "details"
                ? "bg-blue-600 text-white shadow-2xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Job Overview & Financials
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("breakdown")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "breakdown"
                ? "bg-blue-600 text-white shadow-2xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Dynamic Cost Breakdown ({categories.length} Categories)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "history"
                ? "bg-blue-600 text-white shadow-2xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Approval Audit Trail ({job.approvals?.length || 0})
          </button>
        </div>

        {/* TAB 1: DETAILS */}
        {activeTab === "details" && (
          <div className="space-y-4">
            {/* Description & Metadata */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-slate-200 p-3.5 space-y-2 bg-white">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Project Description & Scope
                </span>
                <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {job.description || "No specific scope description provided."}
                </p>
                {job.remarks && (
                  <p className="text-slate-500 italic pt-1 border-t border-slate-100">
                    Remarks: {job.remarks}
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 p-3.5 space-y-2 bg-white">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Quotation File & Submission
                </span>
                {primaryDoc ? (
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="flex items-center gap-2 truncate">
                      <FileSpreadsheet className="h-4 w-4 text-emerald-600 shrink-0" />
                      <div className="truncate">
                        <p className="font-semibold text-slate-800 truncate">{primaryDoc.fileName}</p>
                        <p className="text-[10px] text-slate-400">{primaryDoc.fileSize}</p>
                      </div>
                    </div>
                    {primaryDoc.fileUrl && (
                      <a
                        href={primaryDoc.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                      >
                        <Download className="h-3 w-3" />
                        Download
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="text-slate-400 italic">No Excel sheet attached.</p>
                )}

                <div className="pt-2 text-[11px] text-slate-500 space-y-1">
                  <p>
                    Submitted By:{" "}
                    <strong className="text-slate-700">
                      {job.submittedBy?.name || job.handledBy || "Admin"}
                    </strong>
                  </p>
                  <p>Job Created: {job.createdAt}</p>
                  <p>Commencing Date: {job.commencingDate || job.date}</p>
                </div>
              </div>
            </div>

            {/* Recapitulation Financials */}
            <div className="rounded-xl border border-slate-200 p-4 bg-white space-y-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign className="h-4 w-4 text-emerald-600" />
                <span>Financial & Taxation Recapitulation</span>
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-400 uppercase block font-medium">Production Cost (NRC)</span>
                  <span className="font-bold text-slate-800 font-mono text-sm mt-0.5 block">
                    {formatCurrency(costSummary.productionCost || 0, { showCurrencyPrefix: true })}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-400 uppercase block font-medium">Running Cost (RC)</span>
                  <span className="font-bold text-slate-800 font-mono text-sm mt-0.5 block">
                    {formatCurrency(costSummary.runningCost || 0, { showCurrencyPrefix: true })}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-400 uppercase block font-medium">
                    {costSummary.taxType || "SSCL"} ({costSummary.taxRate || 2.5}%)
                  </span>
                  <span className="font-bold text-slate-800 font-mono text-sm mt-0.5 block">
                    {formatCurrency(costSummary.taxAmount || 0, { showCurrencyPrefix: true })}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200">
                  <span className="text-[10px] text-blue-700 uppercase block font-bold">Final Grand Total</span>
                  <span className="font-bold text-blue-900 font-mono text-sm mt-0.5 block">
                    {formatCurrency(costSummary.grandTotal || 0, { showCurrencyPrefix: true })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: BREAKDOWN */}
        {activeTab === "breakdown" && (
          <div className="space-y-3">
            {categories.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 bg-white rounded-xl border border-slate-200">
                No itemized breakdown categories recorded for this job.
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 overflow-hidden bg-white max-h-96 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] text-slate-600 font-semibold border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 w-12 text-center">#</th>
                      <th className="px-3 py-2">Item Description</th>
                      <th className="px-2 py-2 w-16 text-center">RC/NRC</th>
                      <th className="px-3 py-2 w-20 text-right">Qty</th>
                      <th className="px-3 py-2 w-28 text-right">Rate</th>
                      <th className="px-4 py-2 w-32 text-right">Total Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {categories.map((cat, catIdx) => (
                      <React.Fragment key={cat.id || catIdx}>
                        <tr className="bg-slate-100/70 font-bold text-slate-800">
                          <td colSpan={5} className="px-3 py-1.5 uppercase text-[11px]">
                            📁 {cat.name}
                          </td>
                          <td className="px-4 py-1.5 text-right font-mono text-slate-900">
                            {formatCurrency(cat.subtotal, { showCurrencyPrefix: true })}
                          </td>
                        </tr>
                        {(cat.items || []).map((item, itemIdx) => (
                          <tr key={item.id || itemIdx} className="hover:bg-slate-50/60">
                            <td className="px-3 py-2 text-center text-slate-400 font-mono text-[11px]">
                              {item.itemNumber || itemIdx + 1}
                            </td>
                            <td className="px-3 py-2 font-medium text-slate-800">{item.description}</td>
                            <td className="px-2 py-2 text-center">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  item.rcNrc === "RC"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-slate-100 text-slate-700"
                                }`}
                              >
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
            )}
          </div>
        )}

        {/* TAB 3: AUDIT TRAIL */}
        {activeTab === "history" && (
          <div className="space-y-3">
            {(!job.approvals || job.approvals.length === 0) ? (
              <div className="p-8 text-center text-xs text-slate-400 bg-white rounded-xl border border-slate-200">
                No approval or rejection events recorded yet for this job.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden max-h-80 overflow-y-auto">
                {job.approvals.map((app) => (
                  <div key={app.id} className="p-3 text-xs flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-bold px-2 py-0.5 rounded text-[10px] uppercase ${
                            app.action === "APPROVE"
                              ? "bg-emerald-100 text-emerald-800"
                              : app.action === "REJECT"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {app.action}
                        </span>
                        <span className="font-semibold text-slate-800">
                          {app.previousStatus} → {app.newStatus}
                        </span>
                      </div>
                      {app.reason && (
                        <p className="text-slate-600 italic bg-slate-50 p-1.5 rounded border border-slate-100">
                          &quot;{app.reason}&quot;
                        </p>
                      )}
                      <p className="text-[11px] text-slate-400">
                        Processed by: <strong>{app.userName || "System User"}</strong> ({app.userEmail || "—"})
                      </p>
                    </div>
                    <span className="text-[11px] text-slate-400 whitespace-nowrap">
                      {new Date(app.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action Confirmation Inline Form */}
        {actionConfirm && (
          <div
            className={`p-4 rounded-xl border space-y-3 animate-in fade-in ${
              actionConfirm === "APPROVE"
                ? "bg-emerald-50 border-emerald-200"
                : actionConfirm === "REJECT"
                ? "bg-rose-50 border-rose-200"
                : "bg-amber-50 border-amber-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                {actionConfirm === "APPROVE" && <CheckCircle className="h-4 w-4 text-emerald-600" />}
                {actionConfirm === "REJECT" && <XCircle className="h-4 w-4 text-rose-600" />}
                {actionConfirm === "RESET" && <RotateCcw className="h-4 w-4 text-amber-600" />}
                <span>
                  Confirm {actionConfirm === "APPROVE" ? "Approval" : actionConfirm === "REJECT" ? "Rejection" : "Status Reset"}
                </span>
              </h4>
              <button
                type="button"
                onClick={() => setActionConfirm(null)}
                className="text-slate-400 hover:text-slate-600 text-xs"
              >
                Cancel
              </button>
            </div>

            {actionConfirm === "APPROVE" && (
              <p className="text-xs text-slate-600">
                Approving this job will finalize its quotation costing and make it <strong>immediately available in Invoice Management</strong> for customer billing.
              </p>
            )}

            {actionConfirm === "REJECT" && (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-rose-900">
                  Mandatory Rejection Reason <span className="text-rose-600">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain why this job quotation is rejected (e.g. incorrect margins, missing client approval, wrong rates)..."
                  rows={2}
                  className="w-full text-xs rounded-lg border border-rose-300 p-2 bg-white focus:outline-none focus:ring-1 focus:ring-rose-500"
                />
              </div>
            )}

            {(actionConfirm === "RESET" || (actionConfirm as string) === "MOVE_TO_PENDING") && (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-amber-900">
                  Reason for Moving Back to Pending Approval <span className="text-rose-600">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain why this job is being returned to Pending Approval..."
                  rows={2}
                  className="w-full text-xs rounded-lg border border-amber-300 p-2 bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional internal notes..."
                className="text-xs flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white focus:outline-none"
              />
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleExecuteAction}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold text-white shadow-2xs transition-all disabled:opacity-50 flex items-center gap-1.5 ${
                  actionConfirm === "APPROVE"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : actionConfirm === "REJECT"
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-amber-600 hover:bg-amber-700"
                }`}
              >
                {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>
                  Confirm & Save {actionConfirm === "APPROVE" ? "Approval" : actionConfirm === "REJECT" ? "Rejection" : "Move to Pending"}
                </span>
              </button>
            </div>

            {errorMsg && <p className="text-xs text-rose-600 font-semibold">{errorMsg}</p>}
          </div>
        )}

        {/* Modal Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200">
          <div className="text-xs text-slate-500">
            {isApproved && (
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <CheckCircle className="h-3.5 w-3.5" />
                This job is approved and active.
              </span>
            )}
            {isRejected && (
              <span className="text-rose-700 font-semibold flex items-center gap-1">
                <XCircle className="h-3.5 w-3.5" />
                This job is rejected and locked from invoicing.
              </span>
            )}
            {isPending && (
              <span className="text-amber-700 font-semibold flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Awaiting managerial authorization.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {canApprove && isPending && !actionConfirm && (
              <>
                <button
                  type="button"
                  onClick={() => setActionConfirm("REJECT")}
                  className="px-3.5 py-1.5 rounded-lg border border-rose-300 bg-white text-rose-700 hover:bg-rose-50 font-semibold text-xs transition-colors flex items-center gap-1.5"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  <span>Reject</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActionConfirm("APPROVE")}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors shadow-2xs flex items-center gap-1.5"
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                  <span>Approve Job</span>
                </button>
              </>
            )}

            {isAdmin && (isApproved || isRejected) && !actionConfirm && (
              <button
                type="button"
                onClick={() => setActionConfirm("RESET")}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-semibold text-xs transition-colors flex items-center gap-1.5"
                title="Admin: Move Job Back to Pending Approval"
              >
                <RotateCcw className="h-3.5 w-3.5 text-amber-600" />
                <span>Move Back to Pending Approval</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-semibold text-xs transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
