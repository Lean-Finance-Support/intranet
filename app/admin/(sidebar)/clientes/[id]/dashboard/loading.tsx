export default function AdminClientDashboardLoading() {
  return (
    <div className="px-8 py-8 space-y-6 animate-pulse">
      {/* Breadcrumb + volver */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="h-3 bg-gray-200 rounded w-72" />
        <div className="h-3 bg-gray-200 rounded w-44" />
      </div>

      {/* Header con título empresa + sheet link */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <div className="h-3 bg-gray-300 rounded w-24" />
          <div className="h-7 bg-gray-300 rounded w-64" />
        </div>
        <div className="h-8 bg-gray-200 rounded-lg w-32" />
      </div>

      {/* Tabs de período + selector de banco */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 bg-gray-200 rounded-lg w-16" />
          ))}
        </div>
        <div className="h-8 bg-gray-200 rounded-lg w-40" />
      </div>

      {/* Tres columnas (Ventas / Compras / Bancos) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="h-4 bg-gray-200 rounded w-20" />
              <div className="h-6 bg-gray-100 rounded-lg w-24" />
            </div>
            <div className="space-y-2">
              <div className="h-3 bg-gray-100 rounded w-24" />
              <div className="h-8 bg-gray-300 rounded w-32" />
            </div>
            <div className="h-32 bg-gray-100 rounded-lg" />
          </div>
        ))}
      </div>

      {/* Tabla de pendientes */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <div className="h-4 bg-gray-200 rounded w-48" />
        <div className="space-y-2 pt-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
              <div className="h-3 bg-gray-200 rounded flex-1" />
              <div className="h-3 bg-gray-100 rounded w-20" />
              <div className="h-3 bg-gray-100 rounded w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
