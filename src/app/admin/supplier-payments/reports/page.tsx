import { Suspense } from "react";
import type { Metadata } from "next";
import { SupplierPaymentReportsView } from "@/components/admin/views/supplier-payment-reports-view";

export const metadata: Metadata = {
  title: "Supplier Payment Reports — Reflect Total Solutions ERP",
  description: "Overdue aging analysis, payables by supplier & job, and Excel/PDF exports.",
};

export default function SupplierPaymentReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs text-slate-500">
          Loading payment reports...
        </div>
      }
    >
      <SupplierPaymentReportsView />
    </Suspense>
  );
}
