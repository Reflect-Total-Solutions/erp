import { TableSkeleton } from "@/components/ui/loading/table-skeleton";

export default function AuditControllerLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200">
        <div className="space-y-1.5">
          <div className="h-6 w-60 bg-slate-200 rounded" />
          <div className="h-3.5 w-96 max-w-full bg-slate-100 rounded" />
        </div>
      </div>
      <TableSkeleton rows={7} columns={6} />
    </div>
  );
}
