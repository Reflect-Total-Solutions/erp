"use client";

import React, { useState } from "react";
import { Modal } from "@/components/admin/ui/modal";
import { useAdminData } from "@/context/admin-data-context";
import { formatCurrency } from "@/lib/financial";
import { ADDITIONAL_EXPENSE_CATEGORIES } from "@/lib/job-financial-analysis";
import { JobAdditionalExpense, Supplier } from "@/types/admin";
import {
  AlertTriangle,
  Ban,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  Download,
  FileText,
  History,
  Loader2,
  Paperclip,
  Plus,
  Receipt,
  Save,
  ShieldAlert,
  Trash2,
  Upload,
} from "lucide-react";

interface AdditionalExpenseFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  jobCode?: string | null;
  jobName: string;
  suppliers: Supplier[];
  expense?: JobAdditionalExpense | null;
  onSuccess: () => void;
}

export function AdditionalExpenseFormModal(props: AdditionalExpenseFormModalProps) {
  if (!props.isOpen) return null;
  return (
    <AdditionalExpenseFormInner
      key={props.expense?.id || "create"}
      {...props}
    />
  );
}

function AdditionalExpenseFormInner({
  isOpen,
  onClose,
  jobId,
  jobCode,
  jobName,
  suppliers,
  expense,
  onSuccess,
}: AdditionalExpenseFormModalProps) {
  const { showToast } = useAdminData();
  const isEditMode = Boolean(expense?.id);

  const initialIsPreset = expense
    ? (ADDITIONAL_EXPENSE_CATEGORIES as readonly string[]).includes(expense.category)
    : true;

  const [expenseDate, setExpenseDate] = useState(
    () => expense?.expenseDate || new Date().toISOString().split("T")[0]
  );
  const [selectedCategory, setSelectedCategory] = useState<string>(() =>
    expense ? (initialIsPreset ? expense.category : "__CUSTOM__") : "Transport"
  );
  const [customCategory, setCustomCategory] = useState(() =>
    expense && !initialIsPreset ? expense.category : ""
  );
  const [description, setDescription] = useState(() => expense?.description || "");
  const [amount, setAmount] = useState(() =>
    expense?.amount !== undefined && expense?.amount !== null ? String(expense.amount) : ""
  );
  const [supplierId, setSupplierId] = useState(() => expense?.supplierId || "");
  const [payeeName, setPayeeName] = useState(() => expense?.payeeName || "");
  const [paymentReference, setPaymentReference] = useState(
    () => expense?.paymentReference || ""
  );
  const [notes, setNotes] = useState(() => expense?.notes || "");
  const [editReason, setEditReason] = useState("");

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [removeExistingAttachment, setRemoveExistingAttachment] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [requiresDupConfirm, setRequiresDupConfirm] = useState<{
    message: string;
    matchingInvoiceNumber?: string;
  } | null>(null);
  const [confirmNotDuplicate, setConfirmNotDuplicate] = useState(false);

  const effectiveCategory =
    selectedCategory === "__CUSTOM__"
      ? customCategory.trim()
      : selectedCategory;

  const activeSuppliers = suppliers.filter((s) => !s.isDeleted);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!expenseDate) {
      setErrorMsg("Please select an Expense Date.");
      return;
    }
    if (!effectiveCategory || effectiveCategory.length < 2) {
      setErrorMsg("Please choose or enter an Expense Category.");
      return;
    }
    if (!description.trim() || description.trim().length < 2) {
      setErrorMsg("Expense Description must be at least 2 characters.");
      return;
    }
    const parsedAmt = parseFloat(amount);
    if (!Number.isFinite(parsedAmt) || parsedAmt <= 0) {
      setErrorMsg("Amount must be greater than 0.00.");
      return;
    }
    if (requiresDupConfirm && !confirmNotDuplicate) {
      setErrorMsg(
        "Please check the confirmation box below or revise the supplier/amount."
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      if (isEditMode) {
        formData.append("action", "EDIT");
        if (editReason.trim()) formData.append("reason", editReason.trim());
        if (removeExistingAttachment && !receiptFile) {
          formData.append("removeAttachment", "true");
        }
      }
      formData.append("expenseDate", expenseDate);
      formData.append("category", effectiveCategory);
      formData.append("description", description.trim());
      formData.append("amount", parsedAmt.toFixed(2));
      formData.append("supplierId", supplierId);
      formData.append("payeeName", payeeName.trim());
      formData.append("paymentReference", paymentReference.trim());
      formData.append("notes", notes.trim());
      if (confirmNotDuplicate) {
        formData.append("confirmNotDuplicateInvoice", "true");
      }
      if (receiptFile) {
        formData.append("receipt", receiptFile);
      }

      const url = isEditMode
        ? `/api/jobs/${jobId}/additional-expenses/${expense!.id}`
        : `/api/jobs/${jobId}/additional-expenses`;
      const method = isEditMode ? "PATCH" : "POST";

      const res = await fetch(url, { method, body: formData });
      const json = await res.json();

      if (res.status === 409 && json?.requiresConfirmation) {
        setRequiresDupConfirm({
          message: json.error,
          matchingInvoiceNumber: json.matchingInvoiceNumber,
        });
        setConfirmNotDuplicate(false);
        return;
      }

      if (!res.ok || !json?.success) {
        setErrorMsg(
          json?.error ||
            `Failed to ${isEditMode ? "update" : "record"} additional expense.`
        );
        return;
      }

      showToast(
        isEditMode ? "Additional Expense Updated" : "Additional Expense Recorded",
        json.message ||
          `${effectiveCategory} (${formatCurrency(parsedAmt, {
            showCurrencyPrefix: true,
          })}) saved and Job P&L recalculated.`,
        "success"
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(
        err?.message || "Unexpected network error saving additional expense."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isSubmitting) onClose();
      }}
      title={
        isEditMode
          ? `Edit Additional Expense — ${jobCode || jobName}`
          : `Add Additional Job Expense — ${jobCode || jobName}`
      }
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Double-counting reminder */}
        <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-[11px] leading-relaxed">
            <strong>Non-Invoice Operational Expenses Only:</strong> Record transport, site labour, fuel, permits, or petty cash costs here. Expenses already billed on a{" "}
            <strong>Supplier Invoice</strong> must NOT be entered again (to prevent double counting in Job P&amp;L).
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {requiresDupConfirm && (
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Potential Duplicate of Supplier Invoice</p>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  {requiresDupConfirm.message}
                </p>
              </div>
            </div>
            <label className="flex items-center gap-2 pt-1 cursor-pointer select-none font-semibold text-amber-950">
              <input
                type="checkbox"
                checked={confirmNotDuplicate}
                onChange={(e) => setConfirmNotDuplicate(e.target.checked)}
                className="h-4 w-4 rounded border-amber-400 text-blue-600"
              />
              <span>
                Confirm this is a separate non-invoice expense (do not link to{" "}
                {requiresDupConfirm.matchingInvoiceNumber || "existing invoice"})
              </span>
            </label>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Expense Date *
            </label>
            <div className="relative">
              <Calendar className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                required
                className="h-9 w-full rounded-lg border border-slate-200 pl-8 pr-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Expense Category *
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-none bg-white"
            >
              {ADDITIONAL_EXPENSE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
              <option value="__CUSTOM__">Custom Category...</option>
            </select>
          </div>
        </div>

        {selectedCategory === "__CUSTOM__" && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Custom Category Name *
            </label>
            <input
              type="text"
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              placeholder="e.g. Courier / Site Security"
              required
              className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
            />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Expense Description *
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Emergency truck transport to Colombo event site"
              required
              className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Amount (Rs.) *
            </label>
            <div className="relative">
              <DollarSign className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setRequiresDupConfirm(null);
                  setConfirmNotDuplicate(false);
                }}
                placeholder="0.00"
                required
                className="h-9 w-full rounded-lg border border-slate-200 pl-8 pr-3 text-xs font-mono font-bold text-slate-900 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Supplier (Optional)
            </label>
            <select
              value={supplierId}
              onChange={(e) => {
                setSupplierId(e.target.value);
                setRequiresDupConfirm(null);
                setConfirmNotDuplicate(false);
              }}
              className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none bg-white"
            >
              <option value="">-- Not a registered supplier --</option>
              {activeSuppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Payee / Person (Optional)
            </label>
            <input
              type="text"
              value={payeeName}
              onChange={(e) => setPayeeName(e.target.value)}
              placeholder="e.g. Driver / Crew Lead"
              className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Voucher / Ref # (Optional)
            </label>
            <input
              type="text"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              placeholder="e.g. PC-1042"
              className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs font-mono text-slate-900 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Receipt Upload */}
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <Paperclip className="h-3.5 w-3.5 text-blue-600" />
              <span>Receipt / Supporting Voucher (Optional, max 10MB)</span>
            </label>
            <span className="text-[10px] text-slate-400">
              PDF, JPG, PNG, WEBP, Word, Excel
            </span>
          </div>

          {isEditMode && expense?.attachmentName && !removeExistingAttachment && !receiptFile && (
            <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white border border-slate-200 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                <span className="font-medium text-slate-800 truncate">
                  {expense.attachmentName}
                </span>
                {expense.attachmentSize && (
                  <span className="text-[10px] font-mono text-slate-400 shrink-0">
                    ({expense.attachmentSize})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`/api/jobs/${jobId}/additional-expenses/${expense.id}/receipt?action=download`}
                  className="text-[11px] font-semibold text-blue-600 hover:underline flex items-center gap-1"
                >
                  <Download className="h-3 w-3" />
                  <span>Download</span>
                </a>
                <button
                  type="button"
                  onClick={() => setRemoveExistingAttachment(true)}
                  className="text-[11px] font-semibold text-rose-600 hover:underline flex items-center gap-0.5 cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>Remove</span>
                </button>
              </div>
            </div>
          )}

          {removeExistingAttachment && !receiptFile && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
              <span>Existing receipt will be removed when saved.</span>
              <button
                type="button"
                onClick={() => setRemoveExistingAttachment(false)}
                className="font-semibold underline cursor-pointer"
              >
                Undo
              </button>
            </div>
          )}

          <div className="flex items-center gap-2.5 flex-wrap">
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
              <Upload className="h-3.5 w-3.5 text-blue-600" />
              <span>{receiptFile ? "Replace File" : "Choose Receipt File"}</span>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setReceiptFile(f);
                  if (f) setRemoveExistingAttachment(false);
                }}
              />
            </label>

            {receiptFile && (
              <div className="flex items-center gap-2 text-xs text-slate-700 bg-white px-2.5 py-1 rounded-lg border border-blue-200">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span className="font-medium truncate max-w-[220px]">
                  {receiptFile.name}
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  ({Math.max(1, Math.round(receiptFile.size / 1024))} KB)
                </span>
                <button
                  type="button"
                  onClick={() => setReceiptFile(null)}
                  className="text-slate-400 hover:text-rose-600 font-bold cursor-pointer"
                >
                  ×
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal justification or operational details..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {isEditMode && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reason for Modification (Logged in Audit Trail)
              </label>
              <input
                type="text"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="e.g. Updated actual fuel bill after driver returned receipt"
                className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="h-9 px-4 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="h-9 px-4 rounded-lg bg-[#2563EB] text-xs font-semibold text-white hover:bg-[#1d4ed8] flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : isEditMode ? (
              <>
                <Save className="h-3.5 w-3.5" />
                <span>Save Changes &amp; Recalculate P&amp;L</span>
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" />
                <span>Record Expense &amp; Update P&amp;L</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}

interface CancelAdditionalExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  expense: JobAdditionalExpense | null;
  onSuccess: () => void;
}

export function CancelAdditionalExpenseModal(
  props: CancelAdditionalExpenseModalProps
) {
  if (!props.isOpen || !props.expense) return null;
  return (
    <CancelAdditionalExpenseInner
      key={props.expense.id}
      isOpen={props.isOpen}
      onClose={props.onClose}
      jobId={props.jobId}
      expense={props.expense}
      onSuccess={props.onSuccess}
    />
  );
}

function CancelAdditionalExpenseInner({
  isOpen,
  onClose,
  jobId,
  expense,
  onSuccess,
}: Omit<CancelAdditionalExpenseModalProps, "expense"> & {
  expense: JobAdditionalExpense;
}) {
  const { showToast } = useAdminData();
  const [reason, setReason] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    if (reason.trim().length < 3) {
      setErrorMsg("Cancellation reason is mandatory (minimum 3 characters).");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(
        `/api/jobs/${jobId}/additional-expenses/${expense.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "CANCEL",
            cancellationReason: reason.trim(),
          }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json?.success) {
        setErrorMsg(json?.error || "Failed to cancel additional expense.");
        return;
      }

      showToast(
        "Expense Cancelled",
        "Additional expense marked CANCELLED and excluded from Job Profit & Loss.",
        "success"
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || "Unexpected error cancelling expense.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isSubmitting) onClose();
      }}
      title="Cancel Additional Job Expense"
      maxWidth="md"
    >
      <form onSubmit={handleConfirm} className="space-y-4">
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
          <Ban className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-rose-900">
              Soft Cancellation — Immutable Audit Trail Preserved
            </p>
            <p className="text-[11px]">
              Cancelling this expense permanently preserves its record and audit trail while immediately removing{" "}
              <strong className="font-mono">
                {formatCurrency(expense.amount, { showCurrencyPrefix: true })}
              </strong>{" "}
              from Total Actual Expenses and recalculating Job Gross Profit.
            </p>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs grid grid-cols-2 gap-2">
          <div>
            <span className="text-[10px] text-slate-400 block">Category</span>
            <strong className="text-slate-800">{expense.category}</strong>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block">Date</span>
            <strong className="text-slate-800 font-mono">
              {expense.expenseDate}
            </strong>
          </div>
          <div className="col-span-2">
            <span className="text-[10px] text-slate-400 block">Description</span>
            <strong className="text-slate-800">{expense.description}</strong>
          </div>
        </div>

        {errorMsg && (
          <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
            {errorMsg}
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Cancellation Reason *
          </label>
          <textarea
            rows={3}
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Specify why this additional expense is being cancelled..."
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-rose-500 focus:outline-none"
          />
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="h-8 px-3.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Keep Active
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="h-8 px-4 rounded-lg bg-rose-600 hover:bg-rose-700 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Cancelling...</span>
              </>
            ) : (
              <>
                <Ban className="h-3.5 w-3.5" />
                <span>Confirm Cancellation</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}

interface AdditionalExpenseAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  expense: JobAdditionalExpense | null;
}

export function AdditionalExpenseAuditModal({
  isOpen,
  onClose,
  expense,
}: AdditionalExpenseAuditModalProps) {
  if (!isOpen || !expense) return null;
  const logs = expense.auditLogs || [];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Audit History — ${expense.category}: ${expense.description}`}
      maxWidth="2xl"
    >
      <div className="space-y-4">
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
          <div>
            <span className="text-[10px] text-slate-400 block">
              Current Status &amp; Amount
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  expense.status === "CANCELLED"
                    ? "bg-rose-100 text-rose-800"
                    : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {expense.status}
              </span>
              <span className="font-mono font-bold text-slate-900">
                {formatCurrency(expense.amount, { showCurrencyPrefix: true })}
              </span>
            </div>
          </div>
          <div className="text-right text-[11px] text-slate-500">
            <div>Created By: {expense.createdByName || "System"}</div>
            {expense.updatedByName && (
              <div>Last Updated By: {expense.updatedByName}</div>
            )}
          </div>
        </div>

        {logs.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            <History className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            No audit log entries recorded.
          </div>
        ) : (
          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {logs.map((log) => (
              <div
                key={log.id}
                className="p-3 rounded-xl border border-slate-200 bg-white text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        log.action === "CANCEL"
                          ? "bg-rose-100 text-rose-800"
                          : log.action === "EDIT"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      {log.action}
                    </span>
                    <span className="font-semibold text-slate-800">
                      {log.userName || "System"}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {log.createdAt
                      ? new Date(log.createdAt).toLocaleString()
                      : ""}
                  </span>
                </div>

                {log.reason && (
                  <p className="text-[11px] text-slate-700 bg-slate-50 px-2.5 py-1.5 rounded border border-slate-100">
                    <strong>Reason:</strong> {log.reason}
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  {log.previousData && (
                    <div className="p-2 rounded bg-slate-50 border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                        Before
                      </span>
                      <div className="space-y-0.5 text-slate-600 font-mono text-[10px]">
                        <div>Date: {log.previousData.expenseDate}</div>
                        <div>Cat: {log.previousData.category}</div>
                        <div>
                          Amt:{" "}
                          {formatCurrency(log.previousData.amount || 0, {
                            showCurrencyPrefix: true,
                          })}
                        </div>
                        <div className="truncate">
                          Desc: {log.previousData.description}
                        </div>
                      </div>
                    </div>
                  )}
                  {log.newData && (
                    <div className="p-2 rounded bg-blue-50/50 border border-blue-100">
                      <span className="text-[10px] font-bold text-blue-700 uppercase block mb-1">
                        After
                      </span>
                      <div className="space-y-0.5 text-slate-700 font-mono text-[10px]">
                        <div>Date: {log.newData.expenseDate}</div>
                        <div>Cat: {log.newData.category}</div>
                        <div>
                          Amt:{" "}
                          {formatCurrency(log.newData.amount || 0, {
                            showCurrencyPrefix: true,
                          })}
                        </div>
                        <div className="truncate">
                          Desc: {log.newData.description}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-4 rounded-lg bg-slate-100 text-xs font-semibold text-slate-700 hover:bg-slate-200 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
