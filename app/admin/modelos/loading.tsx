export default function AdminModelosLoading() {
  return (
    <div className="min-h-screen bg-brand-navy">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-5 h-5 bg-white/20 rounded" />
          <div className="h-7 bg-white/20 rounded w-72" />
        </div>
        <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8 animate-pulse">
          <div className="space-y-4">
            <div className="h-5 bg-gray-200 rounded w-48" />
            <div className="h-4 bg-gray-200 rounded w-full" />
            <div className="h-4 bg-gray-200 rounded w-3/4" />
            <div className="h-32 bg-gray-100 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
