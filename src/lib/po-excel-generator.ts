import * as XLSX from "xlsx";
import { PurchaseOrder, PurchaseOrderSettings } from "@/types/admin";
import { roundFinancial } from "@/lib/financial";

function formatIsoDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  return d.toISOString().split("T")[0];
}

/**
 * Generates an Excel (.xlsx) workbook for a Purchase Order matching the dual-sheet ERP PO template:
 *   Sheet 1: PURCHASE ORDER (Company header, PO Meta, Supplier, Deliver To, Job info, Items table, Summary & Tax breakdown, Comments, Authorised signature)
 *   Sheet 2: DEPARTMENT ALLOCATION (Dynamic department matrix for cost/qty allocation if present)
 */
export function generatePurchaseOrderWorkbook(
  po: PurchaseOrder,
  settings?: Partial<PurchaseOrderSettings> | null
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const companyName = settings?.companyName || "Reflect Total Solutions (Pvt) Ltd.";
  const companyAddress = settings?.companyAddress || "13/2, Sri Dharmapala MW, Mount Lavinia, Sri Lanka.";
  const companyRegNo = settings?.companyRegNo ? `Co Reg No : ${settings.companyRegNo}` : "";
  const currency = po.currency || "LKR";

  // ── SHEET 1: PURCHASE ORDER ─────────────────────────────────────────────────
  const rows: (string | number)[][] = [];

  rows.push(["", companyName]);
  rows.push(["", companyAddress]);
  if (companyRegNo) rows.push(["", companyRegNo]);
  if (settings?.companyEmail || settings?.companyPhone) {
    rows.push(["", [settings.companyEmail, settings.companyPhone].filter(Boolean).join(" | ")]);
  }
  rows.push([]);
  rows.push(["", "PURCHASE ORDER", "", "", "", "", "", "", "STATUS:", po.status]);
  rows.push([]);

  // Metadata strip matching Sheet1 rows 10-11
  rows.push(["", "DATE", "QUOTATION REF", "", "", "PO NO", "", "DELIVERY DATE", "CURRENCY"]);
  rows.push([
    "",
    formatIsoDate(po.poDate),
    po.quotationRef || "—",
    "",
    "",
    po.poNumber,
    "",
    formatIsoDate(po.expectedDeliveryDate),
    currency,
  ]);
  rows.push([]);

  // Supplier & Deliver To side-by-side blocks matching Sheet1 rows 13-18
  rows.push(["", "SUPPLIER :", "", "", "", "DELIVER TO :"]);
  rows.push([
    "",
    po.supplierName || po.supplier?.name || "—",
    "",
    "",
    "",
    po.deliverToName || "—",
  ]);
  rows.push([
    "",
    po.supplierAddress || po.supplier?.address || "—",
    "",
    "",
    "",
    po.deliverToAddress || "—",
  ]);
  rows.push([
    "",
    `Contact: ${po.supplierContactPerson || po.supplier?.contactPerson || "—"} | Tel: ${po.supplierPhone || po.supplier?.phone || "—"}`,
    "",
    "",
    "",
    `e-mail: ${po.deliverToEmail || "—"}`,
  ]);
  rows.push([
    "",
    `e-mail: ${po.supplierEmail || po.supplier?.email || "—"}`,
    "",
    "",
    "",
    "",
  ]);
  rows.push([]);

  // Job Link Section matching Sheet1 rows 20-21
  rows.push(["", "JOB NO :", po.jobCode || po.job?.jobCode || "—", "", "JOB NAME :", po.jobName || po.job?.name || "—"]);
  rows.push(["", "CLIENT :", po.clientName || po.job?.clientName || "—", "", "CREATED BY :", po.createdByName || "—"]);
  rows.push([]);

  // Items Table Header (matching template row 23: REF, PARTICULAR, BRAND, SPECIFICATIONS, QTY, MEASURE, COST/UNIT, AMOUNT)
  const itemHeaderRowIndex = rows.length;
  rows.push([
    "",
    "REF",
    "PARTICULAR",
    "BRAND",
    "SPECIFICATIONS",
    "QTY",
    "MEASURE",
    `COST/UNIT (${currency})`,
    `AMOUNT (${currency})`,
  ]);

  const items = po.items || [];
  items.forEach((item, idx) => {
    const label = item.isAdditionalItem
      ? `${item.particular} [Additional]`
      : item.particular;
    rows.push([
      "",
      item.rowNumber || idx + 1,
      label,
      item.brand || "",
      item.specifications || "",
      roundFinancial(item.quantity, 4).toNumber(),
      item.measure || "Nos",
      roundFinancial(item.unitCost, 2).toNumber(),
      roundFinancial(item.totalAmount, 2).toNumber(),
    ]);
  });

  rows.push([]);

  // Bottom Summary & Comments Split (matching rows 35-46)
  const ssclLabel = po.applySscl ? `SSCL ${po.ssclRate}%` : "SSCL (Disabled)";
  const vatLabel = po.applyVat ? `VAT ${po.vatRate}%` : "VAT (Disabled)";

  rows.push(["", "Comments or Special Instructions:", po.comments || "None", "", "", "", "", "SUB-TOTAL", roundFinancial(po.subTotal, 2).toNumber()]);
  rows.push(["", "Terms & Conditions:", po.terms || "Standard commercial PO terms apply.", "", "", "", "", "DISCOUNT", roundFinancial(po.discountAmount, 2).toNumber()]);
  rows.push(["", "", "", "", "", "", "", "TOTAL AFTER DISCOUNT", roundFinancial(po.totalAfterDiscount, 2).toNumber()]);
  rows.push(["", "All correspondences should refer to:", "", "", "", "", "", ssclLabel, roundFinancial(po.ssclAmount, 2).toNumber()]);
  rows.push(["", "Quotation Ref:", po.quotationRef || "—", "", "", "", "", "TOTAL WITH SSCL", roundFinancial(po.totalWithSscl, 2).toNumber()]);
  rows.push(["", "Delivery Date:", formatIsoDate(po.expectedDeliveryDate), "", "", "", "", vatLabel, roundFinancial(po.vatAmount, 2).toNumber()]);
  rows.push(["", "", "", "", "", "", "", `TOTAL (${currency})`, roundFinancial(po.grandTotal, 2).toNumber()]);
  rows.push([]);
  rows.push([
    "",
    "Prepared by:",
    po.createdByName || "—",
    "",
    "Authorised by:",
    po.approvedByName || (po.approvalStatus === "APPROVED" ? "Authorised Signatory" : "Pending Approval"),
    "",
    "Approved Date:",
    formatIsoDate(po.approvedAt),
  ]);

  const ws1 = XLSX.utils.aoa_to_sheet(rows);
  ws1["!cols"] = [
    { wch: 3 },  // A spacer
    { wch: 8 },  // B REF
    { wch: 34 }, // C PARTICULAR
    { wch: 16 }, // D BRAND
    { wch: 28 }, // E SPECIFICATIONS
    { wch: 12 }, // F QTY
    { wch: 12 }, // G MEASURE
    { wch: 22 }, // H COST/UNIT / Summary Label
    { wch: 18 }, // I AMOUNT / Summary Value
    { wch: 16 }, // J Status badge
  ];

  // Format currency & numeric cells cleanly
  for (let r = itemHeaderRowIndex + 1; r < rows.length; r++) {
    const qtyCell = ws1[XLSX.utils.encode_cell({ r, c: 5 })];
    const costCell = ws1[XLSX.utils.encode_cell({ r, c: 7 })];
    const amtCell = ws1[XLSX.utils.encode_cell({ r, c: 8 })];
    if (qtyCell && typeof qtyCell.v === "number") qtyCell.z = "#,##0.##";
    if (costCell && typeof costCell.v === "number") costCell.z = "#,##0.00";
    if (amtCell && typeof amtCell.v === "number") amtCell.z = "#,##0.00";
  }

  XLSX.utils.book_append_sheet(wb, ws1, "PURCHASE ORDER");

  // ── SHEET 2: DEPARTMENT ALLOCATION ──────────────────────────────────────────
  const sheet2Rows: (string | number)[][] = [];
  sheet2Rows.push(["", companyName]);
  sheet2Rows.push(["", `DEPARTMENT COST & QUANTITY ALLOCATION — ${po.poNumber}`]);
  sheet2Rows.push(["", `Job: ${po.jobCode || "—"} (${po.jobName || "—"})`, "", `Supplier: ${po.supplierName || "—"}`]);
  sheet2Rows.push([]);

  const allocations = po.departmentAllocations || [];
  if (allocations.length === 0) {
    sheet2Rows.push(["", "No department cost allocation recorded for this Purchase Order."]);
  } else {
    // Collect unique departments preserving order
    const deptMap = new Map<string, { id: string; name: string }>();
    allocations.forEach((a) => {
      if (!deptMap.has(a.departmentId)) {
        deptMap.set(a.departmentId, {
          id: a.departmentId,
          name: a.departmentName || a.departmentCode || a.departmentId,
        });
      }
    });
    const depts = Array.from(deptMap.values());
    const mode = po.departmentAllocationMode === "QUANTITY" ? "QUANTITY" : "AMOUNT";

    sheet2Rows.push([
      "",
      "Ref",
      "Particular",
      mode === "QUANTITY" ? "Item Qty" : `Item Amount (${currency})`,
      ...depts.map((d) => `${d.name} (${mode === "QUANTITY" ? "Qty" : currency})`),
      "Total Allocated",
    ]);

    const deptTotals = new Array(depts.length).fill(0);

    // Check item-level allocations vs order-level allocations
    const hasItemLevel = allocations.some((a) => Boolean(a.purchaseOrderItemId));

    if (hasItemLevel) {
      items.forEach((item, idx) => {
        const itemAllocs = allocations.filter((a) => a.purchaseOrderItemId === item.id);
        let rowTotal = 0;
        const rowValues = depts.map((d, dIdx) => {
          const found = itemAllocs.find((a) => a.departmentId === d.id);
          const val = found
            ? mode === "QUANTITY"
              ? Number(found.allocatedQuantity || 0)
              : Number(found.allocatedAmount || 0)
            : 0;
          deptTotals[dIdx] += val;
          rowTotal += val;
          return roundFinancial(val, mode === "QUANTITY" ? 2 : 2).toNumber();
        });
        sheet2Rows.push([
          "",
          item.rowNumber || idx + 1,
          item.particular,
          mode === "QUANTITY"
            ? roundFinancial(item.quantity, 2).toNumber()
            : roundFinancial(item.totalAmount, 2).toNumber(),
          ...rowValues,
          roundFinancial(rowTotal, 2).toNumber(),
        ]);
      });
    } else {
      let rowTotal = 0;
      const rowValues = depts.map((d, dIdx) => {
        const found = allocations.find((a) => a.departmentId === d.id);
        const val = found
          ? mode === "QUANTITY"
            ? Number(found.allocatedQuantity || 0)
            : Number(found.allocatedAmount || 0)
          : 0;
        deptTotals[dIdx] += val;
        rowTotal += val;
        return roundFinancial(val, 2).toNumber();
      });
      sheet2Rows.push([
        "",
        "ALL",
        `Purchase Order ${po.poNumber} Total`,
        roundFinancial(po.grandTotal, 2).toNumber(),
        ...rowValues,
        roundFinancial(rowTotal, 2).toNumber(),
      ]);
    }

    const grandDeptSum = deptTotals.reduce((a, b) => a + b, 0);
    sheet2Rows.push([
      "",
      "",
      "TOTAL BY DEPARTMENT",
      "",
      ...deptTotals.map((t) => roundFinancial(t, 2).toNumber()),
      roundFinancial(grandDeptSum, 2).toNumber(),
    ]);
  }

  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Rows);
  ws2["!cols"] = [
    { wch: 3 },
    { wch: 8 },
    { wch: 32 },
    { wch: 20 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
  ];

  XLSX.utils.book_append_sheet(wb, ws2, "DEPARTMENT ALLOCATION");

  return wb;
}

export function generatePurchaseOrderExcelBuffer(
  po: PurchaseOrder,
  settings?: Partial<PurchaseOrderSettings> | null
): Buffer {
  const wb = generatePurchaseOrderWorkbook(po, settings);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function generatePoReportCsv(orders: PurchaseOrder[], includeFinancials: boolean): string {
  const headers = includeFinancials
    ? [
        "PO Number",
        "PO Date",
        "Job No",
        "Job Name",
        "Supplier",
        "Status",
        "Approval Status",
        "Expected Delivery",
        "Sub-Total",
        "Discount",
        "SSCL",
        "VAT",
        "Grand Total",
        "Invoiced Total",
        "Created By",
      ]
    : [
        "PO Number",
        "PO Date",
        "Job No",
        "Job Name",
        "Supplier",
        "Status",
        "Approval Status",
        "Expected Delivery",
        "Created By",
      ];

  const escapeCsv = (val: unknown) => {
    const str = val === null || val === undefined ? "" : String(val);
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [headers.map(escapeCsv).join(",")];
  for (const po of orders) {
    const baseRow = [
      po.poNumber,
      formatIsoDate(po.poDate),
      po.jobCode || "",
      po.jobName || "",
      po.supplierName || "",
      po.status,
      po.approvalStatus,
      formatIsoDate(po.expectedDeliveryDate),
    ];
    if (includeFinancials) {
      lines.push(
        [
          ...baseRow,
          roundFinancial(po.subTotal, 2).toFixed(2),
          roundFinancial(po.discountAmount, 2).toFixed(2),
          roundFinancial(po.ssclAmount, 2).toFixed(2),
          roundFinancial(po.vatAmount, 2).toFixed(2),
          roundFinancial(po.grandTotal, 2).toFixed(2),
          roundFinancial(po.invoicedTotal || 0, 2).toFixed(2),
          po.createdByName || "",
        ]
          .map(escapeCsv)
          .join(",")
      );
    } else {
      lines.push([...baseRow, po.createdByName || ""].map(escapeCsv).join(","));
    }
  }
  return lines.join("\n");
}
