import type { Metadata } from "next";
import { Suspense } from "react";
import { PoDetailsView } from "@/components/admin/views/po-details-view";

export const metadata: Metadata = {
  title: "Purchase Order Details — Reflect Total Solutions ERP",
  description:
    "Inspect Purchase Order line items, printable two-sheet formal PO document, linked invoices, and audit logs.",
};

interface PoDetailsPageProps {
  params: Promise<{ id: string }>;
}

export default async function PurchaseOrderDetailsPage({
  params,
}: PoDetailsPageProps) {
  const { id } = await params;

  return (
    <Suspense
      fallback={
        <div className="flex h-48 items-center justify-center text-xs text-slate-500">
          Loading Purchase Order details...
        </div>
      }
    >
      <PoDetailsView poId={id || ""} />
    </Suspense>
  );
}
