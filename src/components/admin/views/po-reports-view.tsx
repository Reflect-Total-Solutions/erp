"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Settings,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useAdminData } from "@/context/admin-data-context";
import { StatusBadge } from "@/components/admin/ui/badge";
import { SearchField } from "@/components/admin/ui/search-field";
import { formatCurrency } from "@/lib/financial";
import { Department, PurchaseOrder, PurchaseOrderSettings } from "@/types/admin";

interface DepartmentBreakdownRow {
  departmentId: string;
  departmentName: string;
  departmentCode?: string | null;
  poCount: number;
  allocatedQuantity: number;
  allocatedAmount: number;
}

interface JobBudgetComparisonRow {
  jobId: string;
  jobCode: string;
  jobName: string;
  clientName: string;
  poCount: number;
  approvedJobValue: number;
  draftPoValue: number;
  committedPoValue: number;
  actualInvoicedValue: number;
  remainingUncommitted: number;
  commitmentUtilizationPercent: number;
}

export function PoReportsView() {
  const { can, showToast, currentRole } = useAdminData();
  const canView = can("purchaseOrders", "view");
  const canExport = can("purchaseOrders", "export");
  const canManageSettings = can("purchaseOrders", "manageSettings");

  const [activeTab, setActiveTab] = useState<
    "summary" | "departments" | "jobBudget" | "settings"
  >("summary");

  // Filters for reports
  const [status, setStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");

  // Reports data
  const [isLoading, setIsLoading] = useState(true);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [departmentBreakdown, setDepartmentBreakdown] = useState<DepartmentBreakdownRow[]>([]);
  const [jobBudgetComparison, setJobBudgetComparison] = useState<JobBudgetComparisonRow[]>([]);
  const [canViewFinancials, setCanViewFinancials] = useState(true);

  // Settings & Departments state (Tab 4)
  const [settingsForm, setSettingsForm] = useState<PurchaseOrderSettings | null>(null);
  const [departmentsList, setDepartmentsList] = useState<Department[]>([]);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");
  const [newDeptCode, setNewDeptCode] = useState("");
  const [isSavingDept, setIsSavingDept] = useState(false);

  const loadReports = useCallback(async () => {
    if (!canView) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const qs = new URLSearchParams();
      if (status !== "all") qs.set("status", status);
      if (dateFrom) qs.set("dateFrom", dateFrom);
      if (dateTo) qs.set("dateTo", dateTo);
      if (search.trim()) qs.set("search", search.trim());

      const res = await fetch(`/api/purchase-orders/reports?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || "Failed to load PO reports.");
      }
      setOrders(json.data.orders || []);
      setDepartmentBreakdown(json.data.departmentBreakdown || []);
      setJobBudgetComparison(json.data.jobBudgetComparison || []);
      setCanViewFinancials(Boolean(json.meta?.canViewFinancials));
    } catch (err: any) {
      showToast("Error", err?.message || "Failed to generate PO reports.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [canView, status, dateFrom, dateTo, search, showToast]);

  const loadSettingsAndDepartments = useCallback(async () => {
    if (!canManageSettings) return;
    try {
      const [sRes, dRes] = await Promise.all([
        fetch("/api/purchase-orders/settings").then((r) => r.json()),
        fetch("/api/purchase-orders/departments?all=true").then((r) => r.json()),
      ]);
      if (sRes?.success && sRes.data?.settings) {
        setSettingsForm(sRes.data.settings);
      }
      if (dRes?.success && Array.isArray(dRes.data)) {
        setDepartmentsList(dRes.data);
      }
    } catch (err) {
      console.error("loadSettingsAndDepartments error:", err);
    }
  }, [canManageSettings]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadReports();
    }, 150);
    return () => clearTimeout(timer);
  }, [loadReports]);

  useEffect(() => {
    if (activeTab !== "settings" || !canManageSettings) return;
    const timer = setTimeout(() => {
      void loadSettingsAndDepartments();
    }, 0);
    return () => clearTimeout(timer);
  }, [activeTab, canManageSettings, loadSettingsAndDepartments]);

  const handleExportCsv = () => {
    const qs = new URLSearchParams({ export: "csv" });
    if (status !== "all") qs.set("status", status);
    if (dateFrom) qs.set("dateFrom", dateFrom);
    if (dateTo) qs.set("dateTo", dateTo);
    if (search.trim()) qs.set("search", search.trim());
    window.open(`/api/purchase-orders?${qs.toString()}`, "_blank");
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsForm) return;
    setIsSavingSettings(true);
    try {
      const res = await fetch("/api/purchase-orders/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: settingsForm.companyName,
          companyAddress: settingsForm.companyAddress,
          companyRegNo: settingsForm.companyRegNo || null,
          companyEmail: settingsForm.companyEmail || null,
          companyPhone: settingsForm.companyPhone || null,
          defaultDeliverToName: settingsForm.defaultDeliverToName || null,
          defaultDeliverToAddress: settingsForm.defaultDeliverToAddress || null,
          defaultDeliverToEmail: settingsForm.defaultDeliverToEmail || null,
          poNumberPrefix: settingsForm.poNumberPrefix,
          financialYearCode: settingsForm.financialYearCode,
          poNumberPadding: Number(settingsForm.poNumberPadding) || 2,
          defaultSsclRate: Number(settingsForm.defaultSsclRate) || 0,
          defaultVatRate: Number(settingsForm.defaultVatRate) || 0,
          defaultApplySscl: Boolean(settingsForm.defaultApplySscl),
          defaultApplyVat: Boolean(settingsForm.defaultApplyVat),
          defaultCurrency: settingsForm.defaultCurrency || "LKR",
          defaultComments: settingsForm.defaultComments || null,
          defaultTerms: settingsForm.defaultTerms || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || "Failed to save PO settings.");
      }
      setSettingsForm(json.data);
      showToast("Settings Saved", json.message, "success");
    } catch (err: any) {
      showToast("Save Failed", err?.message || "Failed to save PO settings.", "error");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleAddDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeptName.trim()) return;
    setIsSavingDept(true);
    try {
      const res = await fetch("/api/purchase-orders/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newDeptName.trim(),
          code: newDeptCode.trim().toUpperCase() || null,
          isActive: true,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || "Failed to add department.");
      }
      setNewDeptName("");
      setNewDeptCode("");
      showToast("Department Added", `Department "${json.data.name}" created.`, "success");
      loadSettingsAndDepartments();
    } catch (err: any) {
      showToast("Department Error", err?.message || "Failed to create department.", "error");
    } finally {
      setIsSavingDept(false);
    }
  };

  const handleToggleDeptActive = async (dept: Department) => {
    try {
      const res = await fetch(`/api/purchase-orders/departments/${dept.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: dept.name,
          code: dept.code || null,
          isActive: !dept.isActive,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || "Failed to update department.");
      }
      loadSettingsAndDepartments();
    } catch (err: any) {
      showToast("Error", err?.message || "Failed to update department.", "error");
    }
  };

  const handleDeleteDept = async (dept: Department) => {
    if (!window.confirm(`Delete department "${dept.name}"?`)) return;
    try {
      const res = await fetch(`/api/purchase-orders/departments/${dept.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || "Failed to delete department.");
      }
      showToast("Department Updated", json.message, "success");
      loadSettingsAndDepartments();
    } catch (err: any) {
      showToast("Delete Error", err?.message || "Failed to remove department.", "error");
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
          You do not have permission to view PO Reports ({currentRole}).
        </p>
      </div>
    );
  }

  const totalDeptAllocAmt = departmentBreakdown.reduce((s, d) => s + d.allocatedAmount, 0);

  return (
    <div className="space-y-5 text-xs">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Purchase Order Reports & Configuration
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Analyze PO commitments, multi-department cost allocations, Job budget utilization, and manage default PO parameters.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadReports}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>

          {canExport && (
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export Summary CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("summary")}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === "summary"
              ? "bg-[#2563EB] text-white"
              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          PO Summary ({orders.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("departments")}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === "departments"
              ? "bg-indigo-600 text-white"
              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>Department Allocation Breakdown ({departmentBreakdown.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("jobBudget")}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === "jobBudget"
              ? "bg-emerald-600 text-white"
              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <Briefcase className="h-3.5 w-3.5" />
          <span>Job Budget vs PO Commitment vs Actual Invoiced</span>
        </button>
        {canManageSettings && (
          <button
            type="button"
            onClick={() => setActiveTab("settings")}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === "settings"
                ? "bg-slate-900 text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
            <span>PO Settings & Departments</span>
          </button>
        )}
      </div>

      {/* Filter Bar for Report Tabs */}
      {activeTab !== "settings" && (
        <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
              Search
            </label>
            <SearchField
              value={search}
              isLoading={isLoading}
              onChange={setSearch}
              placeholder="PO No, Job, Supplier..."
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
              PO Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs"
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
              From Date
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
              To Date
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs"
            />
          </div>
        </div>
      )}

      {/* TAB 1: PO SUMMARY */}
      {activeTab === "summary" && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase">
                  <th className="py-3 px-3">PO No</th>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Job No & Name</th>
                  <th className="py-3 px-3">Supplier</th>
                  <th className="py-3 px-3 text-right">Sub-Total</th>
                  <th className="py-3 px-3 text-right">Taxes (SSCL+VAT)</th>
                  <th className="py-3 px-3 text-right">Grand Total</th>
                  <th className="py-3 px-3 text-right">Invoiced</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-right">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-10 text-center text-slate-400">
                      No Purchase Orders match the report filter.
                    </td>
                  </tr>
                ) : (
                  orders.map((po) => (
                    <tr key={po.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-bold text-blue-700">
                        {po.poNumber}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">{po.poDate}</td>
                      <td className="py-2.5 px-3">
                        <span className="font-mono font-bold text-slate-700">{po.jobCode}</span>
                        <span className="text-slate-500 ml-1">• {po.jobName}</span>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-800">{po.supplierName}</td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        {canViewFinancials ? formatCurrency(po.subTotal) : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                        {canViewFinancials ? formatCurrency(po.ssclAmount + po.vatAmount) : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        {canViewFinancials
                          ? formatCurrency(po.grandTotal, { showCurrencyPrefix: true })
                          : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-700 font-semibold">
                        {canViewFinancials ? formatCurrency(po.invoicedTotal || 0) : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <StatusBadge status={po.status} />
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Link
                          href={`/admin/purchase-orders/${po.id}`}
                          className="p-1.5 inline-flex rounded-lg text-slate-500 hover:text-blue-700 hover:bg-blue-50"
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
      )}

      {/* TAB 2: DEPARTMENT BREAKDOWN */}
      {activeTab === "departments" && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-indigo-50 border-b border-indigo-200 text-indigo-950 text-[10px] uppercase">
                  <th className="py-3 px-4">Department Name</th>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4 text-center">PO Count</th>
                  <th className="py-3 px-4 text-right">Allocated Qty</th>
                  <th className="py-3 px-4 text-right">Allocated Spend (Rs.)</th>
                  <th className="py-3 px-4 w-44">Spend Share %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {departmentBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
                      No POs in this filter range use Department Allocation.
                    </td>
                  </tr>
                ) : (
                  departmentBreakdown.map((dept) => {
                    const sharePct =
                      totalDeptAllocAmt > 0
                        ? Math.round((dept.allocatedAmount / totalDeptAllocAmt) * 100)
                        : 0;
                    return (
                      <tr key={dept.departmentId} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {dept.departmentName}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-500">
                          {dept.departmentCode || "—"}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-indigo-700">
                          {dept.poCount}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {formatCurrency(dept.allocatedQuantity)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                          {canViewFinancials
                            ? formatCurrency(dept.allocatedAmount, { showCurrencyPrefix: true })
                            : "—"}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className="h-full bg-indigo-600 rounded-full"
                                style={{ width: `${Math.min(100, sharePct)}%` }}
                              />
                            </div>
                            <span className="font-mono text-[11px] font-bold w-9 text-right">
                              {sharePct}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: JOB BUDGET VS PO COMMITMENT VS ACTUAL INVOICED */}
      {activeTab === "jobBudget" && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-emerald-50 border-b border-emerald-200 text-emerald-950 text-[10px] uppercase">
                  <th className="py-3 px-3.5">Job & Client</th>
                  <th className="py-3 px-3.5 text-center">POs</th>
                  <th className="py-3 px-3.5 text-right">Approved Job Budget</th>
                  <th className="py-3 px-3.5 text-right">Draft POs</th>
                  <th className="py-3 px-3.5 text-right">Committed POs</th>
                  <th className="py-3 px-3.5 text-right">Actual Supplier Invoiced</th>
                  <th className="py-3 px-3.5 text-right">Remaining Uncommitted</th>
                  <th className="py-3 px-3.5 w-36">Commitment %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobBudgetComparison.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400">
                      No Jobs with Purchase Orders found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  jobBudgetComparison.map((row) => (
                    <tr key={row.jobId} className="hover:bg-slate-50">
                      <td className="py-3 px-3.5">
                        <Link
                          href={`/admin/jobs/${row.jobId}`}
                          className="font-mono font-bold text-blue-700 hover:underline block"
                        >
                          {row.jobCode}
                        </Link>
                        <span className="text-[11px] text-slate-600 truncate block max-w-[200px]">
                          {row.jobName} ({row.clientName})
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-center font-mono font-bold">{row.poCount}</td>
                      <td className="py-3 px-3.5 text-right font-mono font-semibold text-slate-900">
                        {canViewFinancials
                          ? formatCurrency(row.approvedJobValue, { showCurrencyPrefix: true })
                          : "—"}
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono text-slate-500">
                        {canViewFinancials ? formatCurrency(row.draftPoValue) : "—"}
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono font-bold text-blue-700">
                        {canViewFinancials
                          ? formatCurrency(row.committedPoValue, { showCurrencyPrefix: true })
                          : "—"}
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono font-bold text-emerald-700">
                        {canViewFinancials
                          ? formatCurrency(row.actualInvoicedValue, { showCurrencyPrefix: true })
                          : "—"}
                      </td>
                      <td
                        className={`py-3 px-3.5 text-right font-mono font-bold ${
                          row.remainingUncommitted < 0 ? "text-rose-600" : "text-slate-700"
                        }`}
                      >
                        {canViewFinancials
                          ? formatCurrency(row.remainingUncommitted, { showCurrencyPrefix: true })
                          : "—"}
                      </td>
                      <td className="py-3 px-3.5">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                row.commitmentUtilizationPercent > 100
                                  ? "bg-rose-500"
                                  : "bg-emerald-500"
                              }`}
                              style={{
                                width: `${Math.min(100, row.commitmentUtilizationPercent)}%`,
                              }}
                            />
                          </div>
                          <span className="font-mono text-[10px] font-bold w-10 text-right">
                            {row.commitmentUtilizationPercent}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: PO SETTINGS & DEPARTMENTS MANAGEMENT */}
      {activeTab === "settings" && canManageSettings && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Global PO Settings */}
          <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 mb-4">
              Purchase Order Defaults, Tax Rates & Numbering Configuration
            </h3>

            {!settingsForm ? (
              <div className="py-8 text-center text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-600" />
                Loading PO settings...
              </div>
            ) : (
              <form onSubmit={handleSaveSettings} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Company Name *</label>
                    <input
                      type="text"
                      required
                      value={settingsForm.companyName}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, companyName: e.target.value })
                      }
                      className="h-9 w-full rounded-lg border border-slate-300 px-3"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Company Registration No
                    </label>
                    <input
                      type="text"
                      value={settingsForm.companyRegNo || ""}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, companyRegNo: e.target.value })
                      }
                      className="h-9 w-full rounded-lg border border-slate-300 px-3"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Company Address *
                  </label>
                  <input
                    type="text"
                    required
                    value={settingsForm.companyAddress}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, companyAddress: e.target.value })
                    }
                    className="h-9 w-full rounded-lg border border-slate-300 px-3"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">PO Prefix *</label>
                    <input
                      type="text"
                      required
                      value={settingsForm.poNumberPrefix}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, poNumberPrefix: e.target.value })
                      }
                      className="h-9 w-full rounded-lg border border-slate-300 px-3 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Financial Year Code *
                    </label>
                    <input
                      type="text"
                      required
                      value={settingsForm.financialYearCode}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, financialYearCode: e.target.value })
                      }
                      className="h-9 w-full rounded-lg border border-slate-300 px-3 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Zero Padding</label>
                    <input
                      type="number"
                      min={1}
                      max={6}
                      value={settingsForm.poNumberPadding}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          poNumberPadding: Number(e.target.value),
                        })
                      }
                      className="h-9 w-full rounded-lg border border-slate-300 px-3 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Default Currency
                    </label>
                    <input
                      type="text"
                      required
                      value={settingsForm.defaultCurrency}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, defaultCurrency: e.target.value })
                      }
                      className="h-9 w-full rounded-lg border border-slate-300 px-3 font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Default SSCL (%)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={settingsForm.defaultApplySscl}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, defaultApplySscl: e.target.checked })
                        }
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={settingsForm.defaultSsclRate}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            defaultSsclRate: Number(e.target.value),
                          })
                        }
                        className="h-9 w-full rounded-lg border border-slate-300 px-2.5 font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Default VAT (%)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={settingsForm.defaultApplyVat}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, defaultApplyVat: e.target.checked })
                        }
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={settingsForm.defaultVatRate}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            defaultVatRate: Number(e.target.value),
                          })
                        }
                        className="h-9 w-full rounded-lg border border-slate-300 px-2.5 font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Default Deliver To Name
                    </label>
                    <input
                      type="text"
                      value={settingsForm.defaultDeliverToName || ""}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, defaultDeliverToName: e.target.value })
                      }
                      className="h-9 w-full rounded-lg border border-slate-300 px-3"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Default Deliver To Email
                    </label>
                    <input
                      type="email"
                      value={settingsForm.defaultDeliverToEmail || ""}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, defaultDeliverToEmail: e.target.value })
                      }
                      className="h-9 w-full rounded-lg border border-slate-300 px-3"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Default Deliver To Address
                  </label>
                  <input
                    type="text"
                    value={settingsForm.defaultDeliverToAddress || ""}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, defaultDeliverToAddress: e.target.value })
                    }
                    className="h-9 w-full rounded-lg border border-slate-300 px-3"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Default PO Terms & Conditions
                  </label>
                  <textarea
                    rows={3}
                    value={settingsForm.defaultTerms || ""}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, defaultTerms: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-xs"
                  />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <span className="text-[11px] text-slate-500">
                    Next PO Preview:{" "}
                    <strong className="font-mono text-blue-700">
                      {settingsForm.nextPoNumberPreview || "Auto"}
                    </strong>
                  </span>
                  <button
                    type="submit"
                    disabled={isSavingSettings}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2563EB] text-white font-semibold hover:bg-[#1d4ed8] disabled:opacity-50 cursor-pointer"
                  >
                    {isSavingSettings ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    <span>Save PO Settings</span>
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Right: Dynamic Departments Manager */}
          <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              Departments (Dynamic Cost Allocation List)
            </h3>

            <form onSubmit={handleAddDepartment} className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Department Name *
                </label>
                <input
                  type="text"
                  required
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  placeholder="e.g. Activations"
                  className="h-9 w-full rounded-lg border border-slate-300 px-2.5"
                />
              </div>
              <div className="w-24">
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Code</label>
                <input
                  type="text"
                  value={newDeptCode}
                  onChange={(e) => setNewDeptCode(e.target.value.toUpperCase())}
                  placeholder="ACT"
                  className="h-9 w-full rounded-lg border border-slate-300 px-2.5 font-mono uppercase"
                />
              </div>
              <button
                type="submit"
                disabled={isSavingDept}
                className="h-9 px-3.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add</span>
              </button>
            </form>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {departmentsList.length === 0 ? (
                <div className="p-6 text-center text-slate-400">No departments defined yet.</div>
              ) : (
                departmentsList.map((dept) => (
                  <div
                    key={dept.id}
                    className="px-3 py-2.5 flex items-center justify-between gap-2 bg-white hover:bg-slate-50"
                  >
                    <div>
                      <span
                        className={`font-semibold ${
                          dept.isActive ? "text-slate-900" : "text-slate-400 line-through"
                        }`}
                      >
                        {dept.name}
                      </span>
                      {dept.code && (
                        <span className="ml-2 font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                          {dept.code}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleToggleDeptActive(dept)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                          dept.isActive
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-slate-100 text-slate-500 border-slate-200"
                        }`}
                      >
                        {dept.isActive ? "Active" : "Inactive"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteDept(dept)}
                        className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                        title="Delete Department"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
