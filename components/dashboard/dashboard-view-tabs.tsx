"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export type DashboardView = "ventas" | "compras" | "bancos";

interface Props {
  activeView: DashboardView;
}

const TABS: { id: DashboardView; label: string }[] = [
  { id: "ventas", label: "Ventas" },
  { id: "compras", label: "Compras" },
  { id: "bancos", label: "Bancos" },
];

/**
 * Selector de vista para móviles. En `md+` se oculta porque las 3 columnas
 * (Ventas / Compras / Bancos) se muestran a la vez.
 *
 * El estado vive en la query string (`?view=ventas|compras|bancos`) para que
 * sea bookmarkable y se mantenga al navegar entre filtros temporales.
 */
export default function DashboardViewTabs({ activeView }: Props) {
  const pathname = usePathname() ?? "/dashboard";
  const searchParams = useSearchParams();

  function buildHref(id: DashboardView): string {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (id === "ventas") params.delete("view");
    else params.set("view", id);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <nav
      role="tablist"
      aria-label="Vista del dashboard (móvil)"
      className="md:hidden inline-flex w-full rounded-xl border border-gray-200 bg-white p-1 shadow-sm"
    >
      {TABS.map((tab) => {
        const isActive = tab.id === activeView;
        return (
          <Link
            key={tab.id}
            href={buildHref(tab.id)}
            role="tab"
            aria-selected={isActive}
            scroll={false}
            className={`flex-1 text-center px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
              isActive
                ? "bg-brand-navy text-white"
                : "text-text-muted hover:bg-gray-100 hover:text-brand-navy"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
