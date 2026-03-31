"use server";

import { createClient } from "@/lib/supabase/server";
import { getActiveCompanyId, setActiveCompanyIdInCookies } from "@/lib/active-company";

export async function requireClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "client") {
    throw new Error("Sin permisos");
  }

  const cookieCompanyId: string | null = await getActiveCompanyId();

  const { data: companies } = await supabase
    .from("profile_companies")
    .select("company_id")
    .eq("profile_id", user.id);

  if (!companies || companies.length === 0) {
    throw new Error("Sin empresa asignada");
  }

  const validIds = companies.map((c) => c.company_id as string);

  let companyId: string | null = null;

  if (cookieCompanyId && validIds.includes(cookieCompanyId)) {
    companyId = cookieCompanyId;
  } else if (validIds.length === 1) {
    // Cookie inválida o ausente: auto-seleccionar la única empresa
    companyId = validIds[0];
    await setActiveCompanyIdInCookies(companyId);
  } else {
    throw new Error("Selecciona una empresa primero");
  }

  return { supabase, user, companyId };
}
