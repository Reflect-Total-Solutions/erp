import React from "react";
import { cn } from "@/lib/utils";

export interface DashboardSkeletonProps {
  className?: string;
  cardCount?: number;
}

/**
 * Reusable dashboard skeleton loader.
 * Displays animated skeleton placeholders for executive stat cards, action buttons,
 * and tabular activity logs while dashboard metrics are retrieving.
 */
export function DashboardSkeleton({
  className,
  cardCount = 4,
}: DashboardSkeletonProps) {
  return (
    <div className={cn("space-y-6 animate-pulse", className)}>
      {/* Top Banner Skeleton */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-5 rounded-2xl bg-white border border-slate-200">
        <div className="space-y-2">
          <div className="h-6 w-64 bg-slate-200 rounded" />
          <div className="h-3.5 w-96 max-w-full bg-slate-100 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 bg-slate-200 rounded-lg" />
          <div className="h-9 w-28 bg-slate-200 rounded-lg" />
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: cardCount }).map((_, i) => (
          <div
            key={i}
            className="p-4 rounded-xl bg-white border border-slate-200 space-y-3 shadow-xs"
          >
            <div className="flex items-center justify-between">
              <div className="h-3 w-24 bg-slate-200 rounded" />
              <div className="h-8 w-8 bg-slate-100 rounded-lg" />
            </div>
            <div className="h-7 w-32 bg-slate-200 rounded" />
            <div className="h-2.5 w-40 bg-slate-100 rounded" />
          </div>
        ))}
      </div>

      {/* Main Content Skeleton (Split Columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex justify-between items-center px-1">
            <div className="h-5 w-32 bg-slate-200 rounded" />
            <div className="h-4 w-20 bg-slate-100 rounded" />
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="h-4 w-48 bg-slate-200 rounded" />
                  <div className="h-3 w-32 bg-slate-100 rounded" />
                </div>
                <div className="h-6 w-20 bg-slate-100 rounded-full" />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="h-5 w-28 bg-slate-200 rounded px-1" />
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="space-y-1.5 py-2 border-b border-slate-100 last:border-0">
                <div className="h-4 w-36 bg-slate-200 rounded" />
                <div className="h-3 w-24 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
