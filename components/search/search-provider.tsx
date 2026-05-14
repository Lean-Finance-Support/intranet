"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { SearchContext as SearchCtx } from "@/lib/search/types";

// SearchPalette se carga solo cuando el usuario abre la paleta (Cmd/Ctrl+K
// o botón). Antes su JS se bundleaba aunque nunca se usara, en todos los
// layouts (admin + app).
const SearchPalette = dynamic(() => import("./search-palette"), { ssr: false });

interface SearchControl {
  open: boolean;
  setOpen: (value: boolean) => void;
  toggle: () => void;
}

const SearchControlContext = createContext<SearchControl | null>(null);

export function useSearchPalette(): SearchControl {
  const ctx = useContext(SearchControlContext);
  if (!ctx) {
    return { open: false, setOpen: () => {}, toggle: () => {} };
  }
  return ctx;
}

export default function SearchProvider({
  ctx,
  children,
}: {
  ctx: SearchCtx;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
      const modifier = isMac ? e.metaKey : e.ctrlKey;
      if (modifier && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const control = useMemo<SearchControl>(() => ({ open, setOpen, toggle }), [open, toggle]);

  return (
    <SearchControlContext.Provider value={control}>
      {children}
      {open && <SearchPalette ctx={ctx} onClose={() => setOpen(false)} />}
    </SearchControlContext.Provider>
  );
}
