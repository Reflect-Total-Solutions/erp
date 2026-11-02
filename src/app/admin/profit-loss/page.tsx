import { Suspense } from "react";
import { ProfitLossView } from "@/components/admin/views/profit-loss-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Job Financial Summary / Profit & Loss — Reflect Total Solutions ERP",
  description: "Cross-job financial performance, actual supplier costs, and recorded gross profit margins.",
};

export default function ProfitLossPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">Loading Profit & Loss report...</div>}>
      <ProfitLossView />
    </Suspense>
  );
}
