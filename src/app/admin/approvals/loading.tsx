import { TableSkeleton } from "@/components/ui/loading/table-skeleton";

export default function ApprovalsLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200">
        <div className="space-y-1.5">
          <div className="h-6 w-52 bg-slate-200 rounded" />
          <div className="h-3.5 w-80 max-w-full bg-slate-100 rounded" />
        </div>
      </div>
      <TableSkeleton rows={6} columns={7} />
    </div>
  );
}
