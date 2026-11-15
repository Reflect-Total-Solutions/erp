"use client";

import React, { useState } from "react";
import { Modal } from "@/components/admin/ui/modal";
import { Job, JobCostCategory, JobCostItem, JobCostSummary, JobStatus } from "@/types/admin";
import {
  Briefcase,
  DollarSign,
  Plus,
  Trash2,
  Calendar,
  Layers,
  Save,
  Loader2,
  AlertCircle,
  X,
  FileSpreadsheet,
} from "lucide-react";
import { useAdminData } from "@/context/admin-data-context";
import {
  formatCurrency,
  multiplyFinancial,
  sumFinancial,
  roundFinancial,
  calculateTaxFinancial,
} from "@/lib/financial";

interface EditJobCostsModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: Job;
  onSaveSuccess: (updatedJob: Job) => void;
}

interface EditableCategory {
  id?: string;
  name: string;
  sortOrder: number;
  subtotal: number;
  items: EditableItem[];
}

interface EditableItem {
  id?: string;
  itemNumber?: number;
  description: string;
  rcNrc: "RC" | "NRC";
  quantity: number;
  rate: number;
  totalCost: number;
  sortOrder: number;
}

function buildInitialCategories(job: Job): EditableCategory[] {
  if (job.costCategories && job.costCategories.length > 0) {
    return job.costCategories.map((c, cIdx) => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder || cIdx + 1,
      subtotal: Number(c.subtotal || 0),
      items: (c.items || []).map((i, iIdx) => ({
        id: i.id,
        itemNumber: i.itemNumber || iIdx + 1,
        description: i.description || "",
        rcNrc: (i.rcNrc as "RC" | "NRC") || "NRC",
        quantity: Number(i.quantity || 1),
        rate: Number(i.rate || 0),
        totalCost: Number(i.totalCost || 0),
        sortOrder: i.sortOrder || iIdx + 1,
      })),
    }));
  }
  if (job.costItems && job.costItems.length > 0) {
    return [
      {
        name: "Production Cost",
        sortOrder: 1,
        subtotal: job.costItems.reduce((s, i) => s + (Number(i.totalCost) || 0), 0),
        items: job.costItems.map((i, iIdx) => ({
          id: i.id,
          itemNumber: i.itemNumber || iIdx + 1,
          description: i.description,
          rcNrc: (i.rcNrc as "RC" | "NRC") || "NRC",
          quantity: Number(i.quantity || 1),
          rate: Number(i.rate || 0),
          totalCost: Number(i.totalCost || 0),
          sortOrder: i.sortOrder || iIdx + 1,
        })),
      },
    ];
  }
  return [
    {
      name: "Production Cost",
      sortOrder: 1,
      subtotal: 0,
      items: [],
    },
  ];
}

export function EditJobCostsModal(props: EditJobCostsModalProps) {
  if (!props.isOpen) return null;
  return (
    <EditJobCostsModalInner
      key={`${props.job.id}-${props.job.updatedAt || ""}`}
      {...props}
    />
  );
}

function EditJobCostsModalInner({
  isOpen,
  onClose,
  job,
  onSaveSuccess,
}: EditJobCostsModalProps) {
  const { showToast, refreshJobs } = useAdminData();

  // Metadata states
  const [name, setName] = useState(job.name || "");
  const [jobCode, setJobCode] = useState(job.jobCode || "");
  const [clientName, setClientName] = useState(job.clientName || "");
  const [date, setDate] = useState(job.date || "");
  const [commencingDate, setCommencingDate] = useState(job.commencingDate || job.date || "");
  const [handledBy, setHandledBy] = useState(job.handledBy || "");
  const [description, setDescription] = useState(job.description || "");
  const [status, setStatus] = useState<JobStatus>(job.status || "Active");

  // Cost Categories & Items
  const [categories, setCategories] = useState<EditableCategory[]>(() =>
    buildInitialCategories(job)
  );

  // Cost Summary & Taxes
  const [taxType, setTaxType] = useState(job.costSummary?.taxType || "SSCL");
  const [taxRate, setTaxRate] = useState<number>(Number(job.costSummary?.taxRate ?? 2.5));
  const [agencyOperationFee, setAgencyOperationFee] = useState<number>(Number(job.costSummary?.agencyOperationFee || 0));
  const [agencyProductionFee, setAgencyProductionFee] = useState<number>(Number(job.costSummary?.agencyProductionFee || 0));
  const [adminCharges, setAdminCharges] = useState<number>(Number(job.costSummary?.adminCharges || 0));
  const [monitoringCost, setMonitoringCost] = useState<number>(Number(job.costSummary?.monitoringCost || 0));
  const [artworkCharges, setArtworkCharges] = useState<number>(Number(job.costSummary?.artworkCharges || 0));
  const [contingencies, setContingencies] = useState<number>(Number(job.costSummary?.contingencies || 0));

  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"info" | "categories" | "summary">("categories");

  // ── Calculation Helpers ──────────────────────────────────────────────────
  const allItemsList = categories.flatMap((c) => c.items);
  const itemsSubtotal = sumFinancial(allItemsList.map((i) => i.totalCost || 0)).toNumber();
  const productionCost = sumFinancial(
    allItemsList.filter((i) => i.rcNrc === "NRC").map((i) => i.totalCost || 0)
  ).toNumber();
  const runningCost = sumFinancial(
    allItemsList.filter((i) => i.rcNrc === "RC").map((i) => i.totalCost || 0)
  ).toNumber();

  const totalBeforeTax = sumFinancial([
    itemsSubtotal,
    agencyOperationFee || 0,
    agencyProductionFee || 0,
    adminCharges || 0,
    monitoringCost || 0,
    artworkCharges || 0,
    contingencies || 0,
  ]).toNumber();

  const taxAmount = calculateTaxFinancial(totalBeforeTax, Number(taxRate || 0)).toNumber();
  const grandTotal = sumFinancial([totalBeforeTax, taxAmount]).toNumber();

  // ── Category Actions ─────────────────────────────────────────────────────
  const handleAddCategory = () => {
    const newCatName = prompt("Enter new Cost Category Name (e.g. Branding, Sound & Lighting, Logistics):");
    if (!newCatName || !newCatName.trim()) return;

    setCategories((prev) => [
      ...prev,
      {
        name: newCatName.trim(),
        sortOrder: prev.length + 1,
        subtotal: 0,
        items: [],
      },
    ]);
  };

  const handleRemoveCategory = (catIdx: number) => {
    const target = categories[catIdx];
    if (confirm(`Are you sure you want to remove category "${target.name}" and all its items?`)) {
      setCategories((prev) => prev.filter((_, idx) => idx !== catIdx));
    }
  };

  const handleUpdateCategoryName = (catIdx: number, newName: string) => {
    setCategories((prev) =>
      prev.map((c, idx) => (idx === catIdx ? { ...c, name: newName } : c))
    );
  };

  // ── Item Actions ─────────────────────────────────────────────────────────
  const handleAddItem = (catIdx: number) => {
    setCategories((prev) =>
      prev.map((cat, idx) => {
        if (idx !== catIdx) return cat;
        const newItem: EditableItem = {
          itemNumber: cat.items.length + 1,
          description: "New Item Description",
          rcNrc: "NRC",
          quantity: 1,
          rate: 0,
          totalCost: 0,
          sortOrder: cat.items.length + 1,
        };
        const updatedItems = [...cat.items, newItem];
        const subtotal = sumFinancial(updatedItems.map((i) => i.totalCost)).toNumber();
        return { ...cat, items: updatedItems, subtotal };
      })
    );
  };

  const handleRemoveItem = (catIdx: number, itemIdx: number) => {
    setCategories((prev) =>
      prev.map((cat, idx) => {
        if (idx !== catIdx) return cat;
        const updatedItems = cat.items.filter((_, iIdx) => iIdx !== itemIdx);
        const subtotal = sumFinancial(updatedItems.map((i) => i.totalCost)).toNumber();
        return { ...cat, items: updatedItems, subtotal };
      })
    );
  };

  const handleUpdateItem = (
    catIdx: number,
    itemIdx: number,
    field: keyof EditableItem,
    value: any
  ) => {
    setCategories((prev) =>
      prev.map((cat, cIdx) => {
        if (cIdx !== catIdx) return cat;
        const updatedItems = cat.items.map((item, iIdx) => {
          if (iIdx !== itemIdx) return item;
          const updated = { ...item, [field]: value };
          if (field === "quantity" || field === "rate") {
            const q = field === "quantity" ? Number(value) || 0 : item.quantity;
            const r = field === "rate" ? Number(value) || 0 : item.rate;
            updated.totalCost = multiplyFinancial(q, r).toNumber();
          }
          return updated;
        });
        const subtotal = sumFinancial(updatedItems.map((i) => i.totalCost)).toNumber();
        return { ...cat, items: updatedItems, subtotal };
      })
    );
  };

  // ── Save Changes to Database ─────────────────────────────────────────────
  const handleSave = async () => {
    if (!name.trim()) {
      showToast("Validation Error", "Job title is required.", "error");
      return;
    }

    setIsSaving(true);

    try {
      const payload = {
        name: name.trim(),
        jobCode: jobCode.trim() || undefined,
        clientName: clientName.trim() || undefined,
        date,
        commencingDate: commencingDate || date,
        handledBy: handledBy.trim() || undefined,
        description: description.trim() || undefined,
        status,
        totalCost: itemsSubtotal,
        grandTotal,
        costCategories: categories.map((c, cIdx) => ({
          ...(c.id ? { id: c.id } : {}),
          name: c.name,
          sortOrder: cIdx + 1,
          subtotal: sumFinancial(c.items.map((i) => i.totalCost)).toNumber(),
          items: c.items.map((i, iIdx) => ({
            ...(i.id ? { id: i.id } : {}),
            itemNumber: iIdx + 1,
            description: i.description.trim() || "Item",
            rcNrc: i.rcNrc || "NRC",
            quantity: roundFinancial(Number(i.quantity) || 1, 4).toNumber(),
            rate: roundFinancial(Number(i.rate) || 0, 2).toNumber(),
            totalCost: roundFinancial(Number(i.totalCost) || 0, 2).toNumber(),
            sortOrder: iIdx + 1,
          })),
        })),
        costSummary: {
          productionCost,
          runningCost,
          agencyOperationFee: roundFinancial(agencyOperationFee || 0, 2).toNumber(),
          agencyProductionFee: roundFinancial(agencyProductionFee || 0, 2).toNumber(),
          adminCharges: roundFinancial(adminCharges || 0, 2).toNumber(),
          monitoringCost: roundFinancial(monitoringCost || 0, 2).toNumber(),
          artworkCharges: roundFinancial(artworkCharges || 0, 2).toNumber(),
          contingencies: roundFinancial(contingencies || 0, 2).toNumber(),
          subTotal: itemsSubtotal,
          totalBeforeTax,
          taxType: taxType || "SSCL",
          taxRate: roundFinancial(taxRate || 2.5, 3).toNumber(),
          taxAmount,
          grandTotal,
        },
      };

      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to update quotation and cost breakdown.");
      }

      await refreshJobs();
      showToast("Job Updated", "Quotation details and cost breakdown saved successfully.", "success");
      onSaveSuccess(json.data);
      onClose();
    } catch (err: any) {
      console.error("Error saving job:", err);
      showToast("Save Failed", err.message || "Failed to save updates.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Job Quotation & Dynamic Costs" maxWidth="4xl">
      <div className="space-y-4 py-1">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("categories")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "categories"
                ? "bg-blue-600 text-white shadow-2xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Cost Categories & Items ({allItemsList.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("summary")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "summary"
                ? "bg-blue-600 text-white shadow-2xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <DollarSign className="h-3.5 w-3.5" />
            <span>Financial Recap & Tax</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("info")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "info"
                ? "bg-blue-600 text-white shadow-2xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Briefcase className="h-3.5 w-3.5" />
            <span>Job Information</span>
          </button>
        </div>

        {/* Tab 1: Cost Categories & Dynamic Items */}
        {activeTab === "categories" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Manage and add custom cost categories, adjust quantities and unit rates.
              </span>
              <button
                type="button"
                onClick={handleAddCategory}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 px-3 py-1.5 text-xs font-semibold transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Category
              </button>
            </div>

            <div className="space-y-4 max-h-[440px] overflow-y-auto pr-1">
              {categories.map((cat, catIdx) => (
                <div key={catIdx} className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
                  {/* Category Header */}
                  <div className="flex items-center justify-between bg-slate-50 px-4 py-2.5 border-b border-slate-200">
                    <div className="flex items-center gap-2 flex-1 max-w-sm">
                      <span className="text-xs font-bold text-slate-400">#{catIdx + 1}</span>
                      <input
                        type="text"
                        value={cat.name}
                        onChange={(e) => handleUpdateCategoryName(catIdx, e.target.value)}
                        className="font-bold text-xs text-slate-900 bg-transparent border-b border-dashed border-slate-300 focus:border-blue-500 focus:outline-none w-full py-0.5"
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-700">
                        Subtotal: {formatCurrency(cat.subtotal, { showCurrencyPrefix: true })}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAddItem(catIdx)}
                        className="inline-flex items-center gap-1 rounded bg-[#2563EB] text-white px-2 py-1 text-[11px] font-semibold hover:bg-[#1d4ed8]"
                      >
                        <Plus className="h-3 w-3" />
                        Add Item
                      </button>
                      {categories.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCategory(catIdx)}
                          className="text-slate-400 hover:text-rose-600 p-1 rounded"
                          title="Delete Category"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Items Table */}
                  {cat.items.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      No items under this category yet. Click &quot;Add Item&quot; above to add one.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50/50 text-[11px] text-slate-500 border-b border-slate-100">
                          <tr>
                            <th className="px-3 py-1.5 w-10 text-center">#</th>
                            <th className="px-3 py-1.5">Description</th>
                            <th className="px-2 py-1.5 w-20 text-center">RC/NRC</th>
                            <th className="px-2 py-1.5 w-20 text-right">Qty</th>
                            <th className="px-3 py-1.5 w-28 text-right">Rate (Rs.)</th>
                            <th className="px-3 py-1.5 w-32 text-right">Total (Rs.)</th>
                            <th className="px-2 py-1.5 w-10 text-center"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {cat.items.map((item, itemIdx) => (
                            <tr key={itemIdx} className="hover:bg-slate-50/50">
                              <td className="px-3 py-2 text-center text-slate-400 text-[11px]">
                                {itemIdx + 1}
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={item.description}
                                  onChange={(e) =>
                                    handleUpdateItem(catIdx, itemIdx, "description", e.target.value)
                                  }
                                  className="w-full rounded border border-slate-200 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
                                />
                              </td>
                              <td className="px-2 py-2 text-center">
                                <select
                                  value={item.rcNrc || "NRC"}
                                  onChange={(e) =>
                                    handleUpdateItem(catIdx, itemIdx, "rcNrc", e.target.value)
                                  }
                                  className="rounded border border-slate-200 px-1.5 py-1 text-[11px] font-semibold focus:border-blue-500 focus:outline-none"
                                >
                                  <option value="NRC">NRC</option>
                                  <option value="RC">RC</option>
                                </select>
                              </td>
                              <td className="px-2 py-2 text-right">
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={item.quantity}
                                  onChange={(e) =>
                                    handleUpdateItem(catIdx, itemIdx, "quantity", e.target.value)
                                  }
                                  className="w-16 rounded border border-slate-200 px-1.5 py-1 text-right text-xs focus:border-blue-500 focus:outline-none"
                                />
                              </td>
                              <td className="px-3 py-2 text-right">
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={item.rate}
                                  onChange={(e) =>
                                    handleUpdateItem(catIdx, itemIdx, "rate", e.target.value)
                                  }
                                  className="w-24 rounded border border-slate-200 px-1.5 py-1 text-right text-xs focus:border-blue-500 focus:outline-none"
                                />
                              </td>
                              <td className="px-3 py-2 text-right font-semibold text-slate-900">
                                {formatCurrency(item.totalCost, { showCurrencyPrefix: false })}
                              </td>
                              <td className="px-2 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItem(catIdx, itemIdx)}
                                  className="text-slate-400 hover:text-rose-600 p-1 rounded"
                                  title="Delete item"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 2: Financial Summary & Taxes */}
        {activeTab === "summary" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/50 space-y-3">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Agency Charges & Optional Fees
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Agency Fee for Operations (Rs.)
                  </label>
                  <input
                    type="number"
                    value={agencyOperationFee}
                    onChange={(e) => setAgencyOperationFee(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs bg-white focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Agency Fee for Production (Rs.)
                  </label>
                  <input
                    type="number"
                    value={agencyProductionFee}
                    onChange={(e) => setAgencyProductionFee(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs bg-white focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Administration Charges (Rs.)
                  </label>
                  <input
                    type="number"
                    value={adminCharges}
                    onChange={(e) => setAdminCharges(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs bg-white focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Monitoring Cost (Rs.)
                  </label>
                  <input
                    type="number"
                    value={monitoringCost}
                    onChange={(e) => setMonitoringCost(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs bg-white focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Artwork & AW Charges (Rs.)
                  </label>
                  <input
                    type="number"
                    value={artworkCharges}
                    onChange={(e) => setArtworkCharges(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs bg-white focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Contingencies (Rs.)
                  </label>
                  <input
                    type="number"
                    value={contingencies}
                    onChange={(e) => setContingencies(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs bg-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Taxes & Totals */}
            <div className="rounded-xl border border-slate-200 p-4 bg-white space-y-3">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Tax & Grand Total Summary
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tax Label / Type</label>
                  <input
                    type="text"
                    value={taxType}
                    onChange={(e) => setTaxType(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                    placeholder="e.g. SSCL or VAT"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tax Rate (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={taxRate}
                    onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Calculated Totals Box */}
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Cost Items Subtotal:</span>
                  <span className="font-semibold">{formatCurrency(itemsSubtotal, { showCurrencyPrefix: true })}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Grand Total Before Tax:</span>
                  <span className="font-semibold">{formatCurrency(totalBeforeTax, { showCurrencyPrefix: true })}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>{taxType} ({taxRate}%):</span>
                  <span className="font-semibold">{formatCurrency(taxAmount, { showCurrencyPrefix: true })}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-blue-700 border-t border-slate-200 pt-2">
                  <span>Final Grand Total:</span>
                  <span>{formatCurrency(grandTotal, { showCurrencyPrefix: true })}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Job Information */}
        {activeTab === "info" && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Job Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Client Name</label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Job Number / Code</label>
                <input
                  type="text"
                  value={jobCode}
                  onChange={(e) => setJobCode(e.target.value.toUpperCase())}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Job Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as JobStatus)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 focus:border-blue-500 focus:outline-none"
                >
                  <option value="Active">Active</option>
                  <option value="In Review">In Review</option>
                  <option value="Pending">Pending</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Job Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Commencing Date</label>
                <input
                  type="date"
                  value={commencingDate}
                  onChange={(e) => setCommencingDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Handled By</label>
                <input
                  type="text"
                  value={handledBy}
                  onChange={(e) => setHandledBy(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Description / Brief</label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Modal Bottom Action Bar */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200">
          <div className="text-xs">
            <span className="text-slate-500">Recalculated Grand Total: </span>
            <span className="font-bold text-blue-700">
              {formatCurrency(grandTotal, { showCurrencyPrefix: true })}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-5 py-2 text-xs font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>Save Quotation & Recalculate</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
