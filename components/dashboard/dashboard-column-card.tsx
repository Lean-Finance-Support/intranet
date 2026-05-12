"use client";

import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { KpiCard, MonthlyPoint } from "@/lib/dashboard/aggregate";

// Recharts pesa ~80 KB gz. Lo cargamos solo cuando se renderiza el gráfico
// (vista por defecto si hay datos, pero el split mantiene el bundle inicial
// más ligero y evita SSR del SVG que no aporta nada — el usuario lo ve igual
// porque el contenedor mantiene min-h-[220px]).
const DashboardMonthlyChart = dynamic(
  () => import("./dashboard-monthly-chart"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[220px] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-brand-teal/30 border-t-brand-teal rounded-full animate-spin" />
      </div>
    ),
  },
);

interface Props {
  title: string;
  accent: "navy" | "teal";
  kpiYear: KpiCard;
  kpiMonth: KpiCard;
  monthly?: MonthlyPoint[];
  headerExtra?: ReactNode;
}

export default function DashboardColumnCard({
  title,
  accent,
  kpiYear,
  kpiMonth,
  monthly,
  headerExtra,
}: Props) {
  const accentBg = accent === "navy" ? "bg-brand-navy" : "bg-brand-teal";
  const hasChart = !!monthly && monthly.length > 0;
  const [view, setView] = useState<"kpis" | "chart">(hasChart ? "chart" : "kpis");

  return (
    <article className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className={`${accentBg} px-5 py-3 flex items-center justify-between gap-2`}>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-white">{title}</h3>
        <div className="flex items-center gap-2">
          {headerExtra}
          {hasChart && (
            <div className="inline-flex rounded-lg bg-white/10 p-0.5 text-[10px] font-semibold uppercase tracking-wider">
              <button
                type="button"
                onClick={() => setView("kpis")}
                className={`px-2 py-1 rounded-md transition-colors ${
                  view === "kpis" ? "bg-white text-brand-navy" : "text-white/70 hover:text-white cursor-pointer"
                }`}
              >
                Totales
              </button>
              <button
                type="button"
                onClick={() => setView("chart")}
                className={`px-2 py-1 rounded-md transition-colors ${
                  view === "chart" ? "bg-white text-brand-navy" : "text-white/70 hover:text-white cursor-pointer"
                }`}
              >
                Gráfico
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="p-5 min-h-[220px] flex flex-col justify-center">
        {view === "kpis" || !hasChart ? (
          <div className="space-y-4">
            <KpiRow kpi={kpiYear} primary />
            <div className="border-t border-gray-100" />
            <KpiRow kpi={kpiMonth} />
          </div>
        ) : (
          <DashboardMonthlyChart data={monthly!} accent={accent} />
        )}
      </div>
    </article>
  );
}

function KpiRow({ kpi, primary = false }: { kpi: KpiCard; primary?: boolean }) {
  const valueClass = primary
    ? "text-3xl font-bold tracking-tight"
    : "text-xl font-semibold tracking-tight";
  const colorClass = kpi.isNegative ? "text-red-600" : "text-brand-navy";
  return (
    <div>
      <p className="text-[11px] text-text-muted uppercase tracking-wider mb-1">
        {kpi.label || "—"}
        {kpi.period && (
          <span className="ml-1 normal-case tracking-normal text-text-muted/70">· {kpi.period}</span>
        )}
      </p>
      <p className={`${valueClass} ${colorClass}`}>{kpi.value || "—"}</p>
    </div>
  );
}
