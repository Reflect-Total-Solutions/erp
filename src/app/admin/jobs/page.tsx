import { JobsView } from "@/components/admin/views/jobs-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Jobs Management — Reflect Total Solutions ERP",
  description: "Manage commercial jobs, contracts, assigned suppliers, and invoices.",
};

export default function JobsPage() {
  return <JobsView />;
}
