import { prisma } from "@/lib/prisma";

export type ERPModule =
  | "dashboard"
  | "jobs"
  | "suppliers"
  | "purchaseOrders"
  | "approvals"
  | "supplierInvoices"
  | "supplierPayments"
  | "invoices"
  | "profitLoss"
  | "accessControl"
  | "auditController";

export type ERPAction =
  | "view"
  | "viewOwn"
  | "viewTeam"
  | "viewAll"
  | "create"
  | "edit"
  | "submit"
  | "delete"
  | "restore"
  | "permanentDelete"
  | "download"
  | "downloadExcel"
  | "bulkDownload"
  | "export"
  | "print"
  | "approve"
  | "reject"
  | "issue"
  | "moveToPending"
  | "cancel"
  | "reverse"
  | "downloadReceipt"
  | "exportReports"
  | "viewOutstanding"
  | "viewOverdue"
  | "manageNotifications"
  | "overrideDueDate"
  | "manageAttachments"
  | "viewFinancials"
  | "viewFinancialSummary"
  | "viewOriginalCosts"
  | "viewActualSupplierCosts"
  | "createAdditionalExpense"
  | "editAdditionalExpense"
  | "cancelAdditionalExpense"
  | "managePermissions"
  | "viewHistory"
  | "overrideJobBudget"
  | "manualEntry"
  | "manageDepartmentAllocation"
  | "manageSettings";

// Backwards-compatible action alias
export type Action = ERPAction;

export interface ModuleActionDef {
  key: ERPAction;
  label: string;
  description: string;
  isDangerous?: boolean;
}

export interface ModuleDef {
  key: ERPModule;
  name: string;
  category: string;
  description: string;
  actions: ModuleActionDef[];
}

export const PERMISSION_MODULES: ModuleDef[] = [
  {
    key: "dashboard",
    name: "Dashboard",
    category: "Overview",
    description: "Main executive dashboard, overall company stats, and performance indicators.",
    actions: [
      { key: "view", label: "View Dashboard", description: "Access the overview dashboard and main KPIs" },
      { key: "viewOwn", label: "View Own Statistics", description: "View dashboard statistics for records created by the logged-in user" },
      { key: "viewTeam", label: "View Team Statistics", description: "View team-wide and employee-wise performance statistics" },
      { key: "viewAll", label: "View All Statistics", description: "View organization-wide complete dashboard KPIs and metrics" },
      { key: "viewFinancials", label: "View Financial Metrics", description: "View approved job value, actual costs, and recorded profit overview", isDangerous: true },
      { key: "export", label: "Export Dashboard Summary", description: "Export dashboard summary metrics" },
    ],
  },
  {
    key: "jobs",
    name: "Job Management",
    category: "Operations",
    description: "Project management, quotation parsing, cost breakdowns, and Excel bulk uploads.",
    actions: [
      { key: "view", label: "View Jobs", description: "Access the Job Management module" },
      { key: "viewOwn", label: "View Own Jobs", description: "View only jobs created by the logged-in user" },
      { key: "viewTeam", label: "View Team Jobs", description: "View jobs created by team members and subordinates" },
      { key: "viewAll", label: "View All Jobs", description: "View all jobs across the entire organization" },
      { key: "create", label: "Create Jobs", description: "Create new jobs and bulk upload quotation Excel files" },
      { key: "edit", label: "Edit Jobs", description: "Modify job metadata, descriptions, and line items" },
      { key: "delete", label: "Delete Jobs (Move to Trash)", description: "Move jobs to Trash (soft delete)", isDangerous: true },
      { key: "restore", label: "Restore Jobs", description: "Restore soft-deleted jobs from Trash" },
      { key: "permanentDelete", label: "Permanently Delete Jobs", description: "Permanently purge eligible jobs and release Excel file hashes", isDangerous: true },
      { key: "download", label: "Download Original Excel", description: "Download individual job quotation Excel files" },
      { key: "bulkDownload", label: "Bulk Download Documents", description: "Download all job quotation documents as a ZIP archive" },
      { key: "export", label: "Export Jobs", description: "Export job lists and detailed cost reports to CSV/Excel" },
      { key: "viewFinancials", label: "View Job Costs", description: "Inspect detailed production cost breakdown, rates, and supplier totals", isDangerous: true },
      { key: "viewFinancialSummary", label: "View Job Financial Summary", description: "View job financial overview, gross profit, profit margin, and cost comparisons", isDangerous: true },
      { key: "viewOriginalCosts", label: "View Original Job Costs", description: "View original Excel quotation cost categories, item rates, and estimated totals" },
      { key: "viewActualSupplierCosts", label: "View Actual Supplier Costs", description: "View actual Supplier Invoice costs, savings/overruns, and outstanding vendor balances", isDangerous: true },
      { key: "createAdditionalExpense", label: "Create Additional Expenses", description: "Record non-invoice additional expenses (transport, delivery, labour, fuel, etc.) on a Job" },
      { key: "editAdditionalExpense", label: "Edit Additional Expenses", description: "Modify active additional expenses on a Job with full audit history" },
      { key: "cancelAdditionalExpense", label: "Cancel Additional Expenses", description: "Cancel additional expenses with mandatory reason and recalculate Job P&L", isDangerous: true },
    ],
  },
  {
    key: "suppliers",
    name: "Supplier Management",
    category: "Procurement",
    description: "Supplier profiles, contact details, assigned jobs, and vendor management.",
    actions: [
      { key: "view", label: "View Suppliers", description: "Browse supplier list and view company/contact details" },
      { key: "viewOwn", label: "View Own Suppliers", description: "View suppliers created by the logged-in user" },
      { key: "viewTeam", label: "View Team Suppliers", description: "View suppliers created by team members" },
      { key: "viewAll", label: "View All Suppliers", description: "View master supplier directory across all teams" },
      { key: "create", label: "Create Suppliers", description: "Register new vendor and supplier profiles" },
      { key: "edit", label: "Edit Suppliers", description: "Update supplier details, phone, email, and address" },
      { key: "delete", label: "Delete Suppliers (Move to Trash)", description: "Move supplier profiles to Trash", isDangerous: true },
      { key: "restore", label: "Restore Suppliers", description: "Restore deleted supplier profiles from Trash" },
      { key: "permanentDelete", label: "Permanently Delete Suppliers", description: "Permanently purge supplier records from the system", isDangerous: true },
      { key: "download", label: "Download Supplier Information", description: "Download individual supplier records" },
      { key: "export", label: "Export Suppliers", description: "Export supplier lists to CSV" },
    ],
  },
  {
    key: "purchaseOrders",
    name: "Purchase Order Management",
    category: "Procurement",
    description: "Purchase Orders linked to approved Jobs, budget controls, approvals, and exports.",
    actions: [
      { key: "view", label: "View Purchase Orders", description: "Access the Purchase Order module and view PO details" },
      { key: "viewOwn", label: "View Own Purchase Orders", description: "View only POs created by the logged-in user" },
      { key: "viewTeam", label: "View Team Purchase Orders", description: "View POs created by team members / subordinates" },
      { key: "viewAll", label: "View All Purchase Orders", description: "View all Purchase Orders across the entire organization" },
      { key: "create", label: "Create Purchase Orders", description: "Create new Purchase Orders linked to approved Jobs" },
      { key: "edit", label: "Edit Purchase Orders", description: "Modify Draft or Rejected Purchase Orders" },
      { key: "submit", label: "Submit for Approval", description: "Submit Draft Purchase Orders for approval" },
      { key: "approve", label: "Approve Purchase Orders", description: "Approve Pending Purchase Orders", isDangerous: true },
      { key: "reject", label: "Reject Purchase Orders", description: "Reject Pending Purchase Orders with mandatory reason", isDangerous: true },
      { key: "issue", label: "Issue Purchase Orders", description: "Mark Approved Purchase Orders as Issued to suppliers" },
      { key: "cancel", label: "Cancel Purchase Orders", description: "Cancel Purchase Orders with mandatory reason and release commitments", isDangerous: true },
      { key: "delete", label: "Delete Purchase Orders (Trash)", description: "Move Purchase Orders to Trash", isDangerous: true },
      { key: "restore", label: "Restore Purchase Orders", description: "Restore soft-deleted Purchase Orders from Trash" },
      { key: "permanentDelete", label: "Permanently Delete PO", description: "Permanently purge eligible Draft/Rejected Purchase Orders", isDangerous: true },
      { key: "download", label: "Download PO & Attachments", description: "Download PO supporting documents" },
      { key: "downloadExcel", label: "Download PO Excel", description: "Download formatted multi-sheet Excel Purchase Order" },
      { key: "export", label: "Export PO Reports", description: "Export Purchase Order listings and reports to CSV" },
      { key: "print", label: "Print / Export PDF PO", description: "Print official Purchase Order or save as PDF" },
      { key: "viewFinancials", label: "View PO Financial Analytics", description: "Inspect executive PO KPIs, budget comparisons, and financial reports", isDangerous: true },
      { key: "manageDepartmentAllocation", label: "Manage Department Allocation", description: "Allocate PO quantities and costs across company departments" },
      { key: "overrideJobBudget", label: "Override Job Cost Budget", description: "Exceed remaining Job cost item budget or add unbudgeted items", isDangerous: true },
      { key: "manageSettings", label: "Manage PO Settings & Departments", description: "Configure PO numbering, tax defaults, company header, and departments", isDangerous: true },
    ],
  },
  {
    key: "approvals",
    name: "Approval Management",
    category: "Operations",
    description: "Management approval workflow for quotation budgets and project sign-offs.",
    actions: [
      { key: "view", label: "View Pending Jobs", description: "Review quotation jobs waiting for executive approval" },
      { key: "viewOwn", label: "View Own Job Approval Status", description: "Review approval status and decision history for own submitted jobs" },
      { key: "viewTeam", label: "View Team Pending Jobs", description: "Review approval requests submitted by team members / subordinates" },
      { key: "viewAll", label: "View All Pending Jobs", description: "Review all pending quotation jobs company-wide" },
      { key: "approve", label: "Approve Jobs", description: "Sign off and officially approve quotation jobs for production", isDangerous: true },
      { key: "reject", label: "Reject Jobs", description: "Reject quotation jobs and require corrections", isDangerous: true },
      { key: "moveToPending", label: "Move to Pending", description: "Reset eligible jobs back to pending approval (if unlocked)", isDangerous: true },
      { key: "viewHistory", label: "View Approval History", description: "Inspect historical audit log of approval and rejection decisions" },
    ],
  },
  {
    key: "supplierInvoices",
    name: "Supplier Invoice Management",
    category: "Financials",
    description: "Supplier invoices, multiple file attachments (PDF/Word/Images), and job cost synchronization.",
    actions: [
      { key: "view", label: "View Invoices", description: "Browse supplier invoices and view line item breakdowns" },
      { key: "viewOwn", label: "View Own Invoices", description: "View only supplier invoices created by the logged-in user" },
      { key: "viewTeam", label: "View Team Invoices", description: "View supplier invoices created by team members / subordinates" },
      { key: "viewAll", label: "View All Invoices", description: "View all supplier invoices across the entire organization" },
      { key: "create", label: "Create Invoices", description: "Upload new supplier invoices and update Job actual costs" },
      { key: "edit", label: "Edit Invoices", description: "Modify invoice rows, amounts, descriptions, and attachments" },
      { key: "cancel", label: "Cancel Invoices", description: "Cancel recorded invoices with mandatory audit reason", isDangerous: true },
      { key: "delete", label: "Delete Invoices", description: "Move supplier invoices to Trash", isDangerous: true },
      { key: "download", label: "Download Attachments", description: "View and download individual invoice PDF/Word/Image attachments" },
      { key: "bulkDownload", label: "Bulk Download Attachments", description: "Bulk download all invoice attachments for a Job as a ZIP archive" },
      { key: "export", label: "Export Invoice Reports", description: "Export supplier invoice breakdown reports to CSV/Excel" },
      { key: "manualEntry", label: "Manual / Custom Invoice Entries", description: "Allow entering manual invoice descriptions when a Job has no saved cost lines or outside Job cost lines" },
      { key: "overrideJobBudget", label: "Override Job Cost Line Budget", description: "Allow Supplier Invoice entry amounts to exceed the remaining uninvoiced balance of a Job cost line", isDangerous: true },
      { key: "overrideDueDate", label: "Override Payment Due Date", description: "Allow setting a Payment Due Date earlier than the Invoice Date", isDangerous: true },
    ],
  },
  {
    key: "supplierPayments",
    name: "Supplier Payments",
    category: "Financials",
    description: "Supplier invoice settlement, partial payments, payment due date monitoring, receipts, and payment reports.",
    actions: [
      { key: "view", label: "View Supplier Payments", description: "Access Supplier Payments module and payable invoice balances" },
      { key: "viewOwn", label: "View Own Supplier Payments", description: "View payments and invoices created by the logged-in user" },
      { key: "viewTeam", label: "View Team Supplier Payments", description: "View payments and invoices within the user's team scope" },
      { key: "viewAll", label: "View All Supplier Payments", description: "View all supplier invoices and payments organization-wide" },
      { key: "viewHistory", label: "View Payment History", description: "Inspect full Supplier Payment transaction ledger and audit logs" },
      { key: "viewOutstanding", label: "View Outstanding Invoices", description: "Access unpaid, partially paid, and balance-due invoice queue" },
      { key: "viewOverdue", label: "View Overdue Invoices & Alerts", description: "Inspect overdue payment countdowns and past-due alerts" },
      { key: "create", label: "Record / Make Payments", description: "Submit partial or full payments against active Supplier Invoices" },
      { key: "edit", label: "Edit Payment Details", description: "Correct recorded payment metadata/amounts with mandatory audit reason" },
      { key: "reverse", label: "Reverse Recorded Payments", description: "Reverse a payment record safely with audit reason and recalculate balances", isDangerous: true },
      { key: "downloadReceipt", label: "Download Payment Receipts", description: "View and download uploaded payment receipt proofs" },
      { key: "exportReports", label: "Export Payment Reports", description: "Export Excel and print/PDF supplier payment statements" },
      { key: "manageNotifications", label: "Manage Payment Notifications", description: "Run payment due reminder sweeps and clear notification queues" },
      { key: "manageSettings", label: "Manage Payment Reminder Settings", description: "Configure timezone, reminder intervals, and optional email notifications", isDangerous: true },
      { key: "overrideDueDate", label: "Override Past-Date Rules", description: "Allow due date overrides earlier than invoice date", isDangerous: true },
    ],
  },
  {
    key: "profitLoss",
    name: "Profit & Loss",
    category: "Financials",
    description: "Comprehensive financial reporting, approved value vs actual cost, and net margins.",
    actions: [
      { key: "view", label: "View Profit & Loss", description: "Access the company P&L dashboard and performance charts" },
      { key: "viewOwn", label: "View Own Job Financial Data", description: "View financial reports for own created jobs" },
      { key: "viewTeam", label: "View Team Financial Data", description: "View financial reports for team members' jobs" },
      { key: "viewAll", label: "View All Financial Data", description: "View company-wide financial reports and margins" },
      { key: "viewFinancials", label: "View Job Financial Details", description: "Examine detailed job profit margins, cost variance, and remaining budget", isDangerous: true },
      { key: "download", label: "Download Financial Reports", description: "Download formatted financial statements" },
      { key: "export", label: "Export Financial Reports", description: "Export profit and loss line items to CSV/Excel" },
    ],
  },
  {
    key: "accessControl",
    name: "Access Controller",
    category: "Administration",
    description: "System administration, user account management, RBAC, and granular permissions.",
    actions: [
      { key: "view", label: "View Users", description: "Browse registered user accounts, roles, and status" },
      { key: "create", label: "Create Users", description: "Create and provision new employee and supervisor accounts" },
      { key: "edit", label: "Edit Users", description: "Modify user profile information, job title, and role" },
      { key: "delete", label: "Disable / Delete Users", description: "Suspend user accounts or move to Trash", isDangerous: true },
      { key: "managePermissions", label: "Manage Permissions", description: "Assign, customize, and revoke granular module permissions", isDangerous: true },
    ],
  },
  {
    key: "invoices",
    name: "Customer Billing",
    category: "Financials",
    description: "Client billing invoices, revisions, PDF generations, and customer receivables.",
    actions: [
      { key: "view", label: "View Client Invoices", description: "View generated customer invoices and revision history" },
      { key: "viewOwn", label: "View Own Client Invoices", description: "View client invoices generated for own jobs" },
      { key: "viewTeam", label: "View Team Client Invoices", description: "View client invoices generated for team jobs" },
      { key: "viewAll", label: "View All Client Invoices", description: "View all client invoices across the organization" },
      { key: "create", label: "Generate Client Invoices", description: "Generate formal customer billing invoices for approved jobs" },
      { key: "edit", label: "Regenerate Invoices", description: "Regenerate client invoices with version increment and audit snapshot" },
      { key: "delete", label: "Delete Invoices", description: "Cancel or move client invoices to Trash", isDangerous: true },
      { key: "download", label: "Download Invoice PDF", description: "Download official PDF copies of customer invoices" },
      { key: "export", label: "Export Billing Data", description: "Export client billing summaries to CSV" },
    ],
  },
];

export type ModulePermissions = Partial<Record<ERPAction, boolean>>;
export type PermissionsPolicy = Partial<Record<ERPModule, ModulePermissions>>;

// ─── Default Role Policies ───────────────────────────────────────────────────

export const DEFAULT_ROLE_PERMISSIONS: Record<string, PermissionsPolicy> = {
  admin: {
    dashboard: { view: true, viewOwn: true, viewTeam: true, viewAll: true, viewFinancials: true, export: true },
    jobs: {
      view: true,
      viewOwn: true,
      viewTeam: true,
      viewAll: true,
      create: true,
      edit: true,
      delete: true,
      restore: true,
      permanentDelete: true,
      download: true,
      bulkDownload: true,
      export: true,
      viewFinancials: true,
      viewFinancialSummary: true,
      viewOriginalCosts: true,
      viewActualSupplierCosts: true,
      createAdditionalExpense: true,
      editAdditionalExpense: true,
      cancelAdditionalExpense: true,
    },
    suppliers: {
      view: true,
      viewOwn: true,
      viewTeam: true,
      viewAll: true,
      create: true,
      edit: true,
      delete: true,
      restore: true,
      permanentDelete: true,
      download: true,
      export: true,
    },
    purchaseOrders: {
      view: true,
      viewOwn: true,
      viewTeam: true,
      viewAll: true,
      create: true,
      edit: true,
      submit: true,
      approve: true,
      reject: true,
      issue: true,
      cancel: true,
      delete: true,
      restore: true,
      permanentDelete: true,
      download: true,
      downloadExcel: true,
      export: true,
      print: true,
      viewFinancials: true,
      manageDepartmentAllocation: true,
      overrideJobBudget: true,
      manageSettings: true,
    },
    approvals: {
      view: true,
      viewOwn: true,
      viewTeam: true,
      viewAll: true,
      approve: true,
      reject: true,
      moveToPending: true,
      viewHistory: true,
    },
    supplierInvoices: {
      view: true,
      viewOwn: true,
      viewTeam: true,
      viewAll: true,
      create: true,
      edit: true,
      cancel: true,
      delete: true,
      download: true,
      bulkDownload: true,
      export: true,
      manualEntry: true,
      overrideJobBudget: true,
      overrideDueDate: true,
    },
    supplierPayments: {
      view: true,
      viewOwn: true,
      viewTeam: true,
      viewAll: true,
      viewHistory: true,
      viewOutstanding: true,
      viewOverdue: true,
      create: true,
      edit: true,
      reverse: true,
      downloadReceipt: true,
      exportReports: true,
      manageNotifications: true,
      manageSettings: true,
      overrideDueDate: true,
    },
    invoices: {
      view: true,
      viewOwn: true,
      viewTeam: true,
      viewAll: true,
      create: true,
      edit: true,
      delete: true,
      download: true,
      export: true,
    },
    profitLoss: {
      view: true,
      viewOwn: true,
      viewTeam: true,
      viewAll: true,
      viewFinancials: true,
      download: true,
      export: true,
    },
    accessControl: {
      view: true,
      create: true,
      edit: true,
      delete: true,
      managePermissions: true,
    },
    auditController: {
      view: true,
      export: true,
    },
  },
  supervisor: {
    dashboard: { view: true, viewOwn: true, viewTeam: true, viewAll: false, viewFinancials: true, export: true },
    jobs: {
      view: true,
      viewOwn: true,
      viewTeam: true,
      viewAll: false,
      create: true,
      edit: true,
      delete: true,
      restore: true,
      permanentDelete: false,
      download: true,
      bulkDownload: true,
      export: true,
      viewFinancials: true,
      viewFinancialSummary: true,
      viewOriginalCosts: true,
      viewActualSupplierCosts: true,
      createAdditionalExpense: true,
      editAdditionalExpense: true,
      cancelAdditionalExpense: false,
    },
    suppliers: {
      view: true,
      viewOwn: true,
      viewTeam: true,
      viewAll: true,
      create: true,
      edit: true,
      delete: false,
      restore: false,
      permanentDelete: false,
      download: true,
      export: true,
    },
    purchaseOrders: {
      view: true,
      viewOwn: true,
      viewTeam: true,
      viewAll: false,
      create: true,
      edit: true,
      submit: true,
      approve: true,
      reject: true,
      issue: true,
      cancel: false,
      delete: true,
      restore: true,
      permanentDelete: false,
      download: true,
      downloadExcel: true,
      export: true,
      print: true,
      viewFinancials: true,
      manageDepartmentAllocation: true,
      overrideJobBudget: false,
      manageSettings: false,
    },
    approvals: {
      view: true,
      viewOwn: true,
      viewTeam: true,
      viewAll: false,
      approve: true,
      reject: true,
      moveToPending: false,
      viewHistory: true,
    },
    supplierInvoices: {
      view: true,
      viewOwn: true,
      viewTeam: true,
      viewAll: false,
      create: true,
      edit: true,
      cancel: false,
      delete: false,
      download: true,
      bulkDownload: true,
      export: true,
      manualEntry: true,
      overrideJobBudget: false,
      overrideDueDate: false,
    },
    supplierPayments: {
      view: true,
      viewOwn: true,
      viewTeam: true,
      viewAll: false,
      viewHistory: true,
      viewOutstanding: true,
      viewOverdue: true,
      create: true,
      edit: true,
      reverse: false,
      downloadReceipt: true,
      exportReports: true,
      manageNotifications: true,
      manageSettings: false,
      overrideDueDate: false,
    },
    invoices: {
      view: true,
      viewOwn: true,
      viewTeam: true,
      viewAll: false,
      create: true,
      edit: true,
      delete: false,
      download: true,
      export: true,
    },
    profitLoss: {
      view: true,
      viewOwn: true,
      viewTeam: true,
      viewAll: false,
      viewFinancials: true,
      download: true,
      export: true,
    },
    accessControl: {
      view: true,
      create: false,
      edit: false,
      delete: false,
      managePermissions: false,
    },
    auditController: {
      view: true,
      export: false,
    },
  },
  employee: {
    dashboard: { view: true, viewOwn: true, viewTeam: false, viewAll: false, viewFinancials: false, export: false },
    jobs: {
      view: true,
      viewOwn: true,
      viewTeam: false,
      viewAll: false,
      create: true,
      edit: false,
      delete: false,
      restore: false,
      permanentDelete: false,
      download: true,
      bulkDownload: false,
      export: false,
      viewFinancials: false,
      viewFinancialSummary: false,
      viewOriginalCosts: false,
      viewActualSupplierCosts: false,
      createAdditionalExpense: false,
      editAdditionalExpense: false,
      cancelAdditionalExpense: false,
    },
    suppliers: {
      view: true,
      viewOwn: true,
      viewTeam: false,
      viewAll: true,
      create: false,
      edit: false,
      delete: false,
      restore: false,
      permanentDelete: false,
      download: false,
      export: false,
    },
    purchaseOrders: {
      view: true,
      viewOwn: true,
      viewTeam: false,
      viewAll: false,
      create: true,
      edit: true,
      submit: true,
      approve: false,
      reject: false,
      issue: false,
      cancel: false,
      delete: false,
      restore: false,
      permanentDelete: false,
      download: true,
      downloadExcel: true,
      export: false,
      print: true,
      viewFinancials: false,
      manageDepartmentAllocation: true,
      overrideJobBudget: false,
      manageSettings: false,
    },
    approvals: {
      view: true,
      viewOwn: true,
      viewTeam: false,
      viewAll: false,
      approve: false,
      reject: false,
      moveToPending: false,
      viewHistory: false,
    },
    supplierInvoices: {
      view: true,
      viewOwn: true,
      viewTeam: false,
      viewAll: false,
      create: true,
      edit: false,
      cancel: false,
      delete: false,
      download: true,
      bulkDownload: false,
      export: false,
      manualEntry: false,
      overrideJobBudget: false,
      overrideDueDate: false,
    },
    supplierPayments: {
      view: true,
      viewOwn: true,
      viewTeam: false,
      viewAll: false,
      viewHistory: true,
      viewOutstanding: true,
      viewOverdue: true,
      create: false,
      edit: false,
      reverse: false,
      downloadReceipt: true,
      exportReports: false,
      manageNotifications: false,
      manageSettings: false,
      overrideDueDate: false,
    },
    invoices: {
      view: true,
      viewOwn: true,
      viewTeam: false,
      viewAll: false,
      create: false,
      edit: false,
      delete: false,
      download: true,
      export: false,
    },
    profitLoss: {
      view: false,
      viewOwn: false,
      viewTeam: false,
      viewAll: false,
      viewFinancials: false,
      download: false,
      export: false,
    },
    accessControl: {
      view: false,
      create: false,
      edit: false,
      delete: false,
      managePermissions: false,
    },
    auditController: {
      view: false,
      export: false,
    },
  },
};

export const ROLE_PERMISSIONS = DEFAULT_ROLE_PERMISSIONS;

/**
 * Builds an empty policy with all actions explicitly initialized to false.
 */
export function createEmptyPermissionsPolicy(): PermissionsPolicy {
  const policy: PermissionsPolicy = {};
  for (const mod of PERMISSION_MODULES) {
    policy[mod.key] = {};
    for (const act of mod.actions) {
      policy[mod.key]![act.key] = false;
    }
  }
  return policy;
}

/**
 * Clones and deeply copies a permissions policy.
 */
export function clonePermissionsPolicy(policy?: PermissionsPolicy | null): PermissionsPolicy {
  if (!policy) return {};
  const copy: PermissionsPolicy = {};
  for (const [modKey, actions] of Object.entries(policy)) {
    copy[modKey as ERPModule] = { ...(actions as ModulePermissions) };
  }
  return copy;
}

/**
 * Fast synchronous fallback check against standard role defaults.
 */
export function hasPermission(
  roles: string[] | string | undefined | null,
  module: ERPModule,
  action: ERPAction
): boolean {
  if (!roles) return false;
  const roleList = Array.isArray(roles) ? roles : [roles];

  return roleList.some((r) => {
    const roleKey = r.toLowerCase().trim();
    const policy = DEFAULT_ROLE_PERMISSIONS[roleKey];
    return policy?.[module]?.[action] ?? false;
  });
}

/**
 * Resolves the final effective permissions for a user using database priority rules:
 * 1. User-level explicit override (from user_permissions relational table or user.permissions JSON)
 * 2. Role-level permission (from role_permissions table or role.permissionsData JSON or default role policy)
 * 3. Default deny (false)
 */
export async function getUserEffectivePermissions(
  userId: string
): Promise<PermissionsPolicy> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
        userPermissions: {
          include: { permission: true },
        },
      },
    });

    if (!user) {
      return DEFAULT_ROLE_PERMISSIONS.employee;
    }

    const primaryRoleName = (user.roles?.[0]?.role?.name || "employee").toLowerCase();
    const roleRecord = user.roles?.[0]?.role;

    // ── STEP 1: Compute Base Role Policy ─────────────────────────────────────
    const baseRoleDefault =
      DEFAULT_ROLE_PERMISSIONS[primaryRoleName] || DEFAULT_ROLE_PERMISSIONS.employee;
    let computedRolePolicy: PermissionsPolicy = clonePermissionsPolicy(baseRoleDefault);

    // If role has custom permissionsData JSON
    if (roleRecord && (roleRecord as any).permissionsData) {
      try {
        const parsed = (roleRecord as any).permissionsData as PermissionsPolicy;
        for (const [modKey, acts] of Object.entries(parsed)) {
          computedRolePolicy[modKey as ERPModule] = {
            ...computedRolePolicy[modKey as ERPModule],
            ...acts,
          };
        }
      } catch {}
    }

    // If role has relational role_permissions rows
    if (roleRecord?.permissions && roleRecord.permissions.length > 0) {
      for (const rp of roleRecord.permissions) {
        const mod = rp.permission.resource as ERPModule;
        const act = rp.permission.action as ERPAction;
        if (!computedRolePolicy[mod]) computedRolePolicy[mod] = {};
        computedRolePolicy[mod]![act] = rp.isAllowed;
      }
    }

    // ── STEP 2: Apply User-Level Overrides (Highest Priority) ────────────────
    const finalPolicy: PermissionsPolicy = clonePermissionsPolicy(computedRolePolicy);

    // A. Check user.permissions JSON field (cached override)
    if (user.permissions && typeof user.permissions === "object") {
      const userJson = user.permissions as PermissionsPolicy;
      for (const [modKey, acts] of Object.entries(userJson)) {
        if (!finalPolicy[modKey as ERPModule]) finalPolicy[modKey as ERPModule] = {};
        for (const [actKey, val] of Object.entries(acts || {})) {
          if (typeof val === "boolean") {
            finalPolicy[modKey as ERPModule]![actKey as ERPAction] = val;
          }
        }
      }
    }

    // B. Check user_permissions relational table
    if (user.userPermissions && user.userPermissions.length > 0) {
      for (const up of user.userPermissions) {
        const mod = up.permission.resource as ERPModule;
        const act = up.permission.action as ERPAction;
        if (!finalPolicy[mod]) finalPolicy[mod] = {};
        finalPolicy[mod]![act] = up.isAllowed;
      }
    }

    // ── STEP 3: Dependency Enforcement ───────────────────────────────────────
    // If a module's 'view' is false, disable dependent child actions
    for (const mod of PERMISSION_MODULES) {
      const modPolicy = finalPolicy[mod.key];
      if (modPolicy && modPolicy.view === false) {
        for (const act of mod.actions) {
          if (act.key !== "view") {
            modPolicy[act.key] = false;
          }
        }
      }
    }

    // Anti-Lockout Guard: Super Admin must retain Access Control View & Manage
    const isAdmin = user.roles.some((r) => r.role.name.toLowerCase() === "admin");
    if (isAdmin && user.email === (process.env.ADMIN_EMAIL || "admin@reflecterp.com")) {
      if (!finalPolicy.accessControl) finalPolicy.accessControl = {};
      finalPolicy.accessControl.view = true;
      finalPolicy.accessControl.managePermissions = true;
    }

    return finalPolicy;
  } catch (err) {
    console.error("getUserEffectivePermissions DB error:", err);
    return DEFAULT_ROLE_PERMISSIONS.admin;
  }
}

/**
 * Backend authorization check: verifies if the requesting session has live permission
 * in PostgreSQL for the specified module and action.
 */
export async function checkSessionPermission(
  session: { userId?: string; roles?: string[]; email?: string } | null | undefined,
  module: ERPModule,
  action: ERPAction
): Promise<boolean> {
  if (!session || !session.userId) return false;

  // Super Admin fast-path guard
  if (session.roles?.includes("admin") && session.email === (process.env.ADMIN_EMAIL || "admin@reflecterp.com")) {
    return true;
  }

  try {
    const permissions = await getUserEffectivePermissions(session.userId);
    return permissions[module]?.[action] ?? false;
  } catch {
    return hasPermission(session.roles, module, action);
  }
}

/**
 * Clean 1-line authorization helper for API routes.
 */
export async function authorizeRequest(
  session: { userId?: string; roles?: string[]; email?: string } | null | undefined,
  module: ERPModule,
  action: ERPAction,
  customErrorMessage?: string
): Promise<{ authorized: boolean; error?: string }> {
  if (!session || !session.userId) {
    return { authorized: false, error: "Unauthorized access. Please log in." };
  }

  const allowed = await checkSessionPermission(session, module, action);
  if (!allowed) {
    return {
      authorized: false,
      error:
        customErrorMessage ||
        `Forbidden: You do not have permission to perform "${action}" on module "${module}".`,
    };
  }

  return { authorized: true };
}
