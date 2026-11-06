import * as XLSX from "xlsx";
import crypto from "crypto";
import {
  Decimal,
  roundFinancial,
  toDecimal,
  multiplyFinancial,
  sumFinancial,
  calculateTaxFinancial,
  extractExcelFinancialValue,
  formatCurrency,
} from "./financial";

export interface ParsedCostItem {
  itemNumber?: number;
  description: string;
  rcNrc: "RC" | "NRC" | null;
  quantity: number;
  rate: number;
  totalCost: number;
  sortOrder: number;
}

export interface ParsedCostCategory {
  name: string;
  sortOrder: number;
  subtotal: number;
  items: ParsedCostItem[];
}

export interface ParsedCostSummary {
  productionCost: number;
  runningCost: number;
  agencyOperationFee: number;
  agencyProductionFee: number;
  adminCharges: number;
  monitoringCost: number;
  artworkCharges: number;
  contingencies: number;
  subTotal: number;
  totalBeforeTax: number;
  taxType: string;
  taxRate: number;
  taxAmount: number;
  grandTotal: number;
  rawSummaryData: Record<string, any>;
}

export interface ParsedJobData {
  fileHash: string;
  fileName: string;
  fileSize: string;
  jobCode: string;
  hasExplicitJobCode?: boolean;
  name: string;
  date: string;
  commencingDate: string;
  handledBy: string;
  clientName: string;
  description: string;
  remarks: string;
  costCategories: ParsedCostCategory[];
  allCostItems: (ParsedCostItem & { categoryName: string })[];
  costSummary: ParsedCostSummary;
  validation: {
    isValid: boolean;
    warnings: string[];
    errors: string[];
    calculatedTotal: number;
    excelGrandTotal: number;
    totalMatches: boolean;
    difference: number;
  };
}

/**
 * Normalizes Excel dates (serial numbers, Date objects, or date strings) to YYYY-MM-DD
 */
export function normalizeExcelDate(val: any, fallbackDate?: string): string {
  if (!val) return fallbackDate || new Date().toISOString().split("T")[0];

  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString().split("T")[0];
  }

  // Handle Excel numeric serial dates (e.g. 45566)
  if (typeof val === "number" && val > 20000 && val < 70000) {
    try {
      const parsed = XLSX.SSF.parse_date_code(val);
      if (parsed) {
        const y = String(parsed.y).padStart(4, "0");
        const m = String(parsed.m).padStart(2, "0");
        const d = String(parsed.d).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
    } catch {
      // Fallback
    }
  }

  const str = String(val).trim();
  // Check if string matches YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  // Try parsing common date formats: DD/MM/YYYY, MM/DD/YYYY, DD-MMM-YYYY
  const parsedDate = new Date(str);
  if (!isNaN(parsedDate.getTime()) && parsedDate.getFullYear() > 1990) {
    return parsedDate.toISOString().split("T")[0];
  }

  return fallbackDate || new Date().toISOString().split("T")[0];
}

/**
 * Parses numeric currency / quantity strings into clean Decimal-rounded numbers
 */
export function parseNumericValue(val: any, decimals = 2): number {
  return roundFinancial(val, decimals).toNumber();
}

/**
 * Computes SHA-256 hash of a file buffer
 */
export function calculateFileHash(buffer: Buffer | Uint8Array | ArrayBuffer): string {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as any);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/**
 * Determines whether a string is a Summary or Total row
 */
function isSummaryRowLabel(text: string): boolean {
  const t = text.toLowerCase().trim();
  return (
    t.includes("total production") ||
    t.includes("total running") ||
    t.includes("agency fee") ||
    t.includes("administration charge") ||
    t.includes("admin charge") ||
    t.includes("monitoring cost") ||
    t.includes("artwork") ||
    t.includes("aw charge") ||
    t.includes("contingenc") ||
    t.includes("grand total before tax") ||
    t.includes("total before tax") ||
    t.includes("sub total") ||
    t.includes("subtotal") ||
    t.includes("sscl") ||
    t.includes("vat") ||
    t.includes("final grand total") ||
    t === "grand total" ||
    t === "total"
  );
}

/**
 * Flexibly parses an Excel quotation workbook (.xlsx or .xls)
 */
export function parseExcelQuotation(
  buffer: Buffer | Uint8Array | ArrayBuffer,
  fileName: string,
  existingJobCount: number = 0
): ParsedJobData {
  const fileHash = calculateFileHash(buffer);
  const sizeBytes = buffer.byteLength || (buffer as any).length || 0;
  const fileSize =
    sizeBytes > 1024 * 1024
      ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.round(sizeBytes / 1024) || 1} KB`;

  const warnings: string[] = [];
  const errors: string[] = [];

  const rawBuf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as any);
  let workbook: XLSX.WorkBook;

  try {
    workbook = XLSX.read(rawBuf, {
      type: "buffer",
      cellDates: true,
      cellNF: true,
      cellFormula: true,
    });
  } catch (err: any) {
    throw new Error(`Failed to parse Excel workbook "${fileName}": ${err?.message || "Invalid file format"}`);
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error(`Excel file "${fileName}" contains no readable worksheets.`);
  }

  // Choose the best worksheet: Look for "Quotation", "Costing", "Estimate", "Job", or default to first
  let selectedSheetName = workbook.SheetNames[0];
  const targetKeywords = ["quotation", "costing", "estimate", "job", "proposal", "budget"];
  for (const name of workbook.SheetNames) {
    const lower = name.toLowerCase();
    if (targetKeywords.some((kw) => lower.includes(kw))) {
      selectedSheetName = name;
      break;
    }
  }

  const ws = workbook.Sheets[selectedSheetName];
  if (!ws) {
    throw new Error(`Could not access worksheet "${selectedSheetName}" in "${fileName}".`);
  }

  // Convert worksheet to 2D array of formatted text and raw values
  const textRows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
  const rawRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });

  const totalRowCount = Math.max(textRows.length, rawRows.length);

  // Metadata storage
  let clientName = "";
  let jobTitle = "";
  let jobNumber = "";
  let jobDate = "";
  let commencingDate = "";
  let handledBy = "";
  let description = "";
  let remarks = "";

  // ── Step 1: Scan top 35 rows for Metadata ────────────────────────────────────
  const metaScanLimit = Math.min(35, totalRowCount);
  for (let r = 0; r < metaScanLimit; r++) {
    const row = textRows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const cellText = String(row[c] || "").trim();
      if (!cellText) continue;

      const lower = cellText.toLowerCase();

      const isJobNumberLabel =
        lower.includes("job no") ||
        lower.includes("job number") ||
        lower.includes("job #") ||
        lower.includes("estimate no") ||
        lower.includes("estimate #") ||
        lower.includes("quotation no") ||
        lower.includes("quote no") ||
        lower.includes("quote #") ||
        lower.includes("ref no") ||
        lower.includes("ref #");

      const isJobDateLabel =
        lower.includes("job date") ||
        lower.includes("quotation date") ||
        lower.includes("estimate date") ||
        lower === "date" ||
        lower === "date:";

      // Job Number
      if (!jobNumber && isJobNumberLabel) {
        const extracted = extractMetadataField(cellText, r, c, textRows, rawRows);
        if (extracted.textVal) jobNumber = extracted.textVal;
      }

      // Job Date
      else if (!jobDate && isJobDateLabel) {
        const extracted = extractMetadataField(cellText, r, c, textRows, rawRows);
        if (extracted.rawVal) jobDate = normalizeExcelDate(extracted.rawVal);
        else if (extracted.textVal) jobDate = normalizeExcelDate(extracted.textVal);
      }

      // Client Name / Customer
      else if (!clientName && (/^(client|customer|m\/s)(\s*name)?\s*[:\-]?/i.test(lower) || lower.includes("client name") || lower.includes("customer name"))) {
        const extracted = extractMetadataField(cellText, r, c, textRows, rawRows);
        if (extracted.textVal) clientName = extracted.textVal;
      }

      // Job Title / Event Title / Project Title / Project Name
      else if (!jobTitle && (lower.includes("job title") || lower.includes("project title") || lower.includes("event title") || lower.includes("job name") || lower.includes("project name") || lower.startsWith("project title:") || lower.startsWith("job title:") || lower === "project:" || lower === "event:" || lower === "job:")) {
        const extracted = extractMetadataField(cellText, r, c, textRows, rawRows);
        if (extracted.textVal) jobTitle = extracted.textVal;
      }

      // Commencing Date / Event Date / Start Date / Delivery Date
      if (!commencingDate && (lower.includes("commencing date") || lower.includes("commence date") || lower.includes("event date") || lower.includes("start date") || lower.includes("delivery date"))) {
        const extracted = extractMetadataField(cellText, r, c, textRows, rawRows);
        if (extracted.rawVal) commencingDate = normalizeExcelDate(extracted.rawVal);
        else if (extracted.textVal) commencingDate = normalizeExcelDate(extracted.textVal);
      }

      // Handled By / Prepared By / Account Executive
      if (!handledBy && (lower.includes("handled by") || lower.includes("prepared by") || lower.includes("account exec") || lower.includes("contact person"))) {
        const extracted = extractMetadataField(cellText, r, c, textRows, rawRows);
        if (extracted.textVal) handledBy = extracted.textVal;
      }

      // Description / Scope of Work
      if (!description && (lower.includes("scope of work") || lower.includes("brief") || lower === "description:" || lower.includes("job description"))) {
        const extracted = extractMetadataField(cellText, r, c, textRows, rawRows);
        if (extracted.textVal) description = extracted.textVal;
      }
    }
  }

  // Fallbacks if metadata not found explicitly
  if (!jobTitle) {
    // Check row 0, 1, 2 for top prominent text
    for (let r = 0; r < Math.min(4, totalRowCount); r++) {
      const row = textRows[r] || [];
      for (const cell of row) {
        const t = String(cell).trim();
        if (t.length > 5 && !t.toLowerCase().includes("quotation") && !t.toLowerCase().includes("invoice") && !isLabelOnly(t)) {
          jobTitle = t;
          break;
        }
      }
      if (jobTitle) break;
    }
  }

  if (!jobTitle) {
    // Fallback from filename
    jobTitle = fileName
      .replace(/\.[^/.]+$/, "")
      .replace(/[_-]/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());
  }

  const currentYear = new Date().getFullYear();
  const hasExplicitJobCode = Boolean(jobNumber);
  if (!jobNumber) {
    const nextCodeNum = existingJobCount + 1;
    jobNumber = `JOB-${currentYear}-${String(nextCodeNum).padStart(3, "0")}`;
  }

  if (!jobDate) jobDate = new Date().toISOString().split("T")[0];
  if (!commencingDate) commencingDate = jobDate;

  // ── Step 2: Locate Cost Table Header Row ────────────────────────────────────
  let headerRowIndex = -1;
  let colItemNo = -1;
  let colDescription = -1;
  let colRcNrc = -1;
  let colQty = -1;
  let colRate = -1;
  let colCost = -1;

  for (let r = 0; r < Math.min(30, totalRowCount); r++) {
    const row = (textRows[r] || []).map((c) => String(c).toLowerCase().trim());
    const hasDesc = row.some((c) => c.includes("description") || c.includes("particular") || c.includes("item") || c.includes("scope"));
    const hasNum = row.some((c) => c.includes("qty") || c.includes("quantity") || c.includes("rate") || c.includes("cost") || c.includes("amount") || c.includes("total"));

    if (hasDesc && hasNum) {
      headerRowIndex = r;
      // Map columns
      row.forEach((cell, idx) => {
        if (cell.includes("no") || cell.includes("sr") || cell === "#" || cell === "item") {
          if (colItemNo === -1) colItemNo = idx;
        }
        if (cell.includes("description") || cell.includes("particular") || cell.includes("details")) {
          colDescription = idx;
        }
        if (cell.includes("rc/nrc") || cell.includes("rc / nrc") || cell === "type" || cell.includes("cost type")) {
          colRcNrc = idx;
        }
        if (cell.includes("qty") || cell.includes("quantity") || cell.includes("units")) {
          colQty = idx;
        }
        if (cell.includes("rate") || cell.includes("unit rate") || cell.includes("unit price") || cell === "price") {
          colRate = idx;
        }
        if (cell.includes("cost") || cell.includes("amount") || cell.includes("total") || cell.includes("sub total")) {
          colCost = idx;
        }
      });
      break;
    }
  }

  // If header wasn't found through exact keywords, search for any row with Description + Amount columns
  if (headerRowIndex === -1 || colDescription === -1) {
    for (let r = 0; r < Math.min(30, totalRowCount); r++) {
      const row = (textRows[r] || []).map((c) => String(c).toLowerCase().trim());
      const descIdx = row.findIndex((c) => c.includes("description") || c.includes("particular"));
      if (descIdx !== -1) {
        headerRowIndex = r;
        colDescription = descIdx;
        colQty = row.findIndex((c) => c.includes("qty"));
        colRate = row.findIndex((c) => c.includes("rate"));
        colCost = row.findIndex((c) => c.includes("cost") || c.includes("amount") || c.includes("total"));
        break;
      }
    }
  }

  // Fallbacks for standard column arrangements if some columns weren't labeled
  if (colDescription === -1) colDescription = 1; // Col B is very common
  if (colRcNrc === -1 && colDescription !== 2) colRcNrc = 2; // Col C
  if (colQty === -1) colQty = 3; // Col D
  if (colRate === -1) colRate = 4; // Col E
  if (colCost === -1) colCost = 5; // Col F

  if (headerRowIndex === -1) headerRowIndex = 8; // Default search start

  // ── Step 3: Extract Categories, Items, and Summary Totals ───────────────────
  const categoriesMap: Map<string, ParsedCostItem[]> = new Map();
  const allCostItems: (ParsedCostItem & { categoryName: string })[] = [];
  let currentCategory = "Production Cost"; // Standard event/production default category
  let currentItemIndex = 1;

  // Financial summary accumulator
  const rawSummaryMap: Record<string, number> = {};
  let extractedProductionCost = 0;
  let extractedRunningCost = 0;
  let extractedAgencyOperationFee = 0;
  let extractedAgencyProductionFee = 0;
  let extractedAdminCharges = 0;
  let extractedMonitoringCost = 0;
  let extractedArtworkCharges = 0;
  let extractedContingencies = 0;
  let extractedSubTotal = 0;
  let extractedTotalBeforeTax = 0;
  let extractedTaxType = "SSCL";
  let extractedTaxRate = 2.5;
  let extractedTaxAmount = 0;
  let extractedGrandTotal = 0;

  for (let r = headerRowIndex + 1; r < totalRowCount; r++) {
    const textRow = textRows[r] || [];
    const rawRow = rawRows[r] || [];

    // Get primary text from description column or first non-empty text column
    const descText = String(textRow[colDescription] || textRow[1] || textRow[0] || "").trim();
    if (!descText) {
      // Row is blank or empty
      continue;
    }

    const lowerDesc = descText.toLowerCase();

    // Check if this row is a Financial Summary row
    if (isSummaryRowLabel(descText)) {
      // Find the numeric value in this row (prefer formatted cell text if valid currency)
      let summaryVal = extractExcelFinancialValue(rawRow[colCost], textRow[colCost]).toNumber();
      if (summaryVal === 0) {
        // Search across row from right to left
        for (let c = rawRow.length - 1; c >= 0; c--) {
          const val = extractExcelFinancialValue(rawRow[c], textRow[c]).toNumber();
          if (val > 0) {
            summaryVal = val;
            break;
          }
        }
      }

      rawSummaryMap[descText] = summaryVal;

      if (lowerDesc.includes("total production") || lowerDesc === "production cost") {
        extractedProductionCost = summaryVal;
      } else if (lowerDesc.includes("total running") || lowerDesc === "running cost") {
        extractedRunningCost = summaryVal;
      } else if (lowerDesc.includes("operation") && lowerDesc.includes("agency")) {
        extractedAgencyOperationFee = summaryVal;
      } else if (lowerDesc.includes("production") && lowerDesc.includes("agency")) {
        extractedAgencyProductionFee = summaryVal;
      } else if (lowerDesc.includes("admin") || lowerDesc.includes("administration")) {
        extractedAdminCharges = summaryVal;
      } else if (lowerDesc.includes("monitoring")) {
        extractedMonitoringCost = summaryVal;
      } else if (lowerDesc.includes("artwork") || lowerDesc.includes("aw charge")) {
        extractedArtworkCharges = summaryVal;
      } else if (lowerDesc.includes("contingenc")) {
        extractedContingencies = summaryVal;
      } else if (lowerDesc.includes("before tax") || lowerDesc === "sub total" || lowerDesc === "subtotal") {
        extractedTotalBeforeTax = summaryVal;
      } else if (lowerDesc.includes("sscl") || lowerDesc.includes("vat") || lowerDesc.includes("tax")) {
        extractedTaxAmount = summaryVal;
        if (lowerDesc.includes("vat")) extractedTaxType = "VAT";
        else if (lowerDesc.includes("sscl")) extractedTaxType = "SSCL";
        // Extract rate if present in text, e.g. "SSCL (2.5%)"
        const rateMatch = descText.match(/(\d+(\.\d+)?)%/);
        if (rateMatch) extractedTaxRate = roundFinancial(rateMatch[1], 3).toNumber();
      } else if (lowerDesc.includes("grand total") || lowerDesc.includes("net payable")) {
        extractedGrandTotal = summaryVal;
      }

      continue;
    }

    // Check if this row is a Category Header
    // Characteristics: Text in description, but Qty and Rate and Cost are 0 or empty
    const rawQty = parseNumericValue(rawRow[colQty], 4);
    const rawRate = extractExcelFinancialValue(rawRow[colRate], textRow[colRate]).toNumber();
    const rawCost = extractExcelFinancialValue(rawRow[colCost], textRow[colCost]).toNumber();

    const isCategoryHeader =
      (rawQty === 0 && rawRate === 0 && rawCost === 0) ||
      (descText.length > 0 && rawCost === 0 && !descText.match(/\d/));

    if (isCategoryHeader && !isCommonInstructionText(descText)) {
      currentCategory = descText;
      if (!categoriesMap.has(currentCategory)) {
        categoriesMap.set(currentCategory, []);
      }
      continue;
    }

    // Normal Cost Item Row
    // Determine RC/NRC
    let rcNrc: "RC" | "NRC" | null = null;
    const rcColVal = colRcNrc !== -1 ? String(textRow[colRcNrc] || "").toUpperCase().trim() : "";
    if (rcColVal === "RC" || rcColVal.includes("RUNNING")) rcNrc = "RC";
    else if (rcColVal === "NRC" || rcColVal.includes("NON")) rcNrc = "NRC";
    else {
      // Check if text in description indicates RC or NRC
      if (descText.toUpperCase().includes("(RC)") || descText.toUpperCase().includes("- RC")) rcNrc = "RC";
      else if (descText.toUpperCase().includes("(NRC)") || descText.toUpperCase().includes("- NRC")) rcNrc = "NRC";
      else rcNrc = "NRC"; // Default to Non-Running Cost
    }

    // Determine Qty, Rate, Cost
    let qty = rawQty > 0 ? rawQty : 1;
    let rate = rawRate > 0 ? rawRate : 0;
    let cost = rawCost > 0 ? rawCost : 0;

    if (cost === 0 && rate > 0) {
      cost = multiplyFinancial(qty, rate).toNumber();
    }
    if (rate === 0 && cost > 0 && qty > 0) {
      rate = roundFinancial(toDecimal(cost).div(qty), 2).toNumber();
    }

    // Only add if there is a valid cost or rate or description
    if (descText && (cost > 0 || rate > 0 || qty > 0)) {
      const item: ParsedCostItem = {
        itemNumber: currentItemIndex++,
        description: descText,
        rcNrc,
        quantity: qty,
        rate,
        totalCost: cost,
        sortOrder: currentItemIndex,
      };

      if (!categoriesMap.has(currentCategory)) {
        categoriesMap.set(currentCategory, []);
      }
      categoriesMap.get(currentCategory)!.push(item);

      allCostItems.push({
        ...item,
        categoryName: currentCategory,
      });
    }
  }

  // ── Step 4: Assemble Formatted Categories & Subtotals ───────────────────────
  const costCategories: ParsedCostCategory[] = [];
  let sortOrder = 1;

  for (const [catName, items] of categoriesMap.entries()) {
    if (items.length === 0) continue;
    const subtotal = sumFinancial(items.map((item) => item.totalCost)).toNumber();
    costCategories.push({
      name: catName,
      sortOrder: sortOrder++,
      subtotal,
      items,
    });
  }

  // If no categories were formed (e.g. flat list without headers), group all items under "General Production"
  if (costCategories.length === 0 && allCostItems.length > 0) {
    const subtotal = sumFinancial(allCostItems.map((item) => item.totalCost)).toNumber();
    costCategories.push({
      name: "Production Cost",
      sortOrder: 1,
      subtotal,
      items: allCostItems.map((i) => ({
        itemNumber: i.itemNumber,
        description: i.description,
        rcNrc: i.rcNrc,
        quantity: i.quantity,
        rate: i.rate,
        totalCost: i.totalCost,
        sortOrder: i.sortOrder,
      })),
    });
  }

  // ── Step 5: Derive & Validate Financial Summary Values ──────────────────────
  const sumOfAllItems = sumFinancial(allCostItems.map((i) => i.totalCost)).toNumber();
  const nrcItemsTotal = sumFinancial(
    allCostItems.filter((i) => i.rcNrc === "NRC" || !i.rcNrc).map((i) => i.totalCost)
  ).toNumber();
  const rcItemsTotal = sumFinancial(
    allCostItems.filter((i) => i.rcNrc === "RC").map((i) => i.totalCost)
  ).toNumber();

  // If summary totals were not found in summary rows, infer from items
  if (extractedProductionCost === 0) {
    extractedProductionCost = nrcItemsTotal || sumOfAllItems;
  }
  if (extractedRunningCost === 0) {
    extractedRunningCost = rcItemsTotal;
  }
  if (extractedSubTotal === 0) {
    extractedSubTotal = sumOfAllItems;
  }

  // Calculate total before tax using Decimal addition
  const calculatedTotalBeforeTax = sumFinancial([
    extractedProductionCost || sumOfAllItems,
    extractedRunningCost,
    extractedAgencyOperationFee,
    extractedAgencyProductionFee,
    extractedAdminCharges,
    extractedMonitoringCost,
    extractedArtworkCharges,
    extractedContingencies,
  ]).toNumber();

  if (extractedTotalBeforeTax === 0) {
    extractedTotalBeforeTax = calculatedTotalBeforeTax;
  }

  // Tax calculation with exact Decimal rounding
  if (extractedTaxAmount === 0 && extractedTaxRate > 0) {
    extractedTaxAmount = calculateTaxFinancial(extractedTotalBeforeTax, extractedTaxRate).toNumber();
  } else {
    extractedTaxAmount = roundFinancial(extractedTaxAmount, 2).toNumber();
  }

  const calculatedGrandTotal = roundFinancial(
    toDecimal(extractedTotalBeforeTax).plus(extractedTaxAmount)
  ).toNumber();

  // IMPORTANT: Preserve the authoritative original Excel Grand Total
  if (extractedGrandTotal === 0) {
    extractedGrandTotal = calculatedGrandTotal;
  } else {
    extractedGrandTotal = roundFinancial(extractedGrandTotal, 2).toNumber();
  }

  // Validate Totals & Mismatches
  const difference = roundFinancial(toDecimal(calculatedGrandTotal).minus(extractedGrandTotal).abs()).toNumber();
  const totalMatches = difference <= 0.05; // Tolerance for small rounding pennies

  if (!totalMatches) {
    warnings.push(
      `Calculated Grand Total (${formatCurrency(calculatedGrandTotal, { showCurrencyPrefix: true })}) differs from Excel Grand Total (${formatCurrency(extractedGrandTotal, { showCurrencyPrefix: true })}) by ${formatCurrency(difference, { showCurrencyPrefix: true })}.`
    );
  }

  if (costCategories.length === 0 || allCostItems.length === 0) {
    warnings.push("No cost breakdown items were detected in the spreadsheet. Please verify file content.");
  }

  return {
    fileHash,
    fileName,
    fileSize,
    jobCode: jobNumber,
    hasExplicitJobCode,
    name: jobTitle,
    date: jobDate,
    commencingDate,
    handledBy,
    clientName,
    description,
    remarks,
    costCategories,
    allCostItems,
    costSummary: {
      productionCost: extractedProductionCost,
      runningCost: extractedRunningCost,
      agencyOperationFee: extractedAgencyOperationFee,
      agencyProductionFee: extractedAgencyProductionFee,
      adminCharges: extractedAdminCharges,
      monitoringCost: extractedMonitoringCost,
      artworkCharges: extractedArtworkCharges,
      contingencies: extractedContingencies,
      subTotal: extractedSubTotal,
      totalBeforeTax: extractedTotalBeforeTax,
      taxType: extractedTaxType,
      taxRate: extractedTaxRate,
      taxAmount: extractedTaxAmount,
      grandTotal: extractedGrandTotal,
      rawSummaryData: rawSummaryMap,
    },
    validation: {
      isValid: errors.length === 0,
      warnings,
      errors,
      calculatedTotal: calculatedGrandTotal,
      excelGrandTotal: extractedGrandTotal,
      totalMatches,
      difference,
    },
  };
}

/**
 * Extracts metadata value from inline "Label: Value" or from adjacent/below cells
 */
function extractMetadataField(
  cellText: string,
  r: number,
  c: number,
  textRows: string[][],
  rawRows: any[][]
): { textVal: string; rawVal?: any } {
  // 1. Check if the cell itself contains "Label: Value" (e.g. "Customer: Unilever", "Job No: 101")
  const colonIdx = cellText.indexOf(":");
  if (colonIdx !== -1) {
    const afterColon = cellText.substring(colonIdx + 1).trim();
    if (afterColon.length > 0 && !isLabelOnly(afterColon)) {
      return { textVal: afterColon, rawVal: afterColon };
    }
  }

  // 2. Check adjacent cells to the right
  const row = textRows[r] || [];
  const rawRow = rawRows[r] || [];
  for (let offset = 1; offset <= 3; offset++) {
    const textVal = String(row[c + offset] || "").trim();
    if (textVal && !isLabelOnly(textVal)) {
      return { textVal, rawVal: rawRow[c + offset] };
    }
  }

  // 3. Check cell directly below
  const nextRow = textRows[r + 1] || [];
  const nextRawRow = rawRows[r + 1] || [];
  const belowText = String(nextRow[c] || "").trim();
  if (belowText && !isLabelOnly(belowText)) {
    return { textVal: belowText, rawVal: nextRawRow[c] };
  }

  return { textVal: "" };
}

function isLabelOnly(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (t.endsWith(":")) return true;
  // If the string starts with a common label like "Date:", "Quotation Date:", "Customer:", etc.
  if (/^(client|customer|m\/s|job\s*(no|number|#|title)|project|event|date|start\s*date|commenc|handled\s*by|estimate\s*(no|#)|account\s*exec|quote\s*no)\s*:/i.test(t)) {
    return true;
  }
  return (
    t === "client" ||
    t === "customer" ||
    t === "date" ||
    t === "job no" ||
    t === "job #" ||
    t === "description" ||
    t === "handled by" ||
    t === "project" ||
    t === "event"
  );
}

function isCommonInstructionText(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("note:") ||
    t.includes("terms & conditions") ||
    t.includes("terms and conditions") ||
    t.includes("bank details") ||
    t.includes("payment terms")
  );
}
