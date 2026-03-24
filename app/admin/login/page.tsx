"use client";

import { useState, useRef } from "react";
import Script from "next/script";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

// Tipos mínimos para Google Identity Services (compartidos con client login)
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: {
            client_id: string;
            callback(resp: { credential: string }): void;
            ux_mode?: string;
          }): void;
          renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
        };
      };
    };
  }
}

const GIS_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

function isMobile() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

export default function AdminLoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();
  const router = useRouter();
  const btnRef = useRef<HTMLDivElement>(null);
  const useGIS = GIS_CLIENT_ID && !isMobile();

  function initGIS() {
    if (!GIS_CLIENT_ID || !window.google?.accounts?.id) return;
    window.google.accounts.id.initialize({
      client_id: GIS_CLIENT_ID,
      callback: handleGISCredential,
      ux_mode: "popup",
    });
    if (btnRef.current) {
      window.google.accounts.id.renderButton(btnRef.current, {
        type: "standard",
        shape: "rectangular",
        theme: "outline",
        text: "continue_with",
        size: "large",
        logo_alignment: "center",
        width: btnRef.current.clientWidth || 360,
      });
    }
  }

  async function handleGISCredential({ credential }: { credential: string }) {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: credential,
    });
    if (error) {
      router.push("/unauthorized");
      return;
    }
    router.push("/auth/verify");
  }

  async function handleOAuthFallback() {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  // Microsoft (Azure) OAuth — siempre redirect
  async function handleMicrosoftLogin() {
    setLoading(true);
    setError(null);
    await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: "email openid profile",
      },
    });
  }

  const oauthButtonClass =
    "w-full flex items-center justify-center gap-3 border border-gray-200 rounded-xl px-5 py-3.5 text-text-body text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

  return (
    <main className="min-h-screen bg-brand-navy flex items-center justify-center px-4">
      {useGIS && (
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onLoad={initGIS}
        />
      )}

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Image
            src="/logo-leanfinance.png"
            alt="LeanFinance"
            width={279}
            height={96}
            priority
            className="h-24 w-auto mx-auto brightness-0 invert"
          />
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <p className="text-brand-teal text-sm font-medium mb-1">
            Portal de empleados
          </p>
          <h1 className="text-2xl font-bold font-heading text-brand-navy mb-2">
            Acceso interno
          </h1>
          <p className="text-text-muted text-sm mb-8">
            Usa tu cuenta de Google o Microsoft corporativa para acceder.
          </p>

          <div className="w-10 h-1 bg-brand-teal rounded-full mb-8" />

          {error && (
            <p className="text-red-500 text-sm mb-4 text-center">{error}</p>
          )}

          <div className="flex flex-col gap-3">
            {useGIS ? (
              <div
                ref={btnRef}
                className="w-full flex justify-center min-h-[44px]"
              />
            ) : (
              <button
                onClick={handleOAuthFallback}
                disabled={loading}
                className={oauthButtonClass}
              >
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                {loading ? "Entrando..." : "Continuar con Google"}
              </button>
            )}

            <button
              onClick={handleMicrosoftLogin}
              disabled={loading}
              className={oauthButtonClass}
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 21 21">
                <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
              </svg>
              {loading ? "Entrando..." : "Continuar con Microsoft"}
            </button>
          </div>
        </div>

        <p className="text-center text-white/40 text-xs mt-6">
          ¿Problemas para acceder?{" "}
          <a
            href="mailto:tech@leanfinance.es"
            className="text-white/70 hover:text-white transition-colors"
          >
            Contacta con soporte
          </a>
        </p>
      </div>
    </main>
  );
}
