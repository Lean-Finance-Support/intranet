"use client";

import type { PeriodOption } from "@/lib/dashboard/aggregate";

interface Props {
  options: PeriodOption[];
  activeId: string;
  onChange: (id: string) => void;
}

export default function DashboardPeriodTabs({ options, activeId, onChange }: Props) {
  return (
    <nav
      role="tablist"
      aria-label="Filtro temporal del dashboard"
      className="inline-flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm"
    >
      {options.map((opt) => {
        const isActive = opt.id === activeId;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(opt.id)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              isActive
                ? "bg-brand-navy text-white"
                : "text-text-muted hover:bg-gray-100 hover:text-brand-navy"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </nav>
  );
}
