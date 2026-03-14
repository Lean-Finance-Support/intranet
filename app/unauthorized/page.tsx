export default function UnauthorizedPage() {
  return (
    <main className="min-h-screen bg-surface-gray flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="text-center mb-8">
          <img
            src="/logo-leanfinance.png"
            alt="LeanFinance"
            className="h-20 w-auto mx-auto"
          />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10">
          <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg
              className="w-7 h-7 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-bold font-heading text-brand-navy mb-3">
            Sin acceso
          </h1>
          <p className="text-text-muted text-sm leading-relaxed mb-8">
            Tu cuenta de Google no está registrada en la plataforma. Si crees
            que es un error, contacta con tu asesor de LeanFinance.
          </p>

          <a
            href="mailto:tech@leanfinance.es"
            className="inline-block bg-brand-teal text-white font-medium text-sm px-6 py-3 rounded-full hover:bg-opacity-90 transition-colors"
          >
            Contactar con soporte
          </a>
        </div>

        <p className="text-text-muted text-xs mt-6">
          ¿Tienes otra cuenta de Google?{" "}
          <a
            href="/"
            className="text-brand-teal hover:underline"
          >
            Intentar de nuevo
          </a>
        </p>
      </div>
    </main>
  );
}
