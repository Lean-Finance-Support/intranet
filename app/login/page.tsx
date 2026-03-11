"use client";

import { useState } from "react";
import { signIn } from "./actions";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setLoading(true);
    const result = await signIn(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
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
          {/* Eyebrow + título */}
          <p className="text-brand-teal text-sm font-medium mb-1">Portal de clientes</p>
          <h1 className="text-2xl font-bold font-heading text-brand-navy mb-2">
            Accede a tu área
          </h1>
          <p className="text-text-muted text-sm mb-8">
            Introduce tu email y CIF/NIF para acceder.
          </p>

          {/* Separador decorativo */}
          <div className="w-10 h-1 bg-brand-teal rounded-full mb-8" />

          {/* Formulario */}
          <form action={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-text-body mb-1.5"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="empresa@ejemplo.com"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-text-body text-sm placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-teal focus:border-transparent transition"
              />
            </div>

            <div>
              <label
                htmlFor="cifNif"
                className="block text-sm font-medium text-text-body mb-1.5"
              >
                CIF / NIF
              </label>
              <input
                id="cifNif"
                name="cifNif"
                type="text"
                required
                autoComplete="off"
                placeholder="B12345678"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-text-body text-sm placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-teal focus:border-transparent transition uppercase"
              />
            </div>

            {/* Error */}
            {error && (
              <p className="text-sm text-red-500 bg-red-50 px-4 py-3 rounded-xl">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-teal text-white font-body font-medium px-6 py-3 rounded-full hover:bg-opacity-90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {loading ? "Accediendo..." : "Acceder"}
            </button>
          </form>
        </div>

        {/* Footer */}
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
