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
        <p className="text-xs text-text-muted leading-relaxed mb-3">
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
        <WelcomeEmailPreview
          state={state}
          selectedDepts={selectedDepts}
          supervisorIds={allSupervisorIds}
          profileNameMap={profileNameMap}
        />
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

// ───────────────────────────────────────────────────────────────────────────
// Preview del email de bienvenida — refleja la estructura real que se enviará
// (notify-client-onboarding-welcome). Si cambia el HTML del edge function hay
// que tocar también este preview para que no se desincronice.
// ───────────────────────────────────────────────────────────────────────────

function firstName(fullName: string | null, email: string): string {
  const trimmed = (fullName ?? "").trim();
  if (trimmed) return trimmed.split(/\s+/)[0];
  const local = (email ?? "").split("@")[0] ?? "";
  if (!local) return "";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} y ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

function WelcomeEmailPreview({
  state,
  selectedDepts,
  supervisorIds,
  profileNameMap,
}: {
  state: OnboardingState;
  selectedDepts: OnboardingDepartment[];
  supervisorIds: string[];
  profileNameMap: Map<string, string>;
}) {
  const companyName =
    state.company_name.trim() || state.legal_name.trim() || "tu empresa";

  const recipientNames = state.client_accounts
    .map((c) => firstName(c.full_name?.trim() || null, c.email))
    .filter(Boolean);
  const greetingNames = joinNames(recipientNames);
  const greeting = greetingNames ? `Hola ${greetingNames},` : "Hola,";

  // Cada supervisor se asigna al primer dpto seleccionado donde aparece como
  // miembro. Es una aproximación al cómputo del edge function (que mira el
  // primer profile_role con scope_type='department'); para el preview basta.
  const deptBySupervisor = new Map<string, OnboardingDepartment | null>();
  for (const sid of supervisorIds) {
    const dept = selectedDepts.find((d) => d.members.some((m) => m.id === sid));
    deptBySupervisor.set(sid, dept ?? null);
  }

  // Agrupación por dpto, manteniendo orden de aparición (igual que el email)
  const groups: { dept: OnboardingDepartment | null; supervisorIds: string[] }[] = [];
  const groupIndex = new Map<string, number>();
  for (const sid of supervisorIds) {
    const dept = deptBySupervisor.get(sid) ?? null;
    const key = dept?.id ?? "__none__";
    let idx = groupIndex.get(key);
    if (idx === undefined) {
      idx = groups.length;
      groupIndex.set(key, idx);
      groups.push({ dept, supervisorIds: [] });
    }
    groups[idx].supervisorIds.push(sid);
  }

  // Chief por dpto (solo si el dpto tiene supervisores en el email)
  const chiefByDept = new Map<string, { id: string; name: string }>();
  for (const d of selectedDepts) {
    if (!d.chief_id) continue;
    const member = d.members.find((m) => m.id === d.chief_id);
    if (!member) continue;
    chiefByDept.set(d.id, {
      id: member.id,
      name: member.full_name?.trim() || member.email,
    });
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-[#f4f5f7] p-4 sm:p-6">
      <div className="text-center pb-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://leanfinance.es/wp-content/uploads/2022/01/LEANFINANCE_Ppal_Color_transp-2.png"
          alt="Lean Finance"
          width={140}
          className="inline-block max-w-[140px] h-auto"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm px-5 py-6 sm:px-7 sm:py-7">
        <p className="text-[11px] font-semibold tracking-[0.16em] uppercase text-brand-teal mb-1.5">
          Bienvenida
        </p>
        <h2 className="text-xl font-bold text-brand-navy leading-tight mb-5">
          Bienvenido/a a Lean Finance,
        </h2>

        <p className="text-sm text-gray-600 leading-relaxed mb-3">{greeting}</p>
        <p className="text-sm text-gray-600 leading-relaxed mb-3">
          Os damos la bienvenida a <strong>Lean Finance</strong>. Estamos
          encantados de empezar a trabajar con <strong>{companyName}</strong>.
        </p>

        {supervisorIds.length > 0 && (
          <>
            <p className="text-sm text-gray-600 leading-relaxed mt-5 mb-2">
              Lo primero es presentar al equipo encargado de trabajar con
              vosotros en los servicios contratados:
            </p>
            <h3 className="text-base font-bold text-brand-navy mb-1.5">
              Equipo asignado
            </h3>
            <p className="text-xs text-gray-500 leading-relaxed mb-3">
              Estas serán vuestras personas de referencia, que os acompañarán
              desde el inicio. Pulsa sobre cualquiera de ellos o utiliza{" "}
              <span className="text-brand-teal font-semibold underline">
                Responder a todos
              </span>{" "}
              para contactar.
            </p>

            <div className="space-y-2.5 mb-3">
              {groups.map((g, idx) => {
                const chief = g.dept ? chiefByDept.get(g.dept.id) : null;
                return (
                  <div key={idx} className="space-y-1.5">
                    {g.supervisorIds.map((sid) => {
                      const name =
                        profileNameMap.get(sid) ?? sid;
                      return (
                        <div
                          key={sid}
                          className="flex items-center justify-between gap-3 bg-white border border-gray-200 border-l-[3px] border-l-brand-teal rounded-lg px-3.5 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-brand-navy truncate">
                              {name}
                            </p>
                            {g.dept?.name && (
                              <p className="text-[11px] text-gray-500 truncate mt-0.5">
                                {g.dept.name}
                              </p>
                            )}
                          </div>
                          <span className="text-xs font-semibold text-brand-teal whitespace-nowrap">
                            Escribirle &rarr;
                          </span>
                        </div>
                      );
                    })}
                    {chief && (
                      <p className="text-[11px] text-gray-500 leading-relaxed pl-3.5">
                        <span className="text-gray-400">
                          → Responsable del departamento:{" "}
                        </span>
                        <span className="text-brand-navy font-semibold">
                          {chief.name}
                        </span>{" "}
                        <span className="text-brand-teal font-semibold">
                          Escribirle
                        </span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-sm text-gray-600 leading-relaxed mb-2">
              Además, en el apartado{" "}
              <span className="text-brand-teal underline font-semibold">
                Contacto
              </span>{" "}
              de la plataforma puedes consultar el equipo completo.
            </p>
          </>
        )}

        <div
          className="my-6 p-5 rounded-xl text-white"
          style={{ background: "linear-gradient(135deg,#0f2444 0%,#16335a 100%)" }}
        >
          <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[#7DDCDF] mb-1">
            Primer paso
          </p>
          <h3 className="text-lg font-bold leading-tight mb-2.5">
            Documentación inicial
          </h3>
          <p className="text-sm text-[#cfd8e3] leading-relaxed mb-2">
            Para comenzar, hemos preparado una lista con la documentación
            inicial que necesitamos de vosotros. ¡Podéis verla a través del
            portal!
          </p>
          <p className="text-sm text-[#cfd8e3] leading-relaxed mb-3">
            La recepción de esta documentación es{" "}
            <strong className="text-white">imprescindible</strong> para iniciar
            el trabajo con vosotros.
          </p>
          <p className="text-xs text-[#7DDCDF] leading-relaxed mb-4">
            Recordad iniciar sesión con el correo electrónico con el que habéis
            recibido este mensaje.
          </p>
          <span className="inline-block bg-brand-teal text-white text-sm font-semibold px-6 py-3 rounded-lg">
            Acceder al portal
          </span>
        </div>

        <p className="text-sm text-gray-600 leading-relaxed">
          Cualquier duda, podéis escribir al equipo asignado directamente. Están
          encantados de ayudaros.
        </p>
      </div>

      <p className="text-center text-[10px] text-gray-400 pt-4 leading-relaxed">
        Lean Finance · Asesoría fiscal y contable
        <br />
        Este correo se ha enviado a los contactos de{" "}
        <strong>{companyName}</strong>.
      </p>
    </div>
  );
}
