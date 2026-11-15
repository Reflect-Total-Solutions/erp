import { Suspense } from "react";
import type { Metadata } from "next";
import { SupplierPaymentsListView } from "@/components/admin/views/supplier-payments-list-view";

export const metadata: Metadata = {
  title: "Outstanding Supplier Invoices — Reflect Total Solutions ERP",
  description: "Monitor unpaid, partially paid, and overdue supplier invoices requiring settlement.",
};

export default function OutstandingSupplierInvoicesPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs text-slate-500">
          Loading outstanding invoices...
        </div>
      }
    >
      <SupplierPaymentsListView outstandingOnly />
    </Suspense>
  );
}
