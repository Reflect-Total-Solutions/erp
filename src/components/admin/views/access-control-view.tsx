"use client";

import React, { useState, useMemo } from "react";
import {
  ShieldCheck,
  Shield,
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
} from "lucide-react";
import { useAdminData } from "@/context/admin-data-context";
import { Modal } from "@/components/admin/ui/modal";
import { Pagination } from "@/components/admin/ui/pagination";
import { SearchField } from "@/components/admin/ui/search-field";
import { Role, UserAccess, UserStatus } from "@/types/admin";

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
    showToast,
  } = useAdminData();

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

  // Create User form state (Strictly: Employer, Supervisor, Admin)
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserDept, setNewUserDept] = useState("Operations");
  const [newUserRoleId, setNewUserRoleId] = useState("role-employer");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserStatus, setNewUserStatus] = useState<UserStatus>("Active");
  const [userFormErrors, setUserFormErrors] = useState<Record<string, string>>({});

  // Edit User form state
  const [editUserName, setEditUserName] = useState("");
  const [editUserEmail, setEditUserEmail] = useState("");
  const [editUserDept, setEditUserDept] = useState("");
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

  // Open Edit User Modal
  const handleOpenEditUser = (user: UserAccess) => {
    setEditingUser(user);
    setEditUserName(user.name);
    setEditUserEmail(user.email);
    setEditUserDept(user.department);
    // Ensure assigned role is one of the 3 allowed roles
    const validRoleId = ["role-admin", "role-supervisor", "role-employer"].includes(user.roleId)
      ? user.roleId
      : "role-employer";
    setEditUserRoleId(validRoleId);
    setEditUserStatus(user.status);
    setEditNewPassword("");
    setEditUserErrors({});
  };

  // Validate Create User Form
  const validateCreateUser = (): boolean => {
    const errs: Record<string, string> = {};
    const trimmedName = newUserName.trim();
    const trimmedEmail = newUserEmail.trim().toLowerCase();
    const trimmedDept = newUserDept.trim();

    if (!trimmedName || trimmedName.length < 2) {
      errs.name = "Full name must be at least 2 characters.";
    }

    if (!trimmedEmail) {
      errs.email = "Work email address is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errs.email = "Please enter a valid work email address.";
    } else {
      const duplicate = usersAccess.some(
        (u) => !u.isDeleted && u.email.toLowerCase() === trimmedEmail
      );
      if (duplicate) {
        errs.email = `A user with email "${trimmedEmail}" already exists.`;
      }
    }

    if (!trimmedDept) {
      errs.department = "Department is required.";
    }

    if (!["role-admin", "role-supervisor", "role-employer"].includes(newUserRoleId)) {
      errs.role = "Role must strictly be Employer, Supervisor, or Admin.";
    }

    if (!newUserPassword) {
      errs.password = "Initial password is required.";
    } else if (newUserPassword.length < 6) {
      errs.password = "Password must be at least 6 characters.";
    }

    setUserFormErrors(errs);
    if (Object.keys(errs).length > 0) {
      showToast("Validation Failed", "Please resolve highlighted fields.", "error");
      return false;
    }
    return true;
  };

  // Submit Create User
  const handleCreateUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateCreateUser()) return;

    addUserAccess({
      name: newUserName.trim(),
      email: newUserEmail.trim().toLowerCase(),
      department: newUserDept.trim(),
      roleId: newUserRoleId,
      status: newUserStatus,
    });

    setNewUserName("");
    setNewUserEmail("");
    setNewUserPassword("");
    setUserFormErrors({});
    setIsCreateUserOpen(false);
  };

  // Validate & Save Edit User
  const validateEditUser = (): boolean => {
    if (!editingUser) return false;
    const errs: Record<string, string> = {};
    const trimmedName = editUserName.trim();
    const trimmedEmail = editUserEmail.trim().toLowerCase();
    const trimmedDept = editUserDept.trim();

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

    if (!trimmedDept) {
      errs.department = "Department is required.";
    }

    if (!["role-admin", "role-supervisor", "role-employer"].includes(editUserRoleId)) {
      errs.role = "Role must strictly be Employer, Supervisor, or Admin.";
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
      department: editUserDept.trim(),
      roleId: editUserRoleId,
      status: editUserStatus,
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
        user.department.toLowerCase().includes(q);

      const matchRole = roleFilter === "all" || user.roleId === roleFilter;
      const matchDept = deptFilter === "all" || user.department === deptFilter;

      return matchSearch && matchRole && matchDept;
    });
  }, [tabUsers, userSearch, roleFilter, deptFilter]);

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

  // Modules metadata definition for Permissions Matrix
  const modulesList: Array<{
    key: keyof Role["permissions"];
    title: string;
    description: string;
    icon: React.ElementType;
  }> = [
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
      key: "excelUploads",
      title: "Excel Data Sheets",
      description: "BOQ uploads, cable schedules, material requirements, and parse tools",
      icon: FileSpreadsheet,
    },
    {
      key: "invoices",
      title: "Vendor Invoices",
      description: "Billing documents, invoice validation, PDF slips, and vouchers",
      icon: FileText,
    },
    {
      key: "suppliers",
      title: "Supplier Registry",
      description: "Subcontractor contact information, trade vendor verification",
      icon: Building2,
    },
    {
      key: "accessControl",
      title: "User Accounts & Security",
      description: "Staff credentials, role assignment, and compliance logs",
      icon: ShieldCheck,
    },
  ];

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

        <button
          type="button"
          onClick={() => setIsCreateUserOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1d4ed8] active:bg-[#1e40af] transition-colors shrink-0 shadow-xs cursor-pointer"
        >
          <UserPlus className="h-4 w-4" />
          Create User Account
        </button>
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
                  placeholder="Search name, email, department..."
                />
              </div>
            </div>

            {/* Filter Dropdowns */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-100">
              {/* Role Filter (Strictly: Employer, Supervisor, Admin) */}
              <div>
                <select
                  value={roleFilter}
                  onChange={(e) => {
                    setRoleFilter(e.target.value);
                    setUserPage(1);
                  }}
                  className="h-8.5 w-full rounded-lg border border-slate-200 px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white"
                >
                  <option value="all">All Roles (Admin, Supervisor, Employer)</option>
                  <option value="role-admin">Admin</option>
                  <option value="role-supervisor">Supervisor</option>
                  <option value="role-employer">Employer</option>
                </select>
              </div>

              {/* Department Filter */}
              <div>
                <select
                  value={deptFilter}
                  onChange={(e) => {
                    setDeptFilter(e.target.value);
                    setUserPage(1);
                  }}
                  className="h-8.5 w-full rounded-lg border border-slate-200 px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white"
                >
                  <option value="all">All Departments</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              {/* Clear Filter Action */}
              <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-slate-500">
                {(userSearch || deptFilter !== "all" || roleFilter !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      setUserSearch("");
                      setDeptFilter("all");
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
                      <th className="px-4 py-3">Department</th>
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

                      // Render role badge with clean distinct colors
                      const renderRoleBadge = () => {
                        if (user.roleId === "role-admin") {
                          return (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                              <Shield className="h-3 w-3 text-purple-700" />
                              Admin
                            </span>
                          );
                        }
                        if (user.roleId === "role-supervisor") {
                          return (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                              <ShieldCheck className="h-3 w-3 text-blue-700" />
                              Supervisor
                            </span>
                          );
                        }
                        return (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <UserCheck className="h-3 w-3 text-emerald-700" />
                            Employer
                          </span>
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

                          {/* Department */}
                          <td className="px-4 py-3.5 text-slate-600">{user.department}</td>

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
                                    onClick={() => handleOpenEditUser(user)}
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 transition-colors cursor-pointer"
                                    title="Edit User Account"
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setSoftDeletingUser(user)}
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                    title="Deactivate / Soft Delete User"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => restoreUserAccess(user.id)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors cursor-pointer"
                                    title="Reactivate Account"
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                    <span>Restore</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPermanentDeletingUser(user)}
                                    className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                    title="Purge Account"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
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
        description="Provision enterprise ERP access credentials for an Employer, Supervisor, or Admin."
        maxWidth="md"
      >
        <form onSubmit={handleCreateUserSubmit} className="space-y-3.5" noValidate>
          {/* Full Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Full Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={newUserName}
              onChange={(e) => {
                setNewUserName(e.target.value);
                if (userFormErrors.name) setUserFormErrors((prev) => ({ ...prev, name: "" }));
              }}
              placeholder="e.g. Kasun Fernando"
              className={`h-9 w-full rounded-lg border bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 transition-colors ${
                userFormErrors.name
                  ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                  : "border-slate-200 focus:border-blue-600 focus:ring-blue-600/20"
              }`}
            />
            {userFormErrors.name && (
              <p className="text-[11px] text-rose-600 mt-1">{userFormErrors.name}</p>
            )}
          </div>

          {/* Work Email */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Work Email Address <span className="text-rose-500">*</span>
            </label>
            <input
              type="email"
              value={newUserEmail}
              onChange={(e) => {
                setNewUserEmail(e.target.value);
                if (userFormErrors.email) setUserFormErrors((prev) => ({ ...prev, email: "" }));
              }}
              placeholder="e.g. kasun@reflecterp.com"
              className={`h-9 w-full rounded-lg border bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 transition-colors ${
                userFormErrors.email
                  ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                  : "border-slate-200 focus:border-blue-600 focus:ring-blue-600/20"
              }`}
            />
            {userFormErrors.email && (
              <p className="text-[11px] text-rose-600 mt-1">{userFormErrors.email}</p>
            )}
          </div>

          {/* Role Selection (Strictly 3 options: Employer, Supervisor, Admin) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Assigned Role <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  id: "role-employer",
                  name: "Employer",
                  desc: "Staff / Workforce",
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
                  onClick={() => setNewUserRoleId(r.id)}
                  className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                    newUserRoleId === r.id
                      ? "border-blue-600 bg-blue-50/60 ring-1 ring-blue-600/30"
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

          {/* Department & Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Department / Unit <span className="text-rose-500">*</span>
              </label>
              <select
                value={newUserDept}
                onChange={(e) => setNewUserDept(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
              >
                <option value="Operations">Operations</option>
                <option value="Project Engineering">Project Engineering</option>
                <option value="Procurement">Procurement</option>
                <option value="Finance & Accounts">Finance & Accounts</option>
                <option value="Site Supervision">Site Supervision</option>
                <option value="Executive Management">Executive Management</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Initial Account Status
              </label>
              <select
                value={newUserStatus}
                onChange={(e) => setNewUserStatus(e.target.value as UserStatus)}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
              >
                <option value="Active">Active</option>
                <option value="Pending">Pending</option>
                <option value="Suspended">Suspended</option>
              </select>
            </div>
          </div>

          {/* Initial Temporary Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Temporary Password <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={newUserPassword}
                onChange={(e) => {
                  setNewUserPassword(e.target.value);
                  if (userFormErrors.password) setUserFormErrors((prev) => ({ ...prev, password: "" }));
                }}
                placeholder="Initial password for first login..."
                className={`h-9 w-full rounded-lg border bg-white pl-8 pr-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 transition-colors ${
                  userFormErrors.password
                    ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                    : "border-slate-200 focus:border-blue-600 focus:ring-blue-600/20"
                }`}
              />
            </div>
            {userFormErrors.password && (
              <p className="text-[11px] text-rose-600 mt-1">{userFormErrors.password}</p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsCreateUserOpen(false)}
              className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-8 px-4 rounded-lg bg-[#2563EB] text-xs font-semibold text-white hover:bg-[#1d4ed8] active:bg-[#1e40af] transition-colors cursor-pointer"
            >
              Create Account
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

            {/* Role Radio Picker (Strictly: Employer, Supervisor, Admin) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Assigned Role <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "role-employer", name: "Employer", desc: "Staff / Workforce" },
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Department
                </label>
                <input
                  type="text"
                  value={editUserDept}
                  onChange={(e) => setEditUserDept(e.target.value)}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
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
    </div>
  );
}
