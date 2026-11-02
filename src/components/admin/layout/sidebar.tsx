"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  Users,
  FileText,
  X,
  ShieldCheck,
  CheckCircle,
  Eye,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminData } from "@/context/admin-data-context";
import { ERPModule, Action } from "@/lib/permissions";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  exact: boolean;
  module?: ERPModule;
  action?: Action;
}

const NAV_ITEMS: NavItem[] = [
  {
    name: "Dashboard",
    href: "/admin",
    icon: LayoutDashboard,
    exact: true,
    module: "dashboard",
    action: "view",
  },
  {
    name: "Jobs",
    href: "/admin/jobs",
    icon: Briefcase,
    exact: false,
    module: "jobs",
    action: "view",
  },
  {
    name: "Suppliers",
    href: "/admin/suppliers",
    icon: Users,
    exact: false,
    module: "suppliers",
    action: "view",
  },
  {
    name: "Invoices",
    href: "/admin/invoices",
    icon: FileText,
    exact: false,
    module: "invoices",
    action: "view",
  },
  {
    name: "Approval",
    href: "/admin/approvals",
    icon: CheckCircle,
    exact: false,
    module: "approvals",
    action: "view",
  },
  {
    name: "Profit & Loss",
    href: "/admin/profit-loss",
    icon: TrendingUp,
    exact: false,
    module: "dashboard",
    action: "view",
  },
  {
    name: "Access Control",
    href: "/admin/access-control",
    icon: ShieldCheck,
    exact: false,
    module: "accessControl",
    action: "view",
  },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdminSidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const {
    can,
    currentRole,
    activeUserId,
    activeUser,
    isPreviewMode,
    resetToAdminUser,
    switchToUser,
    usersAccess,
    currentUserId,
  } = useAdminData();

  // Filter navigation items strictly based on role permission allowances.
  // When a module's access is revoked in Access Control, it disappears from the sidebar completely.
  const visibleNavItems = useMemo(() => {
    return NAV_ITEMS.filter((item) => {
      if (!item.module) return true;
      const requiredAction: Action = item.action || "view";
      return can(item.module, requiredAction);
    });
  }, [can, activeUserId, usersAccess, currentRole]);

  const isLinkActive = (itemHref: string, exact: boolean) => {
    if (exact) {
      return pathname === itemHref;
    }
    return pathname.startsWith(itemHref);
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 bottom-0 left-0 z-40 flex w-64 flex-col bg-white border-r border-slate-200 transition-transform duration-200 lg:static lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-slate-200">
          <Link href="/admin" className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center">
              <Image
                src="/logo.png"
                alt="Reflect Total Solutions"
                width={40}
                height={35}
                className="h-9 w-auto object-contain dark:bg-white/95 dark:p-0.5 dark:rounded"
                priority
              />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900 block leading-tight">
                Reflect Total Solutions
              </span>
              <span className="text-[10px] text-slate-500 block">
                Admin Panel
              </span>
            </div>
          </Link>

          {/* Close button on mobile */}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Menu */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {visibleNavItems.map((item) => {
            const active = mounted ? isLinkActive(item.href, item.exact) : false;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  if (typeof window !== "undefined" && window.innerWidth < 1024) {
                    onClose();
                  }
                }}
                className={cn(
                  "flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                  active
                    ? "bg-[#2563EB] text-white font-semibold shadow-sm"
                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={cn("h-4 w-4", active ? "text-white" : "text-slate-500")} />
                  <span>{item.name}</span>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Footer User Info / Persona Switcher */}
        {isPreviewMode && activeUser ? (
          <div className="p-3 border-t border-amber-200 bg-amber-50/90">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1">
                <Eye className="h-3 w-3 text-amber-700" />
                Preview Mode
              </span>
              <button
                type="button"
                onClick={resetToAdminUser}
                className="text-[10px] font-bold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer"
                title="Exit Preview and return to Administrator view"
              >
                Exit Preview ✕
              </button>
            </div>
            <div className="flex items-center gap-2 rounded-lg p-2 bg-white border border-amber-200 shadow-2xs">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-800 font-bold text-xs uppercase shrink-0">
                {activeUser?.name ? activeUser.name[0] : "U"}
              </div>
              <div className="text-left flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-900 leading-tight truncate">
                  {activeUser?.name}
                </p>
                <p className="text-[10px] text-amber-700 font-semibold capitalize truncate">
                  {activeUser?.hasCustomPermissions ? "Custom Permissions" : `${currentRole} Policy`}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3 border-t border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Persona View
              </span>
              <span className="text-[10px] font-bold text-blue-600 capitalize bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                {currentRole}
              </span>
            </div>
            <div className="relative">
              <select
                value={activeUserId || currentUserId || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val || val === currentUserId) {
                    resetToAdminUser();
                  } else {
                    switchToUser(val);
                  }
                }}
                className="w-full text-xs font-medium text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-blue-500 cursor-pointer transition-colors"
                title="Select a user to preview the system and sidebar through their assigned permissions"
              >
                <option value={currentUserId || ""}>
                  👑 Administrator (Full Access)
                </option>
                {usersAccess
                  .filter((u) => !u.isDeleted && u.id !== currentUserId)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      👤 {u.name} ({u.role || u.department || "User"}{u.hasCustomPermissions ? " - Custom" : ""})
                    </option>
                  ))}
              </select>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
