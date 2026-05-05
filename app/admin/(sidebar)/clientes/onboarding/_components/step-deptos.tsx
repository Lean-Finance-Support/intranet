"use client";

import { useEffect } from "react";
import type { OnboardingState } from "./onboarding-state";
import type { OnboardingDepartment } from "../actions";
import type { DocumentationTag } from "@/lib/types/documentation";

interface Props {
  state: OnboardingState;
  setState: React.Dispatch<React.SetStateAction<OnboardingState>>;
  departments: OnboardingDepartment[];
  tags: DocumentationTag[];
}

export default function StepDeptos({ state, setState, departments, tags }: Props) {
  // Identificamos el departamento "Asesoría Laboral". El checkbox de
  // "Solicita alta de empresa" solo se habilita si está seleccionado.
  const laboralDeptId = departments.find((d) => d.name === "Asesoría Laboral")?.id ?? null;
  const laboralSelected =
    laboralDeptId !== null && state.selected_dept_ids.includes(laboralDeptId);

  // Si el usuario deselecciona Laboral, des-marcamos el checkbox para evitar
  // estados inconsistentes que se cuelen al paso 3.
  useEffect(() => {
    if (!laboralSelected && state.alta_empresa) {
      setState((p) => ({ ...p, alta_empresa: false }));
    }
  }, [laboralSelected, state.alta_empresa, setState]);
  function toggleDept(deptId: string) {
    setState((prev) => {
      const next = prev.selected_dept_ids.includes(deptId)
        ? prev.selected_dept_ids.filter((d) => d !== deptId)
        : [...prev.selected_dept_ids, deptId];
      // Si se deselecciona, limpiamos los supervisores asociados
      const supervisors = { ...prev.supervisors_by_dept };
      if (!next.includes(deptId)) delete supervisors[deptId];
      return { ...prev, selected_dept_ids: next, supervisors_by_dept: supervisors };
    });
  }

  function toggleSupervisor(deptId: string, profileId: string) {
    setState((prev) => {
      const current = prev.supervisors_by_dept[deptId] ?? [];
      const next = current.includes(profileId)
        ? current.filter((p) => p !== profileId)
        : [...current, profileId];
      return {
        ...prev,
        supervisors_by_dept: { ...prev.supervisors_by_dept, [deptId]: next },
      };
    });
  }

  // Identificamos los tags por slug (los conocidos por la UI)
  const tagHolded = tags.find((t) => t.slug === "cliente_no_viene_de_holded");
  const tagAlta = tags.find((t) => t.slug === "solicita_alta_empresa");

  return (
    <div className="space-y-8">
      <section>
        <SectionHeader
          title="Departamentos implicados"
          subtitle="La documentación inicial se calculará a partir de los departamentos seleccionados."
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {departments.map((d) => {
            const checked = state.selected_dept_ids.includes(d.id);
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => toggleDept(d.id)}
                className={`text-left rounded-xl border px-4 py-3 transition-colors cursor-pointer ${
                  checked
                    ? "bg-brand-teal/10 border-brand-teal/30 text-brand-teal"
                    : "bg-white border-gray-200 hover:border-gray-300 text-text-body"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                      checked ? "bg-brand-teal border-brand-teal" : "border-gray-300 bg-white"
                    }`}
                  >
                    {checked && (
                      <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span className="text-sm font-medium">{d.name}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {state.selected_dept_ids.length > 0 && (
        <section>
          <SectionHeader
            title="Supervisores por departamento"
            subtitle="Selecciona al menos un supervisor por cada departamento. Validarán los apartados asociados."
          />
          <div className="space-y-3">
            {departments
              .filter((d) => state.selected_dept_ids.includes(d.id))
              .map((d) => {
                const selected = state.supervisors_by_dept[d.id] ?? [];
                const noMembers = d.members.length === 0;
                return (
                  <div
                    key={d.id}
                    className="bg-gray-50 rounded-xl p-3"
                  >
                    <div className="flex items-baseline justify-between gap-2 mb-2">
                      <p className="text-sm font-semibold text-brand-navy">{d.name}</p>
                      <p className="text-[11px] text-text-muted">
                        {selected.length} seleccionados
                      </p>
                    </div>
                    {noMembers ? (
                      <p className="text-xs text-red-500">
                        Este departamento no tiene miembros asignados; añade alguno antes de
                        continuar.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {d.members.map((m) => {
                          const active = selected.includes(m.id);
                          const display = m.full_name?.trim() || m.email;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => toggleSupervisor(d.id, m.id)}
                              className={`text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                                active
                                  ? "bg-brand-navy text-white border-brand-navy"
                                  : "bg-white text-text-muted border-gray-200 hover:border-gray-300"
                              }`}
                              title={m.email}
                            >
                              {display}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </section>
      )}

      <section>
        <SectionHeader
          title="Documentación condicional"
          subtitle="Marca las condiciones que aplican a este cliente. Activan apartados extra."
        />
        <div className="space-y-2">
          {tagHolded && (
            <BigCheckbox
              label={tagHolded.name}
              description={tagHolded.description}
              checked={state.client_no_holded}
              onChange={(v) => setState((p) => ({ ...p, client_no_holded: v }))}
            />
          )}
          {tagAlta && (
            <BigCheckbox
              label={tagAlta.name}
              description={
                laboralSelected
                  ? tagAlta.description
                  : "Solo disponible si se incluye el departamento de Asesoría Laboral."
              }
              checked={state.alta_empresa}
              disabled={!laboralSelected}
              onChange={(v) => setState((p) => ({ ...p, alta_empresa: v }))}
            />
          )}
          {!tagHolded && !tagAlta && (
            <p className="text-xs text-text-muted/80 italic">
              No hay tags configurados en el catálogo todavía.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-brand-navy">{title}</h3>
      {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
    </div>
  );
}

function BigCheckbox({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string | null;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
        disabled
          ? "bg-gray-50 border-gray-100 text-text-muted/60 cursor-not-allowed"
          : checked
            ? "bg-brand-navy text-white border-brand-navy cursor-pointer"
            : "bg-white border-gray-200 hover:border-gray-300 cursor-pointer"
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`w-4 h-4 rounded border flex items-center justify-center transition-colors flex-shrink-0 ${
            disabled
              ? "bg-gray-100 border-gray-200"
              : checked
                ? "bg-brand-teal border-brand-teal"
                : "border-gray-300 bg-white"
          }`}
        >
          {checked && !disabled && (
            <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{label}</p>
          {description && (
            <p
              className={`text-[11px] mt-0.5 ${
                disabled
                  ? "text-text-muted/70 italic"
                  : checked
                    ? "text-white/70"
                    : "text-text-muted"
              }`}
            >
              {description}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
