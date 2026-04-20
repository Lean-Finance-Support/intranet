/**
 * Server-side helpers para consultar técnicos y chiefs desde `profile_roles`.
 *
 * profile_roles es la fuente de verdad después del refactor v2:
 *  - role Técnico: scope=company_service, scope_id=company_services.id
 *  - role Chief:   scope=department,      scope_id=departments.id
 *  - role Miembro/Operador/Observador: scope=department también
 */

import type { SupabaseClient } from "@supabase/supabase-js";

type DB = SupabaseClient;

export interface TechRow {
  profile_id: string;
  email: string;
  full_name: string | null;
}

/**
 * Técnicos asignados a una company × service concreta.
 */
export async function fetchTechniciansForService(
  supabase: DB,
  companyId: string,
  serviceId: string
): Promise<TechRow[]> {
  const { data: rolesData } = await supabase
    .from("profile_roles")
    .select("profile_id, role:roles!inner(name), cs:company_services!inner(company_id, service_id)")
    .eq("scope_type", "company_service")
    .eq("cs.company_id", companyId)
    .eq("cs.service_id", serviceId);

  const ids = [
    ...new Set(
      (rolesData ?? [])
        .filter((r) => (r.role as unknown as { name: string } | null)?.name === "Técnico")
        .map((r) => r.profile_id as string)
    ),
  ];
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
 * Técnicos en masa para un conjunto de service_ids. Devuelve filas
 * (company_id, service_id, technician_id) para los usos que necesitan
 * el listado global por servicio (vista de Mi equipo, panel clientes).
 */
export async function fetchTechniciansByServiceIds(
  supabase: DB,
  serviceIds: string[]
): Promise<Array<{ company_id: string; service_id: string; technician_id: string }>> {
  if (serviceIds.length === 0) return [];

  const { data } = await supabase
    .from("profile_roles")
    .select("profile_id, role:roles!inner(name), cs:company_services!inner(company_id, service_id)")
    .eq("scope_type", "company_service")
    .in("cs.service_id", serviceIds);

  const rows: Array<{ company_id: string; service_id: string; technician_id: string }> = [];
  for (const r of data ?? []) {
    const role = r.role as unknown as { name: string } | null;
    if (role?.name !== "Técnico") continue;
    const cs = r.cs as unknown as { company_id: string; service_id: string } | null;
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
  const { data: rolesData } = await supabase
    .from("profile_roles")
    .select("profile_id, role:roles!inner(name)")
    .eq("scope_type", "department")
    .eq("scope_id", departmentId);

  const ids = [
    ...new Set(
      (rolesData ?? [])
        .filter((r) => (r.role as unknown as { name: string } | null)?.name === "Chief")
        .map((r) => r.profile_id as string)
    ),
  ];
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
  const { data } = await supabase
    .from("profile_roles")
    .select("profile_id, role:roles!inner(name), cs:company_services!inner(company_id, service_id)")
    .eq("scope_type", "company_service")
    .eq("profile_id", profileId)
    .eq("cs.company_id", companyId)
    .eq("cs.service_id", serviceId);

  return (data ?? []).some((r) => (r.role as unknown as { name: string } | null)?.name === "Técnico");
}
