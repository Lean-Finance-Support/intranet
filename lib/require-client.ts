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

  let companyId: string | null = await getActiveCompanyId();

  if (!companyId) {
    // Fallback: si solo tiene una empresa, auto-seleccionarla
    const { data: companies } = await supabase
      .from("profile_companies")
      .select("company_id")
      .eq("profile_id", user.id);

    if (!companies || companies.length === 0) {
      throw new Error("Sin empresa asignada");
    }

    if (companies.length === 1) {
      companyId = companies[0].company_id as string;
      await setActiveCompanyIdInCookies(companyId);
    } else {
      throw new Error("Selecciona una empresa primero");
    }
  } else {
    // Verificar que el usuario tiene acceso a esta empresa
    const { data: access } = await supabase
      .from("profile_companies")
      .select("company_id")
      .eq("profile_id", user.id)
      .eq("company_id", companyId)
      .single();

    if (!access) throw new Error("Sin acceso a esta empresa");
  }

  return { supabase, user, companyId };
}
