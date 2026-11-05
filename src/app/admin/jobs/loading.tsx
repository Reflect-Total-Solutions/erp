import { TableSkeleton } from "@/components/ui/loading/table-skeleton";

export default function JobsLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200">
        <div className="space-y-1.5">
          <div className="h-6 w-36 bg-slate-200 rounded" />
          <div className="h-3.5 w-64 bg-slate-100 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 bg-slate-200 rounded-lg" />
          <div className="h-9 w-32 bg-slate-200 rounded-lg" />
        </div>
      </div>
      <TableSkeleton rows={7} columns={8} />
    </div>
  );
}
