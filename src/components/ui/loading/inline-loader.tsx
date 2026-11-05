import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface InlineLoaderProps {
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  variant?: "primary" | "slate" | "white";
}

export function InlineLoader({
  label,
  size = "md",
  className,
  variant = "primary",
}: InlineLoaderProps) {
  const sizeClasses = {
    sm: "h-3.5 w-3.5",
    md: "h-4 w-4",
    lg: "h-6 w-6",
  };

  const textClasses = {
    sm: "text-[11px]",
    md: "text-xs",
    lg: "text-sm",
  };

  const variantClasses = {
    primary: "text-[#2563EB]",
    slate: "text-slate-500",
    white: "text-white",
  };

  return (
    <div className={cn("inline-flex items-center gap-2 text-slate-600 font-medium", className)}>
      <Loader2 className={cn("animate-spin shrink-0", sizeClasses[size], variantClasses[variant])} />
      {label && <span className={cn("select-none", textClasses[size])}>{label}</span>}
    </div>
  );
}
