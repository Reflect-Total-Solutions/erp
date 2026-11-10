import type { Metadata } from "next";
import { Suspense } from "react";
import { PoTrackingView } from "@/components/admin/views/po-tracking-view";

export const metadata: Metadata = {
  title: "PO Delivery & Logistics Tracking — Reflect Total Solutions ERP",
  description:
    "Track issued Purchase Orders, overdue schedules, partial goods receipts, and supplier deliveries.",
};

export default function PurchaseOrdersTrackingPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs text-slate-500">
          Loading PO Tracking...
        </div>
      }
    >
      <PoTrackingView />
    </Suspense>
  );
}
