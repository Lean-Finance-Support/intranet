export default function AdminDepartamentoLoading() {
  return (
    <div className="min-h-full px-8 py-12 animate-pulse">
      <div className="max-w-screen-2xl space-y-8">
        {/* Header */}
        <div>
          <div className="h-3 bg-gray-300 rounded w-36 mb-3" />
          <div className="h-8 bg-gray-300 rounded w-40" />
          <div className="mt-3 h-3 bg-gray-200 rounded w-96 max-w-full" />
        </div>

        {/* Tabs de departamentos */}
        <div className="flex gap-2 flex-wrap">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-9 bg-gray-200 rounded-lg"
              style={{ width: `${90 + (i % 3) * 30}px` }}
            />
          ))}
        </div>

        <section className="space-y-4">
          {/* Encabezado de sección */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-6 bg-gray-300 rounded w-48" />
              <div className="h-4 bg-gray-200 rounded-full w-14" />
            </div>
            <div className="h-9 bg-gray-200 rounded-lg w-40" />
          </div>

          {/* Bloque "Miembros" */}
          <div className="space-y-3">
            <div className="h-3 bg-gray-200 rounded w-20" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0" />
                    <div className="min-w-0 flex-1 space-y-2 pt-1">
                      <div className="h-3.5 bg-gray-200 rounded w-3/4" />
                      <div className="h-3 bg-gray-100 rounded w-5/6" />
                    </div>
                    <div className="h-4 bg-gray-200 rounded-full w-14 flex-shrink-0" />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <div className="h-4 bg-gray-100 rounded-full w-16" />
                    <div className="h-4 bg-gray-100 rounded-full w-20" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
