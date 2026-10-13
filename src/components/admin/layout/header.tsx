"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, LogOut, User } from "lucide-react";

interface HeaderProps {
  onOpenSidebar: () => void;
}

export function AdminHeader({ onOpenSidebar }: HeaderProps) {
  const pathname = usePathname();

  const getPageTitle = () => {
    if (pathname === "/admin") return "Dashboard";
    if (pathname === "/admin/jobs") return "Jobs";
    if (pathname.startsWith("/admin/jobs/")) return "Job Details";
    if (pathname === "/admin/suppliers") return "Suppliers";
    if (pathname === "/admin/invoices") return "Invoices";
    if (pathname === "/admin/approvals") return "Approvals & Authorization";
    if (pathname === "/admin/access-control") return "Access Control & Permissions";
    if (pathname === "/admin/audit-controller") return "Audit Controller & Compliance";
    return "Admin Panel";
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
      {/* Left: Mobile Toggle & Page Title */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenSidebar}
          className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-label="Open sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>

        <h1
          className="text-base sm:text-lg font-bold text-slate-900"
          suppressHydrationWarning
        >
          {getPageTitle()}
        </h1>
      </div>

      {/* Right: User status & Sign Out */}
      <div className="flex items-center gap-3">
        

        <Link
          href="/"
          className="text-xs font-medium text-slate-600 hover:text-rose-600 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 flex items-center gap-1.5 transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Logout</span>
        </Link>
      </div>
    </header>
  );
}
