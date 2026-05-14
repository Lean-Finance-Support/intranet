export default function AdminClientRentaLoading() {
  return (
    <div className="px-8 py-8 space-y-6 animate-pulse">
      {/* Breadcrumb + volver */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="h-3 bg-gray-200 rounded w-72" />
        <div className="h-3 bg-gray-200 rounded w-44" />
      </div>

      {/* Header con título */}
      <div className="space-y-2">
        <div className="h-3 bg-gray-200 rounded w-32" />
        <div className="h-7 bg-gray-300 rounded w-72" />
        <div className="h-3 bg-gray-200 rounded w-96" />
      </div>

      {/* Panel */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <div className="flex items-center gap-1 border-b border-gray-100 pb-2">
          <div className="h-3 bg-gray-200 rounded w-32" />
          <div className="h-3 bg-gray-200 rounded w-24 ml-3" />
          <div className="h-3 bg-gray-200 rounded w-32 ml-3" />
        </div>
        <div className="space-y-2 pt-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0"
            >
              <div className="h-3 bg-gray-200 rounded w-24" />
              <div className="h-3 bg-gray-100 rounded flex-1" />
              <div className="h-3 bg-gray-100 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
