"use client";

import React, { createContext, useContext, useState, useMemo, useCallback } from "react";
import {
  Job,
  Supplier,
  Invoice,
  ExcelFile,
  ToastNotification,
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

  // Supplier actions (CRUD with Soft Delete)
  addSupplier: (supplier: Omit<Supplier, "id" | "createdAt">) => Supplier;
  updateSupplier: (id: string, updates: Partial<Supplier>) => void;
  deleteSupplier: (id: string) => void;
  softDeleteSupplier: (id: string) => void;
  restoreSupplier: (id: string) => void;
  permanentlyDeleteSupplier: (id: string) => void;
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

  // Access Control / User Management Actions (CRUD with Soft Delete)
  updateRolePermission: (
    roleId: string,
    moduleKey: keyof Role["permissions"],
    permKey: "view" | "create" | "edit" | "delete" | "approve",
    value: boolean
  ) => void;
  addRole: (role: Omit<Role, "id">) => Role;
  addUserAccess: (user: Omit<UserAccess, "id" | "lastLogin">) => UserAccess;
  updateUserAccess: (id: string, updates: Partial<UserAccess>) => void;
  deleteUserAccess: (id: string) => boolean | void;
  softDeleteUserAccess: (id: string) => boolean | void;
  restoreUserAccess: (id: string) => void;
  permanentlyDeleteUserAccess: (id: string) => void;

  // Helpers & Derived Metrics
  getJobInvoices: (jobId: string) => Invoice[];
  getJobSuppliers: (jobId: string) => Supplier[];
  getJobExcelFiles: (jobId: string) => ExcelFile[];
  getJobTotalInvoiceValue: (jobId: string) => number;
  totalJobsCount: number;
  totalSuppliersCount: number;
  totalInvoicesCount: number;
  totalInvoiceValue: number;
  pendingApprovalsCount: number;
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

  // Initial load of suppliers from PostgreSQL database
  React.useEffect(() => {
    let isMounted = true;
    const fetchDbSuppliers = async () => {
      try {
        const res = await fetch("/api/suppliers?status=all");
        if (!res.ok) return;
        const json = await res.json();
        if (json?.success && Array.isArray(json.data) && isMounted) {
          if (json.data.length > 0) {
            setSuppliers(json.data);
          }
        }
      } catch {
        // Fallback to initialSuppliers if offline or API unreachable
      }
    };
    fetchDbSuppliers();
    return () => {
      isMounted = false;
    };
  }, []);

  // Toast System
  const showToast = useCallback(
    (title: string, message?: string, type: "success" | "error" | "info" = "info") => {
      const id = "toast-" + Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
      setToasts((prev) => [...prev, { id, title, message, type }]);

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Job Actions
  const addJob = useCallback(
    (jobData: Omit<Job, "id" | "createdAt" | "supplierIds"> & { supplierIds?: string[] }): Job => {
      const dateStr = new Date().toISOString().split("T")[0];
      const newJob: Job = {
        ...jobData,
        id: "job-" + (Date.now().toString(36) + Math.random().toString(36).substring(2, 5)),
        jobCode: jobData.jobCode || `JOB-${new Date().getFullYear()}-${String(jobs.length + 1).padStart(3, "0")}`,
        createdAt: dateStr,
        supplierIds: jobData.supplierIds || [],
      };
      setJobs((prev) => [newJob, ...prev]);
      showToast("Job Created", `"${newJob.name}" has been initialized successfully.`, "success");
      return newJob;
    },
    [jobs.length, showToast]
  );

  const updateJob = useCallback(
    (id: string, updates: Partial<Job>) => {
      setJobs((prev) =>
        prev.map((job) => (job.id === id ? { ...job, ...updates } : job))
      );
      showToast("Job Updated", "Job record has been updated successfully.", "info");
    },
    [showToast]
  );

  const deleteJob = useCallback(
    (id: string) => {
      const target = jobs.find((j) => j.id === id);
      setJobs((prev) => prev.filter((j) => j.id !== id));
      setInvoices((prev) => prev.filter((inv) => inv.jobId !== id));
      setExcelFiles((prev) => prev.filter((xf) => xf.jobId !== id));
      showToast(
        "Job Removed",
        target ? `"${target.name}" and associated records removed.` : "Job removed.",
        "error"
      );
    },
    [jobs, showToast]
  );

  const getJobById = useCallback(
    (id: string) => jobs.find((j) => j.id === id),
    [jobs]
  );

  // Supplier Actions with Soft Delete and PostgreSQL API Sync
  const addSupplier = useCallback(
    (supplierData: Omit<Supplier, "id" | "createdAt">): Supplier => {
      const tempId = "sup-" + (Date.now().toString(36) + Math.random().toString(36).substring(2, 5));
      const newSupplier: Supplier = {
        ...supplierData,
        id: tempId,
        createdAt: new Date().toISOString().split("T")[0],
        isDeleted: false,
      };

      // Optimistic update
      setSuppliers((prev) => [newSupplier, ...prev]);

      // Sync with PostgreSQL API
      fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(supplierData),
      })
        .then(async (res) => {
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || "Failed to persist supplier to database.");
          }
          return res.json();
        })
        .then((json) => {
          if (json?.data?.id) {
            // Replace temporary id with real database id
            setSuppliers((prev) =>
              prev.map((s) => (s.id === tempId ? { ...s, ...json.data } : s))
            );
          }
          showToast(
            "Supplier Registered",
            `${newSupplier.name} (${newSupplier.code}) saved to database.`,
            "success"
          );
        })
        .catch((err) => {
          showToast("Sync Error", err.message || "Could not save supplier.", "error");
        });

      return newSupplier;
    },
    [showToast]
  );

  const updateSupplier = useCallback(
    (id: string, updates: Partial<Supplier>) => {
      // Optimistic update
      setSuppliers((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
      );

      // Persist to PostgreSQL API
      fetch(`/api/suppliers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })
        .then(async (res) => {
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || "Failed to update supplier.");
          }
          return res.json();
        })
        .then((json) => {
          if (json?.data) {
            setSuppliers((prev) =>
              prev.map((s) => (s.id === id ? { ...s, ...json.data } : s))
            );
          }
          showToast("Supplier Updated", `${updates.name || "Supplier"} updated in database.`, "success");
        })
        .catch((err) => {
          showToast("Update Error", err.message || "Failed to update supplier.", "error");
        });
    },
    [showToast]
  );

  // Soft Delete Supplier
  const softDeleteSupplier = useCallback(
    (id: string) => {
      const target = suppliers.find((s) => s.id === id);
      if (!target) return;

      // Optimistic soft-delete
      setSuppliers((prev) =>
        prev.map((s) =>
          s.id === id
            ? { ...s, isDeleted: true, deletedAt: new Date().toISOString() }
            : s
        )
      );

      // Call API
      fetch(`/api/suppliers/${id}`, {
        method: "DELETE",
      })
        .then(async (res) => {
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || "Failed to archive supplier.");
          }
          return res.json();
        })
        .then(() => {
          showToast(
            "Supplier Archived",
            `"${target.name}" moved to trash. Associated invoices and jobs remain intact.`,
            "info"
          );
        })
        .catch((err) => {
          showToast("Archive Error", err.message || "Could not soft-delete supplier.", "error");
        });
    },
    [suppliers, showToast]
  );

  // Restore Soft-Deleted Supplier
  const restoreSupplier = useCallback(
    (id: string) => {
      const target = suppliers.find((s) => s.id === id);
      if (!target) return;

      // Optimistic restore
      setSuppliers((prev) =>
        prev.map((s) =>
          s.id === id
            ? { ...s, isDeleted: false, deletedAt: undefined }
            : s
        )
      );

      // Call API
      fetch(`/api/suppliers/${id}/restore`, {
        method: "POST",
      })
        .then(async (res) => {
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || "Failed to restore supplier.");
          }
          return res.json();
        })
        .then(() => {
          showToast(
            "Supplier Restored",
            `"${target.name}" has been restored to the active supplier registry.`,
            "success"
          );
        })
        .catch((err) => {
          // Revert optimistic update on failure
          setSuppliers((prev) =>
            prev.map((s) =>
              s.id === id
                ? { ...s, isDeleted: true, deletedAt: target.deletedAt }
                : s
            )
          );
          showToast("Restore Error", err.message || "Could not restore supplier.", "error");
        });
    },
    [suppliers, showToast]
  );

  // Permanently Delete Supplier
  const permanentlyDeleteSupplier = useCallback(
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

      fetch(`/api/suppliers/${id}?permanent=true`, {
        method: "DELETE",
      })
        .then(async (res) => {
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || "Failed to permanently purge supplier.");
          }
          return res.json();
        })
        .then(() => {
          showToast(
            "Supplier Permanently Deleted",
            target ? `"${target.name}" has been permanently purged.` : "Supplier purged.",
            "error"
          );
        })
        .catch((err) => {
          showToast("Purge Error", err.message || "Could not permanently delete.", "error");
        });
    },
    [suppliers, showToast]
  );

  // deleteSupplier defaults to safe soft-delete
  const deleteSupplier = softDeleteSupplier;

  const getSupplierById = useCallback(
    (id: string) => suppliers.find((s) => s.id === id),
    [suppliers]
  );

  const assignSupplierToJob = useCallback(
    (jobId: string, supplierId: string) => {
      const job = jobs.find((j) => j.id === jobId);
      if (!job) return { success: false, message: "Job not found" };

      const supplier = suppliers.find((s) => s.id === supplierId);
      if (!supplier || supplier.isDeleted) {
        showToast("Supplier Unavailable", "This supplier is archived and cannot be assigned.", "error");
        return { success: false, message: "Supplier is archived." };
      }

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

      showToast(
        "Supplier Assigned",
        `${supplier.name} assigned to job.`,
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
        `Invoice "${newInvoice.invoiceName}" added (Rs. ${newInvoice.totalValue.toLocaleString()}).`,
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
        `${createdInvoices.length} invoices uploaded successfully (Rs. ${totalAmount.toLocaleString()}).`,
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
      const target = invoices.find((i) => i.id === id);
      setInvoices((prev) => prev.filter((i) => i.id !== id));
      showToast(
        "Invoice Removed",
        target ? `Invoice "${target.invoiceName}" removed from records.` : "Invoice removed.",
        "error"
      );
    },
    [invoices, showToast]
  );

  // Excel Actions
  const addExcelFiles = useCallback(
    (filesData: Array<Omit<ExcelFile, "id" | "uploadDateTime">>) => {
      const now = new Date();
      const timeStr =
        now.toISOString().split("T")[0] +
        " " +
        now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

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

  // User Access CRUD with Soft Delete
  const addUserAccess = useCallback(
    (userData: Omit<UserAccess, "id" | "lastLogin">): UserAccess => {
      const newUser: UserAccess = {
        ...userData,
        id: "usr-" + Date.now().toString(36),
        lastLogin: "Never (Invited)",
        isDeleted: false,
        createdAt: new Date().toISOString().split("T")[0],
      };
      setUsersAccess((prev) => [newUser, ...prev]);
      showToast("User Account Created", `Account for "${newUser.name}" created successfully.`, "success");
      return newUser;
    },
    [showToast]
  );

  const updateUserAccess = useCallback(
    (id: string, updates: Partial<UserAccess>) => {
      setUsersAccess((prev) =>
        prev.map((u) => (u.id === id ? { ...u, ...updates } : u))
      );
      showToast("User Account Updated", "User profile and role settings saved.", "success");
    },
    [showToast]
  );

  const softDeleteUserAccess = useCallback(
    (id: string) => {
      const target = usersAccess.find((u) => u.id === id);
      if (!target) return false;

      // Protection: cannot delete the last active Administrator
      const activeAdmins = usersAccess.filter(
        (u) => u.roleId === "role-admin" && !u.isDeleted && u.status === "Active"
      );
      if (target.roleId === "role-admin" && activeAdmins.length <= 1) {
        showToast(
          "Action Prohibited",
          "Cannot deactivate or delete the last active Administrator account.",
          "error"
        );
        return false;
      }

      setUsersAccess((prev) =>
        prev.map((u) =>
          u.id === id
            ? { ...u, isDeleted: true, status: "Suspended", deletedAt: new Date().toISOString() }
            : u
        )
      );

      showToast(
        "User Deactivated",
        `User "${target.name}" deactivated (soft-deleted). Credentials revoked.`,
        "info"
      );
      return true;
    },
    [usersAccess, showToast]
  );

  const restoreUserAccess = useCallback(
    (id: string) => {
      const target = usersAccess.find((u) => u.id === id);
      if (!target) return;

      setUsersAccess((prev) =>
        prev.map((u) =>
          u.id === id
            ? { ...u, isDeleted: false, status: "Active", deletedAt: undefined }
            : u
        )
      );

      showToast(
        "User Reactivated",
        `User "${target.name}" account has been restored to active.`,
        "success"
      );
    },
    [usersAccess, showToast]
  );

  const permanentlyDeleteUserAccess = useCallback(
    (id: string) => {
      const target = usersAccess.find((u) => u.id === id);
      if (target?.roleId === "role-admin") {
        const activeAdmins = usersAccess.filter(
          (u) => u.roleId === "role-admin" && !u.isDeleted
        );
        if (activeAdmins.length <= 1) {
          showToast(
            "Action Prohibited",
            "Cannot permanently delete the last Administrator account.",
            "error"
          );
          return;
        }
      }

      setUsersAccess((prev) => prev.filter((u) => u.id !== id));
      showToast(
        "User Account Purged",
        target ? `"${target.name}" permanently deleted.` : "User permanently deleted.",
        "error"
      );
    },
    [usersAccess, showToast]
  );

  const deleteUserAccess = softDeleteUserAccess;

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
  // Active suppliers count
  const totalSuppliersCount = useMemo(
    () => suppliers.filter((s) => !s.isDeleted).length,
    [suppliers]
  );
  const totalInvoicesCount = invoices.length;
  const totalInvoiceValue = useMemo(() => {
    return invoices.reduce((acc, curr) => acc + curr.totalValue, 0);
  }, [invoices]);

  const pendingApprovalsCount = useMemo(() => {
    const invCount = invoices.filter((i) => i.status === "Pending" || i.status === "Under Review").length;
    const jobCount = jobs.filter((j) => j.status === "Pending" || j.status === "In Review").length;
    return invCount + jobCount;
  }, [invoices, jobs]);

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
      softDeleteSupplier,
      restoreSupplier,
      permanentlyDeleteSupplier,
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
      softDeleteUserAccess,
      restoreUserAccess,
      permanentlyDeleteUserAccess,
      getJobInvoices,
      getJobSuppliers,
      getJobExcelFiles,
      getJobTotalInvoiceValue,
      totalJobsCount,
      totalSuppliersCount,
      totalInvoicesCount,
      totalInvoiceValue,
      pendingApprovalsCount,
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
      softDeleteSupplier,
      restoreSupplier,
      permanentlyDeleteSupplier,
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
      softDeleteUserAccess,
      restoreUserAccess,
      permanentlyDeleteUserAccess,
      getJobInvoices,
      getJobSuppliers,
      getJobExcelFiles,
      getJobTotalInvoiceValue,
      totalJobsCount,
      totalSuppliersCount,
      totalInvoicesCount,
      totalInvoiceValue,
      pendingApprovalsCount,
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
