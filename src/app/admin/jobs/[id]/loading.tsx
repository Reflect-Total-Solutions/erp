export default function JobDetailsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-2xl bg-white border border-slate-200">
        <div className="space-y-2">
          <div className="h-4 w-32 bg-slate-200 rounded" />
          <div className="h-6 w-60 bg-slate-300 rounded" />
          <div className="h-3 w-44 bg-slate-100 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 bg-slate-200 rounded-lg" />
          <div className="h-9 w-32 bg-slate-200 rounded-lg" />
        </div>
      </div>

      {/* Financial Summary Skeletons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-4 rounded-xl bg-white border border-slate-200 space-y-2.5">
            <div className="h-3 w-20 bg-slate-200 rounded" />
            <div className="h-6 w-32 bg-slate-300 rounded" />
          </div>
        ))}
      </div>

      {/* Tabs & Table */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 space-y-4">
        <div className="flex gap-3 border-b border-slate-100 pb-3">
          <div className="h-8 w-24 bg-slate-200 rounded-lg" />
          <div className="h-8 w-24 bg-slate-100 rounded-lg" />
          <div className="h-8 w-24 bg-slate-100 rounded-lg" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-slate-50 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
