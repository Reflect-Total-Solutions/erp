import { Suspense } from "react";
import type { Metadata } from "next";
import { SupplierPaymentsListView } from "@/components/admin/views/supplier-payments-list-view";

export const metadata: Metadata = {
  title: "All Supplier Payments — Reflect Total Solutions ERP",
  description: "Track eligible supplier invoices, due dates, partial payments, and settlement statuses.",
};

export default function AllSupplierPaymentsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs text-slate-500">
          Loading supplier payments...
        </div>
      }
    >
      <SupplierPaymentsListView />
    </Suspense>
  );
}
