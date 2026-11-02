import { ApprovalsView } from "@/components/admin/views/approvals-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Job Approvals & Authorization — Reflect Total Solutions ERP",
  description: "Review, authorize, or reject quotation jobs and manage project sign-offs.",
};

export default function ApprovalsPage() {
  return <ApprovalsView />;
}
