export type JobStatus = "Active" | "Pending" | "Completed" | "In Review";

export type InvoiceStatus = "Paid" | "Pending" | "Approved" | "Under Review";

export type ExcelFileStatus = "Processed" | "Uploaded" | "Analyzing";

export interface Job {
  id: string;
  jobCode?: string;
  name: string;
  date: string;
  description?: string;
  remarks?: string;
  status: JobStatus;
  supplierIds: string[];
  createdAt: string;
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
}

export interface ExcelFile {
  id: string;
  jobId: string;
  fileName: string;
  customName?: string;
  fileDate?: string;
  fileSize: string;
  uploadDateTime: string;
  status: ExcelFileStatus;
}

export interface InvoiceAttachment {
  id: string;
  fileName: string;
  fileSize: string;
  fileType: "pdf" | "image";
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
    accessControl: ModulePermission;
  };
}

export type UserStatus = "Active" | "Suspended" | "Pending";

export interface UserAccess {
  id: string;
  name: string;
  email: string;
  department: string;
  roleId: string;
  status: UserStatus;
  lastLogin: string;
}

export interface AccessAuditLog {
  id: string;
  user: string;
  action: string;
  target: string;
  timestamp: string;
  ipAddress: string;
}
