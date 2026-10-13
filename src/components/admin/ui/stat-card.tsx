import React from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  change?: string;
  trend?: "up" | "down" | "neutral";
  description?: string;
  className?: string;
  iconColor?: string;
  iconBg?: string;
}

export function StatCard({
  title,
  value,
  icon: Icon,
  change,
  trend = "up",
  description,
  className,
  iconColor = "text-[#2563EB]",
  iconBg = "bg-blue-50 border-blue-100",
}: StatCardProps) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition-all duration-200 hover:border-slate-300 hover:shadow-md",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {title}
          </p>
          <h3 className="mt-2 text-2xl font-bold tracking-tight text-[#0F172A] sm:text-3xl">
            {value}
          </h3>
        </div>
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border shadow-xs transition-transform duration-200 group-hover:scale-105",
            iconBg
          )}
        >
          <Icon className={cn("h-5 w-5", iconColor)} />
        </div>
      </div>

      {(change || description) && (
        <div className="mt-3.5 flex items-center gap-2 border-t border-slate-100 pt-3 text-xs">
          {change && (
            <span
              className={cn(
                "inline-flex items-center font-semibold",
                trend === "up" && "text-emerald-600",
                trend === "down" && "text-rose-600",
                trend === "neutral" && "text-slate-600"
              )}
            >
              {trend === "up" && "↑"}
              {trend === "down" && "↓"} {change}
            </span>
          )}
          {description && (
            <span className="text-slate-500 truncate">{description}</span>
          )}
        </div>
      )}
    </div>
  );
}
