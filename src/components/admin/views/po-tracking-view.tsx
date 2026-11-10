"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  Loader2,
  RefreshCw,
  Send,
  ShieldAlert,
  Truck,
} from "lucide-react";
import { useAdminData } from "@/context/admin-data-context";
import { StatusBadge } from "@/components/admin/ui/badge";
import { SearchField } from "@/components/admin/ui/search-field";
import { TableSkeleton } from "@/components/ui/loading/table-skeleton";
import { RecordDeliveryModal } from "@/components/admin/purchase-orders/record-delivery-modal";
import { PurchaseOrder } from "@/types/admin";

type TrackingFilter =
  | "active"
  | "APPROVED"
  | "ISSUED"
  | "PARTIALLY_DELIVERED"
  | "DELIVERED"
  | "overdue";

export function PoTrackingView() {
  const { can, showToast, currentRole } = useAdminData();
  const canView = can("purchaseOrders", "view");
  const canIssue = can("purchaseOrders", "issue");
  const canTrackDelivery = can("purchaseOrders", "trackDelivery");

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<TrackingFilter>("active");
  const [deliveryModalPo, setDeliveryModalPo] = useState<PurchaseOrder | null>(null);
  const [busyPoId, setBusyPoId] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    if (!canView) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/purchase-orders?trash=false&limit=200");
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || "Failed to load PO tracking data.");
      }
      setOrders(json.data || []);
    } catch (err: any) {
      showToast("Error", err?.message || "Failed to fetch tracking records.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [canView, showToast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadOrders();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadOrders]);

  const todayIso = useMemo(() => new Date().toISOString().split("T")[0], []);

  const trackableOrders = useMemo(() => {
    const allowed = new Set(["APPROVED", "ISSUED", "PARTIALLY_DELIVERED", "DELIVERED"]);
    return orders.filter((po) => allowed.has(po.status));
  }, [orders]);

  const counts = useMemo(() => {
    let approved = 0;
    let issued = 0;
    let partial = 0;
    let delivered = 0;
    let overdue = 0;

    trackableOrders.forEach((po) => {
      if (po.status === "APPROVED") approved++;
      else if (po.status === "ISSUED") issued++;
      else if (po.status === "PARTIALLY_DELIVERED") partial++;
      else if (po.status === "DELIVERED") delivered++;

      if (
        po.status !== "DELIVERED" &&
        po.expectedDeliveryDate &&
        po.expectedDeliveryDate < todayIso
      ) {
        overdue++;
      }
    });

    return {
      active: approved + issued + partial,
      approved,
      issued,
      partial,
      delivered,
      overdue,
    };
  }, [trackableOrders, todayIso]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return trackableOrders.filter((po) => {
      const isOverdue =
        po.status !== "DELIVERED" &&
        Boolean(po.expectedDeliveryDate && po.expectedDeliveryDate < todayIso);

      if (filterTab === "active" && po.status === "DELIVERED") return false;
      if (filterTab === "overdue" && !isOverdue) return false;
      if (
        ["APPROVED", "ISSUED", "PARTIALLY_DELIVERED", "DELIVERED"].includes(filterTab) &&
        po.status !== filterTab
      ) {
        return false;
      }

      if (!q) return true;
      return (
        po.poNumber.toLowerCase().includes(q) ||
        (po.jobCode && po.jobCode.toLowerCase().includes(q)) ||
        (po.jobName && po.jobName.toLowerCase().includes(q)) ||
        (po.supplierName && po.supplierName.toLowerCase().includes(q))
      );
    });
  }, [trackableOrders, filterTab, search, todayIso]);

  const handleOpenDeliveryModal = async (po: PurchaseOrder) => {
    setBusyPoId(po.id);
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}`);
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        setDeliveryModalPo(json.data);
      } else {
        setDeliveryModalPo(po);
      }
    } catch {
      setDeliveryModalPo(po);
    } finally {
      setBusyPoId(null);
    }
  };

  const handleMarkIssued = async (po: PurchaseOrder) => {
    setBusyPoId(po.id);
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}/approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ISSUE" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || "Failed to mark PO as issued.");
      }
      showToast("PO Issued", json.message, "success");
      await loadOrders();
    } catch (err: any) {
      showToast("Issue Failed", err?.message || "Failed to issue PO.", "error");
    } finally {
      setBusyPoId(null);
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
          You do not have permission to track Purchase Order deliveries ({currentRole}).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 text-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            PO Issue & Delivery Tracking Center
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitor Approved and Issued POs, detect overdue vendor shipments, and record partial or complete deliveries.
          </p>
        </div>

        <button
          type="button"
          onClick={loadOrders}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer self-start"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          <span>Refresh Tracking</span>
        </button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-slate-500 font-medium">Awaiting Delivery</span>
            <p className="text-2xl font-bold text-blue-700 mt-1">{counts.active}</p>
          </div>
          <Clock className="h-6 w-6 text-blue-500" />
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-slate-500 font-medium">Partially Delivered</span>
            <p className="text-2xl font-bold text-sky-600 mt-1">{counts.partial}</p>
          </div>
          <Truck className="h-6 w-6 text-sky-500" />
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-slate-500 font-medium">Overdue Shipments</span>
            <p
              className={`text-2xl font-bold mt-1 ${
                counts.overdue > 0 ? "text-rose-600" : "text-slate-800"
              }`}
            >
              {counts.overdue}
            </p>
          </div>
          <AlertTriangle
            className={`h-6 w-6 ${counts.overdue > 0 ? "text-rose-500" : "text-slate-400"}`}
          />
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-slate-500 font-medium">Completed Deliveries</span>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{counts.delivered}</p>
          </div>
          <CheckCircle2 className="h-6 w-6 text-emerald-500" />
        </div>
      </div>

      {/* Filter Pills + Search */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { key: "active", label: `Open Pipeline (${counts.active})` },
            { key: "APPROVED", label: `Approved / To Issue (${counts.approved})` },
            { key: "ISSUED", label: `Issued (${counts.issued})` },
            { key: "PARTIALLY_DELIVERED", label: `Partially Delivered (${counts.partial})` },
            { key: "overdue", label: `Overdue (${counts.overdue})` },
            { key: "DELIVERED", label: `Delivered (${counts.delivered})` },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilterTab(tab.key as TrackingFilter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                filterTab === tab.key
                  ? tab.key === "overdue"
                    ? "bg-rose-600 text-white"
                    : "bg-[#2563EB] text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="w-full lg:w-72">
          <SearchField
            value={search}
            isLoading={isLoading}
            onChange={setSearch}
            placeholder="Search PO, Job, Supplier..."
          />
        </div>
      </div>

      {/* Tracking Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        {isLoading && orders.length === 0 ? (
          <TableSkeleton rows={6} columns={8} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-wider">
                  <th className="py-3 px-3.5">PO Number</th>
                  <th className="py-3 px-3.5">Job & Client</th>
                  <th className="py-3 px-3.5">Supplier</th>
                  <th className="py-3 px-3.5">Expected Delivery</th>
                  <th className="py-3 px-3.5 text-center">PO Status</th>
                  <th className="py-3 px-3.5 w-44">Fulfillment Progress</th>
                  <th className="py-3 px-3.5 text-center">Delivery Status</th>
                  <th className="py-3 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <Truck className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                      <p className="font-semibold text-slate-600 text-sm">
                        No Matching Purchase Orders
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((po) => {
                    const isOverdue =
                      po.status !== "DELIVERED" &&
                      Boolean(po.expectedDeliveryDate && po.expectedDeliveryDate < todayIso);
                    const pct = po.deliveryProgressPercent ?? 0;

                    return (
                      <tr key={po.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <Link
                            href={`/admin/purchase-orders/${po.id}`}
                            className="font-mono font-bold text-blue-700 hover:underline block"
                          >
                            {po.poNumber}
                          </Link>
                          <span className="text-[10px] text-slate-400">PO Date: {po.poDate}</span>
                        </td>
                        <td className="py-3 px-3.5">
                          <span className="font-mono font-bold text-slate-800 flex items-center gap-1">
                            <Briefcase className="h-3 w-3 text-slate-400" />
                            {po.jobCode}
                          </span>
                          <span className="text-[11px] text-slate-500 truncate block max-w-[180px]">
                            {po.jobName}
                          </span>
                        </td>
                        <td className="py-3 px-3.5">
                          <span className="font-semibold text-slate-800 flex items-center gap-1">
                            <Building2 className="h-3 w-3 text-slate-400" />
                            {po.supplierName}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <span
                            className={`font-mono font-semibold flex items-center gap-1 ${
                              isOverdue ? "text-rose-600 font-bold" : "text-slate-700"
                            }`}
                          >
                            <Calendar className="h-3 w-3" />
                            {po.expectedDeliveryDate || "Not specified"}
                          </span>
                          {isOverdue && (
                            <span className="inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-100 text-rose-700 border border-rose-200">
                              OVERDUE
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          <StatusBadge status={po.status} />
                        </td>
                        <td className="py-3 px-3.5">
                          <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                            <span className="font-bold text-slate-800">{pct}%</span>
                            <span className="text-slate-500">
                              {po.totalDeliveredQuantity ?? 0} / {po.totalOrderedQuantity ?? 0}
                            </span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                pct >= 100 ? "bg-emerald-500" : "bg-sky-500"
                              }`}
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          <StatusBadge status={po.deliveryStatus} />
                        </td>
                        <td className="py-3 px-3.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <Link
                              href={`/admin/purchase-orders/${po.id}`}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-700 hover:bg-blue-50"
                              title="View PO & Deliveries"
                            >
                              <Eye className="h-4 w-4" />
                            </Link>

                            {canIssue && po.status === "APPROVED" && (
                              <button
                                type="button"
                                disabled={busyPoId === po.id}
                                onClick={() => handleMarkIssued(po)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold hover:bg-indigo-100 cursor-pointer"
                              >
                                <Send className="h-3 w-3" />
                                <span>Issue</span>
                              </button>
                            )}

                            {canTrackDelivery &&
                              ["APPROVED", "ISSUED", "PARTIALLY_DELIVERED"].includes(po.status) && (
                                <button
                                  type="button"
                                  disabled={busyPoId === po.id}
                                  onClick={() => handleOpenDeliveryModal(po)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-600 text-white font-semibold hover:bg-sky-700 cursor-pointer"
                                >
                                  {busyPoId === po.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Truck className="h-3 w-3" />
                                  )}
                                  <span>Receive</span>
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
        )}
      </div>

      <RecordDeliveryModal
        isOpen={Boolean(deliveryModalPo)}
        onClose={() => setDeliveryModalPo(null)}
        po={deliveryModalPo}
        onSuccess={loadOrders}
      />
    </div>
  );
}
