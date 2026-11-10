import type { Metadata } from "next";
import { Suspense } from "react";
import { ApprovalsView } from "@/components/admin/views/approvals-view";

export const metadata: Metadata = {
  title: "Approvals Center (Jobs & Purchase Orders) — Reflect Total Solutions ERP",
  description:
    "Review, authorize, reject, or manage pending project quotations and Purchase Orders in a unified approval queue.",
};

export default function ApprovalsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs text-slate-500">
          Loading Approval Center...
        </div>
      }
    >
      <ApprovalsView />
    </Suspense>
  );
}
