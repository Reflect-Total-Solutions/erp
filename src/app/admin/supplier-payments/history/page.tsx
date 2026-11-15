import { Suspense } from "react";
import type { Metadata } from "next";
import { SupplierPaymentHistoryView } from "@/components/admin/views/supplier-payment-history-view";

export const metadata: Metadata = {
  title: "Supplier Payment History — Reflect Total Solutions ERP",
  description: "Complete transaction history, payment receipts, edits, and audited reversals.",
};

export default function SupplierPaymentHistoryPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs text-slate-500">
          Loading payment history...
        </div>
      }
    >
      <SupplierPaymentHistoryView />
    </Suspense>
  );
}
