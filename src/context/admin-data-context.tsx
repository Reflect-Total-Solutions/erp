"use client";

import React, { createContext, useContext, useState, useMemo, useCallback } from "react";
import {
  Job,
  Supplier,
  Invoice,
  ExcelFile,
  ToastNotification,
  JobStatus,
  InvoiceStatus,
  Role,
  UserAccess,
  AccessAuditLog,
} from "@/types/admin";
import {
  initialJobs,
  initialSuppliers,
  initialInvoices,
  initialExcelFiles,
  initialRoles,
  initialUsersAccess,
  initialAuditLogs,
} from "@/lib/mock-data";

interface AdminDataContextType {
  // State
  jobs: Job[];
  suppliers: Supplier[];
  invoices: Invoice[];
  excelFiles: ExcelFile[];
  toasts: ToastNotification[];
  roles: Role[];
  usersAccess: UserAccess[];
  auditLogs: AccessAuditLog[];

  // Toast actions
  showToast: (title: string, message?: string, type?: "success" | "error" | "info") => void;
  removeToast: (id: string) => void;

  // Job actions
  addJob: (job: Omit<Job, "id" | "createdAt" | "supplierIds"> & { supplierIds?: string[] }) => Job;
  updateJob: (id: string, updates: Partial<Job>) => void;
  deleteJob: (id: string) => void;
  getJobById: (id: string) => Job | undefined;

  // Supplier actions
  addSupplier: (supplier: Omit<Supplier, "id" | "createdAt">) => Supplier;
  updateSupplier: (id: string, updates: Partial<Supplier>) => void;
  deleteSupplier: (id: string) => void;
  getSupplierById: (id: string) => Supplier | undefined;
  assignSupplierToJob: (jobId: string, supplierId: string) => { success: boolean; message?: string };
  removeSupplierFromJob: (jobId: string, supplierId: string) => void;

  // Invoice actions
  addInvoice: (invoice: Omit<Invoice, "id" | "uploadDate">) => Invoice;
  addBulkInvoices: (newInvoices: Array<Omit<Invoice, "id" | "uploadDate">>) => void;
  updateInvoice: (id: string, updates: Partial<Invoice>) => void;
  deleteInvoice: (id: string) => void;

  // Excel actions
  addExcelFiles: (files: Array<Omit<ExcelFile, "id" | "uploadDateTime">>) => void;
  removeExcelFile: (id: string) => void;

  // Access Control Actions
  updateRolePermission: (
    roleId: string,
    moduleKey: keyof Role["permissions"],
    permKey: "view" | "create" | "edit" | "delete" | "approve",
    value: boolean
  ) => void;
  addRole: (role: Omit<Role, "id">) => Role;
  addUserAccess: (user: Omit<UserAccess, "id" | "lastLogin">) => UserAccess;
  updateUserAccess: (id: string, updates: Partial<UserAccess>) => void;
  deleteUserAccess: (id: string) => void;

  // Helpers & Derived Metrics
  getJobInvoices: (jobId: string) => Invoice[];
  getJobSuppliers: (jobId: string) => Supplier[];
  getJobExcelFiles: (jobId: string) => ExcelFile[];
  getJobTotalInvoiceValue: (jobId: string) => number;
  totalJobsCount: number;
  totalSuppliersCount: number;
  totalInvoicesCount: number;
  totalInvoiceValue: number;
}

const AdminDataContext = createContext<AdminDataContextType | undefined>(undefined);

export function AdminDataProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
  const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices);
  const [excelFiles, setExcelFiles] = useState<ExcelFile[]>(initialExcelFiles);
  const [roles, setRoles] = useState<Role[]>(initialRoles);
  const [usersAccess, setUsersAccess] = useState<UserAccess[]>(initialUsersAccess);
  const [auditLogs, setAuditLogs] = useState<AccessAuditLog[]>(initialAuditLogs);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  // Toast handler
  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (title: string, message?: string, type: "success" | "error" | "info" = "success") => {
      const id = "toast-" + Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, title, message, type }]);

      setTimeout(() => {
        removeToast(id);
      }, 4000);
    },
    [removeToast]
  );

  // Job Actions
  const addJob = useCallback(
    (jobData: Omit<Job, "id" | "createdAt" | "supplierIds"> & { supplierIds?: string[] }): Job => {
      const newJob: Job = {
        ...jobData,
        id: "job-" + (Date.now().toString(36) + Math.random().toString(36).substring(2, 5)),
        supplierIds: jobData.supplierIds || [],
        createdAt: new Date().toISOString().split("T")[0],
      };
      setJobs((prev) => [newJob, ...prev]);
      showToast("Job Created", `"${newJob.name}" has been created successfully.`, "success");
      return newJob;
    },
    [showToast]
  );

  const updateJob = useCallback(
    (id: string, updates: Partial<Job>) => {
      setJobs((prev) =>
        prev.map((j) => (j.id === id ? { ...j, ...updates } : j))
      );
      showToast("Job Updated", "Job details have been updated.", "info");
    },
    [showToast]
  );

  const deleteJob = useCallback(
    (id: string) => {
      const target = jobs.find((j) => j.id === id);
      setJobs((prev) => prev.filter((j) => j.id !== id));
      // Cascade cleanup
      setInvoices((prev) => prev.filter((inv) => inv.jobId !== id));
      setExcelFiles((prev) => prev.filter((xf) => xf.jobId !== id));
      showToast("Job Deleted", target ? `"${target.name}" and associated records removed.` : "Job removed.", "error");
    },
    [jobs, showToast]
  );

  const getJobById = useCallback(
    (id: string) => jobs.find((j) => j.id === id),
    [jobs]
  );

  // Supplier Actions
  const addSupplier = useCallback(
    (supplierData: Omit<Supplier, "id" | "createdAt">): Supplier => {
      const newSupplier: Supplier = {
        ...supplierData,
        id: "sup-" + (Date.now().toString(36) + Math.random().toString(36).substring(2, 5)),
        createdAt: new Date().toISOString().split("T")[0],
      };
      setSuppliers((prev) => [newSupplier, ...prev]);
      showToast("Supplier Registered", `${newSupplier.name} (${newSupplier.code}) registered successfully.`, "success");
      return newSupplier;
    },
    [showToast]
  );

  const updateSupplier = useCallback(
    (id: string, updates: Partial<Supplier>) => {
      setSuppliers((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
      );
      showToast("Supplier Updated", "Supplier information updated.", "info");
    },
    [showToast]
  );

  const deleteSupplier = useCallback(
    (id: string) => {
      const target = suppliers.find((s) => s.id === id);
      setSuppliers((prev) => prev.filter((s) => s.id !== id));
      // Remove from all jobs
      setJobs((prev) =>
        prev.map((job) => ({
          ...job,
          supplierIds: job.supplierIds.filter((sId) => sId !== id),
        }))
      );
      showToast("Supplier Removed", target ? `${target.name} has been unregistered.` : "Supplier removed.", "error");
    },
    [suppliers, showToast]
  );

  const getSupplierById = useCallback(
    (id: string) => suppliers.find((s) => s.id === id),
    [suppliers]
  );

  const assignSupplierToJob = useCallback(
    (jobId: string, supplierId: string) => {
      const job = jobs.find((j) => j.id === jobId);
      if (!job) return { success: false, message: "Job not found" };

      if (job.supplierIds.includes(supplierId)) {
        showToast("Supplier Already Assigned", "This supplier is already assigned to this job.", "info");
        return { success: false, message: "Supplier is already assigned to this job." };
      }

      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? { ...j, supplierIds: [...j.supplierIds, supplierId] }
            : j
        )
      );

      const supplier = suppliers.find((s) => s.id === supplierId);
      showToast(
        "Supplier Assigned",
        `${supplier ? supplier.name : "Supplier"} assigned to job.`,
        "success"
      );
      return { success: true };
    },
    [jobs, suppliers, showToast]
  );

  const removeSupplierFromJob = useCallback(
    (jobId: string, supplierId: string) => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? { ...j, supplierIds: j.supplierIds.filter((id) => id !== supplierId) }
            : j
        )
      );
      const supplier = suppliers.find((s) => s.id === supplierId);
      showToast(
        "Supplier Unassigned",
        `${supplier ? supplier.name : "Supplier"} removed from this job.`,
        "info"
      );
    },
    [suppliers, showToast]
  );

  // Invoice Actions
  const addInvoice = useCallback(
    (invoiceData: Omit<Invoice, "id" | "uploadDate">): Invoice => {
      const newInvoice: Invoice = {
        ...invoiceData,
        id: "inv-" + (Date.now().toString(36) + Math.random().toString(36).substring(2, 5)),
        uploadDate: new Date().toISOString().split("T")[0],
      };
      setInvoices((prev) => [newInvoice, ...prev]);
      showToast(
        "Invoice Uploaded",
        `Invoice "${newInvoice.invoiceName}" added (${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(newInvoice.totalValue)}).`,
        "success"
      );
      return newInvoice;
    },
    [showToast]
  );

  const addBulkInvoices = useCallback(
    (newInvoicesData: Array<Omit<Invoice, "id" | "uploadDate">>) => {
      const today = new Date().toISOString().split("T")[0];
      const createdInvoices: Invoice[] = newInvoicesData.map((inv, idx) => ({
        ...inv,
        id: "inv-" + (Date.now().toString(36) + idx + Math.random().toString(36).substring(2, 5)),
        uploadDate: today,
      }));

      setInvoices((prev) => [...createdInvoices, ...prev]);
      const totalAmount = createdInvoices.reduce((acc, curr) => acc + curr.totalValue, 0);
      showToast(
        "Bulk Invoices Uploaded",
        `${createdInvoices.length} invoices uploaded successfully (${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(totalAmount)}).`,
        "success"
      );
    },
    [showToast]
  );

  const updateInvoice = useCallback(
    (id: string, updates: Partial<Invoice>) => {
      setInvoices((prev) =>
        prev.map((inv) => (inv.id === id ? { ...inv, ...updates } : inv))
      );
      showToast("Invoice Updated", "Invoice details saved successfully.", "info");
    },
    [showToast]
  );

  const deleteInvoice = useCallback(
    (id: string) => {
      setInvoices((prev) => prev.filter((inv) => inv.id !== id));
      showToast("Invoice Deleted", "Invoice record has been deleted.", "error");
    },
    [showToast]
  );

  // Excel File Actions
  const addExcelFiles = useCallback(
    (filesData: Array<Omit<ExcelFile, "id" | "uploadDateTime">>) => {
      const now = new Date();
      const timeStr = now.toLocaleDateString("en-US") + " " + now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      const newFiles: ExcelFile[] = filesData.map((f, idx) => ({
        ...f,
        id: "xl-" + (Date.now().toString(36) + idx),
        uploadDateTime: timeStr,
      }));

      setExcelFiles((prev) => [...newFiles, ...prev]);
      showToast(
        "Excel Files Added",
        `${newFiles.length} Excel file${newFiles.length > 1 ? "s" : ""} added to job.`,
        "success"
      );
    },
    [showToast]
  );

  const removeExcelFile = useCallback(
    (id: string) => {
      setExcelFiles((prev) => prev.filter((f) => f.id !== id));
      showToast("File Removed", "Excel file removed from job records.", "info");
    },
    [showToast]
  );

  // Access Control Actions
  const updateRolePermission = useCallback(
    (
      roleId: string,
      moduleKey: keyof Role["permissions"],
      permKey: "view" | "create" | "edit" | "delete" | "approve",
      value: boolean
    ) => {
      setRoles((prev) =>
        prev.map((r) => {
          if (r.id !== roleId) return r;
          return {
            ...r,
            permissions: {
              ...r.permissions,
              [moduleKey]: {
                ...r.permissions[moduleKey],
                [permKey]: value,
              },
            },
          };
        })
      );
      showToast("Permissions Policy Updated", `Updated ${String(moduleKey)} permission for role.`, "info");
    },
    [showToast]
  );

  const addRole = useCallback(
    (roleData: Omit<Role, "id">): Role => {
      const newRole: Role = {
        ...roleData,
        id: "role-" + Date.now().toString(36),
      };
      setRoles((prev) => [...prev, newRole]);
      showToast("Role Created", `"${newRole.name}" created successfully.`, "success");
      return newRole;
    },
    [showToast]
  );

  const addUserAccess = useCallback(
    (userData: Omit<UserAccess, "id" | "lastLogin">): UserAccess => {
      const newUser: UserAccess = {
        ...userData,
        id: "usr-" + Date.now().toString(36),
        lastLogin: "Never (Invited)",
      };
      setUsersAccess((prev) => [newUser, ...prev]);
      showToast("User Invited", `${newUser.name} added to access control list.`, "success");
      return newUser;
    },
    [showToast]
  );

  const updateUserAccess = useCallback(
    (id: string, updates: Partial<UserAccess>) => {
      setUsersAccess((prev) =>
        prev.map((u) => (u.id === id ? { ...u, ...updates } : u))
      );
      showToast("User Access Updated", "Permissions and status updated.", "info");
    },
    [showToast]
  );

  const deleteUserAccess = useCallback(
    (id: string) => {
      setUsersAccess((prev) => prev.filter((u) => u.id !== id));
      showToast("Access Revoked", "User removed from system.", "error");
    },
    [showToast]
  );

  // Helpers & Derived Metrics
  const getJobInvoices = useCallback(
    (jobId: string) => invoices.filter((inv) => inv.jobId === jobId),
    [invoices]
  );

  const getJobSuppliers = useCallback(
    (jobId: string) => {
      const job = jobs.find((j) => j.id === jobId);
      if (!job) return [];
      return suppliers.filter((s) => job.supplierIds.includes(s.id));
    },
    [jobs, suppliers]
  );

  const getJobExcelFiles = useCallback(
    (jobId: string) => excelFiles.filter((xf) => xf.jobId === jobId),
    [excelFiles]
  );

  const getJobTotalInvoiceValue = useCallback(
    (jobId: string) => {
      const jobInvs = invoices.filter((inv) => inv.jobId === jobId);
      return jobInvs.reduce((acc, curr) => acc + curr.totalValue, 0);
    },
    [invoices]
  );

  const totalJobsCount = jobs.length;
  const totalSuppliersCount = suppliers.length;
  const totalInvoicesCount = invoices.length;
  const totalInvoiceValue = useMemo(() => {
    return invoices.reduce((acc, curr) => acc + curr.totalValue, 0);
  }, [invoices]);

  const value = useMemo(
    () => ({
      jobs,
      suppliers,
      invoices,
      excelFiles,
      roles,
      usersAccess,
      auditLogs,
      toasts,
      showToast,
      removeToast,
      addJob,
      updateJob,
      deleteJob,
      getJobById,
      addSupplier,
      updateSupplier,
      deleteSupplier,
      getSupplierById,
      assignSupplierToJob,
      removeSupplierFromJob,
      addInvoice,
      addBulkInvoices,
      updateInvoice,
      deleteInvoice,
      addExcelFiles,
      removeExcelFile,
      updateRolePermission,
      addRole,
      addUserAccess,
      updateUserAccess,
      deleteUserAccess,
      getJobInvoices,
      getJobSuppliers,
      getJobExcelFiles,
      getJobTotalInvoiceValue,
      totalJobsCount,
      totalSuppliersCount,
      totalInvoicesCount,
      totalInvoiceValue,
    }),
    [
      jobs,
      suppliers,
      invoices,
      excelFiles,
      roles,
      usersAccess,
      auditLogs,
      toasts,
      showToast,
      removeToast,
      addJob,
      updateJob,
      deleteJob,
      getJobById,
      addSupplier,
      updateSupplier,
      deleteSupplier,
      getSupplierById,
      assignSupplierToJob,
      removeSupplierFromJob,
      addInvoice,
      addBulkInvoices,
      updateInvoice,
      deleteInvoice,
      addExcelFiles,
      removeExcelFile,
      updateRolePermission,
      addRole,
      addUserAccess,
      updateUserAccess,
      deleteUserAccess,
      getJobInvoices,
      getJobSuppliers,
      getJobExcelFiles,
      getJobTotalInvoiceValue,
      totalJobsCount,
      totalSuppliersCount,
      totalInvoicesCount,
      totalInvoiceValue,
    ]
  );

  return (
    <AdminDataContext.Provider value={value}>
      {children}
    </AdminDataContext.Provider>
  );
}

export function useAdminData() {
  const context = useContext(AdminDataContext);
  if (!context) {
    throw new Error("useAdminData must be used within an AdminDataProvider");
  }
  return context;
}
