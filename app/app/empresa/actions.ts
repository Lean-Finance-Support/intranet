"use server";

import { requireClient } from "@/lib/require-client";
import { createAdminClient } from "@/lib/supabase/server";
import type { CompanyBankAccount } from "@/lib/types/bank-accounts";

export interface CompanyInfo {
  id: string;
  legal_name: string;
  company_name: string | null;
  nif: string | null;
  accounts: { id: string; full_name: string | null; email: string }[];
  bank_accounts: CompanyBankAccount[];
}

export interface ContractedServiceForClient {
  service_id: string;
  service_name: string;
  service_slug: string;
  service_description: string | null;
  department_names: string[];
  technicians: { profile_id: string; full_name: string | null; email: string }[];
}

export async function getCompanyInfo(): Promise<CompanyInfo> {
  const { supabase, companyId } = await requireClient();

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, legal_name, company_name, nif, deleted_at")
    .eq("id", companyId)
    .single();

  if (companyError || !company || company.deleted_at) throw new Error("Empresa no encontrada");

  // Obtener usuarios asociados a esta empresa via profile_companies
  const { data: profileLinks } = await supabase
    .from("profile_companies")
    .select("profile:profiles(id, full_name, email)")
    .eq("company_id", companyId);

  const profiles = (profileLinks ?? [])
    .map((row) => row.profile as unknown as { id: string; full_name: string | null; email: string } | null)
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const { data: bankAccounts } = await supabase
    .from("company_bank_accounts")
    .select("*")
    .eq("company_id", companyId)
    .order("is_default", { ascending: false });

  return {
    ...company,
    accounts: (profiles ?? []).map((p) => ({
      id: p.id,
      full_name: p.full_name,
      email: p.email,
    })),
    bank_accounts: (bankAccounts ?? []) as CompanyBankAccount[],
  };
}

export async function addCompanyBankAccount(
  iban: string,
  label: string | null,
  bankName: string | null
): Promise<CompanyBankAccount> {
  const { supabase, companyId } = await requireClient();

  const { count } = await supabase
    .from("company_bank_accounts")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);

  const isFirst = (count ?? 0) === 0;

  const { data, error } = await supabase
    .from("company_bank_accounts")
    .insert({
      company_id: companyId,
      iban: iban.replace(/\s/g, "").toUpperCase(),
      label,
      bank_name: bankName,
      is_default: isFirst,
    })
    .select()
    .single();

  if (error) {
    console.error("[app/empresa] DB error:", error.code);
    throw new Error("Error al procesar la solicitud.");
  }
  return data;
}

export async function updateCompanyBankAccount(
  accountId: string,
  iban: string,
  label: string | null,
  bankName: string | null
): Promise<void> {
  const { supabase, companyId } = await requireClient();

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

  if (error) {
    console.error("[app/empresa] DB error:", error.code);
    throw new Error("Error al procesar la solicitud.");
  }
}

export async function deleteCompanyBankAccount(
  accountId: string
): Promise<void> {
  const { supabase, companyId } = await requireClient();

  const { error } = await supabase
    .from("company_bank_accounts")
    .delete()
    .eq("id", accountId)
    .eq("company_id", companyId);

  if (error) {
    console.error("[app/empresa] DB error:", error.code);
    throw new Error("Error al procesar la solicitud.");
  }
}

/**
 * Servicios contratados por la empresa activa, con técnico(s) asignado(s) y
 * dpts a los que pertenece. Lectura desde el portal cliente. Para servicios
 * transversales (sin dpto), `department_names` queda vacío y `technicians`
 * también.
 */
export async function getCompanyContractedServices(): Promise<ContractedServiceForClient[]> {
  const { companyId } = await requireClient();
  const admin = createAdminClient();

  // 1. Servicios activos contratados por la company.
  const { data: csRows } = await admin
    .from("company_services")
    .select("id, service_id")
    .eq("company_id", companyId)
    .eq("is_active", true);

  const csList = csRows ?? [];
  if (csList.length === 0) return [];

  const csIds = csList.map((cs) => cs.id as string);
  const serviceIds = [...new Set(csList.map((cs) => cs.service_id as string))];

  // 2. Meta de los servicios + dpts vinculados activos. Los servicios
  // archivados también se incluyen: la empresa los tiene contratados y debe
  // verlos hasta que se le quiten manualmente.
  const [{ data: services }, { data: deptLinks }] = await Promise.all([
    admin
      .from("services")
      .select("id, name, slug, description, display_order")
      .in("id", serviceIds),
    admin
      .from("department_services")
      .select("service_id, department_id")
      .in("service_id", serviceIds)
      .eq("is_active", true),
  ]);

  const deptIdsByService = new Map<string, string[]>();
  const allDeptIds = new Set<string>();
  for (const l of deptLinks ?? []) {
    const sid = l.service_id as string;
    const did = l.department_id as string;
    const list = deptIdsByService.get(sid) ?? [];
    list.push(did);
    deptIdsByService.set(sid, list);
    allDeptIds.add(did);
  }
  const { data: depts } = allDeptIds.size
    ? await admin
        .from("departments")
        .select("id, name")
        .in("id", [...allDeptIds])
    : { data: [] as { id: string; name: string }[] };
  const deptNameById = new Map<string, string>();
  for (const d of depts ?? []) deptNameById.set(d.id as string, d.name as string);

  // 3. Técnicos por company_service.
  const { data: tecnicoRole } = await admin
    .from("roles")
    .select("id")
    .eq("name", "Técnico")
    .maybeSingle();
  const tecnicoRoleId = tecnicoRole?.id as string | undefined;

  const technicianIdsByCs = new Map<string, string[]>();
  const allTechProfileIds = new Set<string>();
  if (tecnicoRoleId) {
    const { data: techRoles } = await admin
      .from("profile_roles")
      .select("profile_id, scope_id")
      .eq("role_id", tecnicoRoleId)
      .eq("scope_type", "company_service")
      .in("scope_id", csIds);
    for (const r of techRoles ?? []) {
      const csId = r.scope_id as string;
      const pid = r.profile_id as string;
      const list = technicianIdsByCs.get(csId) ?? [];
      if (!list.includes(pid)) list.push(pid);
      technicianIdsByCs.set(csId, list);
      allTechProfileIds.add(pid);
    }
  }

  const profileById = new Map<string, { full_name: string | null; email: string }>();
  if (allTechProfileIds.size > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", [...allTechProfileIds]);
    for (const p of profiles ?? []) {
      profileById.set(p.id as string, {
        full_name: (p.full_name as string | null) ?? null,
        email: p.email as string,
      });
    }
  }

  const serviceMetaById = new Map<
    string,
    { name: string; slug: string; description: string | null; display_order: number }
  >();
  for (const s of services ?? []) {
    serviceMetaById.set(s.id as string, {
      name: s.name as string,
      slug: s.slug as string,
      description: (s.description as string | null) ?? null,
      display_order: s.display_order as number,
    });
  }

  // 4. Construir resultado por servicio (deduplicado: si una empresa tiene el
  //    servicio varias veces — no debería, pero por si acaso — agrupar técnicos).
  const result: ContractedServiceForClient[] = [];
  const indexBySvc = new Map<string, number>();
  for (const cs of csList) {
    const sid = cs.service_id as string;
    const meta = serviceMetaById.get(sid);
    if (!meta) continue; // servicio inactivo en catálogo

    const dids = deptIdsByService.get(sid) ?? [];
    const techIds = technicianIdsByCs.get(cs.id as string) ?? [];
    const techs = techIds
      .map((tid) => {
        const p = profileById.get(tid);
        return p
          ? { profile_id: tid, full_name: p.full_name, email: p.email }
          : null;
      })
      .filter((x): x is { profile_id: string; full_name: string | null; email: string } => x !== null);

    const existingIdx = indexBySvc.get(sid);
    if (existingIdx !== undefined) {
      // merge técnicos (dedup por profile_id)
      const existing = result[existingIdx];
      const seen = new Set(existing.technicians.map((t) => t.profile_id));
      for (const t of techs) if (!seen.has(t.profile_id)) existing.technicians.push(t);
      continue;
    }

    indexBySvc.set(sid, result.length);
    result.push({
      service_id: sid,
      service_name: meta.name,
      service_slug: meta.slug,
      service_description: meta.description,
      department_names: dids
        .map((d) => deptNameById.get(d) ?? "")
        .filter((n) => n.length > 0),
      technicians: techs,
    });
  }

  // Ordenar por display_order, luego nombre.
  result.sort((a, b) => {
    const ma = serviceMetaById.get(a.service_id);
    const mb = serviceMetaById.get(b.service_id);
    const oa = ma?.display_order ?? 100;
    const ob = mb?.display_order ?? 100;
    if (oa !== ob) return oa - ob;
    return a.service_name.localeCompare(b.service_name, "es");
  });

  return result;
}
