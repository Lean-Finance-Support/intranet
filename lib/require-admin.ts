"use server";

import { getAuthUser, getCachedProfile } from "@/lib/cached-queries";

export async function requireAdmin() {
  const { supabase, user } = await getAuthUser();
  if (!user) throw new Error("No autenticado");

  const profile = await getCachedProfile(user.id);

  if (!profile || (profile.role !== "admin" && profile.role !== "superadmin")) {
    throw new Error("Sin permisos");
  }

  const isSuperadmin = profile.role === "superadmin";
  return { supabase, user, isSuperadmin };
}
