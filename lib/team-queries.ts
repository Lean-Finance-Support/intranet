/**
 * Server-side helpers para consultar técnicos y chiefs desde `profile_roles`.
 *
 * profile_roles es la fuente de verdad después del refactor v2:
 *  - role Técnico: scope=company_service, scope_id=company_services.id
 *  - role Chief:   scope=department,      scope_id=departments.id
 *  - role Miembro/Operador/Observador: scope=department también
 *
 * NOTA: profile_roles.scope_id es un uuid genérico sin FK a company_services
 * ni a departments (el scope se elige según scope_type). Por eso hacemos
 * siempre dos queries y un JOIN en TS, en lugar de usar embeds PostgREST
 * que dependen de FK declarada.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

type DB = SupabaseClient;

export interface TechRow {
  profile_id: string;
  email: string;
  full_name: string | null;
}

async function fetchTecnicoRoleId(supabase: DB): Promise<string | null> {
  const { data } = await supabase
    .from("roles")
    .select("id")
    .eq("name", "Técnico")
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

async function fetchChiefRoleId(supabase: DB): Promise<string | null> {
  const { data } = await supabase
    .from("roles")
    .select("id")
    .eq("name", "Chief")
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/**
 * Técnicos asignados a una company × service concreta.
 */
export async function fetchTechniciansForService(
  supabase: DB,
  companyId: string,
  serviceId: string
): Promise<TechRow[]> {
  const tecnicoRoleId = await fetchTecnicoRoleId(supabase);
  if (!tecnicoRoleId) return [];

  // 1. Buscar el company_services.id para este (company, service)
  const { data: cs } = await supabase
    .from("company_services")
    .select("id")
    .eq("company_id", companyId)
    .eq("service_id", serviceId)
    .maybeSingle();
  if (!cs?.id) return [];

  // 2. Técnicos con scope_id = ese company_services.id
  const { data: rolesData } = await supabase
    .from("profile_roles")
    .select("profile_id")
    .eq("scope_type", "company_service")
    .eq("role_id", tecnicoRoleId)
    .eq("scope_id", cs.id);

  const ids = [...new Set((rolesData ?? []).map((r) => r.profile_id as string))];
  if (ids.length === 0) return [];

  // 3. Datos de perfiles
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", ids);

  return (profiles ?? []).map((p) => ({
    profile_id: p.id as string,
    email: (p.email as string) ?? "",
    full_name: (p.full_name as string | null) ?? null,
  }));
}

/**
 * Técnicos en masa para un conjunto de service_ids. Devuelve filas
 * (company_id, service_id, technician_id) para los usos que necesitan
 * el listado global por servicio (vista de Mi equipo, panel clientes).
 */
export async function fetchTechniciansByServiceIds(
  supabase: DB,
  serviceIds: string[]
): Promise<Array<{ company_id: string; service_id: string; technician_id: string }>> {
  if (serviceIds.length === 0) return [];

  const tecnicoRoleId = await fetchTecnicoRoleId(supabase);
  if (!tecnicoRoleId) return [];

  // 1. Todos los company_services con esos service_ids
  const { data: css } = await supabase
    .from("company_services")
    .select("id, company_id, service_id")
    .in("service_id", serviceIds);

  const csList = css ?? [];
  if (csList.length === 0) return [];

  const csById = new Map<string, { company_id: string; service_id: string }>();
  for (const row of csList) {
    csById.set(row.id as string, {
      company_id: row.company_id as string,
      service_id: row.service_id as string,
    });
  }
  const csIds = [...csById.keys()];

  // 2. profile_roles Técnico con scope_id en esos company_services.id
  const { data: rolesData } = await supabase
    .from("profile_roles")
    .select("profile_id, scope_id")
    .eq("scope_type", "company_service")
    .eq("role_id", tecnicoRoleId)
    .in("scope_id", csIds);

  const rows: Array<{ company_id: string; service_id: string; technician_id: string }> = [];
  for (const r of rolesData ?? []) {
    const cs = csById.get(r.scope_id as string);
    if (!cs) continue;
    rows.push({
      company_id: cs.company_id,
      service_id: cs.service_id,
      technician_id: r.profile_id as string,
    });
  }
  return rows;
}

/**
 * Chiefs de un departamento (profile_id + email + full_name).
 */
export async function fetchChiefsForDepartment(
  supabase: DB,
  departmentId: string
): Promise<TechRow[]> {
  const chiefRoleId = await fetchChiefRoleId(supabase);
  if (!chiefRoleId) return [];

  const { data: rolesData } = await supabase
    .from("profile_roles")
    .select("profile_id")
    .eq("scope_type", "department")
    .eq("role_id", chiefRoleId)
    .eq("scope_id", departmentId);

  const ids = [...new Set((rolesData ?? []).map((r) => r.profile_id as string))];
  if (ids.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", ids);

  return (profiles ?? []).map((p) => ({
    profile_id: p.id as string,
    email: (p.email as string) ?? "",
    full_name: (p.full_name as string | null) ?? null,
  }));
}

/**
 * ¿El usuario es técnico de esta company × service?
 */
export async function isTechnicianOf(
  supabase: DB,
  profileId: string,
  companyId: string,
  serviceId: string
): Promise<boolean> {
  const tecnicoRoleId = await fetchTecnicoRoleId(supabase);
  if (!tecnicoRoleId) return false;

  const { data: cs } = await supabase
    .from("company_services")
    .select("id")
    .eq("company_id", companyId)
    .eq("service_id", serviceId)
    .maybeSingle();
  if (!cs?.id) return false;

  const { data } = await supabase
    .from("profile_roles")
    .select("profile_id")
    .eq("scope_type", "company_service")
    .eq("role_id", tecnicoRoleId)
    .eq("scope_id", cs.id)
    .eq("profile_id", profileId);

  return (data ?? []).length > 0;
}
