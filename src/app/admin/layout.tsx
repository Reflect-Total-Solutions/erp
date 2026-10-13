"use client";

import React, { useState } from "react";
import { AdminDataProvider } from "@/context/admin-data-context";
import { AdminSidebar } from "@/components/admin/layout/sidebar";
import { AdminHeader } from "@/components/admin/layout/header";
import { ToastContainer } from "@/components/admin/ui/toast-container";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Suppress errors caused by third-party browser extensions (e.g. chrome-extension://...)
  React.useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const stack =
        typeof reason === "object" && reason !== null
          ? (reason as { stack?: string }).stack || ""
          : String(reason || "");
      if (stack.includes("chrome-extension://")) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    };

    const handleError = (event: ErrorEvent) => {
      const filename = event.filename || "";
      const stack = event.error?.stack || "";
      if (filename.includes("chrome-extension://") || stack.includes("chrome-extension://")) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection, true);
    window.addEventListener("error", handleError, true);

    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection, true);
      window.removeEventListener("error", handleError, true);
    };
  }, []);

  return (
    <AdminDataProvider>
      <div className="flex min-h-screen bg-[#F8FAFC]">
        {/* Left Sidebar */}
        <React.Suspense fallback={<aside className="hidden lg:block w-64 bg-white border-r border-slate-200" />}>
          <AdminSidebar
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />
        </React.Suspense>

        {/* Main Content Area */}
        <div className="flex flex-1 flex-col min-w-0">
          <React.Suspense fallback={<div className="h-16 w-full border-b border-slate-200 bg-white" />}>
            <AdminHeader onOpenSidebar={() => setSidebarOpen(true)} />
          </React.Suspense>

          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
            {children}
          </main>
        </div>

        {/* Floating Toast Notification Host */}
        <ToastContainer />
      </div>
    </AdminDataProvider>
  );
}
