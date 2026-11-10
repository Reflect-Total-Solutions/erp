"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  DollarSign,
  Eye,
  FileSpreadsheet,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShoppingCart,
  Truck,
  Users,
} from "lucide-react";
import { useAdminData } from "@/context/admin-data-context";
import { StatusBadge } from "@/components/admin/ui/badge";
import { formatCurrency } from "@/lib/financial";
import { PurchaseOrder } from "@/types/admin";

interface PoDashboardPayload {
  metrics: {
    totalPos: number;
    draftCount: number;
    pendingCount: number;
    approvedCount: number;
    issuedCount: number;
    partiallyDeliveredCount: number;
    deliveredCount: number;
    rejectedCount: number;
    cancelledCount: number;
    activePipelineCount: number;
    overdueDeliveriesCount: number;
    totalCommittedValue: number | null;
    totalDraftValue: number | null;
    totalApprovedAndBeyondValue: number | null;
    totalInvoicedAgainstPos: number | null;
    remainingToInvoiceValue: number | null;
  };
  charts: {
    statusDistribution: Array<{ status: string; count: number; value: number }>;
    monthlySpend: Array<{
      month: string;
      label: string;
      count: number;
      committedValue: number;
      invoicedValue: number;
    }>;
    topSuppliers: Array<{
      supplierId: string;
      supplierName: string;
      supplierCode: string;
      poCount: number;
      totalValue: number;
    }>;
    topJobs: Array<{
      jobId: string;
      jobCode: string;
      jobName: string;
      approvedJobValue: number;
      poCount: number;
      committedValue: number;
      invoicedValue: number;
    }>;
  };
  upcomingAndOverdueDeliveries: Array<{
    id: string;
    poNumber: string;
    jobCode: string;
    jobName: string;
    supplierName: string;
    status: string;
    deliveryStatus: string;
    expectedDeliveryDate: string | null;
    isOverdue: boolean;
    grandTotal: number;
  }>;
  recentPos: PurchaseOrder[];
}

export function PoDashboardView() {
  const { can, currentRole } = useAdminData();
  const canView = can("purchaseOrders", "view");
  const canCreate = can("purchaseOrders", "create");

  const [data, setData] = useState<PoDashboardPayload | null>(null);
  const [canViewFinancials, setCanViewFinancials] = useState(true);
  const [visibilityScope, setVisibilityScope] = useState("ALL");
  const [isLoading, setIsLoading] = useState(canView);
  const [error, setError] = useState("");

  const fetchDashboard = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch("/api/purchase-orders/dashboard");
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || "Failed to load PO dashboard.");
      }
      setData(json.data);
      setCanViewFinancials(Boolean(json.meta?.canViewFinancials));
      setVisibilityScope(json.meta?.visibilityScope || "ALL");
    } catch (err: any) {
      setError(err?.message || "Failed to fetch dashboard analytics.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canView) return;
    const timer = setTimeout(() => {
      void fetchDashboard();
    }, 0);
    return () => clearTimeout(timer);
  }, [canView, fetchDashboard]);

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center p-10 bg-white rounded-2xl border border-slate-200 text-center max-w-lg mx-auto mt-8 shadow-xs">
        <div className="h-14 w-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-500 mt-2">
          You do not have permission to view Purchase Order Management ({currentRole}).
        </p>
        <Link
          href="/admin"
          className="mt-5 px-4 py-2 rounded-lg bg-[#2563EB] text-white text-xs font-semibold"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  if (isLoading && !data) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-xs font-semibold">Loading Purchase Order analytics...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center space-y-3">
        <AlertTriangle className="h-8 w-8 text-rose-600 mx-auto" />
        <p className="font-bold text-rose-900 text-sm">Failed to Load PO Dashboard</p>
        <p className="text-xs text-rose-700">{error}</p>
        <button
          type="button"
          onClick={fetchDashboard}
          className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold"
        >
          Retry
        </button>
      </div>
    );
  }

  const { metrics, charts, upcomingAndOverdueDeliveries, recentPos } = data;
  const maxMonthlyVal = Math.max(
    1,
    ...charts.monthlySpend.map((m) => Math.max(m.committedValue, m.invoicedValue))
  );
  const maxSupplierVal = Math.max(1, ...charts.topSuppliers.map((s) => s.totalValue));
  const maxJobVal = Math.max(
    1,
    ...charts.topJobs.map((j) => Math.max(j.approvedJobValue, j.committedValue))
  );

  return (
    <div className="space-y-6 text-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900">Purchase Order Dashboard</h2>
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              Scope: {visibilityScope}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Track procurement commitments, approvals, supplier deliveries, and PO-to-Invoice utilization across approved Jobs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={fetchDashboard}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
          <Link
            href="/admin/purchase-orders/list"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 font-semibold hover:bg-slate-50"
          >
            <span>All POs ({metrics.totalPos})</span>
          </Link>
          <Link
            href="/admin/purchase-orders/tracking"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 font-semibold hover:bg-slate-50"
          >
            <Truck className="h-3.5 w-3.5 text-indigo-600" />
            <span>PO Tracking</span>
          </Link>
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Total Purchase Orders</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{metrics.totalPos}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Pending: <strong className="text-amber-600">{metrics.pendingCount}</strong> • Draft:{" "}
              <strong>{metrics.draftCount}</strong>
            </p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
            <ShoppingCart className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Committed PO Value</p>
            <p className="text-xl font-bold font-mono text-blue-700 mt-1">
              {canViewFinancials && metrics.totalCommittedValue !== null
                ? formatCurrency(metrics.totalCommittedValue, { showCurrencyPrefix: true })
                : "Restricted"}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Approved Pipeline: <strong>{metrics.activePipelineCount} PO(s)</strong>
            </p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
            <DollarSign className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Invoiced vs Unbilled POs</p>
            <p className="text-xl font-bold font-mono text-emerald-700 mt-1">
              {canViewFinancials && metrics.totalInvoicedAgainstPos !== null
                ? formatCurrency(metrics.totalInvoicedAgainstPos, { showCurrencyPrefix: true })
                : "Restricted"}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Unbilled Bal:{" "}
              <strong className="font-mono text-slate-700">
                {canViewFinancials && metrics.remainingToInvoiceValue !== null
                  ? formatCurrency(metrics.remainingToInvoiceValue, { showCurrencyPrefix: true })
                  : "—"}
              </strong>
            </p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Delivery Attention</p>
            <p
              className={`text-2xl font-bold mt-1 ${
                metrics.overdueDeliveriesCount > 0 ? "text-rose-600" : "text-slate-900"
              }`}
            >
              {metrics.overdueDeliveriesCount} Overdue
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Delivered: <strong className="text-emerald-700">{metrics.deliveredCount}</strong> •
              Partial: <strong className="text-sky-700">{metrics.partiallyDeliveredCount}</strong>
            </p>
          </div>
          <div
            className={`h-11 w-11 rounded-xl border flex items-center justify-center ${
              metrics.overdueDeliveriesCount > 0
                ? "bg-rose-50 border-rose-200 text-rose-600"
                : "bg-slate-50 border-slate-200 text-slate-600"
            }`}
          >
            <Truck className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Charts Grid (4 visualizations) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Chart 1: PO Status Distribution */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-blue-600" />
              PO Status Distribution
            </h3>
            <span className="text-[11px] text-slate-400">{metrics.totalPos} Total</span>
          </div>

          {charts.statusDistribution.length === 0 ? (
            <p className="py-8 text-center text-slate-400">No PO data yet.</p>
          ) : (
            <div className="space-y-2.5">
              {charts.statusDistribution.map((row) => {
                const pct =
                  metrics.totalPos > 0 ? Math.round((row.count / metrics.totalPos) * 100) : 0;
                return (
                  <div key={row.status} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={row.status} />
                        <span className="font-semibold text-slate-700">
                          {row.count} PO(s) ({pct}%)
                        </span>
                      </div>
                      {canViewFinancials && (
                        <span className="font-mono font-semibold text-slate-700">
                          {formatCurrency(row.value, { showCurrencyPrefix: true })}
                        </span>
                      )}
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          row.status === "DELIVERED" || row.status === "APPROVED"
                            ? "bg-emerald-500"
                            : row.status === "PENDING"
                            ? "bg-amber-500"
                            : row.status === "REJECTED" || row.status === "CANCELLED"
                            ? "bg-rose-500"
                            : row.status === "PARTIALLY_DELIVERED"
                            ? "bg-sky-500"
                            : "bg-blue-600"
                        }`}
                        style={{ width: `${Math.max(4, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Chart 2: Monthly PO Spend vs Invoiced */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              Monthly PO Commitments vs Actual Invoiced
            </h3>
            <div className="flex items-center gap-3 text-[10px] font-semibold">
              <span className="flex items-center gap-1 text-blue-700">
                <span className="h-2.5 w-2.5 rounded-xs bg-blue-600 inline-block" />
                Committed PO
              </span>
              <span className="flex items-center gap-1 text-emerald-700">
                <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500 inline-block" />
                Invoiced
              </span>
            </div>
          </div>

          <div className="h-48 flex items-end justify-between gap-2 pt-4 pb-1 border-b border-slate-200 px-2">
            {charts.monthlySpend.map((m) => {
              const commH = canViewFinancials
                ? Math.round((m.committedValue / maxMonthlyVal) * 100)
                : Math.min(100, m.count * 20);
              const invH = canViewFinancials
                ? Math.round((m.invoicedValue / maxMonthlyVal) * 100)
                : 0;
              return (
                <div
                  key={m.month}
                  className="flex-1 flex flex-col items-center gap-1.5 group h-full justify-end"
                  title={`${m.label}: ${m.count} PO(s) | Committed: ${formatCurrency(
                    m.committedValue
                  )} | Invoiced: ${formatCurrency(m.invoicedValue)}`}
                >
                  <div className="w-full flex items-end justify-center gap-1 h-36">
                    <div
                      className="w-4 sm:w-5 rounded-t bg-blue-600 hover:bg-blue-700 transition-all"
                      style={{ height: `${Math.max(m.count > 0 ? 6 : 2, commH)}%` }}
                    />
                    {canViewFinancials && (
                      <div
                        className="w-4 sm:w-5 rounded-t bg-emerald-500 hover:bg-emerald-600 transition-all"
                        style={{ height: `${Math.max(m.invoicedValue > 0 ? 6 : 2, invH)}%` }}
                      />
                    )}
                  </div>
                  <div className="text-center">
                    <span className="block text-[10px] font-semibold text-slate-600">{m.label}</span>
                    <span className="block text-[9px] text-slate-400">{m.count} PO</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart 3: Top Suppliers by PO Volume */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Users className="h-4 w-4 text-indigo-600" />
            Top Suppliers by PO Commitment
          </h3>
          {charts.topSuppliers.length === 0 ? (
            <p className="py-8 text-center text-slate-400">No active supplier commitments yet.</p>
          ) : (
            <div className="space-y-2.5">
              {charts.topSuppliers.map((sup) => {
                const widthPct = canViewFinancials
                  ? Math.round((sup.totalValue / maxSupplierVal) * 100)
                  : Math.min(100, sup.poCount * 20);
                return (
                  <div key={sup.supplierId} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-800 truncate">
                        {sup.supplierName}{" "}
                        <span className="font-mono text-[10px] text-slate-400">
                          ({sup.poCount} PO)
                        </span>
                      </span>
                      {canViewFinancials && (
                        <span className="font-mono font-bold text-slate-900 shrink-0">
                          {formatCurrency(sup.totalValue, { showCurrencyPrefix: true })}
                        </span>
                      )}
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-indigo-500"
                        style={{ width: `${Math.max(5, widthPct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Chart 4: Top Jobs PO Commitment vs Job Value */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Package className="h-4 w-4 text-emerald-600" />
            Top Jobs — PO Commitments
          </h3>
          {charts.topJobs.length === 0 ? (
            <p className="py-8 text-center text-slate-400">No job commitments yet.</p>
          ) : (
            <div className="space-y-2.5">
              {charts.topJobs.map((job) => {
                const pct = canViewFinancials
                  ? Math.round((job.committedValue / maxJobVal) * 100)
                  : Math.min(100, job.poCount * 25);
                return (
                  <div key={job.jobId} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <Link
                        href={`/admin/jobs/${job.jobId}`}
                        className="font-semibold text-blue-700 hover:underline truncate"
                      >
                        <span className="font-mono">{job.jobCode}</span> — {job.jobName}
                      </Link>
                      {canViewFinancials && (
                        <span className="font-mono font-bold text-slate-800 shrink-0">
                          {formatCurrency(job.committedValue)} /{" "}
                          <span className="text-slate-400">
                            {formatCurrency(job.approvedJobValue)}
                          </span>
                        </span>
                      )}
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${Math.max(5, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Panels: Delivery Alerts + Recent POs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Upcoming & Overdue Deliveries */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-amber-600" />
              Upcoming & Overdue Deliveries
            </h3>
            <Link
              href="/admin/purchase-orders/tracking"
              className="text-[11px] font-semibold text-blue-600 hover:underline flex items-center gap-1"
            >
              <span>Track All</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {upcomingAndOverdueDeliveries.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                No pending or overdue deliveries.
              </div>
            ) : (
              upcomingAndOverdueDeliveries.map((del) => (
                <Link
                  key={del.id}
                  href={`/admin/purchase-orders/${del.id}`}
                  className="block px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-blue-700">{del.poNumber}</span>
                        {del.isOverdue && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-100 text-rose-700 border border-rose-200">
                            OVERDUE
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 truncate mt-0.5">
                        {del.supplierName} • {del.jobCode}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className={`block font-mono text-[11px] font-bold ${
                          del.isOverdue ? "text-rose-600" : "text-slate-700"
                        }`}
                      >
                        {del.expectedDeliveryDate || "No Date"}
                      </span>
                      <StatusBadge status={del.deliveryStatus} />
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Recent Purchase Orders */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
            <h3 className="text-sm font-bold text-slate-900">Recent Purchase Orders</h3>
            <Link
              href="/admin/purchase-orders/list"
              className="text-[11px] font-semibold text-blue-600 hover:underline flex items-center gap-1"
            >
              <span>View All POs</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-500 text-[10px] uppercase">
                  <th className="py-2.5 px-3">PO No</th>
                  <th className="py-2.5 px-3">Job & Supplier</th>
                  <th className="py-2.5 px-3 text-right">Total</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentPos.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No Purchase Orders created yet.
                    </td>
                  </tr>
                ) : (
                  recentPos.map((po) => (
                    <tr key={po.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3 font-mono font-bold text-blue-700 whitespace-nowrap">
                        <Link href={`/admin/purchase-orders/${po.id}`} className="hover:underline">
                          {po.poNumber}
                        </Link>
                        <span className="block text-[10px] font-normal text-slate-400">
                          {po.poDate}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <p className="font-semibold text-slate-800">{po.supplierName}</p>
                        <p className="text-[11px] text-slate-500 truncate max-w-[220px]">
                          {po.jobCode} • {po.jobName}
                        </p>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        {canViewFinancials
                          ? formatCurrency(po.grandTotal, { showCurrencyPrefix: true })
                          : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <StatusBadge status={po.status} />
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Link
                          href={`/admin/purchase-orders/${po.id}`}
                          className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-500 hover:text-blue-700 hover:bg-blue-50"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
