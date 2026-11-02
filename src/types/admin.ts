export type JobStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "INVOICE_GENERATED"
  | "Pending Approval"
  | "Approved"
  | "Rejected"
  | "Active"
  | "Pending"
  | "Completed"
  | "In Review"
  | string;

export type CustomerInvoiceStatus = "GENERATED" | "ISSUED" | "PAID" | "CANCELLED";

export interface JobApproval {
  id: string;
  jobId: string;
  userId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  action: "APPROVE" | "REJECT" | "MOVE_TO_PENDING" | "SUBMIT" | "RESET" | string;
  previousStatus: string;
  newStatus: string;
  reason?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface CustomerInvoice {
  id: string;
  invoiceNumber: string;
  jobId: string;
  version: number;
  clientName: string;
  clientAddress?: string | null;
  clientEmail?: string | null;
  issueDate: string;
  dueDate?: string | null;
  subTotal: number | string;
  taxType?: string | null;
  taxRate?: number | string | null;
  taxAmount: number | string;
  grandTotal: number | string;
  status: CustomerInvoiceStatus;
  itemsSnapshot?: any;
  costSummarySnapshot?: any;
  notes?: string | null;
  terms?: string | null;
  createdById?: string | null;
  createdByName?: string | null;
  job?: Job | null;
  revisions?: InvoiceRevision[];
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceRevision {
  id: string;
  invoiceId: string;
  version: number;
  previousInvoiceNumber: string;
  regeneratedById?: string | null;
  regeneratedByName?: string | null;
  reason: string;
  snapshot: any;
  createdAt: string;
}

export type InvoiceStatus = "Paid" | "Pending" | "Approved" | "Under Review";

export type ExcelFileStatus = "Processed" | "Uploaded" | "Analyzing";

export interface JobCostCategory {
  id: string;
  jobId: string;
  name: string;
  sortOrder: number;
  subtotal: number | string;
  items?: JobCostItem[];
}

export interface JobCostItem {
  id: string;
  jobId: string;
  categoryId?: string | null;
  itemNumber?: number | null;
  description: string;
  rcNrc?: "RC" | "NRC" | string | null;
  quantity: number | string;
  rate: number | string;
  totalCost: number | string;
  sortOrder: number;
  notes?: string;
}

export interface JobCostSummary {
  id?: string;
  jobId?: string;
  productionCost: number | string;
  runningCost: number | string;
  agencyOperationFee: number | string;
  agencyProductionFee: number | string;
  adminCharges: number | string;
  monitoringCost: number | string;
  artworkCharges: number | string;
  contingencies: number | string;
  subTotal: number | string;
  totalBeforeTax: number | string;
  taxType?: string | null;
  taxRate?: number | string | null;
  taxAmount: number | string;
  grandTotal: number | string;
  rawSummaryData?: Record<string, any> | null;
}

export interface DuplicateFileInfo {
  isDuplicate: boolean;
  originalFileName: string;
  existingJobId: string;
  existingJobNumber: string;
  existingJobTitle: string;
  existingClientName?: string | null;
  uploadedDate: string;
  duplicateReason: string;
}

export interface JobUploadLog {
  id: string;
  jobId?: string | null;
  userId?: string | null;
  fileName: string;
  fileSize: string;
  fileHash?: string | null;
  idempotencyKey?: string | null;
  status: "SUCCESS" | "FAILED" | "WARNING" | "DUPLICATE_REJECTED" | "PROCESSING";
  errorMessage?: string | null;
  extractedDetails?: Record<string, any> | null;
  createdAt: string;
}

export interface Job {
  id: string;
  jobCode?: string;
  name: string;
  date: string;
  commencingDate?: string | null;
  clientName?: string | null;
  handledBy?: string | null;
  description?: string | null;
  remarks?: string | null;
  status: JobStatus;
  supplierIds: string[];
  fileHash?: string | null;
  totalCost?: number | string | null;
  grandTotal?: number | string | null;
  createdAt: string;
  deletedAt?: string | null;
  isDeleted?: boolean;
  documents?: ExcelFile[];
  costCategories?: JobCostCategory[];
  costItems?: JobCostItem[];
  costSummary?: JobCostSummary | null;
  uploadLogs?: JobUploadLog[];
  approvals?: JobApproval[];
  customerInvoice?: CustomerInvoice | null;
  invoice?: CustomerInvoice | null;
  submittedBy?: { id: string; name: string; email: string } | null;
  supplierInvoices?: SupplierInvoice[];
  financialOverview?: {
    approvedJobValue: number;
    totalSupplierCost: number;
    otherCosts: number;
    totalActualCost: number;
    remainingBudget: number;
    grossProfit: number;
    profitMargin: number;
    costUtilization: number;
    isBudgetExceeded: boolean;
    supplierInvoicesCount: number;
  };
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  createdAt: string;
  isDeleted?: boolean;
  deletedAt?: string;
}

export interface ExcelFile {
  id: string;
  jobId: string;
  fileName: string;
  customName?: string;
  fileDate?: string;
  fileSize: string;
  fileType?: string;
  uploadDateTime: string;
  status: ExcelFileStatus;
  fileUrl?: string;
  storagePath?: string;
}

export interface InvoiceAttachment {
  id: string;
  fileName: string;
  fileSize: string;
  fileType: "pdf" | "image";
  fileUrl?: string;
  storagePath?: string;
}

export interface Invoice {
  id: string;
  jobId: string;
  supplierId: string;
  invoiceName: string;
  invoiceDate: string;
  totalValue: number;
  fileName: string;
  fileSize: string;
  uploadDate: string;
  status: InvoiceStatus;
  fileUrl?: string;
  storagePath?: string;
  attachments?: InvoiceAttachment[];
}

export interface ToastNotification {
  id: string;
  title: string;
  message?: string;
  type: "success" | "error" | "info";
}

export interface ModulePermission {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  approve: boolean;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  color: string;
  isSystem?: boolean;
  permissions: {
    dashboard: ModulePermission;
    jobs: ModulePermission;
    excelUploads: ModulePermission;
    invoices: ModulePermission;
    suppliers: ModulePermission;
    approvals: ModulePermission;
    auditController: ModulePermission;
    accessControl: ModulePermission;
  };
}

export type UserStatus = "Active" | "Suspended" | "Pending";

export interface UserAccess {
  id: string;
  name: string;
  email: string;
  phone?: string;
  jobTitle?: string;
  department: string;
  roleId: string; // "role-admin" | "role-supervisor" | "role-employer"
  role?: string;
  status: UserStatus;
  lastLogin: string;
  isDeleted?: boolean;
  deletedAt?: string;
  createdAt?: string;
  permissions?: Record<string, ModulePermission>;
  hasCustomPermissions?: boolean;
}

export interface AccessAuditLog {
  id: string;
  user: string;
  action: string;
  target: string;
  timestamp: string;
  ipAddress: string;
}

// ─── Supplier Invoices & Job Profit / Loss ───────────────────────────────────

export interface SupplierInvoiceAttachment {
  id: string;
  invoiceId: string;
  itemId?: string | null;
  jobId?: string | null;
  fileName: string;
  originalFileName?: string | null;
  storedFileName?: string | null;
  bucketName?: string | null;
  fileSize: string;
  fileType?: string | null;
  mimeType?: string | null;
  fileUrl: string;
  storagePath?: string | null;
  signedUrl?: string | null;
  createdAt: string;
}

export interface SupplierInvoiceItem {
  id: string;
  invoiceId: string;
  rowNumber: number;
  description: string;
  amount: number;
  notes?: string | null;
  attachments?: SupplierInvoiceAttachment[];
  createdAt: string;
}

export interface SupplierInvoiceAuditLog {
  id: string;
  invoiceId: string;
  userId?: string | null;
  userName?: string | null;
  action: "CREATE" | "EDIT" | "CANCEL" | "RESTORE" | string;
  reason?: string | null;
  previousData?: any;
  newData?: any;
  createdAt: string;
}

export interface SupplierInvoice {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  supplierName?: string;
  supplierCode?: string;
  supplier?: any;
  jobId: string;
  jobCode?: string;
  jobName?: string;
  clientName?: string;
  job?: any;
  invoiceDate: string;
  totalAmount: number;
  status: "APPROVED" | "PAID" | "CANCELLED" | string;
  notes?: string | null;
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  cancelledById?: string | null;
  cancelledByName?: string | null;
  createdById?: string | null;
  createdByName?: string | null;
  items?: SupplierInvoiceItem[];
  attachments?: SupplierInvoiceAttachment[];
  auditLogs?: SupplierInvoiceAuditLog[];
  createdAt: string;
  updatedAt: string;
}

export interface JobProfitLossSummary {
  jobId: string;
  jobCode: string;
  jobName: string;
  clientName: string;
  status: string;
  jobDate: string;
  approvedJobValue: number;
  totalSupplierCost: number;
  otherCosts: number;
  totalActualCost: number;
  grossProfit: number;
  profitMargin: number;
  financialStatus: "High Margin" | "Healthy" | "Low Margin" | "Over Budget";
  supplierInvoicesCount: number;
}
