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
  Trash2,
  Edit2,
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
} from "lucide-react";
import { useAdminData } from "@/context/admin-data-context";
import { Modal } from "@/components/admin/ui/modal";
import { Role, UserAccess, UserStatus, ModulePermission } from "@/types/admin";

export function AccessControlView() {
  const {
    roles,
    usersAccess,
    auditLogs,
    updateRolePermission,
    addRole,
    addUserAccess,
    updateUserAccess,
    deleteUserAccess,
    showToast,
  } = useAdminData();

  // Active Tab: "matrix" | "users" | "audit"
  const [activeTab, setActiveTab] = useState<"matrix" | "users" | "audit">("matrix");

  // Selected Role for Permissions Matrix
  const [selectedRoleId, setSelectedRoleId] = useState<string>(roles[0]?.id || "role-admin");
  const selectedRole = roles.find((r) => r.id === selectedRoleId) || roles[0];

  // Search & Filters for Users Tab
  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");

  // Modals state
  const [isInviteUserOpen, setIsInviteUserOpen] = useState(false);
  const [isCreateRoleOpen, setIsCreateRoleOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccess | null>(null);

  // Invite User form state
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserDept, setNewUserDept] = useState("Engineering");
  const [newUserRoleId, setNewUserRoleId] = useState(roles[1]?.id || "role-pm");
  const [userErrors, setUserErrors] = useState<Record<string, string>>({});

  // Create Role form state
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [newRoleColor, setNewRoleColor] = useState("blue");
  const [cloneFromRoleId, setCloneFromRoleId] = useState(roles[0]?.id || "");
  const [roleErrors, setRoleErrors] = useState<Record<string, string>>({});

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return usersAccess.filter((user) => {
      const matchSearch =
        user.name.toLowerCase().includes(userSearch.toLowerCase()) ||
        user.email.toLowerCase().includes(userSearch.toLowerCase()) ||
        user.department.toLowerCase().includes(userSearch.toLowerCase());

      const matchRole = roleFilter === "all" || user.roleId === roleFilter;
      const matchDept = deptFilter === "all" || user.department === deptFilter;

      return matchSearch && matchRole && matchDept;
    });
  }, [usersAccess, userSearch, roleFilter, deptFilter]);

  // Unique departments for filter
  const departments = useMemo(() => {
    const set = new Set(usersAccess.map((u) => u.department));
    return Array.from(set);
  }, [usersAccess]);

  // Handle Invite User submit
  const handleInviteUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!newUserName.trim()) errs.name = "Full name required.";
    if (!newUserEmail.trim()) {
      errs.email = "Email address required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newUserEmail)) {
      errs.email = "Valid email address required.";
    }

    if (Object.keys(errs).length > 0) {
      setUserErrors(errs);
      return;
    }

    addUserAccess({
      name: newUserName.trim(),
      email: newUserEmail.trim(),
      department: newUserDept,
      roleId: newUserRoleId,
      status: "Active",
    });

    setNewUserName("");
    setNewUserEmail("");
    setUserErrors({});
    setIsInviteUserOpen(false);
  };

  // Handle Create Role submit
  const handleCreateRoleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!newRoleName.trim()) errs.name = "Role name required.";

    if (Object.keys(errs).length > 0) {
      setRoleErrors(errs);
      return;
    }

    const templateRole = roles.find((r) => r.id === cloneFromRoleId) || roles[0];
    const newRole = addRole({
      name: newRoleName.trim(),
      description: newRoleDesc.trim() || "Custom designated staff role with tailored access rights.",
      color: newRoleColor,
      permissions: JSON.parse(JSON.stringify(templateRole.permissions)),
    });

    setSelectedRoleId(newRole.id);
    setNewRoleName("");
    setNewRoleDesc("");
    setRoleErrors({});
    setIsCreateRoleOpen(false);
  };

  // Handle Edit User submit
  const handleSaveUserEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    updateUserAccess(editingUser.id, {
      name: editingUser.name,
      email: editingUser.email,
      department: editingUser.department,
      roleId: editingUser.roleId,
      status: editingUser.status,
    });
    setEditingUser(null);
  };

  // Bulk Grant / Revoke all for a role
  const handleToggleAllPermissionsForRole = (grant: boolean) => {
    if (!selectedRole) return;
    const moduleKeys: Array<keyof Role["permissions"]> = [
      "dashboard",
      "jobs",
      "excelUploads",
      "invoices",
      "suppliers",
      "accessControl",
    ];
    const permKeys: Array<"view" | "create" | "edit" | "delete" | "approve"> = [
      "view",
      "create",
      "edit",
      "delete",
      "approve",
    ];

    moduleKeys.forEach((mod) => {
      permKeys.forEach((p) => {
        updateRolePermission(selectedRole.id, mod, p, grant);
      });
    });

    showToast(
      grant ? "All Permissions Granted" : "All Permissions Revoked",
      `${grant ? "Granted" : "Revoked"} all permissions for "${selectedRole.name}".`,
      "info"
    );
  };

  // Modules metadata definition
  const modulesList: Array<{
    key: keyof Role["permissions"];
    title: string;
    description: string;
    icon: React.ElementType;
  }> = [
    {
      key: "dashboard",
      title: "Dashboard Overview",
      description: "View executive metric cards, recent jobs, and invoice totals.",
      icon: LayoutDashboard,
    },
    {
      key: "jobs",
      title: "Jobs Management",
      description: "Schedule projects, configure job codes, dates, and assign suppliers.",
      icon: Briefcase,
    },
    {
      key: "excelUploads",
      title: "Excel File Uploads",
      description: "Bulk upload BOQ schedules, spreadsheets (.xlsx, .xls) and revisions.",
      icon: FileSpreadsheet,
    },
    {
      key: "invoices",
      title: "Invoices & Billing",
      description: "Upload photo bills (.jpg, .png) and PDFs, verify amounts and status.",
      icon: FileText,
    },
    {
      key: "suppliers",
      title: "Suppliers Directory",
      description: "Register vendors, maintain vendor contact registry and addresses.",
      icon: Building2,
    },
    {
      key: "accessControl",
      title: "Access Control & Security",
      description: "Manage roles, assign permission matrix policies, and invite staff.",
      icon: ShieldCheck,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900">Access Control & Permissions</h2>
            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              RBAC Active
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure role permissions matrix, assign staff access rights, and inspect security audit trail.
          </p>
        </div>

        {/* Header Quick Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCreateRoleOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs"
          >
            <Shield className="h-3.5 w-3.5 text-blue-600" />
            <span>New Custom Role</span>
          </button>

          <button
            type="button"
            onClick={() => setIsInviteUserOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1d4ed8] shadow-xs"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>Add User Access</span>
          </button>
        </div>
      </div>

      {/* 4 Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Users */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">System Users</span>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{usersAccess.length}</p>
          <p className="text-[11px] text-slate-400 mt-1">
            {usersAccess.filter((u) => u.status === "Active").length} active accounts
          </p>
        </div>

        {/* Defined Roles */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Security Roles</span>
            <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{roles.length}</p>
          <p className="text-[11px] text-slate-400 mt-1">Granular role tiers</p>
        </div>

        {/* Protected Modules */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Protected Modules</span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <Lock className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">6</p>
          <p className="text-[11px] text-slate-400 mt-1">Full CRUD permissions</p>
        </div>

        {/* Security Policy */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Access Policy</span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <KeyRound className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">Strict</p>
          <p className="text-[11px] text-slate-400 mt-1">Zero-trust verified</p>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-slate-200">
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => setActiveTab("matrix")}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "matrix"
                ? "border-[#2563EB] text-[#2563EB]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>1. Permissions Matrix (RBAC)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("users")}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "users"
                ? "border-[#2563EB] text-[#2563EB]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>2. Users & Assigned Roles ({usersAccess.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("audit")}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "audit"
                ? "border-[#2563EB] text-[#2563EB]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>3. Access Audit Logs ({auditLogs.length})</span>
          </button>
        </div>
      </div>

      {/* ================= TAB 1: PERMISSIONS MATRIX ================= */}
      {activeTab === "matrix" && selectedRole && (
        <div className="space-y-4">
          {/* Horizontal Role Selector Pills */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Select Role to Configure Permissions
              </span>
              <span className="text-[11px] text-slate-400">
                Click any role to inspect or modify its policy matrix
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {roles.map((r) => {
                const isSelected = r.id === selectedRole.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedRoleId(r.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                      isSelected
                        ? "bg-[#2563EB] text-white shadow-xs"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    <Shield className="h-3.5 w-3.5" />
                    <span>{r.name}</span>
                    {r.isSystem && (
                      <span
                        className={`text-[9px] px-1 rounded uppercase font-bold ${
                          isSelected ? "bg-blue-700 text-white" : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        System
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected Role Meta & Quick Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-slate-100">
              <div>
                <h4 className="text-sm font-bold text-slate-900">{selectedRole.name}</h4>
                <p className="text-xs text-slate-500 mt-0.5">{selectedRole.description}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleToggleAllPermissionsForRole(true)}
                  className="px-2.5 py-1 rounded border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Grant All
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleAllPermissionsForRole(false)}
                  className="px-2.5 py-1 rounded border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Revoke All
                </button>
              </div>
            </div>
          </div>

          {/* Granular Permissions Matrix Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-900">
                  Granular Module Access Matrix: {selectedRole.name}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Toggle individual actions to fine-tune access for this role.
                </p>
              </div>
              <span className="text-[11px] text-blue-600 font-medium">
                Changes apply instantly in UI state
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3 w-1/3">Module Name</th>
                    <th className="px-3 py-3 text-center">View / Read</th>
                    <th className="px-3 py-3 text-center">Create / Add</th>
                    <th className="px-3 py-3 text-center">Edit / Update</th>
                    <th className="px-3 py-3 text-center">Delete / Remove</th>
                    <th className="px-3 py-3 text-center">Approve / Export</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {modulesList.map((mod) => {
                    const modPerms: ModulePermission = selectedRole.permissions[mod.key] || {
                      view: false,
                      create: false,
                      edit: false,
                      delete: false,
                      approve: false,
                    };
                    const IconComp = mod.icon;

                    return (
                      <tr key={mod.key} className="hover:bg-slate-50/80 transition-colors">
                        {/* Module Info */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                              <IconComp className="h-4 w-4" />
                            </div>
                            <div>
                              <span className="font-bold text-slate-900 block">
                                {mod.title}
                              </span>
                              <span className="text-[11px] text-slate-400 block">
                                {mod.description}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* View Action Toggle */}
                        <td className="px-3 py-3.5 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              updateRolePermission(
                                selectedRole.id,
                                mod.key,
                                "view",
                                !modPerms.view
                              )
                            }
                            className={`h-6 w-11 rounded-full p-0.5 transition-colors inline-flex items-center ${
                              modPerms.view ? "bg-emerald-600" : "bg-slate-300"
                            }`}
                            title="Toggle View Permission"
                          >
                            <span
                              className={`h-5 w-5 rounded-full bg-white shadow-xs transition-transform transform ${
                                modPerms.view ? "translate-x-5" : "translate-x-0"
                              } flex items-center justify-center text-[10px]`}
                            >
                              {modPerms.view ? (
                                <Check className="h-3 w-3 text-emerald-600 font-bold" />
                              ) : (
                                <X className="h-3 w-3 text-slate-400" />
                              )}
                            </span>
                          </button>
                        </td>

                        {/* Create Action Toggle */}
                        <td className="px-3 py-3.5 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              updateRolePermission(
                                selectedRole.id,
                                mod.key,
                                "create",
                                !modPerms.create
                              )
                            }
                            className={`h-6 w-11 rounded-full p-0.5 transition-colors inline-flex items-center ${
                              modPerms.create ? "bg-blue-600" : "bg-slate-300"
                            }`}
                            title="Toggle Create Permission"
                          >
                            <span
                              className={`h-5 w-5 rounded-full bg-white shadow-xs transition-transform transform ${
                                modPerms.create ? "translate-x-5" : "translate-x-0"
                              } flex items-center justify-center text-[10px]`}
                            >
                              {modPerms.create ? (
                                <Check className="h-3 w-3 text-blue-600 font-bold" />
                              ) : (
                                <X className="h-3 w-3 text-slate-400" />
                              )}
                            </span>
                          </button>
                        </td>

                        {/* Edit Action Toggle */}
                        <td className="px-3 py-3.5 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              updateRolePermission(
                                selectedRole.id,
                                mod.key,
                                "edit",
                                !modPerms.edit
                              )
                            }
                            className={`h-6 w-11 rounded-full p-0.5 transition-colors inline-flex items-center ${
                              modPerms.edit ? "bg-amber-600" : "bg-slate-300"
                            }`}
                            title="Toggle Edit Permission"
                          >
                            <span
                              className={`h-5 w-5 rounded-full bg-white shadow-xs transition-transform transform ${
                                modPerms.edit ? "translate-x-5" : "translate-x-0"
                              } flex items-center justify-center text-[10px]`}
                            >
                              {modPerms.edit ? (
                                <Check className="h-3 w-3 text-amber-600 font-bold" />
                              ) : (
                                <X className="h-3 w-3 text-slate-400" />
                              )}
                            </span>
                          </button>
                        </td>

                        {/* Delete Action Toggle */}
                        <td className="px-3 py-3.5 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              updateRolePermission(
                                selectedRole.id,
                                mod.key,
                                "delete",
                                !modPerms.delete
                              )
                            }
                            className={`h-6 w-11 rounded-full p-0.5 transition-colors inline-flex items-center ${
                              modPerms.delete ? "bg-rose-600" : "bg-slate-300"
                            }`}
                            title="Toggle Delete Permission"
                          >
                            <span
                              className={`h-5 w-5 rounded-full bg-white shadow-xs transition-transform transform ${
                                modPerms.delete ? "translate-x-5" : "translate-x-0"
                              } flex items-center justify-center text-[10px]`}
                            >
                              {modPerms.delete ? (
                                <Check className="h-3 w-3 text-rose-600 font-bold" />
                              ) : (
                                <X className="h-3 w-3 text-slate-400" />
                              )}
                            </span>
                          </button>
                        </td>

                        {/* Approve Action Toggle */}
                        <td className="px-3 py-3.5 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              updateRolePermission(
                                selectedRole.id,
                                mod.key,
                                "approve",
                                !modPerms.approve
                              )
                            }
                            className={`h-6 w-11 rounded-full p-0.5 transition-colors inline-flex items-center ${
                              modPerms.approve ? "bg-purple-600" : "bg-slate-300"
                            }`}
                            title="Toggle Approve/Export Permission"
                          >
                            <span
                              className={`h-5 w-5 rounded-full bg-white shadow-xs transition-transform transform ${
                                modPerms.approve ? "translate-x-5" : "translate-x-0"
                              } flex items-center justify-center text-[10px]`}
                            >
                              {modPerms.approve ? (
                                <Check className="h-3 w-3 text-purple-600 font-bold" />
                              ) : (
                                <X className="h-3 w-3 text-slate-400" />
                              )}
                            </span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
              <span>
                Configuring policies for role: <strong>{selectedRole.name}</strong>
              </span>
              <button
                type="button"
                onClick={() =>
                  showToast("Policy Saved", `Permissions policy for ${selectedRole.name} confirmed.`, "success")
                }
                className="px-3.5 py-1.5 rounded-lg bg-[#2563EB] text-white text-xs font-semibold hover:bg-[#1d4ed8]"
              >
                Save Policy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 2: USERS & ASSIGNED ROLES ================= */}
      {activeTab === "users" && (
        <div className="space-y-4">
          {/* Filter Toolbar */}
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search user name or email..."
                  className="h-9 w-full rounded-lg border border-slate-200 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>

              {/* Department Filter */}
              <div>
                <select
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                >
                  <option value="all">All Departments</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              {/* Role Filter */}
              <div>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                >
                  <option value="all">All Security Roles</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reset or count */}
              <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-slate-500">
                {(userSearch || deptFilter !== "all" || roleFilter !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      setUserSearch("");
                      setDeptFilter("all");
                      setRoleFilter("all");
                    }}
                    className="text-blue-600 hover:underline font-semibold"
                  >
                    Clear Filters
                  </button>
                )}
                <span>
                  Total: <strong>{filteredUsers.length}</strong> staff
                </span>
              </div>
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            {filteredUsers.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No users found matching your filter criteria.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3">Staff Member</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Assigned Role</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3">Last Active</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((user) => {
                    const assignedRole = roles.find((r) => r.id === user.roleId);
                    const initials = user.name
                      .split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("");

                    return (
                      <tr key={user.id} className="hover:bg-slate-50/80 transition-colors">
                        {/* User info */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0 uppercase">
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

                        {/* Department */}
                        <td className="px-4 py-3.5 text-slate-600">
                          {user.department}
                        </td>

                        {/* Assigned Role */}
                        <td className="px-4 py-3.5">
                          {assignedRole ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                              <Shield className="h-3 w-3" />
                              {assignedRole.name}
                            </span>
                          ) : (
                            <span className="text-slate-400">Unassigned</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              user.status === "Active"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : user.status === "Suspended"
                                ? "bg-rose-50 text-rose-700 border border-rose-200"
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
                        </td>

                        {/* Last Login */}
                        <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap">
                          {user.lastLogin}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Toggle Suspend / Activate */}
                            <button
                              type="button"
                              onClick={() => {
                                const nextStatus: UserStatus =
                                  user.status === "Active" ? "Suspended" : "Active";
                                updateUserAccess(user.id, { status: nextStatus });
                              }}
                              className="p-1 rounded text-slate-400 hover:text-slate-700"
                              title={user.status === "Active" ? "Suspend Access" : "Activate Access"}
                            >
                              {user.status === "Active" ? (
                                <UserX className="h-4 w-4 text-rose-500" />
                              ) : (
                                <UserCheck className="h-4 w-4 text-emerald-600" />
                              )}
                            </button>

                            {/* Edit */}
                            <button
                              type="button"
                              onClick={() => setEditingUser(user)}
                              className="p-1 rounded text-slate-400 hover:text-blue-600"
                              title="Edit User Role"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>

                            {/* Delete */}
                            <button
                              type="button"
                              onClick={() => deleteUserAccess(user.id)}
                              className="p-1 rounded text-slate-400 hover:text-rose-600"
                              title="Revoke User"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 3: ACCESS AUDIT LOGS ================= */}
      {activeTab === "audit" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-900">Security & Access Audit Trail</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Chronological event log tracking role modifications, user permissions, and logins.
                </p>
              </div>
              <span className="text-[11px] text-slate-500">
                Total <strong>{auditLogs.length}</strong> logged events
              </span>
            </div>

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
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        <span>{log.timestamp}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-slate-900">
                      {log.user}
                    </td>
                    <td className="px-4 py-3.5 text-slate-700">
                      <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded text-[11px] font-medium">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[11px] text-blue-700">
                      {log.target}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-[11px] text-slate-500">
                      {log.ipAddress}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= MODAL: INVITE / ADD USER ================= */}
      <Modal
        isOpen={isInviteUserOpen}
        onClose={() => setIsInviteUserOpen(false)}
        title="Invite / Add User Access"
        description="Provision access credentials and assign a role to a staff member."
        maxWidth="md"
      >
        <form onSubmit={handleInviteUserSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Full Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              placeholder="e.g. Johnathan Silva"
              required
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
            {userErrors.name && (
              <p className="text-[10px] text-rose-500 mt-0.5">{userErrors.name}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Work Email <span className="text-rose-500">*</span>
            </label>
            <input
              type="email"
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.target.value)}
              placeholder="e.g. john@reflectivesolutions.com"
              required
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
            {userErrors.email && (
              <p className="text-[10px] text-rose-500 mt-0.5">{userErrors.email}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Department
              </label>
              <select
                value={newUserDept}
                onChange={(e) => setNewUserDept(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
              >
                <option value="Executive Management">Executive Management</option>
                <option value="Project Operations">Project Operations</option>
                <option value="Finance & Accounts">Finance & Accounts</option>
                <option value="Field Engineering">Field Engineering</option>
                <option value="Internal Compliance">Internal Compliance</option>
                <option value="Procurement">Procurement</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Security Role <span className="text-rose-500">*</span>
              </label>
              <select
                value={newUserRoleId}
                onChange={(e) => setNewUserRoleId(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsInviteUserOpen(false)}
              className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-8 px-4 rounded-lg bg-[#2563EB] text-xs font-semibold text-white hover:bg-[#1d4ed8]"
            >
              Add User
            </button>
          </div>
        </form>
      </Modal>

      {/* ================= MODAL: CREATE CUSTOM ROLE ================= */}
      <Modal
        isOpen={isCreateRoleOpen}
        onClose={() => setIsCreateRoleOpen(false)}
        title="Create Custom Security Role"
        description="Add a new role tier and inherit baseline policies from an existing role."
        maxWidth="md"
      >
        <form onSubmit={handleCreateRoleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Role Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              placeholder="e.g. Quality Inspector"
              required
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
            {roleErrors.name && (
              <p className="text-[10px] text-rose-500 mt-0.5">{roleErrors.name}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Description / Responsibilities
            </label>
            <textarea
              rows={2}
              value={newRoleDesc}
              onChange={(e) => setNewRoleDesc(e.target.value)}
              placeholder="Outline what users with this role can do..."
              className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Clone Baseline From
              </label>
              <select
                value={cloneFromRoleId}
                onChange={(e) => setCloneFromRoleId(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Badge Color
              </label>
              <select
                value={newRoleColor}
                onChange={(e) => setNewRoleColor(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
              >
                <option value="blue">Blue</option>
                <option value="purple">Purple</option>
                <option value="emerald">Emerald Green</option>
                <option value="amber">Amber / Orange</option>
                <option value="rose">Rose Red</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsCreateRoleOpen(false)}
              className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-8 px-4 rounded-lg bg-[#2563EB] text-xs font-semibold text-white hover:bg-[#1d4ed8]"
            >
              Create Role
            </button>
          </div>
        </form>
      </Modal>

      {/* ================= MODAL: EDIT USER ROLE ================= */}
      {editingUser && (
        <Modal
          isOpen={true}
          onClose={() => setEditingUser(null)}
          title={`Edit Access: ${editingUser.name}`}
          maxWidth="md"
        >
          <form onSubmit={handleSaveUserEdit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={editingUser.name}
                onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                required
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Work Email
              </label>
              <input
                type="email"
                value={editingUser.email}
                onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                required
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Assigned Security Role
                </label>
                <select
                  value={editingUser.roleId}
                  onChange={(e) => setEditingUser({ ...editingUser, roleId: e.target.value })}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Access Status
                </label>
                <select
                  value={editingUser.status}
                  onChange={(e) =>
                    setEditingUser({ ...editingUser, status: e.target.value as UserStatus })
                  }
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                >
                  <option value="Active">Active</option>
                  <option value="Suspended">Suspended</option>
                  <option value="Pending">Pending</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-8 px-4 rounded-lg bg-[#2563EB] text-xs font-semibold text-white hover:bg-[#1d4ed8]"
              >
                Save Changes
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
