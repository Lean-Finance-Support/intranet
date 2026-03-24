export default function AdminDashboardLoading() {
  return (
    <main className="min-h-screen bg-brand-navy flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-4">
        {/* Card principal skeleton */}
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center animate-pulse">
          <div className="w-12 h-12 bg-gray-200 rounded-full mx-auto mb-4" />
          <div className="h-3 bg-gray-200 rounded w-28 mx-auto mb-3" />
          <div className="h-6 bg-gray-200 rounded w-36 mx-auto mb-2" />
          <div className="h-3 bg-gray-200 rounded w-44 mx-auto" />
        </div>
        {/* Service card skeleton */}
        <div className="bg-white rounded-2xl shadow-lg p-6 animate-pulse">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-gray-200 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
