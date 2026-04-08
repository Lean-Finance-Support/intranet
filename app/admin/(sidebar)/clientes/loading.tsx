export default function AdminClientesLoading() {
  return (
    <div className="min-h-full px-8 py-12 animate-pulse">
      <div className="max-w-6xl space-y-6">
        {/* Header */}
        <div>
          <div className="h-3 bg-gray-300 rounded w-32 mb-3" />
          <div className="h-8 bg-gray-300 rounded w-40" />
        </div>

        {/* Search + filters */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-10 bg-gray-200 rounded-lg w-72" />
            <div className="h-4 bg-gray-200 rounded w-16" />
          </div>
          <div className="flex gap-2">
            <div className="h-7 bg-gray-200 rounded-full w-20" />
            <div className="h-7 bg-gray-200 rounded-full w-24" />
            <div className="h-7 bg-gray-200 rounded-full w-20" />
          </div>
        </div>

        {/* Card grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
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
  );
}
