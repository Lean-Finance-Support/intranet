"use server";

import { createClient } from "@/lib/supabase/server";
import { setActiveCompanyIdInCookies } from "@/lib/active-company";

export interface CompanyOption {
  id: string;
  legal_name: string;
  company_name: string | null;
}

export async function getMyCompanies(): Promise<CompanyOption[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("profile_companies")
    .select("company:companies(id, legal_name, company_name)")
    .eq("profile_id", user.id);

  if (!data) return [];

  return data
    .map((row) => {
      const c = row.company as unknown as CompanyOption | null;
      return c ? { id: c.id, legal_name: c.legal_name, company_name: c.company_name } : null;
    })
    .filter((c): c is CompanyOption => c !== null);
}

export async function setActiveCompany(companyId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  // Verificar que el usuario tiene acceso a esta empresa
  const { data: access } = await supabase
    .from("profile_companies")
    .select("company_id")
    .eq("profile_id", user.id)
    .eq("company_id", companyId)
    .single();

  if (!access) throw new Error("Sin acceso a esta empresa");

  await setActiveCompanyIdInCookies(companyId);

  return { ok: true };
}
