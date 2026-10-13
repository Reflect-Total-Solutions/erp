"use client";

import React from "react";
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
  ClipboardCheck,
  CheckCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  {
    name: "Dashboard",
    href: "/admin",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    name: "Jobs",
    href: "/admin/jobs",
    icon: Briefcase,
    exact: false,
  },
  {
    name: "Suppliers",
    href: "/admin/suppliers",
    icon: Users,
    exact: false,
  },
  {
    name: "Invoices",
    href: "/admin/invoices",
    icon: FileText,
    exact: false,
  },
  {
    name: "Approvals",
    href: "/admin/approvals",
    icon: CheckCircle,
    exact: false,
  },
  {
    name: "Access Control",
    href: "/admin/access-control",
    icon: ShieldCheck,
    exact: false,
  },
  {
    name: "Audit Controller",
    href: "/admin/audit-controller",
    icon: ClipboardCheck,
    exact: false,
  },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdminSidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

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
        <div className="flex h-16 items-center justify-between px-5 border-b border-slate-200">
          <Link href="/admin" className="flex items-center gap-2.5">
            <div className="relative h-8 w-12 rounded border border-slate-200 p-0.5 overflow-hidden flex items-center justify-center bg-white shrink-0">
              <Image
                src="/logo.png"
                alt="Reflect Total Solutions"
                width={48}
                height={32}
                className="h-full w-auto object-contain"
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
          {NAV_ITEMS.map((item) => {
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
                    ? "bg-[#2563EB] text-white font-semibold"
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

        {/* Footer User Info */}
        <div className="p-3 border-t border-slate-200">
          <div className="flex items-center gap-2.5 rounded-lg p-2 bg-slate-50 border border-slate-200">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-slate-700 font-bold text-xs">
              A
            </div>
            <div className="text-left">
              <p className="text-xs font-semibold text-slate-800 leading-tight">Admin</p>
              <p className="text-[10px] text-slate-500">Online</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
