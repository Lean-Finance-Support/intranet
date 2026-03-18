"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export async function selectDepartment(departmentId: string) {
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

  if (!profile || profile.role !== "superadmin") {
    throw new Error("Sin permisos de superadmin");
  }

  // Verify the department exists
  const { data: dept } = await supabase
    .from("departments")
    .select("id")
    .eq("id", departmentId)
    .single();

  if (!dept) throw new Error("Departamento no encontrado");

  const cookieStore = await cookies();
  cookieStore.set("sa-department-id", departmentId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}
