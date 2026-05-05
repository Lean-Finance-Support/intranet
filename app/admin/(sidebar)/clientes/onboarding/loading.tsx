export default function Loading() {
  return (
    <div className="min-h-full px-8 pt-12">
      <div className="max-w-6xl">
        <div className="h-8 w-64 bg-gray-200 rounded animate-pulse" />
        <div className="mt-8 h-2 w-full bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full w-1/4 bg-brand-teal/40 animate-pulse" />
        </div>
        <div className="mt-12 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
