"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { PeriodOption } from "@/lib/google-sheets/client";

interface Props {
  options: PeriodOption[];
  activeId: string;
}

export default function DashboardPeriodTabs({ options, activeId }: Props) {
  const pathname = usePathname() ?? "/dashboard";
  const searchParams = useSearchParams();

  function buildHref(id: string): string {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (id === "year") params.delete("period");
    else params.set("period", id);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <nav
      role="tablist"
      aria-label="Filtro temporal del dashboard"
      className="inline-flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm"
    >
      {options.map((opt) => {
        const isActive = opt.id === activeId;
        return (
          <Link
            key={opt.id}
            href={buildHref(opt.id)}
            role="tab"
            aria-selected={isActive}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              isActive
                ? "bg-brand-navy text-white"
                : "text-text-muted hover:bg-gray-100 hover:text-brand-navy"
            }`}
          >
            {opt.label}
          </Link>
        );
      })}
    </nav>
  );
}
