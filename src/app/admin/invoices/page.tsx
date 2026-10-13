import { InvoicesView } from "@/components/admin/views/invoices-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Invoice Management — Reflect Total Solutions ERP",
  description: "Cross-job billing invoices, payment statuses, and bulk upload ledger.",
};

export default function InvoicesPage() {
  return <InvoicesView />;
}
