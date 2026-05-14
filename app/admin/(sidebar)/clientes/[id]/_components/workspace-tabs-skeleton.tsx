/**
 * Skeleton del bloque "tabs + contenido" del workspace mientras streamea
 * desde el server. La cabecera (breadcrumb + h1) la pinta `ClientHeaderShell`
 * fuera del Suspense, así que aquí solo cubrimos los tabs y la lista de
 * documentación (vista por defecto).
 */
export default function WorkspaceTabsSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mt-4 border-b border-gray-200 flex items-center gap-4 flex-wrap pb-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-4 bg-gray-200 rounded w-28" />
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm space-y-2"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="h-4 bg-gray-200 rounded w-1/3" />
              <div className="h-3 bg-gray-100 rounded w-16" />
            </div>
            <div className="h-3 bg-gray-100 rounded w-2/3" />
            <div className="flex gap-2 mt-2">
              <div className="h-5 bg-gray-100 rounded w-20" />
              <div className="h-5 bg-gray-100 rounded w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
