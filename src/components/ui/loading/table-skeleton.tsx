import React from "react";
import { cn } from "@/lib/utils";

export interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  className?: string;
  showHeader?: boolean;
}

/**
 * Reusable table skeleton loader with smooth pulse animation.
 * Prevents layout shift and blank flashes while tabular records load from PostgreSQL.
 */
export function TableSkeleton({
  rows = 5,
  columns = 6,
  className,
  showHeader = true,
}: TableSkeletonProps) {
  return (
    <div className={cn("w-full bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs", className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          {showHeader && (
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {Array.from({ length: columns }).map((_, colIdx) => (
                  <th key={colIdx} className="py-3 px-3.5">
                    <div
                      className="h-3.5 bg-slate-200 rounded animate-pulse"
                      style={{
                        width: `${Math.max(40, 90 - (colIdx % 3) * 20)}px`,
                      }}
                    />
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody className="divide-y divide-slate-100">
            {Array.from({ length: rows }).map((_, rowIdx) => (
              <tr key={rowIdx} className="hover:bg-slate-50/50">
                {Array.from({ length: columns }).map((_, colIdx) => (
                  <td key={colIdx} className="py-3.5 px-3.5">
                    <div
                      className="h-3.5 bg-slate-100 rounded animate-pulse"
                      style={{
                        width:
                          colIdx === 0
                            ? "80%"
                            : colIdx === columns - 1
                            ? "40px"
                            : `${Math.max(30, 85 - ((rowIdx + colIdx) % 4) * 15)}%`,
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
