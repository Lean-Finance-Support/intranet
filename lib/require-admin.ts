"use server";

import { getAuthUser, getCachedProfile } from "@/lib/cached-queries";

export async function requireAdmin() {
  const { supabase, user } = await getAuthUser();
  if (!user) throw new Error("No autenticado");

  const profile = await getCachedProfile(user.id);

  if (!profile || profile.role !== "admin") {
    throw new Error("Sin permisos");
  }

  return { supabase, user };
}
