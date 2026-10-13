import { SuppliersView } from "@/components/admin/views/suppliers-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Supplier Register — Reflect Total Solutions ERP",
  description: "Certified suppliers and trade contractors registry.",
};

export default function SuppliersPage() {
  return <SuppliersView />;
}
