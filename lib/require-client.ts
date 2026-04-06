"use server";

import { getAuthUser, getCachedProfile, getCachedUserCompanies } from "@/lib/cached-queries";
import { getActiveCompanyId, setActiveCompanyIdInCookies } from "@/lib/active-company";

export async function requireClient() {
  const { supabase, user } = await getAuthUser();
  if (!user) throw new Error("No autenticado");

  const profile = await getCachedProfile(user.id);

  if (!profile || profile.role !== "client") {
    throw new Error("Sin permisos");
  }

  const cookieCompanyId: string | null = await getActiveCompanyId();
  const companies = await getCachedUserCompanies(user.id);

  if (companies.length === 0) {
    throw new Error("Sin empresa asignada");
  }

  const validIds = companies.map((c) => c.id);

  let companyId: string | null = null;

  if (cookieCompanyId && validIds.includes(cookieCompanyId)) {
    companyId = cookieCompanyId;
  } else if (validIds.length === 1) {
    companyId = validIds[0];
    await setActiveCompanyIdInCookies(companyId);
  } else {
    throw new Error("Selecciona una empresa primero");
  }

  return { supabase, user, companyId };
}
