import { Job, Supplier, ExcelFile, Invoice, Role, UserAccess, AccessAuditLog } from "@/types/admin";

export const initialSuppliers: Supplier[] = [
  {
    id: "sup-1",
    code: "SUP-01",
    name: "ABC Electricals",
    contactPerson: "John Smith",
    phone: "077 123 4567",
    email: "john@abcelectricals.com",
    address: "123 Main Street, Colombo 03",
    createdAt: "2026-09-01",
    isDeleted: false,
  },
  {
    id: "sup-2",
    code: "SUP-02",
    name: "BuildTech Materials",
    contactPerson: "Sarah Perera",
    phone: "071 987 6543",
    email: "sarah@buildtech.com",
    address: "45 Industrial Zone, Kaduwela",
    createdAt: "2026-09-05",
    isDeleted: false,
  },
  {
    id: "sup-3",
    code: "SUP-03",
    name: "City Transport & Cargo",
    contactPerson: "Kamal Fernando",
    phone: "076 555 4321",
    email: "kamal@citycargo.com",
    address: "88 Harbor Road, Colombo 13",
    createdAt: "2026-09-10",
    isDeleted: false,
  },
  {
    id: "sup-4",
    code: "SUP-04",
    name: "Prime Hardware Ltd",
    contactPerson: "David Silva",
    phone: "072 333 8899",
    email: "david@primehardware.lk",
    address: "12 Station Road, Kelaniya",
    createdAt: "2026-09-15",
    isDeleted: false,
  },
  {
    id: "sup-5",
    code: "SUP-05",
    name: "CoolAir HVAC Solutions",
    contactPerson: "Nimal Jayasinghe",
    phone: "075 222 1100",
    email: "nimal@coolair.com",
    address: "74 High Level Road, Nugegoda",
    createdAt: "2026-09-20",
    isDeleted: false,
  },
];

export const initialJobs: Job[] = [];

export const initialExcelFiles: ExcelFile[] = [];

export const initialInvoices: Invoice[] = [];

export const initialRoles: Role[] = [
  {
    id: "role-admin",
    name: "Admin",
    description: "Full, unrestricted access across all ERP modules, configuration, and security controls.",
    color: "purple",
    isSystem: true,
    permissions: {
      dashboard: { view: true, create: true, edit: true, delete: true, approve: true },
      jobs: { view: true, create: true, edit: true, delete: true, approve: true },
      excelUploads: { view: true, create: true, edit: true, delete: true, approve: true },
      invoices: { view: true, create: true, edit: true, delete: true, approve: true },
      suppliers: { view: true, create: true, edit: true, delete: true, approve: true },
      approvals: { view: true, create: true, edit: true, delete: true, approve: true },
      auditController: { view: true, create: true, edit: true, delete: true, approve: true },
      accessControl: { view: true, create: true, edit: true, delete: true, approve: true },
    },
  },
  {
    id: "role-supervisor",
    name: "Supervisor",
    description: "Operational management, job scheduling, approvals, and field workforce supervision.",
    color: "blue",
    permissions: {
      dashboard: { view: true, create: false, edit: false, delete: false, approve: true },
      jobs: { view: true, create: true, edit: true, delete: false, approve: true },
      excelUploads: { view: true, create: true, edit: true, delete: false, approve: true },
      invoices: { view: true, create: true, edit: true, delete: false, approve: true },
      suppliers: { view: true, create: true, edit: true, delete: false, approve: false },
      approvals: { view: true, create: false, edit: false, delete: false, approve: true },
      auditController: { view: false, create: false, edit: false, delete: false, approve: false },
      accessControl: { view: false, create: false, edit: false, delete: false, approve: false },
    },
  },
  {
    id: "role-employer",
    name: "Employee",
    description: "Staff and contractor workforce operations; job execution, invoice view, and task updates.",
    color: "emerald",
    permissions: {
      dashboard: { view: true, create: false, edit: false, delete: false, approve: false },
      jobs: { view: true, create: false, edit: false, delete: false, approve: false },
      excelUploads: { view: true, create: true, edit: false, delete: false, approve: false },
      invoices: { view: true, create: true, edit: false, delete: false, approve: false },
      suppliers: { view: false, create: false, edit: false, delete: false, approve: false },
      approvals: { view: false, create: false, edit: false, delete: false, approve: false },
      auditController: { view: false, create: false, edit: false, delete: false, approve: false },
      accessControl: { view: false, create: false, edit: false, delete: false, approve: false },
    },
  },
];

export const initialUsersAccess: UserAccess[] = [];

export const initialAuditLogs: AccessAuditLog[] = [];
