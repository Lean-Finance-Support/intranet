export default function ClientDetailLoading() {
  return (
    <div className="min-h-full px-8 py-8 animate-pulse">
      <div className="max-w-screen-2xl space-y-6">
        <div className="h-3 bg-gray-200 rounded w-32" />
        <div className="h-9 bg-gray-300 rounded w-72" />
        <div className="h-4 bg-gray-200 rounded w-48" />
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-7 bg-gray-200 rounded w-24" />
          ))}
        </div>
        <div className="h-64 bg-white rounded-2xl border border-gray-100" />
      </div>
    </div>
  );
}
