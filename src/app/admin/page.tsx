import { DashboardView } from "@/components/admin/views/dashboard-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Dashboard — Reflect Total Solutions ERP",
  description: "Enterprise operations dashboard, jobs monitoring, and invoice ledger.",
};

export default function AdminDashboardPage() {
  return <DashboardView />;
}
