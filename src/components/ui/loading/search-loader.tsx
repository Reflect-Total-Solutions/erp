import React from "react";
import { Loader2, Search, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchLoaderProps {
  isSearching: boolean;
  hasQuery?: boolean;
  itemCount?: number;
  emptyText?: string;
  className?: string;
  inline?: boolean;
}

export function SearchLoader({
  isSearching,
  hasQuery = false,
  itemCount,
  emptyText = "No matching records found.",
  className,
  inline = false,
}: SearchLoaderProps) {
  if (isSearching) {
    if (inline) {
      return (
        <span className={cn("inline-flex items-center gap-1.5 text-xs text-blue-600 font-medium", className)}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Searching...</span>
        </span>
      );
    }

    return (
      <div className={cn("py-4 text-center text-xs text-slate-500 space-y-1.5", className)}>
        <Loader2 className="h-4 w-4 animate-spin text-blue-600 mx-auto" />
        <p className="font-medium text-slate-600">Searching records...</p>
      </div>
    );
  }

  if (hasQuery && typeof itemCount === "number" && itemCount === 0) {
    return (
      <div className={cn("py-4 text-center text-xs text-slate-500 space-y-1", className)}>
        <Search className="h-4 w-4 text-slate-400 mx-auto" />
        <p className="font-medium text-slate-600">{emptyText}</p>
      </div>
    );
  }

  return null;
}
