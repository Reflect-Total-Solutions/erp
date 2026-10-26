"use client";

import React, { useState } from "react";
import { Modal } from "@/components/admin/ui/modal";
import { useAdminData } from "@/context/admin-data-context";
import { Building2, Hash, User, Phone, Mail, MapPin, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
import { supplierCreateSchema } from "@/lib/validations/supplier";
import { Supplier } from "@/types/admin";

interface RegisterSupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSupplierCreated?: (newSupplierId: string) => void;
}

// Compute smart suggested code based on highest SUP-XX
function getSuggestedCode(suppliers: Supplier[]): string {
  const existingNums = suppliers
    .map((s) => {
      const match = s.code.match(/(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter((n) => !isNaN(n));
  const maxNum = existingNums.length > 0 ? Math.max(...existingNums) : 0;
  return `SUP-${String(maxNum + 1).padStart(2, "0")}`;
}

function RegisterSupplierForm({
  onClose,
  onSupplierCreated,
}: {
  onClose: () => void;
  onSupplierCreated?: (newSupplierId: string) => void;
}) {
  const { addSupplier, suppliers, showToast } = useAdminData();

  const [name, setName] = useState("");
  const [code, setCode] = useState(() => getSuggestedCode(suppliers));
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [taxId, setTaxId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Deep client-side validation
  const validateForm = (): boolean => {
    const validationResult = supplierCreateSchema.safeParse({
      name,
      code,
      contactPerson,
      phone,
      email,
      address,
      taxId: taxId || null,
      isActive: true,
    });

    if (!validationResult.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of validationResult.error.issues) {
        const key = issue.path[0] ? String(issue.path[0]) : "general";
        if (!fieldErrors[key]) {
          fieldErrors[key] = issue.message;
        }
      }
      setErrors(fieldErrors);
      setGeneralError("Please resolve the highlighted field errors.");
      showToast("Validation Error", "Please correct the highlighted form errors.", "error");
      return false;
    }

    // Check duplicate code against loaded active suppliers
    const normalizedCode = code.trim().toUpperCase();
    const duplicateCode = suppliers.some(
      (s) => !s.isDeleted && s.code.toUpperCase() === normalizedCode
    );
    if (duplicateCode) {
      setErrors((prev) => ({
        ...prev,
        code: `Supplier code "${normalizedCode}" is already in use by an active supplier.`,
      }));
      setGeneralError(`Supplier code "${normalizedCode}" is already taken.`);
      return false;
    }

    // Check duplicate email against loaded active suppliers
    const normalizedEmail = email.trim().toLowerCase();
    const duplicateEmail = suppliers.some(
      (s) => !s.isDeleted && s.email.toLowerCase() === normalizedEmail
    );
    if (duplicateEmail) {
      setErrors((prev) => ({
        ...prev,
        email: `Supplier with email "${normalizedEmail}" is already registered.`,
      }));
      setGeneralError(`Email "${normalizedEmail}" is already registered.`);
      return false;
    }

    setErrors({});
    setGeneralError("");
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!validateForm()) return;

    setIsSubmitting(true);
    setGeneralError("");

    const payload = {
      name: name.trim(),
      code: code.trim().toUpperCase(),
      contactPerson: contactPerson.trim(),
      phone: phone.trim(),
      email: email.trim().toLowerCase(),
      address: address.trim(),
      taxId: taxId.trim() || undefined,
      isActive: true,
    };

    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.fieldErrors) {
          setErrors(data.fieldErrors);
        }
        setGeneralError(data.error || "Failed to register supplier.");
        showToast("Registration Failed", data.error || "Validation error.", "error");
        setIsSubmitting(false);
        return;
      }

      // Add to context list with real database ID
      addSupplier(data.data);

      showToast(
        "Supplier Registered",
        `"${payload.name}" (${payload.code}) has been saved to the database.`,
        "success"
      );

      onClose();
      if (onSupplierCreated && data.data?.id) {
        onSupplierCreated(data.data.id);
      }
    } catch (err) {
      console.error("Error creating supplier:", err);
      // Fallback: add locally via context
      const created = addSupplier(payload);
      onClose();
      if (onSupplierCreated) {
        onSupplierCreated(created.id);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {generalError && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 animate-in fade-in duration-200">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{generalError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Supplier Name */}
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Supplier Name <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={name}
              disabled={isSubmitting}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((prev) => ({ ...prev, name: "" }));
                if (generalError) setGeneralError("");
              }}
              placeholder="e.g. Apex Industrial Solutions Ltd"
              className={`h-9 w-full rounded-lg border bg-white pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors disabled:opacity-60 ${
                errors.name
                  ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                  : "border-slate-200 focus:border-blue-600 focus:ring-blue-600/20"
              }`}
            />
          </div>
          {errors.name && <p className="mt-1 text-[11px] text-rose-600">{errors.name}</p>}
        </div>

        {/* Supplier Code */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Supplier Code <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={code}
              disabled={isSubmitting}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                if (errors.code) setErrors((prev) => ({ ...prev, code: "" }));
                if (generalError) setGeneralError("");
              }}
              placeholder="e.g. SUP-06"
              className={`h-9 w-full rounded-lg border bg-white pl-9 pr-3 text-xs font-mono uppercase text-slate-900 focus:outline-none focus:ring-2 transition-colors disabled:opacity-60 ${
                errors.code
                  ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                  : "border-slate-200 focus:border-blue-600 focus:ring-blue-600/20"
              }`}
            />
          </div>
          {errors.code && <p className="mt-1 text-[11px] text-rose-600">{errors.code}</p>}
        </div>

        {/* Contact Person */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Contact Person <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={contactPerson}
              disabled={isSubmitting}
              onChange={(e) => {
                setContactPerson(e.target.value);
                if (errors.contactPerson) setErrors((prev) => ({ ...prev, contactPerson: "" }));
                if (generalError) setGeneralError("");
              }}
              placeholder="e.g. Ruwan Weerasinghe"
              className={`h-9 w-full rounded-lg border bg-white pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors disabled:opacity-60 ${
                errors.contactPerson
                  ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                  : "border-slate-200 focus:border-blue-600 focus:ring-blue-600/20"
              }`}
            />
          </div>
          {errors.contactPerson && (
            <p className="mt-1 text-[11px] text-rose-600">{errors.contactPerson}</p>
          )}
        </div>

        {/* Phone Number */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Phone Number <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={phone}
              disabled={isSubmitting}
              onChange={(e) => {
                setPhone(e.target.value);
                if (errors.phone) setErrors((prev) => ({ ...prev, phone: "" }));
                if (generalError) setGeneralError("");
              }}
              placeholder="e.g. 077 456 7890 or +94 11 234 5678"
              className={`h-9 w-full rounded-lg border bg-white pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors disabled:opacity-60 ${
                errors.phone
                  ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                  : "border-slate-200 focus:border-blue-600 focus:ring-blue-600/20"
              }`}
            />
          </div>
          {errors.phone && <p className="mt-1 text-[11px] text-rose-600">{errors.phone}</p>}
        </div>

        {/* Email Address */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Email Address <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="email"
              value={email}
              disabled={isSubmitting}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors((prev) => ({ ...prev, email: "" }));
                if (generalError) setGeneralError("");
              }}
              placeholder="e.g. ruwan@apexsolutions.lk"
              className={`h-9 w-full rounded-lg border bg-white pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors disabled:opacity-60 ${
                errors.email
                  ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                  : "border-slate-200 focus:border-blue-600 focus:ring-blue-600/20"
              }`}
            />
          </div>
          {errors.email && <p className="mt-1 text-[11px] text-rose-600">{errors.email}</p>}
        </div>

        {/* Business Address */}
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Business Address <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <textarea
              rows={2}
              value={address}
              disabled={isSubmitting}
              onChange={(e) => {
                setAddress(e.target.value);
                if (errors.address) setErrors((prev) => ({ ...prev, address: "" }));
                if (generalError) setGeneralError("");
              }}
              placeholder="e.g. No 142/A, Industrial Park, Biyagama, Sri Lanka"
              className={`w-full rounded-lg border bg-white pl-9 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors disabled:opacity-60 ${
                errors.address
                  ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                  : "border-slate-200 focus:border-blue-600 focus:ring-blue-600/20"
              }`}
            />
          </div>
          {errors.address && <p className="mt-1 text-[11px] text-rose-600">{errors.address}</p>}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="h-9 px-4 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center gap-1.5 h-9 px-5 rounded-lg bg-[#2563EB] text-xs font-semibold text-white shadow-xs hover:bg-[#1d4ed8] active:bg-[#1e40af] transition-colors cursor-pointer disabled:opacity-60"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Saving to Database...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Register Supplier</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}

export function RegisterSupplierModal({
  isOpen,
  onClose,
  onSupplierCreated,
}: RegisterSupplierModalProps) {
  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Register New Supplier"
      description="Add a certified trade vendor or procurement partner to the database with soft-delete support."
      maxWidth="xl"
    >
      <RegisterSupplierForm onClose={onClose} onSupplierCreated={onSupplierCreated} />
    </Modal>
  );
}
