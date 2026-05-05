"use client";

import type { OnboardingState, ApartadoComputed } from "./onboarding-state";
import type { OnboardingDepartment } from "../actions";

interface Props {
  state: OnboardingState;
  departments: OnboardingDepartment[];
  apartados: ApartadoComputed[];
  submitting: boolean;
  onSubmit: () => void;
}

export default function StepFinal({
  state,
  departments,
  apartados,
  submitting,
  onSubmit,
}: Props) {
  const selectedDepts = departments.filter((d) =>
    state.selected_dept_ids.includes(d.id)
  );

  const allSupervisorIds = uniq(apartados.flatMap((a) => a.supervisor_ids));
  const profileNameMap = buildProfileNameMap(departments);
  const chiefIds = uniq(selectedDepts.map((d) => d.chief_id).filter((x): x is string => !!x));

  const optionalCount = apartados.filter((a) => a.is_optional).length;
  const mandatoryCount = apartados.length - optionalCount;

  return (
    <div className="space-y-6">
      <Section title="Empresa">
        <Row label="Razón social" value={state.legal_name} />
        <Row label="Nombre comercial" value={state.company_name} />
        <Row label="NIF / CIF" value={state.nif} mono />
      </Section>

      <Section
        title={`Cuentas bancarias (${state.bank_accounts.length})`}
      >
        {state.bank_accounts.length === 0 ? (
          <p className="text-xs text-text-muted/80 italic">Sin cuentas bancarias.</p>
        ) : (
          <ul className="space-y-1">
            {state.bank_accounts.map((b, idx) => (
              <li key={b.id} className="text-xs text-text-body">
                <span className="font-mono">{b.iban}</span>
                {b.bank_name && <span className="text-text-muted"> — {b.bank_name}</span>}
                {b.label && <span className="text-text-muted"> ({b.label})</span>}
                {idx === 0 && (
                  <span className="ml-1 text-[10px] bg-brand-teal/10 text-brand-teal px-1.5 py-0.5 rounded-full">
                    predeterminada
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Cuentas asociadas (${state.client_accounts.length})`}>
        <ul className="space-y-1">
          {state.client_accounts.map((c) => (
            <li key={c.id} className="text-xs text-text-body">
              <span className="font-medium">{c.full_name?.trim() || "(sin nombre)"}</span>
              <span className="text-text-muted"> · {c.email}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Departamentos y supervisores">
        <ul className="space-y-2">
          {selectedDepts.map((d) => {
            const supIds = state.supervisors_by_dept[d.id] ?? [];
            return (
              <li key={d.id}>
                <p className="text-xs font-semibold text-brand-navy">{d.name}</p>
                {supIds.length === 0 ? (
                  <p className="text-[11px] text-amber-700">Sin supervisores</p>
                ) : (
                  <p className="text-[11px] text-text-muted">
                    {supIds.map((sid) => profileNameMap.get(sid) ?? sid).join(", ")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Documentación inicial">
        <p className="text-xs text-text-muted">
          {mandatoryCount} obligatorios{" "}
          {optionalCount > 0 && (
            <span>
              · {optionalCount} {optionalCount === 1 ? "opcional" : "opcionales"}
            </span>
          )}
        </p>
      </Section>

      <Section title="Email de bienvenida">
        <p className="text-xs text-text-muted leading-relaxed">
          Se enviará un único email a las{" "}
          <strong>{state.client_accounts.length}</strong> cuentas asociadas.
          {allSupervisorIds.length > 0 && (
            <>
              {" "}
              En CC: <strong>{allSupervisorIds.length}</strong>{" "}
              {allSupervisorIds.length === 1 ? "supervisor" : "supervisores"}
            </>
          )}
          {chiefIds.length > 0 && (
            <>
              {" "}y los responsables de departamento ({chiefIds.length}).
            </>
          )}
        </p>
      </Section>

      <div className="flex justify-end pt-4 border-t border-gray-100">
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="text-sm bg-brand-teal text-white px-5 py-2.5 rounded-lg hover:bg-brand-teal/90 disabled:opacity-50 cursor-pointer inline-flex items-center gap-2"
        >
          {submitting && (
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          )}
          {submitting ? "Procesando..." : "Finalizar onboarding y notificar"}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-gray-100 px-4 py-3">
      <h3 className="text-sm font-semibold text-brand-navy mb-2">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-text-muted">{label}</span>
      <span className={`text-text-body ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function buildProfileNameMap(departments: OnboardingDepartment[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const d of departments) {
    for (const m of d.members) {
      map.set(m.id, m.full_name?.trim() || m.email);
    }
  }
  return map;
}
