"use client";

import React, { useState } from "react";
import { AlertTriangle, Loader2, Paperclip, Truck, Upload, X } from "lucide-react";
import { Modal } from "@/components/admin/ui/modal";
import { useAdminData } from "@/context/admin-data-context";
import { PurchaseOrder } from "@/types/admin";
import { formatBytes, isSupportedExtension, MAX_ATTACHMENT_SIZE_BYTES } from "@/lib/file-validation";

interface RecordDeliveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  po: PurchaseOrder | null;
  onSuccess: () => void;
}

export function RecordDeliveryModal({
  isOpen,
  onClose,
  po,
  onSuccess,
}: RecordDeliveryModalProps) {
  if (!isOpen || !po) return null;
  return (
    <RecordDeliveryModalInner
      key={`${po.id}-${po.deliveries?.length || 0}`}
      po={po}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}

function RecordDeliveryModalInner({
  po,
  onClose,
  onSuccess,
}: {
  po: PurchaseOrder;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { can, currentRole, showToast } = useAdminData();
  const canOverride =
    can("purchaseOrders", "overrideJobBudget") || currentRole === "admin";

  const [deliveryReference, setDeliveryReference] = useState(
    () => `DN-${po.poNumber.replace(/[^A-Z0-9]/gi, "-")}-${(po.deliveries?.length || 0) + 1}`
  );
  const [deliveryDate, setDeliveryDate] = useState(
    () => new Date().toISOString().split("T")[0]
  );
  const [receivedBy, setReceivedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>(() => {
    const initQty: Record<string, string> = {};
    (po.items || []).forEach((it) => {
      const rem = Math.max(0, Number(it.quantity) - Number(it.deliveredQuantity || 0));
      initQty[it.id] = rem > 0 ? String(rem) : "0";
    });
    return initQty;
  });
  const [itemNotes, setItemNotes] = useState<Record<string, string>>(() => {
    const initNotes: Record<string, string> = {};
    (po.items || []).forEach((it) => {
      initNotes[it.id] = "";
    });
    return initNotes;
  });
  const [isOverride, setIsOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const items = po.items || [];
  const overDeliveredItems = items.filter((it) => {
    const add = Number(quantities[it.id] || 0);
    return add > 0 && Number(it.deliveredQuantity || 0) + add > Number(it.quantity) + 0.0001;
  });

  const handleSelectFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const valid: File[] = [];
    Array.from(fileList).forEach((f) => {
      if (!isSupportedExtension(f.name)) {
        setError(`Unsupported file format: ${f.name}`);
        return;
      }
      if (f.size > MAX_ATTACHMENT_SIZE_BYTES) {
        setError(`File ${f.name} exceeds 15MB (${formatBytes(f.size)}).`);
        return;
      }
      valid.push(f);
    });
    if (valid.length > 0) setFiles((prev) => [...prev, ...valid]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!deliveryReference.trim() || !deliveryDate || !receivedBy.trim()) {
      setError("Delivery Reference, Delivery Date, and Received By are required.");
      return;
    }

    const deliveryItems = items
      .map((it) => ({
        purchaseOrderItemId: it.id,
        deliveredQuantity: Number(quantities[it.id] || 0),
        notes: itemNotes[it.id]?.trim() || null,
      }))
      .filter((i) => i.deliveredQuantity > 0);

    if (deliveryItems.length === 0) {
      setError("Enter a delivery quantity greater than 0 for at least one line item.");
      return;
    }

    if (overDeliveredItems.length > 0) {
      if (!canOverride) {
        setError(
          `Over-delivery blocked for ${overDeliveredItems
            .map((i) => i.particular)
            .join(", ")}. Override permission or Admin approval is required.`
        );
        return;
      }
      if (!isOverride || !overrideReason.trim()) {
        setError("Enable Over-Delivery Override and provide a mandatory reason.");
        return;
      }
    }

    const payload = {
      deliveryReference: deliveryReference.trim(),
      deliveryDate,
      receivedBy: receivedBy.trim(),
      notes: notes.trim() || null,
      isOverride: overDeliveredItems.length > 0 && isOverride,
      overrideReason: overDeliveredItems.length > 0 && isOverride ? overrideReason.trim() : null,
      items: deliveryItems,
    };

    setIsSubmitting(true);
    try {
      let res: Response;
      if (files.length > 0) {
        const fd = new FormData();
        fd.append("payload", JSON.stringify(payload));
        files.forEach((f) => fd.append("delivery_notes", f));
        res = await fetch(`/api/purchase-orders/${po.id}/deliveries`, {
          method: "POST",
          body: fd,
        });
      } else {
        res = await fetch(`/api/purchase-orders/${po.id}/deliveries`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || "Failed to record delivery.");
      }

      showToast("Delivery Recorded", json.message, "success");
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to record delivery.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={`Record Delivery — ${po.poNumber}`}
      maxWidth="4xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-800 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Delivery Note / Challan Ref *
            </label>
            <input
              type="text"
              required
              value={deliveryReference}
              onChange={(e) => setDeliveryReference(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-300 px-3 font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Delivery Date *</label>
            <input
              type="date"
              required
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-300 px-3"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Received By *</label>
            <input
              type="text"
              required
              value={receivedBy}
              onChange={(e) => setReceivedBy(e.target.value)}
              placeholder="Recipient name"
              className="h-9 w-full rounded-lg border border-slate-300 px-3"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-600 text-[10px] uppercase">
                <th className="py-2 px-3">Item Particular</th>
                <th className="py-2 px-3 text-right">Ordered</th>
                <th className="py-2 px-3 text-right">Delivered So Far</th>
                <th className="py-2 px-3 text-right">Remaining</th>
                <th className="py-2 px-3 text-right w-32">Deliver Now</th>
                <th className="py-2 px-3">Item Remark</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((it) => {
                const ordered = Number(it.quantity || 0);
                const prevDeliv = Number(it.deliveredQuantity || 0);
                const rem = Math.max(0, ordered - prevDeliv);
                const inputQty = Number(quantities[it.id] || 0);
                const isOver = inputQty > 0 && prevDeliv + inputQty > ordered + 0.0001;

                return (
                  <tr key={it.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3">
                      <span className="font-semibold text-slate-900">{it.particular}</span>
                      <span className="block text-[10px] text-slate-400">{it.measure}</span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono">{ordered}</td>
                    <td className="py-2 px-3 text-right font-mono text-emerald-700">
                      {prevDeliv}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-semibold text-slate-700">
                      {rem}
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={quantities[it.id] ?? "0"}
                        onChange={(e) =>
                          setQuantities((prev) => ({ ...prev, [it.id]: e.target.value }))
                        }
                        className={`h-8 w-full rounded border px-2 text-right font-mono ${
                          isOver ? "border-amber-400 bg-amber-50 font-bold" : "border-slate-300"
                        }`}
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={itemNotes[it.id] ?? ""}
                        onChange={(e) =>
                          setItemNotes((prev) => ({ ...prev, [it.id]: e.target.value }))
                        }
                        placeholder="Condition / partial note"
                        className="h-8 w-full rounded border border-slate-300 px-2"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {overDeliveredItems.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2 text-amber-950">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              <p className="font-bold">
                Over-Delivery Detected ({overDeliveredItems.length} item(s) exceed ordered quantity)
              </p>
            </div>
            {canOverride ? (
              <div className="space-y-2">
                <label className="inline-flex items-center gap-2 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isOverride}
                    onChange={(e) => setIsOverride(e.target.checked)}
                    className="rounded border-amber-400"
                  />
                  <span>Authorize Over-Delivery Override</span>
                </label>
                {isOverride && (
                  <input
                    type="text"
                    required
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Mandatory reason for accepting over-delivered quantity..."
                    className="h-8 w-full rounded border border-amber-300 bg-white px-2.5 text-xs"
                  />
                )}
              </div>
            ) : (
              <p className="text-[11px] font-semibold text-rose-700">
                Your profile cannot authorize over-deliveries. Reduce delivered quantity within remaining PO balance.
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Delivery Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Driver, vehicle number, packaging condition..."
              className="w-full rounded-lg border border-slate-300 p-2 text-xs"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Attach Delivery Note / Signed GRN (Optional)
            </label>
            <label className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-3 py-3 cursor-pointer hover:border-blue-400">
              <Upload className="h-4 w-4 text-blue-600" />
              <span className="font-medium text-slate-700">
                Upload PDF, Word, or Delivery Photo
              </span>
              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                onChange={(e) => {
                  handleSelectFiles(e.target.files);
                  e.target.value = "";
                }}
                className="hidden"
              />
            </label>
            {files.length > 0 && (
              <div className="mt-1.5 space-y-1">
                {files.map((f, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded border border-slate-200 bg-white px-2 py-1 text-[11px]"
                  >
                    <span className="truncate flex items-center gap-1">
                      <Paperclip className="h-3 w-3 text-slate-400" />
                      {f.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-slate-400 hover:text-rose-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2563EB] text-white font-semibold hover:bg-[#1d4ed8] disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Truck className="h-3.5 w-3.5" />
            )}
            <span>Save Delivery Record</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
