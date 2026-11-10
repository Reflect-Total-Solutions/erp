"use client";

import React, { useMemo, useState } from "react";
import {
  Printer,
  FileSpreadsheet,
  Building2,
  Briefcase,
  Layers,
  CheckCircle2,
  Calendar,
} from "lucide-react";
import {
  Department,
  PurchaseOrder,
  PurchaseOrderDepartmentAllocation,
  PurchaseOrderItem,
  PurchaseOrderSettings,
} from "@/types/admin";
import { formatCurrency, roundFinancial } from "@/lib/financial";
import { StatusBadge } from "@/components/admin/ui/badge";

export interface PoPreviewProps {
  po: {
    id?: string;
    poNumber?: string;
    poDate?: string;
    quotationRef?: string | null;
    expectedDeliveryDate?: string | null;
    status?: string;
    approvalStatus?: string;
    jobCode?: string;
    jobName?: string;
    clientName?: string;
    supplierName?: string;
    supplierAddress?: string;
    supplierContactPerson?: string;
    supplierPhone?: string;
    supplierEmail?: string;
    deliverToName?: string;
    deliverToAddress?: string;
    deliverToEmail?: string | null;
    comments?: string | null;
    terms?: string | null;
    currency?: string;
    subTotal?: number;
    discountAmount?: number;
    totalAfterDiscount?: number;
    applySscl?: boolean;
    ssclRate?: number;
    ssclAmount?: number;
    totalWithSscl?: number;
    applyVat?: boolean;
    vatRate?: number;
    vatAmount?: number;
    grandTotal?: number;
    createdByName?: string | null;
    approvedByName?: string | null;
    approvedAt?: string | null;
    hasDepartmentAllocation?: boolean;
    departmentAllocationMode?: string | null;
    items?: Array<Partial<PurchaseOrderItem>>;
    departmentAllocations?: Array<Partial<PurchaseOrderDepartmentAllocation>>;
  };
  settings?: Partial<PurchaseOrderSettings> | null;
  departments?: Department[];
  canPrint?: boolean;
  canDownloadExcel?: boolean;
  hideToolbar?: boolean;
}

function fmtDate(val?: string | null): string {
  if (!val) return "—";
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  return d.toISOString().split("T")[0];
}

export function PoDocumentPreview({
  po,
  settings,
  departments = [],
  canPrint = true,
  canDownloadExcel = true,
  hideToolbar = false,
}: PoPreviewProps) {
  const [activeSheet, setActiveSheet] = useState<"both" | "sheet1" | "sheet2">("both");

  const currency = po.currency || settings?.defaultCurrency || "LKR";
  const currencyPrefix = currency === "LKR" ? "Rs. " : `${currency} `;
  const companyName = settings?.companyName || "Reflect Total Solutions (Pvt) Ltd.";
  const companyAddress =
    settings?.companyAddress || "13/2, Sri Dharmapala MW, Mount Lavinia, Sri Lanka.";
  const companyRegNo = settings?.companyRegNo || "";
  const companyEmail = settings?.companyEmail || "";
  const companyPhone = settings?.companyPhone || "";

  const items = useMemo(() => po.items || [], [po.items]);

  // Aggregate department allocation columns & rows cleanly from either po.departmentAllocations or per-item allocations
  const deptMatrix = useMemo(() => {
    const flattened: Array<{
      purchaseOrderItemId?: string | null;
      itemIndex?: number;
      departmentId: string;
      departmentName: string;
      allocatedQuantity: number;
      allocatedAmount: number;
    }> = [];

    const deptNameMap = new Map<string, string>();
    departments.forEach((d) => deptNameMap.set(d.id, d.name));

    if (po.departmentAllocations && po.departmentAllocations.length > 0) {
      po.departmentAllocations.forEach((a) => {
        if (!a.departmentId) return;
        const amt = Number(a.allocatedAmount || 0);
        const qty = Number(a.allocatedQuantity || 0);
        if (amt <= 0 && qty <= 0) return;
        flattened.push({
          purchaseOrderItemId: a.purchaseOrderItemId || null,
          departmentId: a.departmentId,
          departmentName:
            a.departmentName || deptNameMap.get(a.departmentId) || a.departmentCode || "Department",
          allocatedQuantity: qty,
          allocatedAmount: amt,
        });
      });
    } else {
      items.forEach((item, idx) => {
        (item.departmentAllocations || []).forEach((a) => {
          if (!a.departmentId) return;
          const amt = Number(a.allocatedAmount || 0);
          const qty = Number(a.allocatedQuantity || 0);
          if (amt <= 0 && qty <= 0) return;
          flattened.push({
            purchaseOrderItemId: item.id || `row-${idx}`,
            itemIndex: idx,
            departmentId: a.departmentId,
            departmentName:
              a.departmentName ||
              deptNameMap.get(a.departmentId) ||
              a.departmentCode ||
              "Department",
            allocatedQuantity: qty,
            allocatedAmount: amt,
          });
        });
      });
    }

    const usedDeptsMap = new Map<string, { id: string; name: string }>();
    flattened.forEach((f) => {
      if (!usedDeptsMap.has(f.departmentId)) {
        usedDeptsMap.set(f.departmentId, { id: f.departmentId, name: f.departmentName });
      }
    });
    const usedDepts = Array.from(usedDeptsMap.values());
    const mode = po.departmentAllocationMode === "QUANTITY" ? "QUANTITY" : "AMOUNT";

    const rows = items.map((item, idx) => {
      const keyId = item.id || `row-${idx}`;
      const rowAllocs = flattened.filter(
        (f) => f.purchaseOrderItemId === keyId || f.itemIndex === idx
      );
      let rowTotal = 0;
      const values = usedDepts.map((d) => {
        const match = rowAllocs.find((f) => f.departmentId === d.id);
        const val = match
          ? mode === "QUANTITY"
            ? match.allocatedQuantity
            : match.allocatedAmount
          : 0;
        rowTotal += val;
        return val;
      });
      return {
        rowNo: item.rowNumber || idx + 1,
        particular: item.particular || "Item",
        baseValue:
          mode === "QUANTITY" ? Number(item.quantity || 0) : Number(item.totalAmount || 0),
        values,
        rowTotal,
      };
    });

    const deptTotals = usedDepts.map((_, dIdx) =>
      rows.reduce((sum, r) => sum + (r.values[dIdx] || 0), 0)
    );
    const grandAllocated = deptTotals.reduce((a, b) => a + b, 0);

    return {
      hasData: Boolean(po.hasDepartmentAllocation && usedDepts.length > 0),
      mode,
      usedDepts,
      rows,
      deptTotals,
      grandAllocated,
    };
  }, [po, items, departments]);

  const handlePrintPo = () => {
    if (typeof window === "undefined") return;
    const escapeHtml = (s: unknown) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const win = window.open("", "_blank", "width=1024,height=840");
    if (!win) {
      window.print();
      return;
    }

    const itemsHtml = items
      .map(
        (it, idx) => `
      <tr>
        <td style="text-align:center;">${idx + 1}</td>
        <td>
          <strong>${escapeHtml(it.particular)}</strong>
          ${it.isAdditionalItem ? `<span style="font-size:10px;color:#b45309;"> [Additional]</span>` : ""}
          ${it.brand ? `<div style="font-size:11px;color:#475569;">Brand: ${escapeHtml(it.brand)}</div>` : ""}
          ${it.specifications ? `<div style="font-size:11px;color:#64748b;">Specs: ${escapeHtml(it.specifications)}</div>` : ""}
        </td>
        <td style="text-align:right;font-family:monospace;">${roundFinancial(it.quantity || 0, 2).toFixed(2)}</td>
        <td style="text-align:center;">${escapeHtml(it.measure || "Nos")}</td>
        <td style="text-align:right;font-family:monospace;">${formatCurrency(it.unitCost || 0)}</td>
        <td style="text-align:right;font-family:monospace;font-weight:bold;">${formatCurrency(it.totalAmount || 0)}</td>
      </tr>
    `
      )
      .join("");

    const deptSheetHtml = deptMatrix.hasData
      ? `
      <div style="page-break-before: always; padding-top: 20px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #0f172a;padding-bottom:10px;margin-bottom:14px;">
          <div>
            <h2 style="margin:0;font-size:16px;color:#0f172a;">${escapeHtml(companyName)}</h2>
            <p style="margin:2px 0 0;font-size:12px;font-weight:bold;color:#1d4ed8;">SHEET 2: DEPARTMENT COST & QUANTITY ALLOCATION</p>
          </div>
          <div style="text-align:right;font-size:11px;">
            <div><strong>PO No:</strong> ${escapeHtml(po.poNumber || "DRAFT")}</div>
            <div><strong>Job No:</strong> ${escapeHtml(po.jobCode || "—")}</div>
          </div>
        </div>
        <table class="grid">
          <thead>
            <tr>
              <th style="width:45px;text-align:center;">Ref</th>
              <th>Particular</th>
              <th style="text-align:right;">Item ${deptMatrix.mode === "QUANTITY" ? "Qty" : currency}</th>
              ${deptMatrix.usedDepts.map((d) => `<th style="text-align:right;">${escapeHtml(d.name)}</th>`).join("")}
              <th style="text-align:right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${deptMatrix.rows
              .map(
                (r) => `
              <tr>
                <td style="text-align:center;">${r.rowNo}</td>
                <td>${escapeHtml(r.particular)}</td>
                <td style="text-align:right;font-family:monospace;">${formatCurrency(r.baseValue)}</td>
                ${r.values.map((v) => `<td style="text-align:right;font-family:monospace;">${formatCurrency(v)}</td>`).join("")}
                <td style="text-align:right;font-family:monospace;font-weight:bold;">${formatCurrency(r.rowTotal)}</td>
              </tr>
            `
              )
              .join("")}
            <tr style="background:#f1f5f9;font-weight:bold;">
              <td colspan="3" style="text-align:right;">TOTAL BY DEPARTMENT</td>
              ${deptMatrix.deptTotals.map((t) => `<td style="text-align:right;font-family:monospace;">${formatCurrency(t)}</td>`).join("")}
              <td style="text-align:right;font-family:monospace;">${formatCurrency(deptMatrix.grandAllocated)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `
      : "";

    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Purchase Order - ${escapeHtml(po.poNumber || "Preview")}</title>
          <style>
            body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 24px; font-size: 12px; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 14px; }
            .company h1 { margin: 0; font-size: 17px; }
            .company p { margin: 2px 0; font-size: 11px; color: #475569; }
            .po-title { text-align: right; }
            .po-title h2 { margin: 0; font-size: 20px; letter-spacing: 1px; color: #1e3a8a; }
            .meta-grid { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
            .meta-grid th, .meta-grid td { border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 11px; }
            .meta-grid th { background: #f8fafc; text-transform: uppercase; font-size: 10px; color: #475569; text-align: left; }
            .two-col { display: flex; gap: 16px; margin-bottom: 14px; }
            .box { flex: 1; border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px 10px; font-size: 11px; }
            .box h4 { margin: 0 0 6px; font-size: 10px; text-transform: uppercase; color: #475569; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; }
            table.grid { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
            table.grid th, table.grid td { border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 11px; vertical-align: top; }
            table.grid th { background: #1e293b; color: #ffffff; font-size: 10px; text-transform: uppercase; }
            .bottom-split { display: flex; gap: 16px; }
            .comments-box { flex: 1.2; border: 1px solid #cbd5e1; padding: 8px 10px; font-size: 11px; }
            .totals-box { flex: 1; }
            .totals-box table { width: 100%; border-collapse: collapse; }
            .totals-box td { border: 1px solid #cbd5e1; padding: 5px 8px; font-size: 11px; }
            .grand-row { background: #eff6ff; font-weight: bold; font-size: 13px !important; color: #1e3a8a; }
            .signatures { display: flex; justify-content: space-between; margin-top: 28px; padding-top: 12px; border-top: 1px dashed #cbd5e1; font-size: 11px; }
            @media print { body { margin: 12px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="company">
              <h1>${escapeHtml(companyName)}</h1>
              <p>${escapeHtml(companyAddress)}</p>
              ${companyRegNo ? `<p>Co Reg No: ${escapeHtml(companyRegNo)}</p>` : ""}
              ${companyEmail || companyPhone ? `<p>${escapeHtml([companyEmail, companyPhone].filter(Boolean).join(" | "))}</p>` : ""}
            </div>
            <div class="po-title">
              <h2>PURCHASE ORDER</h2>
              <div style="font-family:monospace;font-size:14px;font-weight:bold;margin-top:4px;">${escapeHtml(po.poNumber || "DRAFT PREVIEW")}</div>
              <div style="font-size:11px;color:#475569;">Status: ${escapeHtml(po.status || "DRAFT")}</div>
            </div>
          </div>

          <table class="meta-grid">
            <tr>
              <th>PO Date</th><td>${escapeHtml(fmtDate(po.poDate))}</td>
              <th>Quotation Ref</th><td>${escapeHtml(po.quotationRef || "—")}</td>
              <th>Expected Delivery</th><td>${escapeHtml(fmtDate(po.expectedDeliveryDate))}</td>
              <th>Currency</th><td>${escapeHtml(currency)}</td>
            </tr>
            <tr>
              <th>Job No</th><td style="font-family:monospace;font-weight:bold;">${escapeHtml(po.jobCode || "—")}</td>
              <th>Job Name</th><td colspan="3">${escapeHtml(po.jobName || "—")}</td>
              <th>Client</th><td>${escapeHtml(po.clientName || "—")}</td>
            </tr>
          </table>

          <div class="two-col">
            <div class="box">
              <h4>Supplier / Vendor</h4>
              <div><strong>${escapeHtml(po.supplierName || "—")}</strong></div>
              <div>${escapeHtml(po.supplierAddress || "—")}</div>
              <div>Contact: ${escapeHtml(po.supplierContactPerson || "—")} | Tel: ${escapeHtml(po.supplierPhone || "—")}</div>
              <div>Email: ${escapeHtml(po.supplierEmail || "—")}</div>
            </div>
            <div class="box">
              <h4>Deliver To</h4>
              <div><strong>${escapeHtml(po.deliverToName || "—")}</strong></div>
              <div>${escapeHtml(po.deliverToAddress || "—")}</div>
              <div>Email: ${escapeHtml(po.deliverToEmail || "—")}</div>
            </div>
          </div>

          <table class="grid">
            <thead>
              <tr>
                <th style="width:45px;text-align:center;">Ref</th>
                <th>Particular / Brand / Specifications</th>
                <th style="width:75px;text-align:right;">Qty</th>
                <th style="width:70px;text-align:center;">Measure</th>
                <th style="width:110px;text-align:right;">Cost / Unit</th>
                <th style="width:120px;text-align:right;">Amount (${escapeHtml(currency)})</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>

          <div class="bottom-split">
            <div class="comments-box">
              <strong>Comments / Special Instructions:</strong>
              <p style="margin:4px 0 8px;">${escapeHtml(po.comments || "None")}</p>
              <strong>Terms & Conditions:</strong>
              <p style="margin:4px 0 0;white-space:pre-line;">${escapeHtml(po.terms || "Standard commercial PO terms apply.")}</p>
            </div>
            <div class="totals-box">
              <table>
                <tr><td>Sub-Total</td><td style="text-align:right;font-family:monospace;">${formatCurrency(po.subTotal || 0, { showCurrencyPrefix: true, currencySymbol: currencyPrefix })}</td></tr>
                <tr><td>Discount</td><td style="text-align:right;font-family:monospace;">${formatCurrency(po.discountAmount || 0, { showCurrencyPrefix: true, currencySymbol: currencyPrefix })}</td></tr>
                <tr><td>Total After Discount</td><td style="text-align:right;font-family:monospace;">${formatCurrency(po.totalAfterDiscount || 0, { showCurrencyPrefix: true, currencySymbol: currencyPrefix })}</td></tr>
                <tr><td>${po.applySscl ? `SSCL (${po.ssclRate ?? 0}%)` : "SSCL (Disabled)"}</td><td style="text-align:right;font-family:monospace;">${formatCurrency(po.ssclAmount || 0, { showCurrencyPrefix: true, currencySymbol: currencyPrefix })}</td></tr>
                <tr><td>Total With SSCL</td><td style="text-align:right;font-family:monospace;">${formatCurrency(po.totalWithSscl || 0, { showCurrencyPrefix: true, currencySymbol: currencyPrefix })}</td></tr>
                <tr><td>${po.applyVat ? `VAT (${po.vatRate ?? 0}%)` : "VAT (Disabled)"}</td><td style="text-align:right;font-family:monospace;">${formatCurrency(po.vatAmount || 0, { showCurrencyPrefix: true, currencySymbol: currencyPrefix })}</td></tr>
                <tr class="grand-row"><td>GRAND TOTAL (${escapeHtml(currency)})</td><td style="text-align:right;font-family:monospace;">${formatCurrency(po.grandTotal || 0, { showCurrencyPrefix: true, currencySymbol: currencyPrefix })}</td></tr>
              </table>
            </div>
          </div>

          <div class="signatures">
            <div><strong>Prepared By:</strong><br/>${escapeHtml(po.createdByName || "ERP User")}</div>
            <div><strong>Authorised By:</strong><br/>${escapeHtml(po.approvedByName || (po.approvalStatus === "APPROVED" ? "Authorised Signatory" : "Pending Approval"))}</div>
            <div><strong>Approved Date:</strong><br/>${escapeHtml(fmtDate(po.approvedAt))}</div>
          </div>
          ${deptSheetHtml}
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 250);
  };

  return (
    <div className="space-y-4">
      {/* Preview Toolbar */}
      {!hideToolbar && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveSheet("both")}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                activeSheet === "both"
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
              }`}
            >
              All Sheets
            </button>
            <button
              type="button"
              onClick={() => setActiveSheet("sheet1")}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                activeSheet === "sheet1"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
              }`}
            >
              Sheet 1: Purchase Order
            </button>
            {deptMatrix.hasData && (
              <button
                type="button"
                onClick={() => setActiveSheet("sheet2")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 ${
                  activeSheet === "sheet2"
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                Sheet 2: Department Allocation
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {canPrint && (
              <button
                type="button"
                onClick={handlePrintPo}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Print PO</span>
              </button>
            )}
            {canDownloadExcel && po.id && (
              <a
                href={`/api/purchase-orders/${po.id}/export/excel`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>Download Excel</span>
              </a>
            )}
          </div>
        </div>
      )}

      {/* SHEET 1: FORMAL PURCHASE ORDER DOCUMENT */}
      {(activeSheet === "both" || activeSheet === "sheet1") && (
        <div className="rounded-xl border border-slate-300 bg-white p-5 sm:p-7 shadow-xs space-y-5 text-xs">
          {/* Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b-2 border-slate-900 pb-4">
            <div className="flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt={companyName}
                className="h-12 w-auto object-contain rounded border border-slate-100 p-0.5 bg-white"
              />
              <div>
                <h3 className="text-base font-extrabold text-slate-900">{companyName}</h3>
                <p className="text-[11px] text-slate-600 mt-0.5 max-w-md">{companyAddress}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-500 mt-1">
                  {companyRegNo && <span>Reg No: {companyRegNo}</span>}
                  {companyPhone && <span>Tel: {companyPhone}</span>}
                  {companyEmail && <span>Email: {companyEmail}</span>}
                </div>
              </div>
            </div>

            <div className="text-left sm:text-right">
              <p className="text-xl font-black tracking-wider text-blue-800 uppercase">
                Purchase Order
              </p>
              <p className="font-mono text-sm font-bold text-slate-900 mt-0.5">
                {po.poNumber || "AUTO-GENERATED ON SAVE"}
              </p>
              <div className="mt-1.5 flex sm:justify-end">
                <StatusBadge status={po.status || "DRAFT"} />
              </div>
            </div>
          </div>

          {/* Meta Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 block">PO Date</span>
              <span className="font-mono font-semibold text-slate-800">{fmtDate(po.poDate)}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Quotation Ref</span>
              <span className="font-semibold text-slate-800">{po.quotationRef || "—"}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 block">
                Expected Delivery
              </span>
              <span className="font-mono font-semibold text-slate-800 flex items-center gap-1">
                <Calendar className="h-3 w-3 text-slate-400" />
                {fmtDate(po.expectedDeliveryDate)}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Currency</span>
              <span className="font-mono font-bold text-blue-700">{currency}</span>
            </div>
          </div>

          {/* Job Link Banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50/60 px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-blue-600 shrink-0" />
              <span className="text-slate-600">
                Linked Job:{" "}
                <strong className="font-mono text-blue-800">{po.jobCode || "—"}</strong> —{" "}
                <strong className="text-slate-900">{po.jobName || "Not Selected"}</strong>
              </span>
            </div>
            {po.clientName && (
              <span className="text-[11px] text-slate-600">
                Client: <strong className="text-slate-800">{po.clientName}</strong>
              </span>
            )}
          </div>

          {/* Supplier vs Deliver To Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-slate-200 p-3.5 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-100 pb-1.5 mb-1.5">
                <Building2 className="h-3.5 w-3.5 text-slate-500" />
                Supplier / Vendor
              </p>
              <p className="font-bold text-slate-900 text-sm">{po.supplierName || "—"}</p>
              <p className="text-slate-600">{po.supplierAddress || "—"}</p>
              <p className="text-[11px] text-slate-500">
                Contact: {po.supplierContactPerson || "—"} • Tel: {po.supplierPhone || "—"}
              </p>
              <p className="text-[11px] text-slate-500">Email: {po.supplierEmail || "—"}</p>
            </div>

            <div className="rounded-lg border border-slate-200 p-3.5 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1.5 mb-1.5">
                Deliver To
              </p>
              <p className="font-bold text-slate-900 text-sm">{po.deliverToName || "—"}</p>
              <p className="text-slate-600">{po.deliverToAddress || "—"}</p>
              {po.deliverToEmail && (
                <p className="text-[11px] text-slate-500">Email: {po.deliverToEmail}</p>
              )}
            </div>
          </div>

          {/* Line Items Table */}
          <div className="overflow-x-auto rounded-lg border border-slate-300">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white text-[10px] uppercase tracking-wider">
                  <th className="py-2.5 px-3 w-10 text-center">Ref</th>
                  <th className="py-2.5 px-3">Particular / Brand / Specifications</th>
                  <th className="py-2.5 px-3 text-right w-20">Qty</th>
                  <th className="py-2.5 px-3 text-center w-20">Measure</th>
                  <th className="py-2.5 px-3 text-right w-28">Cost / Unit</th>
                  <th className="py-2.5 px-3 text-right w-32">Amount ({currency})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">
                      No line items added yet.
                    </td>
                  </tr>
                ) : (
                  items.map((item, idx) => (
                    <tr key={item.id || idx} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3 text-center font-mono text-slate-500">
                        {item.rowNumber || idx + 1}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900 flex items-center gap-1.5 flex-wrap">
                          <span>{item.particular || "—"}</span>
                          {item.isAdditionalItem && (
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                              Additional Cost
                            </span>
                          )}
                        </div>
                        {(item.brand || item.specifications || item.jobCostCategoryName) && (
                          <div className="text-[11px] text-slate-500 mt-0.5 space-x-2">
                            {item.jobCostCategoryName && (
                              <span className="text-blue-700 font-medium">
                                [{item.jobCostCategoryName}]
                              </span>
                            )}
                            {item.brand && <span>Brand: {item.brand}</span>}
                            {item.specifications && <span>Specs: {item.specifications}</span>}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-800">
                        {roundFinancial(item.quantity || 0, 2).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-600">
                        {item.measure || "Nos"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                        {formatCurrency(item.unitCost || 0)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(item.totalAmount || 0)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Bottom Split: Comments & Financial Summary */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-1">
            <div className="md:col-span-7 rounded-lg border border-slate-200 bg-slate-50/50 p-3.5 space-y-2.5">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-500">
                  Comments or Special Instructions
                </p>
                <p className="text-slate-700 mt-0.5 whitespace-pre-line">
                  {po.comments || "None"}
                </p>
              </div>
              <div className="border-t border-slate-200 pt-2">
                <p className="text-[10px] font-bold uppercase text-slate-500">Terms & Conditions</p>
                <p className="text-[11px] text-slate-600 mt-0.5 whitespace-pre-line">
                  {po.terms || "Standard commercial PO terms apply."}
                </p>
              </div>
            </div>

            <div className="md:col-span-5 rounded-lg border border-slate-300 overflow-hidden">
              <table className="w-full text-xs">
                <tbody className="divide-y divide-slate-200">
                  <tr>
                    <td className="py-2 px-3 text-slate-600 font-medium">Sub-Total</td>
                    <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900">
                      {formatCurrency(po.subTotal || 0, {
                        showCurrencyPrefix: true,
                        currencySymbol: currencyPrefix,
                      })}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-slate-600">Discount</td>
                    <td className="py-2 px-3 text-right font-mono text-rose-700">
                      -{" "}
                      {formatCurrency(po.discountAmount || 0, {
                        showCurrencyPrefix: true,
                        currencySymbol: currencyPrefix,
                      })}
                    </td>
                  </tr>
                  <tr className="bg-slate-50">
                    <td className="py-2 px-3 text-slate-700 font-semibold">Total After Discount</td>
                    <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900">
                      {formatCurrency(po.totalAfterDiscount || 0, {
                        showCurrencyPrefix: true,
                        currencySymbol: currencyPrefix,
                      })}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-slate-600">
                      {po.applySscl ? `SSCL (${po.ssclRate ?? 0}%)` : "SSCL (Disabled)"}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-800">
                      {formatCurrency(po.ssclAmount || 0, {
                        showCurrencyPrefix: true,
                        currencySymbol: currencyPrefix,
                      })}
                    </td>
                  </tr>
                  <tr className="bg-slate-50">
                    <td className="py-2 px-3 text-slate-700 font-semibold">Total With SSCL</td>
                    <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900">
                      {formatCurrency(po.totalWithSscl || 0, {
                        showCurrencyPrefix: true,
                        currencySymbol: currencyPrefix,
                      })}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-slate-600">
                      {po.applyVat ? `VAT (${po.vatRate ?? 0}%)` : "VAT (Disabled)"}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-800">
                      {formatCurrency(po.vatAmount || 0, {
                        showCurrencyPrefix: true,
                        currencySymbol: currencyPrefix,
                      })}
                    </td>
                  </tr>
                  <tr className="bg-blue-50 text-blue-900 font-bold text-sm">
                    <td className="py-2.5 px-3">TOTAL ({currency})</td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {formatCurrency(po.grandTotal || 0, {
                        showCurrencyPrefix: true,
                        currencySymbol: currencyPrefix,
                      })}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Signatory Footer */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-dashed border-slate-300 pt-4 text-[11px] text-slate-600">
            <div>
              <span className="text-[10px] uppercase text-slate-400 block">Prepared By</span>
              <span className="font-bold text-slate-800">{po.createdByName || "ERP User"}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase text-slate-400 block">Authorised By</span>
              <span className="font-bold text-slate-800 flex items-center gap-1">
                {po.approvedByName ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    {po.approvedByName}
                  </>
                ) : (
                  po.approvalStatus === "APPROVED" ? "Authorised Signatory" : "Pending Authorization"
                )}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase text-slate-400 block">Approved Date</span>
              <span className="font-mono font-semibold text-slate-800">
                {fmtDate(po.approvedAt)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* SHEET 2: DEPARTMENT COST & QUANTITY ALLOCATION MATRIX */}
      {deptMatrix.hasData && (activeSheet === "both" || activeSheet === "sheet2") && (
        <div className="rounded-xl border border-indigo-200 bg-white p-5 sm:p-6 shadow-xs space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 pb-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
                Sheet 2 — Multi-Department Allocation
              </p>
              <h4 className="text-sm font-bold text-slate-900">
                Department Cost Allocation Breakdown ({deptMatrix.mode === "QUANTITY" ? "By Quantity" : `By Amount (${currency})`})
              </h4>
            </div>
            <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200">
              {po.poNumber || "DRAFT PREVIEW"}
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-indigo-50/90 text-indigo-950 text-[10px] uppercase tracking-wider border-b border-indigo-200">
                  <th className="py-2.5 px-3 w-12 text-center">Ref</th>
                  <th className="py-2.5 px-3">Particular</th>
                  <th className="py-2.5 px-3 text-right">
                    Item {deptMatrix.mode === "QUANTITY" ? "Qty" : currency}
                  </th>
                  {deptMatrix.usedDepts.map((d) => (
                    <th key={d.id} className="py-2.5 px-3 text-right">
                      {d.name}
                    </th>
                  ))}
                  <th className="py-2.5 px-3 text-right bg-indigo-100/70">Total Allocated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deptMatrix.rows.map((r) => (
                  <tr key={r.rowNo} className="hover:bg-slate-50">
                    <td className="py-2 px-3 text-center font-mono text-slate-500">{r.rowNo}</td>
                    <td className="py-2 px-3 font-medium text-slate-800">{r.particular}</td>
                    <td className="py-2 px-3 text-right font-mono text-slate-600">
                      {formatCurrency(r.baseValue)}
                    </td>
                    {r.values.map((v, idx) => (
                      <td key={idx} className="py-2 px-3 text-right font-mono text-slate-700">
                        {v > 0 ? formatCurrency(v) : "—"}
                      </td>
                    ))}
                    <td className="py-2 px-3 text-right font-mono font-bold text-indigo-800 bg-indigo-50/30">
                      {formatCurrency(r.rowTotal)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                  <td colSpan={3} className="py-2.5 px-3 text-right uppercase text-[10px] tracking-wider">
                    Total By Department
                  </td>
                  {deptMatrix.deptTotals.map((t, idx) => (
                    <td key={idx} className="py-2.5 px-3 text-right font-mono text-slate-900">
                      {formatCurrency(t)}
                    </td>
                  ))}
                  <td className="py-2.5 px-3 text-right font-mono text-indigo-900 bg-indigo-100/80">
                    {formatCurrency(deptMatrix.grandAllocated)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
