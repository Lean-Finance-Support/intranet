export default function ContactoLoading() {
  return (
    <div className="px-4 sm:px-8 pt-12 pb-12 animate-pulse">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="h-3 bg-gray-300 rounded w-32 mb-3" />
        <div className="h-8 bg-gray-300 rounded w-40" />
        <div className="mt-4 space-y-2 max-w-2xl">
          <div className="h-3 bg-gray-200 rounded w-full" />
          <div className="h-3 bg-gray-200 rounded w-5/6" />
          <div className="h-3 bg-gray-200 rounded w-3/4" />
        </div>
        <div className="w-10 h-0.5 bg-gray-200 rounded-full mt-6 mb-10" />

        <div className="space-y-8">
          {/* Bloques de departamentos */}
          {Array.from({ length: 2 }).map((_, i) => (
            <section key={i}>
              <div className="h-4 bg-gray-300 rounded w-48 mb-3" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Array.from({ length: 2 }).map((_, j) => (
                  <div
                    key={j}
                    className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3"
                  >
                    <div className="w-11 h-11 rounded-full bg-gray-200 flex-shrink-0" />
                    <div className="min-w-0 flex-1 space-y-2 pt-1">
                      <div className="h-3.5 bg-gray-200 rounded w-3/4" />
                      <div className="h-3 bg-gray-100 rounded w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {/* Soporte técnico */}
          <section>
            <div className="h-4 bg-gray-300 rounded w-36 mb-3" />
            <div className="bg-brand-navy/90 rounded-xl p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-white/10 flex-shrink-0" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3.5 bg-white/20 rounded w-32" />
                <div className="h-3 bg-white/10 rounded w-3/4" />
              </div>
              <div className="h-8 w-20 bg-white/20 rounded-lg flex-shrink-0" />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
