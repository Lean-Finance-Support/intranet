export default function RentaPublicLayout({ children }: { children: React.ReactNode }) {
  return (
    // h-screen overflow-y-auto: contrarresta el `html { overflow: hidden }` global
    // que asume layout con sidebar de scroll interno (admin/app). Esta es una ruta
    // pública sin sidebar, así que necesita su propio contenedor scrolleable.
    <div className="h-screen overflow-y-auto bg-surface-gray flex flex-col">
      <header className="w-full bg-brand-navy border-b border-brand-navy/40">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <a
            href="https://leanfinance.es"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center"
          >
            <img
              src="https://leanfinance.es/wp-content/uploads/2022/01/LEANFINANCE_Ppal_Color_transp-2.png"
              alt="Lean Finance"
              className="h-10 w-auto brightness-0 invert"
            />
          </a>
          <span className="text-xs font-medium uppercase tracking-wider text-white/80">
            Declaración de la renta
          </span>
        </div>
        <div className="h-1 bg-brand-teal" />
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
