"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Plus,
  Edit2,
  Trash2,
  RotateCcw,
  AlertTriangle,
  Building2,
  Hash,
  User,
  Phone,
  Mail,
  MapPin,
  Archive,
  CheckCircle2,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import { useAdminData } from "@/context/admin-data-context";
import { Modal } from "@/components/admin/ui/modal";
import { Pagination } from "@/components/admin/ui/pagination";
import { SearchField } from "@/components/admin/ui/search-field";
import { TableSkeleton } from "@/components/ui/loading/table-skeleton";
import { RegisterSupplierModal } from "@/components/admin/modals/register-supplier-modal";
import { Supplier } from "@/types/admin";
import { supplierCreateSchema } from "@/lib/validations/supplier";

export function SuppliersView() {
  const {
    suppliers,
    jobs,
    isLoadingSuppliers,
    updateSupplier,
    softDeleteSupplier,
    restoreSupplier,
    permanentlyDeleteSupplier,
    showToast,
    can,
    currentRole,
  } = useAdminData();

  // Tab: "active" | "trash"
  const [activeTab, setActiveTab] = useState<"active" | "trash">("active");

  // Search
  const [searchTerm, setSearchTerm] = useState("");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modals
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [softDeletingSupplier, setSoftDeletingSupplier] = useState<Supplier | null>(null);
  const [permanentDeletingSupplier, setPermanentDeletingSupplier] = useState<Supplier | null>(null);

  // Async action processing states
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isSoftDeleting, setIsSoftDeleting] = useState(false);
  const [isPermanentDeleting, setIsPermanentDeleting] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editContact, setEditContact] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  const handleOpenEdit = (sup: Supplier) => {
    setEditingSupplier(sup);
    setEditName(sup.name);
    setEditCode(sup.code);
    setEditContact(sup.contactPerson);
    setEditPhone(sup.phone);
    setEditEmail(sup.email);
    setEditAddress(sup.address);
    setEditErrors({});
  };

  const validateEdit = (): boolean => {
    if (!editingSupplier) return false;
    const errs: Record<string, string> = {};

    const trimmedCode = editCode.trim().toUpperCase();
    const trimmedEmail = editEmail.trim().toLowerCase();

    // 1. Deep Schema validation via Zod
    const parsed = supplierCreateSchema.safeParse({
      name: editName,
      code: trimmedCode,
      contactPerson: editContact,
      phone: editPhone,
      email: trimmedEmail,
      address: editAddress,
      isActive: true,
    });

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] ? String(issue.path[0]) : "general";
        if (!errs[key]) {
          errs[key] = issue.message;
        }
      }
    }

    // 2. Uniqueness checks among other active suppliers
    if (!errs.code) {
      const duplicateCode = suppliers.some(
        (s) => s.id !== editingSupplier.id && !s.isDeleted && s.code.toUpperCase() === trimmedCode
      );
      if (duplicateCode) {
        errs.code = `Code "${trimmedCode}" is already in use by another active supplier.`;
      }
    }

    if (!errs.email) {
      const duplicateEmail = suppliers.some(
        (s) => s.id !== editingSupplier.id && !s.isDeleted && s.email.toLowerCase() === trimmedEmail
      );
      if (duplicateEmail) {
        errs.email = `Email "${trimmedEmail}" is already in use by another active supplier.`;
      }
    }

    setEditErrors(errs);
    if (Object.keys(errs).length > 0) {
      showToast("Validation Error", "Please correct the highlighted form errors.", "error");
      return false;
    }
    return true;
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEdit() || !editingSupplier) return;

    setIsSavingEdit(true);
    try {
      await updateSupplier(editingSupplier.id, {
        name: editName.trim(),
        code: editCode.trim().toUpperCase(),
        contactPerson: editContact.trim(),
        phone: editPhone.trim(),
        email: editEmail.trim().toLowerCase(),
        address: editAddress.trim(),
      });
      setEditingSupplier(null);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleConfirmSoftDelete = async () => {
    if (!softDeletingSupplier) return;
    setIsSoftDeleting(true);
    try {
      await softDeleteSupplier(softDeletingSupplier.id);
      setSoftDeletingSupplier(null);
    } finally {
      setIsSoftDeleting(false);
    }
  };

  const handleConfirmPermanentDelete = async () => {
    if (!permanentDeletingSupplier) return;
    setIsPermanentDeleting(true);
    try {
      await permanentlyDeleteSupplier(permanentDeletingSupplier.id);
      setPermanentDeletingSupplier(null);
    } finally {
      setIsPermanentDeleting(false);
    }
  };

  const handleRestore = async (id: string) => {
    setRestoringId(id);
    try {
      await restoreSupplier(id);
    } finally {
      setRestoringId(null);
    }
  };

  // Counts
  const activeCount = useMemo(() => suppliers.filter((s) => !s.isDeleted).length, [suppliers]);
  const trashCount = useMemo(() => suppliers.filter((s) => s.isDeleted).length, [suppliers]);

  // Filtered suppliers based on tab and search
  const tabSuppliers = useMemo(() => {
    if (activeTab === "active") {
      return suppliers.filter((s) => !s.isDeleted);
    }
    return suppliers.filter((s) => s.isDeleted);
  }, [suppliers, activeTab]);

  const filteredSuppliers = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return tabSuppliers;

    return tabSuppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        s.contactPerson.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q)
    );
  }, [tabSuppliers, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredSuppliers.length / pageSize));
  const paginatedSuppliers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSuppliers.slice(start, start + pageSize);
  }, [filteredSuppliers, currentPage, pageSize]);

  if (!can("suppliers", "view")) {
    return (
      <div className="flex flex-col items-center justify-center p-10 bg-white rounded-2xl border border-slate-200 text-center max-w-lg mx-auto mt-8 shadow-xs">
        <div className="h-14 w-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
          You do not have authorization to view or manage the Supplier Registry. Contact your system administrator if access is needed.
        </p>
        <div className="mt-4 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
          Active Role: <span className="font-bold text-blue-600 capitalize">{currentRole}</span>
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
          <h2 className="text-xl font-bold text-slate-900">Supplier Registry</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Registered trade vendors, contractors, and procurement partners.
          </p>
        </div>

        {can("suppliers", "create") && (
          <button
            type="button"
            onClick={() => setIsRegisterOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1d4ed8] active:bg-[#1e40af] transition-colors shrink-0 shadow-xs cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Register New Supplier
          </button>
        )}
      </div>

      {/* Tabs & Search Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Active vs Trash View Toggle */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setActiveTab("active");
                setCurrentPage(1);
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "active"
                  ? "bg-white text-blue-600 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Active Suppliers</span>
              <span className="rounded-full bg-blue-100 text-blue-700 px-1.5 py-0.2 text-[10px] font-bold">
                {activeCount}
              </span>
            </button>

            {can("suppliers", "delete") && (
              <button
                type="button"
                onClick={() => {
                  setActiveTab("trash");
                  setCurrentPage(1);
                }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === "trash"
                    ? "bg-white text-rose-600 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Archive className="h-3.5 w-3.5" />
                <span>Trash / Archived</span>
                <span className="rounded-full bg-slate-200 text-slate-700 px-1.5 py-0.2 text-[10px] font-bold">
                  {trashCount}
                </span>
              </button>
            )}
          </div>

          <div className="w-full sm:w-72">
            <SearchField
              value={searchTerm}
              isLoading={isLoadingSuppliers}
              onChange={(val) => {
                setSearchTerm(val);
                setCurrentPage(1);
              }}
              placeholder="Search by name, code, contact..."
            />
          </div>
        </div>
      </div>

      {/* Suppliers Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        {isLoadingSuppliers && suppliers.length === 0 ? (
          <TableSkeleton rows={6} columns={7} />
        ) : filteredSuppliers.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            {activeTab === "active" ? (
              <div>
                <Building2 className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                <p className="font-semibold text-slate-700">No active suppliers found</p>
                <p className="text-slate-400 mt-0.5">Click &quot;Register New Supplier&quot; to add your first supplier.</p>
              </div>
            ) : (
              <div>
                <Archive className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                <p className="font-semibold text-slate-700">Trash is empty</p>
                <p className="text-slate-400 mt-0.5">No suppliers have been soft-deleted.</p>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3">Code</th>
                    <th className="px-4 py-3">Supplier Name</th>
                    <th className="px-4 py-3">Contact Person</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedSuppliers.map((s) => {
                    const jobCount = jobs.filter((j) => j.supplierIds.includes(s.id)).length;

                    return (
                      <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3.5 font-mono font-bold text-blue-600">
                          {s.code}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="font-semibold text-slate-900 block">
                            {s.name}
                          </span>
                          <span className="text-[10px] text-slate-400 truncate block max-w-xs">
                            {s.address}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-slate-700 font-medium">
                          {s.contactPerson}
                        </td>
                        <td className="px-4 py-3.5 text-slate-600 font-mono">
                          {s.phone}
                        </td>
                        <td className="px-4 py-3.5 text-slate-600">
                          {s.email}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {s.isDeleted ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                              Soft-Deleted
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              Active ({jobCount} {jobCount === 1 ? "Job" : "Jobs"})
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {!s.isDeleted ? (
                              <>
                                {can("suppliers", "edit") && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEdit(s)}
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 transition-colors cursor-pointer"
                                    title="Edit Supplier"
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {can("suppliers", "delete") && (
                                  <button
                                    type="button"
                                    onClick={() => setSoftDeletingSupplier(s)}
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                    title="Soft Delete Supplier"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {!can("suppliers", "edit") && !can("suppliers", "delete") && (
                                  <span className="text-[11px] text-slate-400 italic">View only</span>
                                )}
                              </>
                            ) : (
                              <>
                                {can("suppliers", "delete") && (
                                  <>
                                    <button
                                      type="button"
                                      disabled={restoringId === s.id}
                                      onClick={() => handleRestore(s.id)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors cursor-pointer disabled:opacity-50"
                                      title="Restore to Active"
                                    >
                                      {restoringId === s.id ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <RotateCcw className="h-3 w-3" />
                                      )}
                                      <span>{restoringId === s.id ? "Restoring..." : "Restore"}</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setPermanentDeletingSupplier(s)}
                                      className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                      title="Permanently Delete"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </>
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

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredSuppliers.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setCurrentPage(1);
              }}
            />
          </>
        )}
      </div>

      {/* Register Supplier Modal */}
      <RegisterSupplierModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
      />

      {/* Edit Supplier Modal */}
      {editingSupplier && (
        <Modal
          isOpen={true}
          onClose={() => setEditingSupplier(null)}
          title="Edit Supplier Details"
          description={`Update verified credentials for ${editingSupplier.name}.`}
          maxWidth="md"
        >
          <form onSubmit={handleSaveEdit} className="space-y-3.5" noValidate>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Supplier Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => {
                    setEditName(e.target.value);
                    if (editErrors.name) setEditErrors((prev) => ({ ...prev, name: "" }));
                  }}
                  className={`h-9 w-full rounded-lg border bg-white pl-8 pr-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 transition-colors ${
                    editErrors.name
                      ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                      : "border-slate-200 focus:border-blue-600 focus:ring-blue-600/20"
                  }`}
                />
              </div>
              {editErrors.name && <p className="mt-1 text-[11px] text-rose-600">{editErrors.name}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Supplier Code <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={editCode}
                    onChange={(e) => {
                      setEditCode(e.target.value.toUpperCase());
                      if (editErrors.code) setEditErrors((prev) => ({ ...prev, code: "" }));
                    }}
                    className={`h-9 w-full rounded-lg border bg-white pl-8 pr-2.5 text-xs font-mono uppercase text-slate-900 focus:outline-none focus:ring-2 transition-colors ${
                      editErrors.code
                        ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                        : "border-slate-200 focus:border-blue-600 focus:ring-blue-600/20"
                    }`}
                  />
                </div>
                {editErrors.code && <p className="mt-1 text-[11px] text-rose-600">{editErrors.code}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Contact Person <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={editContact}
                    onChange={(e) => {
                      setEditContact(e.target.value);
                      if (editErrors.contact) setEditErrors((prev) => ({ ...prev, contact: "" }));
                    }}
                    className={`h-9 w-full rounded-lg border bg-white pl-8 pr-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 transition-colors ${
                      editErrors.contact
                        ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                        : "border-slate-200 focus:border-blue-600 focus:ring-blue-600/20"
                    }`}
                  />
                </div>
                {editErrors.contact && <p className="mt-1 text-[11px] text-rose-600">{editErrors.contact}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Phone Number <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => {
                      setEditPhone(e.target.value);
                      if (editErrors.phone) setEditErrors((prev) => ({ ...prev, phone: "" }));
                    }}
                    className={`h-9 w-full rounded-lg border bg-white pl-8 pr-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 transition-colors ${
                      editErrors.phone
                        ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                        : "border-slate-200 focus:border-blue-600 focus:ring-blue-600/20"
                    }`}
                  />
                </div>
                {editErrors.phone && <p className="mt-1 text-[11px] text-rose-600">{editErrors.phone}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Address <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => {
                      setEditEmail(e.target.value);
                      if (editErrors.email) setEditErrors((prev) => ({ ...prev, email: "" }));
                    }}
                    className={`h-9 w-full rounded-lg border bg-white pl-8 pr-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 transition-colors ${
                      editErrors.email
                        ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                        : "border-slate-200 focus:border-blue-600 focus:ring-blue-600/20"
                    }`}
                  />
                </div>
                {editErrors.email && <p className="mt-1 text-[11px] text-rose-600">{editErrors.email}</p>}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Business Address <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <MapPin className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <textarea
                  rows={2}
                  value={editAddress}
                  onChange={(e) => {
                    setEditAddress(e.target.value);
                    if (editErrors.address) setEditErrors((prev) => ({ ...prev, address: "" }));
                  }}
                  className={`w-full rounded-lg border bg-white pl-8 pr-2.5 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 transition-colors ${
                    editErrors.address
                      ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                      : "border-slate-200 focus:border-blue-600 focus:ring-blue-600/20"
                  }`}
                />
              </div>
              {editErrors.address && <p className="mt-1 text-[11px] text-rose-600">{editErrors.address}</p>}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditingSupplier(null)}
                disabled={isSavingEdit}
                className="h-8 px-3.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingEdit}
                className="inline-flex items-center gap-1.5 h-8 px-4 rounded-lg bg-[#2563EB] text-xs font-semibold text-white hover:bg-[#1d4ed8] active:bg-[#1e40af] transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSavingEdit ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Changes</span>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Soft Delete Confirmation Modal */}
      {softDeletingSupplier && (
        <Modal
          isOpen={true}
          onClose={() => !isSoftDeleting && setSoftDeletingSupplier(null)}
          title="Soft Delete Supplier"
          maxWidth="sm"
        >
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-lg bg-amber-50 border border-amber-200 p-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 space-y-1">
                <p className="font-semibold">Move to Trash / Archive</p>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Moving <strong>{softDeletingSupplier.name}</strong> to the archive will remove them from active selection. All historical jobs, purchase orders, and past invoices will remain fully preserved.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setSoftDeletingSupplier(null)}
                disabled={isSoftDeleting}
                className="h-8 px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSoftDelete}
                disabled={isSoftDeleting}
                className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-amber-600 text-xs font-semibold text-white hover:bg-amber-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSoftDeleting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Archiving...</span>
                  </>
                ) : (
                  <span>Archive Supplier</span>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Permanent Delete Confirmation Modal */}
      {permanentDeletingSupplier && (
        <Modal
          isOpen={true}
          onClose={() => !isPermanentDeleting && setPermanentDeletingSupplier(null)}
          title="Permanently Delete Supplier"
          maxWidth="sm"
        >
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-lg bg-rose-50 border border-rose-200 p-3">
              <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs text-rose-900 space-y-1">
                <p className="font-semibold">Permanent Destruction Warning</p>
                <p className="text-[11px] text-rose-800 leading-relaxed">
                  Are you sure you want to permanently purge <strong>{permanentDeletingSupplier.name}</strong>? This action cannot be undone and will unassign them from all historical jobs.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setPermanentDeletingSupplier(null)}
                disabled={isPermanentDeleting}
                className="h-8 px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPermanentDelete}
                disabled={isPermanentDeleting}
                className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-rose-600 text-xs font-semibold text-white hover:bg-rose-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isPermanentDeleting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Permanently Delete</span>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
