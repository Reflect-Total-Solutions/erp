"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  Building2,
  Download,
  Edit,
  Eye,
  FileSpreadsheet,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { useAdminData } from "@/context/admin-data-context";
import { StatusBadge } from "@/components/admin/ui/badge";
import { Pagination } from "@/components/admin/ui/pagination";
import { SearchField } from "@/components/admin/ui/search-field";
import { TableSkeleton } from "@/components/ui/loading/table-skeleton";
import { formatCurrency } from "@/lib/financial";
import { PurchaseOrder } from "@/types/admin";

export function PoListView({
  initialSupplierId = "",
  initialSearch = "",
}: {
  initialSupplierId?: string;
  initialSearch?: string;
} = {}) {
  const { can, showToast, currentRole, currentUserId, activeUserId } = useAdminData();

  const canView = can("purchaseOrders", "view");
  const canCreate = can("purchaseOrders", "create");
  const canEdit = can("purchaseOrders", "edit");
  const canDelete = can("purchaseOrders", "delete");
  const canRestore = can("purchaseOrders", "restore");
  const canPermanentDelete = can("purchaseOrders", "permanentDelete");
  const canExport = can("purchaseOrders", "export");
  const canDownloadExcel = can("purchaseOrders", "downloadExcel") || can("purchaseOrders", "download");

  const [viewMode, setViewMode] = useState<"active" | "trash">("active");
  const [search, setSearch] = useState(initialSearch || "");
  const [supplierFilter, setSupplierFilter] = useState(initialSupplierId || "all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [counts, setCounts] = useState({ active: 0, trash: 0 });
  const [canViewFinancials, setCanViewFinancials] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!canView) return;
    setIsLoading(true);
    try {
      const qs = new URLSearchParams({
        trash: viewMode === "trash" ? "true" : "false",
        page: String(page),
        limit: String(pageSize),
      });
      if (search.trim()) qs.set("search", search.trim());
      if (supplierFilter && supplierFilter !== "all") qs.set("supplierId", supplierFilter);
      if (statusFilter !== "all") qs.set("status", statusFilter);
      if (dateFrom) qs.set("dateFrom", dateFrom);
      if (dateTo) qs.set("dateTo", dateTo);

      const res = await fetch(`/api/purchase-orders?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || "Failed to load Purchase Orders.");
      }
      setOrders(json.data || []);
      setTotalItems(json.pagination?.totalItems ?? 0);
      setTotalPages(json.pagination?.totalPages ?? 1);
      setCounts(json.counts || { active: 0, trash: 0 });
      setCanViewFinancials(Boolean(json.meta?.canViewFinancials));
    } catch (err: any) {
      showToast("Error", err?.message || "Failed to fetch Purchase Orders.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [
    canView,
    viewMode,
    page,
    pageSize,
    search,
    supplierFilter,
    statusFilter,
    dateFrom,
    dateTo,
    showToast,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchOrders();
    }, 150);
    return () => clearTimeout(timer);
  }, [fetchOrders]);

  const handleExportCsv = () => {
    const qs = new URLSearchParams({
      export: "csv",
      trash: viewMode === "trash" ? "true" : "false",
    });
    if (search.trim()) qs.set("search", search.trim());
    if (supplierFilter && supplierFilter !== "all") qs.set("supplierId", supplierFilter);
    if (statusFilter !== "all") qs.set("status", statusFilter);
    if (dateFrom) qs.set("dateFrom", dateFrom);
    if (dateTo) qs.set("dateTo", dateTo);
    window.open(`/api/purchase-orders?${qs.toString()}`, "_blank");
  };

  const handleSoftDelete = async (po: PurchaseOrder) => {
    if (!window.confirm(`Move Purchase Order ${po.poNumber} to Trash?`)) return;
    setActionBusyId(po.id);
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || "Failed to move PO to Trash.");
      }
      showToast("Moved to Trash", json.message, "success");
      fetchOrders();
    } catch (err: any) {
      showToast("Delete Blocked", err?.message || "Failed to delete PO.", "error");
    } finally {
      setActionBusyId(null);
    }
  };

  const handleRestore = async (po: PurchaseOrder) => {
    setActionBusyId(po.id);
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}/restore`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || "Failed to restore PO.");
      }
      showToast("PO Restored", json.message, "success");
      fetchOrders();
    } catch (err: any) {
      showToast("Restore Failed", err?.message || "Failed to restore PO.", "error");
    } finally {
      setActionBusyId(null);
    }
  };

  const handlePermanentDelete = async (po: PurchaseOrder) => {
    if (
      !window.confirm(
        `PERMANENTLY DELETE Purchase Order ${po.poNumber}? This cannot be undone.`
      )
    )
      return;
    setActionBusyId(po.id);
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}?permanent=true`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || "Failed to permanently delete PO.");
      }
      showToast("Permanently Deleted", json.message, "success");
      fetchOrders();
    } catch (err: any) {
      showToast("Permanent Delete Blocked", err?.message || "Action blocked.", "error");
    } finally {
      setActionBusyId(null);
    }
  };

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center p-10 bg-white rounded-2xl border border-slate-200 text-center max-w-lg mx-auto mt-8 shadow-xs">
        <div className="h-14 w-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-500 mt-2">
          You do not have permission to view Purchase Orders ({currentRole}).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 text-xs">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-900">All Purchase Orders</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage Purchase Orders across approved Jobs, download Excel PO sheets, and track billed invoices.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={fetchOrders}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>

          {canExport && (
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-emerald-600" />
              <span>Export CSV</span>
            </button>
          )}

          {canCreate && (
            <Link
              href="/admin/purchase-orders/create"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2563EB] text-white font-semibold hover:bg-[#1d4ed8] shadow-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create Purchase Order</span>
            </Link>
          )}
        </div>
      </div>

      {/* Active vs Trash Tabs + Filter Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setViewMode("active");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                viewMode === "active"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Active POs ({counts.active})
            </button>
            {(canDelete || canRestore || canPermanentDelete) && (
              <button
                type="button"
                onClick={() => {
                  setViewMode("trash");
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                  viewMode === "trash"
                    ? "bg-rose-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Trash ({counts.trash})</span>
              </button>
            )}
          </div>

          <div className="w-full sm:w-72">
            <SearchField
              value={search}
              isLoading={isLoading}
              onChange={(val) => {
                setSearch(val);
                setPage(1);
              }}
              placeholder="Search PO No, Job, Supplier..."
            />
          </div>
        </div>

        {supplierFilter && supplierFilter !== "all" && (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-xs text-indigo-800">
            <span>
              Filtering Purchase Orders for Supplier ID:{" "}
              <strong className="font-mono">{orders[0]?.supplierName || supplierFilter}</strong>
            </span>
            <button
              type="button"
              onClick={() => {
                setSupplierFilter("all");
                setPage(1);
              }}
              className="text-[11px] font-bold text-indigo-700 hover:underline cursor-pointer"
            >
              Show All Suppliers
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
              PO Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs"
            >
              <option value="all">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="PENDING">Pending Approval</option>
              <option value="APPROVED">Approved</option>
              <option value="ISSUED">Issued</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
              PO Date From
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
              PO Date To
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs"
            />
          </div>
        </div>
      </div>

      {/* PO Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        {isLoading && orders.length === 0 ? (
          <TableSkeleton rows={8} columns={8} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
                    <th className="py-3 px-3.5">PO Number & Date</th>
                    <th className="py-3 px-3.5">Linked Job</th>
                    <th className="py-3 px-3.5">Supplier</th>
                    <th className="py-3 px-3.5 text-right">PO Total</th>
                    <th className="py-3 px-3.5 text-right">Invoiced</th>
                    <th className="py-3 px-3.5 text-center">PO Status</th>
                    <th className="py-3 px-3.5">Created By</th>
                    <th className="py-3 px-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        <ShoppingCart className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                        <p className="font-semibold text-slate-600 text-sm">
                          No Purchase Orders Found
                        </p>
                        <p className="text-[11px] mt-1">
                          {viewMode === "trash"
                            ? "Trash is currently empty."
                            : "Try clearing filters or create a new Purchase Order."}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    orders.map((po) => {
                      const viewerId = activeUserId || currentUserId;
                      const showPrice = canViewFinancials || po.createdById === viewerId;
                      const canRowEdit =
                        viewMode === "active" &&
                        canEdit &&
                        ["DRAFT", "REJECTED"].includes(po.status);
                      const canRowTrash =
                        viewMode === "active" &&
                        canDelete &&
                        !["ISSUED"].includes(po.status);

                      return (
                        <tr key={po.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <Link
                              href={`/admin/purchase-orders/${po.id}`}
                              className="font-mono font-bold text-blue-700 hover:underline block"
                            >
                              {po.poNumber}
                            </Link>
                            <span className="text-[11px] text-slate-400">{po.poDate}</span>
                          </td>

                          <td className="py-3 px-3.5">
                            <Link
                              href={`/admin/jobs/${po.jobId}`}
                              className="font-mono text-[11px] font-bold text-slate-700 hover:text-blue-600 flex items-center gap-1"
                            >
                              <Briefcase className="h-3 w-3 text-slate-400" />
                              {po.jobCode}
                            </Link>
                            <p className="text-[11px] text-slate-500 truncate max-w-[180px]">
                              {po.jobName}
                            </p>
                          </td>

                          <td className="py-3 px-3.5">
                            <div className="font-semibold text-slate-800 flex items-center gap-1">
                              <Building2 className="h-3 w-3 text-slate-400 shrink-0" />
                              <span className="truncate max-w-[160px]">{po.supplierName}</span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-400">
                              {po.supplierCode}
                            </span>
                          </td>

                          <td className="py-3 px-3.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                            {showPrice
                              ? formatCurrency(po.grandTotal, { showCurrencyPrefix: true })
                              : "Restricted"}
                          </td>

                          <td className="py-3 px-3.5 text-right font-mono whitespace-nowrap">
                            {showPrice ? (
                              <div>
                                <span className="font-semibold text-emerald-700">
                                  {formatCurrency(po.invoicedTotal || 0)}
                                </span>
                                <span className="block text-[10px] text-slate-400">
                                  Rem: {formatCurrency(po.remainingUninvoiced ?? po.grandTotal)}
                                </span>
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>

                          <td className="py-3 px-3.5 text-center whitespace-nowrap">
                            <StatusBadge status={po.status} />
                          </td>

                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <span className="font-medium text-slate-700 block">
                              {po.createdByName || "Admin"}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {po.itemCount ?? 0} item(s)
                            </span>
                          </td>

                          <td className="py-3 px-3.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <Link
                                href={`/admin/purchase-orders/${po.id}`}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-blue-700 hover:bg-blue-50"
                                title="View PO Details"
                              >
                                <Eye className="h-4 w-4" />
                              </Link>

                              {canRowEdit && (
                                <Link
                                  href={`/admin/purchase-orders/${po.id}/edit`}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-amber-700 hover:bg-amber-50"
                                  title="Edit PO"
                                >
                                  <Edit className="h-4 w-4" />
                                </Link>
                              )}

                              {viewMode === "active" && canDownloadExcel && (
                                <a
                                  href={`/api/purchase-orders/${po.id}/export/excel`}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-emerald-50"
                                  title="Download Excel PO"
                                >
                                  <FileSpreadsheet className="h-4 w-4" />
                                </a>
                              )}

                              {canRowTrash && (
                                <button
                                  type="button"
                                  disabled={actionBusyId === po.id}
                                  onClick={() => handleSoftDelete(po)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                  title="Move PO to Trash"
                                >
                                  {actionBusyId === po.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </button>
                              )}

                              {viewMode === "trash" && canRestore && (
                                <button
                                  type="button"
                                  disabled={actionBusyId === po.id}
                                  onClick={() => handleRestore(po)}
                                  className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 cursor-pointer"
                                  title="Restore PO"
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </button>
                              )}

                              {viewMode === "trash" && canPermanentDelete && (
                                <button
                                  type="button"
                                  disabled={actionBusyId === po.id}
                                  onClick={() => handlePermanentDelete(po)}
                                  className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                                  title="Permanently Delete PO"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-3 border-t border-slate-200 bg-slate-50/50">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                pageSize={pageSize}
                totalItems={totalItems}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
