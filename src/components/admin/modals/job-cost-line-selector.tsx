"use client";

import React, { useMemo, useState } from "react";
import { JobCostItemInvoiceInfo } from "@/types/admin";
import { Decimal, formatCurrency, roundFinancial, toDecimal } from "@/lib/financial";
import { getCostItemSelectableAmount } from "@/lib/supplier-invoice-calc";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Filter,
  Layers,
  Loader2,
  Plus,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";

export interface JobCostCategoryGroup {
  id: string;
  name: string;
  sortOrder: number;
  subtotal: number;
  items: JobCostItemInvoiceInfo[];
}

export interface JobCostTotalsSummary {
  originalBudgetTotal: number;
  totalCostItemsInvoiced: number;
  totalCostItemsRemaining: number;
  jobActiveSupplierCost: number;
  jobRemainingBudget: number;
}

interface JobCostLineSelectorProps {
  jobId: string;
  jobCode?: string;
  categories: JobCostCategoryGroup[];
  totals?: JobCostTotalsSummary | null;
  isLoading: boolean;
  loadError?: string;
  addedCostItemIds: Set<string>;
  canManualEntry: boolean;
  canOverrideBudget: boolean;
  onAddSelectedItems: (items: JobCostItemInvoiceInfo[]) => void;
  onAddManualRow?: () => void;
  onRetryLoad?: () => void;
}

export function JobCostLineSelector({
  jobCode,
  categories,
  totals,
  isLoading,
  loadError,
  addedCostItemIds,
  canManualEntry,
  canOverrideBudget,
  onAddSelectedItems,
  onAddManualRow,
  onRetryLoad,
}: JobCostLineSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Flatten all cost items across all categories in stable Excel order
  const allItems = useMemo(() => {
    const list: JobCostItemInvoiceInfo[] = [];
    categories.forEach((cat) => {
      (cat.items || []).forEach((it) => {
        list.push(it);
      });
    });
    return list;
  }, [categories]);

  // Eligibility:
  // - Cannot re-select an item already added in the invoice rows (duplicate prevention).
  // - Selectable individually if remaining > 0 OR user has override permission.
  // - Included in "Select All Eligible" across all categories if remaining > 0 (or if all items <= 0 and override allowed).
  const selectableItems = useMemo(() => {
    return allItems.filter((ci) => {
      if (addedCostItemIds.has(ci.id)) return false;
      return ci.remainingAmount > 0.009 || canOverrideBudget;
    });
  }, [allItems, addedCostItemIds, canOverrideBudget]);

  const validSelectableIdSet = useMemo(
    () => new Set(selectableItems.map((ci) => ci.id)),
    [selectableItems]
  );

  // Exclude items already added to invoice rows or unavailable without synchronous setState in effects
  const effectiveSelectedIds = useMemo(() => {
    const next = new Set<string>();
    selectedIds.forEach((id) => {
      if (validSelectableIdSet.has(id)) {
        next.add(id);
      }
    });
    return next;
  }, [selectedIds, validSelectableIdSet]);

  const selectAllEligibleItems = useMemo(() => {
    const withRemaining = selectableItems.filter((ci) => ci.remainingAmount > 0.009);
    if (withRemaining.length > 0) return withRemaining;
    return canOverrideBudget ? selectableItems : [];
  }, [selectableItems, canOverrideBudget]);

  // Filtered list based on search & category dropdown
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allItems.filter((ci) => {
      if (selectedCategoryFilter !== "all" && ci.categoryName !== selectedCategoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        ci.description.toLowerCase().includes(q) ||
        ci.categoryName.toLowerCase().includes(q) ||
        (ci.itemNumber != null && String(ci.itemNumber).includes(q)) ||
        (ci.rcNrc && ci.rcNrc.toLowerCase().includes(q))
      );
    });
  }, [allItems, searchQuery, selectedCategoryFilter]);

  const filteredEligibleItems = useMemo(() => {
    return filteredItems.filter((ci) => {
      if (addedCostItemIds.has(ci.id)) return false;
      return ci.remainingAmount > 0.009 || (canOverrideBudget && selectAllEligibleItems.some((e) => e.id === ci.id));
    });
  }, [filteredItems, addedCostItemIds, canOverrideBudget, selectAllEligibleItems]);

  const selectedItemsList = useMemo(() => {
    return allItems.filter((ci) => effectiveSelectedIds.has(ci.id) && !addedCostItemIds.has(ci.id));
  }, [allItems, effectiveSelectedIds, addedCostItemIds]);

  const selectedSummary = useMemo(() => {
    let totalRemaining = new Decimal(0);
    let totalOriginal = new Decimal(0);
    selectedItemsList.forEach((ci) => {
      totalRemaining = totalRemaining.plus(getCostItemSelectableAmount(ci));
      totalOriginal = totalOriginal.plus(roundFinancial(ci.originalAmount, 2));
    });
    return {
      count: selectedItemsList.length,
      totalAmount: roundFinancial(totalRemaining, 2).toNumber(),
      totalOriginal: roundFinancial(totalOriginal, 2).toNumber(),
    };
  }, [selectedItemsList]);

  const allEligibleSelected =
    selectAllEligibleItems.length > 0 &&
    selectAllEligibleItems.every((ci) => effectiveSelectedIds.has(ci.id));

  const someEligibleSelected =
    effectiveSelectedIds.size > 0 && !allEligibleSelected;

  const isFilteredActive =
    searchQuery.trim().length > 0 || selectedCategoryFilter !== "all";

  const handleToggleItem = (ci: JobCostItemInvoiceInfo) => {
    if (addedCostItemIds.has(ci.id)) return;
    if (ci.remainingAmount <= 0.009 && !canOverrideBudget) return;

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(ci.id)) {
        next.delete(ci.id);
      } else {
        next.add(ci.id);
      }
      return next;
    });
  };

  // Select All selects ALL eligible cost lines belonging to the selected Job across ALL categories
  // without creating duplicates when filters or search change.
  const handleToggleSelectAll = () => {
    if (selectAllEligibleItems.length === 0) return;
    if (allEligibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectAllEligibleItems.map((ci) => ci.id)));
    }
  };

  const handleSelectFiltered = () => {
    if (filteredEligibleItems.length === 0) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredEligibleItems.forEach((ci) => next.add(ci.id));
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleAddSelectedClick = () => {
    if (selectedItemsList.length === 0) return;
    onAddSelectedItems(selectedItemsList);
    setSelectedIds(new Set());
  };

  const getStatusBadge = (status: JobCostItemInvoiceInfo["invoicedStatus"]) => {
    switch (status) {
      case "FULLY_INVOICED":
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
            FULLY INVOICED
          </span>
        );
      case "OVER_INVOICED":
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
            OVER BUDGET
          </span>
        );
      case "PARTIAL":
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
            PARTIAL
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            UNINVOICED
          </span>
        );
    }
  };

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/30 overflow-hidden shadow-2xs">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-100/90 px-4 py-2.5 border-b border-slate-200">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-7 w-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
            <Layers className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <h5 className="text-xs font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
              <span>Load Job Excel Cost Lines</span>
              {jobCode && (
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                  {jobCode}
                </span>
              )}
              {!isLoading && allItems.length > 0 && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white text-slate-600 border border-slate-200">
                  {allItems.length} Line{allItems.length !== 1 ? "s" : ""} • {categories.length} Categor{categories.length !== 1 ? "ies" : "y"}
                </span>
              )}
            </h5>
            {totals && allItems.length > 0 && (
              <p className="text-[10px] text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                <span>
                  Excel Cost Total:{" "}
                  <strong className="font-mono text-slate-700">
                    {formatCurrency(totals.originalBudgetTotal, { showCurrencyPrefix: true })}
                  </strong>
                </span>
                <span>
                  Previously Invoiced:{" "}
                  <strong className="font-mono text-amber-700">
                    {formatCurrency(totals.totalCostItemsInvoiced, { showCurrencyPrefix: true })}
                  </strong>
                </span>
                <span>
                  Remaining Cost Balance:{" "}
                  <strong
                    className={`font-mono ${
                      totals.totalCostItemsRemaining <= 0 ? "text-rose-600" : "text-emerald-700"
                    }`}
                  >
                    {formatCurrency(totals.totalCostItemsRemaining, { showCurrencyPrefix: true })}
                  </strong>
                </span>
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsCollapsed((c) => !c)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-[11px] font-semibold cursor-pointer"
        >
          <span>{isCollapsed ? "Show Cost Lines" : "Collapse"}</span>
          {isCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
      </div>

      {!isCollapsed && (
        <div className="p-3.5 space-y-3 bg-white">
          {isLoading ? (
            <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              <p className="text-xs font-semibold">
                Loading saved Excel cost categories & line items for this Job...
              </p>
            </div>
          ) : loadError ? (
            <div className="p-3.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 flex items-center justify-between gap-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-xs">Could not load Job cost lines</p>
                  <p className="text-[11px] text-rose-700 mt-0.5">{loadError}</p>
                </div>
              </div>
              {onRetryLoad && (
                <button
                  type="button"
                  onClick={onRetryLoad}
                  className="px-3 py-1.5 rounded-lg bg-white border border-rose-300 text-rose-700 text-[11px] font-semibold hover:bg-rose-100 cursor-pointer shrink-0"
                >
                  Retry
                </button>
              )}
            </div>
          ) : allItems.length === 0 ? (
            /* Job without saved Excel cost breakdown lines */
            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-xs text-amber-900">
                    No Saved Excel Cost Breakdown Lines Found for This Job
                  </p>
                  {canManualEntry ? (
                    <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                      This Job does not have structured cost lines from an Excel upload. You can enter
                      manual supplier invoice rows directly in the entries table below.
                    </p>
                  ) : (
                    <p className="text-[11px] text-rose-700 mt-0.5 leading-relaxed font-medium">
                      Your role does not have &ldquo;Manual Invoice Line Entry&rdquo; permission to add
                      unlinked manual items on Jobs without saved Excel cost lines. Please contact a
                      Supervisor or Administrator.
                    </p>
                  )}
                </div>
              </div>
              {canManualEntry && onAddManualRow && (
                <button
                  type="button"
                  onClick={onAddManualRow}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Manual Row</span>
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Search, Category Filter & Selection Action Controls */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
                {/* Search + Category Filter */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search cost lines by description or category..."
                      className="w-full h-8.5 pl-8 pr-7 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        title="Clear search"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="relative min-w-[190px]">
                    <Filter className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                    <select
                      value={selectedCategoryFilter}
                      onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                      aria-label="Filter by cost category"
                      className="w-full h-8.5 pl-8 pr-7 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 font-medium focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                    >
                      <option value="all">
                        All Categories ({allItems.length})
                      </option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.name}>
                          {cat.name} ({cat.items.length}) — {formatCurrency(cat.subtotal)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Selection Controls + Add Selected Items CTA */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Select All Eligible across all categories */}
                  <label
                    className={`inline-flex items-center gap-1.5 h-8.5 px-2.5 rounded-lg border text-[11px] font-semibold select-none ${
                      selectAllEligibleItems.length === 0
                        ? "bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed"
                        : allEligibleSelected
                        ? "bg-blue-50 border-blue-300 text-blue-800 cursor-pointer"
                        : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={allEligibleSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someEligibleSelected;
                      }}
                      disabled={selectAllEligibleItems.length === 0}
                      onChange={handleToggleSelectAll}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span>Select All ({selectAllEligibleItems.length})</span>
                  </label>

                  {isFilteredActive && filteredEligibleItems.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSelectFiltered}
                      className="h-8.5 px-2.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-[11px] font-semibold cursor-pointer"
                    >
                      Select Matching ({filteredEligibleItems.length})
                    </button>
                  )}

                  {selectedSummary.count > 0 && (
                    <button
                      type="button"
                      onClick={handleClearSelection}
                      className="h-8.5 px-2.5 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 text-[11px] font-semibold cursor-pointer inline-flex items-center gap-1"
                    >
                      <X className="h-3 w-3" />
                      <span>Clear Selection</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleAddSelectedClick}
                    disabled={selectedSummary.count === 0}
                    className="h-8.5 inline-flex items-center gap-1.5 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>
                      Add Selected Items
                      {selectedSummary.count > 0 ? ` (${selectedSummary.count})` : ""}
                    </span>
                  </button>
                </div>
              </div>

              {/* Selected Count & Total Amount Summary Bar + Individual Quick Remove Chips */}
              <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-slate-600">
                      Selected Items:{" "}
                      <strong className="font-mono text-blue-700">{selectedSummary.count}</strong>
                    </span>
                    <span className="text-slate-300">|</span>
                    <span className="text-slate-600">
                      Selected Total Amount:{" "}
                      <strong className="font-mono text-emerald-700">
                        {formatCurrency(selectedSummary.totalAmount, { showCurrencyPrefix: true })}
                      </strong>
                    </span>
                    {addedCostItemIds.size > 0 && (
                      <>
                        <span className="text-slate-300">|</span>
                        <span className="text-emerald-700 font-semibold inline-flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          {addedCostItemIds.size} Already in Invoice Entries
                        </span>
                      </>
                    )}
                  </div>

                  {!canOverrideBudget && (
                    <span className="text-[10px] text-slate-500 flex items-center gap-1">
                      <ShieldAlert className="h-3 w-3 text-amber-500" />
                      Fully invoiced lines require Override Budget permission
                    </span>
                  )}
                </div>

                {selectedItemsList.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-200/80 max-h-20 overflow-y-auto">
                    {selectedItemsList.map((ci) => (
                      <span
                        key={ci.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-[10px] text-blue-900"
                      >
                        <span className="font-bold text-blue-700">{ci.categoryName}:</span>
                        <span className="max-w-[160px] truncate">{ci.description}</span>
                        <span className="font-mono text-slate-600">
                          ({formatCurrency(getCostItemSelectableAmount(ci))})
                        </span>
                        <button
                          type="button"
                          onClick={() => handleToggleItem(ci)}
                          className="text-blue-500 hover:text-rose-600 ml-0.5 cursor-pointer"
                          title={`Remove "${ci.description}" from selection`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Searchable & Filterable Job Cost Lines Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-2.5 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={allEligibleSelected}
                            ref={(el) => {
                              if (el) el.indeterminate = someEligibleSelected;
                            }}
                            disabled={selectAllEligibleItems.length === 0}
                            onChange={handleToggleSelectAll}
                            title="Select / Deselect all eligible cost lines across the Job"
                            className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </th>
                        <th className="py-2 px-2.5 w-40">Cost Category</th>
                        <th className="py-2 px-2.5 min-w-[220px]">Description</th>
                        <th className="py-2 px-2.5 w-32 text-right">Original Amount</th>
                        <th className="py-2 px-2.5 w-36 text-right">Prev. Invoiced</th>
                        <th className="py-2 px-2.5 w-32 text-right">Remaining Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                            No Job cost lines match your current search or category filter.
                          </td>
                        </tr>
                      ) : (
                        filteredItems.map((ci) => {
                          const isAdded = addedCostItemIds.has(ci.id);
                          const isSelected = effectiveSelectedIds.has(ci.id);
                          const hasRemaining = ci.remainingAmount > 0.009;
                          const isBlocked = isAdded || (!hasRemaining && !canOverrideBudget);

                          return (
                            <tr
                              key={ci.id}
                              onClick={() => {
                                if (!isBlocked) handleToggleItem(ci);
                              }}
                              className={`transition-colors ${
                                isAdded
                                  ? "bg-emerald-50/50 opacity-75"
                                  : isBlocked
                                  ? "bg-slate-50/70 opacity-60 cursor-not-allowed"
                                  : isSelected
                                  ? "bg-blue-50/70 cursor-pointer"
                                  : "hover:bg-slate-50 cursor-pointer"
                              }`}
                            >
                              <td
                                className="py-2 px-2.5 text-center"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {isAdded ? (
                                  <span
                                    title="Already added to Supplier Invoice entries below"
                                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
                                  >
                                    <Check className="h-3 w-3" />
                                  </span>
                                ) : (
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    disabled={isBlocked}
                                    onChange={() => handleToggleItem(ci)}
                                    title={
                                      !hasRemaining && !canOverrideBudget
                                        ? "Fully invoiced (requires Override Job Cost Line Budget permission)"
                                        : `Select ${ci.description}`
                                    }
                                    className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed"
                                  />
                                )}
                              </td>

                              <td className="py-2 px-2.5 align-top">
                                <span className="inline-block px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-semibold text-slate-700">
                                  {ci.categoryName}
                                </span>
                              </td>

                              <td className="py-2 px-2.5 align-top">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {ci.itemNumber != null && (
                                    <span className="font-mono text-[10px] text-slate-400">
                                      #{ci.itemNumber}
                                    </span>
                                  )}
                                  <span className="font-semibold text-slate-900">
                                    {ci.description}
                                  </span>
                                  {ci.rcNrc && (
                                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                      {ci.rcNrc}
                                    </span>
                                  )}
                                  {isAdded && (
                                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                                      ADDED TO ENTRIES
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
                                  <span className="font-mono">
                                    Excel: {ci.quantity} {ci.unit} × {formatCurrency(ci.rate)}
                                  </span>
                                  {getStatusBadge(ci.invoicedStatus)}
                                </div>
                              </td>

                              <td className="py-2 px-2.5 text-right font-mono font-semibold text-slate-800 align-top">
                                {formatCurrency(ci.originalAmount)}
                              </td>

                              <td className="py-2 px-2.5 text-right align-top">
                                <span className="font-mono text-slate-700 block">
                                  {formatCurrency(ci.invoicedAmount)}
                                </span>
                                {ci.invoiceNumbers.length > 0 && (
                                  <span
                                    className="text-[9px] text-slate-400 block truncate max-w-[130px] ml-auto"
                                    title={ci.invoiceNumbers.join(", ")}
                                  >
                                    {ci.invoiceNumbers.join(", ")}
                                  </span>
                                )}
                              </td>

                              <td className="py-2 px-2.5 text-right font-mono font-bold align-top">
                                <span
                                  className={
                                    ci.remainingAmount <= 0.009
                                      ? "text-rose-600"
                                      : "text-emerald-700"
                                  }
                                >
                                  {formatCurrency(ci.remainingAmount)}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
