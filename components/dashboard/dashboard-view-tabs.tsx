"use client";

export type DashboardView = "ventas" | "compras" | "bancos";

interface Props {
  activeView: DashboardView;
  onChange: (view: DashboardView) => void;
}

const TABS: { id: DashboardView; label: string }[] = [
  { id: "ventas", label: "Ventas" },
  { id: "compras", label: "Compras" },
  { id: "bancos", label: "Bancos" },
];

/**
 * Selector de vista para móviles. En `md+` se oculta porque las 3 columnas
 * (Ventas / Compras / Bancos) se muestran a la vez.
 */
export default function DashboardViewTabs({ activeView, onChange }: Props) {
  return (
    <nav
      role="tablist"
      aria-label="Vista del dashboard (móvil)"
      className="md:hidden inline-flex w-full rounded-xl border border-gray-200 bg-white p-1 shadow-sm"
    >
      {TABS.map((tab) => {
        const isActive = tab.id === activeView;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`flex-1 text-center px-3 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              isActive
                ? "bg-brand-navy text-white"
                : "text-text-muted hover:bg-gray-100 hover:text-brand-navy"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
