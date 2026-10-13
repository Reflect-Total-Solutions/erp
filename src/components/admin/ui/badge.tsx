import React from "react";
import { cn } from "@/lib/utils";
import { JobStatus, InvoiceStatus, ExcelFileStatus } from "@/types/admin";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info" | "neutral" | "outline";
  className?: string;
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  const variantStyles = {
    default: "bg-blue-50 text-blue-700 border-blue-200/80",
    success: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
    warning: "bg-amber-50 text-amber-700 border-amber-200/80",
    danger: "bg-rose-50 text-rose-700 border-rose-200/80",
    info: "bg-sky-50 text-sky-700 border-sky-200/80",
    neutral: "bg-slate-100 text-slate-700 border-slate-200",
    outline: "bg-transparent text-slate-600 border-slate-300",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-wide transition-colors",
        variantStyles[variant],
        className
      )}
    >
      <span className={cn(
        "h-1.5 w-1.5 rounded-full",
        variant === "success" && "bg-emerald-500",
        variant === "warning" && "bg-amber-500",
        variant === "danger" && "bg-rose-500",
        variant === "info" && "bg-sky-500",
        variant === "default" && "bg-blue-500",
        variant === "neutral" && "bg-slate-400",
        variant === "outline" && "bg-slate-400"
      )} />
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: JobStatus | InvoiceStatus | ExcelFileStatus | string }) {
  switch (status) {
    case "Active":
    case "Approved":
    case "Processed":
      return <Badge variant="success">{status}</Badge>;
    case "Paid":
      return <Badge variant="default">{status}</Badge>;
    case "Pending":
      return <Badge variant="warning">{status}</Badge>;
    case "Under Review":
    case "In Review":
    case "Analyzing":
      return <Badge variant="info">{status}</Badge>;
    case "Completed":
      return <Badge variant="neutral">{status}</Badge>;
    default:
      return <Badge variant="neutral">{status}</Badge>;
  }
}
