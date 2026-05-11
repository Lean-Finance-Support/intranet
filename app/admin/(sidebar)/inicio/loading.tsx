export default function AdminDashboardLoading() {
  return (
    <div className="min-h-full px-8 py-12 animate-pulse">
      <div className="max-w-2xl">
        <div className="h-3 bg-gray-300 rounded w-24 mb-3" />
        <div className="h-8 bg-gray-300 rounded w-64" />
        <div className="w-10 h-0.5 bg-gray-300 rounded-full mt-6" />
      </div>
    </div>
  );
}
