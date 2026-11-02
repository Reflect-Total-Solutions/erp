import * as XLSX from "xlsx";
import { Job, JobCostCategory, JobCostItem, JobCostSummary } from "@/types/admin";
import { roundFinancial } from "@/lib/financial";

/**
 * Builds a formatted Processed Quotation Excel workbook (.xlsx) from a Job object
 */
export function generateProcessedQuotationWorkbook(
  job: Job,
  costCategories: JobCostCategory[] = [],
  costItems: JobCostItem[] = [],
  costSummary?: JobCostSummary | null
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const rows: (string | number)[][] = [];

  // Header banner
  rows.push(["REFLECT TOTAL SOLUTIONS (PVT) LTD"]);
  rows.push(["COMMERCIAL PROJECT COSTING & QUOTATION"]);
  rows.push([]); // blank row

  // Metadata block
  rows.push(["Job Title:", job.name || "N/A", "", "Job Code / No:", job.jobCode || "N/A"]);
  rows.push(["Client Name:", job.clientName || "N/A", "", "Job Date:", job.date || "N/A"]);
  rows.push(["Commencing Date:", job.commencingDate || job.date || "N/A", "", "Handled By:", job.handledBy || "Admin"]);
  if (job.description) {
    rows.push(["Description:", job.description, "", "Status:", job.status || "Active"]);
  }
  rows.push([]); // blank row

  // Table header
  rows.push(["Item #", "Category", "Item Description", "RC / NRC", "Qty", "Rate (LKR)", "Total Cost (LKR)"]);

  // Group items by category if available, otherwise use allCostItems
  const categoriesToRender =
    costCategories.length > 0
      ? costCategories
      : [
          {
            id: "cat-default",
            jobId: job.id,
            name: "Production Cost",
            sortOrder: 1,
            subtotal: costItems.reduce((s, i) => s + (Number(i.totalCost) || 0), 0),
            items: costItems,
          },
        ];

  let itemCounter = 1;

  categoriesToRender.forEach((category) => {
    // Category header row
    rows.push(["", `[ ${category.name.toUpperCase()} ]`, "", "", "", "", ""]);

    const items = category.items && category.items.length > 0
      ? category.items
      : costItems.filter((i) => i.categoryId === category.id);

    items.forEach((item) => {
      rows.push([
        itemCounter++,
        category.name,
        item.description,
        item.rcNrc || "NRC",
        roundFinancial(item.quantity || 1, 4).toNumber(),
        roundFinancial(item.rate || 0, 2).toNumber(),
        roundFinancial(item.totalCost || 0, 2).toNumber(),
      ]);
    });

    // Category Subtotal row
    const catSubtotal =
      category.subtotal || items.reduce((s, i) => s + (Number(i.totalCost) || 0), 0);
    rows.push(["", "", `Subtotal: ${category.name}`, "", "", "", roundFinancial(catSubtotal, 2).toNumber()]);
    rows.push([]); // spacing row
  });

  // Summary / Financial Totals Section
  const summary = costSummary || {
    productionCost: job.totalCost || 0,
    runningCost: 0,
    agencyOperationFee: 0,
    agencyProductionFee: 0,
    adminCharges: 0,
    monitoringCost: 0,
    artworkCharges: 0,
    contingencies: 0,
    subTotal: job.totalCost || 0,
    totalBeforeTax: job.totalCost || 0,
    taxType: "SSCL",
    taxRate: 2.5,
    taxAmount: (Number(job.totalCost) || 0) * 0.025,
    grandTotal: job.grandTotal || (Number(job.totalCost) || 0) * 1.025,
  };

  rows.push([]);
  rows.push(["SUMMARY FINANCIAL RECAPITULATION", "", "", "", "", "", ""]);
  rows.push(["Total Production Cost", "", "", "", "", "", roundFinancial(summary.productionCost || 0, 2).toNumber()]);
  if (summary.runningCost) {
    rows.push(["Total Running Cost", "", "", "", "", "", roundFinancial(summary.runningCost, 2).toNumber()]);
  }
  if (summary.agencyOperationFee) {
    rows.push(["Agency Fee for Operation Cost", "", "", "", "", "", roundFinancial(summary.agencyOperationFee, 2).toNumber()]);
  }
  if (summary.agencyProductionFee) {
    rows.push(["Agency Fee for Production Cost", "", "", "", "", "", roundFinancial(summary.agencyProductionFee, 2).toNumber()]);
  }
  if (summary.adminCharges) {
    rows.push(["Agency Administration Charges", "", "", "", "", "", roundFinancial(summary.adminCharges, 2).toNumber()]);
  }
  if (summary.monitoringCost) {
    rows.push(["Agency Monitoring Cost", "", "", "", "", "", roundFinancial(summary.monitoringCost, 2).toNumber()]);
  }
  if (summary.artworkCharges) {
    rows.push(["Artwork & AW Charges", "", "", "", "", "", roundFinancial(summary.artworkCharges, 2).toNumber()]);
  }
  if (summary.contingencies) {
    rows.push(["Contingencies", "", "", "", "", "", roundFinancial(summary.contingencies, 2).toNumber()]);
  }

  rows.push(["Grand Total Before Tax", "", "", "", "", "", roundFinancial(summary.totalBeforeTax || summary.subTotal || 0, 2).toNumber()]);

  const taxLabel = summary.taxType ? `${summary.taxType} (${summary.taxRate || 2.5}%)` : "SSCL (2.5%)";
  rows.push([taxLabel, "", "", "", "", "", roundFinancial(summary.taxAmount || 0, 2).toNumber()]);
  rows.push(["FINAL GRAND TOTAL (LKR)", "", "", "", "", "", roundFinancial(summary.grandTotal || 0, 2).toNumber()]);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Set column widths
  ws["!cols"] = [
    { wch: 8 },  // Item #
    { wch: 22 }, // Category
    { wch: 45 }, // Description
    { wch: 10 }, // RC/NRC
    { wch: 8 },  // Qty
    { wch: 16 }, // Rate
    { wch: 18 }, // Total Cost
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Quotation Costing");

  return wb;
}

/**
 * Downloads a generated Processed Quotation Excel file in browser
 */
export function downloadProcessedQuotationExcel(
  job: Job,
  costCategories: JobCostCategory[] = [],
  costItems: JobCostItem[] = [],
  costSummary?: JobCostSummary | null
) {
  const wb = generateProcessedQuotationWorkbook(job, costCategories, costItems, costSummary);
  const cleanCode = (job.jobCode || "JOB").replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `${cleanCode}_Processed_Cost_Breakdown.xlsx`;
  XLSX.writeFile(wb, fileName);
}
