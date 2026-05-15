"use client";

import { useState } from "react";

/**
 * Tarjeta plegable de una deducción. La información (qué cubre + requisitos)
 * queda oculta hasta que el usuario despliega la tarjeta, de modo que se
 * puedan ver todos los títulos de un vistazo.
 *
 * Se usa tanto en el panel del asesor (con acciones en `trailing` / `footer`
 * y datos del contribuyente en `extra`) como en el portal cliente (solo
 * título + info).
 */
export interface DeductionCollapsibleProps {
  title: string;
  whatCovers?: string | null;
  requirements?: string[];
  legalReference?: string | null;
  /** Etiqueta a la derecha del título (estado, badge…). */
  badge?: React.ReactNode;
  /** Elemento delante del título (p.ej. un icono). No togglea el plegado. */
  leading?: React.ReactNode;
  /** Elemento al final de la fila del título (p.ej. un botón). No togglea. */
  trailing?: React.ReactNode;
  /** Contenido SIEMPRE visible bajo la fila del título (p.ej. botones de acción). */
  footer?: React.ReactNode;
  /** Contenido extra dentro del cuerpo desplegado (p.ej. datos del formulario). */
  extra?: React.ReactNode;
  accent?: "teal" | "amber";
  defaultOpen?: boolean;
}

export function DeductionCollapsible({
  title,
  whatCovers,
  requirements = [],
  legalReference,
  badge,
  leading,
  trailing,
  footer,
  extra,
  accent = "teal",
  defaultOpen = false,
}: DeductionCollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);
  const hasBody = Boolean(whatCovers) || requirements.length > 0 || Boolean(extra);
  const cardBorder = accent === "amber" ? "border-amber-200" : "border-gray-100";

  return (
    <div className={`rounded-xl border bg-white ${cardBorder}`}>
      <div className="flex items-center gap-2.5 px-3.5 py-3">
        {leading}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex-1 flex items-center gap-2 text-left min-w-0"
        >
          <span className="text-sm font-semibold text-brand-navy leading-snug">{title}</span>
          {badge}
          <svg
            className={`ml-auto w-4 h-4 text-text-muted shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {trailing}
      </div>

      {footer && <div className="px-3.5 pb-3 -mt-0.5">{footer}</div>}

      {open && (
        <div className="px-3.5 pb-3.5 pt-1 space-y-3 border-t border-gray-100">
          {!hasBody && (
            <p className="text-xs text-text-muted italic">
              No hay información adicional para esta deducción.
            </p>
          )}
          {whatCovers && (
            <div>
              <p className="text-[11px] uppercase tracking-wider font-semibold text-text-muted mb-1">
                Qué cubre
              </p>
              <p className="text-sm text-brand-navy leading-relaxed">{whatCovers}</p>
            </div>
          )}
          {requirements.length > 0 && (
            <div>
              <p
                className={`text-[11px] uppercase tracking-wider font-semibold mb-1 ${
                  accent === "amber" ? "text-amber-700" : "text-brand-teal"
                }`}
              >
                Requisitos
              </p>
              <ul className="space-y-1.5">
                {requirements.map((req, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-brand-navy">
                    <span
                      aria-hidden
                      className={`mt-1.5 inline-block w-1.5 h-1.5 shrink-0 rounded-full ${
                        accent === "amber" ? "bg-amber-500" : "bg-brand-teal"
                      }`}
                    />
                    <span>{req}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {extra}
          {legalReference && (
            <p className="text-[10px] font-mono italic text-text-muted/70 text-right pt-1">
              {legalReference}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
