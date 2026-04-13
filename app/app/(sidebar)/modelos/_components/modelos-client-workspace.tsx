"use client";

import { useCallback, useState } from "react";
import QuarterSelector from "./quarter-selector";
import ModelsClientList from "./models-client-list";

type HeaderState = {
  advisorEmails: string[];
  companyName: string;
  presented: boolean;
  submittedAt: string | null;
};

const INITIAL_HEADER: HeaderState = {
  advisorEmails: [],
  companyName: "",
  presented: false,
  submittedAt: null,
};

export default function ModelosClientWorkspace() {
  const [quarter, setQuarter] = useState(1);
  const [header, setHeader] = useState<HeaderState>(INITIAL_HEADER);

  const handleQuarterChange = useCallback((q: number) => {
    setQuarter(q);
    setHeader(INITIAL_HEADER);
  }, []);

  const mailtoHref =
    header.advisorEmails.length > 0
      ? `mailto:${header.advisorEmails.join(",")}?subject=${encodeURIComponent(
          `Consulta modelos fiscales ${quarter}T 2026${header.companyName ? ` — ${header.companyName}` : ""}`
        )}`
      : null;

  return (
    <div className="px-8">
      <div className="max-w-4xl mx-auto">
        <div className="sticky top-0 bg-surface-gray z-20 pt-12 pb-5 border-b border-gray-200 space-y-5">
          <h1 className="font-heading text-2xl text-brand-navy">
            Modelos de Prestación de Impuestos
          </h1>

          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">
              Trimestre
            </label>
            <QuarterSelector selected={quarter} onChange={handleQuarterChange} />
          </div>

          {mailtoHref && (
            <div>
              <a
                href={mailtoHref}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-brand-teal border-2 border-brand-teal/20 hover:border-brand-teal/40 hover:bg-brand-teal/5 transition-all"
              >
                <MailIcon />
                Contacta con tu asesor
              </a>
            </div>
          )}

          {header.presented && (
            <div className="p-4 bg-brand-navy/5 border border-brand-navy/20 rounded-xl flex items-center gap-3">
              <svg className="w-5 h-5 text-brand-navy flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-brand-navy">Modelos presentados</p>
                <p className="text-xs text-text-muted">Tu asesor ha presentado los modelos de este trimestre. No se pueden realizar más cambios.</p>
              </div>
            </div>
          )}

          {!header.presented && header.submittedAt && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
              <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <div>
                <p className="text-sm font-medium text-green-800">Enviado al asesor fiscal</p>
                <p className="text-xs text-green-600">
                  {new Date(header.submittedAt).toLocaleString("es-ES")} — Puedes modificar y volver a enviar si es necesario.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="pt-6 pb-12">
          <ModelsClientList key={quarter} quarter={quarter} onHeaderState={setHeader} />
        </div>
      </div>
    </div>
  );
}

function MailIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  );
}
