"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

export interface Column<T> {
  key: string;
  header: string;
  className?: string;
  headerClassName?: string;
  sortable?: boolean;
  render?: (item: T, index: number) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T, index: number) => string | number;
  sortColumn?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (columnKey: string) => void;
  emptyMessage?: string;
  emptySubtext?: string;
  emptyIcon?: React.ReactNode;
  isLoading?: boolean;
  className?: string;
  tableClassName?: string;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  sortColumn,
  sortDirection,
  onSort,
  emptyMessage = "No records found",
  emptySubtext = "Try adjusting your filters or search criteria",
  emptyIcon,
  isLoading = false,
  className,
  tableClassName,
}: DataTableProps<T>) {
  return (
    <div
      className={cn(
        "relative w-full overflow-x-auto rounded-xl border border-slate-200 bg-white",
        className
      )}
    >
      <table className={cn("w-full text-left text-xs", tableClassName)}>
        <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <tr>
            {columns.map((col) => {
              const isSorted = sortColumn === col.key;
              return (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    "px-4 py-3 select-none",
                    col.sortable && "cursor-pointer hover:bg-slate-100 transition-colors",
                    col.headerClassName
                  )}
                  onClick={() => {
                    if (col.sortable && onSort) {
                      onSort(col.key);
                    }
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{col.header}</span>
                    {col.sortable && (
                      <span className="text-slate-400">
                        {isSorted ? (
                          sortDirection === "asc" ? (
                            <ChevronUp className="h-3.5 w-3.5 text-blue-600" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-blue-600" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {isLoading ? (
            <tr>
              <td
                colSpan={columns.length}
                className="py-12 text-center text-xs text-slate-500"
              >
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                  <span>Loading records...</span>
                </div>
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="py-12 text-center text-xs text-slate-500"
              >
                <div className="flex flex-col items-center justify-center gap-1">
                  {emptyIcon}
                  <p className="font-semibold text-slate-800">{emptyMessage}</p>
                  {emptySubtext && (
                    <p className="text-[11px] text-slate-400">{emptySubtext}</p>
                  )}
                </div>
              </td>
            </tr>
          ) : (
            data.map((item, index) => (
              <tr
                key={keyExtractor(item, index)}
                className="transition-colors hover:bg-slate-50/80"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn("px-4 py-3 text-slate-700", col.className)}
                  >
                    {col.render
                      ? col.render(item, index)
                      : (item as Record<string, any>)[col.key] ?? "-"}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
