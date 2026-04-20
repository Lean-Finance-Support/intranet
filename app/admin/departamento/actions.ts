"use server";

import { requireAdmin } from "@/lib/require-admin";
import { requirePermission } from "@/lib/require-permission";
import { GRANTABLE_PERMISSIONS } from "@/lib/permission-catalog";
import { fetchTechniciansByServiceIds } from "@/lib/team-queries";

// ---------- Types ----------

export interface TeamRoleAssignment {
  role_name: string;
  scope_label: string | null;
}

export interface TeamCapability {
  perm_code: string;
  label: string;
  scope_label: string | null;
  level: 1 | 2 | 3;
}

export interface DeptMember {
  id: string;
  full_name: string | null;
  email: string;
  is_chief: boolean;
  /** Rol que tiene en ESTE departamento — Miembro / Chief / Observador / Operador (solo lo setea getAllTeams) */
  dept_role?: "miembro" | "chief" | "observador" | "operador";
  roles?: TeamRoleAssignment[];
  capabilities?: TeamCapability[];
}

export interface DeptCompanyTechnician {
  technician_id: string;
  technician_name: string | null;
  service_id: string;
}

export interface DeptCompanyService {
  service_id: string;
  service_name: string;
  technicians: { technician_id: string; technician_name: string | null }[];
}

export interface DeptCompany {
  id: string;
  legal_name: string;
  company_name: string | null;
  nif: string | null;
  services: DeptCompanyService[];
}

export interface DepartmentInfo {
  department_id: string;
  department_name: string;
  is_chief: boolean;
  /** Rol que el usuario actual tiene en este departamento (null si ninguno). Solo lo setea getAllTeams. */
  current_user_role?: "miembro" | "chief" | "observador" | "operador" | null;
  members: DeptMember[];
  companies: DeptCompany[];
}

// ---------- Get ALL teams (Mi equipo) ----------
// Devuelve todos los departamentos con miembros + empresas + técnicos,
// sin filtrar por pertenencia. Cada miembro lleva roles y capacidades
// (perms grantables con nivel >= 1) para mostrarlos públicamente.

export async function getAllTeams(): Promise<DepartmentInfo[]> {
  const { supabase, user } = await requireAdmin();

  const [
    { data: depts },
    { data: allDeptServices },
    { data: profilesRaw },
    { data: profileRolesRaw },
    { data: profilePermsRaw },
    { data: grantablePerms },
  ] = await Promise.all([
    supabase.from("departments").select("id, name, slug").order("name"),
    supabase
      .from("department_services")
      .select("department_id, service_id, service:services(id, name)")
      .eq("is_active", true),
    supabase.from("profiles").select("id, full_name, email").eq("role", "admin"),
    supabase
      .from("profile_roles")
      .select("profile_id, scope_type, scope_id, role:roles(id, name)"),
    supabase
      .from("profile_permissions")
      .select("profile_id, permission_code, scope_type, scope_id, grant_level"),
    supabase.from("permissions").select("code").eq("is_grantable", true),
  ]);

  const grantableSet = new Set((grantablePerms ?? []).map((p) => p.code));
  const grantableLabelByCode = new Map(
    GRANTABLE_PERMISSIONS.map((gp) => [gp.code, gp.label])
  );
  const deptNameById = new Map((depts ?? []).map((d) => [d.id, d.name]));

  // Cargar datos de empresas/servicios si hay algo que mostrar
  const allServiceIds = [
    ...new Set(
      (allDeptServices ?? [])
        .map((ds) => {
          const svc = ds.service as unknown as { id: string } | null;
          return svc?.id ?? "";
        })
        .filter(Boolean)
    ),
  ];

  let companyServices: { company_id: string; service_id: string }[] = [];
  let allAssignments: { company_id: string; service_id: string; technician_id: string }[] = [];
  let companies: {
    id: string;
    legal_name: string;
    company_name: string | null;
    nif: string | null;
  }[] = [];

  if (allServiceIds.length > 0) {
    const [csRes, techRows] = await Promise.all([
      supabase
        .from("company_services")
        .select("company_id, service_id")
        .in("service_id", allServiceIds)
        .eq("is_active", true),
      fetchTechniciansByServiceIds(supabase, allServiceIds),
    ]);
    companyServices = csRes.data ?? [];
    allAssignments = techRows;

    const allCompanyIds = [...new Set(companyServices.map((cs) => cs.company_id))];
    if (allCompanyIds.length > 0) {
      const { data: compData } = await supabase
        .from("companies")
        .select("id, legal_name, company_name, nif")
        .in("id", allCompanyIds)
        .is("deleted_at", null)
        .order("legal_name");
      companies = compData ?? [];
    }
  }

  const companyMap = new Map(companies.map((c) => [c.id, c]));
  const profileMap = new Map(
    (profilesRaw ?? []).map((p) => [p.id, { id: p.id, full_name: p.full_name, email: p.email }])
  );

  // Agrupar roles por profile_id con etiqueta de scope legible
  const rolesByProfile = new Map<string, TeamRoleAssignment[]>();
  for (const row of profileRolesRaw ?? []) {
    const role = row.role as unknown as { id: string; name: string } | null;
    if (!role) continue;
    let scopeLabel: string | null = null;
    if (row.scope_type === "department" && row.scope_id) {
      scopeLabel = deptNameById.get(row.scope_id) ?? null;
    } else if (row.scope_type === "company_service") {
      // Dejamos sin label fino (se podría resolver pero satura la UI).
      scopeLabel = "servicio asignado";
    }
    const existing = rolesByProfile.get(row.profile_id) ?? [];
    existing.push({ role_name: role.name, scope_label: scopeLabel });
    rolesByProfile.set(row.profile_id, existing);
  }

  // Agrupar capacidades grantables por profile_id
  const capsByProfile = new Map<string, TeamCapability[]>();
  for (const row of profilePermsRaw ?? []) {
    if (!grantableSet.has(row.permission_code)) continue;
    const label = grantableLabelByCode.get(row.permission_code) ?? row.permission_code;
    let scopeLabel: string | null = null;
    if (row.scope_type === "department" && row.scope_id) {
      scopeLabel = deptNameById.get(row.scope_id) ?? null;
    } else if (row.scope_type === "none") {
      scopeLabel = null;
    }
    const level = Math.max(1, Math.min(3, Number(row.grant_level ?? 1))) as 1 | 2 | 3;
    const existing = capsByProfile.get(row.profile_id) ?? [];
    existing.push({
      perm_code: row.permission_code,
      label,
      scope_label: scopeLabel,
      level,
    });
    capsByProfile.set(row.profile_id, existing);
  }

  // Mapa profile_id → rol que tiene en cada dept (prioridad: chief > operador > miembro > observador)
  type DeptRole = "miembro" | "chief" | "observador" | "operador";
  const deptRoleByProfileDept = new Map<string, Map<string, DeptRole>>();
  const rank: Record<DeptRole, number> = {
    chief: 4,
    operador: 3,
    miembro: 2,
    observador: 1,
  };
  for (const row of profileRolesRaw ?? []) {
    if (row.scope_type !== "department" || !row.scope_id) continue;
    const role = row.role as unknown as { name: string } | null;
    if (!role) continue;
    let kind: DeptRole | null = null;
    if (role.name === "Miembro de departamento") kind = "miembro";
    else if (role.name === "Chief") kind = "chief";
    else if (role.name === "Observador") kind = "observador";
    else if (role.name === "Operador") kind = "operador";
    if (!kind) continue;

    let inner = deptRoleByProfileDept.get(row.profile_id);
    if (!inner) {
      inner = new Map();
      deptRoleByProfileDept.set(row.profile_id, inner);
    }
    const existing = inner.get(row.scope_id);
    if (!existing || rank[kind] > rank[existing]) inner.set(row.scope_id, kind);
  }

  // Construir árbol de departamentos
  return (depts ?? []).map((dept) => {
    const memberEntries: { profile_id: string; kind: DeptRole }[] = [];
    for (const [profileId, deptMap] of deptRoleByProfileDept) {
      const kind = deptMap.get(dept.id);
      if (kind) memberEntries.push({ profile_id: profileId, kind });
    }

    const members: DeptMember[] = memberEntries
      .flatMap<DeptMember>(({ profile_id, kind }) => {
        const p = profileMap.get(profile_id);
        if (!p) return [];
        return [{
          id: p.id,
          full_name: p.full_name,
          email: p.email,
          is_chief: kind === "chief",
          dept_role: kind,
          roles: rolesByProfile.get(p.id) ?? [],
          capabilities: capsByProfile.get(p.id) ?? [],
        }];
      })
      .sort((a, b) => (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email));

    const currentUserRole = deptRoleByProfileDept.get(user.id)?.get(dept.id) ?? null;
    const isUserChief = currentUserRole === "chief";

    // Servicios del departamento
    const deptServiceEntries = (allDeptServices ?? []).filter((ds) => ds.department_id === dept.id);
    const deptServiceMap = new Map<string, { id: string; name: string }>();
    for (const ds of deptServiceEntries) {
      const svc = ds.service as unknown as { id: string; name: string } | null;
      if (svc) deptServiceMap.set(svc.id, svc);
    }
    const deptServiceIds = [...deptServiceMap.keys()];

    if (deptServiceIds.length === 0) {
      return {
        department_id: dept.id,
        department_name: dept.name,
        is_chief: isUserChief,
        current_user_role: currentUserRole,
        members,
        companies: [],
      };
    }

    const deptCompanyServiceMap = new Map<string, string[]>();
    for (const cs of companyServices) {
      if (!deptServiceIds.includes(cs.service_id)) continue;
      const existing = deptCompanyServiceMap.get(cs.company_id) ?? [];
      existing.push(cs.service_id);
      deptCompanyServiceMap.set(cs.company_id, existing);
    }

    const memberNameMap = new Map(members.map((m) => [m.id, m.full_name]));
    const assignmentMap = new Map<
      string,
      Map<string, { technician_id: string; technician_name: string | null }[]>
    >();
    for (const a of allAssignments) {
      if (!deptServiceIds.includes(a.service_id)) continue;
      if (!assignmentMap.has(a.company_id)) assignmentMap.set(a.company_id, new Map());
      const svcMap = assignmentMap.get(a.company_id)!;
      if (!svcMap.has(a.service_id)) svcMap.set(a.service_id, []);
      // El técnico puede no pertenecer al depto (edge case legacy): resolvemos nombre vía profileMap
      const techProfile = profileMap.get(a.technician_id);
      svcMap.get(a.service_id)!.push({
        technician_id: a.technician_id,
        technician_name:
          memberNameMap.get(a.technician_id) ?? techProfile?.full_name ?? null,
      });
    }

    const deptCompanies: DeptCompany[] = [...deptCompanyServiceMap.keys()]
      .map((companyId) => {
        const c = companyMap.get(companyId);
        if (!c) return null;
        const svcIds = deptCompanyServiceMap.get(companyId) ?? [];
        const services: DeptCompanyService[] = svcIds
          .map((svcId) => {
            const svc = deptServiceMap.get(svcId);
            if (!svc) return null;
            return {
              service_id: svc.id,
              service_name: svc.name,
              technicians: assignmentMap.get(companyId)?.get(svcId) ?? [],
            };
          })
          .filter((s): s is NonNullable<typeof s> => s !== null);
        return {
          id: c.id,
          legal_name: c.legal_name,
          company_name: c.company_name,
          nif: c.nif,
          services,
        } satisfies DeptCompany;
      })
      .filter((c): c is DeptCompany => c !== null)
      .sort((a, b) => a.legal_name.localeCompare(b.legal_name));

    return {
      department_id: dept.id,
      department_name: dept.name,
      is_chief: isUserChief,
      current_user_role: currentUserRole,
      members,
      companies: deptCompanies,
    };
  });
}

// ---------- Update company commercial name ----------

export async function updateCompanyName(
  companyId: string,
  companyName: string | null
): Promise<void> {
  const { supabase } = await requireAdmin();

  const { error } = await supabase
    .from("companies")
    .update({ company_name: companyName || null, updated_at: new Date().toISOString() })
    .eq("id", companyId);

  if (error) {
    console.error("[admin/departamento] updateCompanyName error:", error.code);
    throw new Error("Error al actualizar el nombre comercial.");
  }
}

// ---------- Helpers de roles (Técnico / Miembro) ----------

async function resolveDeptOfService(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  serviceId: string
): Promise<string> {
  const { data } = await supabase
    .from("department_services")
    .select("department_id")
    .eq("service_id", serviceId)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) throw new Error("Servicio sin departamento activo");
  return data.department_id as string;
}

async function resolveCompanyServiceId(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  companyId: string,
  serviceId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("company_services")
    .select("id")
    .eq("company_id", companyId)
    .eq("service_id", serviceId)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

async function getRoleId(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  name: string
): Promise<string> {
  const { data } = await supabase.from("roles").select("id").eq("name", name).maybeSingle();
  if (!data) throw new Error(`Rol '${name}' no encontrado`);
  return data.id as string;
}

async function ensureMiembroRole(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  profileId: string,
  deptId: string
): Promise<void> {
  const roleId = await getRoleId(supabase, "Miembro de departamento");
  const { error } = await supabase.from("profile_roles").insert({
    profile_id: profileId,
    role_id: roleId,
    scope_type: "department",
    scope_id: deptId,
  });
  if (error && error.code !== "23505") {
    console.error("[admin/departamento] ensureMiembroRole error:", error.code);
    throw new Error("No se pudo añadir al miembro al departamento.");
  }
}

async function addTecnicoRole(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  profileId: string,
  companyServiceId: string
): Promise<void> {
  const roleId = await getRoleId(supabase, "Técnico");
  const { error } = await supabase.from("profile_roles").insert({
    profile_id: profileId,
    role_id: roleId,
    scope_type: "company_service",
    scope_id: companyServiceId,
  });
  if (error && error.code !== "23505") {
    console.error("[admin/departamento] addTecnicoRole error:", error.code);
    throw new Error("No se pudo asignar el rol Técnico.");
  }
}

async function removeTecnicoRole(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  profileId: string,
  companyServiceId: string
): Promise<void> {
  const roleId = await getRoleId(supabase, "Técnico");
  const { error } = await supabase
    .from("profile_roles")
    .delete()
    .eq("profile_id", profileId)
    .eq("role_id", roleId)
    .eq("scope_type", "company_service")
    .eq("scope_id", companyServiceId);
  if (error) {
    console.error("[admin/departamento] removeTecnicoRole error:", error.code);
    throw new Error("No se pudo quitar el rol Técnico.");
  }
}

// ---------- Assign technician to company service ----------

export async function assignTechnician(
  companyId: string,
  serviceId: string,
  technicianId: string
): Promise<void> {
  const { supabase } = await requireAdmin();
  const deptId = await resolveDeptOfService(supabase, serviceId);
  await requirePermission("write_dept_service", { type: "department", id: deptId });

  await ensureMiembroRole(supabase, technicianId, deptId);
  const csId = await resolveCompanyServiceId(supabase, companyId, serviceId);
  if (!csId) throw new Error("Servicio no contratado por esta empresa.");
  await addTecnicoRole(supabase, technicianId, csId);
}

// ---------- Remove technician from company service ----------

export async function removeTechnician(
  companyId: string,
  serviceId: string,
  technicianId: string
): Promise<void> {
  const { supabase } = await requireAdmin();
  const deptId = await resolveDeptOfService(supabase, serviceId);
  await requirePermission("write_dept_service", { type: "department", id: deptId });

  const csId = await resolveCompanyServiceId(supabase, companyId, serviceId);
  if (!csId) return;
  await removeTecnicoRole(supabase, technicianId, csId);
}

// ---------- Assign ALL department members to a company service ----------

export async function assignAllMembers(
  companyId: string,
  serviceId: string,
  departmentId: string
): Promise<void> {
  const { supabase } = await requireAdmin();
  await requirePermission("write_dept_service", { type: "department", id: departmentId });

  const { data: memberRoles } = await supabase
    .from("profile_roles")
    .select("profile_id, role:roles!inner(name)")
    .eq("scope_type", "department")
    .eq("scope_id", departmentId);

  const memberIds = [
    ...new Set(
      (memberRoles ?? [])
        .filter((r) => {
          const role = r.role as unknown as { name: string } | null;
          return role?.name === "Miembro de departamento" || role?.name === "Chief";
        })
        .map((r) => r.profile_id as string)
    ),
  ];
  if (memberIds.length === 0) return;

  const csId = await resolveCompanyServiceId(supabase, companyId, serviceId);
  if (!csId) throw new Error("Servicio no contratado por esta empresa.");

  const roleId = await getRoleId(supabase, "Técnico");
  const tecnicoRows = memberIds.map((techId) => ({
    profile_id: techId,
    role_id: roleId,
    scope_type: "company_service" as const,
    scope_id: csId,
  }));
  const { error } = await supabase
    .from("profile_roles")
    .upsert(tecnicoRows, {
      onConflict: "profile_id,role_id,scope_type,scope_id",
      ignoreDuplicates: true,
    });
  if (error) {
    console.error("[admin/departamento] assignAllMembers error:", error.code);
    throw new Error("Error al asignar miembros.");
  }
}

// ---------- Perfiles admin elegibles para añadir a un depto ----------

export interface EligibleProfile {
  id: string;
  full_name: string | null;
  email: string;
}

export async function getEligibleProfilesForDept(deptId: string): Promise<EligibleProfile[]> {
  const { supabase } = await requireAdmin();

  const [{ data: profiles }, { data: existingRoles }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("role", "admin")
      .order("full_name"),
    supabase
      .from("profile_roles")
      .select("profile_id")
      .eq("scope_type", "department")
      .eq("scope_id", deptId),
  ]);

  const existingIds = new Set((existingRoles ?? []).map((r) => r.profile_id as string));
  return (profiles ?? []).filter((p) => !existingIds.has(p.id));
}

// ---------- Asignar rol Miembro/Observador a un empleado ----------

export type DeptRoleKind = "miembro" | "observador" | "operador";

function roleNameForKind(kind: DeptRoleKind): string {
  if (kind === "miembro") return "Miembro de departamento";
  if (kind === "observador") return "Observador";
  return "Operador";
}

export async function addDeptMember(
  profileId: string,
  departmentId: string,
  kind: DeptRoleKind
): Promise<void> {
  const { supabase } = await requireAdmin();
  await requirePermission("manage_dept_membership", { type: "department", id: departmentId });

  const roleId = await getRoleId(supabase, roleNameForKind(kind));
  const { error } = await supabase.from("profile_roles").insert({
    profile_id: profileId,
    role_id: roleId,
    scope_type: "department",
    scope_id: departmentId,
  });
  if (error && error.code !== "23505") {
    console.error("[admin/departamento] addDeptMember error:", error.code);
    throw new Error("No se pudo añadir al departamento.");
  }
}

export async function removeDeptMember(
  profileId: string,
  departmentId: string,
  kind: DeptRoleKind
): Promise<void> {
  const { supabase } = await requireAdmin();
  await requirePermission("manage_dept_membership", { type: "department", id: departmentId });

  const roleId = await getRoleId(supabase, roleNameForKind(kind));
  const { error } = await supabase
    .from("profile_roles")
    .delete()
    .eq("profile_id", profileId)
    .eq("role_id", roleId)
    .eq("scope_type", "department")
    .eq("scope_id", departmentId);
  if (error) {
    console.error("[admin/departamento] removeDeptMember error:", error.code);
    throw new Error("No se pudo quitar del departamento.");
  }
}
