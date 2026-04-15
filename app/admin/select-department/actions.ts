"use server";

import { createClient } from "@/lib/supabase/server";
import { setActiveDepartmentIdInCookies } from "@/lib/active-department";
import { getCachedUserDepartments } from "@/lib/cached-queries";
import { hasPermission } from "@/lib/require-permission";

export async function getMyDepartments() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  return getCachedUserDepartments(user.id);
}

export async function setActiveDepartment(departmentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const ok = await hasPermission("member_of_department", {
    type: "department",
    id: departmentId,
  });
  if (!ok) throw new Error("Sin acceso a este departamento");

  await setActiveDepartmentIdInCookies(departmentId);
}
