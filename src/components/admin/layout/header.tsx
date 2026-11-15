"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Menu,
  LogOut,
  Sun,
  Moon,
  Loader2,
  Eye,
  Bell,
  CheckCheck,
  Settings,
  AlertTriangle,
  Clock,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { useTheme } from "@/context/theme-context";
import { useAdminData } from "@/context/admin-data-context";
import { ErpNotification } from "@/types/admin";
import { SupplierPaymentSettingsModal } from "@/components/admin/modals/supplier-payment-settings-modal";

interface HeaderProps {
  onOpenSidebar: () => void;
}

export function AdminHeader({ onOpenSidebar }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { isPreviewMode, activeUser, resetToAdminUser, can } = useAdminData();
  const [loggingOut, setLoggingOut] = useState(false);

  // Notifications state
  const [notifications, setNotifications] = useState<ErpNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isBellOpen, setIsBellOpen] = useState(false);
  const [isLoadingNotifs, setIsLoadingNotifs] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement | null>(null);
  const consecutiveFailuresRef = useRef(0);
  const pollAbortRef = useRef<AbortController | null>(null);

  const canManagePaymentSettings =
    can("supplierPayments", "manageSettings") || can("supplierPayments", "manageNotifications");

  const fetchNotifications = useCallback(async (autoCheck: boolean = false) => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return;
    }

    pollAbortRef.current?.abort();
    const controller = new AbortController();
    pollAbortRef.current = controller;

    try {
      const qs = new URLSearchParams({ limit: "25" });
      if (autoCheck) qs.set("autoCheck", "true");
      const res = await fetch(`/api/notifications?${qs.toString()}`, {
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = await res.json();
      consecutiveFailuresRef.current = 0;
      if (json.success) {
        setNotifications(Array.isArray(json.data) ? json.data : []);
        setUnreadCount(Number(json.unreadCount || 0));
      }
    } catch {
      consecutiveFailuresRef.current = Math.min(consecutiveFailuresRef.current + 1, 5);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const initTimer = setTimeout(() => {
      if (active) void fetchNotifications(true);
    }, 300);

    const interval = setInterval(() => {
      if (!active) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      // If dev server is temporarily restarting/offline, pause automatic background retries after 2 failures
      if (consecutiveFailuresRef.current >= 2) return;
      void fetchNotifications(true);
    }, 60 * 1000);

    const handleFocus = () => {
      if (!active) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void fetchNotifications(true);
    };

    const handleOnline = () => {
      consecutiveFailuresRef.current = 0;
      if (active) void fetchNotifications(true);
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);
    return () => {
      active = false;
      clearTimeout(initTimer);
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
      pollAbortRef.current?.abort();
    };
  }, [fetchNotifications]);

  // Close dropdown on click outside
  useEffect(() => {
    if (!isBellOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setIsBellOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isBellOpen]);

  const handleToggleBell = () => {
    const next = !isBellOpen;
    setIsBellOpen(next);
    if (next) {
      consecutiveFailuresRef.current = 0;
      setIsLoadingNotifs(true);
      fetchNotifications(false).finally(() => setIsLoadingNotifs(false));
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setUnreadCount(0);
      }
    } catch {
      // ignore
    }
  };

  const handleNotificationClick = async (notif: ErpNotification) => {
    setIsBellOpen(false);
    if (!notif.isRead) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      fetch(`/api/notifications/${notif.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRead: true }),
      }).catch(() => {});
    }
    if (notif.linkUrl) {
      router.push(notif.linkUrl);
    } else if (notif.supplierInvoiceId) {
      router.push(`/admin/supplier-payments/list?viewInvoiceId=${notif.supplierInvoiceId}`);
    }
  };

  const getPageTitle = () => {
    if (pathname === "/admin") return "Dashboard";
    if (pathname === "/admin/jobs") return "Jobs";
    if (pathname.startsWith("/admin/jobs/")) return "Job Details";
    if (pathname === "/admin/suppliers") return "Suppliers";
    if (pathname === "/admin/purchase-orders/create") return "Create Purchase Order";
    if (pathname === "/admin/purchase-orders/reports") return "Purchase Order Reports";
    if (pathname.startsWith("/admin/purchase-orders")) return "Purchase Orders";
    if (pathname === "/admin/invoices") return "Invoices";
    if (
      pathname === "/admin/supplier-payments" ||
      pathname === "/admin/supplier-payments/list"
    ) {
      return "All Supplier Payments";
    }
    if (pathname.startsWith("/admin/supplier-payments/outstanding")) {
      return "Outstanding Invoices";
    }
    if (pathname.startsWith("/admin/supplier-payments/history")) {
      return "Supplier Payment History";
    }
    if (pathname.startsWith("/admin/supplier-payments/reports")) {
      return "Supplier Payment Reports";
    }
    if (pathname === "/admin/approvals") return "Approvals & Authorization";
    if (pathname === "/admin/profit-loss") return "Profit & Loss";
    if (pathname === "/admin/access-control") return "Access Control & Permissions";
    if (pathname === "/admin/audit-controller") return "Audit Controller & Compliance";
    return "Admin Panel";
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore network errors on logout
    } finally {
      document.cookie =
        "erp_session=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
      try {
        localStorage.clear();
        sessionStorage.clear();
        sessionStorage.setItem("erp_just_logged_out", "1");
      } catch {
        // Ignore storage clear errors
      }
      window.location.replace("/?logged_out=1");
    }
  };

  const getNotificationTone = (type: string) => {
    if (type === "OVERDUE") {
      return {
        icon: <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />,
        pill: "bg-rose-100 text-rose-800",
      };
    }
    if (type === "DUE_TODAY" || type === "UPCOMING_DUE_REMINDER") {
      return {
        icon: <Clock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />,
        pill: "bg-amber-100 text-amber-800",
      };
    }
    if (type === "FULL_PAYMENT_COMPLETED" || type === "PARTIAL_PAYMENT_RECORDED") {
      return {
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />,
        pill: "bg-emerald-100 text-emerald-800",
      };
    }
    return {
      icon: <Bell className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />,
      pill: "bg-blue-100 text-blue-800",
    };
  };

  return (
    <header className="sticky top-0 z-30 flex flex-col w-full border-b border-slate-200 bg-white print:hidden">
      {/* Top Banner when in Persona Preview Mode */}
      {isPreviewMode && activeUser && (
        <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white px-4 sm:px-6 py-2 flex items-center justify-between text-xs font-medium shadow-xs">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-white animate-ping" />
            <span className="flex items-center gap-1.5 flex-wrap">
              <Eye className="h-3.5 w-3.5" />
              <span>
                <strong>PREVIEW PERSONA:</strong> Viewing ERP &amp; Sidebar as{" "}
                <span className="underline font-bold">{activeUser.name}</span> (
                {activeUser.roleId?.replace("role-", "") || activeUser.role})
                {activeUser.hasCustomPermissions
                  ? " — Custom Permissions Active"
                  : " — Default Role Policy"}
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={resetToAdminUser}
            className="px-2.5 py-1 rounded bg-black/20 hover:bg-black/30 text-white font-semibold transition-colors cursor-pointer text-xs shrink-0"
            title="Reset to Administrator Full Access"
          >
            ✕ Exit Preview &amp; Return to Admin
          </button>
        </div>
      )}

      {/* Main Header Bar */}
      <div className="flex h-16 w-full items-center justify-between px-4 sm:px-6">
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

        {/* Right: Notification Bell, Theme Toggle & Sign Out */}
        <div className="flex items-center gap-2">
          {/* Notification Bell */}
          <div className="relative" ref={bellRef}>
            <button
              type="button"
              onClick={handleToggleBell}
              className="relative flex items-center justify-center h-8 w-8 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Payment & ERP Notifications"
              title="Notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>

            {isBellOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-slate-200 bg-white shadow-xl z-50 overflow-hidden">
                <div className="px-3.5 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">Notifications</span>
                    {unreadCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">
                        {unreadCount} unread
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAllRead}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 px-1.5 py-0.5 rounded hover:bg-blue-50 cursor-pointer"
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        <span>Mark all read</span>
                      </button>
                    )}
                    {canManagePaymentSettings && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsBellOpen(false);
                          setIsSettingsOpen(true);
                        }}
                        className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 cursor-pointer"
                        title="Payment Reminder Settings"
                      >
                        <Settings className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                  {isLoadingNotifs && notifications.length === 0 ? (
                    <div className="py-10 text-center text-slate-400 text-xs">
                      <Loader2 className="h-5 w-5 animate-spin text-blue-600 mx-auto mb-1.5" />
                      <span>Checking reminders...</span>
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="py-10 text-center text-slate-400 text-xs px-4">
                      <Bell className="h-7 w-7 text-slate-300 mx-auto mb-1.5" />
                      <p className="font-semibold text-slate-600">All caught up</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Upcoming due date and overdue supplier invoice alerts will appear here.
                      </p>
                    </div>
                  ) : (
                    notifications.map((notif) => {
                      const tone = getNotificationTone(notif.type);
                      return (
                        <button
                          key={notif.id}
                          type="button"
                          onClick={() => void handleNotificationClick(notif)}
                          className={`w-full text-left px-3.5 py-2.5 flex items-start gap-2.5 transition-colors cursor-pointer ${
                            !notif.isRead
                              ? "bg-blue-50/50 hover:bg-blue-50"
                              : "bg-white hover:bg-slate-50"
                          }`}
                        >
                          {tone.icon}
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-bold text-slate-900 truncate">
                                {notif.title}
                              </p>
                              {!notif.isRead && (
                                <span className="h-2 w-2 rounded-full bg-blue-600 shrink-0" />
                              )}
                            </div>
                            <p className="text-[11px] text-slate-600 leading-snug line-clamp-2">
                              {notif.message}
                            </p>
                            <div className="flex items-center justify-between pt-0.5 text-[10px] text-slate-400">
                              <span className="font-mono">
                                {new Date(notif.createdAt).toLocaleString()}
                              </span>
                              {(notif.linkUrl || notif.supplierInvoiceId) && (
                                <span className="inline-flex items-center gap-0.5 text-blue-600 font-semibold">
                                  <span>Open</span>
                                  <ExternalLink className="h-2.5 w-2.5" />
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                {can("supplierPayments", "viewOutstanding") || can("supplierPayments", "view") ? (
                  <div className="px-3.5 py-2 border-t border-slate-200 bg-slate-50 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setIsBellOpen(false);
                        router.push("/admin/supplier-payments/outstanding");
                      }}
                      className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
                    >
                      View All Outstanding Supplier Invoices →
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
            title={theme === "dark" ? "Switch to White (Light) mode" : "Switch to Dark mode"}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? (
              <>
                <Sun className="h-3.5 w-3.5 text-amber-400" />
                <span>Light</span>
              </>
            ) : (
              <>
                <Moon className="h-3.5 w-3.5 text-slate-600" />
                <span>Dark</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="text-xs font-medium text-slate-600 hover:text-rose-600 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 flex items-center gap-1.5 transition-colors disabled:opacity-60"
          >
            {loggingOut ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <LogOut className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">{loggingOut ? "Logging out..." : "Logout"}</span>
          </button>
        </div>
      </div>

      <SupplierPaymentSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSettingsUpdated={() => void fetchNotifications(true)}
      />
    </header>
  );
}
