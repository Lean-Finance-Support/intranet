export default function AdminClientesLoading() {
  return (
    <div className="min-h-full px-8 pt-6 pb-12 animate-pulse">
      <div className="max-w-screen-2xl space-y-3">
        {/* Header compacto */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="h-3 bg-gray-300 rounded w-32 mb-2" />
            <div className="h-7 bg-gray-300 rounded w-40" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 bg-gray-200 rounded-lg w-36" />
            <div className="h-9 bg-gray-200 rounded-lg w-40" />
          </div>
        </div>

        {/* Search + filters en una sola fila */}
        <div className="flex items-center gap-2">
          <div className="h-9 bg-gray-200 rounded-lg w-72" />
          <div className="h-7 bg-gray-200 rounded-full w-32" />
          <div className="h-7 bg-gray-200 rounded-full w-24" />
          <div className="h-7 bg-gray-200 rounded-full w-24" />
          <div className="ml-auto h-4 bg-gray-200 rounded w-20" />
        </div>

        {/* Card grid */}
        <div className="@container pt-1">
          <div className="grid grid-cols-1 @lg:grid-cols-2 @4xl:grid-cols-3 @7xl:grid-cols-4 gap-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 space-y-3">
                <div className="space-y-1.5">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
                <div className="flex gap-1.5">
                  <div className="h-4 bg-gray-100 rounded-full w-16" />
                  <div className="h-4 bg-gray-100 rounded-full w-20" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
