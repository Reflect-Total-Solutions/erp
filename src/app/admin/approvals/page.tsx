import { ApprovalsView } from "@/components/admin/views/approvals-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Approvals & Authorization — Reflect Total Solutions ERP",
  description: "Review, approve, or hold vendor invoices and project jobs.",
};

export default function ApprovalsPage() {
  return <ApprovalsView />;
}
