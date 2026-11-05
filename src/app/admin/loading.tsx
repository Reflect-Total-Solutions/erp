import { DashboardSkeleton } from "@/components/ui/loading/dashboard-skeleton";

export default function AdminLoading() {
  return (
    <div className="space-y-6">
      <DashboardSkeleton cardCount={4} />
    </div>
  );
}
