"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ClientLoginPage() {
  const [loading, setLoading] = useState(false);

  async function handleGoogleLogin() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <main className="min-h-screen bg-surface-gray flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="https://leanfinance.es/wp-content/uploads/2022/01/LEANFINANCE_Ppal_Color_transp-2.png"
            alt="LeanFinance"
            className="h-24 w-auto mx-auto"
          />
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <p className="text-brand-teal text-sm font-medium mb-1">
            Portal de clientes
          </p>
          <h1 className="text-2xl font-bold font-heading text-brand-navy mb-2">
            Accede a tu área
          </h1>
          <p className="text-text-muted text-sm mb-8">
            Usa tu cuenta de Google para acceder al portal.
          </p>

          <div className="w-10 h-1 bg-brand-teal rounded-full mb-8" />

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 border border-gray-200 rounded-xl px-5 py-3.5 text-text-body text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {/* Google icon */}
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {loading ? "Redirigiendo..." : "Continuar con Google"}
          </button>
        </div>

        <p className="text-center text-text-muted text-xs mt-6">
          ¿Problemas para acceder?{" "}
          <a
            href="mailto:info@leanfinance.es"
            className="text-brand-teal hover:underline"
          >
            Contacta con nosotros
          </a>
        </p>
      </div>
    </main>
  );
}
