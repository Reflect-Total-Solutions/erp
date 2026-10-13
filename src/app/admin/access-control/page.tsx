import { AccessControlView } from "@/components/admin/views/access-control-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Access Control & Permissions — Reflect Total Solutions ERP",
  description: "Role-based access control, permissions matrix, and user access management.",
};

export default function AccessControlPage() {
  return <AccessControlView />;
}
