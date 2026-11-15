import { redirect } from "next/navigation";

export default function SupplierPaymentsRootPage() {
  redirect("/admin/supplier-payments/list");
}
