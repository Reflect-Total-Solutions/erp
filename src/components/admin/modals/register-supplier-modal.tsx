"use client";

import React, { useState } from "react";
import { Modal } from "@/components/admin/ui/modal";
import { useAdminData } from "@/context/admin-data-context";
import { Building2, Hash, User, Phone, Mail, MapPin } from "lucide-react";

interface RegisterSupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSupplierCreated?: (newSupplierId: string) => void;
}

export function RegisterSupplierModal({
  isOpen,
  onClose,
  onSupplierCreated,
}: RegisterSupplierModalProps) {
  const { addSupplier, suppliers } = useAdminData();

  // Auto-generate next code suggestion
  const nextCodeNum = suppliers.length + 101;
  const suggestedCode = `SUP-${nextCodeNum}`;

  const [name, setName] = useState("");
  const [code, setCode] = useState(suggestedCode);
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Supplier Name is required.";
    if (!code.trim()) errs.code = "Supplier Code is required.";
    if (!contactPerson.trim()) errs.contactPerson = "Contact Person is required.";
    if (!phone.trim()) errs.phone = "Phone Number is required.";
    if (!email.trim()) {
      errs.email = "Email Address is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = "Please enter a valid email address.";
    }
    if (!address.trim()) errs.address = "Business Address is required.";

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const newSupplier = addSupplier({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      contactPerson: contactPerson.trim(),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
    });

    // Reset
    setName("");
    setCode(`SUP-${suppliers.length + 102}`);
    setContactPerson("");
    setPhone("");
    setEmail("");
    setAddress("");
    setErrors({});
    onClose();

    if (onSupplierCreated) {
      onSupplierCreated(newSupplier.id);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Register New Supplier"
      description="Add a certified supplier or trade vendor to the enterprise registry."
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Supplier Name */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
              Supplier Name <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errors.name) setErrors((prev) => ({ ...prev, name: "" }));
                }}
                placeholder="e.g. Apex Industrial Solutions"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
              />
            </div>
            {errors.name && <p className="mt-1 text-xs text-rose-500">{errors.name}</p>}
          </div>

          {/* Supplier Code */}
          <div>
            <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
              Supplier Code <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  if (errors.code) setErrors((prev) => ({ ...prev, code: "" }));
                }}
                placeholder="e.g. SUP-108"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs font-mono uppercase text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
              />
            </div>
            {errors.code && <p className="mt-1 text-xs text-rose-500">{errors.code}</p>}
          </div>

          {/* Contact Person */}
          <div>
            <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
              Contact Person <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={contactPerson}
                onChange={(e) => {
                  setContactPerson(e.target.value);
                  if (errors.contactPerson) setErrors((prev) => ({ ...prev, contactPerson: "" }));
                }}
                placeholder="e.g. Sarah Jenkins"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
              />
            </div>
            {errors.contactPerson && <p className="mt-1 text-xs text-rose-500">{errors.contactPerson}</p>}
          </div>

          {/* Phone Number */}
          <div>
            <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
              Phone Number <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (errors.phone) setErrors((prev) => ({ ...prev, phone: "" }));
                }}
                placeholder="e.g. +1 (555) 234-8901"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
              />
            </div>
            {errors.phone && <p className="mt-1 text-xs text-rose-500">{errors.phone}</p>}
          </div>

          {/* Email Address */}
          <div>
            <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
              Email Address <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors((prev) => ({ ...prev, email: "" }));
                }}
                placeholder="e.g. contact@supplier.com"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
              />
            </div>
            {errors.email && <p className="mt-1 text-xs text-rose-500">{errors.email}</p>}
          </div>

          {/* Business Address */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
              Business Address <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <textarea
                rows={2}
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  if (errors.address) setErrors((prev) => ({ ...prev, address: "" }));
                }}
                placeholder="e.g. 1850 Enterprise Pkwy, Chicago, IL 60607"
                className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
              />
            </div>
            {errors.address && <p className="mt-1 text-xs text-rose-500">{errors.address}</p>}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="h-9 px-5 rounded-xl bg-[#2563EB] text-xs font-semibold text-white shadow-xs hover:bg-[#1d4ed8] transition-colors"
          >
            Save Supplier
          </button>
        </div>
      </form>
    </Modal>
  );
}
