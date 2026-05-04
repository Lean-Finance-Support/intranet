export default function AsignacionMultipleLoading() {
  return (
    <div className="min-h-full px-8 py-12 animate-pulse">
      <div className="max-w-5xl">
        {/* Breadcrumb back + header */}
        <div className="h-3 bg-gray-200 rounded w-32 mb-3" />
        <div className="h-3 bg-gray-300 rounded w-32 mb-2" />
        <div className="h-8 bg-gray-300 rounded w-64" />
        <div className="mt-2 space-y-1.5 max-w-2xl">
          <div className="h-3.5 bg-gray-200 rounded w-full" />
          <div className="h-3.5 bg-gray-200 rounded w-5/6" />
        </div>

        {/* Step 1 + Step 2 lado a lado */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Apartados/bloques */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-baseline justify-between mb-4">
              <div className="h-4 bg-gray-200 rounded w-40" />
              <div className="h-3 bg-gray-100 rounded w-24" />
            </div>
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className="border border-gray-100 rounded-xl overflow-hidden"
                >
                  <div className="px-3 py-2 bg-gray-50 flex items-center gap-2">
                    <div className="w-3.5 h-3.5 bg-gray-200 rounded" />
                    <div className="h-3.5 bg-gray-200 rounded w-32" />
                    <div className="h-3 bg-gray-100 rounded w-16 ml-auto" />
                  </div>
                  <div className="divide-y divide-gray-100">
                    {Array.from({ length: 3 }).map((_, j) => (
                      <div key={j} className="flex items-center gap-2 px-3 py-2">
                        <div className="w-3.5 h-3.5 bg-gray-200 rounded" />
                        <div className="flex-1 space-y-1">
                          <div className="h-3 bg-gray-200 rounded w-3/4" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Empresas */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-baseline justify-between mb-4">
              <div className="h-4 bg-gray-200 rounded w-44" />
              <div className="h-3 bg-gray-100 rounded w-24" />
            </div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 h-9 bg-gray-100 rounded-lg" />
              <div className="h-9 bg-gray-100 rounded-md w-28" />
            </div>
            <div className="border border-gray-100 rounded-xl divide-y divide-gray-100">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2">
                  <div className="w-3.5 h-3.5 bg-gray-200 rounded" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3 bg-gray-200 rounded w-3/5" />
                    <div className="h-2.5 bg-gray-100 rounded w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer submit */}
        <div className="mt-8 flex items-center justify-between border-t border-gray-100 pt-6">
          <div className="h-3.5 bg-gray-200 rounded w-64" />
          <div className="flex items-center gap-2">
            <div className="h-9 bg-gray-100 rounded-lg w-24" />
            <div className="h-9 bg-gray-200 rounded-lg w-44" />
          </div>
        </div>
      </div>
    </div>
  );
}
