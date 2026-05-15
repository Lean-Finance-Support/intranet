"use client";

import { useState } from "react";
import { DeductionCollapsible } from "@/components/renta/deduction-collapsible";
import type { ClientRentaSubmissionMeta } from "../actions";

/**
 * Lista de envíos recibidos en el portal cliente. Cada envío es una tarjeta
 * plegable; al desplegarla, si el asesor ya lo ha revisado, se muestran las
 * deducciones a las que la persona tiene derecho — cada una a su vez plegable
 * para poder ver todos los títulos de un vistazo.
 */
export default function SubmissionsList({
  submissions,
}: {
  submissions: ClientRentaSubmissionMeta[];
}) {
  if (submissions.length === 0) {
    return (
      <div className="mt-5 rounded-xl bg-surface-gray border border-dashed border-gray-200 p-4 text-xs text-text-muted">
        Todavía no se ha recibido ningún envío.
      </div>
    );
  }
  return (
    <ul className="mt-5 space-y-2.5">
      {submissions.map((s) => (
        <SubmissionRow key={s.id} submission={s} />
      ))}
    </ul>
  );
}

function SubmissionRow({ submission }: { submission: ClientRentaSubmissionMeta }) {
  const [open, setOpen] = useState(false);
  const reviewed = submission.status === "revisada";
  const deductions = submission.confirmed_deductions;

  return (
    <li className="rounded-xl border border-gray-100">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50/60 rounded-xl transition-colors"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-brand-navy truncate">
            {submission.full_name}
          </p>
          <p className="text-[11px] text-text-muted mt-0.5">
            {submission.dni} · Enviado el {formatDate(submission.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {reviewed ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
              Revisada
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
              Pendiente
            </span>
          )}
          <svg
            className={`w-4 h-4 text-text-muted transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100">
          {!reviewed ? (
            <p className="text-xs text-text-muted mt-3">
              Tu asesor todavía está revisando este envío. Cuando lo termine, verás aquí las
              deducciones a las que esta persona tiene derecho.
            </p>
          ) : deductions.length === 0 ? (
            <p className="text-xs text-text-muted mt-3">
              Tu asesor ha revisado este envío y no ha identificado deducciones autonómicas
              aplicables. Si tienes dudas, contacta con él.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-medium text-brand-navy">
                Deducciones a las que tiene derecho ({deductions.length})
              </p>
              {deductions.map((d) => (
                <DeductionCollapsible
                  key={d.id}
                  title={d.title}
                  whatCovers={d.what_covers}
                  requirements={d.requirements}
                  legalReference={d.legal_reference}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
