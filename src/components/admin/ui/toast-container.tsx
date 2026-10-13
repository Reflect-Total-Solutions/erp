"use client";

import React from "react";
import { useAdminData } from "@/context/admin-data-context";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function ToastContainer() {
  const { toasts, removeToast } = useAdminData();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => {
        const isSuccess = toast.type === "success";
        const isError = toast.type === "error";
        const isInfo = toast.type === "info";

        return (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-2xl border p-4 shadow-xl backdrop-blur-md transition-all duration-300 animate-in slide-in-from-bottom-3",
              isSuccess && "bg-emerald-950/90 text-white border-emerald-500/30",
              isError && "bg-rose-950/90 text-white border-rose-500/30",
              isInfo && "bg-slate-900/90 text-white border-slate-700/60"
            )}
          >
            <div className="mt-0.5 shrink-0">
              {isSuccess && <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
              {isError && <AlertCircle className="h-5 w-5 text-rose-400" />}
              {isInfo && <Info className="h-5 w-5 text-blue-400" />}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{toast.title}</p>
              {toast.message && (
                <p className="mt-0.5 text-xs text-slate-300 leading-snug">
                  {toast.message}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="shrink-0 rounded-lg p-1 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Dismiss toast"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
