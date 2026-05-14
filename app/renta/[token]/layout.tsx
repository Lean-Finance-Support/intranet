export default function RentaPublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-gray">
      <header className="w-full bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <a href="https://leanfinance.es" target="_blank" rel="noopener noreferrer">
            <img
              src="https://leanfinance.es/wp-content/uploads/2022/01/LEANFINANCE_Ppal_Color_transp-2.png"
              alt="Lean Finance"
              className="h-8 w-auto"
            />
          </a>
          <span className="text-xs text-text-muted">Declaración de la renta</span>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8">{children}</main>
      <footer className="max-w-3xl mx-auto px-4 py-6 text-xs text-text-muted">
        <p>
          Esta plataforma es propiedad de Lean Finance Asesores SL. Tus datos se tratan únicamente
          para preparar tu declaración de la renta. Consulta nuestra política de privacidad en{" "}
          <a href="https://leanfinance.es" className="text-brand-teal underline">
            leanfinance.es
          </a>
          .
        </p>
      </footer>
    </div>
  );
}
