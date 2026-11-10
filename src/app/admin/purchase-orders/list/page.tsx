import type { Metadata } from "next";
import { Suspense } from "react";
import { PoListView } from "@/components/admin/views/po-list-view";

export const metadata: Metadata = {
  title: "All Purchase Orders — Reflect Total Solutions ERP",
  description:
    "Browse, filter, export, and manage active and trashed Purchase Orders across approved Jobs.",
};

export default async function PurchaseOrdersListPage({
  searchParams,
}: {
  searchParams: Promise<{ supplierId?: string | string[]; search?: string | string[] }>;
}) {
  const sp = await searchParams;
  const initialSupplierId = Array.isArray(sp?.supplierId)
    ? sp.supplierId[0]
    : sp?.supplierId;
  const initialSearch = Array.isArray(sp?.search) ? sp.search[0] : sp?.search;

  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs text-slate-500">
          Loading Purchase Orders...
        </div>
      }
    >
      <PoListView
        initialSupplierId={initialSupplierId}
        initialSearch={initialSearch}
      />
    </Suspense>
  );
}
