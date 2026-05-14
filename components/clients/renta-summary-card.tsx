"use client";

import { useEffect, useState } from "react";
import { getRentaSummary } from "@/app/admin/clientes/[id]/renta-actions";

interface Props {
  companyId: string;
  linkPrefix: string;
}

type Summary = {
  filersCount: number;
  pendingCount: number;
  reviewedCount: number;
  revokedCount: number;
  hasActiveInvitation: boolean;
};

/**
 * Tarjeta compacta que muestra el estado del servicio "Declaración de la renta"
 * de un cliente: DNIs autorizados, envíos por estado y si hay enlace público
 * activo. Carga los datos en cliente con useEffect (consistente con
 * `RentaAdminPanel` y para no engrosar el waterfall server-side de la ficha).
 *
 * Botón CTA "Gestionar declaraciones →" navega a la ruta dedicada
 * `/admin/clientes/[id]/renta`.
 */
export default function RentaSummaryCard({ companyId, linkPrefix }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getRentaSummary(companyId)
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const href = `${linkPrefix}/clientes/${companyId}/renta`;

  return (
    <div className="rounded-xl border border-gray-100 p-4 hover:border-brand-teal/40 transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-brand-teal/10 text-brand-teal flex items-center justify-center">
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.7}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-brand-navy">
            Declaración de la renta
          </h4>
          <p className="text-xs text-text-muted mt-0.5">
            Formulario público que rellena cada familiar con sus deducciones
            autonómicas.
          </p>
          <p className="text-[11px] text-text-muted/80 mt-1.5">
            Desbloqueada por{" "}
            <span className="font-medium text-text-muted">
              Declaración de la renta
            </span>
          </p>
        </div>
        <a
          href={href}
          className="flex-shrink-0 self-center inline-flex items-center gap-1.5 text-xs font-medium bg-brand-teal text-white px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity"
        >
          Gestionar declaraciones
          <svg
            className="w-3 h-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M14 5l7 7m0 0l-7 7m7-7H3"
            />
          </svg>
        </a>
      </div>

      {/* Chips de métricas */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        {loading ? (
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-6 bg-gray-100 rounded-full w-32 animate-pulse"
              />
            ))}
          </div>
        ) : summary ? (
          <div className="flex flex-wrap gap-2">
            <Chip
              label={`${summary.filersCount} ${summary.filersCount === 1 ? "DNI autorizado" : "DNIs autorizados"}`}
              tone="neutral"
            />
            <Chip
              label={`${summary.pendingCount} ${summary.pendingCount === 1 ? "envío pendiente" : "envíos pendientes"}`}
              tone={summary.pendingCount > 0 ? "warning" : "neutral"}
            />
            <Chip
              label={`${summary.reviewedCount} ${summary.reviewedCount === 1 ? "envío revisado" : "envíos revisados"}`}
              tone={summary.reviewedCount > 0 ? "success" : "neutral"}
            />
            <Chip
              label={
                summary.hasActiveInvitation
                  ? "Enlace público activo"
                  : "Sin enlace público"
              }
              tone={summary.hasActiveInvitation ? "teal" : "muted"}
            />
          </div>
        ) : (
          <p className="text-xs text-text-muted italic">
            No se pudo cargar el resumen.
          </p>
        )}
      </div>
    </div>
  );
}

function Chip({
  label,
  tone,
}: {
  label: string;
  tone: "neutral" | "warning" | "success" | "teal" | "muted";
}) {
  const classes: Record<typeof tone, string> = {
    neutral: "bg-gray-50 border-gray-200 text-text-body",
    warning: "bg-amber-50 border-amber-200 text-amber-800",
    success: "bg-emerald-50 border-emerald-200 text-emerald-800",
    teal: "bg-brand-teal/10 border-brand-teal/30 text-brand-teal",
    muted: "bg-gray-50 border-gray-200 text-text-muted",
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-medium ${classes[tone]}`}
    >
      {label}
    </span>
  );
}
