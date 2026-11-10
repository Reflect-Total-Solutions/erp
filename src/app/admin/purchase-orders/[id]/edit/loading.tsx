export default function EditPoLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
        <div className="space-y-1.5">
          <div className="h-6 w-56 bg-slate-200 rounded" />
          <div className="h-3.5 w-80 bg-slate-100 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          <div className="h-44 rounded-xl bg-white border border-slate-200" />
          <div className="h-72 rounded-xl bg-white border border-slate-200" />
        </div>
        <div className="h-96 rounded-xl bg-white border border-slate-200" />
      </div>
    </div>
  );
}
