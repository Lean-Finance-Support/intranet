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
import { unstable_cache, revalidateTag } from "next/cache";
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

/** Profile_ids que pertenecen al equipo responsable de una empresa. */
export async function getCompanyTeamMemberIds(
  supabase: DB,
  companyId: string
): Promise<string[]> {
  const { data } = await supabase
    .from("company_team_members")
    .select("profile_id")
    .eq("company_id", companyId);
  return [...new Set((data ?? []).map((r) => r.profile_id as string))];
}

/**
 * Inserta perfiles en el equipo responsable de una empresa (idempotente).
 * Ser técnico de un servicio del cliente implica estar en el equipo: las
 * server actions que asignan técnicos llaman aquí. Ser supervisor NO implica
 * pertenencia, así que esas acciones no la usan.
 */
export async function addCompanyTeamMembers(
  supabase: DB,
  companyId: string,
  profileIds: string[],
  addedBy?: string | null
): Promise<void> {
  const ids = [...new Set(profileIds)];
  if (ids.length === 0) return;
  const { error } = await supabase.from("company_team_members").upsert(
    ids.map((profile_id) => ({
      company_id: companyId,
      profile_id,
      added_by: addedBy ?? null,
    })),
    { onConflict: "company_id,profile_id", ignoreDuplicates: true }
  );
  if (error) throw new Error(`Error al añadir al equipo: ${error.message}`);
}

/**
 * Devuelve el equipo responsable de una empresa cliente.
 *
 * La fuente de verdad de la pertenencia es `company_team_members`. Cada
 * miembro se agrupa bajo los departamentos a los que pertenece (rol
 * Miembro/Chief) y bajo los dpts de los servicios de los que es técnico; si es
 * técnico de un servicio transversal aparece también bajo "Sin departamento".
 * Un miembro del equipo sin asignaciones de técnico se muestra igualmente.
 *
 * `is_chief` se calcula contra el dept del agrupador (no contra el dept
 * "natural" del admin).
 */
export async function getCompanyResponsibleTeam(
  supabase: DB,
  companyId: string
): Promise<ResponsibleTeam> {
  // 1. Miembros del equipo — fuente de verdad.
  const memberIds = await getCompanyTeamMemberIds(supabase, companyId);
  if (memberIds.length === 0) return { byDepartment: [] };

  // 2. Servicios contratados activos y mapeo service → department.
  const { data: companyServices } = await supabase
    .from("company_services")
    .select("id, service_id")
    .eq("company_id", companyId)
    .eq("is_active", true);

  const csList = companyServices ?? [];
  const csIds = csList.map((cs) => cs.id as string);
  const serviceByCsId = new Map<string, string>();
  for (const cs of csList) {
    serviceByCsId.set(cs.id as string, cs.service_id as string);
  }

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
  // Un servicio puede pertenecer a varios departamentos (cardinalidad 0..N).
  const serviceToDepts = new Map<string, string[]>();
  for (const ds of deptSvc ?? []) {
    const sid = ds.service_id as string;
    const arr = serviceToDepts.get(sid) ?? [];
    arr.push(ds.department_id as string);
    serviceToDepts.set(sid, arr);
  }

  // 3. Filas Técnico de los miembros del equipo sobre los servicios del cliente.
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
            .in("profile_id", memberIds)
        ).data ?? []
      : [];

  // 4. Pertenencia a departamento (rol Miembro/Chief) de cada miembro.
  const [miembroRoleId, chiefRoleId] = await Promise.all([
    getCachedRoleIdByName("Miembro de departamento"),
    fetchChiefRoleId(),
  ]);
  const deptRoleIds = [miembroRoleId, chiefRoleId].filter(
    (x): x is string => !!x
  );
  const deptRoleRows =
    deptRoleIds.length > 0
      ? (
          await supabase
            .from("profile_roles")
            .select("profile_id, scope_id, role_id")
            .eq("scope_type", "department")
            .in("profile_id", memberIds)
            .in("role_id", deptRoleIds)
        ).data ?? []
      : [];

  const naturalDeptsByProfile = new Map<string, Set<string>>();
  const chiefSet = new Set<string>();
  for (const r of deptRoleRows) {
    const pid = r.profile_id as string;
    const did = r.scope_id as string;
    let set = naturalDeptsByProfile.get(pid);
    if (!set) {
      set = new Set();
      naturalDeptsByProfile.set(pid, set);
    }
    set.add(did);
    if (chiefRoleId && r.role_id === chiefRoleId) chiefSet.add(`${did}|${pid}`);
  }

  // 5. Perfiles meta.
  const profileMap = new Map<string, { full_name: string | null; email: string }>();
  {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", memberIds);
    for (const p of profiles ?? []) {
      profileMap.set(p.id as string, {
        full_name: (p.full_name as string | null) ?? null,
        email: p.email as string,
      });
    }
  }

  // 6. Servicios de los que es técnico cada miembro.
  const techServicesByProfile = new Map<string, Map<string, string>>();
  for (const tr of techRoles) {
    const serviceId = serviceByCsId.get(tr.scope_id as string);
    if (!serviceId) continue;
    const svc = serviceById.get(serviceId);
    if (!svc) continue;
    const pid = tr.profile_id as string;
    let m = techServicesByProfile.get(pid);
    if (!m) {
      m = new Map();
      techServicesByProfile.set(pid, m);
    }
    m.set(svc.id, svc.name);
  }

  // 7. Departments meta — dpts de los servicios + dpts naturales de los miembros.
  const NO_DEPT_KEY = "__no_dept__";
  const allDeptIds = new Set<string>();
  for (const depts of serviceToDepts.values()) for (const d of depts) allDeptIds.add(d);
  for (const set of naturalDeptsByProfile.values()) for (const d of set) allDeptIds.add(d);
  const deptMap = new Map<string, string>();
  if (allDeptIds.size > 0) {
    const { data: depts } = await supabase
      .from("departments")
      .select("id, name")
      .in("id", [...allDeptIds]);
    for (const d of depts ?? []) deptMap.set(d.id as string, d.name as string);
  }
  deptMap.set(NO_DEPT_KEY, "Sin departamento");

  // 8. Construir agrupación dept → profile → miembro.
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

  for (const profileId of memberIds) {
    const techServices =
      techServicesByProfile.get(profileId) ?? new Map<string, string>();
    // dpt → servicios de los que es técnico bajo ese dpt (NO_DEPT si transversal)
    const techDeptToServices = new Map<
      string,
      { service_id: string; service_name: string }[]
    >();
    for (const [serviceId, serviceName] of techServices) {
      const depts = serviceToDepts.get(serviceId);
      const targets = depts && depts.length > 0 ? depts : [NO_DEPT_KEY];
      for (const did of targets) {
        const arr = techDeptToServices.get(did) ?? [];
        if (!arr.some((s) => s.service_id === serviceId)) {
          arr.push({ service_id: serviceId, service_name: serviceName });
        }
        techDeptToServices.set(did, arr);
      }
    }
    const naturalDepts = naturalDeptsByProfile.get(profileId) ?? new Set<string>();
    const displayDepts = new Set<string>([
      ...techDeptToServices.keys(),
      ...naturalDepts,
    ]);
    if (displayDepts.size === 0) displayDepts.add(NO_DEPT_KEY);

    for (const deptId of displayDepts) {
      const m = ensureMember(deptId, profileId);
      const svcs = techDeptToServices.get(deptId) ?? [];
      if (svcs.length > 0) {
        m.is_technician = true;
        m.technician_services = svcs;
      }
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
 *
 * Usa `revalidateTag` (no `updateTag`): los caches del equipo son
 * `unstable_cache`, y `updateTag` solo invalida tags de `fetch` o `'use cache'`.
 */
export function invalidateResponsibleTeam(companyId?: string): void {
  if (companyId) {
    revalidateTag(`responsible-team:${companyId}`, { expire: 0 });
    revalidateTag(`team-candidates:${companyId}`, { expire: 0 });
  } else {
    revalidateTag("responsible-team", { expire: 0 });
    revalidateTag("team-candidates", { expire: 0 });
  }
}
