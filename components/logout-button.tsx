"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useRef, useState } from "react";

export default function LogoutButton({ loginPath }: { loginPath: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleLogout() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    // Limpiar cookie de rol cacheado
    document.cookie = "x-user-role=; path=/; max-age=0";
    window.location.href = loginPath;
  }

  return (
    <div ref={ref} className="fixed bottom-4 right-4 z-50">
      {open && (
        <div className="absolute bottom-12 right-0 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[160px] animate-in fade-in slide-in-from-bottom-2 duration-150">
          <button
            onClick={handleLogout}
            disabled={loading}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-text-body hover:bg-gray-50 hover:text-red-600 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            {loading ? "Cerrando..." : "Cerrar sesión"}
          </button>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="w-10 h-10 rounded-full bg-white/90 backdrop-blur border border-gray-200 shadow-lg hover:shadow-xl hover:bg-white transition-all flex items-center justify-center cursor-pointer"
      >
        <svg
          className="w-5 h-5 text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
          />
        </svg>
      </button>
    </div>
  );
}
