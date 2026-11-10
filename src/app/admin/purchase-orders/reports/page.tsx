import type { Metadata } from "next";
import { Suspense } from "react";
import { PoReportsView } from "@/components/admin/views/po-reports-view";

export const metadata: Metadata = {
  title: "Purchase Order Reports & Settings — Reflect Total Solutions ERP",
  description:
    "Analyze Purchase Order commitments vs actual supplier invoices, department allocations, and manage global PO defaults.",
};

export default function PurchaseOrdersReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs text-slate-500">
          Loading PO Reports & Settings...
        </div>
      }
    >
      <PoReportsView />
    </Suspense>
  );
}
