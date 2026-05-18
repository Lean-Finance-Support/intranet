"use client";

import { useState } from "react";
import Link from "next/link";
import type { ImportProposalExisting } from "@/lib/proposal-import/types";
import { addServicesFromProposal, type AddServiceOutcome } from "../actions";

interface Props {
  result: ImportProposalExisting;
  linkPrefix: string;
  onReset: () => void;
}

export default function AnadirServiciosConfirm({ result, linkPrefix, onReset }: Props) {
  const { company, new_services, already_contracted, unmatched_raw } = result;
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(new_services.map((s) => s.service_id))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<AddServiceOutcome[] | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleConfirm() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await addServicesFromProposal(company.id, [...selected]);
      setOutcomes(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al añadir los servicios.");
    } finally {
      setSubmitting(false);
    }
  }

  const nameById = new Map<string, string>();
  for (const s of new_services) nameById.set(s.service_id, s.name);

  // ───── Resultado tras confirmar ─────
  if (outcomes) {
    const okCount = outcomes.filter((o) => o.ok).length;
    const failCount = outcomes.length - okCount;
    return (
      <div className="min-h-full px-8 pt-12 pb-24">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-8 py-10 text-center">
            <div className="w-14 h-14 rounded-full bg-brand-teal/10 inline-flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-brand-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-bold font-heading text-brand-navy">
              Servicios actualizados
            </h1>
            <p className="text-sm text-text-muted mt-2">
              {okCount} {okCount === 1 ? "servicio contratado" : "servicios contratados"}
              {failCount > 0 && (
                <span className="text-amber-700">
                  {" "}· {failCount} {failCount === 1 ? "falló" : "fallaron"}
                </span>
              )}
              .
            </p>
            {failCount > 0 && (
              <ul className="mt-4 mx-auto max-w-md text-left space-y-1">
                {outcomes
                  .filter((o) => !o.ok)
                  .map((o) => (
                    <li
                      key={o.service_id}
                      className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1"
                    >
                      {nameById.get(o.service_id) ?? o.service_id}: {o.error}
                    </li>
                  ))}
              </ul>
            )}
            <div className="mt-6">
              <Link
                href={`${linkPrefix}/clientes/${company.id}`}
                className="text-sm bg-brand-teal text-white px-4 py-2 rounded-lg hover:bg-brand-teal/90 cursor-pointer"
              >
                Abrir ficha del cliente
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const nothingNew = new_services.length === 0;

  return (
    <div className="min-h-full px-8 pb-24">
      <div className="max-w-2xl">
        <div className="pt-12 pb-6">
          <p className="text-brand-teal text-sm font-medium mb-2">Portal de empleados</p>
          <h1 className="text-3xl font-bold font-heading text-brand-navy tracking-tight">
            Añadir servicios
          </h1>
          <p className="text-sm text-text-muted mt-1">
            La empresa de esta propuesta ya existe en la plataforma.
          </p>
        </div>

        <div className="space-y-4">
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          {/* Card de la empresa */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
            <p className="text-xs text-text-muted">Empresa</p>
            <p className="text-base font-semibold text-brand-navy">
              {company.company_name || company.legal_name}
            </p>
            {company.company_name && company.company_name !== company.legal_name && (
              <p className="text-xs text-text-muted mt-0.5">{company.legal_name}</p>
            )}
          </div>

          {/* Estado del adjuntado de la propuesta */}
          {result.proposal_attached ? (
            <div className="rounded-xl bg-brand-teal/5 border border-brand-teal/20 px-4 py-2.5">
              <p className="text-[11px] text-brand-navy">
                ✓ La propuesta se ha adjuntado al apartado «Propuesta comercial»
                de la documentación del cliente.
              </p>
            </div>
          ) : (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5">
              <p className="text-[11px] text-amber-800">
                No se pudo adjuntar la propuesta a la documentación del cliente.
                Adjúntala a mano desde su ficha.
              </p>
            </div>
          )}

          {nothingNew ? (
            <div className="rounded-xl bg-brand-teal/5 border border-brand-teal/20 px-4 py-3">
              <p className="text-sm font-medium text-brand-navy">
                {already_contracted.length > 0
                  ? "Todos los servicios de la propuesta ya están contratados."
                  : "La propuesta no contiene servicios nuevos reconocibles."}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
              <p className="text-xs font-semibold text-brand-navy mb-3">
                Servicios nuevos detectados en la propuesta
              </p>
              <ul className="space-y-2">
                {new_services.map((s) => (
                  <li key={s.service_id}>
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected.has(s.service_id)}
                        onChange={() => toggle(s.service_id)}
                        className="mt-0.5 accent-brand-teal cursor-pointer"
                      />
                      <span>
                        <span className="text-sm text-text-body">{s.name}</span>
                        <span className="block text-[11px] text-text-muted">
                          Línea de la propuesta: «{s.raw_text}»
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {already_contracted.length > 0 && (
            <div className="px-1">
              <p className="text-[11px] text-text-muted">
                Ya contratados:{" "}
                {already_contracted.map((s) => s.name).join(", ")}.
              </p>
            </div>
          )}

          {unmatched_raw.length > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
              <p className="text-[11px] font-semibold text-amber-900">
                Líneas de la propuesta sin servicio reconocido
              </p>
              <ul className="mt-1 list-disc list-inside text-[11px] text-amber-800">
                {unmatched_raw.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
              <p className="text-[11px] text-amber-800 mt-1">
                Revísalas y, si corresponden a un servicio, contrátalo a mano desde la ficha.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={onReset}
              className="text-sm text-text-muted hover:text-text-body px-4 py-2 rounded-lg cursor-pointer"
            >
              ← Importar otra
            </button>
            {!nothingNew && (
              <button
                type="button"
                onClick={handleConfirm}
                disabled={submitting || selected.size === 0}
                className="text-sm bg-brand-navy text-white px-4 py-2 rounded-lg hover:bg-brand-navy/90 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting
                  ? "Contratando…"
                  : `Contratar ${selected.size} ${selected.size === 1 ? "servicio" : "servicios"}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
