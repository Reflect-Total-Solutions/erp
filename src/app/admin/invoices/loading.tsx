import { TableSkeleton } from "@/components/ui/loading/table-skeleton";

export default function InvoicesLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200">
        <div className="space-y-1.5">
          <div className="h-6 w-52 bg-slate-200 rounded" />
          <div className="h-3.5 w-80 max-w-full bg-slate-100 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-32 bg-slate-200 rounded-lg" />
          <div className="h-9 w-28 bg-slate-200 rounded-lg" />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2">
            <div className="h-3 w-20 bg-slate-200 rounded" />
            <div className="h-6 w-28 bg-slate-300 rounded" />
          </div>
        ))}
      </div>

      {/* Invoices Table Skeleton */}
      <TableSkeleton rows={6} columns={9} />
    </div>
  );
}
