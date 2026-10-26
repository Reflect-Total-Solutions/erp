"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, LogOut, Sun, Moon, Loader2 } from "lucide-react";
import { useTheme } from "@/context/theme-context";

interface HeaderProps {
  onOpenSidebar: () => void;
}

export function AdminHeader({ onOpenSidebar }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [loggingOut, setLoggingOut] = React.useState(false);

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

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore network errors on logout
    } finally {
      // Clear session cookie and storage
      document.cookie = "erp_session=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
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

      {/* Right: Theme Toggle & Sign Out */}
      <div className="flex items-center gap-2">
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
    </header>
  );
}
