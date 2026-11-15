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
  createdById?: string | null;
  createdByName?: string | null;
  createdByEmail?: string | null;
  updatedById?: string | null;
  updatedByName?: string | null;
  updatedAt?: string | null;
  supplierInvoices?: SupplierInvoice[];
  supplierInvoiceCount?: number;
  supplierInvoiceTotal?: number;
  invoiceStatusSummary?: string;
  additionalExpenses?: JobAdditionalExpense[];
  purchaseOrders?: PurchaseOrder[];
  purchaseOrderCount?: number;
  poSummary?: {
    totalCommittedPoValue: number;
    draftPoValue: number;
    approvedPoCount: number;
    activePoCount: number;
    totalPoCount?: number;
    totalDeliveredValue?: number;
    remainingUncommittedBudget: number;
  };
  financialOverview?: {
    approvedJobValue: number;
    originalEstimatedJobCost: number;
    totalSupplierCost: number;
    additionalExpensesTotal: number;
    otherCosts: number;
    totalActualCost: number;
    costDifference: number;
    costSaving: number;
    costOverrun: number;
    remainingBudget: number;
    grossProfit: number;
    profitMargin: number | null;
    costUtilization: number;
    isBudgetExceeded: boolean;
    supplierInvoicesCount: number;
    additionalExpensesCount?: number;
    supplierPaidAmount: number;
    supplierOutstandingBalance: number;
  };
  costComparison?: {
    rows: JobCostComparisonRow[];
    unlinkedItems: JobUnlinkedInvoiceItemRow[];
    totals: {
      originalJobCost: number;
      actualInvoiceCost: number;
      costDifference: number;
      costSaving: number;
      costOverrun: number;
      invoicedAmount: number;
      paidAllocatedAmount: number;
      outstandingInvoiceAmount: number;
      unlinkedActualCost: number;
    };
  };
  financialPermissions?: {
    canViewFinancialSummary: boolean;
    canViewOriginalCosts: boolean;
    canViewActualSupplierCosts: boolean;
    canCreateAdditionalExpense: boolean;
    canEditAdditionalExpense: boolean;
    canCancelAdditionalExpense: boolean;
  };
}

export interface JobCostComparisonRow {
  jobCostItemId: string;
  categoryId?: string | null;
  categoryName: string;
  itemNumber?: number | null;
  description: string;
  rcNrc?: string | null;
  originalQuantity: number;
  originalRate: number;
  originalJobCost: number;
  actualInvoiceCost: number;
  costDifference: number; // originalJobCost - actualInvoiceCost
  costSaving: number;     // max(costDifference, 0)
  costOverrun: number;    // max(-costDifference, 0)
  varianceStatus: "SAVING" | "OVERRUN" | "ON_BUDGET" | "UNINVOICED";
  invoicedAmount: number;
  paidAllocatedAmount: number;
  outstandingInvoiceAmount: number;
  invoiceCount: number;
  linkedInvoices: Array<{
    invoiceId: string;
    invoiceNumber: string;
    supplierId: string;
    supplierName: string;
    invoiceDate: string;
    itemAmount: number;
    paidAllocatedAmount: number;
    outstandingAllocatedAmount: number;
  }>;
}

export interface JobUnlinkedInvoiceItemRow {
  invoiceItemId: string;
  invoiceId: string;
  invoiceNumber: string;
  supplierId: string;
  supplierName: string;
  invoiceDate: string;
  description: string;
  amount: number;
  paidAllocatedAmount: number;
  outstandingAllocatedAmount: number;
  isAdditionalItem: boolean;
}

export interface JobAdditionalExpenseAuditLog {
  id: string;
  expenseId: string;
  jobId: string;
  userId?: string | null;
  userName?: string | null;
  action: "CREATE" | "EDIT" | "CANCEL" | string;
  reason?: string | null;
  previousData?: any;
  newData?: any;
  createdAt: string;
}

export interface JobAdditionalExpense {
  id: string;
  jobId: string;
  expenseDate: string;
  category: string;
  description: string;
  amount: number;
  supplierId?: string | null;
  supplierName?: string | null;
  supplierCode?: string | null;
  payeeName?: string | null;
  paymentReference?: string | null;
  linkedSupplierInvoiceId?: string | null;
  attachmentName?: string | null;
  attachmentOriginalName?: string | null;
  attachmentBucket?: string | null;
  attachmentStoragePath?: string | null;
  attachmentSize?: string | null;
  attachmentMimeType?: string | null;
  attachmentSignedUrl?: string | null;
  notes?: string | null;
  status: "ACTIVE" | "CANCELLED" | string;
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  cancelledById?: string | null;
  cancelledByName?: string | null;
  createdById?: string | null;
  createdByName?: string | null;
  updatedById?: string | null;
  updatedByName?: string | null;
  auditLogs?: JobAdditionalExpenseAuditLog[];
  createdAt: string;
  updatedAt: string;
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
  updatedAt?: string;
  createdById?: string | null;
  createdByName?: string | null;
  updatedById?: string | null;
  updatedByName?: string | null;
  purchaseOrderCount?: number;
  invoiceCount?: number;
  totalBilled?: number;
  totalPaid?: number;
  outstandingBalance?: number;
  overdueInvoiceCount?: number;
  overdueBalance?: number;
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
  viewOwn?: boolean;
  viewTeam?: boolean;
  viewAll?: boolean;
  create?: boolean;
  edit?: boolean;
  submit?: boolean;
  delete?: boolean;
  restore?: boolean;
  permanentDelete?: boolean;
  download?: boolean;
  downloadExcel?: boolean;
  bulkDownload?: boolean;
  export?: boolean;
  print?: boolean;
  approve?: boolean;
  reject?: boolean;
  issue?: boolean;
  moveToPending?: boolean;
  cancel?: boolean;
  reverse?: boolean;
  downloadReceipt?: boolean;
  exportReports?: boolean;
  viewOutstanding?: boolean;
  viewOverdue?: boolean;
  manageNotifications?: boolean;
  overrideDueDate?: boolean;
  manageAttachments?: boolean;
  viewFinancials?: boolean;
  viewFinancialSummary?: boolean;
  viewOriginalCosts?: boolean;
  viewActualSupplierCosts?: boolean;
  createAdditionalExpense?: boolean;
  editAdditionalExpense?: boolean;
  cancelAdditionalExpense?: boolean;
  managePermissions?: boolean;
  viewHistory?: boolean;
  overrideJobBudget?: boolean;
  manualEntry?: boolean;
  manageDepartmentAllocation?: boolean;
  manageSettings?: boolean;
  [key: string]: boolean | undefined;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  color?: string;
  isSystem?: boolean;
  permissions: Record<string, ModulePermission>;
}

export type UserStatus = "Active" | "Suspended" | "Pending";

export interface UserAccess {
  id: string;
  name: string;
  email: string;
  phone?: string;
  jobTitle?: string;
  department: string;
  supervisorId?: string | null;
  supervisorName?: string | null;
  subordinatesCount?: number;
  roleId: string; // "role-admin" | "role-supervisor" | "role-employer"
  role?: string;
  status: UserStatus;
  lastLogin: string;
  isDeleted?: boolean;
  deletedAt?: string;
  createdAt?: string;
  permissions?: Record<string, ModulePermission>;
  effectivePermissions?: Record<string, ModulePermission>;
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

export interface JobCostItemInvoiceInfo {
  id: string;
  jobId: string;
  categoryId?: string | null;
  categoryName: string;
  itemNumber?: number | null;
  description: string;
  rcNrc?: string | null;
  quantity: number;
  unit: string;
  rate: number;
  originalAmount: number;
  invoicedAmount: number;
  invoicedQuantity: number;
  remainingAmount: number;
  activeInvoiceCount: number;
  invoiceNumbers: string[];
  invoicedStatus: "UNINVOICED" | "PARTIAL" | "FULLY_INVOICED" | "OVER_INVOICED";
}

export interface SupplierInvoiceItem {
  id: string;
  invoiceId: string;
  purchaseOrderItemId?: string | null;
  jobCostCategoryId?: string | null;
  jobCostCategoryName?: string | null;
  jobCostItemId?: string | null;
  rowNumber: number;
  description: string;
  originalJobAmount?: number | null;
  quantity?: number | null;
  unit?: string | null;
  unitRate?: number | null;
  amount: number;
  isAdditionalItem?: boolean;
  budgetOverrideReason?: string | null;
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

export type SupplierPaymentStatus =
  | "UNPAID"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERDUE"
  | "CANCELLED"
  | string;

export interface SupplierPaymentCountdown {
  label: string;
  daysDelta: number;
  isOverdue: boolean;
  isDueToday: boolean;
  severity: "neutral" | "upcoming" | "warning" | "overdue" | "paid" | "cancelled";
}

export interface SupplierPaymentAuditLog {
  id: string;
  paymentId?: string | null;
  invoiceId?: string | null;
  userId?: string | null;
  userName?: string | null;
  action: "CREATE" | "EDIT" | "REVERSE" | "DUE_DATE_CHANGE" | string;
  reason?: string | null;
  previousData?: any;
  newData?: any;
  createdAt: string;
}

export interface SupplierPayment {
  id: string;
  paymentNumber: string;
  supplierInvoiceId: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  paymentDueDate?: string | null;
  invoiceTotalAmount?: number;
  invoicePaidAmount?: number;
  supplierId: string;
  supplierName?: string;
  supplierCode?: string;
  jobId: string;
  jobCode?: string;
  jobName?: string;
  paymentDate: string;
  amount: number;
  paymentMethod: "Bank Transfer" | "Cash" | "Cheque" | "Online Transfer" | "Other" | string;
  referenceNumber?: string | null;
  bankAccountName?: string | null;
  notes?: string | null;
  attachmentName?: string | null;
  attachmentOriginalName?: string | null;
  attachmentBucket?: string | null;
  attachmentStoragePath?: string | null;
  attachmentSize?: string | null;
  attachmentMimeType?: string | null;
  attachmentSignedUrl?: string | null;
  idempotencyKey?: string | null;
  status: "SUCCESS" | "REVERSED" | string;
  createdById?: string | null;
  createdByName?: string | null;
  updatedById?: string | null;
  updatedByName?: string | null;
  reversedAt?: string | null;
  reversedById?: string | null;
  reversedByName?: string | null;
  reversalReason?: string | null;
  correctionReason?: string | null;
  auditLogs?: SupplierPaymentAuditLog[];
  createdAt: string;
  updatedAt: string;
}

export interface SupplierPaymentSettings {
  id: string;
  timezone: string;
  upcomingReminderDays: number[];
  notifyOnDueToday: boolean;
  notifyDailyOverdue: boolean;
  notifyOnPartialPayment: boolean;
  notifyOnFullPayment: boolean;
  emailRemindersEnabled: boolean;
  updatedAt?: string;
}

export interface ErpNotification {
  id: string;
  userId: string;
  category: string;
  type:
    | "UPCOMING_DUE_REMINDER"
    | "DUE_TODAY"
    | "OVERDUE"
    | "PARTIAL_PAYMENT_RECORDED"
    | "FULL_PAYMENT_COMPLETED"
    | string;
  title: string;
  message: string;
  linkUrl?: string | null;
  supplierInvoiceId?: string | null;
  supplierId?: string | null;
  supplierPaymentId?: string | null;
  scheduledDateKey?: string | null;
  metadata?: any;
  isRead: boolean;
  readAt?: string | null;
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
  purchaseOrderId?: string | null;
  purchaseOrderNumber?: string | null;
  purchaseOrder?: any;
  invoiceDate: string;
  paymentDueDate?: string | null;
  paymentTerms?: string | null;
  creditPeriodDays?: number | null;
  paymentStatus?: SupplierPaymentStatus;
  paidAmount?: number;
  outstandingBalance?: number;
  lastPaymentDate?: string | null;
  isPartiallyPaid?: boolean;
  isOverdue?: boolean;
  countdown?: SupplierPaymentCountdown | null;
  paymentCount?: number;
  totalAmount: number;
  status: "APPROVED" | "PAID" | "CANCELLED" | string;
  notes?: string | null;
  budgetOverrideUsed?: boolean;
  budgetOverrideReason?: string | null;
  approvedJobValue?: number;
  totalJobSupplierCost?: number;
  remainingJobBudget?: number;
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  cancelledById?: string | null;
  cancelledByName?: string | null;
  createdById?: string | null;
  createdByName?: string | null;
  createdByEmail?: string | null;
  updatedById?: string | null;
  updatedByName?: string | null;
  items?: SupplierInvoiceItem[];
  attachments?: SupplierInvoiceAttachment[];
  auditLogs?: SupplierInvoiceAuditLog[];
  payments?: SupplierPayment[];
  paymentAuditLogs?: SupplierPaymentAuditLog[];
  createdAt: string;
  updatedAt: string;
}

// ─── Purchase Order Management ────────────────────────────────────────────────

export type PurchaseOrderStatus =
  | "DRAFT"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "ISSUED"
  | "CANCELLED"
  | string;

export type PurchaseOrderApprovalStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | string;

export interface Department {
  id: string;
  name: string;
  code?: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface PurchaseOrderSettings {
  id: string;
  companyName: string;
  companyAddress: string;
  companyRegNo?: string | null;
  companyEmail?: string | null;
  companyPhone?: string | null;
  defaultDeliverToName?: string | null;
  defaultDeliverToAddress?: string | null;
  defaultDeliverToEmail?: string | null;
  poNumberPrefix: string;
  financialYearCode: string;
  poNumberPadding: number;
  defaultSsclRate: number;
  defaultVatRate: number;
  defaultApplySscl: boolean;
  defaultApplyVat: boolean;
  defaultCurrency: string;
  defaultComments?: string | null;
  defaultTerms?: string | null;
  nextPoNumberPreview?: string;
}

export interface JobCostItemBudgetInfo {
  id: string;
  jobId: string;
  categoryId?: string | null;
  categoryName: string;
  itemNumber?: number | null;
  description: string;
  rcNrc?: string | null;
  quantity: number;
  rate: number;
  originalAmount: number;
  committedPoAmount: number;
  draftPoAmount: number;
  remainingBudget: number;
  isFullyAllocated: boolean;
}

export interface PurchaseOrderDepartmentAllocation {
  id: string;
  purchaseOrderId: string;
  purchaseOrderItemId?: string | null;
  departmentId: string;
  departmentName?: string;
  departmentCode?: string | null;
  allocatedQuantity: number;
  allocatedAmount: number;
  percentage: number;
  notes?: string | null;
}

export interface PurchaseOrderItem {
  id: string;
  purchaseOrderId: string;
  rowNumber: number;
  jobCostCategoryId?: string | null;
  jobCostCategoryName?: string | null;
  jobCostItemId?: string | null;
  particular: string;
  brand?: string | null;
  specifications?: string | null;
  quantity: number;
  measure: string;
  unitCost: number;
  totalAmount: number;
  invoicedQuantity: number;
  invoicedAmount: number;
  isAdditionalItem: boolean;
  budgetOverrideReason?: string | null;
  notes?: string | null;
  departmentAllocations?: PurchaseOrderDepartmentAllocation[];
}

export interface PurchaseOrderAttachment {
  id: string;
  purchaseOrderId: string;
  category: string;
  fileName: string;
  originalFileName?: string | null;
  storedFileName?: string | null;
  bucketName?: string | null;
  storagePath?: string | null;
  fileSize: string;
  fileType?: string | null;
  mimeType?: string | null;
  fileUrl: string;
  signedUrl?: string | null;
  createdAt: string;
}

export interface PurchaseOrderApprovalHistory {
  id: string;
  purchaseOrderId: string;
  userId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  action: string;
  previousStatus: string;
  newStatus: string;
  reason?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface PurchaseOrderAuditLog {
  id: string;
  purchaseOrderId: string;
  userId?: string | null;
  userName?: string | null;
  action: string;
  reason?: string | null;
  previousData?: any;
  newData?: any;
  createdAt: string;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  jobId: string;
  jobCode?: string;
  jobName?: string;
  clientName?: string;
  jobDate?: string;
  jobApprovedValue?: number;
  job?: any;
  supplierId: string;
  supplierCode?: string;
  supplierName?: string;
  supplierEmail?: string;
  supplierPhone?: string;
  supplierAddress?: string;
  supplierContactPerson?: string;
  supplier?: any;
  poDate: string;
  quotationRef?: string | null;
  expectedDeliveryDate?: string | null;
  deliverToName: string;
  deliverToAddress: string;
  deliverToEmail?: string | null;
  comments?: string | null;
  terms?: string | null;
  status: PurchaseOrderStatus;
  approvalStatus: PurchaseOrderApprovalStatus;
  subTotal: number;
  discountAmount: number;
  totalAfterDiscount: number;
  applySscl: boolean;
  ssclRate: number;
  ssclAmount: number;
  totalWithSscl: number;
  applyVat: boolean;
  vatRate: number;
  vatAmount: number;
  grandTotal: number;
  currency: string;
  hasDepartmentAllocation: boolean;
  departmentAllocationMode?: string | null;
  budgetOverrideApproved: boolean;
  budgetOverrideReason?: string | null;
  submittedById?: string | null;
  submittedByName?: string | null;
  submittedAt?: string | null;
  approvedById?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  rejectedById?: string | null;
  rejectedByName?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  issuedById?: string | null;
  issuedByName?: string | null;
  issuedAt?: string | null;
  cancelledById?: string | null;
  cancelledByName?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  createdById?: string | null;
  createdByName?: string | null;
  createdByEmail?: string | null;
  updatedById?: string | null;
  updatedByName?: string | null;
  deletedAt?: string | null;
  isDeleted?: boolean;
  items?: PurchaseOrderItem[];
  departmentAllocations?: PurchaseOrderDepartmentAllocation[];
  attachments?: PurchaseOrderAttachment[];
  approvalHistory?: PurchaseOrderApprovalHistory[];
  auditLogs?: PurchaseOrderAuditLog[];
  supplierInvoices?: SupplierInvoice[];
  invoicedTotal?: number;
  remainingUninvoiced?: number;
  itemCount?: number;
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
  originalEstimatedCost: number;
  totalSupplierCost: number;
  additionalExpenses: number;
  otherCosts: number;
  totalActualCost: number;
  costDifference: number;
  costSaving: number;
  costOverrun: number;
  grossProfit: number;
  profitMargin: number | null;
  financialStatus: "High Margin" | "Healthy" | "Low Margin" | "Over Budget" | "N/A";
  supplierInvoicesCount: number;
  additionalExpensesCount?: number;
  supplierPaidAmount?: number;
  supplierOutstandingBalance?: number;
  createdByName?: string;
  createdById?: string;
}

export interface DashboardStats {
  totalJobs: number;
  pendingJobs: number;
  approvedJobs: number;
  rejectedJobs: number;
  totalSuppliers: number;
  totalSupplierInvoices: number;
  totalSupplierInvoiceAmount: number;
  totalAdditionalExpenses?: number;
  jobsWithSupplierInvoices: number;
  jobsWithoutSupplierInvoices: number;
  totalActualJobCosts: number;
  totalApprovedJobValue: number;
  totalRecordedGrossProfit: number;
  pendingApprovalsCount: number;
  visibilityScope?: string;
  canViewFinancials?: boolean;
  employeeStats?: Array<{
    userId: string;
    name: string;
    email: string;
    jobCount: number;
    invoiceCount: number;
    totalInvoiceAmount: number;
  }>;
}
