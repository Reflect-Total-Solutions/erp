"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface FormFieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  helperText?: string;
  className?: string;
  children: React.ReactNode;
}

export function FormField({
  label,
  htmlFor,
  required = false,
  error,
  helperText,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between">
        <label
          htmlFor={htmlFor}
          className="block text-xs font-semibold text-slate-700"
        >
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </label>
        {helperText && !error && (
          <span className="text-[11px] text-slate-400">{helperText}</span>
        )}
      </div>

      <div>{children}</div>

      {error && (
        <p className="text-[11px] font-medium text-rose-500 animate-in fade-in">
          {error}
        </p>
      )}
    </div>
  );
}
