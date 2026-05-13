/**
 * Skeleton para el bloque <DashboardFiscalSection>. Lo separamos de la
 * página porque el server component puede tardar varios segundos en el
 * primer hit (Google Sheets sin caché). Con este fallback el saludo +
 * shell aparecen al instante y el dashboard streamea cuando esté listo.
 */
export default function DashboardFiscalSkeleton() {
  return (
    <section className="space-y-4 animate-pulse">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0 space-y-2">
          <div className="h-3 w-24 bg-gray-200 rounded" />
          <div className="h-9 w-72 max-w-full bg-gray-200 rounded" />
        </div>
        <div className="h-8 w-56 bg-gray-200 rounded-lg" />
      </header>

      <div className="h-9 w-72 bg-gray-200 rounded-lg" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {(["navy", "navy", "teal"] as const).map((accent, i) => (
          <article
            key={i}
            className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden"
          >
            <div
              className={`${accent === "teal" ? "bg-brand-teal/60" : "bg-brand-navy/60"} px-5 py-3`}
            >
              <div className="h-3 w-20 bg-white/30 rounded" />
            </div>
            <div className="p-5 min-h-[220px] space-y-4">
              <div className="h-3 w-32 bg-gray-100 rounded" />
              <div className="h-9 w-40 bg-gray-200 rounded" />
              <div className="border-t border-gray-100" />
              <div className="h-3 w-24 bg-gray-100 rounded" />
              <div className="h-6 w-32 bg-gray-200 rounded" />
            </div>
          </article>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <article
            key={i}
            className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="h-3 w-32 bg-gray-100 rounded mb-3" />
            <div className="grid grid-cols-3 gap-3">
              <div className="h-8 bg-gray-100 rounded" />
              <div className="h-8 bg-gray-100 rounded" />
              <div className="h-8 bg-gray-100 rounded" />
            </div>
          </article>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="h-48 bg-white rounded-2xl border border-gray-200" />
        <div className="h-48 bg-white rounded-2xl border border-gray-200" />
      </div>
    </section>
  );
}
