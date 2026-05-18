"use client";

import { useState } from "react";
import Link from "next/link";
import type { OnboardingPageData } from "../../actions";
import OnboardingWizard from "../../_components/onboarding-wizard";
import { proposalToOnboardingState } from "@/lib/proposal-import/to-onboarding-state";
import type { ImportProposalResult } from "@/lib/proposal-import/types";
import { importProposal, attachProposalToDocumentation } from "../actions";
import AnadirServiciosConfirm from "./anadir-servicios-confirm";

interface Props {
  data: OnboardingPageData;
  linkPrefix: string;
}

const MAX_BYTES = 25 * 1024 * 1024;

interface UploadedFile {
  fileName: string;
  mimeType: string;
  base64: string;
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}

export default function ImportarProposal({ data, linkPrefix }: Props) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportProposalResult | null>(null);
  // Conservamos el PDF subido para poder adjuntarlo a la documentación del
  // cliente una vez que el onboarding crea la empresa (rama "new").
  const [uploaded, setUploaded] = useState<UploadedFile | null>(null);

  function reset() {
    setResult(null);
    setUploaded(null);
    setError(null);
  }

  async function handleFile(file: File) {
    setError(null);
    if (file.type !== "application/pdf") {
      setError("El archivo debe ser un PDF.");
      return;
    }
    if (file.size <= 0) {
      setError("El archivo está vacío.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("El archivo supera el tamaño máximo (25 MB).");
      return;
    }
    setLoading(true);
    try {
      const base64 = await readAsBase64(file);
      const file_ = { fileName: file.name, mimeType: file.type, base64 };
      setUploaded(file_);
      const res = await importProposal(file_);
      setResult(res);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo procesar la propuesta. Inténtalo de nuevo."
      );
    } finally {
      setLoading(false);
    }
  }

  // ───── Rama EMPRESA NUEVA — wizard prerrellenado ─────
  if (result?.mode === "new") {
    const initialState = proposalToOnboardingState(result.extraction, {
      canManageBankAccounts: data.canManageBankAccounts,
    });
    return (
      <OnboardingWizard
        data={data}
        linkPrefix={linkPrefix}
        initialState={initialState}
        importWarnings={result.service_warnings}
        onFinalized={async (companyId) => {
          // Al cerrar el onboarding, adjuntamos el PDF de la propuesta al
          // apartado "Propuesta comercial" de la documentación del cliente.
          if (!uploaded) return;
          try {
            await attachProposalToDocumentation({ companyId, ...uploaded });
          } catch (e) {
            // No bloqueamos el éxito del onboarding por esto; solo lo avisamos.
            console.error("[importar-proposal] adjuntar propuesta:", e);
          }
        }}
      />
    );
  }

  // ───── Rama EMPRESA EXISTENTE — añadir servicios ─────
  if (result?.mode === "existing") {
    return (
      <AnadirServiciosConfirm
        result={result}
        linkPrefix={linkPrefix}
        onReset={reset}
      />
    );
  }

  // ───── Rama EMPRESA ARCHIVADA — bloqueante ─────
  if (result?.mode === "soft_deleted") {
    return (
      <div className="min-h-full px-8 pt-12 pb-24">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-8 py-10 text-center">
            <div className="w-14 h-14 rounded-full bg-amber-100 inline-flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold font-heading text-brand-navy">
              Empresa archivada
            </h1>
            <p className="text-sm text-text-muted mt-2">
              <span className="font-medium text-text-body">{result.company.legal_name}</span>{" "}
              ya existe en la plataforma pero está archivada. Restáurala primero
              desde su ficha y vuelve a importar la propuesta.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <Link
                href={`${linkPrefix}/clientes/${result.company.id}`}
                className="text-sm bg-brand-teal text-white px-4 py-2 rounded-lg hover:bg-brand-teal/90 cursor-pointer"
              >
                Abrir ficha del cliente
              </Link>
              <button
                type="button"
                onClick={reset}
                className="text-sm text-text-muted hover:text-text-body px-4 py-2 rounded-lg cursor-pointer"
              >
                Importar otra propuesta
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ───── Pantalla de subida ─────
  return (
    <div className="min-h-full px-8 pb-24">
      <div className="max-w-4xl mx-auto">
        <div className="pt-12 pb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-brand-teal text-sm font-medium mb-2">Portal de empleados</p>
              <h1 className="text-3xl font-bold font-heading text-brand-navy tracking-tight">
                Importar propuesta
              </h1>
              <p className="text-sm text-text-muted mt-1">
                Sube el PDF de una propuesta firmada y la IA extraerá los datos.
                Si el cliente es nuevo, prerrellena su onboarding; si ya existe,
                te permite añadir los servicios contratados.
              </p>
            </div>
            <Link
              href={`${linkPrefix}/clientes`}
              className="text-sm text-text-muted hover:text-text-body px-3 py-2 rounded-lg cursor-pointer shrink-0"
            >
              Cancelar
            </Link>
          </div>
        </div>

        <div className="space-y-4">
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (loading) return;
              const file = e.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
            className={`flex flex-col items-center justify-center text-center rounded-2xl border-2 border-dashed px-8 py-16 transition-colors ${
              loading
                ? "border-gray-200 bg-gray-50 cursor-default"
                : dragging
                  ? "border-brand-teal bg-brand-teal/5 cursor-pointer"
                  : "border-gray-300 bg-white hover:border-brand-teal/60 cursor-pointer"
            }`}
          >
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={loading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = "";
              }}
            />
            {loading ? (
              <>
                <div className="w-10 h-10 rounded-full border-2 border-brand-teal border-t-transparent animate-spin mb-3" />
                <p className="text-sm font-medium text-brand-navy">
                  Extrayendo datos de la propuesta…
                </p>
                <p className="text-xs text-text-muted mt-1">
                  La IA está leyendo el PDF. Esto puede tardar unos segundos.
                </p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-brand-teal/10 inline-flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-brand-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l-3 3m3-3l3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-brand-navy">
                  Arrastra el PDF aquí o haz clic para seleccionarlo
                </p>
                <p className="text-xs text-text-muted mt-1">
                  Solo PDF · máximo 25 MB
                </p>
              </>
            )}
          </label>

          <p className="text-[11px] text-text-muted">
            La extracción la realiza un modelo de IA a partir del PDF. La propuesta
            se adjuntará automáticamente al apartado «Propuesta comercial» de la
            documentación del cliente. El equipo responsable no viene en la
            propuesta — lo asignarás después.
          </p>
        </div>
      </div>
    </div>
  );
}
