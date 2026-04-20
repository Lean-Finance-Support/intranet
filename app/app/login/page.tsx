import Image from "next/image";
import LoginForm from "@/components/login-form";

export default function ClientLoginPage() {
  return (
    <main className="min-h-screen bg-brand-navy flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8 animate-fade-in-up">
          <Image
            src="/logo-leanfinance-white.png"
            alt="LeanFinance"
            width={279}
            height={96}
            priority
            className="h-24 w-auto mx-auto"
          />
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg p-8 animate-fade-in-up animate-delay-75">
          <p className="text-brand-teal text-sm font-medium mb-1">
            Portal de clientes
          </p>
          <h1 className="text-2xl font-bold font-heading text-brand-navy tracking-tight mb-2">
            Accede a tu área
          </h1>
          <p className="text-text-muted text-sm mb-8 leading-relaxed">
            Usa tu cuenta de Google o Microsoft para acceder al portal.
          </p>

          <div className="w-12 h-1 rounded-full mb-8 bg-gradient-to-r from-brand-teal to-brand-blue" />

          <LoginForm />
        </div>

        <p className="text-center text-white/40 text-xs mt-6 animate-fade-in-up animate-delay-225">
          ¿Problemas para acceder?{" "}
          <a
            href="mailto:tech@leanfinance.es"
            className="text-white/70 hover:text-white transition-colors"
          >
            Contacta con nosotros
          </a>
        </p>
      </div>
    </main>
  );
}
