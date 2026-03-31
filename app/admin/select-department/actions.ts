"use server";

import { createClient } from "@/lib/supabase/server";
import { setActiveDepartmentIdInCookies } from "@/lib/active-department";

export async function getMyDepartments() {
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

  if (profile?.role === "superadmin") {
    const { data: allDepts } = await supabase
      .from("departments")
      .select("id, name, slug")
      .order("name");
    return (allDepts ?? []) as { id: string; name: string; slug: string }[];
  }

  const { data: profileDepts } = await supabase
    .from("profile_departments")
    .select("department:departments(id, name, slug)")
    .eq("profile_id", user.id);

  return (profileDepts ?? [])
    .map((row) => row.department as unknown as { id: string; name: string; slug: string } | null)
    .filter((d): d is NonNullable<typeof d> => d !== null);
}

export async function setActiveDepartment(departmentId: string) {
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

  // Superadmin puede acceder a cualquier departamento
  if (profile?.role !== "superadmin") {
    const { data: access } = await supabase
      .from("profile_departments")
      .select("department_id")
      .eq("profile_id", user.id)
      .eq("department_id", departmentId)
      .single();

    if (!access) throw new Error("Sin acceso a este departamento");
  }

  await setActiveDepartmentIdInCookies(departmentId);
}
