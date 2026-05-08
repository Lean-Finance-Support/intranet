"use client";

import { useSyncExternalStore } from "react";

/**
 * Hook SSR-safe para escuchar una media query.
 *
 * Devuelve `false` durante SSR y en el primer render del cliente (snapshot del servidor),
 * y se actualiza al match real en cuanto se hidrata. Esto evita hydration mismatch.
 *
 * Uso típico:
 *   const isDesktop = useMediaQuery("(min-width: 768px)");
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = (onChange: () => void) => {
    if (typeof window === "undefined") return () => {};
    const mql = window.matchMedia(query);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  };

  const getSnapshot = () => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  };

  const getServerSnapshot = () => false;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
