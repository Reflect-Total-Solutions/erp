import type { Metadata } from "next";
import { Suspense } from "react";
import { PoFormView } from "@/components/admin/views/po-form-view";

export const metadata: Metadata = {
  title: "Edit Purchase Order — Reflect Total Solutions ERP",
  description:
    "Edit draft or rejected Purchase Order line items, supplier details, tax breakdown, and department allocations.",
};

interface EditPoPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditPurchaseOrderPage({
  params,
}: EditPoPageProps) {
  const { id } = await params;

  return (
    <Suspense
      fallback={
        <div className="flex h-48 items-center justify-center text-xs text-slate-500">
          Loading Purchase Order editor...
        </div>
      }
    >
      <PoFormView mode="edit" poId={id || ""} />
    </Suspense>
  );
}
