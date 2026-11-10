import { TableSkeleton } from "@/components/ui/loading/table-skeleton";

export default function PoTrackingLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-14 border-b border-slate-200 pb-2 space-y-1.5">
        <div className="h-6 w-52 bg-slate-200 rounded" />
        <div className="h-3.5 w-80 bg-slate-100 rounded" />
      </div>
      <TableSkeleton rows={6} columns={7} />
    </div>
  );
}
