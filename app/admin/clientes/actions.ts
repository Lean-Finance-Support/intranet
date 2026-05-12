"use server";

import { updateTag } from "next/cache";
import { requireAdmin } from "@/lib/require-admin";
import { hasPermission, requirePermission, userScopeIds } from "@/lib/require-permission";
import {
  fetchSupervisorCompanyIds,
  fetchTechniciansByServiceIds,
  getCachedCompanyResponsibleTeam,
  invalidateResponsibleTeam,
  type ResponsibleTeam,
} from "@/lib/team-queries";
import { createAdminClient } from "@/lib/supabase/server";
import type { CompanyBankAccount } from "@/lib/types/bank-accounts";
import { getDashboardData, parseSheetUrl, DashboardSheetError } from "@/lib/google-sheets/client";
import {
  buildClientDashboardReadyPreviewHtml,
  buildClientDashboardReadyPreviewSubject,
} from "@/lib/dashboard/email-previews/client-dashboard-ready";

/**
 * Resuelve el departamento activo para un servicio (vía department_services).
 * Devuelve el department_id o lanza si el servicio no está activo en ninguno.
 */
async function resolveServiceDepartment(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  serviceId: string
): Promise<string> {
  const { data } = await supabase
    .from("department_services")
    .select("department_id")
    .eq("service_id", serviceId)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) throw new Error("Servicio no encontrado");
  return data.department_id as string;
}

// La lectura del listado y detalle de clientes es abierta a cualquier admin
// (información pública interna). Las acciones de escritura mantienen su propia
// comprobación de permiso específica (edit_company_info, manage_bank_accounts,
// manage_client_accounts, write_dept_service, etc.).

// ---------- Types ----------

export interface ClienteService {
  service_id: string;
  service_name: string;
  service_slug: string;
  department_id: string;
  department_name: string;
  technicians: { id: string; name: string | null }[];
}

export interface ClienteCompany {
  id: string;
  legal_name: string;
  company_name: string | null;
  nif: string | null;
  services: ClienteService[];
  /**
   * Departamentos derivados del equipo responsable de la empresa: depts donde
   * existe al menos un técnico asignado (vía servicio contratado) o al menos
   * un supervisor de algún apartado de documentación. No es la mera lista de
   * depts de los servicios contratados — refleja quién está "implicado" hoy.
   */
  responsible_team_dept_ids: string[];
  is_assigned: boolean;
  deleted_at: string | null;
  created_at: string;
  documentation_progress: { validated: number; total: number; in_review: number } | null;
}

export interface DeptMemberSlim {
  id: string;
  name: string | null;
}

export interface ClientesPageData {
  companies: ClienteCompany[];
  departments: { id: string; name: string }[];
  userChiefDeptIds: string[];
  deptMembers: { [deptId: string]: DeptMemberSlim[] };
  chiefAvailableServices: {
    service_id: string;
    service_name: string;
    service_slug: string;
    department_id: string;
  }[];
  canCreateCompany: boolean;
  canDeleteCompany: boolean;
  canManageClientAccounts: boolean;
  canManageBankAccounts: boolean;
  canRequestDocumentation: boolean;
}

export interface ClientAccount {
  id: string;
  full_name: string | null;
  email: string;
}

export interface CompanyDetailInfo {
  id: string;
  legal_name: string;
  company_name: string | null;
  nif: string | null;
  deleted_at: string | null;
  created_at: string;
  profiles: { id: string; full_name: string | null; email: string }[];
  bank_accounts: CompanyBankAccount[];
}

// ---------- Main data loader ----------

export async function getAllCompaniesData(): Promise<ClientesPageData> {
  const { supabase, user } = await requireAdmin();

  // 1. Batch: all departments, services, dept-service links, companies
  const [
    { data: allDepts },
    { data: allServices },
    { data: deptSvcLinks },
    compResult,
  ] = await Promise.all([
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("services").select("id, name, slug"),
    supabase.from("department_services").select("department_id, service_id").eq("is_active", true),
    (() => {
      return supabase
        .from("companies")
        .select("id, legal_name, company_name, nif, deleted_at, created_at")
        .order("legal_name");
    })(),
  ]);

  const departments = (allDepts ?? []) as { id: string; name: string }[];
  const deptMap = new Map(departments.map((d) => [d.id, d.name]));
  const serviceMap = new Map(
    (allServices ?? []).map((s) => [s.id, s as { id: string; name: string; slug: string }])
  );

  // service_id → first department_id
  const serviceToDeptId = new Map<string, string>();
  for (const ds of deptSvcLinks ?? []) {
    if (!serviceToDeptId.has(ds.service_id)) serviceToDeptId.set(ds.service_id, ds.department_id);
  }

  const companies = compResult.data ?? [];
  const companyIds = companies.map((c) => c.id);

  // 2. User's chief depts + permisos globales para gestionar empresas/cuentas
  const [
    userChiefDeptIds,
    canCreateCompany,
    canDeleteCompany,
    canManageClientAccounts,
    canManageBankAccounts,
    canRequestDocumentation,
  ] = await Promise.all([
    userScopeIds("write_dept_service", "department"),
    hasPermission("create_company"),
    hasPermission("delete_company"),
    hasPermission("manage_client_accounts"),
    hasPermission("manage_bank_accounts"),
    hasPermission("request_client_documentation"),
  ]);

  // 3. Company services + technicians
  let companyServicesData: { company_id: string; service_id: string }[] = [];
  let techData: { company_id: string; service_id: string; technician_id: string }[] = [];

  if (companyIds.length > 0) {
    const csRes = await supabase
      .from("company_services")
      .select("company_id, service_id")
      .in("company_id", companyIds)
      .eq("is_active", true);
    companyServicesData = csRes.data ?? [];

    const allServiceIds = [...new Set(companyServicesData.map((cs) => cs.service_id))];
    const techRows = await fetchTechniciansByServiceIds(supabase, allServiceIds);
    const companyIdSet = new Set(companyIds);
    techData = techRows.filter((t) => companyIdSet.has(t.company_id));
  }

  // 4. Technician names
  const allTechIds = [...new Set(techData.map((t) => t.technician_id))];
  const techNameMap = new Map<string, string | null>();
  if (allTechIds.length > 0) {
    const { data: techProfiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", allTechIds);
    for (const p of techProfiles ?? []) techNameMap.set(p.id, p.full_name);
  }

  // 5. Dept members for chief depts (for technician assignment) — vía profile_roles
  // Miembros/Chiefs son elegibles como técnicos; Observadores NO.
  const deptMembersMap: { [deptId: string]: DeptMemberSlim[] } = {};
  if (userChiefDeptIds.length > 0) {
    const { data: memberRoles } = await supabase
      .from("profile_roles")
      .select("scope_id, profile_id, role:roles(name), profile:profiles(id, full_name)")
      .eq("scope_type", "department")
      .in("scope_id", userChiefDeptIds);

    const seen = new Set<string>(); // scope_id|profile_id
    for (const link of memberRoles ?? []) {
      const role = link.role as unknown as { name: string } | null;
      if (!role || (role.name !== "Miembro de departamento" && role.name !== "Chief")) continue;
      const p = link.profile as unknown as { id: string; full_name: string | null } | null;
      if (!p || !link.scope_id) continue;
      const key = `${link.scope_id}|${p.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!deptMembersMap[link.scope_id]) deptMembersMap[link.scope_id] = [];
      deptMembersMap[link.scope_id].push({ id: p.id, name: p.full_name });
    }
  }

  // 6. Services the chief can add to companies
  const chiefAvailableServices: {
    service_id: string;
    service_name: string;
    service_slug: string;
    department_id: string;
  }[] = [];
  if (userChiefDeptIds.length > 0) {
    for (const ds of deptSvcLinks ?? []) {
      if (!userChiefDeptIds.includes(ds.department_id)) continue;
      const svc = serviceMap.get(ds.service_id);
      if (svc)
        chiefAvailableServices.push({
          service_id: svc.id,
          service_name: svc.name,
          service_slug: svc.slug,
          department_id: ds.department_id,
        });
    }
  }

  // Companies donde el usuario actual está asignado:
  //  - como técnico de algún servicio, o
  //  - como supervisor de algún apartado de documentación.
  const myAssignedCompanyIds = new Set(
    techData.filter((t) => t.technician_id === user.id).map((t) => t.company_id)
  );
  const myDocSupervisorCompanyIds = await fetchSupervisorCompanyIds(
    createAdminClient(),
    user.id
  );
  for (const id of myDocSupervisorCompanyIds) myAssignedCompanyIds.add(id);

  const compSvcMap = new Map<string, ClienteService[]>();
  for (const cs of companyServicesData) {
    const svc = serviceMap.get(cs.service_id);
    if (!svc) continue;
    const deptId = serviceToDeptId.get(cs.service_id);
    if (!deptId) continue;

    const technicians = techData
      .filter((t) => t.company_id === cs.company_id && t.service_id === cs.service_id)
      .map((t) => ({ id: t.technician_id, name: techNameMap.get(t.technician_id) ?? null }));

    if (!compSvcMap.has(cs.company_id)) compSvcMap.set(cs.company_id, []);
    compSvcMap.get(cs.company_id)!.push({
      service_id: svc.id,
      service_name: svc.name,
      service_slug: svc.slug,
      department_id: deptId,
      department_name: deptMap.get(deptId) ?? "",
      technicians,
    });
  }

  // Documentation progress + depts del equipo responsable (vía supervisores)
  const docProgressMap = new Map<string, { validated: number; total: number; in_review: number }>();
  const teamDeptsMap = new Map<string, Set<string>>();

  // Depts via técnicos: cualquier company_service con técnico asignado mete
  // su dept en el equipo responsable de la company.
  for (const t of techData) {
    const deptId = serviceToDeptId.get(t.service_id);
    if (!deptId) continue;
    if (!teamDeptsMap.has(t.company_id)) teamDeptsMap.set(t.company_id, new Set());
    teamDeptsMap.get(t.company_id)!.add(deptId);
  }

  if (companyIds.length > 0) {
    const adminClient = createAdminClient();
    const { data: clientBlocks } = await adminClient
      .schema("documentation")
      .from("client_blocks")
      .select("id, company_id")
      .in("company_id", companyIds);

    const blockToCompany = new Map<string, string>();
    for (const cb of clientBlocks ?? []) {
      blockToCompany.set(cb.id as string, cb.company_id as string);
    }

    const blockIds = Array.from(blockToCompany.keys());
    if (blockIds.length > 0) {
      const { data: clientApartados } = await adminClient
        .schema("documentation")
        .from("client_apartados")
        .select("id, status, client_block_id, apartado_id")
        .in("client_block_id", blockIds);

      const clientApartadoToCompany = new Map<string, string>();
      const clientApartadoToCatalog = new Map<string, string>();
      for (const ca of clientApartados ?? []) {
        const companyId = blockToCompany.get(ca.client_block_id as string);
        if (!companyId) continue;
        const entry = docProgressMap.get(companyId) ?? { validated: 0, total: 0, in_review: 0 };
        entry.total += 1;
        if (ca.status === "validado") entry.validated += 1;
        if (ca.status === "enviado") entry.in_review += 1;
        docProgressMap.set(companyId, entry);
        clientApartadoToCompany.set(ca.id as string, companyId);
        clientApartadoToCatalog.set(ca.id as string, ca.apartado_id as string);
      }

      // Depts via supervisores: para cada client_apartado supervisado, traemos
      // los depts del apartado del catálogo y los añadimos al equipo del cliente.
      const clientApartadoIds = Array.from(clientApartadoToCompany.keys());
      if (clientApartadoIds.length > 0) {
        const { data: supRows } = await adminClient
          .schema("documentation")
          .from("apartado_supervisors_v")
          .select("client_apartado_id")
          .in("client_apartado_id", clientApartadoIds);

        const supervisedClientApartadoIds = new Set(
          (supRows ?? []).map((r) => r.client_apartado_id as string)
        );

        const catalogIdsToLookUp = new Set<string>();
        for (const caId of supervisedClientApartadoIds) {
          const cat = clientApartadoToCatalog.get(caId);
          if (cat) catalogIdsToLookUp.add(cat);
        }

        if (catalogIdsToLookUp.size > 0) {
          const { data: apartadoDepts } = await adminClient
            .schema("documentation")
            .from("apartado_departments")
            .select("apartado_id, department_id")
            .in("apartado_id", Array.from(catalogIdsToLookUp));

          const catalogToDepts = new Map<string, string[]>();
          for (const link of apartadoDepts ?? []) {
            const aid = link.apartado_id as string;
            const did = link.department_id as string;
            const list = catalogToDepts.get(aid) ?? [];
            if (!list.includes(did)) list.push(did);
            catalogToDepts.set(aid, list);
          }

          for (const caId of supervisedClientApartadoIds) {
            const companyId = clientApartadoToCompany.get(caId);
            const catalogId = clientApartadoToCatalog.get(caId);
            if (!companyId || !catalogId) continue;
            const depts = catalogToDepts.get(catalogId) ?? [];
            if (depts.length === 0) continue;
            if (!teamDeptsMap.has(companyId)) teamDeptsMap.set(companyId, new Set());
            const set = teamDeptsMap.get(companyId)!;
            for (const did of depts) set.add(did);
          }
        }
      }
    }
  }

  const clienteCompanies: ClienteCompany[] = companies.map((c) => ({
    id: c.id,
    legal_name: c.legal_name,
    company_name: c.company_name,
    nif: c.nif,
    services: compSvcMap.get(c.id) ?? [],
    responsible_team_dept_ids: Array.from(teamDeptsMap.get(c.id) ?? []),
    is_assigned: myAssignedCompanyIds.has(c.id),
    deleted_at: c.deleted_at as string | null,
    created_at: c.created_at as string,
    documentation_progress: docProgressMap.get(c.id) ?? null,
  }));

  return {
    companies: clienteCompanies,
    departments,
    userChiefDeptIds,
    deptMembers: deptMembersMap,
    chiefAvailableServices,
    canCreateCompany,
    canDeleteCompany,
    canManageClientAccounts,
    canManageBankAccounts,
    canRequestDocumentation,
  };
}

// ---------- Company detail (lazy, on panel open) ----------

export async function getCompanyDetail(companyId: string): Promise<CompanyDetailInfo> {
  const { supabase } = await requireAdmin();

  const [{ data: company }, { data: profileLinks }, { data: bankAccounts }] = await Promise.all([
    supabase
      .from("companies")
      .select("id, legal_name, company_name, nif, deleted_at, created_at")
      .eq("id", companyId)
      .single(),
    supabase
      .from("profile_companies")
      .select("profile:profiles(id, full_name, email)")
      .eq("company_id", companyId),
    supabase
      .from("company_bank_accounts")
      .select("*")
      .eq("company_id", companyId)
      .order("is_default", { ascending: false }),
  ]);

  if (!company) throw new Error("Empresa no encontrada");

  const profiles = (profileLinks ?? [])
    .map(
      (row) =>
        row.profile as unknown as {
          id: string;
          full_name: string | null;
          email: string;
        } | null
    )
    .filter((p): p is NonNullable<typeof p> => p !== null);

  return {
    ...company,
    profiles,
    bank_accounts: (bankAccounts ?? []) as CompanyBankAccount[],
  };
}

// ---------- Equipo responsable ----------

export async function getCompanyResponsibleTeamAction(
  companyId: string
): Promise<ResponsibleTeam> {
  await requireAdmin();
  return getCachedCompanyResponsibleTeam(companyId);
}

// ---------- Update company name ----------

export async function updateCompanyNameAdmin(
  companyId: string,
  name: string | null
): Promise<void> {
  const { supabase } = await requirePermission("edit_company_info");
  const { error } = await supabase
    .from("companies")
    .update({ company_name: name || null, updated_at: new Date().toISOString() })
    .eq("id", companyId);
  if (error) throw new Error("Error al actualizar el nombre comercial.");
}

// ---------- Bank accounts (admin) ----------

export async function addCompanyBankAccountAdmin(
  companyId: string,
  iban: string,
  label: string | null,
  bankName: string | null
): Promise<CompanyBankAccount> {
  const { supabase } = await requirePermission("manage_bank_accounts");

  const { count } = await supabase
    .from("company_bank_accounts")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);

  const { data, error } = await supabase
    .from("company_bank_accounts")
    .insert({
      company_id: companyId,
      iban: iban.replace(/\s/g, "").toUpperCase(),
      label,
      bank_name: bankName,
      is_default: (count ?? 0) === 0,
    })
    .select()
    .single();

  if (error) throw new Error("Error al añadir la cuenta bancaria.");
  return data;
}

export async function updateCompanyBankAccountAdmin(
  companyId: string,
  accountId: string,
  iban: string,
  label: string | null,
  bankName: string | null
): Promise<void> {
  const { supabase } = await requirePermission("manage_bank_accounts");
  const { error } = await supabase
    .from("company_bank_accounts")
    .update({
      iban: iban.replace(/\s/g, "").toUpperCase(),
      label,
      bank_name: bankName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", accountId)
    .eq("company_id", companyId);
  if (error) throw new Error("Error al actualizar la cuenta bancaria.");
}

export async function deleteCompanyBankAccountAdmin(
  companyId: string,
  accountId: string
): Promise<void> {
  const { supabase } = await requirePermission("manage_bank_accounts");
  const { error } = await supabase
    .from("company_bank_accounts")
    .delete()
    .eq("id", accountId)
    .eq("company_id", companyId);
  if (error) throw new Error("Error al eliminar la cuenta bancaria.");
}

// ---------- Add / remove service (chief only) ----------

export async function addServiceToCompany(
  companyId: string,
  serviceId: string
): Promise<void> {
  const { supabase } = await requireAdmin();
  const deptId = await resolveServiceDepartment(supabase, serviceId);
  await requirePermission("write_dept_service", { type: "department", id: deptId });

  const { error } = await supabase.from("company_services").upsert(
    { company_id: companyId, service_id: serviceId, is_active: true },
    { onConflict: "company_id,service_id" }
  );

  if (error) throw new Error("Error al añadir el servicio.");
  invalidateResponsibleTeam(companyId);
}

export async function removeServiceFromCompany(
  companyId: string,
  serviceId: string
): Promise<void> {
  const { supabase } = await requireAdmin();
  const deptId = await resolveServiceDepartment(supabase, serviceId);
  await requirePermission("write_dept_service", { type: "department", id: deptId });

  const { error } = await supabase
    .from("company_services")
    .update({ is_active: false })
    .eq("company_id", companyId)
    .eq("service_id", serviceId);

  if (error) throw new Error("Error al eliminar el servicio.");
  invalidateResponsibleTeam(companyId);

  // Si quitamos el servicio Dashboard, limpiamos también la configuración del Sheet.
  const { data: svc } = await supabase
    .from("services")
    .select("slug")
    .eq("id", serviceId)
    .maybeSingle();
  if (svc?.slug === "dashboard") {
    await supabase
      .schema("dashboard")
      .from("client_dashboards")
      .delete()
      .eq("company_id", companyId);
    updateTag(`dashboard:${companyId}`);
  }
}

// ---------- Assign / remove technician ----------

async function lookupCompanyServiceId(
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

async function lookupRoleId(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  name: string
): Promise<string> {
  const { data } = await supabase.from("roles").select("id").eq("name", name).maybeSingle();
  if (!data) throw new Error(`Rol '${name}' no encontrado`);
  return data.id as string;
}

export async function assignTechnicianAdmin(
  companyId: string,
  serviceId: string,
  technicianId: string
): Promise<void> {
  const { supabase } = await requireAdmin();
  const deptId = await resolveServiceDepartment(supabase, serviceId);
  await requirePermission("write_dept_service", { type: "department", id: deptId });

  // Asegurar Miembro del dept (idempotente)
  const miembroRoleId = await lookupRoleId(supabase, "Miembro de departamento");
  const { error: mErr } = await supabase.from("profile_roles").insert({
    profile_id: technicianId,
    role_id: miembroRoleId,
    scope_type: "department",
    scope_id: deptId,
  });
  if (mErr && mErr.code !== "23505") throw new Error("No se pudo añadir al departamento.");

  const csId = await lookupCompanyServiceId(supabase, companyId, serviceId);
  if (!csId) throw new Error("Servicio no contratado por esta empresa.");

  const tecnicoRoleId = await lookupRoleId(supabase, "Técnico");
  const { error: tErr } = await supabase.from("profile_roles").insert({
    profile_id: technicianId,
    role_id: tecnicoRoleId,
    scope_type: "company_service",
    scope_id: csId,
  });
  if (tErr && tErr.code !== "23505") throw new Error("Error al asignar el técnico.");
  invalidateResponsibleTeam(companyId);
}

export async function removeTechnicianAdmin(
  companyId: string,
  serviceId: string,
  technicianId: string
): Promise<void> {
  const { supabase } = await requireAdmin();
  const deptId = await resolveServiceDepartment(supabase, serviceId);
  await requirePermission("write_dept_service", { type: "department", id: deptId });

  const csId = await lookupCompanyServiceId(supabase, companyId, serviceId);
  if (!csId) return;

  const tecnicoRoleId = await lookupRoleId(supabase, "Técnico");
  const { error } = await supabase
    .from("profile_roles")
    .delete()
    .eq("profile_id", technicianId)
    .eq("role_id", tecnicoRoleId)
    .eq("scope_type", "company_service")
    .eq("scope_id", csId);
  if (error) throw new Error("Error al quitar el técnico.");
  invalidateResponsibleTeam(companyId);
}

export async function assignAllTechniciansAdmin(
  companyId: string,
  serviceId: string,
  deptId: string
): Promise<void> {
  const { supabase } = await requireAdmin();
  await requirePermission("write_dept_service", { type: "department", id: deptId });

  const csId = await lookupCompanyServiceId(supabase, companyId, serviceId);
  if (!csId) throw new Error("Servicio no contratado por esta empresa.");

  const tecnicoRoleId = await lookupRoleId(supabase, "Técnico");

  const [{ data: memberRoles }, { data: existingTec }] = await Promise.all([
    supabase
      .from("profile_roles")
      .select("profile_id, role:roles!inner(name)")
      .eq("scope_type", "department")
      .eq("scope_id", deptId),
    supabase
      .from("profile_roles")
      .select("profile_id")
      .eq("scope_type", "company_service")
      .eq("scope_id", csId)
      .eq("role_id", tecnicoRoleId),
  ]);

  const existingIds = new Set((existingTec ?? []).map((e) => e.profile_id as string));
  const memberIdsSet = new Set<string>();
  for (const row of memberRoles ?? []) {
    const role = row.role as unknown as { name: string } | null;
    if (!role || (role.name !== "Miembro de departamento" && role.name !== "Chief")) continue;
    memberIdsSet.add(row.profile_id as string);
  }
  const toInsert = [...memberIdsSet].filter((id) => !existingIds.has(id));
  if (toInsert.length === 0) return;

  const { error } = await supabase.from("profile_roles").upsert(
    toInsert.map((techId) => ({
      profile_id: techId,
      role_id: tecnicoRoleId,
      scope_type: "company_service" as const,
      scope_id: csId,
    })),
    { onConflict: "profile_id,role_id,scope_type,scope_id", ignoreDuplicates: true }
  );
  if (error && error.code !== "23505") throw new Error("Error al asignar técnicos.");
  invalidateResponsibleTeam(companyId);
}

// ---------- Crear empresa ----------

export interface CreateCompanyInput {
  legal_name: string;
  company_name: string;
  nif: string;
}

export async function createCompanyAdmin(input: CreateCompanyInput): Promise<ClienteCompany> {
  const { supabase } = await requireAdmin();
  await requirePermission("create_company");

  const legalName = input.legal_name.trim();
  const companyName = input.company_name.trim();
  const nif = input.nif.trim().toUpperCase();
  if (!legalName || !companyName || !nif) {
    throw new Error("Razón social, nombre comercial y NIF/CIF son obligatorios.");
  }

  const { data, error } = await supabase
    .from("companies")
    .insert({ legal_name: legalName, company_name: companyName, nif })
    .select("id, legal_name, company_name, nif, created_at")
    .single();

  if (error || !data) throw new Error("Error al crear la empresa.");

  return {
    id: data.id,
    legal_name: data.legal_name,
    company_name: data.company_name,
    nif: data.nif,
    services: [],
    responsible_team_dept_ids: [],
    is_assigned: false,
    deleted_at: null,
    created_at: data.created_at as string,
    documentation_progress: null,
  };
}

// ---------- Cuentas cliente asociadas ----------

export async function findClientProfileByEmail(email: string): Promise<ClientAccount | null> {
  await requirePermission("manage_client_accounts");
  const admin = createAdminClient();

  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return null;

  const { data } = await admin
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("email", cleanEmail)
    .eq("role", "client")
    .maybeSingle();

  if (!data) return null;
  return { id: data.id, full_name: data.full_name, email: data.email };
}

export async function createClientAccount(
  companyId: string,
  input: { email: string; full_name: string | null }
): Promise<ClientAccount> {
  const { supabase } = await requireAdmin();
  await requirePermission("manage_client_accounts");

  const email = input.email.trim().toLowerCase();
  const fullName = input.full_name?.trim() || null;
  if (!email) throw new Error("El email es obligatorio.");

  const admin = createAdminClient();

  // 1. Crear o reutilizar auth.users
  let authUserId: string | null = null;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { role: "client", full_name: fullName },
  });

  if (createErr) {
    const msg = createErr.message?.toLowerCase() ?? "";
    const alreadyExists =
      createErr.status === 422 ||
      createErr.code === "email_exists" ||
      msg.includes("already") ||
      msg.includes("registered");
    if (!alreadyExists) throw new Error("Error al crear la cuenta de autenticación.");

    // Buscar el id del usuario existente por email
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (!existing) throw new Error("El email ya está registrado pero no se pudo localizar.");
    authUserId = existing.id;
  } else {
    authUserId = created.user?.id ?? null;
  }

  if (!authUserId) throw new Error("No se pudo determinar el usuario creado.");

  // 2. Asegurar full_name en profiles (el trigger solo setea id/email/role)
  if (fullName) {
    await admin.from("profiles").update({ full_name: fullName }).eq("id", authUserId);
  }

  // 3. Vincular con la empresa (idempotente)
  const { error: linkErr } = await supabase
    .from("profile_companies")
    .upsert(
      { profile_id: authUserId, company_id: companyId },
      { onConflict: "profile_id,company_id", ignoreDuplicates: true }
    );
  if (linkErr) throw new Error("Error al vincular la cuenta con la empresa.");

  return { id: authUserId, full_name: fullName, email };
}

export async function updateClientAccount(
  profileId: string,
  input: { email?: string; full_name?: string | null }
): Promise<ClientAccount> {
  await requirePermission("manage_client_accounts");

  const admin = createAdminClient();
  const updates: { email?: string; full_name?: string | null } = {};

  if (input.full_name !== undefined) {
    updates.full_name = input.full_name?.trim() || null;
  }
  if (input.email !== undefined) {
    const newEmail = input.email.trim().toLowerCase();
    if (!newEmail) throw new Error("El email no puede estar vacío.");
    updates.email = newEmail;
  }

  if (updates.email) {
    const { error: authErr } = await admin.auth.admin.updateUserById(profileId, {
      email: updates.email,
      email_confirm: true,
    });
    if (authErr) throw new Error("Error al actualizar el email de la cuenta.");
  }

  const { data, error } = await admin
    .from("profiles")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", profileId)
    .select("id, full_name, email")
    .single();

  if (error || !data) throw new Error("Error al actualizar la cuenta.");
  return { id: data.id, full_name: data.full_name, email: data.email };
}

export async function unlinkClientFromCompany(
  companyId: string,
  profileId: string
): Promise<void> {
  const { supabase } = await requireAdmin();
  await requirePermission("manage_client_accounts");

  const { error } = await supabase
    .from("profile_companies")
    .delete()
    .eq("company_id", companyId)
    .eq("profile_id", profileId);

  if (error) throw new Error("Error al desvincular la cuenta.");
}

// ---------- Soft delete / restore de empresa ----------

export async function deleteCompanyAdmin(
  companyId: string,
  confirmNif: string
): Promise<void> {
  const { supabase } = await requireAdmin();
  await requirePermission("delete_company");

  // Verificación NIF: defensa en profundidad por si la UI fallara
  const { data: company, error: readErr } = await supabase
    .from("companies")
    .select("nif, deleted_at")
    .eq("id", companyId)
    .single();
  if (readErr || !company) throw new Error("Empresa no encontrada.");
  if (company.deleted_at) throw new Error("La empresa ya está eliminada.");
  if ((company.nif ?? "").trim().toUpperCase() !== confirmNif.trim().toUpperCase()) {
    throw new Error("El NIF de confirmación no coincide.");
  }

  const { error } = await supabase
    .from("companies")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", companyId);
  if (error) throw new Error("Error al eliminar la empresa.");
}

export async function restoreCompanyAdmin(companyId: string): Promise<void> {
  const { supabase } = await requireAdmin();
  await requirePermission("create_company");

  const { error } = await supabase
    .from("companies")
    .update({ deleted_at: null, updated_at: new Date().toISOString() })
    .eq("id", companyId);
  if (error) throw new Error("Error al restaurar la empresa.");
}

// ---------- Dashboard fiscal (Google Sheet config) ----------

export interface CompanyDashboardConfig {
  sheet_id: string;
  sheet_name: string | null;
  sheet_gid: number | null;
  updated_at: string;
  client_notified_at: string | null;
}

async function resolveDashboardServiceDeptId(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"]
): Promise<string> {
  const { data } = await supabase
    .from("services")
    .select("id, department_services!inner(department_id)")
    .eq("slug", "dashboard")
    .eq("department_services.is_active", true)
    .maybeSingle<{ id: string; department_services: { department_id: string }[] }>();
  const deptId = data?.department_services?.[0]?.department_id;
  if (!deptId) throw new Error("Servicio dashboard no vinculado a ningún departamento.");
  return deptId;
}

export async function getCompanyDashboardConfig(
  companyId: string
): Promise<CompanyDashboardConfig | null> {
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .schema("dashboard")
    .from("client_dashboards")
    .select("sheet_id, sheet_name, sheet_gid, updated_at, client_notified_at")
    .eq("company_id", companyId)
    .maybeSingle<CompanyDashboardConfig>();
  return data ?? null;
}

export interface SetDashboardSheetResult {
  ok: true;
  sheet_id: string;
}

export async function setDashboardSheet(
  companyId: string,
  sheetUrl: string
): Promise<SetDashboardSheetResult> {
  const { supabase, user } = await requireAdmin();
  const deptId = await resolveDashboardServiceDeptId(supabase);
  await requirePermission("write_dept_service", { type: "department", id: deptId });

  const parsed = parseSheetUrl(sheetUrl.trim());
  if (!parsed) {
    throw new Error("La URL no parece ser de un Google Sheet válido.");
  }

  // Validar acceso real (catch errores específicos del Sheet API).
  try {
    await getDashboardData(parsed.sheetId);
  } catch (err) {
    if (err instanceof DashboardSheetError) {
      throw new Error(err.message);
    }
    throw new Error(
      "No se pudo leer el Sheet. Revisa la URL y que tenga las pestañas crudas esperadas."
    );
  }

  const { error } = await supabase
    .schema("dashboard")
    .from("client_dashboards")
    .upsert(
      {
        company_id: companyId,
        sheet_id: parsed.sheetId,
        sheet_name: null,
        sheet_gid: parsed.gid,
        updated_by: user.id,
        created_by: user.id,
      },
      { onConflict: "company_id" }
    );
  if (error) throw new Error("No se pudo guardar la configuración del dashboard.");

  updateTag(`dashboard:${companyId}`);
  return { ok: true, sheet_id: parsed.sheetId };
}

export async function clearDashboardSheet(companyId: string): Promise<void> {
  const { supabase } = await requireAdmin();
  const deptId = await resolveDashboardServiceDeptId(supabase);
  await requirePermission("write_dept_service", { type: "department", id: deptId });

  const { error } = await supabase
    .schema("dashboard")
    .from("client_dashboards")
    .delete()
    .eq("company_id", companyId);
  if (error) throw new Error("No se pudo eliminar la configuración del dashboard.");

  updateTag(`dashboard:${companyId}`);
}

export interface NotifyClientDashboardReadyResult {
  ok: true;
  notified_at: string;
  recipients: number;
  email_sent: number;
  email_failed: number;
  email_error: string | null;
}

/**
 * Notifica al cliente que su dashboard está listo: email + notificación
 * in-app. Botón de único uso — falla si ya estaba notificado.
 */
export async function notifyClientDashboardReady(
  companyId: string
): Promise<NotifyClientDashboardReadyResult> {
  const { supabase, user } = await requireAdmin();
  const deptId = await resolveDashboardServiceDeptId(supabase);
  await requirePermission("write_dept_service", { type: "department", id: deptId });

  // El dashboard tiene que estar configurado y no notificado previamente.
  const { data: existing } = await supabase
    .schema("dashboard")
    .from("client_dashboards")
    .select("client_notified_at")
    .eq("company_id", companyId)
    .maybeSingle<{ client_notified_at: string | null }>();
  if (!existing) {
    throw new Error("No hay dashboard configurado para esta empresa.");
  }
  if (existing.client_notified_at) {
    throw new Error("Esta empresa ya fue notificada anteriormente.");
  }

  // Destinatarios: cuentas asociadas (clientes) de la empresa. profile_companies
  // solo contiene cuentas cliente por convención del producto.
  const admin = createAdminClient();
  const { data: pcRows } = await admin
    .from("profile_companies")
    .select("profile_id")
    .eq("company_id", companyId);
  const recipientIds = [
    ...new Set((pcRows ?? []).map((r) => r.profile_id as string)),
  ];

  if (recipientIds.length === 0) {
    throw new Error("La empresa no tiene cuentas cliente asociadas a las que notificar.");
  }

  // Email vía edge function (no bloqueante por fallos de Resend).
  let emailSent = 0;
  let emailFailed = 0;
  let emailError: string | null = null;
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret) {
    emailFailed = recipientIds.length;
    emailError = "WEBHOOK_SECRET no configurado en el servidor";
    console.error("[dashboard-ready] WEBHOOK_SECRET no configurado — omitiendo email");
  } else {
    try {
      const { data: invokeResult, error: invokeErr } = await admin.functions.invoke(
        "notify-client-dashboard-ready",
        {
          body: {
            company_id: companyId,
            sent_by_id: user.id,
            to_profile_ids: recipientIds,
          },
          headers: { "x-webhook-secret": webhookSecret },
        }
      );
      if (invokeErr) {
        emailFailed = recipientIds.length;
        emailError = `Invocación: ${invokeErr.message}`;
        console.error("[dashboard-ready] error invocando email:", invokeErr.message);
      } else if (invokeResult && typeof invokeResult === "object") {
        const r = invokeResult as { sent?: number; failed?: number; error?: string; reason?: string };
        emailSent = r.sent ?? 0;
        emailFailed = r.failed ?? 0;
        if (emailFailed > 0 || emailSent === 0) {
          emailError = r.error ?? r.reason ?? "Resend no devolvió detalle";
        }
      } else {
        emailFailed = recipientIds.length;
        emailError = "Respuesta inesperada del edge function";
      }
    } catch (err) {
      emailFailed = recipientIds.length;
      emailError = err instanceof Error ? err.message : "Error desconocido";
      console.error("[dashboard-ready] excepción invocando email:", err);
    }
  }

  // Notificación in-app (una fila por destinatario). Mismo patrón que en
  // otras notificaciones: si el cliente tiene varias empresas, /set-company
  // primero activa la empresa correcta antes de saltar al dashboard.
  const notifLink = `/set-company?companyId=${companyId}&next=${encodeURIComponent("/dashboard")}`;
  const notifRows = recipientIds.map((rid) => ({
    recipient_id: rid,
    title: "Tu dashboard fiscal está listo",
    message:
      "Hemos activado el dashboard de tu empresa. Ya puedes consultar ventas, compras y bancos desde el portal.",
    link: notifLink,
    company_id: companyId,
  }));
  const { error: notifErr } = await admin.from("notifications").insert(notifRows);
  if (notifErr) {
    console.error("[dashboard-ready] error insertando notificaciones:", notifErr.message);
  }

  // Marcar como notificado (sirve como lock — el botón ya no aparecerá).
  const notifiedAt = new Date().toISOString();
  const { error: updErr } = await supabase
    .schema("dashboard")
    .from("client_dashboards")
    .update({ client_notified_at: notifiedAt, notified_by: user.id })
    .eq("company_id", companyId);
  if (updErr) {
    throw new Error("No se pudo registrar la notificación. Revisa el log.");
  }

  updateTag(`dashboard:${companyId}`);

  return {
    ok: true,
    notified_at: notifiedAt,
    recipients: recipientIds.length,
    email_sent: emailSent,
    email_failed: emailFailed,
    email_error: emailError,
  };
}

/**
 * Genera la vista previa del email que se enviaría al notificar al cliente.
 * Usado por el popover de hover en el panel admin del dashboard.
 */
export async function getDashboardReadyEmailPreview(
  companyId: string
): Promise<{ subject: string; html: string }> {
  const { supabase } = await requireAdmin();
  const deptId = await resolveDashboardServiceDeptId(supabase);
  await requirePermission("write_dept_service", { type: "department", id: deptId });

  const { data: company } = await supabase
    .from("companies")
    .select("legal_name, company_name")
    .eq("id", companyId)
    .maybeSingle<{ legal_name: string | null; company_name: string | null }>();
  const companyName =
    company?.company_name ?? company?.legal_name ?? "tu empresa";

  const admin = createAdminClient();
  const { data: pcRows } = await admin
    .from("profile_companies")
    .select("profile_id")
    .eq("company_id", companyId);
  const recipientIds = [
    ...new Set((pcRows ?? []).map((r) => r.profile_id as string)),
  ];

  let recipientNames: string[] = [];
  if (recipientIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("email, full_name")
      .in("id", recipientIds);
    recipientNames = (profiles ?? [])
      .map((p) => firstName((p.full_name as string | null) ?? null, p.email as string))
      .filter(Boolean);
  }

  const portalUrl = `https://app.leanfinance.es/set-company?companyId=${companyId}&next=${encodeURIComponent(
    "/dashboard"
  )}`;

  return {
    subject: buildClientDashboardReadyPreviewSubject({ companyName }),
    html: buildClientDashboardReadyPreviewHtml({
      companyName,
      recipientNames,
      portalUrl,
    }),
  };
}

function firstName(fullName: string | null, email: string): string {
  const trimmed = (fullName ?? "").trim();
  if (trimmed) return trimmed.split(/\s+/)[0];
  const local = (email ?? "").split("@")[0] ?? "";
  if (!local) return "";
  return local.charAt(0).toUpperCase() + local.slice(1);
}
