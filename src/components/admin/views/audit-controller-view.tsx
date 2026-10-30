"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  ClipboardCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Search,
  Filter,
  Eye,
  FileText,
  FileSpreadsheet,
  Building2,
  Briefcase,
  Download,
  Sliders,
  Check,
  X,
  RefreshCw,
  Award,
  AlertCircle,
  FileCheck,
  Lock,
  User,
} from "lucide-react";
import { useAdminData } from "@/context/admin-data-context";
import { Modal } from "@/components/admin/ui/modal";
import { Pagination } from "@/components/admin/ui/pagination";
import { SearchField } from "@/components/admin/ui/search-field";

export type AuditStatus = "Verified" | "Flagged" | "Pending";
export type AuditModule = "Invoices" | "Excel Uploads" | "Jobs" | "Suppliers" | "Access Control";

export interface AuditRecord {
  id: string;
  refCode: string;
  timestamp: string;
  entityName: string;
  module: AuditModule;
  originator: string;
  value?: number;
  checkType: string;
  status: AuditStatus;
  auditorNotes: string;
  checklist: {
    documentAttached: boolean;
    mathAccurate: boolean;
    authorizationValid: boolean;
    vendorVerified: boolean;
  };
}

export interface AuditRule {
  id: string;
  code: string;
  title: string;
  description: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  isActive: boolean;
  threshold?: string;
}

const initialAuditRecords: AuditRecord[] = [
  {
    id: "aud-1",
    refCode: "AUD-2026-101",
    timestamp: "Today, 02:10 PM",
    entityName: "Invoice #INV-PRIME-551 (Mounting Brackets & Screws)",
    module: "Invoices",
    originator: "Kasun Jayawardena (Finance)",
    value: 480.0,
    checkType: "Price Variance & Attachment Proof",
    status: "Verified",
    auditorNotes: "Voucher matched with purchase order and supplier delivery slip.",
    checklist: {
      documentAttached: true,
      mathAccurate: true,
      authorizationValid: true,
      vendorVerified: true,
    },
  },
  {
    id: "aud-2",
    refCode: "AUD-2026-102",
    timestamp: "Today, 11:45 AM",
    entityName: "Invoice #INV-COOL-882 (AC Gas Refill and Service)",
    module: "Invoices",
    originator: "Nimal Fernando (Site Supervisor)",
    value: 1250.0,
    checkType: "Rate Ceiling & Quotation Variance",
    status: "Flagged",
    auditorNotes: "Quoted rate exceeds standard maintenance benchmark by 12%. Requires secondary approval.",
    checklist: {
      documentAttached: true,
      mathAccurate: true,
      authorizationValid: false,
      vendorVerified: true,
    },
  },
  {
    id: "aud-3",
    refCode: "AUD-2026-103",
    timestamp: "Yesterday, 04:30 PM",
    entityName: "Excel Schedule: BOQ_Schedule_Phase1.xlsx",
    module: "Excel Uploads",
    originator: "Sarah Perera (Project Manager)",
    value: 45000.0,
    checkType: "Spreadsheet Integrity & Unit Cost Check",
    status: "Verified",
    auditorNotes: "BOQ rates cross-verified with master procurement schedule. All cell formulas verified.",
    checklist: {
      documentAttached: true,
      mathAccurate: true,
      authorizationValid: true,
      vendorVerified: true,
    },
  },
  {
    id: "aud-4",
    refCode: "AUD-2026-104",
    timestamp: "Oct 12, 10:20 AM",
    entityName: "Job #JOB-2026-003 (Warehouse Electrical Rewiring)",
    module: "Jobs",
    originator: "Eshan Wickramasinghe (Admin)",
    value: 22800.0,
    checkType: "Contract Scope & Supplier Allocation",
    status: "Verified",
    auditorNotes: "Project scope matches client tender contract. Allocated to approved vendor ABC Electricals.",
    checklist: {
      documentAttached: true,
      mathAccurate: true,
      authorizationValid: true,
      vendorVerified: true,
    },
  },
  {
    id: "aud-5",
    refCode: "AUD-2026-105",
    timestamp: "Oct 11, 03:00 PM",
    entityName: "Invoice #INV-CITY-401 (Truck Transport Charges)",
    module: "Invoices",
    originator: "Kasun Jayawardena (Finance)",
    value: 890.0,
    checkType: "Duplicate Voucher & Waybill Check",
    status: "Pending",
    auditorNotes: "Awaiting physical weighbridge receipt confirmation from site coordinator.",
    checklist: {
      documentAttached: false,
      mathAccurate: true,
      authorizationValid: true,
      vendorVerified: true,
    },
  },
  {
    id: "aud-6",
    refCode: "AUD-2026-106",
    timestamp: "Oct 10, 09:30 AM",
    entityName: "Supplier Registration: BuildTech Materials (SUP-02)",
    module: "Suppliers",
    originator: "Sarah Perera (Project Manager)",
    checkType: "Business Registration & VAT Compliance",
    status: "Verified",
    auditorNotes: "Verified corporate registration and active tax clearance certificates.",
    checklist: {
      documentAttached: true,
      mathAccurate: true,
      authorizationValid: true,
      vendorVerified: true,
    },
  },
];

const initialAuditRules: AuditRule[] = [
  {
    id: "rule-1",
    code: "RULE-01",
    title: "High-Value Expenditure Secondary Audit",
    description: "Automatically flag vendor invoices exceeding Rs. 50,000.00 for mandatory secondary sign-off.",
    severity: "Critical",
    isActive: true,
    threshold: "Rs. 50,000.00",
  },
  {
    id: "rule-2",
    code: "RULE-02",
    title: "Automated Duplicate Voucher Detection",
    description: "Scan incoming invoices to prevent identical invoice numbers or duplicate billing codes.",
    severity: "High",
    isActive: true,
  },
  {
    id: "rule-3",
    code: "RULE-03",
    title: "Mandatory Document Proof (Photo / PDF)",
    description: "Require attached document proof (.pdf, .jpg, .png) before approving voucher clearance.",
    severity: "High",
    isActive: true,
  },
  {
    id: "rule-4",
    code: "RULE-04",
    title: "Price Variance Tolerance Ceiling (> 5%)",
    description: "Trigger audit flag if item unit cost deviates from baseline BOQ price schedule by > 5%.",
    severity: "Medium",
    isActive: true,
    threshold: "5% Variance",
  },
  {
    id: "rule-5",
    code: "RULE-05",
    title: "Segregation of Duties (SoD) Protocol",
    description: "Prevent staff who create a job schedule from authorizing its associated supplier payments.",
    severity: "Critical",
    isActive: true,
  },
  {
    id: "rule-6",
    code: "RULE-06",
    title: "Off-Hours & Weekend Transaction Flag",
    description: "Highlight ledger entries submitted outside standard business working hours (8AM - 6PM).",
    severity: "Low",
    isActive: false,
  },
];

export function AuditControllerView() {
  const { showToast, can, currentRole } = useAdminData();

  // Active Tab: "ledger" | "rules" | "reports"
  const [activeTab, setActiveTab] = useState<"ledger" | "rules" | "reports">("ledger");

  // Audit records state
  const [records, setRecords] = useState<AuditRecord[]>(initialAuditRecords);
  const [rules, setRules] = useState<AuditRule[]>(initialAuditRules);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Inspection modal state
  const [inspectingRecord, setInspectingRecord] = useState<AuditRecord | null>(null);
  const [inspectNotes, setInspectNotes] = useState("");

  // Filtered records
  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      const matchSearch =
        rec.refCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        rec.entityName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        rec.originator.toLowerCase().includes(searchTerm.toLowerCase()) ||
        rec.checkType.toLowerCase().includes(searchTerm.toLowerCase());

      const matchModule = moduleFilter === "all" || rec.module === moduleFilter;
      const matchStatus = statusFilter === "all" || rec.status === statusFilter;

      return matchSearch && matchModule && matchStatus;
    });
  }, [records, searchTerm, moduleFilter, statusFilter]);

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, currentPage, pageSize]);

  // Statistics
  const totalAudited = records.length;
  const verifiedCount = records.filter((r) => r.status === "Verified").length;
  const flaggedCount = records.filter((r) => r.status === "Flagged").length;
  const pendingCount = records.filter((r) => r.status === "Pending").length;

  // Actions
  const handleVerify = (id: string) => {
    setRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: "Verified" } : r))
    );
    showToast("Audit Clearance Granted", "Record certified and cleared in ledger.", "success");
    if (inspectingRecord?.id === id) setInspectingRecord(null);
  };

  const handleFlag = (id: string, reason?: string) => {
    setRecords((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status: "Flagged",
              auditorNotes: reason || r.auditorNotes,
            }
          : r
      )
    );
    showToast("Audit Discrepancy Flagged", "Record flagged for compliance review.", "error");
    if (inspectingRecord?.id === id) setInspectingRecord(null);
  };

  const handleToggleRule = (ruleId: string) => {
    setRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, isActive: !r.isActive } : r))
    );
    const target = rules.find((r) => r.id === ruleId);
    showToast(
      "Compliance Rule Updated",
      `"${target?.title}" is now ${target?.isActive ? "Disabled" : "Active"}.`,
      "info"
    );
  };

  const openInspection = (rec: AuditRecord) => {
    setInspectingRecord(rec);
    setInspectNotes(rec.auditorNotes);
  };

  if (!can("auditController", "view")) {
    return (
      <div className="flex flex-col items-center justify-center p-10 bg-white rounded-2xl border border-slate-200 text-center max-w-lg mx-auto mt-8 shadow-xs">
        <div className="h-14 w-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
          You do not have authorization to view the Audit Controller & Compliance ledger. Contact your system administrator if access is needed.
        </p>
        <div className="mt-4 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
          Active Role: <span className="font-bold text-blue-600 capitalize">{currentRole}</span>
        </div>
        <Link
          href="/admin"
          className="mt-6 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2563EB] text-xs font-semibold text-white hover:bg-[#1d4ed8] transition-colors"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900">Audit Controller & Compliance</h2>
            <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              Audit Engine v2.4
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Internal controls verification ledger, financial compliance checks, and automated rule monitoring.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              showToast(
                "Audit Dossier Exported",
                "Full compliance verification dossier generated (PDF / CSV).",
                "success"
              )
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            <span>Export Dossier</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setRecords((prev) =>
                prev.map((r) => (r.status === "Pending" ? { ...r, status: "Verified" } : r))
              );
              showToast("Batch Cleared", "All pending items certified as compliant.", "success");
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1d4ed8] shadow-xs"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Certify All Pending</span>
          </button>
        </div>
      </div>

      {/* 4 Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Audited */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Audited Ledger</span>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <ClipboardCheck className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{totalAudited}</p>
          <p className="text-[11px] text-slate-400 mt-1">100% transactions covered</p>
        </div>

        {/* Verified & Compliant */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Verified & Compliant</span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-emerald-600 mt-2">{verifiedCount}</p>
          <p className="text-[11px] text-slate-400 mt-1">Cleared with certified proof</p>
        </div>

        {/* Flagged Discrepancies */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Flagged Issues</span>
            <div className="p-2 rounded-lg bg-rose-50 text-rose-600">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-rose-600 mt-2">{flaggedCount}</p>
          <p className="text-[11px] text-slate-400 mt-1">Requires auditor review</p>
        </div>

        {/* Pending Clearance */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Pending Sign-off</span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-amber-600 mt-2">{pendingCount}</p>
          <p className="text-[11px] text-slate-400 mt-1">Awaiting secondary check</p>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-slate-200">
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => setActiveTab("ledger")}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "ledger"
                ? "border-[#2563EB] text-[#2563EB]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <ClipboardCheck className="h-3.5 w-3.5" />
            <span>1. Verification Ledger ({records.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("rules")}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "rules"
                ? "border-[#2563EB] text-[#2563EB]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>2. Automated Compliance Rules ({rules.filter((r) => r.isActive).length} Active)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("reports")}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "reports"
                ? "border-[#2563EB] text-[#2563EB]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Award className="h-3.5 w-3.5" />
            <span>3. Compliance Reports & Clearance</span>
          </button>
        </div>
      </div>

      {/* ================= TAB 1: VERIFICATION LEDGER ================= */}
      {activeTab === "ledger" && (
        <div className="space-y-4">
          {/* Filter Toolbar */}
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
              {/* Search */}
              <SearchField
                value={searchTerm}
                onChange={(val) => {
                  setSearchTerm(val);
                  setCurrentPage(1);
                }}
                placeholder="Search ref, item, staff..."
              />

              {/* Module Filter */}
              <div>
                <select
                  value={moduleFilter}
                  onChange={(e) => {
                    setModuleFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                >
                  <option value="all">All Modules</option>
                  <option value="Invoices">Invoices & Billing</option>
                  <option value="Excel Uploads">Excel Uploads</option>
                  <option value="Jobs">Jobs Management</option>
                  <option value="Suppliers">Suppliers Directory</option>
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                >
                  <option value="all">All Audit Statuses</option>
                  <option value="Verified">Verified & Cleared</option>
                  <option value="Flagged">Flagged Discrepancy</option>
                  <option value="Pending">Pending Audit</option>
                </select>
              </div>

              {/* Clear / total */}
              <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-slate-500">
                {(searchTerm || moduleFilter !== "all" || statusFilter !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm("");
                      setModuleFilter("all");
                      setStatusFilter("all");
                      setCurrentPage(1);
                    }}
                    className="text-blue-600 hover:underline font-semibold"
                  >
                    Clear Filters
                  </button>
                )}
                <span>
                  Showing: <strong>{filteredRecords.length}</strong> items
                </span>
              </div>
            </div>
          </div>

          {/* Audit Records Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            {filteredRecords.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No audit ledger records match your filter criteria.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3">Audit Ref & Timestamp</th>
                    <th className="px-4 py-3">Audited Item / Entity</th>
                    <th className="px-4 py-3">Originator</th>
                    <th className="px-4 py-3 text-right">Value (Rs.)</th>
                    <th className="px-4 py-3">Audit Verification Check</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedRecords.map((rec) => {
                    return (
                      <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                        {/* Ref & Time */}
                        <td className="px-5 py-3.5">
                          <span className="font-mono text-xs font-bold text-blue-700 block">
                            {rec.refCode}
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            {rec.timestamp}
                          </span>
                        </td>

                        {/* Entity */}
                        <td className="px-4 py-3.5">
                          <span className="font-semibold text-slate-900 block max-w-xs truncate">
                            {rec.entityName}
                          </span>
                          <span className="text-[10px] text-slate-500 uppercase font-mono mt-0.5 inline-block bg-slate-100 px-1.5 py-0.2 rounded">
                            {rec.module}
                          </span>
                        </td>

                        {/* Originator */}
                        <td className="px-4 py-3.5 text-slate-600">
                          {rec.originator}
                        </td>

                        {/* Value */}
                        <td className="px-4 py-3.5 text-right font-mono font-semibold text-slate-900">
                          {rec.value
                            ? `Rs. ${rec.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                            : "—"}
                        </td>

                        {/* Check Type & notes */}
                        <td className="px-4 py-3.5">
                          <span className="text-slate-800 font-medium block">
                            {rec.checkType}
                          </span>
                          <span className="text-[10px] text-slate-400 italic block truncate max-w-xs mt-0.5">
                            {rec.auditorNotes}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              rec.status === "Verified"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : rec.status === "Flagged"
                                ? "bg-rose-50 text-rose-700 border border-rose-200"
                                : "bg-amber-50 text-amber-700 border border-amber-200"
                            }`}
                          >
                            {rec.status === "Verified" ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : rec.status === "Flagged" ? (
                              <AlertTriangle className="h-3 w-3" />
                            ) : (
                              <Clock className="h-3 w-3" />
                            )}
                            {rec.status}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openInspection(rec)}
                              className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold flex items-center gap-1"
                              title="Inspect Checklist"
                            >
                              <Eye className="h-3 w-3" />
                              <span>Inspect</span>
                            </button>

                            {rec.status !== "Verified" && (
                              <button
                                type="button"
                                onClick={() => handleVerify(rec.id)}
                                className="p-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700"
                                title="Certify / Clear"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                            )}

                            {rec.status !== "Flagged" && (
                              <button
                                type="button"
                                onClick={() => handleFlag(rec.id)}
                                className="p-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700"
                                title="Flag Issue"
                              >
                                <AlertTriangle className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredRecords.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setCurrentPage(1);
            }}
          />
        </div>
      )}

      {/* ================= TAB 2: AUTOMATED AUDIT RULES ================= */}
      {activeTab === "rules" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Automated Compliance & Risk Rules Engine
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure automated inspection triggers to flag suspicious vouchers, duplicate bills, or unauthorized thresholds.
                </p>
              </div>

              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 shrink-0">
                {rules.filter((r) => r.isActive).length} of {rules.length} Policies Active
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {rules.map((rule) => {
                return (
                  <div
                    key={rule.id}
                    className={`p-4 rounded-xl border transition-all ${
                      rule.isActive
                        ? "border-slate-200 bg-white shadow-xs"
                        : "border-slate-200 bg-slate-50/60 opacity-75"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            {rule.code}
                          </span>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase font-mono ${
                              rule.severity === "Critical"
                                ? "bg-rose-100 text-rose-700"
                                : rule.severity === "High"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {rule.severity} Risk
                          </span>
                          {rule.threshold && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                              {rule.threshold}
                            </span>
                          )}
                        </div>

                        <h4 className="text-xs font-bold text-slate-900 pt-0.5">
                          {rule.title}
                        </h4>
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          {rule.description}
                        </p>
                      </div>

                      {/* Active Toggle Switch */}
                      <button
                        type="button"
                        onClick={() => handleToggleRule(rule.id)}
                        className={`h-6 w-11 rounded-full p-0.5 transition-colors inline-flex items-center shrink-0 ${
                          rule.isActive ? "bg-emerald-600" : "bg-slate-300"
                        }`}
                        title="Toggle Rule Active Status"
                      >
                        <span
                          className={`h-5 w-5 rounded-full bg-white shadow-xs transition-transform transform ${
                            rule.isActive ? "translate-x-5" : "translate-x-0"
                          } flex items-center justify-center text-[10px]`}
                        >
                          {rule.isActive ? (
                            <Check className="h-3 w-3 text-emerald-600 font-bold" />
                          ) : (
                            <X className="h-3 w-3 text-slate-400" />
                          )}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 3: COMPLIANCE REPORTS ================= */}
      {activeTab === "reports" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Coverage Stat Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5 text-[#2563EB]" />
                <h3 className="text-xs font-bold text-slate-900">Audit Coverage Metrics</h3>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Vendor Invoices Checked</span>
                  <strong className="text-slate-900">100% (6 of 6)</strong>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className="bg-emerald-500 h-2 rounded-full w-full" />
                </div>

                <div className="flex justify-between text-slate-600 pt-1">
                  <span>BOQ Excel Schedules Verified</span>
                  <strong className="text-slate-900">100% (4 of 4)</strong>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className="bg-emerald-500 h-2 rounded-full w-full" />
                </div>

                <div className="flex justify-between text-slate-600 pt-1">
                  <span>Supplier Tax TIN Validated</span>
                  <strong className="text-slate-900">100% (5 of 5)</strong>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className="bg-emerald-500 h-2 rounded-full w-full" />
                </div>
              </div>
            </div>

            {/* Auditor Certification Box */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 md:col-span-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileCheck className="h-5 w-5 text-emerald-600" />
                  <h3 className="text-xs font-bold text-slate-900">
                    Audit Clearance Certification
                  </h3>
                </div>
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Certified Compliant
                </span>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                This ERP ledger is currently evaluated under the Internal Financial Control framework. All job expenditures, supplier vouchers, and billing records match authenticated proof attachments.
              </p>

              <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">Certified Auditor</span>
                  <strong className="text-slate-800">Dilani Alwis (Compliance Lead)</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Audit Cycle</span>
                  <strong className="text-slate-800">Q3 2026 Commercial Review</strong>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    showToast(
                      "Certificate Generated",
                      "Audit Clearance Certificate downloaded successfully.",
                      "success"
                    )
                  }
                  className="px-3.5 py-1.5 rounded-lg bg-[#2563EB] text-white text-xs font-semibold hover:bg-[#1d4ed8]"
                >
                  Download Certificate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: INSPECT RECORD CHECKLIST ================= */}
      {inspectingRecord && (
        <Modal
          isOpen={true}
          onClose={() => setInspectingRecord(null)}
          title={`Audit Inspection: ${inspectingRecord.refCode}`}
          description="Detailed compliance review, document checks, and auditor certification."
          maxWidth="lg"
        >
          <div className="space-y-4">
            {/* Meta summary */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">{inspectingRecord.entityName}</span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                    inspectingRecord.status === "Verified"
                      ? "bg-emerald-100 text-emerald-700"
                      : inspectingRecord.status === "Flagged"
                      ? "bg-rose-100 text-rose-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {inspectingRecord.status}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] text-slate-600">
                <div>
                  <span className="text-slate-400 block">Module</span>
                  <strong>{inspectingRecord.module}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Originator</span>
                  <strong>{inspectingRecord.originator}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Value</span>
                  <strong>
                    {inspectingRecord.value ? `$${inspectingRecord.value.toFixed(2)}` : "—"}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Timestamp</span>
                  <strong>{inspectingRecord.timestamp}</strong>
                </div>
              </div>
            </div>

            {/* Audit Checklist */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-800">
                Automated Verification Checklist:
              </h4>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-slate-700">1. Supporting Document Attached (PDF / Photo)</span>
                  {inspectingRecord.checklist.documentAttached ? (
                    <span className="text-emerald-600 font-bold flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" /> Passed
                    </span>
                  ) : (
                    <span className="text-rose-600 font-bold flex items-center gap-1">
                      <X className="h-3.5 w-3.5" /> Missing
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-slate-700">2. Mathematical & Tax Calculation Accuracy</span>
                  {inspectingRecord.checklist.mathAccurate ? (
                    <span className="text-emerald-600 font-bold flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" /> Passed
                    </span>
                  ) : (
                    <span className="text-rose-600 font-bold flex items-center gap-1">
                      <X className="h-3.5 w-3.5" /> Error
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-slate-700">3. Expenditure Authority & Segregation of Duties</span>
                  {inspectingRecord.checklist.authorizationValid ? (
                    <span className="text-emerald-600 font-bold flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" /> Passed
                    </span>
                  ) : (
                    <span className="text-rose-600 font-bold flex items-center gap-1">
                      <X className="h-3.5 w-3.5" /> Failed
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-slate-700">4. Registered Supplier Active & Validated</span>
                  {inspectingRecord.checklist.vendorVerified ? (
                    <span className="text-emerald-600 font-bold flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" /> Passed
                    </span>
                  ) : (
                    <span className="text-rose-600 font-bold flex items-center gap-1">
                      <X className="h-3.5 w-3.5" /> Failed
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Auditor Notes Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Auditor Notes & Observations
              </label>
              <textarea
                rows={2}
                value={inspectNotes}
                onChange={(e) => setInspectNotes(e.target.value)}
                className="w-full rounded-lg border border-slate-200 p-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>

            {/* Modal Decision Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setInspectingRecord(null)}
                className="h-8 px-3.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleFlag(inspectingRecord.id, inspectNotes)}
                  className="h-8 px-3.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold hover:bg-rose-100"
                >
                  Flag Discrepancy
                </button>
                <button
                  type="button"
                  onClick={() => handleVerify(inspectingRecord.id)}
                  className="h-8 px-4 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 shadow-xs"
                >
                  Certify & Verify
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
