import type { Metadata } from "next";
import { Suspense } from "react";
import { PoFormView } from "@/components/admin/views/po-form-view";

export const metadata: Metadata = {
  title: "Create Purchase Order — Reflect Total Solutions ERP",
  description:
    "Create a new Purchase Order linked to an approved Job, auto-load budgeted cost items, select supplier, and configure allocations.",
};

interface CreatePoPageProps {
  searchParams: Promise<{ jobId?: string | string[] }>;
}

async function CreatePoContent({ searchParams }: CreatePoPageProps) {
  const resolvedParams = await searchParams;
  const rawJobId = resolvedParams?.jobId;
  const initialJobId =
    typeof rawJobId === "string" && rawJobId.trim().length > 0
      ? rawJobId.trim()
      : undefined;

  return <PoFormView mode="create" initialJobId={initialJobId} />;
}

export default function CreatePurchaseOrderPage({
  searchParams,
}: CreatePoPageProps) {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs text-slate-500">
          Preparing Create Purchase Order workspace...
        </div>
      }
    >
      <CreatePoContent searchParams={searchParams} />
    </Suspense>
  );
}
