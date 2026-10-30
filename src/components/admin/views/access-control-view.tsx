"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Shield,
  ShieldAlert,
  KeyRound,
  Users,
  UserPlus,
  Plus,
  Search,
  Lock,
  Check,
  X,
  AlertCircle,
  AlertTriangle,
  Trash2,
  Edit2,
  RotateCcw,
  LayoutDashboard,
  Briefcase,
  FileSpreadsheet,
  FileText,
  Building2,
  Clock,
  Filter,
  CheckCircle2,
  Sliders,
  Mail,
  UserCheck,
  UserX,
  Archive,
  Phone,
  Copy,
  Loader2,
  ClipboardCheck,
  Eye,
  EyeOff,
  RefreshCw,
} from "lucide-react";
import { useAdminData } from "@/context/admin-data-context";
import { Modal } from "@/components/admin/ui/modal";
import { Pagination } from "@/components/admin/ui/pagination";
import { SearchField } from "@/components/admin/ui/search-field";
import { Role, UserAccess, UserStatus } from "@/types/admin";
import { userCreateSchema } from "@/lib/validations/user";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions";
import { generateSecurePassword } from "@/lib/password-generator";

export function AccessControlView() {
  const {
    roles,
    usersAccess,
    auditLogs,
    updateRolePermission,
    addUserAccess,
    updateUserAccess,
    softDeleteUserAccess,
    restoreUserAccess,
    permanentlyDeleteUserAccess,
    refreshUsers,
    updateUserPermissions,
    showToast,
    can,
    currentRole,
    activeUserId,
    switchToUser,
    resetToAdminUser,
    isPreviewMode,
  } = useAdminData();

  // Sync users with PostgreSQL database on view mount
  React.useEffect(() => {
    refreshUsers();
  }, [refreshUsers]);

  // Active Tab: "users" | "matrix" | "audit" (Default to "users" as requested)
  const [activeTab, setActiveTab] = useState<"users" | "matrix" | "audit">("users");

  // Users Sub-view: "active" | "deactivated"
  const [userStatusTab, setUserStatusTab] = useState<"active" | "deactivated">("active");

  // Selected Role for Permissions Matrix
  const [selectedRoleId, setSelectedRoleId] = useState<string>(roles[0]?.id || "role-admin");
  const selectedRole = roles.find((r) => r.id === selectedRoleId) || roles[0];

  // Search & Filters for Users Tab
  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");

  // Pagination states for Users
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(10);

  // Search & Pagination for Audit Tab
  const [auditSearch, setAuditSearch] = useState("");
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(10);

  // Modals state
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccess | null>(null);
  const [softDeletingUser, setSoftDeletingUser] = useState<UserAccess | null>(null);
  const [permanentDeletingUser, setPermanentDeletingUser] = useState<UserAccess | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{
    name: string;
    email: string;
    temporaryPassword?: string;
    role: string;
    emailDelivered?: boolean;
    emailNotice?: string;
  } | null>(null);
  const [showCreatedPassword, setShowCreatedPassword] = useState(true);
  const [copiedPassword, setCopiedPassword] = useState(false);

  // Reset Password Modal State
  const [resetPasswordUser, setResetPasswordUser] = useState<UserAccess | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [showResetPasswordValue, setShowResetPasswordValue] = useState(true);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetPasswordCopied, setResetPasswordCopied] = useState(false);
  const [resetPasswordSuccess, setResetPasswordSuccess] = useState(false);

  // Create User form state (Strictly: Employee, Supervisor, Admin)
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPhone, setNewUserPhone] = useState("");
  const [newUserRoleId, setNewUserRoleId] = useState("role-employer");
  const [newUserStatus, setNewUserStatus] = useState<UserStatus>("Active");
  const [userFormErrors, setUserFormErrors] = useState<Record<string, string>>({});
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  // Edit User form state
  const [editUserName, setEditUserName] = useState("");
  const [editUserEmail, setEditUserEmail] = useState("");
  const [editUserPhone, setEditUserPhone] = useState("");
  const [editUserRoleId, setEditUserRoleId] = useState("role-employer");
  const [editUserStatus, setEditUserStatus] = useState<UserStatus>("Active");
  const [editNewPassword, setEditNewPassword] = useState("");
  const [editUserErrors, setEditUserErrors] = useState<Record<string, string>>({});

  // Allowed 3 Roles strictly
  const allowedRoles = useMemo(() => {
    return roles.filter((r) =>
      ["role-admin", "role-supervisor", "role-employer"].includes(r.id)
    );
  }, [roles]);

  // Modules metadata definition for Permissions Matrix & User Permissions
  const modulesList: Array<{
    key: keyof Role["permissions"];
    title: string;
    description: string;
    icon: React.ElementType;
  }> = useMemo(
    () => [
      {
        key: "dashboard",
        title: "Executive Dashboard",
        description: "KPI summary cards, expenditure metrics, and operational overviews",
        icon: LayoutDashboard,
      },
      {
        key: "jobs",
        title: "Jobs & Work Orders",
        description: "Project scheduling, vendor assignment, and job descriptions",
        icon: Briefcase,
      },
      {
        key: "suppliers",
        title: "Supplier Registry",
        description: "Subcontractor contact information, trade vendor verification",
        icon: Building2,
      },
      {
        key: "invoices",
        title: "Vendor Invoices",
        description: "Billing documents, invoice validation, PDF slips, and vouchers",
        icon: FileText,
      },
      {
        key: "approvals",
        title: "Approvals & Sign-offs",
        description: "Financial clearances, invoice approvals, and job sign-offs",
        icon: CheckCircle2,
      },
      {
        key: "auditController",
        title: "Audit Controller & Compliance",
        description: "Security audit logs, system event history, and compliance tracking",
        icon: ClipboardCheck,
      },
      {
        key: "accessControl",
        title: "User Accounts & Security",
        description: "Staff credentials, role assignment, and compliance logs",
        icon: ShieldCheck,
      },
      {
        key: "excelUploads",
        title: "Excel Data Sheets",
        description: "BOQ uploads, cable schedules, material requirements, and parse tools",
        icon: FileSpreadsheet,
      },
    ],
    []
  );

  // User Permissions Modal State
  const [managingPermsUser, setManagingPermsUser] = useState<UserAccess | null>(null);
  const [userPermsDraft, setUserPermsDraft] = useState<
    Record<
      string,
      {
        view: boolean;
        create: boolean;
        edit: boolean;
        delete: boolean;
        approve: boolean;
      }
    >
  >({});
  const [isSavingUserPerms, setIsSavingUserPerms] = useState(false);

  // Open User Permissions Modal
  const handleOpenManagePermissions = (user: UserAccess) => {
    setManagingPermsUser(user);

    const roleId = ["role-admin", "role-supervisor", "role-employer"].includes(user.roleId)
      ? user.roleId
      : "role-employer";
    const foundRole = roles.find((r) => r.id === roleId);
    const roleKey = roleId === "role-admin" ? "admin" : roleId === "role-supervisor" ? "supervisor" : "employee";
    const rolePolicy =
      foundRole?.permissions ||
      DEFAULT_ROLE_PERMISSIONS[roleKey] ||
      DEFAULT_ROLE_PERMISSIONS.employee;

    const initialPerms: Record<string, any> = {};
    modulesList.forEach((m) => {
      const existing = (user.permissions as any)?.[m.key];
      const fromRole = (rolePolicy as any)?.[m.key];
      initialPerms[m.key] = {
        view: existing?.view ?? fromRole?.view ?? false,
        create: existing?.create ?? fromRole?.create ?? false,
        edit: existing?.edit ?? fromRole?.edit ?? false,
        delete: existing?.delete ?? fromRole?.delete ?? false,
        approve: existing?.approve ?? fromRole?.approve ?? false,
      };
    });

    setUserPermsDraft(initialPerms);
  };

  const handleGrantAllUserPerms = () => {
    const allGranted: Record<string, any> = {};
    modulesList.forEach((m) => {
      allGranted[m.key] = {
        view: true,
        create: true,
        edit: true,
        delete: true,
        approve: true,
      };
    });
    setUserPermsDraft(allGranted);
  };

  const handleRevokeAllUserPerms = () => {
    const allRevoked: Record<string, any> = {};
    modulesList.forEach((m) => {
      allRevoked[m.key] = {
        view: false,
        create: false,
        edit: false,
        delete: false,
        approve: false,
      };
    });
    setUserPermsDraft(allRevoked);
  };

  const handleResetToRoleDefault = async () => {
    if (!managingPermsUser) return;
    setIsSavingUserPerms(true);
    const ok = await updateUserPermissions(managingPermsUser.id, {}, true);
    setIsSavingUserPerms(false);
    if (ok) {
      setManagingPermsUser(null);
      await refreshUsers();
    }
  };

  const handleSaveUserPerms = async (previewAfterSave = false) => {
    if (!managingPermsUser) return;
    const targetUserId = managingPermsUser.id;
    setIsSavingUserPerms(true);
    const ok = await updateUserPermissions(targetUserId, userPermsDraft, false);
    setIsSavingUserPerms(false);
    if (ok) {
      setManagingPermsUser(null);
      await refreshUsers();
      if (previewAfterSave) {
        switchToUser(targetUserId);
      }
    }
  };

  // Open Edit User Modal
  const handleOpenEditUser = (user: UserAccess) => {
    setEditingUser(user);
    setEditUserName(user.name);
    setEditUserEmail(user.email);
    setEditUserPhone(user.phone || "");
    // Ensure assigned role is one of the 3 allowed roles
    const validRoleId = ["role-admin", "role-supervisor", "role-employer"].includes(user.roleId)
      ? user.roleId
      : "role-employer";
    setEditUserRoleId(validRoleId);
    setEditUserStatus(user.status);
    setEditNewPassword("");
    setEditUserErrors({});
  };

  // Validate Create User Form using deep Zod validation
  const validateCreateUser = (): boolean => {
    const roleNameMap: Record<string, "admin" | "supervisor" | "employee"> = {
      "role-admin": "admin",
      "role-supervisor": "supervisor",
      "role-employer": "employee",
    };
    const roleCode = roleNameMap[newUserRoleId] || "employee";

    const validation = userCreateSchema.safeParse({
      name: newUserName,
      email: newUserEmail,
      phone: newUserPhone,
      role: roleCode,
    });

    const errs: Record<string, string> = {};

    if (!validation.success) {
      for (const issue of validation.error.issues) {
        const field = issue.path[0] ? String(issue.path[0]) : "general";
        if (!errs[field]) {
          errs[field] = issue.message;
        }
      }
    }

    // Check duplicate email locally
    const trimmedEmail = newUserEmail.trim().toLowerCase();
    if (!errs.email && trimmedEmail) {
      const duplicate = usersAccess.some(
        (u) => !u.isDeleted && u.email.toLowerCase() === trimmedEmail
      );
      if (duplicate) {
        errs.email = `A user with email "${trimmedEmail}" already exists.`;
      }
    }

    setUserFormErrors(errs);
    if (Object.keys(errs).length > 0) {
      showToast("Validation Failed", "Please resolve highlighted fields.", "error");
      return false;
    }
    return true;
  };

  // Submit Create User
  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreatingUser) return;
    if (!validateCreateUser()) return;

    setIsCreatingUser(true);
    const roleNameMap: Record<string, "admin" | "supervisor" | "employee"> = {
      "role-admin": "admin",
      "role-supervisor": "supervisor",
      "role-employer": "employee",
    };
    const roleCode = roleNameMap[newUserRoleId] || "employee";

    const payload = {
      name: newUserName.trim(),
      email: newUserEmail.trim().toLowerCase(),
      phone: newUserPhone.trim(),
      role: roleCode,
    };

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.fieldErrors) {
          setUserFormErrors(data.fieldErrors);
        }
        showToast("User Creation Failed", data.error || "Could not create user account.", "error");
        setIsCreatingUser(false);
        return;
      }

      // Add to state and sync with database
      if (data.user) {
        addUserAccess({
          id: data.user.id,
          name: data.user.name,
          email: data.user.email,
          phone: data.user.phone,
          department: data.user.department || roleCode.toUpperCase(),
          roleId: data.user.roleId || newUserRoleId,
          status: "Active",
        });
      }

      await refreshUsers();

      if (data.temporaryPassword) {
        setCreatedCredentials({
          name: data.user?.name || payload.name,
          email: data.user?.email || payload.email,
          temporaryPassword: data.temporaryPassword,
          role: roleCode,
        });
        setShowCreatedPassword(true);
      }

      showToast(
        "User Created & Saved",
        `User "${payload.name}" created and saved successfully in PostgreSQL database.`,
        "success"
      );

      setNewUserName("");
      setNewUserEmail("");
      setNewUserPhone("");
      setUserFormErrors({});
      setIsCreateUserOpen(false);
    } catch (err: any) {
      console.error("User creation error:", err);
      showToast(
        "User Creation Failed",
        err.message || "Failed to save user account to database. Please check database connection.",
        "error"
      );
    } finally {
      setIsCreatingUser(false);
    }
  };

  // Reset Password Handlers
  const handleOpenResetPassword = (user: UserAccess) => {
    setResetPasswordUser(user);
    setResetPasswordValue(generateSecurePassword(12));
    setShowResetPasswordValue(true);
    setIsResettingPassword(false);
    setResetPasswordCopied(false);
    setResetPasswordSuccess(false);
  };

  const handleRegenerateResetPassword = () => {
    setResetPasswordValue(generateSecurePassword(12));
    setResetPasswordCopied(false);
  };

  const handleConfirmResetPassword = async () => {
    if (!resetPasswordUser) return;
    setIsResettingPassword(true);

    try {
      const res = await fetch(`/api/users/${resetPasswordUser.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: resetPasswordValue }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast("Reset Failed", data.error || "Failed to reset user password in database.", "error");
        setIsResettingPassword(false);
        return;
      }

      setResetPasswordSuccess(true);
      showToast(
        "Password Reset Successful",
        `Password for "${resetPasswordUser.name}" has been updated in PostgreSQL. User will be forced to change it at next login.`,
        "success"
      );
      await refreshUsers();
    } catch (err: any) {
      console.error("Reset password error:", err);
      showToast("Reset Error", err.message || "Failed to communicate with database.", "error");
    } finally {
      setIsResettingPassword(false);
    }
  };

  // Validate & Save Edit User
  const validateEditUser = (): boolean => {
    if (!editingUser) return false;
    const errs: Record<string, string> = {};
    const trimmedName = editUserName.trim();
    const trimmedEmail = editUserEmail.trim().toLowerCase();

    if (!trimmedName || trimmedName.length < 2) {
      errs.name = "Full name must be at least 2 characters.";
    }

    if (!trimmedEmail) {
      errs.email = "Work email address is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errs.email = "Valid work email address required.";
    } else {
      const duplicate = usersAccess.some(
        (u) => u.id !== editingUser.id && !u.isDeleted && u.email.toLowerCase() === trimmedEmail
      );
      if (duplicate) {
        errs.email = `Email "${trimmedEmail}" is already in use by another user.`;
      }
    }

    const trimmedPhone = editUserPhone.trim();
    if (trimmedPhone && !/^[+0-9\s\-()]{7,20}$/.test(trimmedPhone)) {
      errs.phone = "Enter a valid contact number (7-20 digits).";
    }

    if (!["role-admin", "role-supervisor", "role-employer"].includes(editUserRoleId)) {
      errs.role = "Role must strictly be Employee, Supervisor, or Admin.";
    }

    if (editNewPassword && editNewPassword.length < 6) {
      errs.password = "Password must be at least 6 characters.";
    }

    setEditUserErrors(errs);
    if (Object.keys(errs).length > 0) {
      showToast("Validation Failed", "Please resolve highlighted fields.", "error");
      return false;
    }
    return true;
  };

  const handleSaveUserEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEditUser() || !editingUser) return;

    updateUserAccess(editingUser.id, {
      name: editUserName.trim(),
      email: editUserEmail.trim().toLowerCase(),
      phone: editUserPhone.trim(),
      roleId: editUserRoleId,
      status: editUserStatus,
      newPassword: editNewPassword.trim() || undefined,
    });

    setEditingUser(null);
  };

  // Confirm Soft Delete (Deactivation)
  const handleConfirmSoftDelete = () => {
    if (softDeletingUser) {
      const ok = softDeleteUserAccess(softDeletingUser.id);
      if (ok) {
        setSoftDeletingUser(null);
      }
    }
  };

  // Confirm Permanent Purge
  const handleConfirmPermanentDelete = () => {
    if (permanentDeletingUser) {
      permanentlyDeleteUserAccess(permanentDeletingUser.id);
      setPermanentDeletingUser(null);
    }
  };

  // User counts
  const activeUsersCount = useMemo(
    () => usersAccess.filter((u) => !u.isDeleted).length,
    [usersAccess]
  );
  const deactivatedUsersCount = useMemo(
    () => usersAccess.filter((u) => u.isDeleted).length,
    [usersAccess]
  );

  // Filtered Users based on sub-tab, search, department, role
  const tabUsers = useMemo(() => {
    if (userStatusTab === "active") {
      return usersAccess.filter((u) => !u.isDeleted);
    }
    return usersAccess.filter((u) => u.isDeleted);
  }, [usersAccess, userStatusTab]);

  const filteredUsers = useMemo(() => {
    return tabUsers.filter((user) => {
      const q = userSearch.toLowerCase().trim();
      const matchSearch =
        !q ||
        user.name.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q) ||
        (user.phone && user.phone.includes(q));

      const matchRole = roleFilter === "all" || user.roleId === roleFilter;

      return matchSearch && matchRole;
    });
  }, [tabUsers, userSearch, roleFilter]);

  // Paginated Users
  const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / userPageSize));
  const paginatedUsers = useMemo(() => {
    const start = (userPage - 1) * userPageSize;
    return filteredUsers.slice(start, start + userPageSize);
  }, [filteredUsers, userPage, userPageSize]);

  // Unique departments for filter
  const departments = useMemo(() => {
    const set = new Set(usersAccess.map((u) => u.department));
    return Array.from(set);
  }, [usersAccess]);

  // Filtered & Paginated Audit Logs
  const filteredAuditLogs = useMemo(() => {
    if (!auditSearch) return auditLogs;
    const term = auditSearch.toLowerCase();
    return auditLogs.filter(
      (log) =>
        log.user.toLowerCase().includes(term) ||
        log.action.toLowerCase().includes(term) ||
        log.target.toLowerCase().includes(term) ||
        log.ipAddress.toLowerCase().includes(term)
    );
  }, [auditLogs, auditSearch]);

  const totalAuditPages = Math.max(1, Math.ceil(filteredAuditLogs.length / auditPageSize));
  const paginatedAuditLogs = useMemo(() => {
    const start = (auditPage - 1) * auditPageSize;
    return filteredAuditLogs.slice(start, start + auditPageSize);
  }, [filteredAuditLogs, auditPage, auditPageSize]);



  if (!can("accessControl", "view")) {
    return (
      <div className="flex flex-col items-center justify-center p-10 bg-white rounded-2xl border border-slate-200 text-center max-w-lg mx-auto mt-8 shadow-xs">
        <div className="h-14 w-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Administrator Privileges Required</h2>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
          Access Control, user provisioning, and role assignment matrices are strictly restricted to System Administrators.
        </p>
        <div className="mt-4 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
          Your active role: <span className="font-bold text-blue-600 capitalize">{currentRole}</span>
        </div>
        <Link
          href="/admin"
          className="mt-6 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2563EB] text-xs font-semibold text-white hover:bg-[#1d4ed8] transition-colors"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-900">User Accounts & Access Control</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage user accounts (Employer, Supervisor, Admin), permissions matrix, and compliance audit trail.
          </p>
        </div>

        {can("accessControl", "create") && (
          <button
            type="button"
            onClick={() => setIsCreateUserOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1d4ed8] active:bg-[#1e40af] transition-colors shrink-0 shadow-xs cursor-pointer"
          >
            <UserPlus className="h-4 w-4" />
            Create User Account
          </button>
        )}
      </div>

      {/* Primary Section Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => setActiveTab("users")}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === "users"
                ? "border-[#2563EB] text-[#2563EB]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>1. User Accounts ({activeUsersCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("matrix")}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === "matrix"
                ? "border-[#2563EB] text-[#2563EB]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>2. Roles & Permissions Matrix</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("audit")}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === "audit"
                ? "border-[#2563EB] text-[#2563EB]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>3. Security Audit Trail ({auditLogs.length})</span>
          </button>
        </nav>
      </div>

      {/* ================= TAB 1: USER ACCOUNTS (EMPLOYER, SUPERVISOR, ADMIN) ================= */}
      {activeTab === "users" && (
        <div className="space-y-4">
          {/* Active vs Deactivated Filter Bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-3 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setUserStatusTab("active");
                    setUserPage(1);
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    userStatusTab === "active"
                      ? "bg-white text-blue-600 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Active Accounts</span>
                  <span className="rounded-full bg-blue-100 text-blue-700 px-1.5 py-0.2 text-[10px] font-bold">
                    {activeUsersCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setUserStatusTab("deactivated");
                    setUserPage(1);
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    userStatusTab === "deactivated"
                      ? "bg-white text-rose-600 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Archive className="h-3.5 w-3.5" />
                  <span>Deactivated Accounts</span>
                  <span className="rounded-full bg-slate-200 text-slate-700 px-1.5 py-0.2 text-[10px] font-bold">
                    {deactivatedUsersCount}
                  </span>
                </button>
              </div>

              {/* Quick Search */}
              <div className="w-full sm:w-64">
                <SearchField
                  value={userSearch}
                  onChange={(val) => {
                    setUserSearch(val);
                    setUserPage(1);
                  }}
                  placeholder="Search by name, email, or mobile..."
                />
              </div>
            </div>

            {/* Filter Controls */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
              {/* Role Filter (Strictly: Employee, Supervisor, Admin) */}
              <div className="w-full sm:w-72">
                <select
                  value={roleFilter}
                  onChange={(e) => {
                    setRoleFilter(e.target.value);
                    setUserPage(1);
                  }}
                  className="h-8.5 w-full rounded-lg border border-slate-200 px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white"
                >
                  <option value="all">All Roles (Admin, Supervisor, Employee)</option>
                  <option value="role-admin">Admin</option>
                  <option value="role-supervisor">Supervisor</option>
                  <option value="role-employer">Employee</option>
                </select>
              </div>

              {/* Clear Filter Action */}
              <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-slate-500">
                {(userSearch || roleFilter !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      setUserSearch("");
                      setRoleFilter("all");
                      setUserPage(1);
                    }}
                    className="text-blue-600 hover:underline font-semibold cursor-pointer"
                  >
                    Clear Filters
                  </button>
                )}
                <span>
                  Showing: <strong>{filteredUsers.length}</strong> accounts
                </span>
              </div>
            </div>
          </div>

          {/* User Accounts Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
            {filteredUsers.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">
                {userStatusTab === "active" ? (
                  <div>
                    <Users className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-700">No active user accounts found</p>
                    <p className="text-slate-400 mt-0.5">Click &quot;Create User Account&quot; to register a staff member.</p>
                  </div>
                ) : (
                  <div>
                    <Archive className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-700">No deactivated user accounts</p>
                    <p className="text-slate-400 mt-0.5">Deactivated or soft-deleted accounts will appear here.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-5 py-3">User</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Mobile Phone</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3">Last Active</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedUsers.map((user) => {
                      const initials = user.name
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("");

                      // Render role badge with clean distinct colors and custom permissions indicator
                      const renderRoleBadge = () => {
                        const hasCustom = user.hasCustomPermissions && user.permissions;
                        const hasAnyAccess = hasCustom
                          ? Object.values(user.permissions as any).some((p: any) => p?.view === true)
                          : true;

                        if (hasCustom && !hasAnyAccess) {
                          return (
                            <div className="flex flex-col gap-1 items-start">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                <Lock className="h-2.5 w-2.5" />
                                No Access
                              </span>
                              <span className="text-[10px] text-slate-400">All Modules Revoked</span>
                            </div>
                          );
                        }

                        return (
                          <div className="flex flex-col gap-1 items-start">
                            {user.roleId === "role-admin" && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                <Shield className="h-3 w-3 text-purple-700" />
                                Admin
                              </span>
                            )}
                            {user.roleId === "role-supervisor" && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                <ShieldCheck className="h-3 w-3 text-blue-700" />
                                Supervisor
                              </span>
                            )}
                            {user.roleId !== "role-admin" && user.roleId !== "role-supervisor" && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <UserCheck className="h-3 w-3 text-emerald-700" />
                                Employee
                              </span>
                            )}
                            {hasCustom && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                Custom Policy
                              </span>
                            )}
                          </div>
                        );
                      };

                      return (
                        <tr key={user.id} className="hover:bg-slate-50/80 transition-colors">
                          {/* User Avatar & Email */}
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0 uppercase">
                                {initials}
                              </div>
                              <div>
                                <span className="font-semibold text-slate-900 block">
                                  {user.name}
                                </span>
                                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                  {user.email}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Role */}
                          <td className="px-4 py-3.5">{renderRoleBadge()}</td>

                          {/* Mobile Phone */}
                          <td className="px-4 py-3.5 text-slate-600 font-mono text-[11px]">
                            {user.phone ? (
                              <a
                                href={`tel:${user.phone}`}
                                className="flex items-center gap-1.5 hover:text-blue-600 transition-colors"
                              >
                                <Phone className="h-3 w-3 text-slate-400" />
                                <span>{user.phone}</span>
                              </a>
                            ) : (
                              <span className="text-slate-400 italic">Not set</span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3.5 text-center">
                            {user.isDeleted ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                                Deactivated
                              </span>
                            ) : (
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  user.status === "Active"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : "bg-amber-50 text-amber-700 border border-amber-200"
                                }`}
                              >
                                {user.status === "Active" ? (
                                  <CheckCircle2 className="h-3 w-3" />
                                ) : (
                                  <AlertCircle className="h-3 w-3" />
                                )}
                                {user.status}
                              </span>
                            )}
                          </td>

                          {/* Last Active */}
                          <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap">
                            {user.lastLogin}
                          </td>

                          {/* Actions */}
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {!user.isDeleted ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (activeUserId === user.id) {
                                        resetToAdminUser();
                                      } else {
                                        switchToUser(user.id);
                                      }
                                    }}
                                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                      activeUserId === user.id
                                        ? "bg-amber-100 text-amber-900 border border-amber-300 font-bold"
                                        : "text-slate-500 hover:text-amber-600 hover:bg-amber-50"
                                    }`}
                                    title={
                                      activeUserId === user.id
                                        ? `Currently previewing as ${user.name}. Click to exit preview.`
                                        : `Preview ERP interface and sidebar as ${user.name}`
                                    }
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </button>
                                  {can("accessControl", "edit") && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenManagePermissions(user)}
                                      className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                                      title="Manage Module Access & Permissions (View, Create, Edit, Delete)"
                                    >
                                      <ShieldCheck className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  {can("accessControl", "edit") && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenResetPassword(user)}
                                      className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer"
                                      title={`Reset Password for ${user.name} (Force password change at next login)`}
                                    >
                                      <KeyRound className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  {can("accessControl", "edit") && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditUser(user)}
                                      className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 transition-colors cursor-pointer"
                                      title="Edit User Account"
                                    >
                                      <Edit2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  {can("accessControl", "delete") && (
                                    <button
                                      type="button"
                                      onClick={() => setSoftDeletingUser(user)}
                                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                      title="Deactivate / Soft Delete User"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  {!can("accessControl", "edit") && !can("accessControl", "delete") && (
                                    <span className="text-[11px] text-slate-400 italic">View only</span>
                                  )}
                                </>
                              ) : (
                                <>
                                  {can("accessControl", "edit") && (
                                    <button
                                      type="button"
                                      onClick={() => restoreUserAccess(user.id)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors cursor-pointer"
                                      title="Reactivate Account"
                                    >
                                      <RotateCcw className="h-3 w-3" />
                                      <span>Restore</span>
                                    </button>
                                  )}
                                  {can("accessControl", "delete") && (
                                    <button
                                      type="button"
                                      onClick={() => setPermanentDeletingUser(user)}
                                      className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                      title="Purge Account"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Users Pagination */}
          <Pagination
            currentPage={userPage}
            totalPages={totalUserPages}
            totalItems={filteredUsers.length}
            pageSize={userPageSize}
            onPageChange={setUserPage}
            onPageSizeChange={(newSize) => {
              setUserPageSize(newSize);
              setUserPage(1);
            }}
          />
        </div>
      )}

      {/* ================= TAB 2: ROLES & PERMISSIONS MATRIX ================= */}
      {activeTab === "matrix" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {allowedRoles.map((role) => (
              <button
                key={role.id}
                type="button"
                onClick={() => setSelectedRoleId(role.id)}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedRoleId === role.id
                    ? "border-blue-600 bg-blue-50/50 shadow-xs"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-900">{role.name}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                    {role.id.replace("role-", "")}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                  {role.description}
                </p>
              </button>
            ))}
          </div>

          {/* Matrix Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-900">
                  Permissions Matrix: {selectedRole?.name}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  View and configure module action allowances for users with this role.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3">Module Resource</th>
                    <th className="px-4 py-3 text-center">View</th>
                    <th className="px-4 py-3 text-center">Create</th>
                    <th className="px-4 py-3 text-center">Edit</th>
                    <th className="px-4 py-3 text-center">Delete</th>
                    <th className="px-4 py-3 text-center">Approve</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {modulesList.map((mod) => {
                    const Icon = mod.icon;
                    const perms = selectedRole?.permissions[mod.key] || {
                      view: false,
                      create: false,
                      edit: false,
                      delete: false,
                      approve: false,
                    };

                    const handleToggle = (actionKey: "view" | "create" | "edit" | "delete" | "approve") => {
                      if (!selectedRole) return;
                      updateRolePermission(selectedRole.id, mod.key, actionKey, !perms[actionKey]);
                    };

                    return (
                      <tr key={mod.key} className="hover:bg-slate-50">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <Icon className="h-4 w-4 text-slate-500 shrink-0" />
                            <div>
                              <p className="font-semibold text-slate-900">{mod.title}</p>
                              <p className="text-[10px] text-slate-400">{mod.description}</p>
                            </div>
                          </div>
                        </td>

                        {(["view", "create", "edit", "delete", "approve"] as const).map((action) => (
                          <td key={action} className="px-4 py-3.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggle(action)}
                              className={`h-6 w-6 rounded-md inline-flex items-center justify-center transition-colors cursor-pointer ${
                                perms[action]
                                  ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                                  : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                              }`}
                              title={`${perms[action] ? "Revoke" : "Grant"} ${action} on ${mod.title}`}
                            >
                              {perms[action] ? (
                                <Check className="h-3.5 w-3.5 stroke-3" />
                              ) : (
                                <X className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 3: AUDIT TRAIL ================= */}
      {activeTab === "audit" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="w-full sm:max-w-md">
              <SearchField
                value={auditSearch}
                onChange={(val) => {
                  setAuditSearch(val);
                  setAuditPage(1);
                }}
                placeholder="Search audit trail by user, action, target..."
              />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3">Timestamp</th>
                    <th className="px-4 py-3">Initiated By</th>
                    <th className="px-4 py-3">Security Action</th>
                    <th className="px-4 py-3">Target / Policy</th>
                    <th className="px-4 py-3 text-right">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedAuditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          <span>{log.timestamp}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-slate-900">{log.user}</td>
                      <td className="px-4 py-3.5 text-slate-700">
                        <span className="inline-flex items-center bg-slate-100 px-2 py-0.5 rounded text-[11px] font-medium">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-[11px] text-blue-700">{log.target}</td>
                      <td className="px-4 py-3.5 text-right font-mono text-[11px] text-slate-500">
                        {log.ipAddress}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Pagination
            currentPage={auditPage}
            totalPages={totalAuditPages}
            totalItems={filteredAuditLogs.length}
            pageSize={auditPageSize}
            onPageChange={setAuditPage}
            onPageSizeChange={(newSize) => {
              setAuditPageSize(newSize);
              setAuditPage(1);
            }}
          />
        </div>
      )}

      {/* ================= MODAL: CREATE USER ACCOUNT ================= */}
      <Modal
        isOpen={isCreateUserOpen}
        onClose={() => setIsCreateUserOpen(false)}
        title="Create New User Account"
        description="Provision enterprise ERP access credentials for an Employee, Supervisor, or Admin. A secure random password will be generated and dispatched automatically via Resend."
        maxWidth="md"
      >
        <form onSubmit={handleCreateUserSubmit} className="space-y-3.5" noValidate>
          {/* Automated Dispatch Callout */}
          <div className="flex items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900">
            <Mail className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-900">Automated Credentials Dispatch</p>
              <p className="text-[11px] text-blue-700 mt-0.5 leading-relaxed">
                A cryptographically strong random password will be generated, hashed with Argon2id, and sent directly to the user&apos;s email address via Resend.
              </p>
            </div>
          </div>

          {/* Full Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Full Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={newUserName}
              disabled={isCreatingUser}
              onChange={(e) => {
                setNewUserName(e.target.value);
                if (userFormErrors.name) setUserFormErrors((prev) => ({ ...prev, name: "" }));
              }}
              placeholder="e.g. Kasun Fernando"
              className={`h-9 w-full rounded-lg border bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 transition-colors disabled:opacity-60 ${
                userFormErrors.name
                  ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                  : "border-slate-200 focus:border-blue-600 focus:ring-blue-600/20"
              }`}
            />
            {userFormErrors.name && (
              <p className="text-[11px] text-rose-600 mt-1">{userFormErrors.name}</p>
            )}
          </div>

          {/* Grid: Work Email & Mobile Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Work Email Address <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="email"
                  value={newUserEmail}
                  disabled={isCreatingUser}
                  onChange={(e) => {
                    setNewUserEmail(e.target.value);
                    if (userFormErrors.email) setUserFormErrors((prev) => ({ ...prev, email: "" }));
                  }}
                  placeholder="e.g. kasun@company.com"
                  className={`h-9 w-full rounded-lg border bg-white pl-8 pr-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 transition-colors disabled:opacity-60 ${
                    userFormErrors.email
                      ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                      : "border-slate-200 focus:border-blue-600 focus:ring-blue-600/20"
                  }`}
                />
              </div>
              {userFormErrors.email && (
                <p className="text-[11px] text-rose-600 mt-1">{userFormErrors.email}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mobile Number <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={newUserPhone}
                  disabled={isCreatingUser}
                  onChange={(e) => {
                    setNewUserPhone(e.target.value);
                    if (userFormErrors.phone) setUserFormErrors((prev) => ({ ...prev, phone: "" }));
                  }}
                  placeholder="e.g. 077 123 4567"
                  className={`h-9 w-full rounded-lg border bg-white pl-8 pr-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 transition-colors disabled:opacity-60 ${
                    userFormErrors.phone
                      ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                      : "border-slate-200 focus:border-blue-600 focus:ring-blue-600/20"
                  }`}
                />
              </div>
              {userFormErrors.phone && (
                <p className="text-[11px] text-rose-600 mt-1">{userFormErrors.phone}</p>
              )}
            </div>
          </div>

          {/* Role Selection (Strictly 3 options: Employee, Supervisor, Admin) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Assigned Job Role <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  id: "role-employer",
                  name: "Employee",
                  desc: "Staff / Operations",
                  badge: "bg-emerald-50 text-emerald-800 border-emerald-200",
                },
                {
                  id: "role-supervisor",
                  name: "Supervisor",
                  desc: "Management & Approval",
                  badge: "bg-blue-50 text-blue-800 border-blue-200",
                },
                {
                  id: "role-admin",
                  name: "Admin",
                  desc: "Full Control",
                  badge: "bg-purple-50 text-purple-800 border-purple-200",
                },
              ].map((r) => (
                <button
                  key={r.id}
                  type="button"
                  disabled={isCreatingUser}
                  onClick={() => setNewUserRoleId(r.id)}
                  className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer disabled:opacity-60 ${
                    newUserRoleId === r.id
                      ? "border-blue-600 bg-blue-50/70 ring-2 ring-blue-600/20 shadow-xs"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <span className="block font-bold text-xs text-slate-900">{r.name}</span>
                  <span className="block text-[10px] text-slate-500 mt-0.5">{r.desc}</span>
                </button>
              ))}
            </div>
            {userFormErrors.role && (
              <p className="text-[11px] text-rose-600 mt-1">{userFormErrors.role}</p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              disabled={isCreatingUser}
              onClick={() => setIsCreateUserOpen(false)}
              className="h-9 px-3.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreatingUser}
              className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[#2563EB] text-xs font-semibold text-white hover:bg-[#1d4ed8] active:bg-[#1e40af] transition-colors cursor-pointer disabled:opacity-60"
            >
              {isCreatingUser ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Saving User in Database...</span>
                </>
              ) : (
                <>
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>Create User & Generate Password</span>
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* ================= MODAL: EDIT USER ACCOUNT ================= */}
      {editingUser && (
        <Modal
          isOpen={true}
          onClose={() => setEditingUser(null)}
          title={`Edit Account: ${editingUser.name}`}
          description="Update credentials, assigned role (Employer, Supervisor, Admin), and account status."
          maxWidth="md"
        >
          <form onSubmit={handleSaveUserEdit} className="space-y-3.5" noValidate>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={editUserName}
                onChange={(e) => {
                  setEditUserName(e.target.value);
                  if (editUserErrors.name) setEditUserErrors((prev) => ({ ...prev, name: "" }));
                }}
                className={`h-9 w-full rounded-lg border bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 transition-colors ${
                  editUserErrors.name
                    ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                    : "border-slate-200 focus:border-blue-600 focus:ring-blue-600/20"
                }`}
              />
              {editUserErrors.name && (
                <p className="text-[11px] text-rose-600 mt-1">{editUserErrors.name}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Work Email <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  value={editUserEmail}
                  onChange={(e) => {
                    setEditUserEmail(e.target.value);
                    if (editUserErrors.email) setEditUserErrors((prev) => ({ ...prev, email: "" }));
                  }}
                  className={`h-9 w-full rounded-lg border bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 transition-colors ${
                    editUserErrors.email
                      ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                      : "border-slate-200 focus:border-blue-600 focus:ring-blue-600/20"
                  }`}
                />
                {editUserErrors.email && (
                  <p className="text-[11px] text-rose-600 mt-1">{editUserErrors.email}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mobile Phone
                </label>
                <input
                  type="tel"
                  placeholder="+94 77 123 4567"
                  value={editUserPhone}
                  onChange={(e) => {
                    setEditUserPhone(e.target.value);
                    if (editUserErrors.phone) setEditUserErrors((prev) => ({ ...prev, phone: "" }));
                  }}
                  className={`h-9 w-full rounded-lg border bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 transition-colors ${
                    editUserErrors.phone
                      ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                      : "border-slate-200 focus:border-blue-600 focus:ring-blue-600/20"
                  }`}
                />
                {editUserErrors.phone && (
                  <p className="text-[11px] text-rose-600 mt-1">{editUserErrors.phone}</p>
                )}
              </div>
            </div>

            {/* Role Radio Picker (Strictly: Employee, Supervisor, Admin) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Assigned Role <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "role-employer", name: "Employee", desc: "Staff / Operations" },
                  { id: "role-supervisor", name: "Supervisor", desc: "Management & Approval" },
                  { id: "role-admin", name: "Admin", desc: "Full Control" },
                ].map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setEditUserRoleId(r.id)}
                    className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                      editUserRoleId === r.id
                        ? "border-blue-600 bg-blue-50/60 ring-1 ring-blue-600/30"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <span className="block font-bold text-xs text-slate-900">{r.name}</span>
                    <span className="block text-[10px] text-slate-500 mt-0.5">{r.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Account Status
              </label>
              <select
                value={editUserStatus}
                onChange={(e) => setEditUserStatus(e.target.value as UserStatus)}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
              >
                <option value="Active">Active</option>
                <option value="Suspended">Suspended</option>
                <option value="Pending">Pending</option>
              </select>
            </div>

            {/* Optional Password Reset */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reset Password <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="password"
                value={editNewPassword}
                onChange={(e) => setEditNewPassword(e.target.value)}
                placeholder="Leave blank to keep current password..."
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
              {editUserErrors.password && (
                <p className="text-[11px] text-rose-600 mt-1">{editUserErrors.password}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-8 px-4 rounded-lg bg-[#2563EB] text-xs font-semibold text-white hover:bg-[#1d4ed8] active:bg-[#1e40af] transition-colors cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </form>
        </Modal>
      )}

      

      {/* ================= MODAL: SOFT DELETE USER (DEACTIVATION) ================= */}
      {softDeletingUser && (
        <Modal
          isOpen={true}
          onClose={() => setSoftDeletingUser(null)}
          title="Deactivate User Account"
          maxWidth="sm"
        >
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-lg bg-amber-50 border border-amber-200 p-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 space-y-1">
                <p className="font-semibold">Soft-Deactivate Account</p>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Deactivating <strong>{softDeletingUser.name}</strong> will revoke their access to the system immediately. All historical actions, activity logs, and assigned work orders will remain preserved. You can reactivate this account anytime.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setSoftDeletingUser(null)}
                className="h-8 px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSoftDelete}
                className="h-8 px-3.5 rounded-lg bg-amber-600 text-xs font-semibold text-white hover:bg-amber-700 transition-colors cursor-pointer"
              >
                Deactivate User
              </button>
            </div>
          </div>
        </Modal>
      )}

      

      {/* ================= MODAL: PERMANENT PURGE USER ================= */}
      {permanentDeletingUser && (
        <Modal
          isOpen={true}
          onClose={() => setPermanentDeletingUser(null)}
          title="Permanently Delete User"
          maxWidth="sm"
        >
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-lg bg-rose-50 border border-rose-200 p-3">
              <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs text-rose-900 space-y-1">
                <p className="font-semibold">Permanent Destruction Warning</p>
                <p className="text-[11px] text-rose-800 leading-relaxed">
                  Are you sure you want to permanently delete <strong>{permanentDeletingUser.name}</strong>? This user record will be removed from the system permanently.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setPermanentDeletingUser(null)}
                className="h-8 px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPermanentDelete}
                className="h-8 px-3.5 rounded-lg bg-rose-600 text-xs font-semibold text-white hover:bg-rose-700 transition-colors cursor-pointer"
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </Modal>
      )}

      
      {/* ================= MODAL: MANAGE USER PERMISSIONS ================= */}
      {managingPermsUser && (
        <Modal
          isOpen={true}
          onClose={() => setManagingPermsUser(null)}
          title={`User Access & Permissions: ${managingPermsUser.name}`}
          maxWidth="2xl"
        >
          <div className="space-y-4">
            {/* User Header Summary */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div>
                <p className="text-xs font-bold text-slate-900">{managingPermsUser.name}</p>
                <p className="text-[11px] text-slate-500">{managingPermsUser.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-slate-500">Base Role:</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-100 text-blue-800">
                  {managingPermsUser.roleId.replace("role-", "")}
                </span>
                {managingPermsUser.hasCustomPermissions && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                    Custom Overrides
                  </span>
                )}
              </div>
            </div>

            {/* Quick Action Presets */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
              <span className="text-[11px] font-semibold text-slate-600">Quick Configuration:</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={handleGrantAllUserPerms}
                  className="px-2.5 py-1 rounded text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors cursor-pointer"
                >
                  Grant Full Access
                </button>
                <button
                  type="button"
                  onClick={handleRevokeAllUserPerms}
                  className="px-2.5 py-1 rounded text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer"
                >
                  Revoke All (No Access)
                </button>
                <button
                  type="button"
                  onClick={handleResetToRoleDefault}
                  className="px-2.5 py-1 rounded text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors cursor-pointer"
                >
                  Reset to Role Default
                </button>
              </div>
            </div>

            {/* Granular Permissions Table for each ERP Module */}
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[380px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-2.5">Module Resource</th>
                    <th className="px-3 py-2.5 text-center">View / Access</th>
                    <th className="px-3 py-2.5 text-center">Create</th>
                    <th className="px-3 py-2.5 text-center">Edit</th>
                    <th className="px-3 py-2.5 text-center">Delete</th>
                    <th className="px-3 py-2.5 text-center">Approve</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {modulesList.map((mod) => {
                    const Icon = mod.icon;
                    const modPerms = userPermsDraft[mod.key] || {
                      view: false,
                      create: false,
                      edit: false,
                      delete: false,
                      approve: false,
                    };

                    const handleUserActionToggle = (
                      actionKey: "view" | "create" | "edit" | "delete" | "approve"
                    ) => {
                      setUserPermsDraft((prev) => {
                        const current = prev[mod.key] || {
                          view: false,
                          create: false,
                          edit: false,
                          delete: false,
                          approve: false,
                        };
                        const nextVal = !current[actionKey];
                        const updatedMod = { ...current, [actionKey]: nextVal };

                        // If view is revoked, turn off create, edit, delete, approve
                        if (actionKey === "view" && !nextVal) {
                          updatedMod.create = false;
                          updatedMod.edit = false;
                          updatedMod.delete = false;
                          updatedMod.approve = false;
                        }
                        // If any action is granted, automatically ensure view is granted
                        if (actionKey !== "view" && nextVal) {
                          updatedMod.view = true;
                        }

                        return {
                          ...prev,
                          [mod.key]: updatedMod,
                        };
                      });
                    };

                    return (
                      <tr key={mod.key} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-slate-500 shrink-0" />
                            <div>
                              <p className="font-semibold text-slate-900 text-xs">{mod.title}</p>
                              <p className="text-[10px] text-slate-400 line-clamp-1">
                                {mod.description}
                              </p>
                            </div>
                          </div>
                        </td>

                        {(["view", "create", "edit", "delete", "approve"] as const).map(
                          (action) => (
                            <td key={action} className="px-3 py-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleUserActionToggle(action)}
                                className={`h-6 w-6 rounded-md inline-flex items-center justify-center transition-colors cursor-pointer ${
                                  modPerms[action]
                                    ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                                    : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                                }`}
                                title={`${
                                  modPerms[action] ? "Revoke" : "Grant"
                                } ${action} on ${mod.title}`}
                              >
                                {modPerms[action] ? (
                                  <Check className="h-3.5 w-3.5 stroke-3" />
                                ) : (
                                  <X className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </td>
                          )
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <span className="text-[11px] text-slate-400">
                Changes will be saved directly into PostgreSQL and immediately enforced.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setManagingPermsUser(null)}
                  disabled={isSavingUserPerms}
                  className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveUserPerms(false)}
                  disabled={isSavingUserPerms}
                  className="h-8 px-3.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Save permissions to PostgreSQL without switching preview persona"
                >
                  {isSavingUserPerms ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5 text-slate-500" />
                  )}
                  <span>Save</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveUserPerms(true)}
                  disabled={isSavingUserPerms}
                  className="h-8 px-4 rounded-lg bg-[#2563EB] text-xs font-semibold text-white hover:bg-[#1d4ed8] active:bg-[#1e40af] transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                  title="Save permissions to PostgreSQL and immediately preview the sidebar and UI as this user"
                >
                  {isSavingUserPerms ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Eye className="h-3.5 w-3.5" />
                      <span>Save & Preview User View</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ================= MODAL: USER ACCOUNT PROVISIONED & CREDENTIALS ================= */}
      {createdCredentials && (
        <Modal
          isOpen={true}
          onClose={() => setCreatedCredentials(null)}
          title="User Account Provisioned"
          maxWidth="md"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-emerald-950">
                  Account Created for {createdCredentials.name}
                </h4>
                <p className="text-[11px] text-emerald-800">
                  User details and password have been securely stored in PostgreSQL database.
                </p>
              </div>
            </div>

            {/* Credentials Card */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-medium">Registered Email:</span>
                <span className="font-mono font-semibold text-slate-900">{createdCredentials.email}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-medium">Assigned Role:</span>
                <span className="font-bold text-blue-700 capitalize">{createdCredentials.role}</span>
              </div>

              {createdCredentials.temporaryPassword && (
                <div className="pt-2 border-t border-slate-200">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[11px] font-semibold text-slate-700">
                      Auto-Generated Temporary Password:
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">Argon2id Hashed in DB</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 font-mono text-sm font-bold bg-white px-3 py-2 rounded-lg border border-slate-300 text-slate-900 select-all tracking-wider">
                      {showCreatedPassword ? createdCredentials.temporaryPassword : "•".repeat(createdCredentials.temporaryPassword.length)}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCreatedPassword(!showCreatedPassword)}
                      className="p-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer shrink-0"
                      title={showCreatedPassword ? "Hide password" : "Show password"}
                    >
                      {showCreatedPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (createdCredentials.temporaryPassword) {
                          navigator.clipboard.writeText(createdCredentials.temporaryPassword);
                          setCopiedPassword(true);
                          setTimeout(() => setCopiedPassword(false), 2500);
                        }
                      }}
                      className="px-3 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1d4ed8] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                      title="Copy password to clipboard"
                    >
                      {copiedPassword ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Direct Password Issuance Security Notice */}
            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs flex items-start gap-2.5 text-slate-700">
              <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-blue-600" />
              <div className="space-y-1">
                <p className="font-semibold text-slate-900">Direct Password Provisioning (No Email Transmission)</p>
                <p className="text-[11px] leading-relaxed text-slate-600">
                  Passwords are not transmitted via email for compliance. Copy the password above and provide it securely to <strong>{createdCredentials.name}</strong>.
                </p>
              </div>
            </div>

            {/* First-time login security notice */}
            <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 space-y-0.5">
              <p className="font-semibold text-amber-950">Mandatory First-Time Login Protocol:</p>
              <p>
                When <strong>{createdCredentials.name}</strong> signs in at <code>/</code> using this temporary password, the system will force them to set their permanent personal password before accessing any ERP modules.
              </p>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setCreatedCredentials(null)}
                className="h-8 px-4 rounded-lg bg-[#2563EB] text-xs font-semibold text-white hover:bg-[#1d4ed8] transition-colors cursor-pointer"
              >
                Done & Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ================= MODAL: RESET USER PASSWORD ================= */}
      {resetPasswordUser && (
        <Modal
          isOpen={true}
          onClose={() => setResetPasswordUser(null)}
          title={resetPasswordSuccess ? "Password Reset Completed" : `Reset Password: ${resetPasswordUser.name}`}
          maxWidth="md"
        >
          <div className="space-y-4">
            {resetPasswordSuccess ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-emerald-950">
                      Password Successfully Reset & Saved
                    </h4>
                    <p className="text-[11px] text-emerald-800">
                      New password is saved in PostgreSQL with mandatory change on next login.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-medium">User:</span>
                    <span className="font-bold text-slate-900">{resetPasswordUser.name}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-medium">Email:</span>
                    <span className="font-mono font-semibold text-slate-900">{resetPasswordUser.email}</span>
                  </div>

                  <div className="pt-2 border-t border-slate-200">
                    <span className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Assigned Temporary Password:
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 font-mono text-sm font-bold bg-white px-3 py-2 rounded-lg border border-slate-300 text-slate-900 select-all tracking-wider">
                        {showResetPasswordValue ? resetPasswordValue : "•".repeat(resetPasswordValue.length)}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowResetPasswordValue(!showResetPasswordValue)}
                        className="p-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer shrink-0"
                        title={showResetPasswordValue ? "Hide password" : "Show password"}
                      >
                        {showResetPasswordValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(resetPasswordValue);
                          setResetPasswordCopied(true);
                          setTimeout(() => setResetPasswordCopied(false), 2500);
                        }}
                        className="px-3 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1d4ed8] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                      >
                        {resetPasswordCopied ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
                  <strong>Mandatory Password Change:</strong> When <strong>{resetPasswordUser.name}</strong> logs in using this temporary password, they will be forced to change it immediately before accessing any ERP modules.
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setResetPasswordUser(null)}
                    className="h-8 px-4 rounded-lg bg-[#2563EB] text-xs font-semibold text-white hover:bg-[#1d4ed8] transition-colors cursor-pointer"
                  >
                    Done & Close
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">User Account:</span>
                    <span className="font-bold text-slate-900">{resetPasswordUser.name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Email:</span>
                    <span className="font-mono font-semibold text-slate-900">{resetPasswordUser.email}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Role:</span>
                    <span className="font-bold text-blue-700 capitalize">
                      {resetPasswordUser.role || resetPasswordUser.department}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Generated Temporary Password:
                    </label>
                    <button
                      type="button"
                      onClick={handleRegenerateResetPassword}
                      disabled={isResettingPassword}
                      className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                      title="Generate another secure random password"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>Regenerate</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type={showResetPasswordValue ? "text" : "password"}
                      value={resetPasswordValue}
                      onChange={(e) => setResetPasswordValue(e.target.value)}
                      disabled={isResettingPassword}
                      className="flex-1 font-mono text-sm font-bold bg-white px-3 py-2 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 tracking-wider"
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetPasswordValue(!showResetPasswordValue)}
                      className="p-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer shrink-0"
                      title={showResetPasswordValue ? "Hide password" : "Show password"}
                    >
                      {showResetPasswordValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(resetPasswordValue);
                        setResetPasswordCopied(true);
                        setTimeout(() => setResetPasswordCopied(false), 2500);
                      }}
                      className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                    >
                      {resetPasswordCopied ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-900 space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-amber-700" />
                    <span>Mandatory Password Change Protocol</span>
                  </p>
                  <p className="text-[11px] leading-relaxed text-amber-800">
                    When confirmed, this password will be hashed with Argon2id and saved in PostgreSQL. The user will be required to create a new permanent password on their next sign-in.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    disabled={isResettingPassword}
                    onClick={() => setResetPasswordUser(null)}
                    className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isResettingPassword || !resetPasswordValue}
                    onClick={handleConfirmResetPassword}
                    className="h-8 px-4 rounded-lg bg-[#2563EB] text-xs font-semibold text-white hover:bg-[#1d4ed8] active:bg-[#1e40af] transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {isResettingPassword ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Resetting Password...</span>
                      </>
                    ) : (
                      <>
                        <KeyRound className="h-3.5 w-3.5" />
                        <span>Confirm & Reset Password</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
