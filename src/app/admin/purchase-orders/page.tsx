import type { Metadata } from "next";
import { Suspense } from "react";
import { PoDashboardView } from "@/components/admin/views/po-dashboard-view";

export const metadata: Metadata = {
  title: "Purchase Order Dashboard — Reflect Total Solutions ERP",
  description:
    "Overview of purchase order commitments, approval status, supplier allocations, and delivery schedules.",
};

export default function PurchaseOrdersDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs text-slate-500">
          Loading PO Dashboard...
        </div>
      }
    >
      <PoDashboardView />
    </Suspense>
  );
}
