export default function AdminServiciosLoading() {
  return (
    <div className="min-h-full px-8 py-12 animate-pulse">
      <div className="max-w-7xl">
        <div className="h-3 bg-gray-300 rounded w-32 mb-3" />
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="h-8 bg-gray-300 rounded w-72" />
            <div className="h-4 bg-gray-200 rounded w-full max-w-xl" />
            <div className="h-4 bg-gray-200 rounded w-2/3 max-w-md" />
          </div>
          <div className="h-9 bg-gray-200 rounded-lg w-44" />
        </div>

        <div className="mt-8 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm"
            >
              <div className="px-5 py-4 border-b border-gray-100">
                <div className="h-4 bg-gray-200 rounded w-48" />
              </div>
              <div className="px-5 py-4 space-y-2">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div
                    key={j}
                    className="flex items-center gap-2 bg-white border border-gray-100 rounded-xl px-3 py-2.5"
                  >
                    <div className="flex-1 h-3.5 bg-gray-200 rounded w-3/5" />
                    <div className="h-4 bg-gray-100 rounded-full w-16" />
                    <div className="h-4 bg-gray-100 rounded-full w-20" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
