"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
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
  ShoppingCart,
  ChevronDown,
  ChevronRight,
  BarChart3,
  ClipboardList,
  PlusCircle,
  Truck,
  CheckSquare,
  FileSpreadsheet,
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
    module: "supplierInvoices",
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
    module: "profitLoss",
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
  const searchParams = useSearchParams();
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

  const currentTab = searchParams.get("tab") || "";
  const isPoRoute =
    pathname.startsWith("/admin/purchase-orders") ||
    (pathname.startsWith("/admin/approvals") && currentTab === "purchase-orders");

  const routeKey = `${pathname}?${currentTab}`;
  const [poOpenNonRoute, setPoOpenNonRoute] = useState<boolean>(false);
  const [collapsedPoKey, setCollapsedPoKey] = useState<string | null>(null);
  const poMenuOpen = isPoRoute ? collapsedPoKey !== routeKey : poOpenNonRoute;

  const canViewPurchaseOrders = can("purchaseOrders", "view");
  const poSubItems = useMemo(() => {
    if (!canViewPurchaseOrders) return [];
    const list: Array<{
      name: string;
      href: string;
      icon: React.ComponentType<{ className?: string }>;
      isActive: boolean;
    }> = [
      {
        name: "PO Dashboard",
        href: "/admin/purchase-orders",
        icon: BarChart3,
        isActive: pathname === "/admin/purchase-orders",
      },
      {
        name: "All Purchase Orders",
        href: "/admin/purchase-orders/list",
        icon: ClipboardList,
        isActive:
          pathname === "/admin/purchase-orders/list" ||
          (pathname.startsWith("/admin/purchase-orders/") &&
            !pathname.startsWith("/admin/purchase-orders/create") &&
            !pathname.startsWith("/admin/purchase-orders/tracking") &&
            !pathname.startsWith("/admin/purchase-orders/reports")),
      },
    ];

    if (can("purchaseOrders", "create")) {
      list.push({
        name: "Create Purchase Order",
        href: "/admin/purchase-orders/create",
        icon: PlusCircle,
        isActive: pathname === "/admin/purchase-orders/create",
      });
    }

    list.push({
      name: "PO Tracking",
      href: "/admin/purchase-orders/tracking",
      icon: Truck,
      isActive: pathname.startsWith("/admin/purchase-orders/tracking"),
    });

    if (can("purchaseOrders", "approve") || can("approvals", "view") || can("purchaseOrders", "view")) {
      list.push({
        name: "PO Approval",
        href: "/admin/approvals?tab=purchase-orders",
        icon: CheckSquare,
        isActive: pathname.startsWith("/admin/approvals") && currentTab === "purchase-orders",
      });
    }

    if (
      can("purchaseOrders", "export") ||
      can("purchaseOrders", "viewFinancials") ||
      can("purchaseOrders", "manageSettings") ||
      can("purchaseOrders", "view")
    ) {
      list.push({
        name: "PO Reports",
        href: "/admin/purchase-orders/reports",
        icon: FileSpreadsheet,
        isActive: pathname.startsWith("/admin/purchase-orders/reports"),
      });
    }

    return list;
  }, [canViewPurchaseOrders, can, pathname, currentTab]);

  // Filter navigation items strictly based on role permission allowances.
  // When a module's access is revoked in Access Control, it disappears from the sidebar completely.
  const visibleNavItems = useMemo(() => {
    return NAV_ITEMS.filter((item) => {
      if (!item.module) return true;
      const requiredAction: Action = item.action || "view";
      return can(item.module, requiredAction);
    });
  }, [can]);

  const isLinkActive = (itemHref: string, exact: boolean) => {
    if (itemHref === "/admin/approvals") {
      return pathname.startsWith("/admin/approvals") && currentTab !== "purchase-orders";
    }
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
          {(() => {
            const parentActive = mounted ? isPoRoute : false;
            const poGroupElement =
              canViewPurchaseOrders && poSubItems.length > 0 ? (
                <div key="purchase-order-management" className="pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (isPoRoute) {
                        const nextOpen = !poMenuOpen;
                        setCollapsedPoKey(nextOpen ? null : routeKey);
                        setPoOpenNonRoute(nextOpen);
                      } else {
                        setPoOpenNonRoute((prev) => !prev);
                      }
                    }}
                    className={cn(
                      "w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors cursor-pointer",
                      parentActive && !poMenuOpen
                        ? "bg-[#2563EB] text-white font-semibold shadow-sm"
                        : parentActive
                        ? "bg-blue-50/90 text-blue-700 font-semibold border border-blue-200/70"
                        : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ShoppingCart
                        className={cn(
                          "h-4 w-4 shrink-0",
                          parentActive && !poMenuOpen
                            ? "text-white"
                            : parentActive
                            ? "text-blue-600"
                            : "text-slate-500"
                        )}
                      />
                      <span className="truncate">Purchase Order Management</span>
                    </div>
                    {poMenuOpen ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-75" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-75" />
                    )}
                  </button>

                  {poMenuOpen && (
                    <div className="mt-1 ml-3.5 pl-2.5 border-l border-slate-200 space-y-0.5">
                      {poSubItems.map((sub) => {
                        const SubIcon = sub.icon;
                        const subActive = mounted ? sub.isActive : false;
                        return (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            onClick={() => {
                              if (typeof window !== "undefined" && window.innerWidth < 1024) {
                                onClose();
                              }
                            }}
                            className={cn(
                              "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                              subActive
                                ? "bg-[#2563EB] text-white font-semibold shadow-xs"
                                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                            )}
                          >
                            <SubIcon
                              className={cn(
                                "h-3.5 w-3.5 shrink-0",
                                subActive ? "text-white" : "text-slate-400"
                              )}
                            />
                            <span className="truncate">{sub.name}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null;

            const hasSuppliers = visibleNavItems.some((i) => i.href === "/admin/suppliers");
            const elements: React.ReactNode[] = [];

            visibleNavItems.forEach((item) => {
              const active = mounted ? isLinkActive(item.href, item.exact) : false;
              const Icon = item.icon;

              if (!hasSuppliers && poGroupElement && item.href === "/admin/invoices") {
                elements.push(poGroupElement);
              }

              elements.push(
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

              if (hasSuppliers && item.href === "/admin/suppliers" && poGroupElement) {
                elements.push(poGroupElement);
              }
            });

            if (
              poGroupElement &&
              !hasSuppliers &&
              !visibleNavItems.some((i) => i.href === "/admin/invoices")
            ) {
              elements.push(poGroupElement);
            }

            return elements;
          })()}
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
