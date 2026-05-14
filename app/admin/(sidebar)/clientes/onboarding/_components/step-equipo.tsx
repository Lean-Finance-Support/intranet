"use client";

import { useEffect, useMemo } from "react";
import { deriveSelectedDeptIds, type OnboardingState } from "./onboarding-state";
import type { OnboardingDepartment, OnboardingServiceItem } from "../actions";
import type { DocumentationTag } from "@/lib/types/documentation";

interface Props {
  state: OnboardingState;
  setState: React.Dispatch<React.SetStateAction<OnboardingState>>;
  departments: OnboardingDepartment[];
  services: OnboardingServiceItem[];
  tags: DocumentationTag[];
}

const NO_DEPT_KEY = "__no_dept__";

export default function StepEquipo({
  state,
  setState,
  departments,
  services,
  tags,
}: Props) {
  const derivedDeptIds = useMemo(
    () => deriveSelectedDeptIds(state, services),
    [state, services]
  );
  const derivedDeptSet = useMemo(() => new Set(derivedDeptIds), [derivedDeptIds]);

  const deptById = useMemo(() => {
    const map = new Map<string, OnboardingDepartment>();
    for (const d of departments) map.set(d.id, d);
    return map;
  }, [departments]);

  // Agrupar servicios por dpto. Un servicio con N deptos aparece en N grupos.
  const servicesByDept = useMemo(() => {
    const map = new Map<string, OnboardingServiceItem[]>();
    for (const dept of departments) map.set(dept.id, []);
    map.set(NO_DEPT_KEY, []);
    for (const s of services) {
      if (s.department_ids.length === 0) {
        map.get(NO_DEPT_KEY)!.push(s);
      } else {
        for (const did of s.department_ids) {
          const list = map.get(did);
          if (list) list.push(s);
        }
      }
    }
    return map;
  }, [services, departments]);

  // Asesoría Laboral: checkbox "Solicita Alta Empresa" se habilita si algún
  // servicio contratado pertenece al dpto Laboral (vía derivedDeptIds).
  const laboralDeptId = useMemo(
    () => departments.find((d) => d.name === "Asesoría Laboral")?.id ?? null,
    [departments]
  );
  const laboralSelected = laboralDeptId !== null && derivedDeptSet.has(laboralDeptId);

  // Si el cliente deselecciona Laboral, des-marcamos el checkbox para evitar
  // estados inconsistentes que se cuelen al paso 3.
  useEffect(() => {
    if (!laboralSelected && state.alta_empresa) {
      setState((p) => ({ ...p, alta_empresa: false }));
    }
  }, [laboralSelected, state.alta_empresa, setState]);

  // Limpiar el equipo de dpts que ya no estén derivados (al deseleccionar un
  // servicio podemos perder un dpto entero).
  useEffect(() => {
    setState((prev) => {
      const next: Record<string, string[]> = {};
      let changed = false;
      for (const [did, members] of Object.entries(prev.team_by_dept)) {
        if (derivedDeptSet.has(did)) {
          next[did] = members;
        } else if (members.length > 0) {
          changed = true;
        } else {
          changed = true;
        }
      }
      if (
        !changed &&
        Object.keys(next).length === Object.keys(prev.team_by_dept).length
      ) {
        return prev;
      }
      return { ...prev, team_by_dept: next };
    });
  }, [derivedDeptSet, setState]);

  function toggleService(serviceId: string) {
    setState((prev) => {
      const next = prev.selected_service_ids.includes(serviceId)
        ? prev.selected_service_ids.filter((s) => s !== serviceId)
        : [...prev.selected_service_ids, serviceId];
      return { ...prev, selected_service_ids: next };
    });
  }

  function toggleTeamMember(deptId: string, profileId: string) {
    setState((prev) => {
      const current = prev.team_by_dept[deptId] ?? [];
      const next = current.includes(profileId)
        ? current.filter((p) => p !== profileId)
        : [...current, profileId];
      return {
        ...prev,
        team_by_dept: { ...prev.team_by_dept, [deptId]: next },
      };
    });
  }

  const tagHolded = tags.find((t) => t.slug === "cliente_no_viene_de_holded");
  const tagAlta = tags.find((t) => t.slug === "solicita_alta_empresa");

  const sections: { key: string; name: string; items: OnboardingServiceItem[] }[] = [
    ...departments.map((d) => ({
      key: d.id,
      name: d.name,
      items: servicesByDept.get(d.id) ?? [],
    })),
    {
      key: NO_DEPT_KEY,
      name: "Sin departamento",
      items: servicesByDept.get(NO_DEPT_KEY) ?? [],
    },
  ].filter((s) => s.items.length > 0);

  return (
    <div className="space-y-8">
      <section>
        <SectionHeader
          title="Servicios contratados"
          subtitle="Selecciona los servicios que la empresa contrata. Los departamentos responsables se derivan automáticamente."
        />
        {sections.length === 0 ? (
          <p className="text-xs text-text-muted italic">
            No hay servicios disponibles en el catálogo. Crea servicios en
            /admin/servicios.
          </p>
        ) : (
          <div className="space-y-4">
            {sections.map((section) => (
              <div key={section.key}>
                <p className="text-xs uppercase tracking-wider text-text-muted mb-2">
                  {section.name}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {section.items.map((s) => {
                    const checked = state.selected_service_ids.includes(s.id);
                    return (
                      <button
                        key={`${section.key}-${s.id}`}
                        type="button"
                        onClick={() => toggleService(s.id)}
                        className={`text-left rounded-xl border px-4 py-3 transition-colors cursor-pointer ${
                          checked
                            ? "bg-brand-teal/10 border-brand-teal/30 text-brand-teal"
                            : "bg-white border-gray-200 hover:border-gray-300 text-text-body"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-4 h-4 rounded border flex items-center justify-center transition-colors flex-shrink-0 ${
                              checked
                                ? "bg-brand-teal border-brand-teal"
                                : "border-gray-300 bg-white"
                            }`}
                          >
                            {checked && (
                              <svg
                                className="w-3 h-3 text-white"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={3}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </span>
                          <span className="text-sm font-medium">{s.name}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {derivedDeptIds.length === 0 && state.selected_service_ids.length > 0 ? (
        <section>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-semibold text-amber-800">
              Sin departamento responsable
            </p>
            <p className="text-xs text-amber-700 mt-1">
              Los servicios contratados no están vinculados a ningún departamento.
              Solo se solicitará documentación global (contratos, etc.) y no
              habrá equipo asignado.
            </p>
          </div>
        </section>
      ) : (
        derivedDeptIds.length > 0 && (
          <section>
            <SectionHeader
              title="Equipo responsable"
              subtitle="Selecciona al menos un miembro por cada departamento implicado. Se asignarán automáticamente como técnicos de los servicios y supervisores de la documentación."
            />
            <div className="space-y-3">
              {derivedDeptIds.map((deptId) => {
                const dept = deptById.get(deptId);
                if (!dept) return null;
                const selected = state.team_by_dept[deptId] ?? [];
                const noMembers = dept.members.length === 0;
                return (
                  <div key={deptId} className="bg-gray-50 rounded-xl p-3">
                    <div className="flex items-baseline justify-between gap-2 mb-2">
                      <p className="text-sm font-semibold text-brand-navy">
                        {dept.name}
                      </p>
                      <p className="text-[11px] text-text-muted">
                        {selected.length} seleccionados
                      </p>
                    </div>
                    {noMembers ? (
                      <p className="text-xs text-red-500">
                        Este departamento no tiene miembros asignados; añade
                        alguno antes de continuar.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {dept.members.map((m) => {
                          const active = selected.includes(m.id);
                          const display = m.full_name?.trim() || m.email;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => toggleTeamMember(deptId, m.id)}
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
        )
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
                  : "Solo disponible si hay algún servicio contratado del departamento Asesoría Laboral."
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
            <svg
              className="w-3 h-3 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
            >
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
