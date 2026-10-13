import { AuditControllerView } from "@/components/admin/views/audit-controller-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Audit Controller & Compliance — Reflect Total Solutions ERP",
  description: "Internal verification ledger, automated compliance checks, and audit trails.",
};

export default function AuditControllerPage() {
  return <AuditControllerView />;
}
