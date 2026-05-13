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
import { unstable_cache, updateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { getCachedRoleIdByName } from "@/lib/cached-queries";

type DB = SupabaseClient;

export interface TechRow {
  profile_id: string;
  email: string;
  full_name: string | null;
}

async function fetchTecnicoRoleId(): Promise<string | null> {
  return getCachedRoleIdByName("Técnico");
}

async function fetchChiefRoleId(): Promise<string | null> {
  return getCachedRoleIdByName("Chief");
}

/**
 * Técnicos asignados a una company × service concreta.
 */
export async function fetchTechniciansForService(
  supabase: DB,
  companyId: string,
  serviceId: string
): Promise<TechRow[]> {
  const tecnicoRoleId = await fetchTecnicoRoleId();
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

  const tecnicoRoleId = await fetchTecnicoRoleId();
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
  const chiefRoleId = await fetchChiefRoleId();
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
  const tecnicoRoleId = await fetchTecnicoRoleId();
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

async function fetchSupervisorRoleId(): Promise<string | null> {
  return getCachedRoleIdByName("Supervisor de apartado");
}

/**
 * Set de company_ids donde el usuario es supervisor de algún apartado de
 * documentación. Necesita un cliente con permiso al schema `documentation`
 * (admin client o usuario con RLS suficiente).
 */
export async function fetchSupervisorCompanyIds(
  supabase: DB,
  profileId: string
): Promise<Set<string>> {
  const supervisorRoleId = await fetchSupervisorRoleId();
  if (!supervisorRoleId) return new Set();

  const { data: roleRows } = await supabase
    .from("profile_roles")
    .select("scope_id")
    .eq("role_id", supervisorRoleId)
    .eq("scope_type", "client_apartado")
    .eq("profile_id", profileId);

  const clientApartadoIds = [...new Set((roleRows ?? []).map((r) => r.scope_id as string))];
  if (clientApartadoIds.length === 0) return new Set();

  const { data: apartados } = await supabase
    .schema("documentation")
    .from("client_apartados")
    .select("client_block_id")
    .in("id", clientApartadoIds);

  const blockIds = [...new Set((apartados ?? []).map((a) => a.client_block_id as string))];
  if (blockIds.length === 0) return new Set();

  const { data: blocks } = await supabase
    .schema("documentation")
    .from("client_blocks")
    .select("company_id")
    .in("id", blockIds);

  return new Set((blocks ?? []).map((b) => b.company_id as string));
}

// ─── Equipo responsable de una empresa ───────────────────────────────────

export interface ResponsibleTeamMember {
  profile_id: string;
  full_name: string | null;
  email: string;
  is_chief: boolean;
  is_technician: boolean;
  is_supervisor: boolean;
  technician_services: { service_id: string; service_name: string }[];
}

export interface ResponsibleTeamDepartment {
  department_id: string;
  department_name: string;
  members: ResponsibleTeamMember[];
}

export interface ResponsibleTeam {
  byDepartment: ResponsibleTeamDepartment[];
}

/**
 * Devuelve el equipo responsable de una empresa cliente, agrupado por el
 * departamento que motiva la asignación (dept del servicio para técnicos;
 * dept(s) del apartado para supervisores). Un mismo admin puede aparecer
 * en varios depts si tiene asignaciones en varios.
 *
 * `is_chief` se calcula contra el dept del agrupador (no contra el dept
 * "natural" del admin).
 */
export async function getCompanyResponsibleTeam(
  supabase: DB,
  companyId: string
): Promise<ResponsibleTeam> {
  // 1. Servicios contratados activos de la company
  const { data: companyServices } = await supabase
    .from("company_services")
    .select("id, service_id")
    .eq("company_id", companyId)
    .eq("is_active", true);

  const csList = companyServices ?? [];
  const csIds = csList.map((cs) => cs.id as string);
  const csById = new Map<string, { service_id: string }>();
  for (const cs of csList) {
    csById.set(cs.id as string, { service_id: cs.service_id as string });
  }

  // 2. Servicios meta y mapeo service → department
  const serviceIds = [...new Set(csList.map((cs) => cs.service_id as string))];
  const [{ data: services }, { data: deptSvc }] =
    serviceIds.length > 0
      ? await Promise.all([
          supabase.from("services").select("id, name").in("id", serviceIds),
          supabase
            .from("department_services")
            .select("service_id, department_id")
            .in("service_id", serviceIds)
            .eq("is_active", true),
        ])
      : [{ data: [] as { id: string; name: string }[] }, { data: [] as { service_id: string; department_id: string }[] }];

  const serviceById = new Map<string, { id: string; name: string }>();
  for (const s of services ?? []) {
    serviceById.set(s.id as string, { id: s.id as string, name: s.name as string });
  }
  const serviceToDept = new Map<string, string>();
  for (const ds of deptSvc ?? []) {
    if (!serviceToDept.has(ds.service_id as string)) {
      serviceToDept.set(ds.service_id as string, ds.department_id as string);
    }
  }

  // 3. Técnicos. Son la ÚNICA fuente del equipo responsable: solo aparecen
  // en el equipo quienes tienen rol Técnico en algún servicio del cliente.
  // Ser supervisor de apartados no mete a nadie en el equipo (ver cambio de
  // política en el README de la feature).
  const tecnicoRoleId = await fetchTecnicoRoleId();
  const techRoles =
    csIds.length > 0 && tecnicoRoleId
      ? (
          await supabase
            .from("profile_roles")
            .select("profile_id, scope_id")
            .eq("role_id", tecnicoRoleId)
            .eq("scope_type", "company_service")
            .in("scope_id", csIds)
        ).data ?? []
      : [];

  // 7. Profiles meta de los técnicos (única fuente del equipo).
  const allProfileIds = [...new Set(techRoles.map((r) => r.profile_id as string))];
  const profileMap = new Map<string, { full_name: string | null; email: string }>();
  if (allProfileIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", allProfileIds);
    for (const p of profiles ?? []) {
      profileMap.set(p.id as string, {
        full_name: (p.full_name as string | null) ?? null,
        email: p.email as string,
      });
    }
  }

  // 8. Departments meta y chiefs por dept. Solo nos interesan los dpts que
  // tocan algún servicio contratado (resto del modelo se ignora porque ya no
  // contamos supervisores).
  const allDeptIds = [...new Set(Array.from(serviceToDept.values()))];
  const [{ data: depts }, chiefRows] = await Promise.all([
    allDeptIds.length === 0
      ? Promise.resolve({ data: [] as { id: string; name: string }[] })
      : supabase.from("departments").select("id, name").in("id", allDeptIds),
    (async () => {
      const chiefRoleId = await fetchChiefRoleId();
      if (!chiefRoleId || allDeptIds.length === 0) return [] as { profile_id: string; scope_id: string }[];
      const { data } = await supabase
        .from("profile_roles")
        .select("profile_id, scope_id")
        .eq("role_id", chiefRoleId)
        .eq("scope_type", "department")
        .in("scope_id", allDeptIds);
      return (data ?? []) as { profile_id: string; scope_id: string }[];
    })(),
  ]);

  // Clave virtual para agrupar técnicos de servicios sin dpto.
  const NO_DEPT_KEY = "__no_dept__";
  const deptMap = new Map<string, string>();
  for (const d of depts ?? []) deptMap.set(d.id as string, d.name as string);
  deptMap.set(NO_DEPT_KEY, "Sin departamento");

  const chiefSet = new Set<string>();
  for (const c of chiefRows) chiefSet.add(`${c.scope_id}|${c.profile_id}`);

  // 9. Construir agrupación dept → profile → miembro
  const memberByDept = new Map<string, Map<string, ResponsibleTeamMember>>();

  function ensureMember(deptId: string, profileId: string): ResponsibleTeamMember {
    let perDept = memberByDept.get(deptId);
    if (!perDept) {
      perDept = new Map();
      memberByDept.set(deptId, perDept);
    }
    let m = perDept.get(profileId);
    if (!m) {
      const p = profileMap.get(profileId);
      m = {
        profile_id: profileId,
        full_name: p?.full_name ?? null,
        email: p?.email ?? "",
        is_chief: chiefSet.has(`${deptId}|${profileId}`),
        is_technician: false,
        is_supervisor: false,
        technician_services: [],
      };
      perDept.set(profileId, m);
    }
    return m;
  }

  for (const tr of techRoles) {
    const csInfo = csById.get(tr.scope_id as string);
    if (!csInfo) continue;
    // Si el servicio del técnico no tiene dpto, lo agrupamos en
    // "Sin departamento" — el técnico igualmente está en el equipo.
    const deptId = serviceToDept.get(csInfo.service_id) ?? NO_DEPT_KEY;
    const m = ensureMember(deptId, tr.profile_id as string);
    m.is_technician = true;
    const svc = serviceById.get(csInfo.service_id);
    if (svc && !m.technician_services.some((ts) => ts.service_id === svc.id)) {
      m.technician_services.push({ service_id: svc.id, service_name: svc.name });
    }
  }

  const byDepartment: ResponsibleTeamDepartment[] = [];
  for (const [deptId, perDept] of memberByDept) {
    const members = [...perDept.values()].sort((a, b) => {
      // chiefs first, then by name
      if (a.is_chief !== b.is_chief) return a.is_chief ? -1 : 1;
      return (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email, "es");
    });
    byDepartment.push({
      department_id: deptId,
      department_name: deptMap.get(deptId) ?? "",
      members,
    });
  }
  byDepartment.sort((a, b) => {
    // "Sin departamento" siempre al final.
    if (a.department_id === NO_DEPT_KEY) return 1;
    if (b.department_id === NO_DEPT_KEY) return -1;
    return a.department_name.localeCompare(b.department_name, "es");
  });

  return { byDepartment };
}

// ─── Versión cacheada + helper de invalidación ──────────────────────────
//
// El equipo responsable agrega ~14 queries y se renderiza tanto en el panel
// admin como en el portal cliente (/app/contacto). Cacheamos por companyId
// con TTL de 1h como red de seguridad — el camino normal es invalidar con
// `invalidateResponsibleTeam` desde las server actions que mutan algo que
// afecta al equipo.

export async function getCachedCompanyResponsibleTeam(
  companyId: string
): Promise<ResponsibleTeam> {
  return unstable_cache(
    async () => {
      const admin = createAdminClient();
      return getCompanyResponsibleTeam(admin, companyId);
    },
    ["responsible-team", companyId],
    {
      tags: [`responsible-team:${companyId}`, "responsible-team"],
      revalidate: 3600,
    }
  )();
}

/**
 * Invalida el cache del equipo responsable Y el de candidatos a añadir.
 * Ambos comparten los mismos triggers de invalidación (cualquier cambio en
 * técnicos/servicios del cliente o en la pertenencia a departamentos altera
 * tanto el listado actual como el de candidatos disponibles).
 *
 * Pasa `companyId` para invalidar una empresa concreta, o llama sin args para
 * invalidar todas (usar solo cuando una mutación afecta a varias empresas —
 * p.ej. cambio de chief de dept que altera todos los clientes con servicios
 * de ese dept).
 */
export function invalidateResponsibleTeam(companyId?: string): void {
  if (companyId) {
    updateTag(`responsible-team:${companyId}`);
    updateTag(`team-candidates:${companyId}`);
  } else {
    updateTag("responsible-team");
    updateTag("team-candidates");
  }
}
