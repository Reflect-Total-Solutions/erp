"use client";

import {
  TrendingUp,
  Users,
  FileText,
  Package,
  BarChart3,
  ArrowUpRight,
  Activity,
} from "lucide-react";

function StatCard({
  icon: Icon,
  label,
  value,
  change,
  delay,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  change: string;
  delay: string;
}) {
  return (
    <div
      className="rounded-xl bg-white/[0.08] backdrop-blur-sm border border-white/[0.08] p-3.5 shadow-lg animate-fade-in-up"
      style={{ animationDelay: delay }}
    >
      <div className="flex items-center gap-2.5 mb-1.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.1]">
          <Icon className="h-3.5 w-3.5 text-blue-300" />
        </div>
        <span className="text-[11px] font-medium text-blue-200/70 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="flex items-end justify-between">
        <span className="text-lg font-semibold text-white">{value}</span>
        <span className="flex items-center gap-0.5 text-[11px] font-medium text-emerald-400">
          <ArrowUpRight className="h-3 w-3" />
          {change}
        </span>
      </div>
    </div>
  );
}

function MiniChart() {
  return (
    <div className="flex items-end gap-[3px] h-8">
      {[40, 65, 45, 80, 55, 90, 70, 95, 60, 85, 75, 92].map((h, i) => (
        <div
          key={i}
          className="w-[5px] rounded-full bg-blue-400/40 animate-grow-up"
          style={{
            height: `${h}%`,
            animationDelay: `${800 + i * 80}ms`,
          }}
        />
      ))}
    </div>
  );
}

export function BrandPanel() {
  return (
    <div className="relative hidden lg:flex lg:w-[55%] flex-col justify-between overflow-hidden bg-[#0F172A] p-10 xl:p-14">
      {/* Background gradient effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#0F172A]" />
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#2563EB]/[0.06] rounded-full blur-[120px]" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#3B82F6]/[0.04] rounded-full blur-[100px]" />

      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative z-10 flex flex-col h-full">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-16 xl:mb-20">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2563EB] shadow-lg shadow-blue-500/20">
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          <div>
            <span className="text-base font-bold text-white tracking-tight">
              YOUR COMPANY
            </span>
            <span className="text-[10px] font-semibold text-blue-400 tracking-[0.2em] block -mt-0.5">
              ERP
            </span>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col justify-center max-w-lg">
          {/* Activity indicator */}
          <div className="flex items-center gap-2 mb-6">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10">
              <Activity className="h-3 w-3 text-emerald-400" />
            </div>
            <span className="text-xs font-medium text-emerald-400 tracking-wide">
              System Online
            </span>
          </div>

          <h1 className="text-3xl xl:text-4xl font-bold text-white leading-tight tracking-tight mb-4">
            Manage Your Business.
            <br />
            <span className="text-blue-400">Smarter.</span>
          </h1>

          <p className="text-[15px] leading-relaxed text-slate-400 mb-12 max-w-md">
            A powerful ERP platform designed to simplify operations, manage
            resources, and help your team work efficiently.
          </p>

          {/* Dashboard visualization */}
          <div className="mb-8">
            <div className="rounded-2xl bg-white/[0.04] border border-white/[0.06] p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-400" />
                  <span className="text-xs font-medium text-slate-300">
                    Revenue Overview
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 font-medium">
                  Last 12 months
                </span>
              </div>
              <MiniChart />
            </div>
          </div>

          {/* Stat cards grid */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={TrendingUp}
              label="Revenue"
              value="$2.4M"
              change="+12.5%"
              delay="200ms"
            />
            <StatCard
              icon={Users}
              label="Employees"
              value="1,247"
              change="+3.2%"
              delay="350ms"
            />
            <StatCard
              icon={FileText}
              label="Invoices"
              value="384"
              change="+8.1%"
              delay="500ms"
            />
            <StatCard
              icon={Package}
              label="Inventory"
              value="12.8K"
              change="+5.7%"
              delay="650ms"
            />
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-auto pt-8">
          <p className="text-[11px] text-slate-500">
            © 2026 Your Company. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
