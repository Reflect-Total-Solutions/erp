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
  initialSuppliers,
  initialInvoices,
  initialRoles,
  initialUsersAccess,
  initialAuditLogs,
} from "@/lib/mock-data";
import { ERPModule, Action, hasPermission } from "@/lib/permissions";

interface AdminDataContextType {
  // Access Control & RBAC
  currentRole: "admin" | "supervisor" | "employee";
  setCurrentRole: (role: "admin" | "supervisor" | "employee") => void;
  can: (module: ERPModule, action: Action) => boolean;

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

  // Job actions (CRUD with Soft Delete & Supabase sync)
  addJob: (job: Omit<Job, "id" | "createdAt" | "supplierIds"> & { supplierIds?: string[]; documents?: any[] }) => Job;
  updateJob: (id: string, updates: Partial<Job>) => void;
  deleteJob: (id: string) => void;
  softDeleteJob: (id: string) => void;
  restoreJob: (id: string) => void;
  permanentlyDeleteJob: (id: string) => void;
  refreshJobs: () => Promise<void>;
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
  addUserAccess: (user: Omit<UserAccess, "id" | "lastLogin"> & { id?: string }) => UserAccess;
  updateUserAccess: (id: string, updates: Partial<UserAccess> & { newPassword?: string }) => void;
  deleteUserAccess: (id: string) => boolean | void;
  softDeleteUserAccess: (id: string) => boolean | void;
  restoreUserAccess: (id: string) => void;
  permanentlyDeleteUserAccess: (id: string) => void;
  refreshUsers: () => Promise<void>;
  updateUserPermissions: (
    userId: string,
    permissions: Record<string, any>,
    resetToRoleDefault?: boolean
  ) => Promise<boolean>;
  refreshPermissions: () => Promise<void>;
  currentUserId?: string;

  // Persona & Dynamic Access Control
  activeUserId: string;
  setActiveUserId: (id: string) => void;
  activeUser?: UserAccess;
  switchToUser: (userId: string) => void;
  resetToAdminUser: () => void;
  isPreviewMode: boolean;

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
  const [jobs, setJobs] = useState<Job[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
  const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices);
  const [excelFiles, setExcelFiles] = useState<ExcelFile[]>([]);
  const [roles, setRoles] = useState<Role[]>(initialRoles);
  const [usersAccess, setUsersAccess] = useState<UserAccess[]>(initialUsersAccess);
  const [auditLogs, setAuditLogs] = useState<AccessAuditLog[]>(initialAuditLogs);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [currentRole, setCurrentRole] = useState<"admin" | "supervisor" | "employee">("admin");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [activeUserId, setActiveUserId] = useState<string>("");
  const [userPermissions, setUserPermissions] = useState<Record<string, Record<Action, boolean>> | null>(null);

  // Derive the active user persona
  const activeUser = useMemo(() => {
    if (!activeUserId) return undefined;
    return usersAccess.find((u) => u.id === activeUserId || u.email === activeUserId);
  }, [activeUserId, usersAccess]);

  // Is previewing another user
  const isPreviewMode = useMemo(() => {
    return Boolean(activeUserId && currentUserId && activeUserId !== currentUserId && activeUser);
  }, [activeUserId, currentUserId, activeUser]);

  // Load user's actual authenticated role and live PostgreSQL permissions from session
  React.useEffect(() => {
    let isMounted = true;
    const fetchSessionRole = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) return;
        const data = await res.json();
        if (data?.authenticated && data.user && isMounted) {
          setCurrentUserId(data.user.id);
          setActiveUserId((prev) => prev || data.user.id);
          if (data.user.roles?.[0]) {
            const primaryRole = String(data.user.roles[0]).toLowerCase();
            if (["admin", "supervisor", "employee"].includes(primaryRole)) {
              setCurrentRole(primaryRole as "admin" | "supervisor" | "employee");
            }
          }
          if (data.user.hasCustomPermissions && data.user.customPermissions) {
            setUserPermissions(data.user.customPermissions);
          } else {
            setUserPermissions(null);
          }
        }
      } catch {
        // keep default
      }
    };
    fetchSessionRole();
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch live role permissions policies from PostgreSQL database
  const fetchDbRolesPermissions = useCallback(async () => {
    try {
      const res = await fetch("/api/permissions");
      if (!res.ok) return;
      const data = await res.json();
      if (data?.success && Array.isArray(data.roles) && data.roles.length > 0) {
        setRoles((prev) =>
          prev.map((r) => {
            const dbR = data.roles.find(
              (item: any) =>
                item.id === r.id ||
                item.name.toLowerCase() === r.name.toLowerCase()
            );
            if (dbR && dbR.permissions) {
              return {
                ...r,
                permissions: {
                  ...r.permissions,
                  ...dbR.permissions,
                },
              };
            }
            return r;
          })
        );
      }
    } catch {
      // fallback
    }
  }, []);

  React.useEffect(() => {
    fetchDbRolesPermissions();
  }, [fetchDbRolesPermissions]);

  // Load custom saved roles policy from localStorage as instant cache
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem("erp_custom_roles_policy");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRoles(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Fully dynamic permission check: evaluates per-user overrides first, then live database role policies
  const can = useCallback(
    (module: ERPModule, action: Action): boolean => {
      const isPreviewing = Boolean(activeUserId && currentUserId && activeUserId !== currentUserId);
      const targetUser = isPreviewing
        ? usersAccess.find((u) => u.id === activeUserId || u.email === activeUserId)
        : usersAccess.find((u) => u.id === currentUserId || u.email === currentUserId);

      // 1. Direct custom user permissions (highest precedence)
      // A. If previewing another user
      if (isPreviewing && targetUser?.permissions) {
        const modPerm = (targetUser.permissions as any)?.[module];
        if (modPerm && typeof modPerm[action] === "boolean") {
          return modPerm[action];
        }
      }

      // B. If viewing as current user and current user has custom permissions
      if (!isPreviewing && userPermissions && userPermissions[module]) {
        if (typeof userPermissions[module][action] === "boolean") {
          return userPermissions[module][action];
        }
      }

      // If user has targetUser.permissions in usersAccess state but is not previewing
      if (!isPreviewing && targetUser?.permissions) {
        const modPerm = (targetUser.permissions as any)?.[module];
        if (modPerm && typeof modPerm[action] === "boolean") {
          return modPerm[action];
        }
      }

      // 2. Evaluate Role Policy
      let evalRole = currentRole;
      if (isPreviewing && targetUser) {
        if (targetUser.roleId === "role-admin" || targetUser.role === "admin") evalRole = "admin";
        else if (targetUser.roleId === "role-supervisor" || targetUser.role === "supervisor") evalRole = "supervisor";
        else evalRole = "employee";
      }

      const roleIdMap: Record<string, string> = {
        admin: "role-admin",
        supervisor: "role-supervisor",
        employee: "role-employer",
      };
      const targetRoleId = roleIdMap[evalRole] || "role-employer";

      const roleObj = roles.find(
        (r) =>
          r.id === targetRoleId ||
          r.name.toLowerCase() === evalRole.toLowerCase() ||
          (evalRole === "employee" && r.id === "role-employer")
      );

      if (roleObj && roleObj.permissions) {
        const modKey = module as keyof Role["permissions"];
        const perm = roleObj.permissions[modKey];
        if (perm && typeof perm[action] === "boolean") {
          return perm[action];
        }
      }

      return hasPermission(evalRole, module, action);
    },
    [activeUserId, currentUserId, currentRole, roles, userPermissions, usersAccess]
  );

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

  // Fetch and sync users from PostgreSQL database (no mock data)
  const fetchDbUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/users?status=all");
      if (!res.ok) return;
      const json = await res.json();
      if (json?.success && Array.isArray(json.data)) {
        setUsersAccess(json.data);
      }
    } catch {
      // Fallback
    }
  }, []);

  // Fetch and sync real security audit trail from PostgreSQL database
  const fetchDbAuditLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/audit");
      if (!res.ok) return;
      const json = await res.json();
      if (json?.success && Array.isArray(json.data)) {
        setAuditLogs(json.data);
      }
    } catch {
      // Fallback
    }
  }, []);

  // Fetch and sync jobs and documents from PostgreSQL database
  const fetchDbJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs?status=all");
      if (!res.ok) return;
      const json = await res.json();
      if (json?.success && Array.isArray(json.data)) {
        setJobs(json.data);
        // Collect and sync all job documents into excelFiles state
        const allDocs: ExcelFile[] = [];
        json.data.forEach((j: any) => {
          if (Array.isArray(j.documents)) {
            j.documents.forEach((d: any) => {
              allDocs.push({
                id: d.id,
                jobId: d.jobId,
                fileName: d.fileName,
                customName: d.customName || d.fileName,
                fileDate: d.fileDate,
                fileSize: d.fileSize,
                fileType: d.fileType,
                fileUrl: d.fileUrl,
                storagePath: d.storagePath,
                uploadDateTime: d.uploadDateTime || d.fileDate,
                status: d.status || "Processed",
              });
            });
          }
        });
        setExcelFiles(allDocs);
      }
    } catch {
      // Fallback
    }
  }, []);

  React.useEffect(() => {
    fetchDbJobs();
    fetchDbUsers();
    fetchDbAuditLogs();
  }, [fetchDbJobs, fetchDbUsers, fetchDbAuditLogs]);

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

  // Job Actions (Full CRUD with PostgreSQL & Supabase sync)
  const addJob = useCallback(
    (jobData: Omit<Job, "id" | "createdAt" | "supplierIds"> & { supplierIds?: string[]; documents?: any[] }): Job => {
      const tempId = "job-" + (Date.now().toString(36) + Math.random().toString(36).substring(2, 5));
      const dateStr = new Date().toISOString().split("T")[0];
      const newJob: Job = {
        ...jobData,
        id: tempId,
        jobCode: jobData.jobCode || `JOB-${new Date().getFullYear()}-${String(jobs.length + 1).padStart(3, "0")}`,
        createdAt: dateStr,
        supplierIds: jobData.supplierIds || [],
        isDeleted: false,
        documents: jobData.documents || [],
      };
      setJobs((prev) => [newJob, ...prev]);
      showToast("Job Created", `"${newJob.name}" has been initialized successfully.`, "success");

      // Persist to PostgreSQL database
      fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newJob.name,
          jobCode: newJob.jobCode,
          date: newJob.date,
          description: newJob.description,
          remarks: newJob.remarks,
          status: newJob.status,
          supplierIds: newJob.supplierIds,
          documents: jobData.documents || [],
        }),
      })
        .then(async (res) => {
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            showToast("Sync Error", err.error || "Failed to persist job to database.", "error");
            return;
          }
          const data = await res.json();
          if (data?.success && data.data) {
            setJobs((prev) => prev.map((j) => (j.id === tempId ? { ...j, ...data.data } : j)));
            if (Array.isArray(data.data.documents) && data.data.documents.length > 0) {
              setExcelFiles((prev) => [...data.data.documents, ...prev]);
            }
          }
        })
        .catch((err) => {
          console.error("Failed to persist job to DB:", err);
        });

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

      // Persist updates to PostgreSQL
      fetch(`/api/jobs/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })
        .then(async (res) => {
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            showToast("Update Failed", err.error || "Could not save updates to database.", "error");
          }
        })
        .catch((err) => console.error("Error updating job in DB:", err));
    },
    [showToast]
  );

  const softDeleteJob = useCallback(
    (id: string) => {
      const target = jobs.find((j) => j.id === id);
      setJobs((prev) =>
        prev.map((job) =>
          job.id === id ? { ...job, isDeleted: true, deletedAt: new Date().toISOString() } : job
        )
      );
      showToast(
        "Job Moved to Trash",
        target ? `"${target.name}" moved to trash. You can restore it anytime.` : "Job moved to trash.",
        "info"
      );

      fetch(`/api/jobs/${id}`, { method: "DELETE" }).catch((e) =>
        console.error("Error soft-deleting job in DB:", e)
      );
    },
    [jobs, showToast]
  );

  const deleteJob = softDeleteJob;

  const restoreJob = useCallback(
    (id: string) => {
      const target = jobs.find((j) => j.id === id);
      setJobs((prev) =>
        prev.map((job) => (job.id === id ? { ...job, isDeleted: false, deletedAt: null } : job))
      );
      showToast(
        "Job Restored",
        target ? `"${target.name}" has been restored to active jobs.` : "Job restored.",
        "success"
      );

      fetch(`/api/jobs/${id}/restore`, { method: "POST" }).catch((e) =>
        console.error("Error restoring job in DB:", e)
      );
    },
    [jobs, showToast]
  );

  const permanentlyDeleteJob = useCallback(
    (id: string) => {
      const target = jobs.find((j) => j.id === id);
      setJobs((prev) => prev.filter((j) => j.id !== id));
      setInvoices((prev) => prev.filter((inv) => inv.jobId !== id));
      setExcelFiles((prev) => prev.filter((xf) => xf.jobId !== id));
      showToast(
        "Job Permanently Removed",
        target ? `"${target.name}" and associated records permanently deleted.` : "Job removed.",
        "error"
      );

      fetch(`/api/jobs/${id}?permanent=true`, { method: "DELETE" }).catch((e) =>
        console.error("Error permanently deleting job from DB:", e)
      );
    },
    [jobs, showToast]
  );

  const refreshJobs = fetchDbJobs;

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
      // Prevent lockout: Admin role must keep accessControl view permission
      if (roleId === "role-admin" && moduleKey === "accessControl" && permKey === "view" && value === false) {
        showToast(
          "Safety Protection",
          "Administrator role must retain view access to Access Control to prevent lockout.",
          "error"
        );
        return;
      }

      let targetRolePerms: any = null;

      setRoles((prev) => {
        const next = prev.map((r) => {
          if (r.id !== roleId) return r;
          const updatedPerms = {
            ...r.permissions,
            [moduleKey]: {
              ...r.permissions[moduleKey],
              [permKey]: value,
            },
          };
          targetRolePerms = updatedPerms;
          return {
            ...r,
            permissions: updatedPerms,
          };
        });
        try {
          localStorage.setItem("erp_custom_roles_policy", JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });

      // Synchronize role permissions directly with PostgreSQL database
      if (targetRolePerms) {
        fetch("/api/permissions", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roleId,
            permissions: targetRolePerms,
          }),
        }).catch((e) => console.error("Error saving role permissions to PostgreSQL:", e));
      }

      showToast("Permissions Policy Updated", `Updated ${String(moduleKey)} permission for role in PostgreSQL.`, "info");
    },
    [showToast]
  );

  // Updates custom per-user permissions in PostgreSQL database
  const updateUserPermissions = useCallback(
    async (
      userId: string,
      permissions: Record<string, any>,
      resetToRoleDefault = false
    ): Promise<boolean> => {
      try {
        const res = await fetch(`/api/users/${userId}/permissions`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ permissions, resetToRoleDefault }),
        });
        const data = await res.json();
        if (!res.ok) {
          showToast("Update Failed", data.error || "Could not update user permissions.", "error");
          return false;
        }

        setUsersAccess((prev) =>
          prev.map((u) =>
            u.id === userId
              ? {
                  ...u,
                  permissions: resetToRoleDefault ? undefined : permissions,
                  hasCustomPermissions: !resetToRoleDefault,
                }
              : u
          )
        );

        if ((userId === currentUserId || userId === activeUserId) && data.effectivePermissions) {
          setUserPermissions(resetToRoleDefault ? null : permissions);
        }

        showToast(
          "Permissions Saved",
          data.message || "Permissions updated in PostgreSQL database and applied to UI.",
          "success"
        );
        return true;
      } catch (err) {
        console.error("Error updating user permissions:", err);
        showToast("Error", "Could not connect to database.", "error");
        return false;
      }
    },
    [currentUserId, activeUserId, showToast]
  );

  // Switch active persona / user view
  const switchToUser = useCallback(
    (userId: string) => {
      const target = usersAccess.find((u) => u.id === userId || u.email === userId);
      if (!target) return;
      setActiveUserId(target.id);

      if (target.roleId === "role-admin" || target.role === "admin") {
        setCurrentRole("admin");
      } else if (target.roleId === "role-supervisor" || target.role === "supervisor") {
        setCurrentRole("supervisor");
      } else {
        setCurrentRole("employee");
      }

      showToast(
        `Previewing as ${target.name}`,
        `Sidebar now reflects the exact access permissions assigned to ${target.name}.`,
        "info"
      );
    },
    [usersAccess, showToast]
  );

  // Reset to primary administrator persona
  const resetToAdminUser = useCallback(() => {
    setActiveUserId(currentUserId);
    setCurrentRole("admin");
    showToast("Admin View Restored", "Returned to primary Administrator view with full access.", "success");
  }, [currentUserId, showToast]);

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

  // User Access CRUD with Soft Delete and PostgreSQL API Sync
  const addUserAccess = useCallback(
    (userData: Omit<UserAccess, "id" | "lastLogin"> & { id?: string }): UserAccess => {
      const newUser: UserAccess = {
        ...userData,
        id: userData.id || ("usr-" + Date.now().toString(36)),
        lastLogin: "Never (Invited)",
        isDeleted: false,
        createdAt: new Date().toISOString().split("T")[0],
      };
      setUsersAccess((prev) => {
        const filtered = prev.filter(
          (u) => u.id !== newUser.id && u.email.toLowerCase() !== newUser.email.toLowerCase()
        );
        return [newUser, ...filtered];
      });
      showToast("User Account Created", `Account for "${newUser.name}" created successfully.`, "success");
      return newUser;
    },
    [showToast]
  );

  const updateUserAccess = useCallback(
    (id: string, updates: Partial<UserAccess> & { newPassword?: string }) => {
      setUsersAccess((prev) =>
        prev.map((u) => (u.id === id ? { ...u, ...updates } : u))
      );
      showToast("User Account Updated", "User profile and role settings saved.", "success");

      // Sync with PostgreSQL API
      const roleMap: Record<string, string> = {
        "role-admin": "admin",
        "role-supervisor": "supervisor",
        "role-employer": "employee",
      };
      const mappedRole = updates.roleId ? roleMap[updates.roleId] : undefined;

      fetch(`/api/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: updates.name,
          email: updates.email,
          phone: updates.phone,
          role: mappedRole,
          status: updates.status,
          newPassword: updates.newPassword,
        }),
      }).catch((e) => console.error("Error updating user in DB:", e));
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

      // Sync with PostgreSQL API
      fetch(`/api/users/${id}`, { method: "DELETE" }).catch((e) =>
        console.error("Error soft-deleting user in DB:", e)
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

      // Sync with PostgreSQL API
      fetch(`/api/users/${id}/restore`, { method: "POST" }).catch((e) =>
        console.error("Error restoring user in DB:", e)
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

      // Sync with PostgreSQL API
      fetch(`/api/users/${id}?permanent=true`, { method: "DELETE" }).catch((e) =>
        console.error("Error permanently deleting user from DB:", e)
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
      currentRole,
      setCurrentRole,
      can,
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
      softDeleteJob,
      restoreJob,
      permanentlyDeleteJob,
      refreshJobs,
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
      refreshUsers: fetchDbUsers,
      updateUserPermissions,
      refreshPermissions: fetchDbRolesPermissions,
      currentUserId,
      activeUserId,
      setActiveUserId,
      activeUser,
      switchToUser,
      resetToAdminUser,
      isPreviewMode,
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
      currentRole,
      setCurrentRole,
      can,
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
      softDeleteJob,
      restoreJob,
      permanentlyDeleteJob,
      refreshJobs,
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
      fetchDbUsers,
      updateUserPermissions,
      fetchDbRolesPermissions,
      currentUserId,
      activeUserId,
      setActiveUserId,
      activeUser,
      switchToUser,
      resetToAdminUser,
      isPreviewMode,
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
