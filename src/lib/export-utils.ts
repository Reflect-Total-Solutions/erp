import { Job, Invoice, Supplier, ExcelFile } from "@/types/admin";

/**
 * Escapes CSV special characters and quotes fields
 */
function escapeCsv(value: string | number | undefined | null): string {
  if (value === null || value === undefined) return '""';
  const stringValue = String(value);
  if (stringValue.includes('"') || stringValue.includes(",") || stringValue.includes("\n") || stringValue.includes("\r")) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return `"${stringValue}"`;
}

/**
 * Initiates browser download of a generated CSV file
 */
export function downloadCsvFile(filename: string, content: string) {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename.endsWith(".csv") ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generates and downloads a single mock attachment file (PDF or image)
 */
export function downloadSingleAttachment(fileName: string, title?: string) {
  const isPdf = fileName.toLowerCase().endsWith(".pdf");
  const mimeType = isPdf ? "application/pdf" : "image/jpeg";

  const content = `%PDF-1.4 Mock Attachment File
Reflect Total Solutions ERP
----------------------------------------
Document     : ${title || fileName}
Filename     : ${fileName}
Generated    : Internal ERP Export
----------------------------------------
`;

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Triggers download from a remote URL (such as Supabase Storage)
 */
export function downloadFileFromUrl(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Downloads a specific invoice file or triggers individual downloads for all its attachments
 */
export function downloadMockInvoiceFile(invoice: Invoice) {
  if (invoice.fileUrl) {
    downloadFileFromUrl(invoice.fileUrl, invoice.fileName);
    return;
  }

  const attachments = invoice.attachments && invoice.attachments.length > 0
    ? invoice.attachments
    : [{ id: "def", fileName: invoice.fileName, fileSize: invoice.fileSize, fileType: invoice.fileName.toLowerCase().endsWith(".pdf") ? "pdf" as const : "image" as const }];

  // Download all attached files individually with a slight stagger so browser doesn't block
  attachments.forEach((att, idx) => {
    setTimeout(() => {
      if (att.fileUrl) {
        downloadFileFromUrl(att.fileUrl, att.fileName);
      } else {
        downloadSingleAttachment(att.fileName, `${invoice.invoiceName} - Attachment ${idx + 1}`);
      }
    }, idx * 250);
  });
}

/**
 * Downloads all Excel files for a job individually
 */
export function downloadAllJobExcelFiles(excelFiles: ExcelFile[]) {
  excelFiles.forEach((xf, idx) => {
    setTimeout(() => {
      downloadMockExcelFile(xf);
    }, idx * 250);
  });
}

/**
 * Generates and downloads an Excel file (.csv spreadsheet format or Supabase direct download)
 */
export function downloadMockExcelFile(excelFile: ExcelFile) {
  if (excelFile.fileUrl) {
    downloadFileFromUrl(excelFile.fileUrl, excelFile.fileName);
    return;
  }

  const content = [
    ["Document Name", "Original File", "File Date", "File Size", "Upload Timestamp", "Status"].join(","),
    [
      escapeCsv(excelFile.customName || excelFile.fileName),
      escapeCsv(excelFile.fileName),
      escapeCsv(excelFile.fileDate || "—"),
      escapeCsv(excelFile.fileSize),
      escapeCsv(excelFile.uploadDateTime),
      escapeCsv(excelFile.status),
    ].join(","),
    "",
    "--- Reflect ERP Spreadsheet Export ---",
  ].join("\n");

  downloadCsvFile(excelFile.fileName || `${excelFile.customName || "document"}.csv`, content);
}

/**
 * Export a list of Invoices to a detailed CSV spreadsheet
 */
export function exportInvoicesToCsv(
  invoices: Invoice[],
  jobs: Job[],
  suppliers: Supplier[],
  filename: string = "invoices_report"
) {
  const headers = [
    "Invoice Name",
    "File Name",
    "File Type",
    "Job Code",
    "Job Name",
    "Job Date",
    "Supplier Name",
    "Supplier Code",
    "Invoice Date",
    "Amount (Rs.)",
    "Status",
    "Upload Date",
    "File Size",
  ];

  const rows = invoices.map((inv) => {
    const job = jobs.find((j) => j.id === inv.jobId);
    const sup = suppliers.find((s) => s.id === inv.supplierId);
    const isPdf = inv.fileName?.toLowerCase().endsWith(".pdf");

    return [
      escapeCsv(inv.invoiceName),
      escapeCsv(inv.fileName),
      escapeCsv(isPdf ? "PDF" : "PHOTO"),
      escapeCsv(job?.jobCode || "—"),
      escapeCsv(job?.name || "Unassigned"),
      escapeCsv(job?.date || "—"),
      escapeCsv(sup?.name || "—"),
      escapeCsv(sup?.code || "—"),
      escapeCsv(inv.invoiceDate),
      inv.totalValue.toFixed(2),
      escapeCsv(inv.status),
      escapeCsv(inv.uploadDate),
      escapeCsv(inv.fileSize),
    ].join(",");
  });

  const totalAmount = invoices.reduce((sum, inv) => sum + inv.totalValue, 0);

  // Summary row at the bottom
  const summaryRow = [
    escapeCsv("TOTAL SUMMARY"),
    escapeCsv(`${invoices.length} Invoices`),
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    totalAmount.toFixed(2),
    '""',
    '""',
    '""',
  ].join(",");

  const csvContent = [headers.join(","), ...rows, summaryRow].join("\n");
  downloadCsvFile(filename, csvContent);
}

/**
 * Export Jobs with their costs and totals to CSV spreadsheet
 */
export function exportJobsToCsv(
  jobs: Job[],
  invoices: Invoice[],
  excelFiles: ExcelFile[],
  filename: string = "jobs_cost_report"
) {
  const headers = [
    "Job Code",
    "Job Name",
    "Job Date",
    "Status",
    "Suppliers Count",
    "Invoices Count",
    "Excel Attachments",
    "Total Cost / Invoice Value (Rs.)",
    "Remarks",
    "Description",
  ];

  let grandTotalCost = 0;
  let totalInvoices = 0;

  const rows = jobs.map((job) => {
    const jobInvs = invoices.filter((inv) => inv.jobId === job.id);
    const jobExcels = excelFiles.filter((xf) => xf.jobId === job.id);
    const jobCost = jobInvs.reduce((sum, inv) => sum + inv.totalValue, 0);

    grandTotalCost += jobCost;
    totalInvoices += jobInvs.length;

    return [
      escapeCsv(job.jobCode || "—"),
      escapeCsv(job.name),
      escapeCsv(job.date),
      escapeCsv(job.status),
      job.supplierIds.length,
      jobInvs.length,
      jobExcels.length,
      jobCost.toFixed(2),
      escapeCsv(job.remarks || "—"),
      escapeCsv(job.description || "—"),
    ].join(",");
  });

  const summaryRow = [
    escapeCsv("GRAND TOTAL"),
    escapeCsv(`${jobs.length} Jobs`),
    '""',
    '""',
    '""',
    totalInvoices,
    '""',
    grandTotalCost.toFixed(2),
    '""',
    '""',
  ].join(",");

  const csvContent = [headers.join(","), ...rows, summaryRow].join("\n");
  downloadCsvFile(filename, csvContent);
}

/**
 * Export Single Job Comprehensive Audit Dossier (Job info + All Invoices + Costs + Suppliers)
 */
export function exportJobDetailedReportToCsv(
  job: Job,
  jobInvoices: Invoice[],
  jobSuppliers: Supplier[],
  jobExcelFiles: ExcelFile[]
) {
  const totalCost = jobInvoices.reduce((sum, inv) => sum + inv.totalValue, 0);

  const lines = [
    `"=== JOB MASTER DETAILS ==="`,
    `"Job Code",${escapeCsv(job.jobCode || "—")}`,
    `"Job Name",${escapeCsv(job.name)}`,
    `"Job Date",${escapeCsv(job.date)}`,
    `"Status",${escapeCsv(job.status)}`,
    `"Total Invoice Value",${totalCost.toFixed(2)}`,
    `"Remarks",${escapeCsv(job.remarks || "—")}`,
    `"Description",${escapeCsv(job.description || "—")}`,
    "",
    `"=== ASSIGNED SUPPLIERS (${jobSuppliers.length}) ==="`,
    `"Code","Supplier Name","Contact Person","Phone","Email"`,
    ...jobSuppliers.map((s) =>
      [escapeCsv(s.code), escapeCsv(s.name), escapeCsv(s.contactPerson), escapeCsv(s.phone), escapeCsv(s.email)].join(",")
    ),
    "",
    `"=== ATTACHED EXCEL SHEETS (${jobExcelFiles.length}) ==="`,
    `"Document Name","File Name","File Date","Size","Status"`,
    ...jobExcelFiles.map((x) =>
      [escapeCsv(x.customName || x.fileName), escapeCsv(x.fileName), escapeCsv(x.fileDate || "—"), escapeCsv(x.fileSize), escapeCsv(x.status)].join(",")
    ),
    "",
    `"=== ITEMIZED INVOICES & COSTS (${jobInvoices.length}) ==="`,
    `"Invoice Name","File Name","Supplier","Invoice Date","Amount (Rs.)","Status"`,
    ...jobInvoices.map((inv) => {
      const sup = jobSuppliers.find((s) => s.id === inv.supplierId);
      return [
        escapeCsv(inv.invoiceName),
        escapeCsv(inv.fileName),
        escapeCsv(sup ? sup.name : "—"),
        escapeCsv(inv.invoiceDate),
        inv.totalValue.toFixed(2),
        escapeCsv(inv.status),
      ].join(",");
    }),
    `"TOTAL COST","","","",${totalCost.toFixed(2)},""`,
  ];

  const filename = `${job.jobCode || "JOB"}_${job.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_full_cost_report.csv`;
  downloadCsvFile(filename, lines.join("\n"));
}
