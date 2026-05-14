export default function RentaPublicLayout({ children }: { children: React.ReactNode }) {
  return (
    // h-screen overflow-y-auto: contrarresta el `html { overflow: hidden }` global
    // que asume layout con sidebar de scroll interno (admin/app). Esta es una ruta
    // pública sin sidebar, así que necesita su propio contenedor scrolleable.
    <div className="h-screen overflow-y-auto bg-surface-gray flex flex-col">
      <header className="w-full bg-white border-b border-gray-100 shadow-[0_1px_2px_rgba(15,36,68,0.04)]">
        {/* Franja decorativa teal muy fina como acento de marca */}
        <div className="h-[3px] bg-brand-teal" />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-7 flex items-center justify-between gap-4">
          <a
            href="https://leanfinance.es"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center"
          >
            <img
              src="https://leanfinance.es/wp-content/uploads/2022/01/LEANFINANCE_Ppal_Color_transp-2.png"
              alt="Lean Finance"
              className="h-9 sm:h-11 w-auto"
            />
          </a>
          <div className="flex flex-col items-end gap-0.5 text-right">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-teal">
              Campaña 2025
            </span>
            <span className="text-sm sm:text-base font-medium text-brand-navy">
              Declaración de la renta
            </span>
          </div>
        </div>
      </header>
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-8">{children}</main>
      <footer className="w-full max-w-3xl mx-auto px-4 py-6 text-xs text-text-muted">
        <p>
          Esta plataforma es propiedad de Lean Finance SL. Tus datos se tratan únicamente para
          preparar tu declaración de la renta. Consulta nuestra política de privacidad en{" "}
          <a href="https://leanfinance.es" className="text-brand-teal underline">
            leanfinance.es
          </a>
          .
        </p>
      </footer>
    </div>
  );
}
