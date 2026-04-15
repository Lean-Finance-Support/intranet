"use server";

import { requireAdmin } from "@/lib/require-admin";
import { requirePermission, userScopeIds } from "@/lib/require-permission";
import type { CompanyBankAccount } from "@/lib/types/bank-accounts";

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
  is_assigned: boolean;
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
  chiefAvailableServices: { service_id: string; service_name: string; department_id: string }[];
}

export interface CompanyDetailInfo {
  id: string;
  legal_name: string;
  company_name: string | null;
  nif: string | null;
  phone: string | null;
  address: string | null;
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
        .select("id, legal_name, company_name, nif")
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

  // 2. User's chief depts (departments donde puede asignar técnicos)
  const userChiefDeptIds = await userScopeIds("assign_technician", "department");

  // 3. Company services + technicians
  let companyServicesData: { company_id: string; service_id: string }[] = [];
  let techData: { company_id: string; service_id: string; technician_id: string }[] = [];

  if (companyIds.length > 0) {
    const [csRes, techRes] = await Promise.all([
      supabase
        .from("company_services")
        .select("company_id, service_id")
        .in("company_id", companyIds)
        .eq("is_active", true),
      supabase
        .from("company_technicians")
        .select("company_id, service_id, technician_id")
        .in("company_id", companyIds),
    ]);
    companyServicesData = csRes.data ?? [];
    techData = techRes.data ?? [];
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

  // 5. Dept members for chief depts (for technician assignment)
  const deptMembersMap: { [deptId: string]: DeptMemberSlim[] } = {};
  if (userChiefDeptIds.length > 0) {
    const { data: memberLinks } = await supabase
      .from("profile_departments")
      .select("department_id, profile:profiles(id, full_name, role)")
      .in("department_id", userChiefDeptIds);

    for (const link of memberLinks ?? []) {
      const p = link.profile as unknown as {
        id: string;
        full_name: string | null;
      } | null;
      if (!p) continue;
      if (!deptMembersMap[link.department_id]) deptMembersMap[link.department_id] = [];
      deptMembersMap[link.department_id].push({ id: p.id, name: p.full_name });
    }
  }

  // 6. Services the chief can add to companies
  const chiefAvailableServices: {
    service_id: string;
    service_name: string;
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
          department_id: ds.department_id,
        });
    }
  }

  // Build company → services map
  const myAssignedCompanyIds = new Set(
    techData.filter((t) => t.technician_id === user.id).map((t) => t.company_id)
  );

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

  const clienteCompanies: ClienteCompany[] = companies.map((c) => ({
    id: c.id,
    legal_name: c.legal_name,
    company_name: c.company_name,
    nif: c.nif,
    services: compSvcMap.get(c.id) ?? [],
    is_assigned: myAssignedCompanyIds.has(c.id),
  }));

  return {
    companies: clienteCompanies,
    departments,
    userChiefDeptIds,
    deptMembers: deptMembersMap,
    chiefAvailableServices,
  };
}

// ---------- Company detail (lazy, on panel open) ----------

export async function getCompanyDetail(companyId: string): Promise<CompanyDetailInfo> {
  const { supabase } = await requireAdmin();

  const [{ data: company }, { data: profileLinks }, { data: bankAccounts }] = await Promise.all([
    supabase
      .from("companies")
      .select("id, legal_name, company_name, nif, phone, address")
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

// ---------- Update company name ----------

export async function updateCompanyNameAdmin(
  companyId: string,
  name: string | null
): Promise<void> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("companies")
    .update({ company_name: name || null, updated_at: new Date().toISOString() })
    .eq("id", companyId);
  if (error) throw new Error("Error al actualizar el nombre comercial.");
}

// ---------- Update company contact ----------

export async function updateCompanyContactAdmin(
  companyId: string,
  phone: string | null,
  address: string | null
): Promise<void> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("companies")
    .update({ phone, address, updated_at: new Date().toISOString() })
    .eq("id", companyId);
  if (error) throw new Error("Error al actualizar los datos de contacto.");
}

// ---------- Bank accounts (admin) ----------

export async function addCompanyBankAccountAdmin(
  companyId: string,
  iban: string,
  label: string | null,
  bankName: string | null
): Promise<CompanyBankAccount> {
  const { supabase } = await requireAdmin();

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
  const { supabase } = await requireAdmin();
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
  const { supabase } = await requireAdmin();
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
  await requirePermission("add_company_service", { type: "department", id: deptId });

  const { error } = await supabase.from("company_services").upsert(
    { company_id: companyId, service_id: serviceId, is_active: true },
    { onConflict: "company_id,service_id" }
  );

  if (error) throw new Error("Error al añadir el servicio.");
}

export async function removeServiceFromCompany(
  companyId: string,
  serviceId: string
): Promise<void> {
  const { supabase } = await requireAdmin();
  const deptId = await resolveServiceDepartment(supabase, serviceId);
  await requirePermission("add_company_service", { type: "department", id: deptId });

  const { error } = await supabase
    .from("company_services")
    .update({ is_active: false })
    .eq("company_id", companyId)
    .eq("service_id", serviceId);

  if (error) throw new Error("Error al eliminar el servicio.");
}

// ---------- Assign / remove technician ----------

export async function assignTechnicianAdmin(
  companyId: string,
  serviceId: string,
  technicianId: string
): Promise<void> {
  const { supabase } = await requireAdmin();
  const deptId = await resolveServiceDepartment(supabase, serviceId);
  await requirePermission("assign_technician", { type: "department", id: deptId });
  const { error } = await supabase
    .from("company_technicians")
    .insert({ company_id: companyId, service_id: serviceId, technician_id: technicianId });
  if (error && error.code !== "23505") throw new Error("Error al asignar el técnico.");
}

export async function removeTechnicianAdmin(
  companyId: string,
  serviceId: string,
  technicianId: string
): Promise<void> {
  const { supabase } = await requireAdmin();
  const deptId = await resolveServiceDepartment(supabase, serviceId);
  await requirePermission("assign_technician", { type: "department", id: deptId });
  const { error } = await supabase
    .from("company_technicians")
    .delete()
    .eq("company_id", companyId)
    .eq("service_id", serviceId)
    .eq("technician_id", technicianId);
  if (error) throw new Error("Error al quitar el técnico.");
}

export async function assignAllTechniciansAdmin(
  companyId: string,
  serviceId: string,
  deptId: string
): Promise<void> {
  const { supabase } = await requireAdmin();
  await requirePermission("assign_technician", { type: "department", id: deptId });

  const [{ data: memberLinks }, { data: existing }] = await Promise.all([
    supabase.from("profile_departments").select("profile_id").eq("department_id", deptId),
    supabase
      .from("company_technicians")
      .select("technician_id")
      .eq("company_id", companyId)
      .eq("service_id", serviceId),
  ]);

  const existingIds = new Set((existing ?? []).map((e) => e.technician_id));
  const toInsert = (memberLinks ?? [])
    .map((m) => m.profile_id)
    .filter((id) => !existingIds.has(id));

  if (toInsert.length === 0) return;

  const { error } = await supabase
    .from("company_technicians")
    .insert(toInsert.map((techId) => ({ company_id: companyId, service_id: serviceId, technician_id: techId })));
  if (error && error.code !== "23505") throw new Error("Error al asignar técnicos.");
}
