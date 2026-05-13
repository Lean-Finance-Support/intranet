// Estado del wizard de onboarding. Vive en el cliente desde el paso 1 hasta
// finalizar. Solo se persiste en BD al pulsar "Finalizar onboarding" en el
// paso 4 — antes de eso, todo es volátil.

import type { OnboardingServiceItem } from "../actions";

export interface OnboardingClientAccountState {
  id: string; // UUID local para keys de React
  email: string;
  full_name: string;
  // Cuando la prebúsqueda encuentra el email en BD, el wizard guarda el
  // profile_id existente y ya no edita full_name (no queremos sobrescribir el
  // nombre del usuario existente). En finalizeOnboarding, si existing_profile_id
  // está presente, full_name se ignora (se manda null) y solo vinculamos.
  existing_profile_id: string | null;
  already_linked_warning?: { id: string; legal_name: string }[];
}

export interface OnboardingBankAccountState {
  id: string;
  iban: string;
  label: string;
  bank_name: string;
}

export interface ApartadoOverride {
  apartado_id: string;
  is_optional: boolean;
  // Si el usuario añade supervisores extra o quita alguno, se persiste aquí.
  // Si no hay override, se hereda de los selected supervisors del depto.
  supervisor_ids: string[] | null;
  removed: boolean; // si el usuario lo quitó del listado
  // Si el usuario añade un apartado que no estaba sugerido, marcamos `added=true`
  // para no aplicarle filtros (Holded/alta empresa) cuando se recalcule.
  added: boolean;
}

export interface OnboardingState {
  // Paso 1
  legal_name: string;
  company_name: string;
  nif: string;
  bank_accounts: OnboardingBankAccountState[];
  client_accounts: OnboardingClientAccountState[];

  // Paso 2 — Equipo responsable
  // Servicios contratados (resuelven los departamentos derivados M:N vía
  // department_services). El equipo se agrupa por departamento derivado.
  selected_service_ids: string[];
  team_by_dept: Record<string, string[]>; // dept_id → profile_ids
  client_no_holded: boolean;
  alta_empresa: boolean;

  // Paso 3
  apartado_overrides: Record<string, ApartadoOverride>;
}

export const initialOnboardingState: OnboardingState = {
  legal_name: "",
  company_name: "",
  nif: "",
  bank_accounts: [],
  client_accounts: [],
  selected_service_ids: [],
  team_by_dept: {},
  client_no_holded: false,
  alta_empresa: false,
  apartado_overrides: {},
};

export function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

// Departamentos derivados de los servicios contratados (M:N: un servicio
// puede pertenecer a 0, 1 o N departamentos). Si el resultado es vacío, el
// cliente solo recibirá documentación global y no tendrá equipo asignado.
export function deriveSelectedDeptIds(
  state: OnboardingState,
  services: OnboardingServiceItem[]
): string[] {
  const sel = new Set(state.selected_service_ids);
  const out = new Set<string>();
  for (const s of services) {
    if (!sel.has(s.id)) continue;
    for (const d of s.department_ids) out.add(d);
  }
  return [...out];
}

// ───────────────────────────────────────────────────────────────────────────
// Cómputo de los apartados sugeridos a partir del estado del wizard.
// Compartido entre el paso 3 (donde el usuario los edita) y el paso 4 / submit
// (donde se serializan al server). Mantener una única fuente evita derivas.
// ───────────────────────────────────────────────────────────────────────────

import type {
  BlockTemplate,
  ApartadoTemplate,
  DocumentationTag,
} from "@/lib/types/documentation";

export interface ApartadoComputed {
  apartado: ApartadoTemplate;
  block: BlockTemplate;
  is_optional: boolean;
  supervisor_ids: string[];
  matched_dept_ids: string[];
  matched_tag_ids: string[];
  added: boolean;
}

export function computeApartados(
  state: OnboardingState,
  services: OnboardingServiceItem[],
  blocks: BlockTemplate[],
  tags: DocumentationTag[]
): ApartadoComputed[] {
  const tagBySlug = new Map<string, string>();
  for (const t of tags) tagBySlug.set(t.slug, t.id);
  const activeTagIds = new Set<string>();
  if (state.client_no_holded) {
    const t = tagBySlug.get("cliente_no_viene_de_holded");
    if (t) activeTagIds.add(t);
  }
  if (state.alta_empresa) {
    const t = tagBySlug.get("solicita_alta_empresa");
    if (t) activeTagIds.add(t);
  }

  const derivedDeptIds = deriveSelectedDeptIds(state, services);
  const selectedDeptSet = new Set(derivedDeptIds);
  const out: ApartadoComputed[] = [];

  for (const block of blocks) {
    for (const ap of block.apartados) {
      const override = state.apartado_overrides[ap.id];
      if (override?.removed) continue;
      const isAdded = override?.added ?? false;

      if (!isAdded) {
        if (!ap.is_global) {
          const deptIds = ap.department_ids ?? (ap.departments ?? []).map((d) => d.department_id);
          const overlap = deptIds.some((d) => selectedDeptSet.has(d));
          if (!overlap) continue;
        }
        const apTagIds = ap.tag_ids ?? [];
        if (apTagIds.length > 0) {
          const allActive = apTagIds.every((tid) => activeTagIds.has(tid));
          if (!allActive) continue;
        }
      }

      let defaultOptional = false;
      if (!isAdded) {
        if (ap.is_global) {
          defaultOptional = ap.is_optional_global ?? false;
        } else {
          const deptLinks = ap.departments ?? [];
          const relevant = deptLinks.filter((d) => selectedDeptSet.has(d.department_id));
          if (relevant.length > 0 && relevant.every((d) => d.is_optional)) {
            defaultOptional = true;
          }
        }
      }
      const isOptional = override?.is_optional ?? defaultOptional;

      let supervisorIds: string[];
      if (override?.supervisor_ids !== null && override?.supervisor_ids !== undefined) {
        supervisorIds = override.supervisor_ids;
      } else {
        const ids = new Set<string>();
        const deptScope: string[] = ap.is_global
          ? derivedDeptIds
          : (ap.department_ids ?? (ap.departments ?? []).map((d) => d.department_id)).filter((d) =>
              selectedDeptSet.has(d)
            );
        for (const did of deptScope) {
          for (const sid of state.team_by_dept[did] ?? []) ids.add(sid);
        }
        supervisorIds = [...ids];
      }

      out.push({
        apartado: ap,
        block,
        is_optional: isOptional,
        supervisor_ids: supervisorIds,
        matched_dept_ids: ap.is_global
          ? derivedDeptIds
          : (ap.department_ids ?? (ap.departments ?? []).map((d) => d.department_id)).filter((d) =>
              selectedDeptSet.has(d)
            ),
        matched_tag_ids: ap.tag_ids ?? [],
        added: isAdded,
      });
    }
  }
  return out;
}
