"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  OnboardingPageData,
  OnboardingApartadoPlan,
} from "../actions";
import { finalizeOnboarding } from "../actions";
import {
  initialOnboardingState,
  computeApartados,
  type OnboardingState,
} from "./onboarding-state";
import StepEmpresa from "./step-empresa";
import StepDeptos from "./step-deptos";
import StepResumen from "./step-resumen";
import StepFinal from "./step-final";

interface Props {
  data: OnboardingPageData;
  linkPrefix: string;
}

const STEPS = [
  { id: 1, name: "Datos" },
  { id: 2, name: "Departamentos implicados" },
  { id: 3, name: "Documentación inicial" },
  { id: 4, name: "Confirmación" },
] as const;

export default function OnboardingWizard({ data, linkPrefix }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [state, setState] = useState<OnboardingState>(initialOnboardingState);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    company_id: string;
    apartado_count: number;
    email_sent: number;
    email_failed: number;
    email_error: string | null;
  } | null>(null);

  // Reusamos la lógica del paso 3 para producir la lista final de apartados
  // que mandar al server. Si el usuario está en el paso 4 sin haber tocado el
  // paso 3, los overrides están vacíos pero el cómputo derivado ya funciona.
  const computedForFinal = useMemo(
    () => computeApartados(state, data.blocks, data.tags),
    [state, data]
  );

  // ───── Validación por paso ─────
  function step1Valid(): string | null {
    if (!state.legal_name.trim()) return "Razón social obligatoria.";
    if (!state.company_name.trim()) return "Nombre comercial obligatorio.";
    if (!state.nif.trim()) return "NIF/CIF obligatorio.";
    if (state.client_accounts.length === 0) return "Añade al menos una cuenta asociada.";
    for (const c of state.client_accounts) {
      const email = c.email.trim();
      if (!email) return "Hay una cuenta asociada sin email.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return `Email inválido: ${email}`;
    }
    for (const b of state.bank_accounts) {
      if (!b.iban.trim()) return "Hay una cuenta bancaria sin IBAN.";
    }
    // Duplicados de email
    const emails = state.client_accounts.map((c) => c.email.trim().toLowerCase());
    if (new Set(emails).size !== emails.length) {
      return "Hay emails duplicados entre las cuentas asociadas.";
    }
    return null;
  }
  function step2Valid(): string | null {
    if (state.selected_dept_ids.length === 0) {
      return "Selecciona al menos un departamento.";
    }
    for (const did of state.selected_dept_ids) {
      const sup = state.supervisors_by_dept[did] ?? [];
      if (sup.length === 0) {
        const dept = data.departments.find((d) => d.id === did);
        return `Asigna al menos un supervisor para ${dept?.name ?? "el departamento"}.`;
      }
    }
    return null;
  }
  function step3Valid(): string | null {
    if (computedForFinal.length === 0) {
      return "La documentación inicial está vacía. Añade apartados o vuelve a configurar departamentos.";
    }
    const noSup = computedForFinal.find((c) => c.supervisor_ids.length === 0);
    if (noSup) {
      return `El apartado "${noSup.apartado.name}" no tiene supervisor asignado.`;
    }
    return null;
  }

  function tryNext() {
    setError(null);
    let err: string | null = null;
    if (step === 1) err = step1Valid();
    else if (step === 2) err = step2Valid();
    else if (step === 3) err = step3Valid();
    if (err) {
      setError(err);
      return;
    }
    setStep((s) => Math.min(4, s + 1));
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const apartados: OnboardingApartadoPlan[] = computedForFinal.map((c) => ({
        apartado_id: c.apartado.id,
        block_id: c.block.id,
        is_optional: c.is_optional,
        supervisor_ids: c.supervisor_ids,
      }));
      const result = await finalizeOnboarding({
        legal_name: state.legal_name,
        company_name: state.company_name,
        nif: state.nif,
        bank_accounts: state.bank_accounts.map((b) => ({
          iban: b.iban,
          label: b.label || null,
          bank_name: b.bank_name || null,
        })),
        client_accounts: state.client_accounts.map((c) => ({
          email: c.email,
          full_name: c.full_name || null,
        })),
        department_ids: state.selected_dept_ids,
        apartados,
      });
      setSuccess({
        company_id: result.company_id,
        apartado_count: result.apartado_count,
        email_sent: result.email_sent,
        email_failed: result.email_failed,
        email_error: result.email_error,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al finalizar el onboarding.");
    } finally {
      setSubmitting(false);
    }
  }

  // Pantalla de éxito
  if (success) {
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
              Cliente dado de alta
            </h1>
            <p className="text-sm text-text-muted mt-2">
              {success.apartado_count}{" "}
              {success.apartado_count === 1
                ? "apartado generado"
                : "apartados generados"}
              .{" "}
              {success.email_sent > 0 && (
                <>
                  Email enviado a {success.email_sent}{" "}
                  {success.email_sent === 1 ? "destinatario" : "destinatarios"}.
                </>
              )}
              {success.email_failed > 0 && (
                <span className="text-amber-700">
                  {" "}
                  {success.email_failed} {success.email_failed === 1 ? "envío falló" : "envíos fallaron"}.
                </span>
              )}
            </p>
            {success.email_error && (
              <div className="mt-4 mx-auto max-w-md text-left rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                <p className="text-[11px] font-semibold text-amber-900">Detalle del error</p>
                <p className="text-[11px] text-amber-800 mt-0.5 break-words font-mono">
                  {success.email_error}
                </p>
              </div>
            )}
            <div className="mt-6 flex items-center justify-center gap-3">
              <Link
                href={`${linkPrefix}/clientes/${success.company_id}`}
                className="text-sm bg-brand-teal text-white px-4 py-2 rounded-lg hover:bg-brand-teal/90 cursor-pointer"
              >
                Abrir ficha del cliente
              </Link>
              <button
                type="button"
                onClick={() => router.push(`${linkPrefix}/clientes`)}
                className="text-sm text-text-muted hover:text-text-body px-4 py-2 rounded-lg cursor-pointer"
              >
                Volver a clientes
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full px-8 pb-24">
      <div className="max-w-6xl">
        <div className="sticky top-0 bg-surface-gray z-20 pt-12 pb-4 border-b border-gray-200">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-brand-teal text-sm font-medium mb-2">Portal de empleados</p>
              <h1 className="text-3xl font-bold font-heading text-brand-navy tracking-tight">
                Nuevo onboarding
              </h1>
              <p className="text-sm text-text-muted mt-1">
                Alta de cliente con documentación inicial y email de bienvenida.
              </p>
            </div>
            <Link
              href={`${linkPrefix}/clientes`}
              className="text-sm text-text-muted hover:text-text-body px-3 py-2 rounded-lg cursor-pointer"
            >
              Cancelar
            </Link>
          </div>

          {/* Stepper */}
          <ol className="mt-6 flex items-center gap-2">
            {STEPS.map((s, idx) => {
              const active = step === s.id;
              const done = step > s.id;
              return (
                <li key={s.id} className="flex items-center gap-2 flex-1 last:flex-initial">
                  <button
                    type="button"
                    onClick={() => {
                      if (done) setStep(s.id);
                    }}
                    disabled={!done}
                    className={`flex items-center gap-2 ${done ? "cursor-pointer" : "cursor-default"}`}
                  >
                    <span
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                        active
                          ? "bg-brand-teal text-white"
                          : done
                            ? "bg-brand-navy text-white"
                            : "bg-gray-100 text-text-muted"
                      }`}
                    >
                      {done ? (
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        s.id
                      )}
                    </span>
                    <span
                      className={`text-xs font-medium ${
                        active ? "text-brand-navy" : done ? "text-text-body" : "text-text-muted"
                      }`}
                    >
                      {s.name}
                    </span>
                  </button>
                  {idx < STEPS.length - 1 && (
                    <span className="flex-1 h-px bg-gray-200" />
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        <div className="pt-8 space-y-6">
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          {step === 1 && (
            <StepEmpresa
              state={state}
              setState={setState}
              canManageBankAccounts={data.canManageBankAccounts}
            />
          )}
          {step === 2 && (
            <StepDeptos
              state={state}
              setState={setState}
              departments={data.departments}
              tags={data.tags}
            />
          )}
          {step === 3 && (
            <StepResumen
              state={state}
              setState={setState}
              departments={data.departments}
              blocks={data.blocks}
              tags={data.tags}
            />
          )}
          {step === 4 && (
            <StepFinal
              state={state}
              departments={data.departments}
              apartados={computedForFinal}
              submitting={submitting}
              onSubmit={handleSubmit}
            />
          )}

          {/* Nav inferior */}
          <div className="flex justify-between pt-6 border-t border-gray-100">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep((s) => Math.max(1, s - 1));
              }}
              disabled={step === 1 || submitting}
              className="text-sm text-text-muted hover:text-text-body px-4 py-2 rounded-lg cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ← Atrás
            </button>
            {step < 4 && (
              <button
                type="button"
                onClick={tryNext}
                className="text-sm bg-brand-navy text-white px-4 py-2 rounded-lg hover:bg-brand-navy/90 cursor-pointer"
              >
                Siguiente →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

